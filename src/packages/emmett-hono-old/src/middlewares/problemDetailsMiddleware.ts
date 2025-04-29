import {
  ConcurrencyError,
  IllegalStateError,
  NotFoundError,
  ValidationError,
} from '@event-driven-io/emmett';
import type { Context, ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { StatusCode } from 'hono/utils/http-status';
import { ProblemDocument } from 'http-problem-details';
import { sendProblem } from '../responses';

/**
 * Defines the function signature for mapping an Error to an RFC 7807 Problem Document.
 */
export type ErrorToProblemDetailsMapping = (
  error: Error,
  c: Context,
) => ProblemDocument | undefined;

/**
 * Default error mapper function. Handles HTTPException, common Emmett errors, and generic errors.
 * @param error The error object.
 * @param _c The Hono context (unused in default implementation but available for custom mappers).
 * @returns A ProblemDocument instance.
 */
export const defaultErrorMapper = (
  error: Error,
  _c: Context,
): ProblemDocument => {
  // Handle Hono's HTTPException directly
  if (error instanceof HTTPException) {
    return new ProblemDocument({
      title: error.message || 'HTTP Error',
      status: error.status,
      // Additional properties from the HTTPException if available
    });
  }

  // Handle specific Emmett errors
  if (error instanceof ConcurrencyError) {
    return new ProblemDocument({
      title: 'Precondition Failed',
      status: 412,
      detail: error.message,
    });
  }

  if (error instanceof IllegalStateError) {
    return new ProblemDocument({
      title: 'Forbidden',
      status: 403,
      detail: error.message,
    });
  }

  if (error instanceof NotFoundError) {
    return new ProblemDocument({
      title: 'Not Found',
      status: 404,
      detail: error.message,
    });
  }

  if (error instanceof ValidationError) {
    return new ProblemDocument({
      title: 'Bad Request',
      status: 400,
      detail: error.message,
    });
  }

  // Handle generic errors
  console.error('Unhandled error:', error);
  return new ProblemDocument({
    title: 'Internal Server Error',
    status: 500,
    detail: error.message ?? 'An unexpected error occurred.',
  });
};

/**
 * Creates a Hono ErrorHandler that formats errors as RFC 7807 Problem Details.
 *
 * @param mapError - Optional custom function to map errors to ProblemDocument. Defaults to `defaultErrorMapper`.
 * @returns A Hono ErrorHandler function.
 */
export const problemDetailsHandler = (
  mapError: ErrorToProblemDetailsMapping = defaultErrorMapper,
): ErrorHandler => {
  return (error: Error, c: Context): Response => {
    const problem = mapError(error, c) ?? defaultErrorMapper(error, c); // Fallback to default mapper

    // Ensure status is a valid Hono StatusCode if possible, otherwise use the number
    const statusCode = (problem.status ?? 500) as StatusCode;

    return sendProblem(c, statusCode, { problem });
  };
};
