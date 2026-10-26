# core/documents — rendu PDF (port Effect + adaptateur Puppeteer)

Bloc générique (`src/core/documents`) pour produire des PDF (devis, factures, avoirs, bons de commande…).

## Architecture

| Élément | Rôle |
|---|---|
| `PdfRenderer` (`Context.Service`) | Port : `render(html, { format?, timeoutMs? }) → Effect<Uint8Array, DocumentRenderError>` |
| `printDocument({ locale, title, css, body })` | Coque HTML autonome : `lang` / `dir` (RTL pour `ar`), CSP `default-src 'none'`, styles inline |
| `escapeHtml`, `sanitizePrintCss` | Échappement des valeurs ; retrait des `@import` et `url()` non `data:` du CSS (thème) |
| `PdfRendererUnavailable` | Couche par défaut : échec `reason: "unavailable"` |
| `makeMemoryPdfRenderer()` | Moteur de test (enregistre le HTML) |
| `src/lib/pdf/puppeteer.ts` | Adaptateur Puppeteer (`puppeteer-core`) : `PuppeteerPdfRendererLive`, `closePdfBrowser()` |

Un module fournit un gabarit pur (HTML) puis passe par le port, par exemple les ventes :
`renderSalesDocumentHtml(doc, { locale, sellerName, themeCss })` → `renderSalesDocumentPdf(doc, options)`.

## Adaptateur Puppeteer

- **Navigateur paresseux et réutilisé** : lancé à la première demande, partagé, relancé s'il se déconnecte.
- **Pas de Chromium orphelin** : connexion par pipe (`pipe: true`), pas par WebSocket. Puppeteer lance Chromium détaché ; avec le pipe, Chromium se termine dès que le processus Node meurt, même par SIGKILL (arrêt du `webServer` Playwright, crash). `closePdfBrowser()` reste l'arrêt propre (tests). Test de non-régression : `tests/integration/sales-pdf.test.ts`.
- **Une page par rendu**, fermée ensuite ; JavaScript désactivé.
- **Aucune ressource distante** : interception réseau (seuls `data:` et `about:` passent) en plus de la CSP. Les polices sont celles installées sur la machine (aucun webfont distant).
- **Délai borné** : `setContent` / `page.pdf` limités à `PDF_RENDER_TIMEOUT_MS` (défaut 15 000), et `Effect.timeoutOrElse` au-dessus → `DocumentRenderError{ reason: "timeout" }`.
- `--no-sandbox` par défaut (conteneurs / CI) ; `PDF_CHROMIUM_SANDBOX=1` réactive le bac à sable.

Erreurs (`DocumentRenderError.reason`) : `unavailable` (pas de Chromium configuré), `timeout`, `render`.

## Route de téléchargement (ventes)

`GET /{lang}/admin/sales/{id}/pdf` : organisation du document (404 si inconnu) → `requireSalesPermission(["read"], organisation)` (tenant) → limite de débit `sales:pdf` (20 / min) → rendu → réponse **en flux** (`application/pdf`, `Content-Disposition: attachment`, `Cache-Control: private, no-store`, `nosniff`).
Codes : 401 / 403 / 404 / 429 ; 503 si Chromium indisponible, 504 en cas de délai dépassé, 500 sinon.

## Déploiement : Chromium requis à l'exécution

`puppeteer-core` ne télécharge **aucun** navigateur. Le serveur doit disposer d'un Chromium / Chrome :

| Variable | Rôle |
|---|---|
| `PDF_CHROMIUM_PATH` | Chemin de l'exécutable Chromium (prioritaire) |
| `PUPPETEER_EXECUTABLE_PATH` | Repli si `PDF_CHROMIUM_PATH` est absent |
| `PDF_RENDER_TIMEOUT_MS` | Délai maximal d'un rendu (défaut 15 000) |
| `PDF_CHROMIUM_SANDBOX` | `1` pour garder le bac à sable Chromium |

- **Serveur / conteneur Node** : installer Chromium et ses dépendances (ex. Debian/Ubuntu `apt-get install chromium`, ou `npx playwright install --with-deps chromium`) et des polices couvrant les langues servies (dont l'arabe : `fonts-noto-core` / `fonts-dejavu`).
- **Vercel (serverless)** : pas de Chromium dans le runtime. L'option habituelle est `@sparticuz/chromium` (binaire compressé adapté à Lambda) avec `puppeteer-core`. **Non ajouté** : nouvelle dépendance soumise à validation. Sans Chromium, la route répond 503 et le reste de l'application fonctionne.

## CI

Le job « Unit & Integration Tests » installe le Chromium Playwright (même cache et même script `.github/scripts/playwright-install.sh` que les jobs e2e / a11y) et exporte `PDF_CHROMIUM_PATH`.

## Tests

- `tests/unit/core/documents.test.ts` : échappement, CSS assaini, coque (CSP, RTL), port.
- `tests/unit/sales/pdf-template.test.ts` : gabarit de vente (échappement, totaux, RTL, nom de fichier).
- `tests/integration/sales-pdf.test.ts` : rendu réel fr / en / ar, extraction du texte (`tests/helpers/pdf-text.ts`, sans dépendance), réutilisation du navigateur, délai, blocage réseau.

Chromium embarque les polices variables en Type3 : certains glyphes arabes façonnés n'ont pas de correspondance Unicode dans le PDF. Le test arabe vérifie donc les données latines et la présence de texte arabe, et le sens RTL est vérifié sur le HTML.
