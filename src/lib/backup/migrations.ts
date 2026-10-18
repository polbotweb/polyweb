import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Identifiants des migrations livrées avec le code (noms de fichiers .sql). */
export function knownMigrations(dir = join(process.cwd(), 'src/database/migrations')): string[] {
  return readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => f.replace(/\.sql$/, ''));
}
