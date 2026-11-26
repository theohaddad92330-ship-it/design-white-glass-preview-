# Rapport — L3 Agenda : brief de réunion et conflits

Branche `claude/vieilles-l3-agenda-brief` (depuis origin/main 96088514). Aucune PR (le fil l'ouvre).

| Point                                                 | Statut                                                                                                                                                            |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2097.38 ouverture du détail `MOTION.reveal`           | livré — panneau d'objectif (`MeetingPrepDialog.tsx`, OutcomePanel), fondu rejoué au changement de posture ; test `MeetingPrepDialog.r1r2.test.tsx`                |
| 2102.4 importance = type de réunion                   | livré — ligne par carte + phrase de synthèse, lues sur `isExternal` ; « aucun ne prime d'office » conservé (#2390.15) ; démo : `demo-event-interne-chevauchement` |
| 2102.8 message de notification                        | livré — la confirmation montre « nouvel horaire X (au lieu de Y) » aux invités, seulement s'ils sont prévenus (`agenda.reschedule.notifyPreview`)                 |
| 2102.22 influence hiérarchisée                        | livré — `meeting-brief-inputs.ts` (`influenceRank`), tri stable, rôle non établi en dernier                                                                       |
| 2102.31 inconnues par bloc                            | livré — `unknowns` (contrat + assembleur + `MeetingBriefBlocks.tsx`), 5 clés fermées FR/EN ; liste vide = aucune ligne                                            |
| 2102.35 Renouvellement / 2102.36 Entretien consultant | livré — fin d'enum, objectif + questions déterministes, choix manuel, jamais dérivés                                                                              |
| 2102.45 rappel T-1                                    | non fait, par arbitrage (lot routines)                                                                                                                            |

Tests (rouge → vert) : contracts `meeting-brief`, `meeting-r1-r2`, `meeting-brief-content` ; web `meeting-brief-inputs(.added)`, `MeetingBriefBlocks`, `MeetingPrepDialog.r1r2`, `ConflictDialog`, `motion-grammar` ; api `demo-agenda*`, `demo-coverage`, `demo-briefing`. `tsc -p packages/contracts` propre ; `tsc -p apps/web` NON exécutable ici (exige `packages/contracts/dist`, donc un build interdit).

Questions / débordements :

1. `ConflictDialog.tsx` vit dans `features/briefing/view/`, pas `agenda/view/` comme le périmètre le dit : modifié là (seul appelant réel).
2. `RescheduleDialog.tsx` (drag de l'agenda, hors périmètre) n'a pas l'aperçu de notification : à étendre si voulu.
3. `meeting-r1-r2.test.ts` : `slice(-2)` → `slice(-4,-2)` et longueur 12 → 14 (ajout en fin d'enum, ordre relatif gardé ; rien d'affaibli).
4. Fichiers chauds : fragment `changes/vieilles-l3-agenda-brief.yml` (changelog FR/EN + `DEMO_AGENDA_CONFLICT_IMPORTANCE_COVERAGE`), validé en l'appliquant puis revert ; à fusionner via `tools/issues/fusion_fragments.py`.
5. L'ancienneté dans le poste est déclarée inconnue sur CHAQUE brief (aucun champ ne la porte) — voulu ?
