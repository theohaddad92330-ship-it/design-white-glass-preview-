# LOT AD — #2558, une mission peut exister sans projet

base : 2ebf5be56b01c48a4dee6badadc6328363a8fcd0 — 18/09/2026 (`origin/main`)
branche : `feat/besoin-sans-projet-18-09`

## Ce que le lot précédent (AB) avait mesuré, et que je n'ai pas refait

`.claude/notes/registre-2026-09-18-AB-missions-projet.md` (commit `045dd0e35`,
branche `feat/missions-projet-optionnel-18-09`, non fusionnée) avait déjà établi,
indépendamment de `need-wizard.ts:196-233` (commit `a685ad17e`, 17/09 21:39) :

- `POST /projects/:id/needs` porte le projet dans l'URL — aucun chemin
  n'acceptait un besoin sans identifiant de projet.
- `project_needs.project_id` était `uuid NOT NULL REFERENCES opportunities(id)`.
- Le compte n'était atteignable QUE via le projet (`open-needs.service.ts:72-73`,
  `INNER JOIN`) — un `project_id` `NULL` aurait fait **disparaître** la ligne.
- 49 fichiers sous `apps/api/src` référencent `project_needs`.
- Recommandation séquencée : migration additive → lectures → route → écran →
  démo + i18n. C'est la séquence que ce lot suit.

Je n'ai pas refait cette mesure — je m'y suis appuyé, et je l'ai vérifiée par la
lecture directe du code (migration, entité, `open-needs.service.ts`) avant
d'écrire une ligne.

## Séquence livrée

### 1. Migration additive (GA-11 / GA-12)

`apps/api/src/migrations/1795650873421-ProjectNeedOptionalProject.ts` :
`project_needs.project_id` devient `NULLABLE`, une colonne `account_id`
(`uuid REFERENCES accounts(id) ON DELETE CASCADE`) porte le compte quand il n'y
a pas de projet, backfillée depuis `opportunities.account_id` pour les lignes
existantes, avec `CHECK (project_id IS NOT NULL OR account_id IS NOT NULL)` —
jamais les deux absents. Entité `ProjectNeedEntity` mise à jour (garde GA-36,
`migration-columns-declared.spec.ts`, verte).

### 2. Les lectures — combien faisaient RÉELLEMENT un JOIN obligatoire

Sur les **49 fichiers** qui référencent `project_needs` sous `apps/api/src`,
**19** contiennent la chaîne `JOIN opportunities` quelque part. Après lecture de
chacun, **7 fichiers, 10 occurrences** faisaient vraiment un JOIN
`project_needs.project_id → opportunities` qui aurait fait disparaître un
besoin sans projet du résultat (les autres joignent `opportunities` depuis
`submissions.project_id`, une colonne différente et non touchée par cette
migration) :

| Fichier | Ce qui aurait disparu |
| --- | --- |
| `projects/open-needs.service.ts` | l'écran « Besoins ouverts » (BEL-CRM-101) — traité au commit `70a766967` |
| `projects/need-verdict.service.ts` | le verdict GO/NO-GO d'un besoin (404 au lieu du verdict) |
| `workspace/workspace-memory-crossings.service.ts` (×2) | deux croisements mémoire |
| `consultants/matching/inverse-matching.service.ts` | la liste des besoins ouverts du matching inverse |
| `consultants/matching/matching.service.ts` (×4 : `loadNeed`, `pushRecipient`, `clientHistoryFor`, `onMissionAtClient`) | le rapprochement entier échouait pour ce besoin |
| `delivery/mission-scores.service.ts` | le compteur « autres besoins ouverts chez ce client » |
| `chains/chain-projectors.ts` (×2) | `need_count` / `need_at` par compte |

Exception délibérée : `matching.service.ts#submissionContext` reste en INNER
JOIN — `submissions.project_id` est encore `NOT NULL` (hors périmètre de ce
lot), un positionnement est donc structurellement impossible sur un besoin
sans projet ; rendre `null` ferait échouer plus loin sur une contrainte SQL
plutôt qu'un 404 lisible tout de suite.

Trois fichiers web (`OpenNeedsTable.tsx`, `NeedDetailPage.tsx`,
`NeedPositioningsTab.tsx`) rendent `project_id`/`project_label` devenus
nullables : tiret (`<Dash />`) plutôt qu'une chaîne vide, fil du COMPTE plutôt
que du projet pour l'onglet Activité, aucun comptage de positionnement sur une
lecture non filtrée.

### 3. La route backend

`POST /projects/needs` (2 segments — ne recouvre jamais `:id/needs`, qui en a
3, même convention que `needs/proposals/:proposalId/dismiss`) :
`ProjectPipelineService.addNeedForAccount` crée un besoin `project_id: null,
account_id: <compte>`, sans le plafond « 50 rôles par projet » (il dit « un
projet n'est pas un appel d'offres », une phrase qui ne s'applique pas à un
compte). Schéma `createProjectNeedForAccountSchema` (extension de
`createProjectNeedSchema` + `account_id`).

### 4. L'écran — #2558.2 traité, #2558.1 (création SANS projet) retenu

