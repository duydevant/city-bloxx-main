export class ValidationError extends Error {
  readonly detail: unknown[];

  constructor(message?: string, details?: unknown[]) {
    super(message);
    this.name = 'ValidationError';
    this.detail = details;
  }
}
