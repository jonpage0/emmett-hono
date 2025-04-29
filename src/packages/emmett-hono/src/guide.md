Can you update this:

---

Great. I’ll prepare a fully rewritten Emmett + Hono app within a Cloudflare Workers environment. This will use the latest versions of Hono, Zod v4, and related modern tooling. I’ll structure the code in a clean monorepo layout under `src/packages`, include comprehensive tests, and add OpenAPI client generation using Hono Stacks conventions where applicable.

I’ll let you know as soon as the new implementation is ready to review.

# Emmett-Hono Monorepo Implementation

Below is the fully rewritten **Emmett-Hono** package and an example project structure demonstrating its usage with Hono (latest stable) and Zod v4 on Cloudflare Workers. The code is organized as a monorepo under `src/packages`. Each package is written in modern TypeScript with clear structure, test examples, and support for OpenAPI schema generation and client code (using Hono Stacks).

## packages/emmett-hono/src/types.ts

```ts
import type { Context } from 'hono';
import type { StatusCode } from 'hono/utils/http-status';

/**
 * Options for configuring the Emmett-Hono application.
 */
export interface ApplicationOptions {
  /** Array of functions to register API routes on the Hono app. */
  apis: Array<(app: import('hono').Hono) => void>;
  /** Enable built-in CORS middleware (defaults to false). */
  enableCors?: boolean;
  /** Options for CORS middleware (uses Hono's CORS). */
  corsOptions?: import('hono/cors').CorsOptions;
  /** Enable ETag middleware for response caching (defaults to false). */
  enableETag?: boolean;
  /** Options for ETag generation (e.g., weak or strong). */
  etagOptions?: { weak?: boolean };
  /** Enable request logging middleware (defaults to false). */
  enableLogger?: boolean;
  /** Options for logger middleware (e.g., custom logger function). */
  loggerOptions?: LoggerOptions;
  /**
   * Optional error-to-ProblemDetails mapping function.
   * If provided, errors will be converted to RFC 7807 Problem responses via this mapping.
   */
  mapError?: ErrorToProblemDetailsMapping;
  /** Disable the default Problem Details error handler (if true, errors propagate normally). */
  disableProblemDetails?: boolean;
}

/**
 * Defines a Problem Details document (RFC 7807).
 */
export class ProblemDocument {
  type: string;
  title: string;
  detail: string;
  status: number;
  instance?: string;
  [key: string]: unknown; // allow extra fields if needed

  constructor(params: {
    status: number;
    detail: string;
    title?: string;
    type?: string;
    instance?: string;
  }) {
    this.status = params.status;
    this.detail = params.detail;
    this.type = params.type ?? 'about:blank';
    // If title is not provided, use a generic title based on status code
    this.title = params.title ?? defaultTitleForStatus(params.status);
    if (params.instance) this.instance = params.instance;
  }
}

/** Provides a default human-readable title for common HTTP status codes. */
function defaultTitleForStatus(status: number): string {
  if (status === 400) return 'Bad Request';
  if (status === 403) return 'Forbidden';
  if (status === 404) return 'Not Found';
  if (status === 409) return 'Conflict';
  if (status === 412) return 'Precondition Failed';
  if (status === 500) return 'Internal Server Error';
  return 'Error';
}

/**
 * Mapping function type: map an Error to a ProblemDocument.
 * Return undefined to indicate the error is not specifically handled (and default mapping should apply).
 */
export type ErrorToProblemDetailsMapping = (
  error: unknown,
  c: Context,
) => ProblemDocument | undefined;

/** Default error mapping: converts any error to an HTTP 500 ProblemDocument with its message. */
export const defaultErrorMapper: ErrorToProblemDetailsMapping = (
  error: unknown,
) => {
  const message = error instanceof Error ? error.message : String(error);
  // Default to internal server error for unspecified errors
  return new ProblemDocument({
    status: 500,
    detail: message || 'Internal Server Error',
    title: 'Internal Server Error',
    type: 'about:blank',
  });
};

/**
 * Describes a valid ETag string (quoted string, possibly with W/ prefix for weak).
 */
export type ETag = string;

/**
 * Options for logging middleware.
 */
export interface LoggerOptions {
  /** Function to log the message (defaults to console.log). */
  logger?: (str: string) => void;
  /**
   * How to handle timing:
   * - 'all': log all requests and their durations.
   * - 'none': do not log requests.
   * (You could extend this to 'error-only' etc. as needed.)
   */
  timing?: 'all' | 'none';
  /**
   * Function to format log info into a string. Receives an object with method, url, status, time.
   */
  format?: (info: LogInfo) => string;
}

/** Information passed to the logger format function. */
export interface LogInfo {
  method: string;
  url: string;
  status: number;
  time: number; // in milliseconds
}
```

## packages/emmett-hono/src/middlewares/cors.ts

```ts
import type { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { CorsOptions } from 'hono/cors';

/**
 * Applies Cross-Origin Resource Sharing (CORS) middleware to a Hono app.
 * @param app - Hono application instance.
 * @param options - Optional CORS configuration (merged with defaults).
 */
export function applyCors(app: Hono, options?: CorsOptions): void {
  app.use('*', cors(options));
}
```

## packages/emmett-hono/src/middlewares/etag.ts

```ts
import type { Hono } from 'hono';
import type { Context, Next } from 'hono';
import type { ETag } from '../types';

/**
 * Generates an ETag for a given response body string.
 * Uses a simple hash algorithm. Weak ETag (W/) is used by default.
 * @param content - Response body content as string.
 * @param weak - Whether to generate a weak ETag (prefix with W/).
 */
function generateETag(content: string, weak: boolean = true): ETag {
  // Simple non-cryptographic hash (32-bit) for ETag generation:
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = (Math.imul(31, hash) + content.charCodeAt(i)) | 0; // similar to Java's String.hashCode
  }
  const hex = (hash >>> 0).toString(16);
  return (weak ? 'W/"' : '"') + hex + '"';
}

/**
 * Applies ETag middleware to automatically add ETag headers for GET/HEAD responses.
 * @param app - Hono application instance.
 * @param options - ETag configuration (e.g., { weak: true } for weak ETags).
 */
export function applyETag(app: Hono, options?: { weak?: boolean }): void {
  const weak = options?.weak ?? true;
  app.use('*', async (c: Context, next: Next) => {
    await next();
    // Only process successful GET or HEAD requests (excluding 204/304 or if ETag already set)
    const method = c.req.method;
    const status = c.res.status;
    if (
      (method === 'GET' || method === 'HEAD') &&
      status >= 200 &&
      status < 300 &&
      status !== 204 &&
      status !== 304
    ) {
      if (!c.res.headers.get('ETag')) {
        try {
          // Clone the response to safely read the body
          const bodyText = await c.res.clone().text();
          if (bodyText && bodyText.length > 0) {
            const etagValue = generateETag(bodyText, weak);
            c.res.headers.set('ETag', etagValue);
          }
        } catch {
          // If body cannot be read or is empty, skip ETag generation
        }
      }
    }
  });
}
```

## packages/emmett-hono/src/middlewares/logger.ts

```ts
import type { Hono, Context, Next } from 'hono';
import type { LoggerOptions, LogInfo } from '../types';

/** Default configuration for logger middleware. */
const defaultLoggerOptions: LoggerOptions = {
  logger: (str: string) => console.log(str),
  timing: 'all',
  format: (info: LogInfo) =>
    `${info.method} ${info.url} -> ${info.status} [${info.time}ms]`,
};

/**
 * Applies a simple request logger middleware to a Hono app.
 * Logs request method, URL, status, and response time.
 * @param app - Hono application instance.
 * @param options - Logger configuration options.
 */
export function applyLogger(app: Hono, options?: LoggerOptions): void {
  const opts = { ...defaultLoggerOptions, ...options };
  app.use('*', async (c: Context, next: Next) => {
    const { method, url } = c.req;
    const start = Date.now();
    try {
      await next();
      if (opts.timing !== 'none') {
        const time = Date.now() - start;
        const status = c.res.status;
        const info: LogInfo = { method, url: url.toString(), status, time };
        const message = opts.format
          ? opts.format(info)
          : `${method} ${url} ${status} (${time}ms)`;
        opts.logger && opts.logger(message);
      }
    } catch (err) {
      // Log even on error, then rethrow to be handled by onError if present
      if (opts.timing !== 'none') {
        const time = Date.now() - start;
        const info: LogInfo = {
          method,
          url: url.toString(),
          status: 500,
          time,
        };
        const message = opts.format
          ? opts.format(info)
          : `${method} ${url} 500 (${time}ms)`;
        opts.logger && opts.logger(message);
      }
      throw err;
    }
  });
}
```

