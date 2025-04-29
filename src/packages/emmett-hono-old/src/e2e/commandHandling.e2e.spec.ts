import {
  CommandHandler,
  ConcurrencyError,
  getInMemoryEventStore,
  IllegalStateError,
  type Event as EmmettEvent,
} from '@event-driven-io/emmett';
import type { Hono } from 'hono';
import assert from 'node:assert';
import { describe, it } from 'node:test';
import { getApplication } from '../application';
import { getETagFromIfMatch, toWeakETag } from '../etag';

// A simple counter domain model for testing
interface CounterEvent extends EmmettEvent {
  type: string;
  data: {
    streamId: string;
    [key: string]: any;
  };
}

// Counter Created Event
interface CounterCreated extends CounterEvent {
  type: 'CounterCreated';
  data: {
    streamId: string;
    initialValue: number;
  };
}

// Counter Incremented Event
interface CounterIncremented extends CounterEvent {
  type: 'CounterIncremented';
  data: {
    streamId: string;
    increment: number;
  };
}

// Valid counter events
type CounterEvents = CounterCreated | CounterIncremented;

// Counter state
interface Counter {
  id: string;
  value: number;
}

// Create Counter command
interface CreateCounter {
  type: 'CreateCounter';
  id: string;
  initialValue?: number;
}

// Increment Counter command
interface IncrementCounter {
  type: 'IncrementCounter';
  id: string;
  increment?: number;
}

// Valid commands
type CounterCommands = CreateCounter | IncrementCounter;

// Event Sourced Reducer - evolves state based on events
const evolve = (state: Counter | null, event: CounterEvents): Counter => {
  if (state === null) {
    if (event.type === 'CounterCreated') {
      return {
        id: event.data.streamId,
        value: event.data.initialValue,
      };
    }
    throw new Error('Cannot apply event to null state');
  }

  if (event.type === 'CounterIncremented') {
    return {
      ...state,
      value: state.value + event.data.increment,
    };
  }

  return state;
};

// Command handlers
const handleCreateCounter = (command: CreateCounter): CounterCreated => {
  const { id, initialValue = 0 } = command;

  return {
    type: 'CounterCreated',
    data: {
      streamId: id,
      initialValue,
    },
  };
};

const handleIncrementCounter = (
  command: IncrementCounter,
  state: Counter | null,
): CounterIncremented => {
  const { id, increment = 1 } = command;

  if (state === null) {
    throw new IllegalStateError('Counter does not exist');
  }

  // For testing concurrency error scenario
  if (increment < 0) {
    throw new ConcurrencyError(
      'Negative increments trigger concurrency error for testing',
      'Test_Stream',
      'Test_Expected_Version',
    );
  }

  return {
    type: 'CounterIncremented',
    data: {
      streamId: id,
      increment,
    },
  };
};

// Command handler composition
const decide = (command: CounterCommands, state: Counter | null) => {
  switch (command.type) {
    case 'CreateCounter':
      return handleCreateCounter(command);
    case 'IncrementCounter':
      return handleIncrementCounter(command, state);
    default:
      throw new Error(`Unknown command type: ${(command as any).type}`);
  }
};

// Utility to create a command handler
const createCommandHandler = () => {
  const eventStore = getInMemoryEventStore();
  const commandHandlerFn = CommandHandler({
    evolve,
    initialState: () => null,
  });

  return {
    eventStore,
    commandHandler: {
      handle: async (command: CounterCommands, options?: any) => {
        const id = command.id;
        const decider = (state: Counter | null) => decide(command, state);
        const result = await commandHandlerFn(eventStore, id, decider, options);

        // Convert newEvents to events for test compatibility
        return {
          ...result,
          events: result.newEvents,
        };
      },
    },
  };
};

