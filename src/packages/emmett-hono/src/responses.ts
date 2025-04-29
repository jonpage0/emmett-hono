import type { Context } from 'hono';
import type { ContentfulStatusCode, StatusCode } from 'hono/utils/http-status';
import { ProblemDocument } from 'http-problem-details';
import type { ETag } from './etag'; // Placeholder import
import { setETag } from './etag'; // Placeholder import

// General options for standard HTTP responses
export type HttpResponseOptions = {
  body?: unknown;
  location?: string;
  eTag?: ETag;
};
export const DefaultHttpResponseOptions: HttpResponseOptions = {};

// Options specific to Problem Details responses (RFC 7807)
export type HttpProblemResponseOptions = {
  location?: string;
  eTag?: ETag;
} & Omit<HttpResponseOptions, 'body'> &
  (
    | {
        problem: ProblemDocument;
      }
    | { problemDetails: string }
  );
export const DefaultHttpProblemResponseOptions: HttpProblemResponseOptions = {
  problemDetails: 'Error occurred!',
};

// Options for 201 Created responses
export type CreatedHttpResponseOptions = (
  | {
      createdId: string;
    }
  | {
      createdId?: string;
      url: string;
    }
) &
  HttpResponseOptions;

// Options for 202 Accepted responses
export type AcceptedHttpResponseOptions = {
  location: string;
} & HttpResponseOptions;

// Options for 204 No Content responses
export type NoContentHttpResponseOptions = Omit<HttpResponseOptions, 'body'>;

// Helper type for Hono headers
// Use a standard Record type for headers passed to Hono helpers
type HonoHeaders = Record<string, string | string[]> | Headers;

/**
 * Sends a standard HTTP response using the Hono context.
 * Adapts the response based on the body type and options provided.
 *
 * @param c - The Hono context object.
 * @param statusCode - The HTTP status code (must be a valid Hono StatusCode).
 * @param options - Optional response configuration (body, headers).
 * @returns A Response object.
 */
export const send = (
  c: Context,
  statusCode: StatusCode,
  options?: HttpResponseOptions,
): Response => {
  const { location, body, eTag } = options ?? DefaultHttpResponseOptions;
  const headers: Record<string, string> = {}; // Use simple Record for headers object

  // Set Headers
  if (eTag) setETag(c, eTag); // Assume this modifies c.res or we handle it differently
  if (location) headers['Location'] = location;
  if (eTag) headers['ETag'] = eTag; // Add ETag to headers object

  // Use ContentfulStatusCode type where Hono expects it
  const contentfulStatusCode = statusCode as ContentfulStatusCode;

  if (body !== undefined && body !== null) {
    // If body is already a Response, handle headers carefully
    if (body instanceof Response) {
      const responseHeaders = new Headers(body.headers);
      // Ensure value is string for Headers.set
      Object.entries(headers).forEach(([key, value]) => {
        if (typeof value === 'string') {
          responseHeaders.set(key, value);
        }
        // Note: Headers standard doesn't directly support string arrays,
        // usually requires multiple 'append' calls or comma-separated string.
        // For simplicity here, we'll assume single string values for now.
      });
      // Return new Response as original might be immutable or lack status setting method
      return new Response(body.body, {
        status: statusCode,
        headers: responseHeaders,
      });
    }
    // For other body types, use Hono's helpers with the HeaderRecord overload
    if (typeof body === 'object') {
      // Ensure status code is contentful for c.json
      if (statusCode >= 200 && statusCode !== 204 && statusCode !== 304) {
        return c.json(body, contentfulStatusCode, headers);
      } else {
        // Fallback for non-contentful status codes with object body (might be unusual)
        return new Response(JSON.stringify(body), {
          status: statusCode,
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
      }
    } else {
      // Ensure status code is contentful for c.text
      if (statusCode >= 200 && statusCode !== 204 && statusCode !== 304) {
        return c.text(body.toString(), contentfulStatusCode, headers);
      } else {
        // Fallback for non-contentful status codes with text body
        return new Response(body.toString(), { status: statusCode, headers });
      }
    }
  } else {
    // For responses without a body (like 204)
    // Use new Response directly as c.body(null, ...) is problematic
    return new Response(null, { status: statusCode, headers });
  }
};

/**
 * Sends a 201 Created response.
 */
export const sendCreated = (
  c: Context,
  options: CreatedHttpResponseOptions,
): Response => {
  // Created ID response should contain a body with the ID
  const body = 'createdId' in options ? { id: options.createdId } : undefined;

  // Create a new response with the appropriate body and status
  if (body) {
    const resp = c.json(body, 201);

    // Add/preserve the location header
    const existingLocation =
      c.req.header('location') || c.res.headers.get('location');
    if (existingLocation) {
      resp.headers.set('location', existingLocation);
    } else if ('url' in options) {
      resp.headers.set('location', options.url);
    } else if ('createdId' in options) {
      const url = `${c.req.url.endsWith('/') ? c.req.url : c.req.url + '/'}${options.createdId}`;
      resp.headers.set('location', url);
    }

    return resp;
  } else {
    // Handle case without a body (just URL)
    const resp = new Response(null, { status: 201 });

    // Set location header
    if ('url' in options) {
      resp.headers.set('location', options.url);
    }

    return resp;
  }
};

/**
 * Sends a 202 Accepted response.
 */
export const sendAccepted = (
  c: Context,
  options: AcceptedHttpResponseOptions,
): Response => {
  // 202 is a ContentfulStatusCode
  return send(c, 202, options);
};

/**
 * Sends a 204 No Content response.
 */
export const sendNoContent = (
  c: Context,
  options?: NoContentHttpResponseOptions,
): Response => {
  // 204 is NOT a ContentfulStatusCode, use new Response directly
  const headers: Record<string, string> = {};
  if (options?.eTag) headers['ETag'] = options.eTag;
  if (options?.location) headers['Location'] = options.location; // Though unusual for 204

  return new Response(null, { status: 204, headers });
};

/**
 * Sends an RFC 7807 Problem Details response.
 */
export const sendProblem = (
  c: Context,
  statusCode: StatusCode, // Keep general StatusCode here, check below
  options?: HttpProblemResponseOptions,
): Response => {
  options = options ?? DefaultHttpProblemResponseOptions;
  const { location, eTag } = options;

  const problemDetails =
    'problem' in options
      ? options.problem
      : new ProblemDocument({
          detail: options.problemDetails,
          status: statusCode,
        });

  const headers: Record<string, string> = {
    'Content-Type': 'application/problem+json',
  };

  // Set Headers
  if (eTag) setETag(c, eTag); // Placeholder usage
  if (location) headers['Location'] = location;
  if (eTag) headers['ETag'] = eTag;

  // Ensure status code is contentful for c.json
  if (statusCode >= 200 && statusCode !== 204 && statusCode !== 304) {
    return c.json(problemDetails, statusCode as ContentfulStatusCode, headers);
  } else {
    // Fallback for potentially non-contentful status codes (e.g., if mapping results in one)
    return new Response(JSON.stringify(problemDetails), {
      status: statusCode,
      headers,
    });
  }
};
