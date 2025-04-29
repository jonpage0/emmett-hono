import { type Brand } from '@event-driven-io/emmett';
import type { HonoRequest } from 'hono';

//////////////////////////////////////
/// ETAG Types and Helpers
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
 */
export const getWeakETagValue = (etag: WeakETag): string => {
  const result = WeakETagRegex.exec(etag as string);
  if (result === null || result.length < 2) {
    throw new Error(WRONG_WEAK_ETAG_FORMAT);
  }
  return result[1]!;
};

/**
 * Formats a value into a weak ETag string.
 */
export const toWeakETag = (value: number | bigint | string): WeakETag => {
  return `W/"${value}"` as WeakETag;
};

/**
 * Gets the ETag value from the If-Match header of a Hono request.
 * Returns undefined if the header is missing.
 */
export const getETagFromIfMatch = (request: HonoRequest): ETag | undefined => {
  const etag = request.header(HeaderNames.IF_MATCH);
  return etag ? (etag as ETag) : undefined;
};
