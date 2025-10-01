export class AppError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly causeError?: unknown;

  constructor(message: string, options?: { code?: string; status?: number; cause?: unknown }) {
    super(message);
    this.name = 'AppError';
    this.code = options?.code ?? 'APP_ERROR';
    this.status = options?.status ?? 400;
    this.causeError = options?.cause;

    if (options?.cause instanceof Error && options.cause.stack) {
      this.stack = `${this.stack}\nCaused by: ${options.cause.stack}`;
    }
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, { code: 'VALIDATION_ERROR', status: 400 });
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, { code: 'NOT_FOUND', status: 404 });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string) {
    super(message, { code: 'UNAUTHORIZED', status: 401 });
  }
}
