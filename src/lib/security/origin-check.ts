/**
 * Protection CSRF par vérification d'Origin (équivalent de
 * `security.checkOrigin` d'Astro, que l'on remplace pour pouvoir exempter
 * l'API à jetons).
 *
 * Règle Astro reprise telle quelle : une requête non sûre (POST/PUT/PATCH/
 * DELETE) est refusée si son Origin diffère de celle du site ET qu'elle est
 * « formulaire » (content-type form/multipart/text) ou sans content-type.
 *
 * Même origine : Origin === origine de `url` (Astro.url), OU hôte d'Origin === en-tête Host
 * reçu. Depuis @astrojs/node 11.1.8, un Host absent de `security.allowedDomains` n'alimente
 * plus `Astro.url` (repli sur localhost:<port>) : sans ce second test, tout formulaire servi
 * sur un hôte non listé (multi-site, port de preview) serait refusé. Le Host d'une requête
 * cross-site forgée est celui de la cible et son Origin celui de l'attaquant : toujours refusée.
 *
 * Exemption : `/api/v1/*` avec `Authorization: Bearer …`. Un navigateur
 * n'ajoute jamais cet en-tête de lui-même (pas de cookie ambiant) et un
 * formulaire HTML ne peut pas le poser : la requête n'est pas forgeable
 * cross-site, il n'y a donc pas de risque CSRF.
 */
const FORM_CONTENT_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'];
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isBearerApiRequest(request: Request, url: URL): boolean {
  return url.pathname.startsWith('/api/v1/') && /^Bearer\s+\S+/i.test(request.headers.get('authorization') ?? '');
}

export function isForbiddenCrossOriginRequest(request: Request, url: URL): boolean {
  if (SAFE_METHODS.has(request.method)) return false;
  if (isBearerApiRequest(request, url)) return false;
  const sameOrigin = isSameOrigin(request.headers.get('origin'), url, request.headers.get('host'));
  const contentType = request.headers.get('content-type');
  if (contentType !== null) {
    const formLike = FORM_CONTENT_TYPES.some((t) => contentType.toLowerCase().includes(t));
    return formLike && !sameOrigin;
  }
  return !sameOrigin;
}

function isSameOrigin(origin: string | null, url: URL, host: string | null): boolean {
  if (origin === null) return false;
  if (origin === url.origin) return true;
  if (!host) return false;
  try {
    return new URL(origin).host === host.toLowerCase();
  } catch {
    return false;
  }
}
