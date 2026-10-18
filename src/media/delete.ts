import { unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Supprime un fichier uploadé à partir de son URL publique.
 * Ex: deleteUpload('/uploads/images/avatars/abc-123.jpg')
 */
export async function deleteUpload(url: string): Promise<void> {
  // Sécurité : n'accepter que les URLs commençant par /uploads/
  if (!url.startsWith('/uploads/')) {
    throw new Error('URL invalide — seuls les fichiers dans /uploads/ peuvent être supprimés');
  }

  // Résoudre le chemin absolu et vérifier qu'il reste dans public/uploads/
  const uploadsRoot = resolve(process.cwd(), 'public', 'uploads');
  const filePath = join(process.cwd(), 'public', url.slice(1));
  const resolved = resolve(filePath);

  if (!resolved.startsWith(uploadsRoot)) {
    throw new Error('Chemin invalide — tentative de path traversal détectée');
  }

  await unlink(resolved);

  // Also remove the companion WebP variant if it exists (generated for JPEG/PNG uploads)
  const webpPath = resolved.replace(/\.[^.]+$/, '.webp');
  if (webpPath !== resolved) {
    await unlink(webpPath).catch(() => {});
  }
}
