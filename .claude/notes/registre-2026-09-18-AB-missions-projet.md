# LOT AB — #2558, une mission sans projet détecté dans la presse

base : 2ebf5be56b01c48a4dee6badadc6328363a8fcd0 — 18/09/2026 (`origin/main`)
branche : `feat/missions-projet-optionnel-18-09`

## Mesure (avant code)

Deux portes possibles pour « créer une mission » :

- `POST /delivery/missions` (mission SIGNÉE, `packages/contracts/src/schemas/mission.ts:894-940`)
  a déjà `opportunityId` **optionnel**. Mais aucun écran web ne poste sur cette
  route avec un sélecteur de projet (`git grep` : seuls `delivery.controller.ts`
  et `delivery.service.ts` la référencent côté serveur) — ce n'est pas le
  formulaire visé par le retour client.
- Le parcours réel est `/missions/nouvelle` (`apps/web/src/routes/missions/nouvelle.tsx`)
  → `NeedWizard.tsx`, qui crée un `project_need` via `POST /projects/:id/needs`.
  C'est ICI que vit le texte cité mot pour mot par le client : « Projet de
  rattachement » / « Un projet regroupe les besoins d'un même client. Pas
  encore de projet pour ce client ? Crée-en un juste en dessous. »
  (`apps/web/src/i18n/locales/fr/projects.json:159-160`).

Cette mesure a déjà été commencée par un lot fusionné la veille (commit
`a685ad17e`, 17/09/2026 21:39, « #2557.1/.2 #2559.1 mission creation door and
project picker fix ») et écrite en commentaire dans
`apps/web/src/features/projects/open-needs/model/need-wizard.ts:196-233`. Je
l'ai vérifiée indépendamment plutôt que de la reprendre telle quelle :

- `POST /projects/:id/needs` porte le projet **dans l'URL**
  (`apps/api/src/modules/projects/projects.controller.ts:531`) — aucun chemin
  n'accepte un besoin sans identifiant de projet.
- `project_needs.project_id` est `uuid NOT NULL REFERENCES opportunities(id)
  ON DELETE CASCADE` (`apps/api/src/migrations/1789344812907-ProjectPivot.ts:112`)
  — contrainte SQL non élargie (GA-11/GA-12 l'exigent AVANT le code qui
  écrirait `NULL`).
- Le compte n'est atteignable QUE via le projet aujourd'hui :
  `apps/api/src/modules/projects/open-needs.service.ts:72-73` fait
  `.innerJoin('opportunities', 'project', 'project.id = need.project_id')`
  puis `.leftJoin('accounts', ...)` — un `project_id` `NULL` ferait
  **disparaître** la ligne de `listOpenNeeds` (l'`INNER JOIN` l'exclut), pas
  juste l'afficher sans projet. Même schéma en SQL brut lignes 478-519 du même
  fichier (`JOIN opportunities project ON project.id = need.project_id`).
