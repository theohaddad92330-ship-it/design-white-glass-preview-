# Brief cloud — épopée #2843 Routines, les 7 points restants (02/11/2026)

Conception : contrat partagé neuf (packages/contracts routines) + migration probable + coût/budget (facturation).
Plafond : 300 tours ; à 240, commit + push de ce qui est vert, rapport, stop.
Branche : `claude/epopee-2843-routines-02-11`, créée depuis origin/main (elle CONTIENT main). Tu es le SEUL pousseur. Push SIMPLE après chaque point (jamais --force / --no-verify / rebase). AUCUNE PR : le fil l'ouvre.
Avant le premier push : `pnpm install --frozen-lockfile` puis `pnpm --filter @bellum/contracts build && pnpm --filter @bellum/shared build`.

Lire d'abord : `gh issue view 2843` (corps + commentaires), `.claude/notes/registre-2026-10-26-d1-routines.md` (lignes #2843.*), `.claude/notes/reconciliation-epopees-2026-11-02.md` (état réel au 02/11), `agent_docs/doctrine.md` (c76, c132), le rapport du lot L13 (commit 1874998f14). Déjà fait, NE PAS refaire : #2843.20 (retry, de07c2ee59), .1-.6/.9/.10/.14/.15/.18/.25/.26.

## Contrat (validé par Louis, QCM 02/11 ~06h UTC)

1. **#2843.7** — le schéma routine (`packages/contracts/.../routines.ts`, `routine-catalog.ts` : 12 attributs + version, stopCondition, niveau) porte AUSSI owner, budget, étapes, actions préparées, validations, statut (les 19 champs nommés par #2398.6 : relire leur liste dans le registre/issue). Chaque entrée du catalogue les renseigne ; `routine-catalog.spec.ts` sait dire NON si un champ manque.
2. **#2843.13** — /settings/routines (`RoutineControls.tsx`) : en plus d'heure/jour/canal/plafond, l'utilisateur règle l'autonomie (affichée l.141, non réglable aujourd'hui), le scope, l'owner et les validations. Autonomie : le niveau 0-1 par défaut ne vaut que pour les NOUVELLES routines (#2843.25).
3. **#2843.30** — le contenu exact produit par une routine (texte/gabarit) se règle dans `/settings/routines/<clé>`, persisté par espace, avec retour au défaut.
4. **#2843.24** — la fiche d'une automatisation (/actions/automatisations) porte les attributs de la spec #2399.3 (risque 0-4, stop conditions déjà là ; ajouter ceux qui manquent) — SAUF le coût, qui reste back-office (point 6).
5. **#2843.29** — personnalisation par rôle et par type d'espace : le rôle et le type d'espace changent l'ORDRE des routines proposées, JAMAIS leur présence ni leur contenu (doctrine c76_role_reordonne_jamais_ne_filtre). Qualifier les 37 entrées (rôle/espace pertinents) dans le catalogue ; test : un rôle différent voit le MÊME ensemble dans un ordre différent.
6. **#2843.19 + #2843.21** — BACK-OFFICE SEULEMENT (c132_credits_implicites, tranché 26/10) : le coût de chaque exécution est capturé et rattaché à l'exécution (aujourd'hui seul `noReplyFollowUp` écrit un `provider_costs`, `routine-executors.ts:966-971`, non rattaché) et lisible sur la route back-office `internal/admin/routines/runs` (`routines-backoffice.controller.ts`) ; un plafond de crédits par routine se règle au back-office et arrête l'exécution au dépassement (statut nommé). AUCUN chiffre de crédit ni de coût à l'écran du commercial.

## Droits

- Réglages /settings/routines : mêmes droits qu'aujourd'hui (qui règle déjà une routine).
- Coût et plafond : routes back-office seulement (garde interne existante, `InternalSecretGuard`/admin) ; un utilisateur d'espace est REFUSÉ (403) — test du refus exigé ; le web n'affiche aucun coût.

## Je ne fais pas

Rien sur Boond (#4700), sur Laura V8, sur /team ; aucun envoi automatique nouveau ; pas de probabilité ; aucun coût agrégé entre espaces (GA-43).

## Je défais

Rien. Toute ligne modifiée qui porte un #NNN : « garde #NNN » dans le message de commit.

## Règles

- TDD, test qui sait dire NON ; trace `// #2843.<n> — …` dans le code ; commits par point (scopes web, api, contracts, tooling), pied ≤ 100 car.
- Migration : une contrainte SQL s'élargit AVANT le code qui écrit (GA-11/GA-12) ; ajout seulement, nom horodaté après la dernière migration de main.
- Pièges CI : GA-252, GA-251, GA-33, GA-34, GA-26, GA-18/19, knip, `node scripts/classer-tests-node.mjs` dans apps/web si nouveau fichier de test web ; doctrine-registry (GA-38) si une doctrine est touchée.
- Tests CIBLÉS (≤ 5 specs par passe) + tsc --noEmit -p du paquet touché. JAMAIS la suite complète ni le build.
- FR + EN pour tout libellé ; fragment changes/epopee-2843-routines-02-11.yml ; démo (demo-dataset.ts + demo-coverage.ts) pour tout réglage nouveau visible.

Périmètre : packages/contracts/src/**, apps/api/src/modules/routines/**, apps/api/src/modules/demo/**, apps/api/src/migrations/**, apps/web/src/features/routines/**, apps/web/src/features/settings/**, apps/web/src/features/actions/**, apps/web/src/i18n/locales/**, apps/web/src/test/tests-node.generated.ts, changes/**, packages/contracts/src/schemas/doctrine-registry.ts

## Fin

docs/briefs/claude-epopee-2843-routines-02-11-rapport.md (≤ 15 lignes : par point livré (sha) / non fait (raison), SHA de tête), commit, push. STOP.
