/**
 * Domain/API error rendered as RFC 9457 "problem details" by the global error handler.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }

  static badRequest(message: string, extra?: Record<string, unknown>) {
    return new ApiError(400, 'VALIDATION_FAILED', message, extra);
  }
  static forbidden(message = 'You do not have access to this resource') {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'Resource not found') {
    return new ApiError(404, 'NOT_FOUND', message);
  }
  static conflict(message: string, extra?: Record<string, unknown>) {
    return new ApiError(409, 'VERSION_CONFLICT', message, extra);
  }
}