- 49 fichiers sous `apps/api/src` référencent `project_needs` (services,
  gardes d'architecture, démo, matching, analytics, chaînes, playbooks…) ;
  rendre le projet optionnel touche potentiellement chaque lecture qui
  remonte au compte par ce chemin — pas seulement `open-needs.service.ts`.

**Conclusion mesurée : ce n'est PAS une contrainte côté écran.** #2558.1 exige :
(1) élargir `project_needs.project_id` en NULLABLE, (2) ajouter une colonne
`account_id` PROPRE à `project_needs` (le compte devient alors atteignable
sans projet), son report/backfill pour les lignes existantes, (3) une route de
création qui accepte un compte SANS projet (la route actuelle porte le projet
dans l'URL, pas dans le corps), (4) réécrire chaque lecture qui fait
aujourd'hui un JOIN obligatoire projet→compte pour lire
`COALESCE(need.account_id, project.account_id)`. C'est une ouverture de
contrat sur le schéma et ~5 services, pas une ligne — même diagnostic que
celui déjà écrit par le lot précédent.

## Décision de ce lot

Vu le budget d'un seul lot borné et la garde ZÉRO régression — l'`INNER JOIN`
ci-dessus est exactement le genre de lecture qu'une migration à moitié faite
casse en silence — je ne me lance pas dans la migration dans cette passe :
une écriture partielle (schéma élargi, aucune route ni lecture mise à jour)
laisserait une colonne que personne n'écrit, le défaut nommé par ce dépôt :
« du code juste, calculé, testé, que personne n'appelle ». **#2558.1 reste
`retenu`**, avec la recommandation ci-dessous plutôt qu'un arbitrage que je
me serais donné moi-même.

**Recommandation pour le lot qui suivra** (dans cet ordre, chaque étape
livrable et testable seule) :

1. Migration additive : `ALTER TABLE project_needs ALTER COLUMN project_id
   DROP NOT NULL` + `ADD COLUMN account_id uuid REFERENCES accounts(id)` +
   backfill de `account_id` depuis `opportunities.account_id` pour les
   lignes existantes + `CHECK (project_id IS NOT NULL OR account_id IS NOT
   NULL)`.
2. Route de création qui accepte `{ accountId, projectId?: null }` — pas de
   projet dans l'URL quand il n'y en a pas (la route actuelle ne peut pas
   porter cette forme sans casser `:id`).
3. `open-needs.service.ts` (et les autres lectures recensées ci-dessus) :
   `leftJoin` au lieu d'`innerJoin`, `COALESCE(need.account_id,
   project.account_id)`.
4. `NeedWizard.tsx` : un geste EXPLICITE « Créer sans projet » (jamais
   implicite) qui résout le compte comme `useCreateImplicitProject` le fait
   déjà, mais sans créer de projet.
5. Démo (`demo-dataset.ts` + `demo-coverage.ts`, au moins une mission sans
   projet) + i18n FR/EN, une fois l'écran réel.

## #2558.2 — créer un projet depuis la création de mission

**Déjà livré**, sans rapport avec le travail de ce lot :
`apps/web/src/features/projects/hooks/useCreateImplicitProject.ts` + le
bouton « Crée-en un » dans `NeedWizard.tsx:489-518` (fonction `createProject`,
lignes 168-182) — arbitrage de Louis du 16/09/2026 (#2174.1), livré dans le
même commit `a685ad17e` que la mesure de #2558.1 ci-dessus. Le compte est
résolu d'abord (`accountsApi.addToPortfolio` — crée le compte au portefeuille
s'il est inconnu, ne duplique jamais, D6) PUIS le projet créé
(`projectsApi.create`), sans quitter l'assistant, sans donnée fictive (le
compte/projet portent le nom réel tapé par le commercial). Non ré-exécuté par
mes soins : `node_modules` absent de cette worktree (`pnpm install` non
lancé — hors périmètre d'un lot qui ne modifie pas ce code), confirmé par
lecture de code (`useCreateImplicitProject.test.tsx` existe) et par la CI
verte du commit déjà fusionné sur `main`.

## Table

| Point | La demande, en huit mots | Sujet | État | Preuve en recette |
| ----- | ------------------------- | ------ | ---- | ------------------ |
| #2558.1 | Mission sans projet : rendre le rattachement optionnel | backend + web | recetté | RECETTÉ 21/09/2026 au CODE sur le commit SERVI en production (5483e3631), appelant cité : migrations/1795711263408-NeedWithoutProject.ts (account_id NOT NULL, project_id nullable) ; NeedWizard.tsx:224 ; projects.controller.ts:563 @Post('needs') |
| #2558.2 | Créer un projet depuis la création de mission | web | déjà là | `a685ad17e` — `useCreateImplicitProject.ts` + `NeedWizard.tsx` (#2174.1, 16/09/2026), CI verte sur `main` |
