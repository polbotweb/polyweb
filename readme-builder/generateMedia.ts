import { PATHS, listTree, getScriptsByPrefix, claimTestsByPattern } from './utils';
import { i18n, type Lang } from './i18n';

const UPLOAD_DESC: Record<Lang, string> = {
  en: '- Secure upload with MIME type and size validation\n- Image processing with **sharp** (resize, optimisation)\n- Storage in `public/uploads/`\n- Delete and list uploaded files',
  fr: '- Upload sécurisé avec validation du type MIME et de la taille\n- Traitement des images avec **sharp** (resize, optimisation)\n- Stockage dans `public/uploads/`\n- Suppression et liste des fichiers uploadés',
  ar: '- رفع آمن مع التحقق من نوع MIME والحجم\n- معالجة الصور باستخدام **sharp**\n- التخزين في `public/uploads/`\n- حذف وقائمة الملفات المرفوعة',
  es: '- Upload seguro con validación de tipo MIME y tamaño\n- Procesamiento de imágenes con **sharp**\n- Almacenamiento en `public/uploads/`\n- Eliminación y listado de archivos subidos',
};

export async function generateMedia(lang: Lang, assigned: Set<string> = new Set()): Promise<string> {
  const s = i18n.sections;
  const sub = i18n.subsections;

  let out = `## ${s.media[lang]}\n\n`;

  // ── Files ────────────────────────────────────────────────────────────────
  out += `### ${sub.files[lang]}\n\n`;
  out += '```\n';
  const mediaTree = await listTree(PATHS.media);
  if (mediaTree) out += `src/media/\n${mediaTree}`;
  const publicTree = await listTree(PATHS.public, 0, 1);
  if (publicTree) out += `public/\n${publicTree}`;
  out += '```\n\n';

  // ── Upload & Processing ──────────────────────────────────────────────────
  out += `### ${sub.upload[lang]}\n\n${UPLOAD_DESC[lang]}\n\n`;

  // Only seed-media is a media-specific command
  const commands = await getScriptsByPrefix(['db:seed-media']);
  if (commands) out += `### ${sub.commands[lang]}\n\n${commands}\n\n`;

  const testFiles = await claimTestsByPattern(['media-list', 'upload-api', 'upload', 'admin-media'], assigned);
  if (testFiles.length > 0) {
    out += `### ${sub.tests[lang]}\n\n`;
    for (const f of testFiles) out += `- \`${f}\`\n`;
    out += '\n';
  }

  return out;
}
