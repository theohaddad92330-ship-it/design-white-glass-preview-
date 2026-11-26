# Lot 121 — Découvrir · #4754 — la bascule du segment `signals`

Périmètre : packages/contracts/src/schemas/segment-catchup.ts

## Antériorité

- #4754 HIST-A (PR #4764) a livré la collecte profonde : France Travail, APEC et ATS stockent et estampillent `historical` (365 → 1095 j), `sinceDays` = 1095 des deux côtés, fenêtres nommées dans `agent_docs/env-reference.md`. Garde #4754, rien n'est recodé (coupe `_MAX_AGE_DAYS` / `_HISTORY_MAX_AGE_DAYS` déjà là).
- Le dernier commentaire de l'issue (29/10) mesure que `SEGMENT_CAPABILITY_HISTORY.signals` n'a pas d'entrée #4754 : un compte analysé avant n'est jamais « concerné », le bandeau « collecte antérieure » reste muet. Doctrine #2543 (rattrape l'existant) et #2655.2 (la date se déduit du registre) : gardes.
- #4724 / PR #4730 (TheirStack, single-flight) : non touché, ce lot n'ajoute aucun appel payant.

## Livré

- Entrée `#4754` au registre `signals` (commit `003d5bf9`, 2026-10-28T18:14:46Z) + test rouge→vert.

## Non livré, et pourquoi

- `signal_history` « exploitable même si la source ne le rend plus » : aucun fichier de #4764 ne le livre ; exige un lecteur de mémoire des signaux, hors lot borné d'un fichier de contrat → à découper.
- Preuve à l'écran sur un compte réel : pas de navigateur ni de données de production ici.
- Profondeur réelle par source : toujours « À préciser » (non mesurée).
