/// <reference lib="webworker" />
import type { Context } from 'hono';
import type { ContentfulStatusCode, StatusCode } from 'hono/utils/http-status';
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

// Helper types for Legacy options to match old signatures where necessary
// (e.g., Problem Details used to be just a string)
type LegacyHttpProblemResponseOptions =
  | string // Just the problem detail string
  | HttpProblemResponseOptions; // Or the full options object

// Helper function to normalize legacy problem options
function normalizeLegacyProblemOptions(
  options?: LegacyHttpProblemResponseOptions,
): HttpProblemResponseOptions {
  if (typeof options === 'string') {
    return { problemDetails: options };
  }
  return options ?? {};
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

  const response = bodyContent ? c.json(bodyContent, 201) : c.body(null, 201);

  // Set Location header:
  if ('url' in options && options.url) {
    response.headers.set('Location', options.url);
  } else if ('createdId' in options && options.createdId) {
    // If URL not explicitly given, derive from request URL and createdId
    const baseUrl = c.req.url;
    const separator = baseUrl.endsWith('/') ? '' : '/';
    response.headers.set('Location', baseUrl + separator + options.createdId);
  }

  // Set ETag if provided
  if (options.eTag) {
    response.headers.set('ETag', options.eTag);
  }

  return response;
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
    // Cast statusCode to ContentfulStatusCode to satisfy c.json
    return c.json(problemDoc, statusCode as ContentfulStatusCode, headers);
  } else {
    // If a 204/304 with a problem (rare), just send JSON manually using Response
    // Ensure we use the global Response constructor
    return new Response(JSON.stringify(problemDoc), {
      status: statusCode,
      headers,
    });
  }
}

//////////////////////////////////////
// Simple Response Helpers (using Hono context methods)
//////////////////////////////////////

/** Sends a 200 OK response with optional JSON body and ETag. */
export function sendOK(c: Context, options?: HttpResponseOptions): Response {
  const response = options?.body
    ? c.json(options.body, 200)
    : c.body(null, 200);
  if (options?.eTag) response.headers.set('ETag', options.eTag);
  if (options?.location) response.headers.set('Location', options.location);
  return response;
}

/** Sends a 202 Accepted response with a required Location header. */
export function sendAccepted(
  c: Context,
  options: AcceptedHttpResponseOptions,
): Response {
  const response = options.body ? c.json(options.body, 202) : c.body(null, 202);
  response.headers.set('Location', options.location);
  if (options.eTag) response.headers.set('ETag', options.eTag);
  return response;
}

/** Sends a 204 No Content response with optional ETag and Location. */
export function sendNoContent(
  c: Context,
  options?: NoContentHttpResponseOptions,
): Response {
  const response = c.body(null, 204);
  if (options?.eTag) response.headers.set('ETag', options.eTag);
  if (options?.location) response.headers.set('Location', options.location);
  return response;
}

/** Sends a 400 Bad Request Problem Details response. */
export function sendBadRequest(
  c: Context,
  options?: HttpProblemResponseOptions,
): Response {
  return sendProblem(c, 400, options);
}

/** Sends a 403 Forbidden Problem Details response. */
export function sendForbidden(
  c: Context,
  options?: HttpProblemResponseOptions,
): Response {
  return sendProblem(c, 403, options);
}

/** Sends a 404 Not Found Problem Details response. */
export function sendNotFound(
  c: Context,
  options?: HttpProblemResponseOptions,
): Response {
  return sendProblem(c, 404, options);
}

/** Sends a 409 Conflict Problem Details response. */
export function sendConflict(
  c: Context,
  options?: HttpProblemResponseOptions,
): Response {
  return sendProblem(c, 409, options);
}

/** Sends a 412 Precondition Failed Problem Details response. */
export function sendPreconditionFailed(
  c: Context,
  options?: HttpProblemResponseOptions,
): Response {
  return sendProblem(c, 412, options);
}

//////////////////////////////////////
// Legacy Compatibility Shim (DEPRECATED - Use direct `send*` functions)
//////////////////////////////////////

/**
 * @deprecated Use direct `send*` functions (e.g., `sendOK`, `sendCreated`) instead.
 * Provides compatibility with the older Express-style response helpers.
 */
export const Legacy = {
  /** @deprecated Use `sendOK` */
  OK: (options?: HttpResponseOptions) => (c: Context) => sendOK(c, options),
  /** @deprecated Use `sendCreated` */
  Created: (options: CreatedHttpResponseOptions) => (c: Context) =>
    sendCreated(c, options),
  /** @deprecated Use `sendAccepted` */
  Accepted: (options: AcceptedHttpResponseOptions) => (c: Context) =>
    sendAccepted(c, options),
  /** @deprecated Use `sendNoContent` */
  NoContent: (options?: NoContentHttpResponseOptions) => (c: Context) =>
    sendNoContent(c, options),
  /** @deprecated Use `sendBadRequest` or `sendProblem` */
  BadRequest: (options?: LegacyHttpProblemResponseOptions) => (c: Context) =>
    sendBadRequest(c, normalizeLegacyProblemOptions(options)),
  /** @deprecated Use `sendForbidden` or `sendProblem` */
  Forbidden: (options?: LegacyHttpProblemResponseOptions) => (c: Context) =>
    sendForbidden(c, normalizeLegacyProblemOptions(options)),
  /** @deprecated Use `sendNotFound` or `sendProblem` */
  NotFound: (options?: LegacyHttpProblemResponseOptions) => (c: Context) =>
    sendNotFound(c, normalizeLegacyProblemOptions(options)),
  /** @deprecated Use `sendConflict` or `sendProblem` */
  Conflict: (options?: LegacyHttpProblemResponseOptions) => (c: Context) =>
    sendConflict(c, normalizeLegacyProblemOptions(options)),
  /** @deprecated Use `sendPreconditionFailed` or `sendProblem` */
  PreconditionFailed:
    (options?: LegacyHttpProblemResponseOptions) => (c: Context) =>
      sendPreconditionFailed(c, normalizeLegacyProblemOptions(options)),
  /** @deprecated Use `sendProblem` */
  HttpProblem:
    (statusCode: StatusCode, options?: LegacyHttpProblemResponseOptions) =>
    (c: Context) =>
      sendProblem(c, statusCode, normalizeLegacyProblemOptions(options)),
};
