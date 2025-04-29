// Main entry: export key functions, classes, and types for external usage.
export { getApplication } from './application';
// Removed exports for handler generators: on, OK, Created, Accepted, NoContent, HttpResponse,
// BadRequest, Forbidden, NotFound, Conflict, PreconditionFailed, HttpProblem

// Core Types and Error Handling
export { problemDetailsHandler } from './middlewares/problemDetails';
export { defaultErrorMapper, ProblemDocument } from './types';
export type {
  ApplicationOptions,
  ErrorToProblemDetailsMapping,
  ProblemDocument as ProblemDocumentType,
} from './types';

export {
  getETagFromIfMatch,
  getWeakETagValue,
  HeaderNames,
  isWeakETag,
  toWeakETag,
} from './types';
export type { ETag, WeakETag } from './types';

// Response Helper Functions
export {
  Legacy,
  sendAccepted,
  sendBadRequest,
  sendConflict,
  sendCreated,
  sendForbidden,
  sendNoContent,
  sendNotFound,
  sendOK,
  sendPreconditionFailed,
  sendProblem,
} from './responses';

// Response Option Types
export type {
  CreatedHttpResponseOptions,
  HttpProblemResponseOptions,
  HttpResponseOptions,
} from './responses'; // Correct path for these types
