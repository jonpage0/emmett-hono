import { Hono } from 'hono';
import { cors } from 'hono/cors';

/**
 * Default CORS configuration for Emmett-Hono
 */
export interface CorsOptions {
  origin?: string | string[] | ((origin: string) => string | undefined | null);
  allowMethods?: string[];
  allowHeaders?: string[];
  exposeHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

/**
 * Default CORS options if not provided
 */
export const defaultCorsOptions = {
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowHeaders: ['Content-Type', 'Authorization', 'If-Match', 'Accept'],
  exposeHeaders: ['ETag', 'Location'],
  credentials: false,
  maxAge: 86400,
};

/**
 * Applies CORS middleware to the Hono app
 * @param app Hono app instance
 * @param options Optional CORS configuration
 */
export const applyCors = (app: Hono, options?: CorsOptions): void => {
  app.use(
    '*',
    cors({
      ...defaultCorsOptions,
      ...(options || {}),
    }),
  );
};
