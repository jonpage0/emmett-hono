/// <reference lib="webworker" />
import { type Brand } from '@event-driven-io/emmett';
import type { Context, HonoRequest } from 'hono';
import { cors } from 'hono/cors';

// Define CorsOptions using Parameters utility type
export type CorsOptions = Parameters<typeof cors>[0];

/**
 * Options for configuring the Emmett-Hono application.
 */
export interface ApplicationOptions {
  /** Array of functions to register API routes on the Hono app. */
  apis: Array<(app: import('hono').Hono) => void>;
  /** Enable built-in CORS middleware (defaults to false). */
  enableCors?: boolean;
  /** Options for CORS middleware (uses Hono's CORS). */
  corsOptions?: CorsOptions;
  /** Enable ETag middleware for response caching (defaults to false). */
  enableETag?: boolean;
  /** Options for ETag generation (uses Hono's etag middleware options). */
  etagOptions?: { weak?: boolean };
  /** Enable request logging middleware (defaults to false). */
  enableLogger?: boolean;
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
) => ProblemDocument | undefined | void;

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

//////////////////////////////////////
// ETAG Types and Helpers (Moved from middlewares/etag.ts)
//////////////////////////////////////

export const HeaderNames = {
  IF_MATCH: 'if-match',
  ETag: 'etag',
} as const;

export type WeakETag = Brand<`W/"${string}"`, 'ETag'>;
export type ETag = Brand<string, 'ETag'>;

const WeakETagRegex = /^W\/"(.*)"$/;

const WRONG_WEAK_ETAG_FORMAT = 'WRONG_WEAK_ETAG_FORMAT';

/**
 * Type guard to check if an ETag string is in the weak format (W/"...").
 * @internal
 */
export const isWeakETag = (
  etag: ETag | string | undefined,
): etag is WeakETag => {
  return typeof etag === 'string' && WeakETagRegex.test(etag);
};

/**
 * Extracts the raw value from a weak ETag string.
 * Throws an error if the format is incorrect.
 * @param etag A string validated to be a WeakETag.
 * @internal
 */
export const getWeakETagValue = (etag: WeakETag): string => {
  const result = WeakETagRegex.exec(etag as string);
  if (result === null || result.length < 2) {
    throw new Error(WRONG_WEAK_ETAG_FORMAT);
  }
  return result[1]!;
};

/**
 * Formats a value into an ETag string (weak by default).
 * @param value The value to format (e.g., version number).
 * @param strong If true, format as a strong ETag (e.g., "value"); defaults to false (weak ETag W/"value").
 * @internal
 */
export const toWeakETag = (
  value: number | bigint | string,
  strong?: boolean,
): ETag | WeakETag => {
  return strong ? (`"${value}"` as ETag) : (`W/"${value}"` as WeakETag);
};

/**
 * Gets the ETag value from the If-Match header of a Hono request.
 * Returns undefined if the header is missing.
 * @internal
 */
export const getETagFromIfMatch = (request: HonoRequest): ETag | undefined => {
  const etag = request.header(HeaderNames.IF_MATCH);
  return etag ? (etag as ETag) : undefined;
};