**#2558.2 était le piège nommé par le brief : traité.** La porte de création de
projet (`useCreateImplicitProject` + `NeedWizard.tsx`, #2174.1) existe en code
depuis le 16/09 mais restait invisible sur `/missions/nouvelle` avec un espace
sans aucun projet — masquée derrière `projectQuery.trim().length > 1` (il
fallait taper DEUX caractères), et le texte affiché à vide affirmait « un
besoin se rattache toujours à un projet déjà ouvert », qui contredisait la
phrase juste au-dessus et qui est FAUX depuis #2174.1. Seuil abaissé à `> 0`,
texte corrigé (FR+EN). `CreateNeedDialog.tsx` ET `CreateMissionPage.tsx`
montent le même `NeedWizard` (garde `one-need-wizard.test.ts`) : un seul
correctif couvre les deux portes.

**Le geste EXPLICITE « créer ce besoin sans aucun projet » n'existe pas
encore côté écran.** `needWizardStepValid` exige toujours `draft.projectId.
length > 0` (`need-wizard.ts:233`) : aujourd'hui, taper un nom de client
propose de CRÉER UN PROJET (#2174.1), jamais de s'en passer. La route backend
(`POST /projects/needs`) existe et est testée ; rien ne l'appelle depuis le
web.

## #2558.1 (écran) et démo — retenu, plan pour le lot suivant

Vu le budget d'un seul lot et la garde ZÉRO régression, je n'ai pas ouvert ce
chantier dans cette passe : c'est une surface neuve (type de brouillon,
validation d'étape, nouvel appel réseau, nouveau hook, démo, i18n) et
l'entamer à moitié laisserait exactement le défaut que ce dépôt nomme partout
— du code juste, testé, que personne n'appelle.

**Plan pour le lot suivant, dans cet ordre :**

1. `packages/contracts` : un hook web `useAddProjectNeedForAccount` (miroir de
   `useAddProjectNeed`, posté sur `POST /projects/needs`).
2. `NeedWizardDraft` (`need-wizard.ts`) : un mode `attachTo: 'project' |
   'account'` explicite — JAMAIS un défaut implicite. `needWizardStepValid`
   accepte l'étape quand `attachTo === 'account' && accountId` OU
   `attachTo === 'project' && projectId`.
3. Le geste, dans `StepType` de `NeedWizard.tsx` : sous le sélecteur de
   projet, un lien secondaire du type « Ce besoin n'a pas encore de projet —
   le rattacher directement au compte » — UN CLIC EXPLICITE (doctrine :
   « une écriture reste un geste d'utilisateur »), jamais automatique même
   quand `all.length === 0`. Le compte se résout comme `createProject` le fait
   déjà pour la moitié « compte » (`accountsApi.addToPortfolio`), sans créer
   de projet ensuite.
4. Démo (`demo-dataset.ts` + `demo-coverage.ts`) : au moins UN
   `project_need` semé avec `project_id: NULL` et `account_id` renseigné — sinon
   la nouveauté ne se voit pas en démonstration. Nécessite une nouvelle méthode
   de semis (les méthodes existantes assument toutes un `projectId` en
   paramètre) ; `demo-coverage.spec.ts` fera échouer la CI tant que la
   question n'a pas de réponse écrite.
5. i18n FR+EN du nouveau texte, à parité (garde i18n).

## Ce qui reste vrai

- Zéro régression prouvée : `open-needs.service.spec.ts` (46 tests, dont 4
  neufs sur ce lot) — un besoin AVEC projet se comporte À L'IDENTIQUE
  (`project_id`/`project_label` inchangés, même jointure `account`).
- Suite api complète verte (exit 0) après chaque étape ; tsc api et web sans
  NOUVELLE erreur (web : 1 erreur pré-existante non liée, `ResultTypeSelector.
  tsx`, non touchée par ce lot).
- `python3 tools/registres/coherence.py` : voir sortie ci-dessous.
- JAMAIS de donnée fictive, aucun envoi sortant, aucune migration destructive.

## Table

| Point | La demande, en huit mots | Sujet | État | Preuve en recette |
| ----- | ------------------------- | ------ | ---- | ------------------ |
| #2558.1a | Mission sans projet : migration additive et lectures | api | recetté | CODE prod 17d967788 — apps/api/src/modules/projects/open-needs.service.ts appelé par apps/api/src/modules/projects/projects.controller.ts:84 (migration 1795650873421) |
| #2558.1b | Route POST /projects/needs pour un besoin sans projet | api | recetté | CODE prod 17d967788 — apps/api/src/modules/projects/projects.controller.ts:572 (@Post('needs')) — route POST /projects/needs montée |
| #2558.1c | Écran : geste explicite « créer sans projet » | web | retenu | plan ci-dessus — surface neuve (draft, validation, hook, démo, i18n), non ouverte ce lot |
| #2558.1d | Démo : au moins une mission sans projet visible | api | retenu | dépend de #2558.1c (aucun chemin de création sans lui) ; plan ci-dessus, point 4 |
| #2558.2 | Porte de création de projet atteignable dès l'écran | web | recetté | CODE prod 17d967788 — apps/web/src/features/projects/open-needs/view/CreateNeedDialog.tsx appelé par apps/web/src/features/projects/open-needs/view/OpenNeedsPage.tsx:25 |
