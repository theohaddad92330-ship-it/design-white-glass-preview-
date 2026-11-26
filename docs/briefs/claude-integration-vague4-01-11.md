# Brief cloud — intégration n°4 « vague 4 » + trois points tranchés (01/11/2026)

Plafond : **300 tours** ; à 240, commit + push de ce qui est vert, rapport, stop.
Branche : `claude/integration-vague4-01-11` (ce brief y est déjà ; elle part de `origin/main`). Tu es le SEUL pousseur sur cette branche.

## Partie A — intégrer deux branches rendues

1. `git merge --no-ff origin/claude/rattrapage-produit-01-11` (20 commits ; rapport `docs/briefs/rattrapage-produit-01-11-rapport.md`)
2. `git merge --no-ff origin/claude/rattrapage-outillage-01-11` (6 commits)
   Conflits : main a bougé de ~150 commits depuis leur départ — résoudre EN GARDANT LES DEUX CÔTÉS.
   Commit vide d'antériorité : `chore(tooling): antériorité vague 4` dont le corps dit « revient sur #4498 (compteur Filtres = une valeur = une puce, #4941.2) ».
   Push après la partie A.

## Partie B — trois points (contrat validé par Louis 01/11 ~11h UTC)

TDD : le test d'abord, il doit savoir dire NON. Un commit par point, numéro dans le sujet (scopes commitlint : web, api, ia, contracts, tooling, packages…), `// #<point>` dans le code. Push après CHAQUE point.
Contexte : `grep -rn '#4714\.\|#4616\.4\|#4875\.' .claude/notes/registre-*.md 2>/dev/null` si présent, sinon `git log --all --grep=4714` etc.

1. **#4714.3** — `CRM_SYNC_OVERWRITE=true` (`apps/api/src/modules/crm-sync/crm-sync.config.ts:45`) : l'écrasement d'une valeur CRM NON VIDE ne part plus
   directement — il passe par LA PORTE d'écriture CRM existante (prévisualisation figée à valider ; doctrine « une écriture CRM/ERP passe par une porte »).
   Le réglage reste. Champ vide côté CRM : inchangé. Trouve la porte existante (`git grep -n 'preview\|gate\|porte' -- apps/api/src/modules/crm*`), ne la recode pas.
   Mets à jour l'entrée c147 de `packages/contracts/src/schemas/doctrine-registry.ts` (« gap → porte »).
   Test : OVERWRITE=true + valeur non vide ⇒ aucun appel d'écriture au connecteur, une prévisualisation créée ; NON : valeur vide ⇒ écrit.
   Droits : la validation suit les droits EXISTANTS de la porte CRM, inchangés ; un test prouve qu'un membre sans droit d'écriture CRM ne valide pas.
2. **#4616.4** — Le travail de fond (workers BullMQ, tâches planifiées) prend AU PLUS 50 % de `DB_POOL_MAX` ; l'autre moitié reste aux requêtes des écrans.
   Lieu : `apps/api/src/database/database.module.ts:806-840`. Un réglage à UN endroit (GA-26). Test : DB_POOL_MAX=20 ⇒ fond plafonné à 10 ; NON sinon.
   Variable d'environnement neuve éventuelle → `agent_docs/env-reference.md` (famille, défaut, raison), jamais CLAUDE.md.
3. **#4875.2** — « Je ne sais pas encore » est ACCEPTÉ sur une clé exigée et PERSISTÉ comme statut (tranché 31/10, #4875.1) : le test commun suit ce sens.
   Trouve-le par `git grep -n '4875' -- apps packages`.

Je ne fais pas : rien hors des parties A et B. Pas de modification de `.claude/notes/`.
Périmètre (partie B) : apps/api/src/modules/crm\*/**, apps/api/src/database/**, apps/api/src/workers/**, apps/api/src/queue/**, packages/contracts/src/schemas/doctrine-registry.ts, agent_docs/env-reference.md, fichiers du test commun #4875.

## Gardes : CIBLÉES seulement

Specs touchées par les conflits et par la partie B (≤ 5 par passe), `tsc -p` des paquets touchés. JAMAIS la suite complète, `check-types` racine, ni le build : c'est la CI.
Si un test est ajouté côté `apps/web` et qu'un script régénère la liste des tests node, régénère-la.

## Fin

- `git push` SIMPLE (jamais --force, jamais --no-verify).
- Ouvre la PR PRÊTE : `gh pr create --base main --head claude/integration-vague4-01-11 --title "Intégration vague 4 : rattrapage produit + outillage + #4714.3 #4616.4 #4875.2 (01/11)"`,
  corps = points livrés des deux rapports + partie B + « Revient sur #4498 » + questions ouvertes #4631.6 (« + N par l'élargissement » = widenedCount ?) et #4770.2 (comptage par valeur vs critère) + ligne `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Écris `docs/briefs/claude-integration-vague4-01-11-rapport.md` (≤ 15 lignes : PR, SHA de tête, conflits → choix, par point livré/non fait, gardes lancées), pousse-le. STOP — ne suis pas la CI.
