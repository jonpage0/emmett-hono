import type { Context } from 'hono';
import type { Handler } from 'hono';
import type { StatusCode } from 'hono/utils/http-status';
import {
  send,
  sendCreated,
  sendAccepted,
  sendNoContent,
  sendProblem,
} from './responses';
import type {
  HttpResponseOptions,
  CreatedHttpResponseOptions,
  AcceptedHttpResponseOptions,
  NoContentHttpResponseOptions,
  HttpProblemResponseOptions,
} from './responses';

/** The return type for an Emmett-Hono handler function: a Response or a Promise of Response. */
export type EmmettHonoResponse = Response | Promise<Response>;

/** Signature of a handler function using Emmett-Hono utilities, receiving a Hono Context. */
export type EmmettHonoHandler = (c: Context) => EmmettHonoResponse;

/**
 * Wraps an EmmettHonoHandler to be used as a Hono route handler.
 * In practice, this just returns the handler itself since the signatures are compatible.
 * (This function exists for API symmetry with other Emmett adapters, and future extensibility.)
 * @param handle - The EmmettHonoHandler function to wrap.
 * @returns A Hono-compatible handler function.
 */
export function on(handle: EmmettHonoHandler): Handler {
  return (c: Context) => handle(c);
}

// Response helper generators:

/** Returns a handler that sends a 200 OK response with optional body, headers, etc. */
export function OK(options?: HttpResponseOptions): EmmettHonoHandler {
  return (c: Context) => send(c, 200, options);
}

/** Returns a handler that sends a 201 Created response. */
export function Created(
  options: CreatedHttpResponseOptions,
): EmmettHonoHandler {
  return (c: Context) => sendCreated(c, options);
}

/** Returns a handler that sends a 202 Accepted response. */
export function Accepted(
  options: AcceptedHttpResponseOptions,
): EmmettHonoHandler {
  return (c: Context) => sendAccepted(c, options);
}

/** Returns a handler that sends a 204 No Content response. */
export function NoContent(
  options?: NoContentHttpResponseOptions,
): EmmettHonoHandler {
  return (c: Context) => sendNoContent(c, options);
}

/** Returns a handler that sends a generic HTTP response with the given status code. */
export function HttpResponse(
  statusCode: number,
  options?: HttpResponseOptions,
): EmmettHonoHandler {
  return (c: Context) => send(c, statusCode as StatusCode, options);
}

// Error/Problem response helpers:

/** Returns a handler that sends a 400 Bad Request (Problem Details) response. */
export function BadRequest(
  options?: HttpProblemResponseOptions,
): EmmettHonoHandler {
  return HttpProblem(400, options);
}

/** Returns a handler that sends a 403 Forbidden (Problem Details) response. */
export function Forbidden(
  options?: HttpProblemResponseOptions,
): EmmettHonoHandler {
  return HttpProblem(403, options);
}

/** Returns a handler that sends a 404 Not Found (Problem Details) response. */
export function NotFound(
  options?: HttpProblemResponseOptions,
): EmmettHonoHandler {
  return HttpProblem(404, options);
}

/** Returns a handler that sends a 409 Conflict (Problem Details) response. */
export function Conflict(
  options?: HttpProblemResponseOptions,
): EmmettHonoHandler {
  return HttpProblem(409, options);
}

/** Returns a handler that sends a 412 Precondition Failed (Problem Details) response. */
export function PreconditionFailed(
  options: HttpProblemResponseOptions,
): EmmettHonoHandler {
  return HttpProblem(412, options);
}

/**
 * Returns a handler that sends a Problem Details response with an arbitrary status code.
 * @param statusCode - HTTP status for the problem.
 * @param options - Problem details configuration.
 */
export function HttpProblem(
  statusCode: number,
  options?: HttpProblemResponseOptions,
): EmmettHonoHandler {
  return (c: Context) => sendProblem(c, statusCode as StatusCode, options);
}
```

## packages/emmett-hono/src/application.ts

```ts
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ApplicationOptions } from './types';
import { applyCors } from './middlewares/cors';
import { applyETag } from './middlewares/etag';
import { applyLogger } from './middlewares/logger';
import { problemDetailsHandler } from './middlewares/problemDetails';
import type { Response } from 'express';

/**
 * Creates and configures a Hono application instance based on provided options.
 * @param options - Configuration options for the application.
 * @returns A configured Hono instance ready to handle requests.
 */
export function getApplication(options: ApplicationOptions): Hono {
  const app = new Hono();

  const {
    apis,
    enableCors = false,
    corsOptions,
    enableETag = false,
    etagOptions,
    enableLogger = false,
    loggerOptions,
    mapError,
    disableProblemDetails = false,
  } = options;

  // Apply logger middleware first (to capture timing for all subsequent handlers)
  if (enableLogger) {
    applyLogger(app, loggerOptions);
  }
  // Apply CORS middleware if enabled
  if (enableCors) {
    applyCors(app, corsOptions);
  }
  // Apply ETag middleware if enabled
  if (enableETag) {
    applyETag(app, etagOptions);
  }

  // Register all API routes
  for (const api of apis) {
    api(app);
  }

  // Global error handler: convert errors to Problem Details responses if not disabled
  if (!disableProblemDetails) {
    app.onError(problemDetailsHandler(mapError));
  }

  return app;
}