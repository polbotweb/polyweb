import { PATHS, readFile } from './utils';

/**
 * Génère la liste des dépendances du projet
 */
export async function generateDeps(): Promise<string> {
  // Use lang for future localization
  const pkgContent = await readFile(PATHS.packageJson);
  if (!pkgContent) return '';
  const pkg = JSON.parse(pkgContent);
  const deps = Object.entries(pkg.dependencies || {})
    .map(([name, ver]) => `- **${name}**: \`${ver}\``)
    .join('\n');
  // Example: if (lang === 'fr') { ... } for French output
  return deps || '_None_';
}

/** Per-variable description overrides for well-known env vars. */
const ENV_DESCRIPTIONS: Record<string, string> = {
  DB_ENV:               'Active DB environment (LOCAL | PROD | TEST)',
  DATABASE_URL_LOCAL:   'PostgreSQL connection URL — local environment',
  DATABASE_URL_PROD:    'PostgreSQL connection URL — production environment',
  DATABASE_URL_TEST:    'PostgreSQL connection URL — test suite',
  BETTER_AUTH_SECRET:   'Auth secret key (min. 32 random chars)',
  BETTER_AUTH_URL:      'Public URL of the application (used by better-auth)',
  SITE_URL:             'Canonical URL used by Astro / sitemap',
  SMTP_PROVIDER:        'Email provider: BREVO | RESEND | NODEMAILER',
  SMTP_FROM_EMAIL:      'Sender email address',
  SMTP_FROM_NAME:       'Sender display name',
  SMTP_HOST:            'SMTP server hostname (Nodemailer only)',
  SMTP_PORT:            'SMTP server port, e.g. 587 (Nodemailer only)',
  SMTP_SECURE:          'Enable TLS/SSL — true | false (Nodemailer only)',
};

/**
 * Parses .env.example and returns a Markdown table with variable names and descriptions.
 * Comment lines directly above a variable are used as its description.
 * Well-known variables use a curated description override.
 */
export async function generateEnv(): Promise<string> {
  const content = await readFile(PATHS.envExample);
  const lines = content.split(/\r?\n/);
  const rows: { key: string; desc: string }[] = [];
  let currentDesc = '';

  const cleanComment = (s: string) =>
    s.replace(/^[#\s]+/, '').replace(/─+/g, '').replace(/\s+/g, ' ').trim();

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      const text = cleanComment(trimmed);
      if (text) currentDesc = text;
    } else if (trimmed && trimmed.includes('=')) {
      const key = trimmed.split('=')[0].trim();
      if (key) {
        const desc = ENV_DESCRIPTIONS[key] ?? currentDesc;
        rows.push({ key, desc });
      }
    }
  }

  if (rows.length === 0) return '_None_';
  return '| Variable | Description |\n|:---------|:------------|\n' +
    rows.map(r => `| \`${r.key}\` | ${r.desc} |`).join('\n');
}

/**
 * Génère la liste des alias TypeScript depuis tsconfig.json
 */
export async function generateTsconfigAliases(): Promise<string> {
  const tsconfigContent = await readFile(PATHS.tsconfig);
  if (!tsconfigContent) return '';
  let tsconfig: any;
  try {
    tsconfig = JSON.parse(tsconfigContent);
  } catch {
    return '';
  }
  const paths = tsconfig.compilerOptions?.paths || {};
  if (Object.keys(paths).length === 0) return '_None_';
  return Object.entries(paths)
    .map(([alias, targets]) => `- \`${alias}\` → \`${Array.isArray(targets) ? targets.join(', ') : targets}\``)
    .join('\n');
}