## packages/emmett-hono/src/middlewares/problemDetails.ts

```ts
import type { Context } from 'hono';
import type { ErrorHandler } from 'hono';
import { sendProblem } from '../responses';
import {
  ProblemDocument,
  defaultErrorMapper,
  ErrorToProblemDetailsMapping,
} from '../types';

/**
 * Creates an error handler for Hono that converts errors to RFC 7807 Problem Details responses.
 * @param mapError - Mapping function from an error to a ProblemDocument (defaults to defaultErrorMapper).
 * @returns A Hono ErrorHandler function to be used with app.onError().
 */
export function problemDetailsHandler(
  mapError: ErrorToProblemDetailsMapping = defaultErrorMapper,
): ErrorHandler {
  return (err: unknown, c: Context) => {
    // Use mapping function to get a ProblemDocument. Fallback to default mapper if none returned.
    const problemDoc: ProblemDocument =
      mapError(err, c) ?? defaultErrorMapper(err, c);
    const status = problemDoc.status || 500;
    // Send the ProblemDocument as a JSON response with appropriate content-type.
    return sendProblem(c, status as number, { problem: problemDoc });
  };
}
```

## packages/emmett-hono/src/responses.ts

```ts
import type { Context } from 'hono';
import type { StatusCode } from 'hono/utils/http-status';
import { ProblemDocument } from './types';

/**
 * General options for HTTP responses.
 */
export type HttpResponseOptions = {
  /** Response body. If an object is provided, it will be JSON-stringified. */
  body?: unknown;
  /** Location header (for redirects or newly created resources). */
  location?: string;
  /** ETag header value to include. */
  eTag?: string;
};

/** Options for 201 Created responses. Must include either a new resource ID or a direct URL. */
export type CreatedHttpResponseOptions = (
  | { createdId: string; url?: string }
  | { url: string }
) &
  HttpResponseOptions;

/** Options for 202 Accepted responses. Must include a location where the resource will be available. */
export type AcceptedHttpResponseOptions = {
  location: string;
} & HttpResponseOptions;

/** Options for 204 No Content responses (no body allowed). */
export type NoContentHttpResponseOptions = Omit<HttpResponseOptions, 'body'>;

/** Options for Problem Details responses. You can provide a full ProblemDocument or just details. */
export type HttpProblemResponseOptions = {
  /** If you already have a ProblemDocument instance, provide it here. */
  problem?: ProblemDocument;
  /** If not providing a full ProblemDocument, a detail message for the problem. */
  problemDetails?: string;
  /** Optional Location header for the problem response (rarely used). */
  location?: string;
  /** Optional ETag header for the problem response. */
  eTag?: string;
};

/**
 * Low-level send function to construct a Response with given status and options.
 * This function handles different body types (Response, object, string, null) and sets headers like ETag/Location.
 */
export function send(
  c: Context,
  statusCode: StatusCode,
  options?: HttpResponseOptions,
): Response {
  const { body, location, eTag } = options ?? {};
  const headers: Record<string, string> = {};
  if (location) headers['Location'] = location;
  if (eTag) headers['ETag'] = eTag;

  // If body is provided, determine how to send it
  if (body !== undefined && body !== null) {
    if (body instanceof Response) {
      // If body is already a Response object, merge status and headers
      const respHeaders = new Headers(body.headers);
      Object.entries(headers).forEach(([key, value]) =>
        respHeaders.set(key, value),
      );
      // Use original body and new status/headers
      return new Response(body.body, {
        status: statusCode,
        headers: respHeaders,
      });
    }
    if (typeof body === 'object') {
      // For object bodies, return JSON response (if status code allows a body)
      if (statusCode !== 204 && statusCode !== 304) {
        return c.json(body, statusCode, headers);
      } else {
        // If no content allowed but object provided, stringify anyway (unusual case)
        return new Response(JSON.stringify(body), {
          status: statusCode,
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
      }
    }
    // For string or other primitive types:
    if (statusCode !== 204 && statusCode !== 304) {
      return c.text(String(body), statusCode, headers);
    } else {
      // 204/304 should not have a body. Return with headers only.
      return new Response(null, { status: statusCode, headers });
    }
  } else {
    // No body provided (e.g., 204 No Content)
    return new Response(null, { status: statusCode, headers });
  }
}

/**
 * Sends a 201 Created response.
 * If a `createdId` is provided, includes it in the response body (JSON: `{ id: ... }`).
 * Also sets the Location header to the resource URL if provided or derived.
 */
export function sendCreated(
  c: Context,
  options: CreatedHttpResponseOptions,
): Response {
  // Determine body content for Created: if createdId is present, respond with { id: createdId }
  const bodyContent =
    'createdId' in options ? { id: options.createdId } : undefined;
  let resp: Response;
  if (bodyContent !== undefined) {
    resp = c.json(bodyContent, 201);
  } else {
    resp = new Response(null, { status: 201 });
  }
  // Set Location header:
  if ('url' in options && options.url) {
    resp.headers.set('Location', options.url);
  } else if ('createdId' in options && options.createdId) {
    // If URL not explicitly given, derive from request URL and createdId
    const baseUrl = c.req.url;
    const separator = baseUrl.endsWith('/') ? '' : '/';
    resp.headers.set('Location', baseUrl + separator + options.createdId);
  }
  return resp;
}

/** Sends a 202 Accepted response, using the general send function. */
export function sendAccepted(
  c: Context,
  options: AcceptedHttpResponseOptions,
): Response {
  return send(c, 202, options);
}

/** Sends a 204 No Content response. */
export function sendNoContent(
  c: Context,
  options?: NoContentHttpResponseOptions,
): Response {
  const headers: Record<string, string> = {};
  if (options?.eTag) headers['ETag'] = options.eTag;
  if (options?.location) headers['Location'] = options.location;
  return new Response(null, { status: 204, headers });
}

/**
 * Sends a Problem Details response (application/problem+json).
 * Uses the provided ProblemDocument or constructs one from a detail message.
 */
export function sendProblem(
  c: Context,
  statusCode: StatusCode,
  options?: HttpProblemResponseOptions,
): Response {
  const { problem, problemDetails, location, eTag } = options ?? {};
  const problemDoc: ProblemDocument = problem
    ? problem
    : new ProblemDocument({
        status: statusCode as number,
        detail: problemDetails || '',
      });
  const headers: Record<string, string> = {
    'Content-Type': 'application/problem+json',
  };
  if (location) headers['Location'] = location;
  if (eTag) headers['ETag'] = eTag;
  // Ensure status code is appropriate for content
  if (statusCode !== 204 && statusCode !== 304) {
    return c.json(problemDoc, statusCode as StatusCode, headers);
  } else {
    // If a 204/304 with a problem (rare), just send JSON manually
    return new Response(JSON.stringify(problemDoc), {
      status: statusCode,
      headers,
    });
  }
}
```

## packages/emmett-hono/src/handler.ts

```ts
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
```

## packages/emmett-hono/src/index.ts

```ts
// Main entry: export key functions, classes, and types for external usage.
export { getApplication } from './application';
export {
  on,
  OK,
  Created,
  Accepted,
  NoContent,
  HttpResponse,
  BadRequest,
  Forbidden,
  NotFound,
  Conflict,
  PreconditionFailed,
  HttpProblem,
} from './handler';
export { ProblemDocument, defaultErrorMapper } from './types';
export type {
  ApplicationOptions,
  EmmettHonoHandler,
  EmmettHonoResponse,
} from './types';
```

The **Emmett-Hono** package above provides:

- `getApplication(options)` to create a Hono app with configured middleware.
- Helper functions like `OK(), Created(), BadRequest(), HttpProblem()` to easily create route handlers that return appropriate HTTP responses (including JSON bodies and proper headers).
- Automatic integration with **Zod** via Hono’s `zValidator` middleware and support for generating a typed client using **Hono Stacks** (as shown in the example below).
- A global error handler (Problem Details RFC 7807) that can be toggled on/off and customized via `mapError`.

