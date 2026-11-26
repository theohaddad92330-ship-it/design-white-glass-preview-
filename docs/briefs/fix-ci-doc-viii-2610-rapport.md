# Correctif GA-413 (doc suit le code) — PR #4580, branche claude/integ-2510-viii

Geste choisi pour les trois fiches : **mise à jour de la fiche** (aucun `Doc-inchangée:`), diff lu à chaque fois.

- `criteria-referential.md` — `WideningNotice.tsx` : `WideningBanner` gagne `onZoneStepBack` (« Revenir au barreau d'avant », plafond `ZoneCeiling`) transmis à `ZoneWideningNotice`. Comportement nouveau → paragraphe « un barreau à la fois » ajouté au palier de zone.
- `crm-adaptateur-commun.md` — Zoho (#4380) : le contrôleur lit `?error=` et renvoie un texte lisible (`zohoFailureReason`) nommant centre de données et URI de redirection, jamais la clé. Comportement du rappel changé → paragraphe ajouté (les deux specs ne font que le tester).
- `demo-mode.md` — `demo-coverage.ts` : la raison de `DEMO_DISCOVER_ZONE_WIDENING_COVERAGE` décrit l'échelle révisée (ville → 100 km → région → France, `steps`, `zoneCeiling`) → entrée de la fiche réécrite (l'ancienne disait « 25/50 km »).

rc de la garde (racine, `origin/main...HEAD`) : **0**, les trois fiches `ok`.
