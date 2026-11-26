# Rapport — TALENTS-SANS-PRÉSENTATIONS (#4528, 24/10)

Branche `claude/talents-sans-presentations-2410` (base `claude/correctifs-recette-pr12-b-2410`). Revient sur #4502 côté Talents, garde #4349 et #3544.

1. **#4528.1 — fait.** `TALENTS_TABS = ['vivier', 'recrutement']` ; ancre inconnue (dont `#positionnements`) → Vivier. Retirés de `ConsultantsPage` : l'intro de l'onglet, « Ajouter une présentation », `<SubmissionsView />`, la fenêtre d'ajout. Aussi retiré (hors brief, même contrat) : l'entrée « Présentations » de la barre de l'écran Recrutement (`RecruitmentPage`, lien `#positionnements`) + sa clé `recruitment.bar.presentations`.
2. **#4528.2 — fait, testé** (`crm-redirects.test.ts`) : `/consultants?view=submissions` et `/consultants#positionnements` → `/projects/presentations` (`beforeLoad` de `routes/consultants/index.tsx`) ; `/consultants/submissions` → idem, dans `beforeLoad` de `routes/consultants/$id.tsx` (le segment tombait sur `$id`, même modèle que `/projects/pistes`). `replace: true`, jamais `<Navigate>`. Pas dans `LEGACY_ADDRESSES` : le registre de migration interdit cette adresse dans la table. Palier : `projects/presentations.tsx` garde `<PlanFeatureRoute feature="needs">`, test de non-contournement ajouté.
3. **#4528.3 — fait.** `PageRecordLinks.tsx` (lien « positionnement ») → `/projects/presentations` ; `demo-crm-nav.ts` + spec ; `RecruitmentPage`. `git grep positionnements` : plus aucun lien d'adresse (restent noms de code, commentaires, textes). Aucun lien « résultats de recherche » trouvé côté web/api.
4. **Avant de retirer — fait.** `SubmissionsView` était le SEUL à monter : la pagination par 50 (#3544, « Afficher les 50 suivants », total « N sur M »). **Reportée** dans `PresentationsPage` (3 tests portés) ; tests du tableau/vides (colonnes, Suivi, Ouvrir, besoin d'abord, GA-197, échec) portés dans `PresentationsPage.test.tsx`. **Déjà présents** : `SubmissionFunnelSummary`, `composeSubmissionsDigest`, `PresentationsTable`, « Ajouter une présentation ». `SubmissionsView` + son test supprimés (plus d'appelant) ; `one-ask-laura-per-screen` pointe `PresentationsPage`.
5. **#4528.4 — acquis #4349 : tests existants verts** (fiche consultant `TalentDetailPage` onglet positionnements, fiche affaire `ProjectDossierPage` → `/projects/presentations`, `SubmissionDossierPage`).
6. **#4528.5 — fait.** Semis inchangé (`submissions`, 58 lignes > 50) ; `demo-crm-nav` repointé sur `/projects/presentations`, commentaires/specs de pagination relus vers `PresentationsPage`. Garde `src/architecture/talents-has-no-presentations-tab.test.ts` : dit NON sur un `TALENTS_TABS` à trois entrées (témoin), lit la page et les JSON.
7. **i18n/changelog — fait.** `tabs.positionnements` retiré (fr, en). Changelog FR+EN `2026-10-24-talents-sans-presentations`.

## Hors périmètre, touché par nécessité (à relire)

`packages/contracts/src/schemas/route-migration-{registry,empty-states,nonregression}.ts` et `route-migration-registry.test.ts` : ces registres citaient `SubmissionsView.tsx` / l'ancre `positionnements` (gardes d'existence de fichier). Repointés sur `PresentationsPage.tsx` ; ajout de `id="presentations"` sur sa racine. `doctrine-registry.ts` (texte historique du 19/10) non modifié.

## Vérifs (ciblées)

`tsc --noEmit -p apps/web` : 0 error TS. vitest : `src/architecture` (dont les 4 gardes rendantes), `components/navigation`, `features/{submissions,records,consultants}`, `i18n`, `lib/legacy-addresses` verts. contracts : `schemas/route-migration*`, `changelog` verts. api (jest) : `demo-crm-nav`, `demo-submissions-beyond-first-page`, `demo-coverage` verts. Environnement : `dist` de contracts/utils/errors/http/observable/events compilés localement (non versionnés) pour que vitest résolve les paquets.

Non fait : recette navigateur (non demandée, pas de navigateur dans ce lot). Question : `registre route-migration` garde une entrée `positionnements` « removed » avec `gap` historique — à nettoyer si Louis veut.
