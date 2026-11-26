# Refusion main → integration/vague3-01-11 (PR #5110)

- Merge `origin/main` (pas de rebase) ; seul conflit : `apps/ia/app/routers/discover.py` (`zoneCeiling`).
- Résolu en gardant les deux côtés : barreau `radius_50` (#5125/#5127) + `zoneRaise` (#4433.3, vague 3). Rien retiré.
- Web fusionné sans conflit (Discover.tsx, i18n fr/en).
- pytest (5 fichiers : 4433_3 ×2, 4673_palier_25, 4429_echelle_100km, 4429_zone_tiers) : 40 passés.
- Web : contracts build + `tsc --noEmit -p apps/web` : vert (@bellum/shared n'a pas de script build).
- Non lancé : suite complète / `pnpm ci:local` (travail de la CI).
