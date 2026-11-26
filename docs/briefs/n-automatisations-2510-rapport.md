# Rapport — Lot N-AUTOMATISATIONS (#2399.6, #2399.7, épopée #2843)

Branche : `claude/n-automatisations-2510` (base `origin/main` aba0f523). Pas de PR.

## Les trois questions, répondues par LECTURE avant de coder

1. **Une règle active pouvait-elle être modifiée sans brouillon ?** Partiellement oui. `PUT :id/draft` + `activate-draft`
   tenaient déjà la promesse pour la _phrase_ (signal, action, séquence, délai). Mais `PATCH :id` (`automation-rules.service.ts`
   `update`) écrivait `credit_cap` **en direct** sur une règle `enabled` : un changement de comportement servi, silencieux.
   → fermé : sur une règle qui tournait et reste allumée, le plafond devient un brouillon. Éteindre, et régler une règle
   éteinte, restent immédiats (rien à protéger).
2. **L'activation montrait-elle quelque chose ?** Non. `activateDraft` exigeait seulement « brouillon testé » ; le bouton
   « Activer la version N+1 » basculait d'emblée. → comparaison ajoutée et exigée.
3. **L'ancienne version était-elle conservée ?** Non. `activateDraft` écrasait les champs et faisait `version += 1` ; seul
   le journal des essais survivait. → `version_history` (jsonb) conserve chaque version remplacée.

## Déjà là, appelant manquant

- `version`, `draft`, `draft_tested_at`, `enabled`, `runner.preview` (le plan lu sans écrire), la démo avec une règle ACTIVE
  « Une fin de mission approche » + brouillon testé v2 : **réutilisés tels quels**, aucune seconde notion de version.
- Manquait : l'appelant « montrer avant de basculer » (GET + écran) et la conservation.

## Livré

- `packages/contracts` : `diffAutomationVersions` (champ par champ, seulement ce qui change), types `AutomationSwitchPreviewView`,
  `AutomationSwitchImpact` (`measured: false` + raison, jamais 0), `AutomationRuleVersionSnapshot`.
- API : `GET automation-rules/:id/switch-preview` (lecture : aucune permission d'écriture, borné par espace+personne) ;
  `activate-draft` refuse (400) sans comparaison rendue ; enregistrer un brouillon (ou plafonner) efface « comparaison rendue » ;
  la version remplacée est archivée dans `version_history`. L'impact passe par `runner.preview` : rien ne s'exécute, rien n'est
  consigné (pas de ligne de journal d'essai). Source illisible ou erreur → « non mesuré », bascule toujours possible.
- Migration `1796575200123-AutomationRuleVersionHistory` : deux colonnes additives (`draft_compared_at`, `version_history` + CHECK
  tableau). Max de `main` vérifié : 1796575106329. Aucune contrainte à élargir avant le code.
- Web : `AutomationSwitchPreview` dans l'éditeur (là où la bascule se fait, pas de page neuve) ; bouton fermé tant que la
  comparaison n'est pas rendue ; i18n fr + en (`routines.editor.switch.*`).
- Démo : la règle active + brouillon testé existait ; `DEMO_AUTOMATIONS_COVERAGE` complétée (seedée, raison écrite). Pas de nouvelle table.

## Tests (rouge → vert)

- Contrat : `diffAutomationVersions` rouge (fonction absente) → 33/33 vitest.
- API jest : éditeur + service + runner + engine + rbac + migration + `demo-coverage`/`demo-automations` : verts
  (le test NON « plafond d'une règle active ne change pas le servi » et « bascule refusée sans comparaison » rouges avant le code).
- Droits : `automation-rules.controller.rbac.spec.ts` — `activate-draft` garde `messages:send` (inchangé, aucun droit élargi),
  `viewer` → 403 sur bascule et sur PATCH, `viewer` ouvre la comparaison (lecture).
- Web vitest (`src/features/automations`) : 8 fichiers / 98 tests verts. Le test du composant a été écrit avant le composant
  mais son premier run a échoué sur la résolution de `@bellum/contracts` (dist non construit, j'ai fait `pnpm build` du paquet,
  gitignoré) : pas de rouge « pour la bonne raison » constaté pour ce composant.
- `tsc` API : 3 erreurs, toutes `Cannot find module '@bellum/email'` (paquet non construit, antérieures, hors périmètre) ; 0 sur le lot.
  `tsc` web : 0 erreur.

## Mesure demandée (« Je mesure »)

**Non mesurée** : cette session cloud n'a aucun accès à la base de production (pas de clé, pas de `railway`). Aucun chiffre inventé.
À lancer en lecture seule : `SELECT count(*) AS regles, count(*) FILTER (WHERE enabled) AS actives, count(*) FILTER (WHERE version > 1) AS basculees FROM automation_rules WHERE archived_at IS NULL;`

## Pas fait / questions

- `down` : la convention du dépôt est « en avant seulement » (`down()` lève, comme les migrations voisines) ; testé ainsi. Dis-moi si tu veux un vrai `down`.
- `DELETE automation-rules/:id` supprime encore la ligne (donc son `version_history`) alors que la doctrine dit « on archive » : hors
  périmètre du brief (`remove` est un chemin existant), à trancher.
- `GET switch-preview` écrit `draft_compared_at` (le marqueur « vu » exigé par la bascule) : voulu, borné à la règle de la personne.
- L'ancienne version est conservée et lisible côté base ; l'écran n'affiche pas encore l'historique des versions plus anciennes.
- Aucun gate de la suite complète lancé (travail de la CI).

[lot-fini] claude/n-automatisations-2510