## Example Usage: Cloudflare Worker API

Below is an example of an API built using Emmett-Hono, demonstrating routes, Zod validation, and integration with Cloudflare Workers. This could be one of the monorepo packages (e.g., `packages/example-api`).

```ts
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getApplication, on, OK, Created, NotFound, BadRequest } from 'emmett-hono';

// Define a Zod schema for a "Todo" item
const TodoSchema = z.object({
  title: z.string(),
  done: z.boolean().optional().default(false),
});
type Todo = z.infer<typeof TodoSchema>;

// In-memory store for example
const todos: Record<string, Todo> = {};

// Define API routes using Emmett-Hono:
const apiRoutes = (app: Hono) => {
  // Health check route (simple OK text)
  app.get('/ping', (c) => c.text('pong'));

  // Create a new Todo (validate JSON body with Zod)
  app.post('/todos',
    zValidator('json', TodoSchema),
    on((c) => {
      const todo: Todo = c.req.valid('json');  // validated body
      const id = crypto.randomUUID();          // generate an ID
      todos[id] = todo;
      // Return 201 Created with the new resource ID and Location header:
      return Created({ createdId: id })(c);
    })
  );

  // Get all todos
  app.get('/todos', on((c) => {
    return OK({ body: todos })(c);
  }));

  // Get a single Todo by ID
  app.get('/todos/:id', on((c) => {
    const id = c.req.param('id');
    const todo = todos[id];
    if (!todo) {
      // Return a 404 Not Found problem detail if not found
      return NotFound({ problemDetails: `Todo ${id} not found` })(c);
    }
    return OK({ body: todo })(c);
  }));

  // Delete a Todo by ID
  app.delete('/todos/:id', on((c) => {
    const id = c.req.param('id');
    if (!todos[id]) {
      return NotFound({ problemDetails: `Todo ${id} not found` })(c);
    }
    delete todos[id];
    // Return 204 No Content on successful deletion
    return c.body(null, 204);
  }));
};

// Create the Hono app using getApplication with desired middleware
const app = getApplication({
  apis: [apiRoutes],
  enableCors: true,
  enableETag: true,
  enableLogger: true,
  // Example custom error mapping: map Zod validation errors to 400 Bad Request
  mapError: (error) => {
    if (error instanceof z.ZodError) {
      return new (import('emmett-hono').ProblemDocument)({
        status: 400,
        detail: error.errors.map(e => e.message).join('; '),
        title: 'Bad Request',
      });
    }
    // otherwise, use default mapping (500 Internal Server Error)
    return undefined;
  },
});

// Export type for Hono Stacks (for client generation)
export type AppType = typeof app;

// Cloudflare Worker Fetch Handler
export default {
  fetch(request: Request, env: unknown, ctx: ExecutionContext):): Promise<Response> {
    return app.fetch(request, env, ctx);
  }
};
```

In this example, we use **Zod v4** with `@hono/zod-validator` to validate request bodies. The `mapError` function in `getApplication` ensures that any Zod validation errors are mapped to a 400 Bad Request Problem Details response, while other errors default to 500.

We also export `AppType` (the inferred type of our Hono app) which will be used by the client for type-safe API calls.

## Example Generated Client Usage

Using **Hono Stacks**, we can generate a type-safe client for the above API. For instance, in a front-end application (or a testing client), we can do:

```ts
import { hc } from 'hono/client';
import type { AppType } from 'example-api'; // import the AppType from the API package

// Create a client for the API (assuming it is deployed at '/api' relative URL or a full URL)
const client = hc<AppType>('/api');

// Example: fetch all todos
const response = await client.todos.$get();
if (response.ok) {
  const data = await response.json();
  console.log('Todos:', data);
}

// Example: create a new todo
const createRes = await client.todos.$post({
  json: { title: 'Write docs for Emmett-Hono' }, // typed checked against TodoSchema
});
console.log('Created Todo, status:', createRes.status);
if (createRes.status === 201) {
  const location = createRes.headers.get('Location');
  console.log('New resource at:', location);
}
```

Thanks to the integration with Hono and Zod, the `hc<AppType>` client knows the available endpoints (`todos`, etc.), their methods, and the expected request/response types. This provides end-to-end type safety: if we change the API (for example, add a required field in the Zod schema or modify routes), the client code will immediately show type errors until updated accordingly.

## Example Test (Vitest)

Each package and route can be tested using Hono’s built-in testing utilities. For example, to test the `/todos` endpoints from our API:

```ts
import { describe, it, expect } from 'vitest';
import { app } from 'example-api'; // import the configured Hono app instance

describe('Todo API', () => {
  it('should create and retrieve a todo item', async () => {
    // Create a new Todo
    const newTodo = { title: 'Test Todo' };
    const createRes = await app.request('/todos', {
      method: 'POST',
      body: JSON.stringify(newTodo),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(createRes.status).toBe(201);
    const location = createRes.headers.get('Location');
    expect(location).toBeTruthy();

    // Retrieve all todos and expect to find the new one
    const listRes = await app.request('/todos');
    expect(listRes.status).toBe(200);
    const todos = await listRes.json<Record<string, any>>();
    // The new todo's ID should be a key in the todos object
    const newId = location?.split('/').pop()!;
    expect(todos).toHaveProperty(newId);
    expect(todos[newId].title).toBe(newTodo.title);
  });

  it('should return 404 for missing todo', async () => {
    const res = await app.request('/todos/nonexistent-id');
    expect(res.status).toBe(404);
    const problem = await res.json();
    expect(problem.detail).toContain('not found');
  });
});
```

In these tests, we use `app.request()` (provided by Hono) to simulate HTTP requests to our API. We verify that the responses have the expected status codes and body content. The test demonstrates creation and retrieval of a Todo item, as well as the handling of a nonexistent item.

---

**Note:** This monorepo structure can be extended with additional packages (e.g., `emmett-mongodb`, `emmett-postgresql`, etc.) to provide database integrations. Each package should include similar comprehensive tests and documentation. The code above serves as a clean, idiomatic starting point for building an Emmett-based backend on Hono and Cloudflare Workers. It follows modern TypeScript best practices, leverages Hono's middleware and type-safe client features, and is designed for clarity and maintainability.

---

based on this:

---

---

## Drop Express Hono Guide

Perfect — I’ll put together a detailed, opinionated, and clear plan for dropping Express compatibility, deeply embracing Hono (with Zod 4 validation, Bun + Vitest friendliness), and focusing on great DX. I’ll also include optional "bonus" upgrades like typed request validation and Hono stacks patterns, but will be careful to avoid over-abstraction and maintain clarity for an advanced but not "10x" developer audience.

I’ll get started and will organize it as a full guide, with code examples, clearly documented steps, and opinionated best practices.

# Migrating from Express to Hono in an Emmett Event-Sourced Project

## Introduction and Goals

