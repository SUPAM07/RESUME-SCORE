export class AppError extends Error {
  constructor(public message: string, public statusCode: number, public code: string, public isOperational = true) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
export class NotFoundError extends AppError {
  constructor(msg = 'Resource not found') { super(msg, 404, 'NOT_FOUND'); }
}
export class AuthenticationError extends AppError {
  constructor(msg = 'Unauthorized') { super(msg, 401, 'AUTHENTICATION_ERROR'); }
}
export class AuthorizationError extends AppError {
  constructor(msg = 'Forbidden') { super(msg, 403, 'AUTHORIZATION_ERROR'); }
}
export class ValidationError extends AppError {
  constructor(msg: string) { super(msg, 400, 'VALIDATION_ERROR'); }
}
