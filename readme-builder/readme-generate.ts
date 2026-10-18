import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateDatabase }  from './generateDatabase';
import { generateDesign }    from './generateDesign';
import { generateAuth }      from './generateAuth';
import { generateCMS }       from './generateCMS';
import { generateMedia }     from './generateMedia';
import { generateEmail }     from './generateEmail';
import { generateI18n }      from './generateI18n';
import { generateQuality }   from './generateQuality';
import { generateEnv, generateTsconfigAliases } from './generateDeps';
import { getLangLinks, githubSlug } from './helpers';
import { LANGS, i18n } from './i18n';
import type { Lang } from './i18n';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

async function generateReadmeForLang(lang: Lang): Promise<void> {
  const t   = i18n;
  const s   = t.sections;
  const sub = t.subsections;

  // Shared set — each generator claims its tests; later ones skip already-claimed ones
  const assigned = new Set<string>();

  // ── Header ────────────────────────────────────────────────────────────────
  let md = `# ${t.projectName[lang]}\n\n`;
  md += `${getLangLinks(lang)}\n\n`;
  md += `${t.description[lang]}\n\n`;
  md += `${t.subtitle[lang]}\n\n`;

  let body = '';

  // 1 ─ Overview + Tech Stack
  body += `## ${s.overview[lang]}\n\n`;
  body += t.overview[lang] + '\n\n';
  body += t.features[lang].map(f => `- ${f}`).join('\n') + '\n\n';
  body += `### ${s.techStack[lang]}\n\n`;
  body += t.techStackContent[lang] + '\n\n';

  // 2 ─ Getting Started
  body += `## ${s.gettingStarted[lang]}\n\n`;
  body += `### ${sub.prerequisites[lang]}\n\n`;
  body += '- **Node.js** >= 22.12.0\n- **pnpm** >= 10\n- **PostgreSQL** >= 16\n\n';
  body += `### ${sub.installation[lang]}\n\n`;
  body += '```bash\npnpm install\ncp .env.example .env\npnpm db:migrate\npnpm dev\n```\n\n';
  body += `### ${sub.envVars[lang]}\n\n`;
  body += await generateEnv() + '\n\n';
  const aliases = await generateTsconfigAliases();
  if (aliases) body += `### ${sub.aliasTs[lang]}\n\n${aliases}\n\n`;

  // 3 ─ Design System
  body += await generateDesign(lang, assigned);

  // 4 ─ Database
  body += await generateDatabase(lang, assigned);

  // 5 ─ Authentication & Security
  body += await generateAuth(lang, assigned);

  // 6 ─ Content & CMS
  body += await generateCMS(lang, assigned);

  // 7 ─ Media
  body += await generateMedia(lang, assigned);

  // 8 ─ Email & Notifications
  body += await generateEmail(lang, assigned);

  // 9 ─ Internationalisation
  body += await generateI18n(lang, assigned);

  // 10 ─ CI/CD & Quality
  body += await generateQuality(lang);

  // ── Auto TOC ──────────────────────────────────────────────────────────────
  const tocLines: string[] = [];
  const headingRegex = /^##\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(body)) !== null) {
    const title  = match[1].trim();
    const anchor = githubSlug(title);
    tocLines.push(`- [${title}](#${anchor})`);
  }

  md += `## ${t.toc[lang]}\n\n${tocLines.join('\n')}\n\n`;
  md += body;
  md = md.replace(/\n{3,}/g, '\n\n');
  if (!md.endsWith('\n')) md += '\n';

  const suffix     = lang === 'en' ? '' : `.${lang}`;
  const outputPath = path.resolve(__dirname, `../README${suffix}.md`);
  await fs.writeFile(outputPath, md, 'utf8');
  console.log(`✅  README${suffix}.md generated`);
}

async function main() {
  for (const lang of LANGS) {
    await generateReadmeForLang(lang);
  }
}

main().catch(console.error);
