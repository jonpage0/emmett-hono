import type { Context, ErrorHandler } from 'hono';
import type { StatusCode } from 'hono/utils/http-status';
import { sendProblem } from '../responses';
import {
  defaultErrorMapper,
  type ErrorToProblemDetailsMapping,
} from '../types';

/**
 * Creates an error handler for Hono that converts errors to RFC 7807 Problem Details responses.
 * @param mapError - Mapping function from an error to a ProblemDocument (defaults to defaultErrorMapper).
 * @returns A Hono ErrorHandler function to be used with app.onError().
 */
export function problemDetailsHandler(
  mapError: ErrorToProblemDetailsMapping = defaultErrorMapper,
): ErrorHandler {
  return (err: unknown, c: Context) => {
    // Use mapping function to get a ProblemDocument. Fallback to default mapper if none returned.
    const problemDoc = (mapError(err, c) ?? defaultErrorMapper(err, c))!;

    const status = problemDoc.status || 500;
    // Send the ProblemDocument as a JSON response with appropriate content-type.
    return sendProblem(c, status as StatusCode, { problem: problemDoc });
  };
}
