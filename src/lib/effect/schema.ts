/**
 * Schema helpers: decode unknown input into typed values, failing with our
 * `ValidationError` (field-level issues) instead of the raw SchemaError.
 */
import { Effect, Schema, SchemaIssue } from 'effect';
import { ValidationError, type FieldIssue } from './errors';

const standardFormatter = SchemaIssue.makeFormatterStandardSchemaV1();

export function issuesOf(error: Schema.SchemaError): FieldIssue[] {
  const formatted = standardFormatter(error.issue);
  return formatted.issues.map((issue) => ({
    path: (issue.path ?? [])
      .map((p) => (typeof p === 'object' && p !== null && 'key' in p ? String(p.key) : String(p)))
      .join('.'),
    message: issue.message,
  }));
}

/** Decode `input` with `schema`; fails with ValidationError. */
export const decode =
  <S extends Schema.Decoder<unknown, never>>(schema: S) =>
  (input: unknown): Effect.Effect<S['Type'], ValidationError> =>
    Schema.decodeUnknownEffect(schema)(input, { errors: 'all', onExcessProperty: 'ignore' }).pipe(
      Effect.mapError((error) => new ValidationError({ issues: issuesOf(error) })),
    );

/** Read a FormData into a plain record (last value wins, files ignored). */
export function formDataToRecord(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

/** Parse a JSON request body; fails with ValidationError on malformed JSON. */
export const readJson = (request: Request): Effect.Effect<unknown, ValidationError> =>
  Effect.tryPromise({
    try: () => request.json() as Promise<unknown>,
    catch: () => new ValidationError({ issues: [{ path: '', message: 'Malformed JSON body' }] }),
  });

/** Common reusable schemas. */
export const Slug = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), Schema.isMaxLength(120)),
);
export const NonEmptyTrimmed = Schema.Trim.pipe(Schema.check(Schema.isMinLength(1)));
