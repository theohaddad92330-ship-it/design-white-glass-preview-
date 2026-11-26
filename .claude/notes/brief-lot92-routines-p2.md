# Lot 92 — Routines · P2 (#4717)

Périmètre : apps/api/src/modules/routines/routine-catalog.ts, apps/api/src/modules/routines/routine-catalog-writes.spec.ts, *claude/notes/brief-lot92-routines-p2.md

## Ce que le lot fait
- Le champ `acceptance` de `contact_job_change` (fr + en) dit ce que le code écrit : notification, employeur relu
  consigné, séquences actives en pause, porte chez le nouvel employeur, contact en `historique` sur départ prouvé.
  Il nomme les bornes : jamais une ligne saisie à la main ou venue du CRM (archivage), jamais une suppression.
- Une garde (`routine-catalog-writes.spec.ts`) rapproche les écritures de la routine (appels de `applyJobChanges` et de
  `recordEmploymentCheck`) du texte : ajouter une écriture sans la déclarer ni toucher au texte fait échouer la CI.

## Ce que le lot ne fait pas
- Il ne retire aucune écriture (« il ne faut pas les retirer », #4717) et ne change aucun comportement.
- Pas de montée de `version` (le comportement ne change pas, seul le texte rattrape le code).
- Il ne touche pas au niveau `n1_prepare` de la routine alors qu'elle écrit : arbitrage produit → QUESTION à Louis.
- Il ne traite pas #4686 (BoondManager, même motif) ni les autres entrées du catalogue.
- Constat, non corrigé : `pauseSequencesForJobChange` ne filtre pas sur `source` (manual/crm), contrairement à l'archivage.

## Droits
Aucune surface d'accès touchée (pas de page, route, garde ni rôle).

## Décisions nommées
Aucun `#NNN` porté par les lignes modifiées (git blame : commit d'intégration #4565 sans décision datée sur ces lignes).
