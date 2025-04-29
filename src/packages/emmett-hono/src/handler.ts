import type { Context, Handler } from 'hono';
import {
  send,
  sendAccepted,
  sendCreated,
  sendNoContent,
  sendProblem,
  type AcceptedHttpResponseOptions,
  type CreatedHttpResponseOptions,
  type HttpProblemResponseOptions,
  type HttpResponseOptions,
  type NoContentHttpResponseOptions,
} from './responses'; // Import our response sending logic

/**
 * Defines the expected return type for handlers wrapped by `on`.
 * It must be a Response object or a Promise resolving to one.
 */
export type EmmettHonoResponse = Response | Promise<Response>;

/**
 * Defines the function signature for an Emmett-Hono handler.
 * It receives the Hono Context and should return an EmmettHonoResponse.
 */
export type EmmettHonoHandler = (c: Context) => EmmettHonoResponse;

/**
 * Wraps an EmmettHonoHandler to be compatible with Hono's Handler type.
 * Ensures that the handler logic focuses on returning a Response object,
 * potentially using the provided response helpers (OK, Created, etc.).
 *
 * @param handle - The EmmettHonoHandler function to wrap.
 * @returns A Hono Handler function.
 */
export const on =
  (handle: EmmettHonoHandler): Handler =>
  (c: Context): Response | Promise<Response> => {
    // Directly call the Emmett handler and return its Response or Promise<Response>
    return handle(c);
  };

// Response Helper Functions (using the send* functions from responses.ts)

/**
 * Creates a 200 OK response.
 * @param options - Optional response configuration.
 * @returns A function that takes Hono Context and returns a Response.
 */
export const OK =
  (options?: HttpResponseOptions): EmmettHonoHandler =>
  (c: Context) => {
    return send(c, 200, options);
  };

/**
 * Creates a 201 Created response.
 * @param options - Configuration for the created response (createdId or url).
 * @returns A function that takes Hono Context and returns a Response.
 */
export const Created =
  (options: CreatedHttpResponseOptions): EmmettHonoHandler =>
  (c: Context) => {
    return sendCreated(c, options);
  };

/**
 * Creates a 202 Accepted response.
 * @param options - Configuration for the accepted response (location).
 * @returns A function that takes Hono Context and returns a Response.
 */
export const Accepted =
  (options: AcceptedHttpResponseOptions): EmmettHonoHandler =>
  (c: Context) => {
    return sendAccepted(c, options);
  };

/**
 * Creates a 204 No Content response.
 * @param options - Optional response configuration (e.g., ETag, Location).
 * @returns A function that takes Hono Context and returns a Response.
 */
export const NoContent =
  (options?: NoContentHttpResponseOptions): EmmettHonoHandler =>
  (c: Context) => {
    return sendNoContent(c, options);
  };

/**
 * Creates a generic HTTP response with a specific status code.
 * @param statusCode - The HTTP status code.
 * @param options - Optional response configuration.
 * @returns A function that takes Hono Context and returns a Response.
 */
export const HttpResponse =
  (statusCode: number, options?: HttpResponseOptions): EmmettHonoHandler =>
  (c: Context) => {
    // Cast statusCode as Hono might require specific types in `send`
    return send(c, statusCode as any, options);
  };

// Error Response Helper Functions

/**
 * Creates a 400 Bad Request Problem Details response.
 * @param options - Optional problem details configuration.
 * @returns A function that takes Hono Context and returns a Response.
 */
export const BadRequest = (
  options?: HttpProblemResponseOptions,
): EmmettHonoHandler => HttpProblem(400, options);

/**
 * Creates a 403 Forbidden Problem Details response.
 * @param options - Optional problem details configuration.
 * @returns A function that takes Hono Context and returns a Response.
 */
export const Forbidden = (
  options?: HttpProblemResponseOptions,
): EmmettHonoHandler => HttpProblem(403, options);

/**
 * Creates a 404 Not Found Problem Details response.
 * @param options - Optional problem details configuration.
 * @returns A function that takes Hono Context and returns a Response.
 */
export const NotFound = (
  options?: HttpProblemResponseOptions,
): EmmettHonoHandler => HttpProblem(404, options);

/**
 * Creates a 409 Conflict Problem Details response.
 * @param options - Optional problem details configuration.
 * @returns A function that takes Hono Context and returns a Response.
 */
export const Conflict = (
  options?: HttpProblemResponseOptions,
): EmmettHonoHandler => HttpProblem(409, options);

/**
 * Creates a 412 Precondition Failed Problem Details response.
 * @param options - Problem details configuration.
 * @returns A function that takes Hono Context and returns a Response.
 */
export const PreconditionFailed = (
  options: HttpProblemResponseOptions,
): EmmettHonoHandler => HttpProblem(412, options);

/**
 * Creates an RFC 7807 Problem Details response with a specific status code.
 * @param statusCode - The HTTP status code.
 * @param options - Optional problem details configuration.
 * @returns A function that takes Hono Context and returns a Response.
 */
export const HttpProblem =
  (
    statusCode: number,
    options?: HttpProblemResponseOptions,
  ): EmmettHonoHandler =>
  (c: Context) => {
    // Cast statusCode as Hono might require specific types in `sendProblem`
    return sendProblem(c, statusCode as any, options);
  };
