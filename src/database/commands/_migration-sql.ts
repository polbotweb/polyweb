// Splits Drizzle-style SQL migration/infra files into executable statements.
//
// Drizzle Kit separates logical statement groups with a literal
// `--> statement-breakpoint` marker line. Naively splitting the remaining SQL
// on `;` is unsafe because PL/pgSQL blocks (DO $$ ... $$, CREATE FUNCTION ...
// AS $$ ... $$) contain their own internal semicolons — splitting inside one
// of those blocks sends Postgres an unterminated dollar-quoted fragment
// (42601 syntax error). This tokenizer only splits on semicolons that are not
// nested inside a dollar-quoted block, a quoted string/identifier, or a
// comment.

const BREAKPOINT_MARKER = '--> statement-breakpoint';

/** Postgres error codes meaning "this DDL object already exists" (safe to skip on idempotent re-run). */
export const DDL_ALREADY_EXISTS_CODES = new Set(['42P07', '42710', '42701']);

export function splitSqlStatements(sql: string): string[] {
  return sql
    .split(BREAKPOINT_MARKER)
    .flatMap(splitTopLevelStatements)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

const DOLLAR_TAG_RE = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/;

function splitTopLevelStatements(chunk: string): string[] {
  const statements: string[] = [];
  let current = '';
  let i = 0;
  const { length } = chunk;
  let dollarTag: string | null = null;

  while (i < length) {
    const ch = chunk[i];

    // Inside a dollar-quoted block ($$ ... $$ or $tag$ ... $tag$): only the matching close tag matters.
    if (dollarTag) {
      if (chunk.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
      } else {
        current += ch;
        i += 1;
      }
      continue;
    }

    // Quoted string/identifier: consume verbatim until the (possibly doubled) closing quote.
    if (ch === "'" || ch === '"') {
      const quote = ch;
      current += ch;
      i += 1;
      while (i < length) {
        current += chunk[i];
        if (chunk[i] === quote) {
          if (chunk[i + 1] === quote) {
            current += chunk[i + 1];
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    // Line comment: keep verbatim so a ';' in commented-out SQL is never treated as a split point.
    if (ch === '-' && chunk[i + 1] === '-') {
      const end = chunk.indexOf('\n', i);
      const slice = end === -1 ? chunk.slice(i) : chunk.slice(i, end + 1);
      current += slice;
      i += slice.length;
      continue;
    }

    // Block comment.
    if (ch === '/' && chunk[i + 1] === '*') {
      const end = chunk.indexOf('*/', i + 2);
      const slice = end === -1 ? chunk.slice(i) : chunk.slice(i, end + 2);
      current += slice;
      i += slice.length;
      continue;
    }

    if (ch === '$') {
      const match = DOLLAR_TAG_RE.exec(chunk.slice(i));
      if (match) {
        dollarTag = match[0];
        current += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }

    if (ch === ';') {
      current += ch;
      statements.push(current);
      current = '';
      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }

  if (current.trim()) statements.push(current);
  return statements;
}
