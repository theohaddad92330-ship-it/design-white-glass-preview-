# Rapport agent — lot #2451.1/.5/.8/.9/.10 (fix/v27-chat-2451-23-09)

## État (en cours)

- Branche créée depuis origin/fix/laura-modes-23-09, mergé origin/fix/laura-2431-23-09 (conflits résolus, garder les 2 côtés).
- SHA poussés : 90e80c612 (merge), 7fdea656e (contrat #2451.9), 5b05c73f4 (API+web écran #2451.9).

## 2451.9 — réglage "Laura, mode par défaut de l'espace"

- DOCTRINE : NE PAS l'ajouter à `workspace-rules.ts`/`workspace_rules` — ce fichier plafonne
  explicitement son socle à DEUX règles qui RESTREIGNENT un droit (#2081.14). Un mode par
  défaut ne retire aucun droit : traité comme réglage séparé (`workspaces.default_context_mode`,
  migration 20260923132738), pattern `WorkspaceTimezoneService`/`WorkspaceMarketService`.
- Livré : contrat (`laura-context-mode.ts`), colonne+CHECK (migration testée),
  `WorkspaceLauraModeService` (GET/PATCH `/workspaces/laura-mode`, lecture tout membre,
  écriture owner/admin), écran `Réglages > Laura — mode par défaut` (route `/settings/laura-mode`,
  nav ajoutée, routeTree.gen.ts régénéré via le générateur TanStack en script node ad hoc).
- Tests verts : contracts (10), migration spec (4), service spec (7), module.spec (2),
  LauraModeSettingsView.test.tsx (3), i18n parity/keys-resolve/interpolation (246), nav
  known-routes/settings-nav-shell/sections (85).
- RESTE (ce commit) : câbler `contextModeFor`/`ContextModeSelector`/`Chat.tsx` pour qu'un fil
  NEUF lise réellement ce réglage (actuellement lu nulle part côté client) — en cours.
- Démo : pas d'entrée demo-coverage ajoutée — `workspaces` n'est PAS une table gardée par
  `demo-coverage.spec.ts` (gate table-only), et la colonne a un DEFAULT NOT NULL correct pour
  tout espace y compris démo (rien à seeder, contrairement à `timezone` qui est nullable).

## Restants du lot (pas commencés)

- 2451.1 : retenu — wiring Analyser/Découvrir, point énorme (analysis.service.ts:26-42 identifié
  comme point d'insertion par agent Explore). Trop risqué/gros pour ce lot (pipeline production
  3-6 min, changerait le comportement pour tous) — restera `retenu`, note enrichie.
- 2451.5/.8/.10 : évaluation en cours — évidence forte (GA-86, GA-332, AnalyzeSelectionDialog)
  que le principe général est DÉJÀ tenu partout où un coût existe réellement (Laura mode = 0 coût
  aujourd'hui) → probable "déjà là" avec preuve fichier:ligne, à trancher et écrire au registre.

## Portes

- `pnpm check-types` / `lint:exports:types` : pas encore relancés (à faire avant le dernier push).
