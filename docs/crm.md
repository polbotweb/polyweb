# Module CRM (`src/modules/crm`)

Sociétés, contacts, opportunités (pipeline commercial) et activités, multi-tenant, montants en unités mineures (`core/money`), lien vers un devis du module ventes.

## Pipeline

`NEW → QUALIFIED → PROPOSAL → NEGOTIATION → WON | LOST`

- Retour possible d'une étape ouverte à la précédente ; perte possible depuis toute étape ouverte, avec un **motif obligatoire** (`price`, `competitor`, `timing`, `no_budget`, `no_decision`, `other`).
- Une opportunité perdue se rouvre (`LOST → QUALIFIED`) ; une opportunité gagnée est close.
- Une opportunité clôturée n'est plus modifiable (le formulaire d'édition redirige vers la fiche).
- Probabilité effective : 100 si gagnée, 0 si perdue, sinon valeur saisie ou valeur par défaut de l'étape ; prévision pondérée = montant × probabilité.

## Domaine (pur, `domain/`)

`workflow.ts` (transitions, `nextStages`, `isOpenStage`, `LOST_REASONS`), `opportunity.ts` (probabilité, prévision, synthèse du pipeline), `contacts.ts` (nom affiché, clé de dédoublonnage), `activities.ts` (types, retard), `errors.ts`.

## Données

Tables `crm_companies`, `crm_contacts`, `crm_opportunities`, `crm_activities`, `crm_opportunity_revisions`, `crm_opportunity_locks` (migration `0032`). Contacts dédoublonnés par tenant (e-mail, sinon prénom + nom).

## Actions (`actions.crm.*`)

`create`, `update`, `transition`, `linkQuote`, `delete`, `lock`, `unlock`, `bulk` (qualifier / classer perdues), `createCompany` / `updateCompany` / `deleteCompany`, `createContact` / `updateContact` / `deleteContact`, `createActivity` / `completeActivity` / `deleteActivity`. Permissions `crm:create | read | update | delete`, vérifiées pour l'organisation de la fiche (tenant).

## Intégration ventes

Une opportunité peut être **liée à un devis existant** (`linkQuote`, devis du même tenant). La génération automatique d'un devis depuis une opportunité n'est pas couverte.

## Administration

- `/{lang}/admin/crm` : synthèse du pipeline (en cours, prévision pondérée, gagné, taux de réussite), liste filtrable (recherche, étape), tris, vues enregistrées, actions groupées.
- `/{lang}/admin/crm/new`, `/{lang}/admin/crm/{id}/edit` : formulaire d'opportunité.
- `/{lang}/admin/crm/{id}` : fiche, transitions autorisées, motif de perte, devis lié, activités.
- `/{lang}/admin/crm/companies[/new|/{id}|/{id}/edit]` et `/{lang}/admin/crm/contacts[/new|/{id}|/{id}/edit]` : sociétés et contacts, avec opportunités et activités liées.

Traductions fr / en / es / ar (`i18n/`), interface RTL en arabe. Scripts client : `client/init.ts` (formulaires, actions de fiche).

## Tests

`tests/unit/crm/domain.test.ts`, `tests/unit/crm/admin-resource.test.ts`, `tests/integration/crm-module.test.ts`, `tests/e2e/crm-admin.spec.ts`, `tests/e2e/a11y.spec.ts` (pages CRM).
