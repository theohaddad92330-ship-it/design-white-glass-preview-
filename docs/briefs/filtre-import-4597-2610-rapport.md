# #4597 — un fichier importé est retrouvable (rapport de lot)

Branche `claude/filtre-import-4597-2610`, base `d7e6ab01`. Preuve de prod (issue) : « Mon CRM » = 1 080 contacts = « contacts.csv — 1 080 créés ».

## Fait

1. **Puce « Importés »** — Portefeuille (`AccountsImportedChip`, `imported=only`, compteur `imported`) et Répertoire (`source=import`, `channelTally.imported`). Absente à zéro/inconnu (GA-18/19), sauf active.
2. **« Mon CRM » ne compte plus que le CRM** — ⚠️ **renverse #4526.4** (24/10, « crm + import ») : `CRM_LINKED_ACCOUNT_PREDICATE` (`origin = 'crm'`, `source = 'crm'`) et `MON_CRM_SOURCES = ['crm']`. Nommé dans le code, les tests et les commits. Aucune puce de regroupement.
3. **Un import précis** — colonne `import_job_id` (contacts, comptes ; migration additive nullable, index partiel) posée par l'import universel à la création ; filtre `importJob` (API + URL) ; lien « Voir les N contacts / comptes de cet import » dans « Imports & sources » ; puce « Cet import » qui se relâche.
4. **Origine = filtre** — cliquer l'origine d'une ligne du Répertoire pose `source=<origine>` (cible ≥ 44 px, `stopPropagation`).

- **Visuel** : la puce CRM prend la grammaire partagée `chipClassName` (32 px ; 44 px seulement sous pointeur grossier).
- Démo : `Kiabi` en `origin = 'import'`, trois contacts `source = 'import'`, fiches marquées de l'import de l'historique ; `demo-coverage.ts` classé.

## Choix à connaître

- **Pas de backfill** : les fiches importées AVANT la colonne n'ont pas d'identifiant d'import ; deviner par fenêtre de dates inventerait une appartenance. Leur import n'a donc **pas de lien « voir »** (aucune clé `linked`, jamais « 0 ») — elles restent trouvables par la puce « Importés ».
- Un compte sans origine compte comme « Importé » s'il porte `import_job_id` ou un contact `source = 'import'` (lecture seule, `origin` jamais réécrit).
- Une seule puce « Importés » (GA-26) ; le détail par import vit dans « Imports & sources ».
- Hors périmètre touché par nécessité : `packages/contracts` (filtres, compteurs, `MON_CRM_SOURCES`), `universal-import` (planner/service), `routes/`, entités, migration.

## Pas fait

- Colonne Origine côté **Portefeuille** : n'existe pas (rien à rendre cliquable).
- Aucun renommage/backfill des origines déjà écrites.
- Recette écran en navigateur et suite complète : travail de la CI.