In our internal project, we plan to replace the Express-compatible web layer with **Hono**, a modern ultrafast web framework. This project is built on the **Emmett** event-sourcing framework (for Node.js), and our goal is to fully embrace Hono’s advantages while preserving Emmett’s core logic. Hono is a lightweight TypeScript framework that “runs anywhere JavaScript does” and is built on Web Standards ([The story of web framework Hono, from the creator of Hono](https://blog.cloudflare.com/th-th/the-story-of-web-framework-hono-from-the-creator-of-hono/#:~:text=Hono%20is%20a%20fast%2C%20lightweight,it%20runs%20on%20Cloudflare%20Workers)), making it ideal for Cloudflare Workers, Deno, Bun, and Node environments. By migrating to Hono, we aim to improve performance and **Cloudflare compatibility** ([The story of web framework Hono, from the creator of Hono](https://blog.cloudflare.com/th-th/the-story-of-web-framework-hono-from-the-creator-of-hono/#:~:text=Hono%20truly%20runs%20anywhere%20%E2%80%94,each%20runtime%20supports%20Web%20Standards)) while maintaining great developer experience (DX) and type-safety.

**Key Objectives:**

- **Great DX & Clarity:** Keep code **clean and approachable**, especially since the team is new to Event Sourcing. Favor straightforward patterns over clever abstractions. No unnecessary bikeshedding or over-engineering of types.
- **TypeScript Best Practices:** Follow **“Total TypeScript”** principles for strong typing and maintainability, but **pragmatically** (avoid turning the codebase into a “TS shrine” at the cost of readability). Use type inference and simple generics to our advantage without excessive complexity.
- **Event Sourcing Simplicity:** Use Emmett’s event-sourcing patterns (deciders, command handlers, event stores) in a clear way. Don’t introduce overly complex event-sourcing abstractions beyond what Emmett provides out-of-the-box.
- **Bun & Cloudflare Compatibility:** Ensure the new solution works seamlessly in Bun (our runtime for dev/test) and remains portable to Cloudflare Workers. This means using **Web API standards** (Hono’s foundation) and avoiding Node-specific APIs when possible ([The story of web framework Hono, from the creator of Hono](https://blog.cloudflare.com/th-th/the-story-of-web-framework-hono-from-the-creator-of-hono/#:~:text=Hono%20truly%20runs%20anywhere%20%E2%80%94,each%20runtime%20supports%20Web%20Standards)).
- **Robust Validation & Types:** Introduce **Zod v4** for input validation and schema definition. This gives us **runtime validation** and **static types** for request data, boosting confidence in data integrity.
- **Testing Parity:** Continue using **Vitest** to test all functionality. We should be able to write tests for Hono routes easily and ensure behavior remains consistent after migration.
- **Stay in Sync with Emmett:** Our changes should not fork away from Emmett’s design. We’ll track upstream Emmett updates (especially any that affect our integration) and adapt as needed, possibly contributing improvements back.

By the end of this migration, we expect a **fully Hono-native implementation** of the web API, with all Express/Express-compatibility code removed. The application should be cleaner, faster, and ready for edge deployment – all without sacrificing the clarity of event-sourced business logic.

---

## Step 1: Analyze the Current Express + Emmett Setup

Before coding changes, **survey the existing implementation** to understand how Express is used in conjunction with Emmett:

- **Emmett’s Role:** Emmett is an opinionated yet flexible event-sourcing framework for Node.js ([Emmett - a Node.js library taking your event-driven ... - GitHub](https://github.com/event-driven-io/emmett#:~:text=Emmett%20,It)). It provides utilities for defining event streams, deciders (to evolve state), and command handlers. In our project, Emmett likely handles domain logic (applying commands to produce events and update state). Emmett also offers an Express integration (via `@event-driven-io/emmett-expressjs`) to help expose the event-sourced logic as HTTP endpoints ([Getting Started | Emmett](https://event-driven-io.github.io/emmett/getting-started.html#:~:text=Yes%2C%20Emmett%20provides%20more%20built,add%20problem%20details%2C%20information%2C%20etc)).
- **Express Integration:** Identify where Express is initialized. For example, the code might use an Express `Router` and Emmett’s `WebApiSetup` pattern:

  ```ts
  import { Router } from 'express';
  import { WebApiSetup } from '@event-driven-io/emmett-expressjs';

  const router = Router();
  // Emmett’s command handler and routes setup
  export const myApi: WebApiSetup = (router: Router) => {
    router.get('/something', (req, res) => {
      /* ... */
    });
    // ... other routes
  };
  ```

  Emmett’s docs show that you can wrap route handlers with an `on()` helper and use response helpers like `Created()` or `NoContent()` ([Getting Started | Emmett](https://event-driven-io.github.io/emmett/getting-started.html#:~:text=Yes%2C%20Emmett%20provides%20more%20built,add%20problem%20details%2C%20information%2C%20etc)). For instance, an Express route to add an item might look like:

  ```ts
  router.post(
    '/items',
    on(async (req) => {
      const { productId, quantity } = req.body;
      // validate and build command
      await handle(eventStore, id, (state) => addItemCommand(command, state));
      return NoContent(); // Emmett helper to send 204
    }),
  );
  ```

- **Middleware & Utilities:** Note any Express middleware (e.g., `express.json()` for body parsing, CORS middleware, auth checks). We will replicate or replace these in Hono.
- **Custom Types/Interfaces:** The project might have custom Express `Request` types (e.g., for typed `req.body`). For example, Emmett examples define types like `AddProductItemRequest extends Request<Params, ResBody, ReqBody>` ([Getting Started | Emmett](https://event-driven-io.github.io/emmett/getting-started.html#:~:text=import%20type%20,from%20%27express)). These will become unnecessary with Hono+Zod (we’ll derive types from schemas instead of extending Express types).

**Takeaway:** We need a clear picture of all Express-specific code paths (routing, middleware, error handling). **Write down each route** and its behavior, and ensure we have tests (or can add tests) for them. This preparation will guide the migration steps so we don’t miss any functionality.

---

## Step 2: Set Up Hono in the Bun Environment

Next, we will **bootstrap a Hono server** to run alongside (or in place of) the Express app. Hono works well with Bun – in fact, Hono has official starter templates for Bun ([Build an HTTP server using Hono and Bun | Bun Examples](https://bun.sh/guides/ecosystem/hono#:~:text=import%20,const%20app%20%3D%20new%20Hono)) ([Build an HTTP server using Hono and Bun | Bun Examples](https://bun.sh/guides/ecosystem/hono#:~:text=bun%20create%20hono%20myapp)). We’ll follow best practices for setting up Hono:

- **Install Dependencies:** Add Hono (and its types) and Zod libraries to the project:
  ```bash
  bun add hono @hono/zod-validator zod
  ```
  Also ensure Express (and `@event-driven-io/emmett-expressjs`) remain for now (during the transition) so we can run tests to compare old vs. new. We will remove Express later.
- **Create a Hono App:** In a new server entry (e.g., `server.ts` or modify the existing one), initialize a Hono instance:
  ```ts
  import { Hono } from 'hono';
  const app = new Hono();
  ```
  Hono is built on the Fetch API. In Bun, we can export the app or use Bun’s serve utility. For example, if using `bun dev`, simply exporting `app` might auto-start it:
  ```ts
  export default app;
  ```
  (The Bun guide shows that `bun run dev` will serve `app` on localhost:3000 by default ([Build an HTTP server using Hono and Bun | Bun Examples](https://bun.sh/guides/ecosystem/hono#:~:text=bun%20install)).) Alternatively, explicitly start a server:
  ```ts
  Bun.serve({
    fetch: app.fetch, // Hono provides a fetch handler
    port: 3000,
  });
  ```
- **Basic Test Route:** Add a quick test endpoint to verify Hono is working:
  ```ts
  app.get('/health', (c) => c.text('OK'));
  ```
  Run the server with Bun and visit the `/health` route to see that it returns "OK". This ensures our Hono setup is correct.
- **Parallel Run (Optional):** During migration, you might temporarily run Express and Hono side by side (on different ports) for comparative testing. However, since our plan is to **fully replace** Express, we can proceed to port routes one-by-one, using tests to ensure parity.

At this stage, we have a running Hono app ready to accept routes. We’ve confirmed Bun + Hono integration works (Hono’s design “runs anywhere” including Bun ([The story of web framework Hono, from the creator of Hono](https://blog.cloudflare.com/th-th/the-story-of-web-framework-hono-from-the-creator-of-hono/#:~:text=Hono%20truly%20runs%20anywhere%20%E2%80%94,each%20runtime%20supports%20Web%20Standards)), so no surprises here). Now we can start migrating each route from Express to Hono.

---

## Step 3: Migrate Routes from Express to Hono

We will convert each Express route handler into a Hono route handler, integrating Emmett’s command handling logic. The approach is:

**3.1 Define Routes with Hono’s API:** Hono’s routing API is similar to Express but uses a `Context` object (`c`) instead of separate `req` and `res`. For example, an Express GET route:

```ts
// Express example
expressApp.get('/items/:id', (req, res) => {
  const id = req.params.id;
  // ... fetch or compute item
  res.json(item);
});
```

In Hono, becomes:

```ts
// Hono example
app.get('/items/:id', (c) => {
  const id = c.req.param('id'); // get path param
  // ... fetch or compute item
  return c.json(item);
});
```

Hono’s `c.req.param()` method retrieves path parameters ([HonoRequest - Hono](https://hono.dev/docs/api/request#:~:text=)), and `c.json(...)` sends a JSON response with appropriate headers. Similarly, `c.req.query()` gets query string values ([HonoRequest - Hono](https://hono.dev/docs/api/request#:~:text=%2F%2F%20Query%20params)) ([HonoRequest - Hono](https://hono.dev/docs/api/request#:~:text=%29%20%3D)). For request bodies, Hono provides `await c.req.json()` to parse JSON payloads ([HonoRequest - Hono](https://hono.dev/docs/api/request#:~:text=json)) ([HonoRequest - Hono](https://hono.dev/docs/api/request#:~:text=%29%20%3D)).

**3.2 Translate Express Handler Logic:** Inside each Hono route, translate the logic from the Express handler:

- **Path & Query Params:** Use `c.req.param('<name>')` instead of `req.params.<name>`. This returns the param as a string (already URL-decoded). If you need all params at once, `c.req.param()` returns an object of all params ([HonoRequest - Hono](https://hono.dev/docs/api/request#:~:text=app)).
- **Query strings:** Use `c.req.query('<key>')` for single query param, or `c.req.query()` for an object of all query params ([HonoRequest - Hono](https://hono.dev/docs/api/request#:~:text=%29%20%3D)). (Hono will parse query strings for you.)
- **JSON Body:** Instead of `req.body`, use `await c.req.json()` (or `c.req.formData()` for form submissions, etc. – similar to the Fetch API). This gives you the parsed JSON object of the request body ([HonoRequest - Hono](https://hono.dev/docs/api/request#:~:text=json)) ([HonoRequest - Hono](https://hono.dev/docs/api/request#:~:text=%29%20%3D)).
- **Sending Response:** In Hono, we **return** a response from the handler. The simplest is to return `c.json(data)` for JSON, `c.text(data)` for plaintext, etc. You can set status codes by passing a second argument or using `c.status(...)` before returning ([Setting response headers and status codes - Mastering Hono: Building Modern Web Applications | StudyRaid](https://app.studyraid.com/en/read/11303/352719/setting-response-headers-and-status-codes#:~:text=typescript)) ([Setting response headers and status codes - Mastering Hono: Building Modern Web Applications | StudyRaid](https://app.studyraid.com/en/read/11303/352719/setting-response-headers-and-status-codes#:~:text=return%20c.json%28,)). For example, to mimic `res.sendStatus(204)` (no content), use:

  ```ts
  return c.text('', 204);
  ```

  This sets status 204 with an empty body. You could also do `c.status(204); return c.body(null);` – either yields a 204 No Content.

- **Async/Await:** Hono supports async handlers. You no longer need Emmett’s `on()` wrapper to catch errors; Hono will handle promises (and we will add a global error handler later). Simply mark the handler `async` and use `await` as needed.

**3.3 Integrate Emmett Command Handling:** The core of each route is likely invoking Emmett’s event-sourcing logic. For example, consider an Express route (from our current project) that adds a product item to a shopping cart:

```ts
// Express + Emmett (before)
router.post('/clients/:clientId/cart/items', async (req, res) => {
  const shoppingCartId = getShoppingCartId(req.params.clientId);
  const productId = req.body.productId;
  const quantity = req.body.quantity;
  // Validate inputs...
  const command: AddProductItem = {
    type: 'AddProductItem',
    data: { shoppingCartId, productId, quantity /* ... */ },
  };
  await handle(eventStore, shoppingCartId, (state) =>
    addProductItem(command, state),
  );
  res.sendStatus(204);
});
```

We will rewrite this in Hono with improved validation (using Zod, see Step 4). For now, focus on integrating `handle`:

```ts
// Hono + Emmett (after)
app.post('/clients/:clientId/cart/items', async (c) => {
  const shoppingCartId = getShoppingCartId(c.req.param('clientId'));
  const body = await c.req.json();
  const { productId, quantity } = body;
  // ... validate inputs (next step will improve this)
  const command: AddProductItem = {
    type: 'AddProductItem',
    data: { shoppingCartId, productId, quantity /* ... */ },
  };
  await handle(eventStore, shoppingCartId, (state) =>
    addProductItem(command, state),
  );
  return c.text('', 204);
});
```

A few notes on the above:

- We obtain `clientId` from the path via `c.req.param('clientId')`. (Hono ensures this is a string; we will validate it shortly.)
- We parse the JSON body and destructure needed fields.
- We then call Emmett’s `handle` function exactly as before, passing in the event store, stream ID, and the decider logic (`addProductItem` function with the command).
- On success, we return 204 No Content to indicate the item was added.

**3.4 Response Helpers:** Emmett’s Express layer provided functions like `Created(responseData)` or `NoContent()`. In Hono, we replicate their effect manually:

- For **NoContent** (204): simply return a 204 as shown above.
- For **Created (201)**: Hono can set headers and JSON together. For example, if Emmett’s `Created({ createdId, eTag })` sets a Location header and returns JSON with those fields, we can do:
  ```ts
  return c.json({ createdId, eTag }, 201, {
    Location: `/some-resource/${createdId}`,
  });
  ```
  Hono’s `c.json(body, status, headers)` signature lets us send a JSON response with custom headers and status in one go ([Testing - Hono](https://hono.dev/docs/guides/testing#:~:text=app.post%28%27%2Fposts%27%2C%20%28c%29%20%3D,Custom%27%3A%20%27Thank%20you%27%2C)) ([Testing - Hono](https://hono.dev/docs/guides/testing#:~:text=return%20c.json%28%20,Custom%27%3A%20%27Thank%20you%27%2C%20%7D)). This covers setting location or ETag headers as needed.
- For error statuses (like 404 or 400 with problem details), we can similarly use `return c.json(errorDetails, statusCode)`.

**3.5 Example – Full Route Conversion:** Let’s apply this to a concrete example from Emmett’s documentation. The original Express+Emmett code for adding an item (with validation) looks like this:

```ts
// Original Express+Emmett example (simplified from docs)
router.post(
  '/clients/:clientId/shopping-carts/current/product-items',
  async (req, res) => {
    const shoppingCartId = getShoppingCartId(
      assertNotEmptyString(req.params.clientId),
    );
    const productId = assertNotEmptyString(req.body.productId);
    const qty = assertPositiveNumber(req.body.quantity);
    const command: AddProductItemToShoppingCart = {
      type: 'AddProductItemToShoppingCart',
      data: {
        shoppingCartId,
        productItem: {
          productId,
          quantity: qty,
          unitPrice: await getUnitPrice(productId),
        },
      },
    };
    await handle(eventStore, shoppingCartId, (state) =>
      addProductItem(command, state),
    );
    res.sendStatus(204);
  },
);
```

Now our Hono version with equivalent logic:

```ts
// Hono version of the same route (with basic validation)
app.post(
  '/clients/:clientId/shopping-carts/current/product-items',
  async (c) => {
    const clientId = c.req.param('clientId'); // path param
    const { productId, quantity } = await c.req.json(); // body data
    // Basic validation (to be replaced by Zod in next step)
    if (!clientId || !productId || typeof quantity !== 'number') {
      return c.json({ error: 'Invalid input' }, 400);
    }
    const shoppingCartId = getShoppingCartId(clientId);
    const command: AddProductItemToShoppingCart = {
      type: 'AddProductItemToShoppingCart',
      data: {
        shoppingCartId,
        productItem: {
          productId,
          quantity,
          unitPrice: await getUnitPrice(productId),
        },
      },
    };
    await handle(eventStore, shoppingCartId, (state) =>
      addProductItem(command, state),
    );
    return c.text('', 204);
  },
);
```

This demonstrates how every aspect maps over:

- We retrieve inputs via `c.req` methods instead of `req`.
- We handle the event-sourcing command in the same way.
- We send the response via `c` instead of `res`.

At this point, **repeat this process for all routes** in the project:

- Convert **GET** routes, **PUT/PATCH**, **DELETE** routes similarly. Hono supports all HTTP verbs (e.g., `app.delete(...)`).
- For any Express **middleware** or `router.use()`, port them to Hono’s middleware:

  - If there was a JSON body parser (`app.use(express.json())`), it’s not needed – Hono’s `c.req.json()` handles parsing on demand. (No global parser needed, which can actually improve performance.)
  - If there was a CORS middleware, use Hono’s built-in CORS middleware instead:
    ```ts
    import { cors } from 'hono/cors';
    app.use('*', cors()); // enable CORS for all routes
    ```
    (We can configure allowed origins, etc., as needed.)
  - If there was auth middleware (e.g., JWT verification), Hono has a JWT middleware too ([Hono Stacks - Hono](https://hono.dev/docs/concepts/stacks#:~:text=html)). Or implement a custom one with `app.use` that checks `c.req.header('Authorization')`.
  - If any other Express-specific utility was in use (e.g., `express.static` for serving files), Hono might not cover it directly, but since this is an API project we likely don’t serve static files here. In case we do, we’d handle static files via Bun or another approach.

- **Error handling**: Remove any Express error-handling middleware (e.g., a final `app.use((err, req, res, next) => { ... })`). We will add a Hono error handler later in Step 6.

**After this step**, all route handlers should be defined on the Hono `app` with equivalent functionality to the old Express routes. This is a good point to run the test suite (or hit endpoints manually) to verify that responses from the new Hono endpoints match the old behavior.

_(At first, you can keep the Express server running on a different port to cross-test quickly. Ultimately, Express will be removed.)_

---

## Step 4: Introduce Zod v4 for Validation and Types

Now that the routes are migrated, we enhance them by adding **Zod** for input validation. Using Zod will ensure each request’s parameters and body are validated against a schema, improving reliability and providing typed data to use in handlers.

**4.1 Why Zod?** Zod is a TypeScript-friendly schema validation library. We can define schemas for our inputs (params, query, JSON body) and use them to:

- Validate incoming data at runtime (returning a 400 Bad Request automatically if validation fails).
- Infer TypeScript types from those schemas, so our handlers get strongly-typed data (no need to manually define interfaces for request bodies – they derive from Zod).

**4.2 Using Hono’s Zod Middleware:** Hono provides a built-in integration with Zod via the `@hono/zod-validator` package. We installed it earlier. We will use the `zValidator` middleware on our routes.

The general pattern is:

```ts
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

app.<verb>( '<path>',
  zValidator('<target>', schema),
  (c) => {
    const data = c.req.valid('<target>');
    // ...use data
  }
);
```

Here, `<target>` can be `'param'`, `'query'`, `'json'`, `'form'`, `'header'`, etc. – indicating which part of the request to validate ([Validation - Hono](https://hono.dev/docs/guides/validation#:~:text=)). You can apply multiple `zValidator` middlewares if you need to validate more than one part. For example, one for `'param'` and one for `'json'`. Once validated, `c.req.valid('<target>')` returns the **typed** result (based on the schema) ([Validation - Hono](https://hono.dev/docs/guides/validation#:~:text=ts)) ([Validation - Hono](https://hono.dev/docs/guides/validation#:~:text=%27%2Ftesting%27%2C%20validator%28%27json%27%2C%20%28value%2C%20c%29%20%3D,json%28body%29)).

**4.3 Define Schemas for Each Route:** Let’s update our example route with Zod:

- **Path Param Schema:** For `clientId` which should be a non-empty string:
  ```ts
  const clientIdParamSchema = z.object({ clientId: z.string().min(1) });
  ```
- **JSON Body Schema:** For productId (non-empty string) and quantity (positive number):
  ```ts
  const addItemBodySchema = z.object({
    productId: z.string().min(1),
    quantity: z.number().positive(),
  });
  ```
- We also expect `quantity` to be an integer perhaps – we can refine if needed (e.g., `.int()` if only whole numbers allowed).

Now apply these in the route:

```ts
app.post(
  '/clients/:clientId/shopping-carts/current/product-items',
  // 1) Validate path param
  zValidator('param', clientIdParamSchema),
  // 2) Validate JSON body
  zValidator('json', addItemBodySchema),
  // 3) Now the handler, with validated input
  async (c) => {
    // Retrieve validated values:
    const { clientId } = c.req.valid('param');
    const { productId, quantity } = c.req.valid('json');
    // All of these are now guaranteed: clientId, productId are non-empty strings, quantity is a positive number.
    const shoppingCartId = getShoppingCartId(clientId);
    const command: AddProductItemToShoppingCart = {
      type: 'AddProductItemToShoppingCart',
      data: {
        shoppingCartId,
        productItem: {
          productId,
          quantity,
          unitPrice: await getUnitPrice(productId),
        },
      },
    };
    await handle(eventStore, shoppingCartId, (state) =>
      addProductItem(command, state),
    );
    return c.text('', 204);
  },
);
```

Let’s break down what changed:

- We added two middleware calls before our handler. These will run first. If validation fails, Hono will **automatically short-circuit** and return a 400 response with details of the Zod error by default ([Hacking Hono: The Ins and Outs of Validation Middleware - Fiberplane](https://fiberplane.com/blog/hono-validation-middleware/#:~:text=Hacking%20Hono%3A%20The%20Ins%20and,While%20convenient%20in)). (This is very handy – it means we don’t even reach our handler if input is invalid.)
- In the handler, instead of manually parsing or validating, we call `c.req.valid('param')` and `'json'`. These methods give us the **already-parsed and Zod-validated** data. Notice, no type casts – `clientId` is typed as `string` (not `string | undefined`), `quantity` is a number, etc. If any field were missing or wrong type, the handler wouldn’t run.
- The rest of the logic remains the same, but now much safer and cleaner. We removed those `assertNotEmptyString` / `assertPositiveNumber` util calls – Zod took over that role.

**4.4 Validation for Other Routes:** Do similarly for all routes:

- If a route has query parameters (e.g., `GET /items?filter=xyz`), define a Zod schema for query and use `zValidator('query', schema)`. For example:
  ```ts
  const listItemsQuerySchema = z.object({ filter: z.string().optional() });
  app.get('/items', zValidator('query', listItemsQuerySchema), (c) => {
    const { filter } = c.req.valid('query');
    // filter is string | undefined here based on .optional()
    // ... fetch items with filter
    return c.json(items);
  });
  ```
- If multiple path params, include all in the `param` schema (e.g., `/users/:userId/books/:bookId` -> `z.object({ userId: z.string(), bookId: z.string() })`).
- For routes with no body or no query, you can skip validation or just not use zValidator there. (Or use it to enforce nothing extra is sent, but that’s optional.)

**4.5 Zod Refinements and Transformations:** Zod v4 allows complex schemas. Keep it simple for DX:

- Use `.min(1)` on strings to ensure non-empty if needed, `.positive()` or `.int()` on numbers for basic constraints.
- If you need to transform input (say, parse a string as a number), you can use `z.coerce.number()` to accept a string and convert to number. But be careful: if the team is new to these, avoid overusing clever Zod features that could confuse (we can stick to straightforward type enforcement).
- **Example:** If a route takes a date string, we might do `z.string().refine(val => !isNaN(Date.parse(val)), { message: "Invalid date" })`. Only add such refinements when necessary for business rules.

With validation in place, our API is much more robust. The team will appreciate that if they call an endpoint incorrectly, they get a clear 400 error with explanation (e.g., which field is wrong). And developers working on the code get **autocompletion and type checking** for `c.req.valid()` data – no more guessing property names or types. This greatly boosts DX.

_(As a bonus, we could integrate error formatting for Zod errors if we want custom error responses, but initially the default is fine.)_

---

## Step 5: Embrace Hono “Stacks” and Advanced Patterns (Bonus)

With core functionality migrated and validated, we can consider **bonus upgrades** that Hono enables. These are optional but recommended for a **modern, maintainable stack**:

- **5.1 Shared Types & RPC:** One of Hono’s powerful patterns is the ability to **share API types with the client**. This is sometimes called the Hono “Stack” – using Hono + Zod + a generated client together ([Hono Stacks - Hono](https://hono.dev/docs/concepts/stacks#:~:text=%2A%20Hono%20,HTTP%20Client)). After defining routes with validators, we can export a type that represents our app’s endpoints, and use Hono’s client (`hc`) to make type-safe calls from other services or front-end code.

  _How to implement:_ Suppose we have our `app` with all routes. We can derive its type and create a client:

  ```ts
  export type AppType = typeof app;
  import { hc } from 'hono/client';
  const client = hc<AppType>('https://api.myservice.com');
  // Now `client` has methods corresponding to our routes.
  // E.g., if we had app.get('/items/:id', ...), we can do:
  const res = await client.items._id.$get({ param: { id: '123' } });
  const data = await res.json();
  ```

  The above might require slight refactoring: Hono can infer route types if we chain routes or store them in a variable ([Hono Stacks - Hono](https://hono.dev/docs/concepts/stacks#:~:text=For%20the%20RPC%20to%20infer,see%20Best%20Practices%20for%20RPC)) ([Hono Stacks - Hono](https://hono.dev/docs/concepts/stacks#:~:text=import%20,from%20%27hono%2Fclient)). We might need to ensure our routes are defined in a way that `typeof app` carries all routes (or export a composite type via Hono’s `Route` utility). This yields a fully **type-safe client** where if you change a route or its input schema, the client TypeScript will break accordingly – eliminating many integration bugs.

  If the project has a front-end or other service consuming this API, adopting this pattern will drastically reduce duplicate typing of endpoints. It’s a DX win (less manual writing of fetch calls, and autocompletion for API calls).

- **5.2 Documentation via OpenAPI:** Since we’re already using Zod for schemas, we can leverage tools to generate API docs. The `hono-zod-openapi` library can produce an OpenAPI (Swagger) spec from our route definitions with minimal effort ([@paolostyle/hono-zod-openapi - JSR](https://jsr.io/@paolostyle/hono-zod-openapi#:~:text=,but%20it%20is%20still%20possible)) ([@paolostyle/hono-zod-openapi - JSR](https://jsr.io/@paolostyle/hono-zod-openapi#:~:text=,but%20it%20is%20still%20possible)). This might be overkill for an internal project, but if documentation or third-party integration is needed, it’s a nice bonus. Essentially, by adding one more middleware (`openApi({...schemas...})` with our Zod schemas), we could serve a JSON or YAML describing the API.

- **5.3 Use Hono’s Built-in Middleware:** Review if we can use more Hono middleware to improve maintainability:

  - **CORS:** Already mentioned, `app.use('*', cors(...))` if needed.
  - **Security Headers:** Consider using `helmet`-like middleware. Hono has a `secure-headers` middleware to set common security headers, as well as `csp`, etc., if relevant ([Hono Stacks - Hono](https://hono.dev/docs/concepts/stacks#:~:text=Request%20ID)).
  - **Logging:** Hono provides a simple logger middleware ([Hono Stacks - Hono](https://hono.dev/docs/concepts/stacks#:~:text=JWT)). We might integrate that for development (to see incoming requests and response times).
  - **ETag or Cache:** If any routes serve cacheable content, Hono’s `etag()` or `cache()` middleware can automate setting `ETag` or `Cache-Control` headers ([Hono Stacks - Hono](https://hono.dev/docs/concepts/stacks#:~:text=CSRF%20Protection)).
  - **Compression:** If we serve large responses, `app.use(compress())` could enable GZIP compression (Bun might handle some of this, but middleware gives fine control).

  Use these as needed – they are easy plug-ins and keep us from reinventing wheels.

- **5.4 Cloudflare Deployment Patterns:** Because we prioritized Cloudflare compatibility, deploying this Hono app to Cloudflare Workers or Pages Functions should be straightforward. Hono can simply be exported as a module for the Worker environment (with `export default app`), and it will use the Fetch API event handling under the hood. If we foresee deployment to Cloudflare:
  - Ensure no Node-specific code is left (e.g., if using any Node libraries for HTTP or file I/O – likely not in an API).
  - Use environment variables via `c.env` if needed (Hono’s context can include environment bindings on CF Workers).
  - Test using `wrangler dev` or miniflare with our Hono app to confirm it works on Workers. (This should just work since Hono is built on Web APIs.)

By adopting these **Hono Stack** enhancements, our project isn’t just a one-to-one port of Express code; it becomes a more **integrated, full-featured TypeScript stack**. We get end-to-end type safety (from request validation to client calls) and modern DX features.

_However, remember our mantra: keep it approachable._ Introduce these features gradually, and ensure the team is onboard and comfortable. For example, demonstrate how the type-safe client prevents a bug, or how Zod catches an invalid payload. Once the team sees the benefit, these patterns will become second nature.

---

## Step 6: Testing the Hono Implementation with Vitest

Testing is critical to ensure our migration hasn’t changed behavior or introduced regressions. We will continue using **Vitest** (a Vite-compatible test runner similar to Jest) to test both the **HTTP routes** and the **event-sourcing logic**.

**6.1 Update Existing Tests:** If the project had tests targeting the Express API (e.g., using Supertest or sending HTTP requests to a running server), we can replace those with tests against the Hono app:

- Hono provides a built-in way to simulate requests **without spinning up a server**. We can call `await app.request(url, options)` in a test to get a `Response` object ([Testing - Hono](https://hono.dev/docs/guides/testing#:~:text=describe%28%27Example%27%2C%20%28%29%20%3D,)) ([Testing - Hono](https://hono.dev/docs/guides/testing#:~:text=const%20res%20%3D%20await%20app,toBe%28%27Many%20posts%27%29)). This works similarly to fetch.
- Example with Vitest:

  ```ts
  import { app } from '../server'; // import our Hono app
  import { describe, it, expect } from 'vitest';

  describe('POST /clients/:clientId/cart/items', () => {
    it('adds an item to the cart', async () => {
      const res = await app.request('/clients/123/cart/items', {
        method: 'POST',
        body: JSON.stringify({ productId: 'abc', quantity: 2 }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(204);
    });
    it('validates input', async () => {
      // Missing productId
      const res = await app.request('/clients/123/cart/items', {
        method: 'POST',
        body: JSON.stringify({ quantity: 2 }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
      const error = await res.json();
      // The error will contain Zod issues, e.g., message about missing productId
      expect(error).toHaveProperty('issues');
    });
  });
  ```

  This uses `app.request()` which is provided by Hono for testing ([Testing - Hono](https://hono.dev/docs/guides/testing#:~:text=Request%20and%20Response)). We include the `Content-Type: application/json` header because Hono’s JSON validator requires it ([Validation - Hono](https://hono.dev/docs/guides/validation#:~:text=WARNING)) ([Validation - Hono](https://hono.dev/docs/guides/validation#:~:text=%2F%2F%20%E2%9D%8C%20this%20will%20not,log%28data%29%20%2F%2F%20undefined)). In tests, forgetting the header can lead to the body not being parsed (Hono prints a warning if so).

- If tests were using an actual server (integration tests), we can still do that by running Bun’s server in the background, but using `app.request` is faster and runs in-memory. It’s akin to Supertest but built-in. The response is a `Response` web API object, so use `await res.json()` or `await res.text()` to get the body.

**6.2 Test Event Sourcing Logic Separately:** Since the team is new to Event Sourcing, it’s good to have tests for the Emmett deciders and projections as well:

- Test the **decider functions** (the pure functions like `addProductItem(state, command) -> newEvent`). Emmett likely provides utilities to apply a series of events to an initial state (the `evolve` function) and test outcomes ([Testing Event Sourcing, Emmett edition - Event-Driven.io](https://event-driven.io/en/testing_event_sourcing_emmett_edition/#:~:text=Testing%20Event%20Sourcing%2C%20Emmett%20edition,an%20event%20as%20a%20result)). We should continue or add unit tests for these to ensure the business rules still hold.
- Test the **CommandHandler** behavior for edge cases (e.g., adding duplicate items, removing item not in cart, etc.). Emmett’s design encourages this separation of concerns, so leverage it. These tests don’t involve Hono at all, but give confidence that our integration hasn’t changed the underlying logic.

**6.3 Set Up Error Handling in Tests:** We should also test our **error-handling middleware**. Let’s add a global error handler to Hono now that all routes are set:

```ts
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal Server Error' }, 500);
});
```

This ensures that if any route throws an exception we didn’t catch (for example, an unexpected failure in `handle`), the server won’t crash – the error is logged and a 500 is returned ([Error handling middleware - Mastering Hono: Building Modern Web Applications | StudyRaid](https://app.studyraid.com/en/read/11303/352723/error-handling-middleware#:~:text=typescript)) ([Error handling middleware - Mastering Hono: Building Modern Web Applications | StudyRaid](https://app.studyraid.com/en/read/11303/352723/error-handling-middleware#:~:text=app.onError%28%28err%2C%20c%29%20%3D,500%29%3B)). We can simulate an error in tests (maybe by forcing `handle` to throw) and verify we get a 500 with our JSON error.

Vitest can run in Node or Bun; since we are using Bun, you can run tests with `bun test` (Vitest should detect and run them). If deploying to Cloudflare, note that Cloudflare has guidance to use a special pool worker for Vitest ([Testing - Hono](https://hono.dev/docs/guides/testing#:~:text=TIP)), but since we’re testing via Hono directly, we likely don’t need that complexity for now.

Run the full test suite. All tests that passed with Express should pass with Hono. Where there are differences (e.g., error message text, or perhaps slightly different JSON output for errors), update expectations accordingly _if_ the new behavior is acceptable. Our aim is functional parity or improvement (e.g., more consistent error responses).

Finally, ensure code coverage is satisfactory and that we have tests for any new functionality (like validation logic).

---

## Step 7: Decommission Express and Review Upstream Sync

With Hono fully handling the web layer and tests green, we can **remove Express** from the project:

- Uninstall Express and the Emmett Express adapter: `bun remove express @event-driven-io/emmett-expressjs` (and any related middleware packages).
- Remove any code that referenced `Router` or Express types. The codebase should now primarily use Hono’s `app` and `c.req`/`c` in handlers.
- Adjust your project’s start script if needed – ensure it runs the Bun/Hono server (if you had something like `node app.js` before, it might become just `bun run server.ts` or similar).

Before merging these changes, conduct a **final review** focusing on:

- **Developer Experience:** Is the code easy to follow? Perhaps walk a team member through adding a new route in Hono to see if they find it intuitive. (Likely they will, since it’s similar to Express but with some added Zod structure.)
- **Documentation:** Update internal docs (README or code comments) to explain how to add routes, how validation is done, how to run tests, etc. For example, document the pattern of using `zValidator` and remind about content-type in tests.
- **Performance:** Although Hono is fast by default, double-check if any parts need tuning (for example, if using large JSON bodies frequently, consider using Hono’s body limit middleware to guard against huge payloads ([Hono Stacks - Hono](https://hono.dev/docs/concepts/stacks#:~:text=Bearer%20Authentication))).

**Staying in Sync with Emmett:** Since Emmett is still the backbone of our domain logic, keep an eye on its releases:

- Subscribe to Emmett’s repository for updates. New versions might bring improvements or changes in the API. Since we removed the Express adapter, most changes in that package won’t affect us, but core Emmett updates (event store behavior, bug fixes in CommandHandler, etc.) should be pulled in.
- If Emmett introduces a more framework-agnostic way to integrate HTTP (or even a Hono adapter), evaluate if switching to that makes sense. Our current solution is custom but straightforward – essentially, we’re just calling Emmett’s `handle` inside Hono handlers. This is unlikely to break with updates, but if Emmett added, say, an official function to generate a Hono route, we could consider using it.
- Ensure our use of Emmett’s API is aligned with its best practices. For example, if Emmett expects certain error handling (like throwing a specific exception on concurrency conflict), make sure our Hono error middleware catches and converts it properly (perhaps returning 409 Conflict with a meaningful message, instead of a generic 500).

**Maintaining Type Safety:** We should also sync our TypeScript types with Emmett’s types:

- Emmett likely provides TypeScript interfaces/types for events, state, and commands. Continue to use those in our code (`AddProductItemToShoppingCart`, etc. as seen). If Emmett updates those types, update our usage.
- If any TypeScript issues arise (for example, `c.req.valid('json')` not inferring as expected due to how Hono’s generics work), address them promptly. We might need to adjust how we export `AppType` for the client generation (as noted, using `typeof app` vs. capturing routes).

Finally, celebrate the completion of the migration! We now have a codebase that is:

- **Express-free and Hono-native**, leveraging a web framework that is fast and ready for serverless/edge deployment.
- **Safer and clearer**, thanks to Zod validation and better typing. The team can trust that incoming data meets certain criteria (reducing defensive checks in business logic).
- **Developer-friendly**, since Hono’s API is simple and the project structure is clean (no more mixing of Express and Emmett glue code). New developers can quickly grasp how to add an endpoint.
- **Still powered by Emmett**, meaning all the event sourcing goodness (auditability, event log, projections, etc.) remains intact. We’ve just swapped the interface layer.

## Conclusion

By following this plan step-by-step – setting up Hono, porting routes, adding Zod validation, enhancing with advanced patterns, and testing thoroughly – we accomplish a non-trivial migration in a structured way. The end result is an **opinionated, modern stack** that aligns with best practices from the TypeScript community and the capabilities of Bun and Cloudflare. We avoided the traps of over-engineering types or patterns, focusing instead on **pragmatic improvements** that make the code more robust and maintainable.

Going forward, developers should find it easier to work on this project:

- Adding a new API endpoint involves writing a few lines with a clear structure (define schema → use `c.req.valid()` → call Emmett handler → return response).
- There’s less room for error thanks to type checking across the stack.
- Running tests (with Vitest) is fast and convenient with Hono’s in-memory request simulation ([Testing - Hono](https://hono.dev/docs/guides/testing#:~:text=describe%28%27Example%27%2C%20%28%29%20%3D,)), encouraging a test-driven approach for new features.
- Deployments to production or to Cloudflare Workers require little to no changes – the app is already using the right abstractions.

In sum, we have **fully embraced Hono** and in doing so, leveled up our project’s architecture while keeping its heart (the Emmett event-sourcing core) strong. 🎉

**Sources:**

- Hono – “fast, lightweight web framework that runs anywhere JavaScript does” ([The story of web framework Hono, from the creator of Hono](https://blog.cloudflare.com/th-th/the-story-of-web-framework-hono-from-the-creator-of-hono/#:~:text=Hono%20is%20a%20fast%2C%20lightweight,it%20runs%20on%20Cloudflare%20Workers)), designed with Web Standards for broad runtime support (Cloudflare, Deno, Bun, Node) ([The story of web framework Hono, from the creator of Hono](https://blog.cloudflare.com/th-th/the-story-of-web-framework-hono-from-the-creator-of-hono/#:~:text=Hono%20truly%20runs%20anywhere%20%E2%80%94,each%20runtime%20supports%20Web%20Standards)).
- Emmett – event-sourcing framework for Node.js ([Emmett - a Node.js library taking your event-driven ... - GitHub](https://github.com/event-driven-io/emmett#:~:text=Emmett%20,It)), originally paired with Express (Express.js helpers provided out-of-the-box) ([Getting Started | Emmett](https://event-driven-io.github.io/emmett/getting-started.html#:~:text=Yes%2C%20Emmett%20provides%20more%20built,add%20problem%20details%2C%20information%2C%20etc)).
- Hono usage examples: Accessing path params ([HonoRequest - Hono](https://hono.dev/docs/api/request#:~:text=)) and query params ([HonoRequest - Hono](https://hono.dev/docs/api/request#:~:text=%29%20%3D)) via context, parsing JSON bodies ([HonoRequest - Hono](https://hono.dev/docs/api/request#:~:text=json)), and sending JSON responses ([Setting response headers and status codes - Mastering Hono: Building Modern Web Applications | StudyRaid](https://app.studyraid.com/en/read/11303/352719/setting-response-headers-and-status-codes#:~:text=typescript)) ([Setting response headers and status codes - Mastering Hono: Building Modern Web Applications | StudyRaid](https://app.studyraid.com/en/read/11303/352719/setting-response-headers-and-status-codes#:~:text=return%20c.json%28,)).
- Hono + Zod validation: Using `zValidator` middleware for query params ([Hono Stacks - Hono](https://hono.dev/docs/concepts/stacks#:~:text=app.get%28%20%27%2Fhello%27%2C%20zValidator%28%20%27query%27%2C%20z.object%28,)) and extracting validated data in handlers ([Hono Stacks - Hono](https://hono.dev/docs/concepts/stacks#:~:text=%28c%29%20%3D,name%7D%60%2C%20%7D%29%20%7D)).
- Hono testing utilities: Simulating requests with `app.request()` ([Testing - Hono](https://hono.dev/docs/guides/testing#:~:text=describe%28%27Example%27%2C%20%28%29%20%3D,)) to assert responses in Vitest.

---

So that we're doing things the Hono way? Does that make sense?
