import type { Context } from 'hono';

/**
 * Options for configuring the Emmett-Hono application.
 */
export interface ApplicationOptions {
  /** Array of functions to register API routes on the Hono app. */
  apis: Array<(app: import('hono').Hono) => void>;
  /** Enable built-in CORS middleware (defaults to false). */
  enableCors?: boolean;
  /** Options for CORS middleware (uses Hono's CORS). */
  corsOptions?: import('hono/cors').CorsOptions;
  /** Enable ETag middleware for response caching (defaults to false). */
  enableETag?: boolean;
  /** Options for ETag generation (e.g., weak or strong). */
  etagOptions?: { weak?: boolean };
  /** Enable request logging middleware (defaults to false). */
  enableLogger?: boolean;
  /** Options for logger middleware (e.g., custom logger function). */
  loggerOptions?: LoggerOptions;
  /**
   * Optional error-to-ProblemDetails mapping function.
   * If provided, errors will be converted to RFC 7807 Problem responses via this mapping.
   */
  mapError?: ErrorToProblemDetailsMapping;
  /** Disable the default Problem Details error handler (if true, errors propagate normally). */
  disableProblemDetails?: boolean;
}

/**
 * Defines a Problem Details document (RFC 7807).
 */
export class ProblemDocument {
  type: string;
  title: string;
  detail: string;
  status: number;
  instance?: string;
  [key: string]: unknown; // allow extra fields if needed

  constructor(params: {
    status: number;
    detail: string;
    title?: string;
    type?: string;
    instance?: string;
  }) {
    this.status = params.status;
    this.detail = params.detail;
    this.type = params.type ?? 'about:blank';
    // If title is not provided, use a generic title based on status code
    this.title = params.title ?? defaultTitleForStatus(params.status);
    if (params.instance) this.instance = params.instance;
  }
}

/** Provides a default human-readable title for common HTTP status codes. */
function defaultTitleForStatus(status: number): string {
  if (status === 400) return 'Bad Request';
  if (status === 403) return 'Forbidden';
  if (status === 404) return 'Not Found';
  if (status === 409) return 'Conflict';
  if (status === 412) return 'Precondition Failed';
  if (status === 500) return 'Internal Server Error';
  return 'Error';
}

/**
 * Mapping function type: map an Error to a ProblemDocument.
 * Return undefined to indicate the error is not specifically handled (and default mapping should apply).
 */
export type ErrorToProblemDetailsMapping = (
  error: unknown,
  c: Context,
) => ProblemDocument | undefined;

/** Default error mapping: converts any error to an HTTP 500 ProblemDocument with its message. */
export const defaultErrorMapper: ErrorToProblemDetailsMapping = (
  error: unknown,
) => {
  const message = error instanceof Error ? error.message : String(error);
  // Default to internal server error for unspecified errors
  return new ProblemDocument({
    status: 500,
    detail: message || 'Internal Server Error',
    title: 'Internal Server Error',
    type: 'about:blank',
  });
};

/**
 * Describes a valid ETag string (quoted string, possibly with W/ prefix for weak).
 */
export type ETag = string;

/**
 * Options for logging middleware.
 */
export interface LoggerOptions {
  /** Function to log the message (defaults to console.log). */
  logger?: (str: string) => void;
  /**
   * How to handle timing:
   * - 'all': log all requests and their durations.
   * - 'none': do not log requests.
   * (You could extend this to 'error-only' etc. as needed.)
   */
  timing?: 'all' | 'none';
  /**
   * Function to format log info into a string. Receives an object with method, url, status, time.
   */
  format?: (info: LogInfo) => string;
}

/** Information passed to the logger format function. */
export interface LogInfo {
  method: string;
  url: string;
  status: number;
  time: number; // in milliseconds
}
