// Hono API Specification for E2E Testing (modeled after emmett-expressjs)
// Uses hono/testing's testClient for request simulation

import {
  WrapEventStore,
  assertEqual,
  assertFails,
  assertMatches,
  type Event,
  type EventStore,
  type TestEventStream,
} from '@event-driven-io/emmett';
import type { Hono } from 'hono';
import { testClient } from 'hono/testing';
import type { ProblemDocument } from 'http-problem-details';

//////////////////////////////
/// Setup
//////////////////////////////

export type TestRequest = (app: Hono) => Promise<Response>;

export const existingStream = <EventType extends Event = Event>(
  streamId: string,
  events: EventType[],
): TestEventStream<EventType> => {
  return [streamId, events];
};

//////////////////////////////
/// Asserts
//////////////////////////////

export type ResponseAssert = (response: Response) => boolean | void;

export type ApiSpecificationAssert<EventType extends Event = Event> =
  | TestEventStream<EventType>[]
  | ResponseAssert
  | [ResponseAssert, ...TestEventStream<EventType>[]];

export const expect = <EventType extends Event = Event>(
  streamId: string,
  events: EventType[],
): TestEventStream<EventType> => {
  return [streamId, events];
};

export const expectNewEvents = <EventType extends Event = Event>(
  streamId: string,
  events: EventType[],
): TestEventStream<EventType> => {
  return [streamId, events];
};

export const expectResponse =
  <Body = unknown>(
    statusCode: number,
    options?: { body?: Body; headers?: { [index: string]: string } },
  ) =>
  async (response: Response): Promise<void> => {
    const { body, headers } = options ?? {};
    assertEqual(statusCode, response.status, "Response code doesn't match");
    if (body) {
      const json = await response
        .clone()
        .json()
        .catch(() => undefined);
      assertMatches(json, body);
    }
    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        assertEqual(response.headers.get(key), value, `Header ${key} mismatch`);
      }
    }
  };

export const expectError = (
  errorCode: number,
  problemDetails?: Partial<ProblemDocument>,
) =>
  expectResponse(
    errorCode,
    problemDetails ? { body: problemDetails } : undefined,
  );

//////////////////////////////
/// Api Specification
//////////////////////////////

export type ApiSpecification<EventType extends Event = Event> = (
  ...givenStreams: TestEventStream<EventType>[]
) => {
  when: (setupRequest: TestRequest) => {
    then: (verify: ApiSpecificationAssert<EventType>) => Promise<void>;
  };
};

export const ApiSpecification = {
  for: <EventType extends Event = Event, Store extends EventStore = EventStore>(
    getEventStore: () => Store,
    getApplication: (eventStore: Store) => Hono,
  ): ApiSpecification<EventType> => {
    return (...givenStreams: TestEventStream<EventType>[]) => {
      const eventStore = WrapEventStore(getEventStore());
      const app = getApplication(eventStore);
      const client = testClient(app);

      return {
        when: (setupRequest: TestRequest) => {
          const handle = async () => {
            for (const [streamName, events] of givenStreams as [
              string,
              EventType[],
            ][]) {
              await eventStore.setup(streamName, events);
            }
            return setupRequest(app);
          };

          return {
            then: async (
              verify: ApiSpecificationAssert<EventType>,
            ): Promise<void> => {
              const response = await handle();

              if (typeof verify === 'function') {
                const succeeded = await verify(response);
                if (succeeded === false) assertFails();
              } else if (Array.isArray(verify)) {
                const [first, ...rest] = verify;

                if (typeof first === 'function') {
                  const succeeded = await first(response);
                  if (succeeded === false) assertFails();
                }

                const events = typeof first === 'function' ? rest : verify;

                assertMatches(
                  Array.from(eventStore.appendedEvents.values()),
                  events,
                );
              }
            },
          };
        },
      };
    };
  },
};
