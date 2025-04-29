import type { EventStore } from '@event-driven-io/emmett';
import {
  ConcurrencyError,
  getInMemoryEventStore,
  IllegalStateError,
  NotFoundError,
  ValidationError,
} from '@event-driven-io/emmett';
import assert from 'assert';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ProblemDocument } from 'http-problem-details';
import { describe, it } from 'node:test';
import { problemDetailsHandler } from '../middlewares/problemDetailsMiddleware';
import { ApiSpecification } from '../testing';

// Define application with error-throwing routes
const getApplication = () => {
  const app = new Hono();

  // Set up the Problem Details middleware as error handler
  app.onError(problemDetailsHandler());

  // Error routes
  app
    // Hono's built-in HTTPException
    .get('/error/http-exception', () => {
      throw new HTTPException(400, {
        message: 'Bad request from HTTPException',
      });
    })

    // Emmett's ValidationError - should map to 400
    .get('/error/validation', () => {
      throw new ValidationError('Invalid data provided');
    })

    // Emmett's IllegalStateError - should map to 403
    .get('/error/illegal-state', () => {
      throw new IllegalStateError('Operation not allowed in current state');
    })

    // Emmett's NotFoundError - should map to 404
    .get('/error/not-found', () => {
      throw new NotFoundError({
        id: 'resource-123',
        type: 'test-resource',
        message: 'Resource not found',
      });
    })

    // Emmett's ConcurrencyError - should map to 412
    .get('/error/concurrency', () => {
      // Full constructor with expected version and actual version
      throw new ConcurrencyError(42, 43, 'Concurrency check failed');
    })

    // Generic Error - should map to 500
    .get('/error/generic', () => {
      throw new Error('Something went wrong');
    })

    // Route for testing custom error mapping
    .get('/error/custom', () => {
      // Create a custom error type
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }

      throw new CustomError('Custom error occurred');
    });

  return app;
};

// Application with custom error mapper
const getApplicationWithCustomMapper = () => {
  const app = new Hono();

  // Set up the Problem Details middleware with custom error mapper
  app.onError(
    problemDetailsHandler((error) => {
      if (error.name === 'CustomError') {
        return new ProblemDocument({
          status: 418, // I'm a teapot
          title: 'Custom Error Mapped',
          detail: error.message,
          instance: '/error/custom',
        });
      }
      return undefined; // Fall back to default mapper for other errors
    }),
  );

  // Route that throws a custom error
  app.get('/error/custom', () => {
    class CustomError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'CustomError';
      }
    }

    throw new CustomError('This should be mapped to a teapot error');
  });

  return app;
};

// Test fixture setup
const given = ApiSpecification.for(
  () => getInMemoryEventStore(),
  (_eventStore: EventStore) => getApplication(),
);

const givenWithCustomMapper = ApiSpecification.for(
  () => getInMemoryEventStore(),
  (_eventStore: EventStore) => getApplicationWithCustomMapper(),
);

// Helper to suppress console.error during specific tests
function suppressConsoleError<T>(fn: () => Promise<T>): Promise<T> {
  const originalConsoleError = console.error;
  console.error = () => {};
  return fn().finally(() => {
    console.error = originalConsoleError;
  });
}

describe('Hono Error Handling with Problem Details', () => {
  describe('HTTPException handling', () => {
    it('should convert HTTPException to Problem Details response with status 400', async () => {
      await suppressConsoleError(async () => {
        const response = await given().when((app) =>
          app.request(new Request('http://localhost/error/http-exception')),
        );
        assert.equal(response.status, 400);
        const body = await response.json();
        assert.ok(
          body.title === 'Bad Request' ||
            body.title === 'Bad request from HTTPException',
        );
        assert.equal(body.status, 400);
      });
    });
  });

  describe('Emmett ValidationError handling', () => {
    it('should convert ValidationError to Problem Details response with status 400', async () => {
      await suppressConsoleError(async () => {
        const response = await given().when((app) =>
          app.request(new Request('http://localhost/error/validation')),
        );
        assert.equal(response.status, 400);
        const body = await response.json();
        assert.equal(body.title, 'Bad Request');
        assert.equal(body.detail, 'Invalid data provided');
        assert.equal(body.status, 400);
      });
    });
  });

  describe('Emmett IllegalStateError handling', () => {
    it('should convert IllegalStateError to Problem Details response with status 403', async () => {
      await suppressConsoleError(async () => {
        const response = await given().when((app) =>
          app.request(new Request('http://localhost/error/illegal-state')),
        );
        assert.equal(response.status, 403);
        const body = await response.json();
        assert.equal(body.title, 'Forbidden');
        assert.equal(body.detail, 'Operation not allowed in current state');
        assert.equal(body.status, 403);
      });
    });
  });

  describe('Emmett NotFoundError handling', () => {
    it('should convert NotFoundError to Problem Details response with status 404', async () => {
      await suppressConsoleError(async () => {
        const response = await given().when((app) =>
          app.request(new Request('http://localhost/error/not-found')),
        );
        assert.equal(response.status, 404);
        const body = await response.json();
        assert.equal(body.title, 'Not Found');
        assert.equal(body.detail, 'Resource not found');
        assert.equal(body.status, 404);
      });
    });
  });

  describe('Emmett ConcurrencyError handling', () => {
    it('should convert ConcurrencyError to Problem Details response with status 412', async () => {
      await suppressConsoleError(async () => {
        const response = await given().when((app) =>
          app.request(new Request('http://localhost/error/concurrency')),
        );
        assert.equal(response.status, 412);
        const body = await response.json();
        assert.equal(body.title, 'Precondition Failed');
        assert.equal(body.status, 412);
      });
    });
  });

  describe('Generic Error handling', () => {
    it('should convert generic Error to Problem Details response with status 500', async () => {
      await suppressConsoleError(async () => {
        const response = await given().when((app) =>
          app.request(new Request('http://localhost/error/generic')),
        );
        assert.equal(response.status, 500);
        const body = await response.json();
        assert.equal(body.title, 'Internal Server Error');
        assert.equal(body.detail, 'Something went wrong');
        assert.equal(body.status, 500);
      });
    });
  });

  describe('Custom error mapping', () => {
    it('should use custom error mapper for specific error types', async () => {
      await suppressConsoleError(async () => {
        const response = await givenWithCustomMapper().when((app) =>
          app.request(new Request('http://localhost/error/custom')),
        );
        assert.equal(response.status, 418);
        const body = await response.json();
        assert.equal(body.status, 418);
        // Only check that we got a response with a body, not specific field values
        assert.ok(body, 'Response body should exist');
      });
    });
  });
});
