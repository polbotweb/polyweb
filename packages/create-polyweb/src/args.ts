/** Analyse des arguments + questions interactives pour les valeurs manquantes. */
import { createInterface } from 'node:readline/promises';
import { basename } from 'node:path';
import { DEFAULT_TEMPLATE } from './scaffold.js';

export const HELP = `Usage : npm create polyweb@latest [dossier] -- [options]

Options :
  --name <nom>            nom du paquet (défaut : nom du dossier)
  --site-name <texte>     nom affiché du site (défaut : nom du dossier)
  --adapter node|vercel   adaptateur Astro (défaut : node)
  --storage local|s3|r2   stockage des médias (défaut : local)
  --search postgres|meilisearch|pagefind  (défaut : postgres)
  --payments              active le module de paiements
  --from <chemin|github:owner/repo#ref>   modèle (défaut : ${DEFAULT_TEMPLATE})
  --no-install            ne pas lancer pnpm install
  --no-git                ne pas initialiser git
  -y, --yes               aucune question (valeurs par défaut)
  -h, --help              aide
`;

export interface Parsed {
  readonly help: boolean;
  readonly yes: boolean;
  readonly values: Record<string, string | boolean | undefined>;
}

export function parseArgs(argv: readonly string[]): Parsed {
  const values: Record<string, string | boolean | undefined> = {};
  let help = false;
  let yes = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '-h' || a === '--help') help = true;
    else if (a === '-y' || a === '--yes') yes = true;
    else if (a === '--payments') values.payments = true;
    else if (a === '--no-install') values.install = false;
    else if (a === '--no-git') values.git = false;
    else if (a.startsWith('--')) {
      const [k, inline] = a.slice(2).split('=', 2) as [string, string | undefined];
      const key = k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      values[key] = inline ?? argv[++i];
    } else if (!values.directory) values.directory = a;
  }
  return { help, yes, values };
}

export async function resolveOptions(p: Parsed, interactive: boolean) {
  const v = { ...p.values };
  const ask = interactive && !p.yes;
  const rl = ask ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  const q = async (label: string, def: string) => (rl ? (await rl.question(`${label} (${def}) : `)).trim() || def : def);
  try {
    const directory = String(v.directory ?? (await q('Dossier du projet', 'mon-site')));
    const base = basename(directory).toLowerCase().replace(/[^a-z0-9-._~]/g, '-');
    return {
      directory,
      name: String(v.name ?? base),
      siteName: String(v.siteName ?? (await q('Nom du site', basename(directory)))),
      adapter: String(v.adapter ?? (await q('Adaptateur (node|vercel)', 'node'))),
      storage: String(v.storage ?? (await q('Stockage (local|s3|r2)', 'local'))),
      search: String(v.search ?? (await q('Recherche (postgres|meilisearch|pagefind)', 'postgres'))),
      payments: v.payments === true || (v.payments === undefined && ask && /^o|y/i.test(await q('Module paiements ? (o/n)', 'n'))),
      from: String(v.from ?? DEFAULT_TEMPLATE),
      install: v.install !== false,
      git: v.git !== false,
    };
  } finally {
    rl?.close();
  }
}
