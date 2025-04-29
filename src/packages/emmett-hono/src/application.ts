import { Hono } from 'hono';
// Import built-in middleware
import { cors } from 'hono/cors';
import { etag } from 'hono/etag';
import { logger } from 'hono/logger';
// Remove local middleware apply functions
// import { applyCors } from './middlewares/cors';
// import { applyETag } from './middlewares/etag';
// import { applyLogger } from './middlewares/logger';
import { problemDetailsHandler } from './middlewares/problemDetails';
import { sendNotFound } from './responses'; // Import sendNotFound
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
    // loggerOptions removed for now, use Hono's default logger
    mapError,
    disableProblemDetails = false,
  } = options;

  // Apply logger middleware first (to capture timing for all subsequent handlers)
  if (enableLogger) {
    // Use built-in logger
    app.use('*', logger());
  }
  // Apply CORS middleware if enabled
  if (enableCors) {
    // Use built-in cors
    app.use('*', cors(corsOptions));
  }
  // Apply ETag middleware if enabled
  if (enableETag) {
    // Reverted: Use provided etagOptions or Hono's default (strong)
    app.use('*', etag(etagOptions));
  }

  // Register all API routes
  for (const api of apis) {
    api(app);
  }

  // Add a specific handler for 404 Not Found errors
  app.notFound((c) => {
    return sendNotFound(c, {
      problemDetails: 'The requested resource was not found',
    });
  });

  // Global error handler: convert errors to Problem Details responses if not disabled
  if (!disableProblemDetails) {
    app.onError(problemDetailsHandler(mapError));
  }

  return app;
}
