/**
 * Shared typed errors for Polyweb server code.
 *
 * Convention: every failure that a caller may want to handle is a
 * `Data.TaggedError`. Unexpected defects (bugs) stay as defects (`Effect.die`).
 * HTTP adapters map tags → status codes in `./http.ts`.
 */
import { Data } from 'effect';

export class DbError extends Data.TaggedError('DbError')<{
  readonly operation: string;
  readonly cause: unknown;
}> {
  override get message() {
    return `Database error during ${this.operation}`;
  }
}

export class NotFoundError extends Data.TaggedError('NotFoundError')<{
  readonly entity: string;
  readonly id?: string;
}> {
  override get message() {
    return `${this.entity} not found${this.id ? `: ${this.id}` : ''}`;
  }
}

export interface FieldIssue {
  readonly path: string;
  readonly message: string;
}

export class ValidationError extends Data.TaggedError('ValidationError')<{
  readonly issues: ReadonlyArray<FieldIssue>;
}> {
  override get message() {
    return this.issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join('; ') || 'Invalid input';
  }
}

export class UnauthorizedError extends Data.TaggedError('UnauthorizedError')<{
  readonly reason: string;
}> {}

export class ForbiddenError extends Data.TaggedError('ForbiddenError')<{
  readonly reason: string;
}> {}

export class ConflictError extends Data.TaggedError('ConflictError')<{
  readonly reason: string;
}> {}

export class RateLimitedError extends Data.TaggedError('RateLimitedError')<{
  readonly retryAfterSeconds: number;
}> {}

export class UpstreamError extends Data.TaggedError('UpstreamError')<{
  readonly service: string;
  readonly status?: number;
  readonly cause?: unknown;
}> {
  override get message() {
    return `Upstream ${this.service} failed${this.status ? ` (HTTP ${this.status})` : ''}`;
  }
}

export class ConfigError extends Data.TaggedError('ConfigError')<{
  readonly key: string;
  readonly reason: string;
}> {
  override get message() {
    return `Invalid configuration ${this.key}: ${this.reason}`;
  }
}

export type AppError =
  | DbError
  | NotFoundError
  | ValidationError
  | UnauthorizedError
  | ForbiddenError
  | ConflictError
  | RateLimitedError
  | UpstreamError
  | ConfigError;
