import type { Hono } from 'hono';
import { cors } from 'hono/cors';

/**
 * Applies Cross-Origin Resource Sharing (CORS) middleware to a Hono app.
 * @param app - Hono application instance.
 * @param options - Optional CORS configuration (merged with defaults).
 */
export function applyCors(
  app: Hono,
  options?: Parameters<typeof cors>[0],
): void {
  app.use('*', cors(options));
}
