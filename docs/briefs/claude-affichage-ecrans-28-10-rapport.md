# Rapport — lot N7 « ce que les écrans affichent » (28/10/2026)

Branche `claude/affichage-ecrans-28-10` (SHA poussé : voir `git log` de la branche). Registre : `.claude/notes/registre-2026-10-28-n7.md` (13 points).

- **#4628.4** livré — `Discover.tsx` `resumeLastSearch` ← bouton « Reprendre » : le rail se pose dans le geste (pré-remplissage seul, #4490 tient). Test `Discover.lastSearch.test.tsx` (navigation coupée : rouge « Tous les secteurs » avant, vert après).
- **#4616.2** livré — `pg-pool-watchdog.ts` `logPoolPressure` ← `PgPoolWatchdogService.tick` : une ligne/minute dès file > 0 ou tenues ≥ 80 % du plafond. Test `pg-pool-watchdog.spec.ts`. Plafond inchangé.
- **#4573.10** livré — `demo-reset.service.ts` `releaseVisitorOriginals` ← `purgeAndSeed` : originaux de pack et de CV retirés du seau avant la purge. Test `demo-reset.service.spec.ts`. Les objets du semis restent (chemins stables, voulu).
- **#4582.1, #4595.3, #4500.4, #4516.4** déjà là sur main (appelants et tests dans le registre). Test ajouté pour #4516.4 (`discover-profile-size.test.ts`).
- **#4487.4, #4616.3, #4616.4, #4617.5, #4617.6** restent `retenu` : preuve en production (Pipedrive réel, Sentry, EXPLAIN, journaux Railway) impossible depuis la VM. Arithmétique des crons dans le registre (14 h 50 ⊂ `*/10`, 08 h 45 ⊂ `*/15`).
- **#4543.2, #4543.5** `à trancher` (voir questions).
- Jumeaux : aucun autre `track*` sans appelant ; aucun autre rendu de compteur hors `KeyFigureRow`.
- Portes : jest pg-pool-watchdog 14/14 (exit 0) ; jest demo-reset 77/77 (exit 0) ; vitest lastSearch/noAutoSearch/demoArrival 13/13 ; vitest profile-size 8/8 ; `turbo build packages/*` exit 0 ; tsc web 0 `error TS` (exit 0) ; `lint:exports:types` exit 0.

## Questions

1. **#4543.2** : faire émettre `unknowns` par l'analyse touche le prompt de `bellum_facts` + schéma + empreinte, et ne se vérifie que sur une analyse réelle. Je le lance en lot IA dédié ? Alternative sans modèle : IA calcule `unknowns` de façon déterministe (concurrence/achats vides) et le web ne lit plus que ce champ (supprime la double dérivation).
2. **#4543.5** : un `competitors` vide est-il un zéro mesuré ou un inconnu ? Rien dans `raw_analysis` ne dit si la concurrence a été cherchée. Il faut un marqueur de couverture (comme `signal_coverage`) avant de trancher.
3. **#4573.10** : aucune suppression d'espace réel n'existe — les originaux d'un espace supprimé resteraient. Issue à ouvrir ?
4. **#4516.4** : à rejouer en recette après remise à zéro de la démo (la FAIL du 26/10 précède #4628, 20 h 14).