describe('Command Handling Integration', () => {
  it('should successfully execute command and append events to event store', async () => {
    // Arrange
    const { eventStore, commandHandler } = createCommandHandler();

    // Create a web API setup function that defines routes using the command handler
    const apiSetup = (app: Hono) => {
      // POST /counters - Create a new counter
      app.post('/counters', async (c) => {
        try {
          const body = await c.req.json();
          const command: CreateCounter = {
            type: 'CreateCounter',
            id: body.id || 'counter-1',
            initialValue: body.initialValue,
          };

          // Execute the command
          const result = await commandHandler.handle(command);

          const event = result.events[0] as CounterCreated;
          const initialValue = event.data.initialValue;

          // Return a response with ETag
          return c.json(
            {
              id: command.id,
              value: initialValue,
              _links: {
                self: `/counters/${command.id}`,
              },
            },
            200,
            {
              ETag: toWeakETag(result.nextExpectedStreamVersion),
            },
          );
        } catch (error) {
          console.error('Error in POST /counters:', error);
          return c.json({ error: String(error) }, 500);
        }
      });

      // PUT /counters/:id - Increment counter (with optimistic concurrency)
      app.put('/counters/:id', async (c) => {
        try {
          const { id } = c.req.param();
          if (!id) {
            return c.json({ error: 'Missing id parameter' }, 400);
          }

          const body = await c.req.json();

          // Get expected version from If-Match header
          let expectedVersion: bigint | undefined;
          try {
            const etag = getETagFromIfMatch(c.req);
            // Get the actual number from weak ETag
            expectedVersion = BigInt(etag.replace(/W\/"(\d+)"/, '$1'));
          } catch (error) {
            // If If-Match header is missing, we'll use undefined (no expected version)
          }

          const command: IncrementCounter = {
            type: 'IncrementCounter',
            id,
            increment: body.increment,
          };

          // Execute the command with expected version
          const result = await commandHandler.handle(command, {
            expectedStreamVersion: expectedVersion,
          });

          // Get updated counter state
          const events = await eventStore.readStream(id);
          let currentState: Counter | null = null;

          // Rebuild state from events
          for (const event of events.events) {
            currentState = evolve(
              currentState,
              event as unknown as CounterEvents,
            );
          }

          // Return a response with ETag
          return c.json(
            {
              id,
              value: currentState!.value,
              _links: {
                self: `/counters/${id}`,
              },
            },
            200,
            {
              ETag: toWeakETag(result.nextExpectedStreamVersion),
            },
          );
        } catch (error) {
          console.error('Error in PUT /counters/:id', error);

          if (error instanceof ConcurrencyError) {
            return c.json(
              {
                title: 'Precondition Failed',
                detail: error.message,
                status: 412,
              },
              412,
            );
          }

          if (error instanceof IllegalStateError) {
            return c.json(
              {
                title: 'Forbidden',
                detail: error.message,
                status: 403,
              },
              403,
            );
          }

          return c.json({ error: String(error) }, 500);
        }
      });
    };

    // Create Hono app with the API setup
    const app = getApplication({
      apis: [apiSetup],
    });

    // Act - Create a counter
    const createResponse = await app.fetch(
      new Request('http://localhost/counters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: 'counter-123',
          initialValue: 5,
        }),
      }),
    );

    // Assert - Check response and ETag
    assert.strictEqual(createResponse.status, 200);
    const etag = createResponse.headers.get('ETag');
    assert.ok(etag, 'ETag header should be present');
    assert.ok(etag?.startsWith('W/"'), 'ETag should be weak');

    // Check response body
    const createResponseData = (await createResponse.json()) as any;
    assert.strictEqual(createResponseData.id, 'counter-123');
    assert.strictEqual(createResponseData.value, 5);

    // Check that event was appended to event store
    const events = await eventStore.readStream('counter-123');
    assert.strictEqual(events.events.length, 1);
    assert.strictEqual(
      (events.events[0] as unknown as CounterEvents).type,
      'CounterCreated',
    );
    assert.strictEqual(
      (events.events[0] as unknown as CounterCreated).data.initialValue,
      5,
    );
  });

  it('should respect optimistic concurrency with If-Match header', async () => {
    // Arrange - Same setup as above
    const { eventStore, commandHandler } = createCommandHandler();

    const apiSetup = (app: Hono) => {
      // POST and PUT endpoints
      app.post('/counters', async (c) => {
        try {
          const body = await c.req.json();
          const command: CreateCounter = {
            type: 'CreateCounter',
            id: body.id || 'counter-1',
            initialValue: body.initialValue || 0,
          };

          const result = await commandHandler.handle(command);

          const event = result.events[0] as CounterCreated;
          const initialValue = event.data.initialValue;

          return c.json(
            {
              id: command.id,
              value: initialValue,
            },
            200,
            {
              ETag: toWeakETag(result.nextExpectedStreamVersion),
            },
          );
        } catch (error) {
          console.error('Error in optimistic concurrency test POST:', error);
          return c.json({ error: String(error) }, 500);
        }
      });

      app.put('/counters/:id', async (c) => {
        try {
          const { id } = c.req.param();
          if (!id) {
            return c.json({ error: 'Missing id parameter' }, 400);
          }

          const body = await c.req.json();

          // Get expected version from If-Match header
          let expectedVersion: bigint | undefined;
          try {
            const etag = getETagFromIfMatch(c.req);
            // Get the actual number from weak ETag
            expectedVersion = BigInt(etag.replace(/W\/"(\d+)"/, '$1'));
          } catch (error) {
            // No expected version
          }

          const command: IncrementCounter = {
            type: 'IncrementCounter',
            id,
            increment: body.increment || 1,
          };

          const result = await commandHandler.handle(command, {
            expectedStreamVersion: expectedVersion,
          });

          // Get updated counter state
          const events = await eventStore.readStream(id);
          let currentState: Counter | null = null;

          // Rebuild state from events
          for (const event of events.events) {
            currentState = evolve(
              currentState,
              event as unknown as CounterEvents,
            );
          }

          return c.json(
            {
              id,
              value: currentState!.value,
            },
            200,
            {
              ETag: toWeakETag(result.nextExpectedStreamVersion),
            },
          );
        } catch (error) {
          console.error('Error in optimistic concurrency test PUT:', error);

          if (error instanceof ConcurrencyError) {
            return c.json(
              {
                title: 'Precondition Failed',
                detail: error.message,
                status: 412,
              },
              412,
            );
          }

          if (error instanceof IllegalStateError) {
            return c.json(
              {
                title: 'Forbidden',
                detail: error.message,
                status: 403,
              },
              403,
            );
          }

          return c.json({ error: String(error) }, 500);
        }
      });
    };

    const app = getApplication({
      apis: [apiSetup],
    });

    // Act - Create a counter
    const createResponse = await app.fetch(
      new Request('http://localhost/counters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: 'counter-456',
          initialValue: 10,
        }),
      }),
    );

    // Get ETag from create response for optimistic concurrency
    const etagAfterCreate = createResponse.headers.get('ETag');
    assert.ok(etagAfterCreate, 'ETag should be present after create');

    // Act - Increment counter with the correct ETag
    const incrementResponse = await app.fetch(
      new Request('http://localhost/counters/counter-456', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': etagAfterCreate,
        },
        body: JSON.stringify({
          increment: 5,
        }),
      }),
    );

    // Assert - Increment succeeded
    assert.strictEqual(incrementResponse.status, 200);
    const incrementResponseData = (await incrementResponse.json()) as any;
    assert.strictEqual(incrementResponseData.value, 15); // 10 + 5

    // Get new ETag after increment
    const etagAfterIncrement = incrementResponse.headers.get('ETag');
    assert.ok(etagAfterIncrement, 'ETag should be present after increment');
    assert.notStrictEqual(
      etagAfterIncrement,
      etagAfterCreate,
      'ETag should have changed',
    );

    // Check events in event store
    const events = await eventStore.readStream('counter-456');
    assert.strictEqual(events.events.length, 2);
    assert.strictEqual(
      (events.events[0] as unknown as CounterEvents).type,
      'CounterCreated',
    );
    assert.strictEqual(
      (events.events[1] as unknown as CounterEvents).type,
      'CounterIncremented',
    );
    assert.strictEqual(
      (events.events[1] as unknown as CounterIncremented).data.increment,
      5,
    );
  });

  it('should handle concurrency failures correctly', async () => {
    // Temporarily silence console.error for this specific test
    const originalConsoleError = console.error;
    console.error = () => {}; // eslint-disable-line @typescript-eslint/no-empty-function

    try {
      // Arrange
      const { eventStore, commandHandler } = createCommandHandler();

      const apiSetup = (app: Hono) => {
        // POST endpoint to create counter
        app.post('/counters', async (c) => {
          try {
            const body = await c.req.json();
            const command: CreateCounter = {
              type: 'CreateCounter',
              id: body.id || 'counter-1',
              initialValue: body.initialValue || 0,
            };

            const result = await commandHandler.handle(command);

            const event = result.events[0] as CounterCreated;
            const initialValue = event.data.initialValue;

            return c.json(
              {
                id: command.id,
                value: initialValue,
              },
              200,
              {
                ETag: toWeakETag(result.nextExpectedStreamVersion),
              },
            );
          } catch (error) {
            // console.error('Error in concurrency failures test POST:', error);
            return c.json({ error: String(error) }, 500);
          }
        });

        // PUT endpoint to increment counter
        app.put('/counters/:id', async (c) => {
          try {
            const { id } = c.req.param();
            if (!id) {
              return c.json({ error: 'Missing id parameter' }, 400);
            }

            const body = await c.req.json();

            // Get expected version from If-Match header
            let expectedVersion: bigint | undefined;
            try {
              const etag = getETagFromIfMatch(c.req);
              // Get the actual number from weak ETag
              expectedVersion = BigInt(etag.replace(/W\/"(\d+)"/, '$1'));
            } catch (error) {
              // No expected version
            }

            // Use a wrong expected version for testing concurrency failures
            if (body.wrongVersion === true) {
              // Deliberately use a wrong version to trigger concurrency error
              expectedVersion = expectedVersion ? expectedVersion + 10n : 999n;
            }

            const command: IncrementCounter = {
              type: 'IncrementCounter',
              id,
              increment: body.increment || 1,
            };

            const result = await commandHandler.handle(command, {
              expectedStreamVersion: expectedVersion,
            });

            // Get updated counter state
            const events = await eventStore.readStream(id);
            let currentState: Counter | null = null;

            // Rebuild state from events
            for (const event of events.events) {
              currentState = evolve(
                currentState,
                event as unknown as CounterEvents,
              );
            }

            return c.json(
              {
                id,
                value: currentState!.value,
              },
              200,
              {
                ETag: toWeakETag(result.nextExpectedStreamVersion),
              },
            );
          } catch (error) {
            // console.error('Error in concurrency failures test PUT:', error);

            if (error instanceof ConcurrencyError) {
              return c.json(
                {
                  title: 'Precondition Failed',
                  detail: error.message,
                  status: 412,
                },
                412,
              );
            }

            if (error instanceof IllegalStateError) {
              return c.json(
                {
                  title: 'Forbidden',
                  detail: error.message,
                  status: 403,
                },
                403,
              );
            }

            return c.json({ error: String(error) }, 500);
          }
        });
      };

      const app = getApplication({
        apis: [apiSetup],
        // Add error handler / problem details middleware
      });

      // Act - Create a counter
      const createResponse = await app.fetch(
        new Request('http://localhost/counters', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: 'counter-789',
            initialValue: 10,
          }),
        }),
      );

      // Get ETag from create response
      const etagAfterCreate = createResponse.headers.get('ETag');
      assert.ok(etagAfterCreate, 'ETag should be present after create');

      // Act - Try to increment counter with wrong ETag (trigger concurrency error)
      const incrementResponse = await app.fetch(
        new Request('http://localhost/counters/counter-789', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'If-Match': etagAfterCreate,
          },
          body: JSON.stringify({
            increment: 5,
            wrongVersion: true, // Signal to use wrong version
          }),
        }),
      );

      // Assert - Should return a concurrency error (412 Precondition Failed)
      assert.strictEqual(incrementResponse.status, 412);
      const errorResponseData = (await incrementResponse.json()) as any;

      // Should have problem details format
      assert.ok(errorResponseData.title, 'Error response should have a title');
      assert.ok(
        errorResponseData.status,
        'Error response should have a status',
      );
      assert.strictEqual(errorResponseData.status, 412);
    } finally {
      // Restore original console.error
      console.error = originalConsoleError;
    }
  });

  it('should handle business logic errors correctly', async () => {
    // Temporarily silence console.error for this specific test
    const originalConsoleError = console.error;
    console.error = () => {}; // eslint-disable-line @typescript-eslint/no-empty-function

    try {
      // Arrange
      const { eventStore, commandHandler } = createCommandHandler();

      const apiSetup = (app: Hono) => {
        // PUT endpoint to increment counter that doesn't exist (triggers business logic error)
        app.put('/counters/:id', async (c) => {
          try {
            const { id } = c.req.param();
            if (!id) {
              return c.json({ error: 'Missing id parameter' }, 400);
            }

            const body = await c.req.json();

            const command: IncrementCounter = {
              type: 'IncrementCounter',
              id,
              increment: body.increment || 1,
            };

            // This will throw IllegalStateError for non-existent counter
            const result = await commandHandler.handle(command);

            // This code won't be reached due to the error
            return c.json({ success: true }, 200);
          } catch (error) {
            // console.error('Error in business logic errors test:', error);

            if (error instanceof ConcurrencyError) {
              return c.json(
                {
                  title: 'Precondition Failed',
                  detail: error.message,
                  status: 412,
                },
                412,
              );
            }

            if (error instanceof IllegalStateError) {
              return c.json(
                {
                  title: 'Forbidden',
                  detail: error.message,
                  status: 403,
                },
                403,
              );
            }

            return c.json({ error: String(error) }, 500);
          }
        });
      };

      const app = getApplication({
        apis: [apiSetup],
      });

      // Act - Try to increment a counter that doesn't exist
      const response = await app.fetch(
        new Request('http://localhost/counters/non-existent-counter', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            increment: 5,
          }),
        }),
      );

      // Assert - Should return a 403 Forbidden (IllegalStateError)
      assert.strictEqual(response.status, 403);
      const errorResponseData = (await response.json()) as any;

      // Should have problem details format
      assert.ok(errorResponseData.title, 'Error response should have a title');
      assert.ok(
        errorResponseData.status,
        'Error response should have a status',
      );
      assert.strictEqual(errorResponseData.status, 403);
    } finally {
      // Restore original console.error
      console.error = originalConsoleError;
    }
  });
});
