import { Hono } from 'hono';
import { applyCors } from './middlewares/cors';
import { applyETag } from './middlewares/etag';
import { applyLogger } from './middlewares/logger';
import { problemDetailsHandler } from './middlewares/problemDetails';
import type { ApplicationOptions } from './types';

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
