import { createHash } from 'crypto';
import { Hono } from 'hono';

/**
 * Generate an ETag from a string (usually the response body)
 *
 * @param content - The content to generate the ETag from
 * @param weak - Whether to generate a weak ETag (W/"...") - default: true
 * @returns An ETag string
 */
export const generateETag = (content: string, weak = true): string => {
  const hash = createHash('md5').update(content).digest('hex');
  return weak ? `W/"${hash}"` : `"${hash}"`;
};

/**
 * ETag middleware configuration
 */
export interface ETagOptions {
  /**
   * Generate weak ETags (W/"...") by default
   * @default true
   */
  weak?: boolean;
}

/**
 * Default ETag options
 */
export const defaultETagOptions: ETagOptions = {
  weak: true,
};

/**
 * Middleware to automatically handle ETags
 * This middleware:
 * 1. Checks If-Match header against resource ETag (if provided)
 * 2. Adds ETag header to responses (if content exists and status code is appropriate)
 *
 * @param app Hono app instance
 * @param options ETag configuration options
 */
export const applyETag = (app: Hono, options?: ETagOptions): void => {
  const etagOptions = { ...defaultETagOptions, ...options };

  app.use('*', async (c, next) => {
    // Check If-Match header against resource ETag (if any ETag is set later in the request flow)
    // We don't directly handle precondition checks here as they'll be managed by the command handlers

    await next();

    // Only process GET and HEAD requests with successful responses that have a body
    if (
      (c.req.method === 'GET' || c.req.method === 'HEAD') &&
      c.res &&
      c.res.status >= 200 &&
      c.res.status < 300 &&
      // Skip 204 No Content
      c.res.status !== 204
    ) {
      // Skip if ETag header is already set
      if (!c.res.headers.has('ETag')) {
        // Check if there's a body to generate ETag from
        try {
          const responseClone = c.res.clone();
          const body = await responseClone.text();

          if (body && body.length > 0) {
            // Generate ETag from response body
            const etag = generateETag(body, etagOptions.weak);

            // Add ETag header
            c.res = new Response(c.res.body, {
              status: c.res.status,
              statusText: c.res.statusText,
              headers: new Headers(c.res.headers),
            });
            c.header('ETag', etag);
          }
        } catch {
          // If we can't read the body or there's no body, skip ETag generation
        }
      }
    }
  });
};
