import { Hono } from 'hono';
import { applyCors, type CorsOptions } from './middlewares/corsMiddleware';
import { applyETag, type ETagOptions } from './middlewares/etagMiddleware';
import {
  applyLogger,
  type LoggerOptions,
} from './middlewares/loggerMiddleware';
import type { WebApiSetup } from './types';
// Import Problem Details types later when middleware is added
// import type { ErrorToProblemDetailsMapping } from './responses';

// Options for configuring the Hono application
export type ApplicationOptions = {
  apis: WebApiSetup[];
  enableCors?: boolean;
  corsOptions?: CorsOptions;
  enableETag?: boolean;
  etagOptions?: ETagOptions;
  enableLogger?: boolean;
  loggerOptions?: LoggerOptions;
  // mapError?: ErrorToProblemDetailsMapping; // Add later for problem details
  // Add other Hono-specific options if needed, e.g., default middleware toggles
};

/**
 * Creates and configures a Hono application instance.
 *
 * @param options - Configuration options for the application.
 * @returns A configured Hono instance.
 */
export const getApplication = (options: ApplicationOptions): Hono => {
  const app = new Hono();

  const {
    apis,
    enableCors = false,
    corsOptions,
    enableETag = false,
    etagOptions,
    enableLogger = false,
    loggerOptions,
    // mapError, // Add later
  } = options;

  // Apply logger middleware first (if enabled) to capture timing accurately
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

  // Apply all provided API setups (route configurations)
  for (const api of apis) {
    api(app);
  }

  // Add problem details middleware later
  // if (!disableProblemDetailsMiddleware)
  //   app.onError(problemDetailsHandler(mapError));

  return app;
};

// Add startAPI function later if needed, similar to expressjs adapter,
// although Hono apps are typically run directly by the environment (e.g., Cloudflare Workers, Deno, Bun serve)
