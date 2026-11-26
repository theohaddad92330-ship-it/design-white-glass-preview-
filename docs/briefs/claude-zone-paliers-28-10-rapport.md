# Rapport N6 — claude/zone-paliers-28-10 (zone, paliers, fichiers importés)

Branche `claude/zone-paliers-28-10`, SHA poussé : voir `git log` (dernier commit de ce rapport). Registre : `.claude/notes/registre-2026-10-28-n6.md`.

- **#4572.6** — `discover-presets.ts` (`territoryTrackHintKey`) ← `Discover.tsx` (carte Territoire) ; garde : `discover-presets.test.ts`.
- **#4429.3** — `zone_tiers.py` (`laura_reach_line`) ← `chat_tools.py` (`reach_line`) ← `laura_acts.py` (`ensure_widening_line`) ; gardes : `test_4429_laura_zone_tiers.py` (5 tests dont « liste pleine sans rayon : rien »).
- **#4429.4** — `ZoneWideningNotice.tsx` (`ceilingStep`) ← `WideningNotice.tsx` ← `Discover.tsx` (bandeau rendu aussi à 0 ligne quand un retour est posé) ; garde : `ZoneWideningNotice.test.tsx`.
- **#4433.3** — `zone-tiers.ts:211` + `zone_tiers.py:241` : « Élargi à 100 km · à 38 km de X » ; gardes : `zone-tiers.test.ts`, `test_4429_zone_tiers.py`, `discover-zone-widening.test.ts`.
- **#4433.9** — contrat `zone_widened` (`discover-origin.ts`) ← `discoverOriginCriteriaFor` ← `DiscoverOriginLine.tsx` ; démo TotalEnergies (`demo-dataset.ts`) ; gardes : `discover-filters.test.ts`, `DiscoverOriginLine.test.tsx`, `discover-origin.test.ts`, spec démo.
- **Mesure** « java, Hauts-de-France » : cartes élargies à 100 km portant un libellé avec « Élargi » : avant 0/N (libellé « à N km de X »), après N/N (test de libellé) ; comptes classés par un fichier importé : non mesurable hors prod (aucun import dans l'espace de Louis).
- **Jumeau trouvé** : `demo-discover-origin-verdict-coverage.spec.ts` était rouge sur main (offre #4646 absente de l'attendu) — corrigé.
- **c144** : aucune divergence (`ZONE_AUTO_MAX_TIER = region` des deux côtés, geste manuel = un barreau).
- **Portes** : vitest ciblés (presets, notices, filtres 180, origin line, reply-blocks) 0 ; contracts 33 ; pytest 5 fichiers zone/Laura 73 + laura_acts 48 ; jest démo 5/5 ; tsc web 0 `error TS` ; `check-types:tests` API 0. Hook pre-push knip vert.

**Questions** : (1) Mes cibles/veille : afficher le palier demande de projeter `discover_origin_criteria` dans la liste — on le fait ? (2) #4426.2/.4/.7 : le FAIL vient de l'absence d'import dans l'espace de Louis, pas d'un défaut de code ; les fichiers de Julien ne voyagent pas (vérifié : planner, grille, personas, séquences filtrent par espace). À rejouer par un dépôt dans cet espace. (3) #4421.3 : reste de donnée (contacts « à identifier »), non reproductible ici. Aucun TDD rouge-avant pour la bannière 4429.4 (écrit avec le code) : signalé.
