import type { Context } from 'hono';
import type { StatusCode } from 'hono/utils/http-status';
import { ProblemDocument } from './types';
import type { Response } from 'express';

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
