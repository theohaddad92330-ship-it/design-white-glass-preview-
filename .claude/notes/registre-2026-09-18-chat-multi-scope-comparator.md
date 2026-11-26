base : 6ea2f13b1 — 21/09/2026 (balayé, aucun point déplacé ; base précédente 93f7a4044 — 18/09/2026) ‖ réconcilié contre 7d11787d9be5e0e7f17102e0ffcd5b39bfb5a379 — 22/09/2026 (R2, +298 commits) : 17 points retenu revérifiés (need-verdict.ts, business_rules.py, contact-score.ts, account-board.ts, competitor_intel.json, siteGeo.ts) — aucun commit sur ces chemins depuis le 21/09, 0 flip

# Registre — #2303 LAU-FINAL-044 — multi-scope account comparator

Mesure faite par `git grep` contre `origin/main` (sha ci-dessus). État `écarté` interdit —
tout point qui heurte la doctrine reste `retenu` et part en question (voir rapport de l'agent).
Prior art notable : `packages/contracts/src/schemas/need-verdict.ts` porte déjà
`axisUnmeasured(axis, reason)` — un axe non mesuré sort du calcul avec un motif nommé, exactement
le mécanisme doctrinal GA-18/19 — mais pour un VERDICT DE BESOIN (#2322-2324), pas pour un
comparateur de PÉRIMÈTRES DE COMPTE. Aucun comparateur multi-périmètre de compte trouvé (0
résultat pour « choix principal/remplacement/à éviter »).

## #2303 — LAU-FINAL-044 — multi-scope account comparator

| numéro | demande en huit mots | sujet | mesure | état | preuve |
|---|---|---|---|---|---|
| 2303.1 | Comparer l'adéquation avec l'offre par périmètre | axe : adéquation offre | account_fit_score_25 | déjà là | apps/ia/app/knowledge/business_rules.py:133 — existe en ANALYSE de compte, pas prouvé branché à un comparateur multi-périmètre |
| 2303.2 | Comparer la pertinence sectorielle par périmètre | axe : pertinence sectorielle | NAF matching (_naf_matches) | déjà là | apps/ia/app/services/entities.py |
| 2303.3 | Comparer le signal actuel par périmètre | axe : signal actuel | dated_signals.py | déjà là | apps/ia/app/services/dated_signals.py |
| 2303.4 | Comparer le recours externe observé par périmètre | axe : recours externe observé | git grep recours externe scope comparateur | reformulé | HORS LOT 24/09 → épopée #2790 (moteur de comparaison multi-périmètres absent) — tranché sans Louis |
| 2303.5 | Comparer l'autonomie locale par périmètre | axe : autonomie locale | itAutonomySchema | déjà là | packages/contracts/src/schemas/analysis/primitives.ts |
| 2303.6 | Comparer la voie d'achat par périmètre | axe : voie d'achat | git grep voie d'achat scope comparateur | reformulé | HORS LOT 24/09 → épopée #2790 (moteur de comparaison multi-périmètres absent) — tranché sans Louis |
| 2303.7 | Comparer la relation workspace par périmètre | axe : relation workspace | commercial_status | déjà là | packages/contracts/src/schemas/account-board.ts:22 |
| 2303.8 | Comparer les contacts pertinents par périmètre | axe : contacts pertinents | contact-ranking.ts + perimeterTier | déjà là | packages/contracts/src/schemas/contact-ranking.ts |
| 2303.9 | Comparer la concurrence par périmètre | axe : concurrence | competitor_intel.json | déjà là | apps/ia/app/knowledge/competitor_intel.json |
| 2303.10 | Comparer la barrière de référencement par périmètre | axe : barrière de référencement | git grep barrière référencement scope comparateur | reformulé | HORS LOT 24/09 → épopée #2790 (moteur de comparaison multi-périmètres absent) — tranché sans Louis |
| 2303.11 | Comparer la localisation par périmètre | axe : localisation | siteGeo.ts | déjà là | apps/web/src/features/accounts/view/account-detail/components/sites/siteGeo.ts |
| 2303.12 | Comparer la capacité commerciale nécessaire par périmètre | axe : capacité commerciale nécessaire | business_units porte la capacité de l'UTILISATEUR, pas du périmètre cible | reformulé | HORS LOT 24/09 → épopée #2790 (moteur de comparaison multi-périmètres absent) — tranché sans Louis |
| 2303.13 | Comparer la qualité des données par périmètre | axe : qualité des données | dossierReliability /100 | déjà là | apps/web/src/i18n/locales/fr/accountDetail.json:30 (score.dossierReliability, « Fiabilité du dossier ») |
| 2303.14 | Comparer les inconnues par périmètre | axe : inconnues | doctrine + axisUnmeasured (need-verdict.ts) | déjà là | packages/contracts/src/schemas/need-verdict.ts:222 (`axisUnmeasured`) — pattern existant, scope besoin pas périmètre |
| 2303.15 | Comparer le risque par périmètre | axe : risque | tag RISQUE existe pour les CONTACTS, pas les périmètres | reformulé | HORS LOT 24/09 → épopée #2790 (moteur de comparaison multi-périmètres absent) — tranché sans Louis |
| 2303.16 | Comparer le premier test/action à faire par périmètre | axe : premier test | git grep premier test scope comparateur | reformulé | HORS LOT 24/09 → épopée #2790 (moteur de comparaison multi-périmètres absent) — tranché sans Louis |
| 2303.17 | Comparer uniquement les axes couverts par les deux périmètres | normalisation : axes couverts seulement | axisUnmeasured pattern | déjà là | packages/contracts/src/schemas/need-verdict.ts:222 — pattern existant ailleurs, pas prouvé pour ce comparateur |
| 2303.18 | Ne jamais traiter une donnée inconnue comme une mauvaise note | normalisation : inconnu ≠ mauvaise note | doctrine GA-18/GA-19 + axisUnmeasured | déjà là | CLAUDE.md doctrine (« Non mesuré n'est jamais 0 ») + need-verdict.ts:222 |
| 2303.19 | Afficher l'état « mesuré » d'un axe | normalisation : état mesuré | git grep vocabulaire mesuré/inconnu/non applicable/à vérifier | reformulé | HORS LOT 24/09 → épopée #2790 (moteur de comparaison multi-périmètres absent) — tranché sans Louis |
| 2303.20 | Afficher l'état « inconnu » d'un axe | normalisation : état inconnu | idem | reformulé | HORS LOT 24/09 → épopée #2790 (moteur de comparaison multi-périmètres absent) — tranché sans Louis |
| 2303.21 | Afficher l'état « non applicable » d'un axe | normalisation : état non applicable | idem | reformulé | HORS LOT 24/09 → épopée #2790 (moteur de comparaison multi-périmètres absent) — tranché sans Louis |
| 2303.22 | Afficher l'état « à vérifier » d'un axe | normalisation : état à vérifier | idem | reformulé | HORS LOT 24/09 → épopée #2790 (moteur de comparaison multi-périmètres absent) — tranché sans Louis |
| 2303.23 | Ne jamais avantager mécaniquement le périmètre le plus documenté | normalisation : no-go biais documentation | doctrine GA-18/19, mécanisme axisUnmeasured empêche le biais | déjà là | packages/contracts/src/schemas/need-verdict.ts:222 — le mécanisme sort l'axe du calcul plutôt que de le compter à zéro, ce qui évite structurellement ce biais |
| 2303.24 | Produire un choix principal parmi les périmètres comparés | verdict | git grep choix principal scope comparateur | reformulé | HORS LOT 24/09 → épopée #2790 (moteur de comparaison multi-périmètres absent) — tranché sans Louis |
| 2303.25 | Produire un choix de remplacement parmi les périmètres comparés | verdict | idem | reformulé | HORS LOT 24/09 → épopée #2790 (moteur de comparaison multi-périmètres absent) — tranché sans Louis |
| 2303.26 | Produire un choix à éviter pour le moment | verdict | idem | reformulé | HORS LOT 24/09 → épopée #2790 (moteur de comparaison multi-périmètres absent) — tranché sans Louis |
| 2303.27 | Nommer l'information qui pourrait changer le classement | verdict : info qui changerait le classement | git grep changerait le classement scope comparateur | reformulé | HORS LOT 24/09 → épopée #2790 (moteur de comparaison multi-périmètres absent) — tranché sans Louis |
| 2303.28 | Restituer la comparaison en tableau synthétique dans Laura | format : tableau synthétique | git grep tableau comparateur scope chat | reformulé | HORS LOT 24/09 → épopée #2790 (moteur de comparaison multi-périmètres absent) — tranché sans Louis |
| 2303.29 | Ouvrir Analyser avec les périmètres comparés déjà sélectionnés | format : handoff Analyser pré-sélectionné | recoupe #2299.43 (handoff Analyser absent) | reformulé | HORS LOT 24/09 → épopée #2790 (moteur de comparaison multi-périmètres absent) — tranché sans Louis |
| 2303.30 | Ne jamais relancer une collecte si les données comparables existent déjà | format : no-go relance inutile | enrichmentCooldown (#2297.47), scope enrichissement pas comparateur | reformulé | HORS LOT 24/09 → épopée #2790 (moteur de comparaison multi-périmètres absent) — tranché sans Louis |
| 2303.31 | Ne jamais réduire la comparaison à un score global unique qui masque les raisons | NO-GO (explicite de l'issue) | doctrine « score jamais nu » + axisUnmeasured/axisBreakdown | déjà là | packages/contracts/src/schemas/need-verdict.ts + apps/web/.../BellumReadCard.tsx:43 (`hasAxisBreakdown`) — le principe est déjà tenu ailleurs dans le produit (score toujours accompagné de ses axes) |
