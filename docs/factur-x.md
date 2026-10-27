# Factur-X (EN 16931)

Facture électronique hybride : PDF lisible + XML CII (UN/CEFACT Cross Industry Invoice D16B) embarqué dans un PDF/A-3B, profil Factur-X **EN 16931** (Factur-X 1.0.7 / ZUGFeRD 2.x, XSD 1.09).

## Modules

| Fichier | Rôle |
| --- | --- |
| `src/core/einvoice/model.ts` | Modèle EN 16931 (BT/BG) indépendant de Sales : parties, lignes, ventilation TVA, totaux, paiement. Montants en unités mineures (`core/money`). |
| `src/core/einvoice/validate.ts` | Règles métier BR-* / BR-CO-* / BR-S/Z/E/AE/K/G-* vérifiées avant toute sérialisation (`EInvoiceValidationError { rule, detail }`). |
| `src/core/einvoice/cii.ts` | Sérialisation XML CII déterministe (échappement strict, montants décimaux exacts). |
| `src/core/einvoice/pdfa.ts` | `embedFacturX(pdf, xml, meta)` : assemblage PDF/A-3B (pdf-lib). |
| `src/core/einvoice/icc.ts` | Profil ICC sRGB v2 généré de façon déterministe (OutputIntent), sans fichier binaire vendu. |
| `src/modules/sales/domain/einvoice.ts` | `salesToEInvoice` / `salesFacturXml` : document de vente → modèle EN 16931 → XML, avec contrôle des totaux. |
| `src/modules/sales/domain/seller-profile.ts` | Profil vendeur (BG-4) : validation IBAN (mod 97), SIREN (Luhn, schéma 0002), TVA, BIC, pays ISO 3166-1. |

Tout est en Effect (erreurs typées `Data.TaggedError`), sans exception ni appel réseau.

## PDF/A-3B

`embedFacturX` ajoute au PDF visuel :

- le fichier `factur-x.xml` (`/EmbeddedFile`, sous-type `text/xml`, `Params` Size / ModDate / CheckSum MD5, compression Flate) ;
- sa `/Filespec` (`F`, `UF`, `Desc`, `AFRelationship /Alternative`), référencée par `/AF` du catalogue et par `Names/EmbeddedFiles` ;
- un `OutputIntent` `GTS_PDFA1` avec le profil ICC sRGB (`N 3`) ;
- des métadonnées XMP non compressées : `pdfaid:part 3`, `conformance B`, Dublin Core, dates `xmp`, `pdf:Producer`, schéma d'extension `fx` (`DocumentType INVOICE`, `DocumentFileName factur-x.xml`, `Version 1.0`, `ConformanceLevel EN 16931`) déclaré via `pdfaExtension` ;
- l'`/ID` du trailer, `PageMode /UseAttachments`, le dictionnaire Info aligné sur le XMP.

Un PDF chiffré est refusé (`FacturXEmbedError { reason: "encrypted" }`), un PDF illisible aussi (`"invalid-pdf"`).

## Intégration Sales

Route `GET /{lang}/admin/sales/{id}/pdf` : le PDF visuel (Chromium) devient Factur-X si et seulement si

1. le document est une facture (380) ou un avoir (381) ;
2. il est émis (ni `DRAFT` ni `CANCELLED`, numéro et date d'émission présents) ;
3. un profil vendeur existe pour le tenant ;
4. la devise est connue ;
5. le modèle passe les règles EN 16931 et ses totaux (HT, TVA, TTC) sont égaux à ceux du document.

Sinon le PDF visuel seul est servi. L'en-tête `X-Factur-X` rend la décision auditable : `EN 16931` ou `unavailable; reason=<not-invoice|not-issued|no-seller-profile|unsupported-currency|totals-mismatch|invalid>`. Les raisons autres que `not-invoice` / `not-issued` sont journalisées en avertissement.

Correspondances principales :

- catégorie TVA : mention `reverse-charge-services` → `AE`, `intra-eu-goods-exempt` → `K`, `export-exempt` → `G`, taux > 0 → `S`, exonéré → `E`, sinon `Z` ; motifs `VATEX-EU-AE` / `VATEX-EU-IC` / `VATEX-EU-G` avec la mention légale ;
- remise de ligne = prix unitaire × quantité − net de ligne (arrondi half-up) ;
- facture : échéance (BT-9), IBAN du profil (BT-84), référence de paiement = numéro ;
- avoir : conditions de paiement localisées (BT-20, exigé par BR-CO-25), facture d'origine (BT-25) depuis le document source.

## Profil vendeur

Table `sales_seller_profiles` (une ligne par tenant, index unique sur `coalesce(organization_id, '')`), migration `0039_sales_seller_profiles`. Administration : `/{lang}/admin/sales/seller` (lecture `sales:read`, écriture `sales:update`), action `saveSellerProfile` (upsert transactionnel `FOR UPDATE`). Le profil est aussi imprimé dans l'en-tête des PDF (raison sociale, adresse, TVA, identifiant légal, IBAN/BIC sur les factures).

## Dépendances

- `pdf-lib` ^1.17.1 (MIT) — dépendance d'exécution, manipulation PDF bas niveau, pur JS (compatible serverless).
- `xmllint-wasm` ^5.3.0 (MIT, libxml2 compilé en WebAssembly) — **devDependency**, validation XSD dans les tests uniquement.
- XSD Factur-X 1.09 EN 16931 vendus dans `tests/fixtures/factur-x/xsd/` (source et commit dans `SOURCE.txt`), utilisés seulement par les tests.

## Limites connues

- **Schematron** EN 16931 / Factur-X non exécuté : il requiert un processeur XSLT 2.0 (SaxonJS, licence Saxonica). Les règles BR-* sont réimplémentées et testées dans `validate.ts`.
- **veraPDF** non exécuté (Java absent de l'environnement) : la conformité PDF/A-3B est couverte par des tests structurels (OutputIntent, ICC, XMP, AF, EmbeddedFile, polices embarquées — Chromium produit des polices Type 3, considérées embarquées par ISO 19005). Le contenu visuel produit par Chromium n'est pas certifié par un validateur externe.

## Tests

`tests/unit/core/einvoice.test.ts`, `tests/unit/core/einvoice-pdfa.test.ts`, `tests/unit/sales/einvoice.test.ts` (XSD via `tests/helpers/factur-x-xsd.ts`), `tests/integration/sales-seller-profile.test.ts`, `tests/integration/sales-pdf.test.ts` (PDF Chromium réel → PDF/A-3B, XML extrait et validé XSD).
