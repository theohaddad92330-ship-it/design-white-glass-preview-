# Brief — vieilles issues, vague 7 — écrans (#2915.3 + /projects archivage + alias /pipeline)

Contrat VALIDÉ par Louis le 31/10/2026.

## Ce que je fais — défauts vus en recette prod 31/10 (prod f3c271fe35)

1. #2915.3 — L'historique des analyses n'affiche que la DATE (31/10). ATTENDU : date ET heure locale (« 31/10 à 14:05 »), via le formateur de date existant (garde « provenance-date-is-formatted-once »), FR + EN. Date inconnue : rien (jamais « Invalid Date »).
2. /projects (affaires) — après « Archiver », la carte RESTE dans le kanban alors que « 1 archivée » s'affiche, même après rechargement ; après « Désarchiver », la liste « Archivées » reste périmée. ATTENDU : archiver retire la carte du kanban immédiatement (et au rechargement : vérifier l'API) ; désarchiver la retire de « Archivées » et la remet au kanban. Invalider TOUTES les requêtes concernées. Garde #4137.
3. /pipeline rend 404 : l'ajouter aux anciennes adresses (apps/web/src/lib/legacy-addresses.ts) vers /projects, requête et ancre gardées, avec son test.

## Je ne fais PAS

Aucun changement de calcul, de droit, ni de donnée existante ; aucune page retirée.

## Je défais

Rien. Garde #2915, #4137, #4197.2.

## Droits / Démo

Inchangés. Rien à semer.

Périmètre : apps/web/src/** · locales FR+EN · apps/api/src/modules/projects/** · opportunities/** · analysis/** (lecture) · packages/contracts/src/** · CHANGELOG* · changes/** · docs/briefs/**
