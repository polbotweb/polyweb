
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'fs';
import { c, logTarget } from './_utils';

const schemaDir = path.resolve(process.cwd(), 'src', 'database');
const schemaFile = path.resolve(schemaDir, 'schemas.ts');
const schemasFolder = path.resolve(schemaDir, 'schemas');

// ─── Validations ─────────────────────────────────────────────────────
function validateSchemaStructure(): void {
  if (!fs.existsSync(schemaDir)) {
    console.error(c.red(`[ERREUR] Dossier introuvable : ${schemaDir}`));
    process.exit(1);
  }
  if (!fs.existsSync(schemaFile)) {
    console.error(c.red(`[ERREUR] Fichier introuvable : ${schemaFile}`));
    process.exit(1);
  }
  if (!fs.existsSync(schemasFolder)) {
    console.error(c.red(`[ERREUR] Dossier de schémas introuvable : ${schemasFolder}`));
    process.exit(1);
  }
}

function getSchemaFiles(): string[] {
  return fs.readdirSync(schemasFolder).filter(f => f.endsWith('.ts') || f.endsWith('.js'));
}

function getNotImported(schemasFiles: string[]): string[] {
  const names = schemasFiles.map(f => f.replace(/\.(ts|js)$/, ''));
  const content = fs.readFileSync(schemaFile, 'utf8');
  return names.filter(name => !new RegExp(`['"\`]\\.\/schemas\\/${name}['"\`]`).test(content));
}

// ─── Interactive import helper ───────────────────────────────────────
async function promptAddImports(notImported: string[]): Promise<string[]> {
  const readline = await import('node:readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    console.log(c.yellow(`\n[INTERACTIF] Fichiers non importés dans schemas.ts :`));
    notImported.forEach((f, i) => console.log(`  [${i + 1}] ${f}.ts`));
    rl.question(`Ajouter des exports ? (ex: 1,2 ou Enter pour ignorer) : `, (answer) => {
      rl.close();
      const selected = answer.split(',')
        .map(s => parseInt(s.trim(), 10) - 1)
        .filter(i => i >= 0 && i < notImported.length);
      resolve(selected.map(i => notImported[i]));
    });
  });
}

async function maybeAddImports(notImported: string[]): Promise<void> {
  if (notImported.length === 0) return;
  const toAdd = await promptAddImports(notImported);
  if (toAdd.length === 0) {
    console.warn(c.yellow(`[AVERTISSEMENT] Fichiers non importés :`));
    notImported.forEach(f => console.warn(`  - ${f}.ts`));
    return;
  }
  let content = fs.readFileSync(schemaFile, 'utf8');
  content = content.replace(/^export \{\};?\s*$/gm, '');
  const toInsert = toAdd.map(f => `export * from './schemas/${f}';`).join('\n') + '\n';
  // Append after last export/import or at end
  const lines = content.split('\n');
  const lastExportIdx = lines.findLastIndex(l => l.startsWith('export ') || l.startsWith('import '));
  if (lastExportIdx >= 0) {
    lines.splice(lastExportIdx + 1, 0, toInsert);
  } else {
    lines.push(toInsert);
  }
  fs.writeFileSync(schemaFile, lines.join('\n'), 'utf8');
  console.log(c.green(`[OK] Exports ajoutés à schemas.ts :`));
  toAdd.forEach(f => console.log(`  - ${f}.ts`));
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: 'inherit', shell: true });
    proc.on('exit', (code) => {
      if (code === 0) resolve(); else reject(new Error(`${cmd} ${args.join(' ')} exited with ${code}`));
    });
    proc.on('error', reject);
  });
}

// ─── Main ────────────────────────────────────────────────────────────
(async () => {
  validateSchemaStructure();

  const schemasFiles = getSchemaFiles();
  if (schemasFiles.length === 0) {
    console.log(c.yellow('[INFO] Aucun fichier de schéma dans src/database/schemas/'));
    console.log(`  Créez un schéma, puis relancez : ${c.cyan('npm run db:generate')}`);
    process.exit(0);
  }

  const schemaContent = fs.readFileSync(schemaFile, 'utf8').trim();
  // Only check for non-comment content
  const hasExports = schemaContent.split('\n').some(l => l.trim() && !l.trim().startsWith('//'));
  if (!hasExports) {
    console.log(c.yellow('[INFO] schemas.ts ne contient aucun export.'));
    console.log(`  Les fichiers dans schemas/ doivent être exportés depuis schemas.ts`);
  }

  // UX: propose d'ajouter les imports manquants
  const notImported = getNotImported(schemasFiles);
  await maybeAddImports(notImported);

  // Ensure migrations/meta exists
  const migrationsMetaDir = path.resolve(process.cwd(), 'src', 'database', 'migrations', 'meta');
  const journalFile = path.join(migrationsMetaDir, '_journal.json');
  if (!fs.existsSync(migrationsMetaDir)) {
    fs.mkdirSync(migrationsMetaDir, { recursive: true });
  }
  if (!fs.existsSync(journalFile)) {
    fs.writeFileSync(journalFile, '{"entries":[]}', 'utf8');
    console.log(c.green('[OK] migrations/meta/_journal.json créé.'));
  }

  // Detect migrations before generation
  const migrationsDir = path.resolve(process.cwd(), 'src', 'database', 'migrations');
  const listSql = (dir: string) => fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.sql')) : [];
  const beforeSet = new Set(listSql(migrationsDir));

  // Single config file
  const configPath = path.resolve(process.cwd(), 'drizzle.config.ts');
  logTarget();
  console.log(c.cyan(`[génération] Config: ${configPath} (DB_ENV=${process.env.DB_ENV ?? 'LOCAL'})`));

  await run('npx', ['drizzle-kit', 'generate', '--config', configPath]);

  // Detect new migrations
  const afterSet = new Set(listSql(migrationsDir));
  const newMigrations = Array.from(afterSet).filter(f => !beforeSet.has(f));

  if (newMigrations.length > 0) {
    console.log(c.green(c.bold('\nMigrations générées :')));
    newMigrations.forEach(f => console.log(c.green(`  ➜ ${f}`)));
    console.log(`\nPour appliquer : ${c.cyan('npm run db:migrate')}\n`);
  } else {
    console.log(c.yellow('\nAucun changement de schéma détecté.'));
    console.log(`Éditez vos schémas dans ${c.cyan('src/database/schemas/')} puis relancez ${c.cyan('npm run db:generate')}`);
  }
})().catch((err) => {
  console.error(c.red('[génération] Échec :'), err);
  process.exit(1);
});




