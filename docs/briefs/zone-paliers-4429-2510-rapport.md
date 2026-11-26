# ZONE-PALIERS-4429 — rapport (25/10/2026)

**Branche** `claude/zone-paliers-4429-2510` (base `origin/main` f3b199c180), pas de PR.
**Commits** : `2466e20c1a` (IA + contrat : l'échelle, le 100 km, Laura) · `343aef4284` (web + démo : geste, nom des barreaux, classement).

## L'échelle (une seule, GA-26)

`ville → 100 km → grande région → France`, un barreau à la fois, arrêt dès le seuil (10 comptes **affichables**, seuil inchangé).
Vit dans `packages/contracts/src/schemas/zone-tiers.ts` + son miroir `apps/ia/app/services/zone_tiers.py` + `zone-tiers.constants.json`
(garde de parité existante). L'échelle du 21/10 reste écrite dans l'issue et dans les docstrings ; elle n'est plus automatique.
Le rayon manuel (10/25/50) n'est pas touché (`MANUAL_RADIUS_KM`, `LAURA_RADIUS_KM = (25, 50)` inchangé pour Laura).
Le rayon par défaut de 25 km (#4515) est le **point de départ**, pas un barreau : son premier élargissement est 100 km.

## Mécanisme des 100 km — et pourquoi

`/near_point` plafonne à 50 km (`recherche_entreprises.MAX_RADIUS_KM`). Retenu : **sept cercles de 50 km** (`apps/ia/app/services/zone_cover.py`),
un au centre de la commune résolue et six à `R·√3/2` ≈ 86,6 km, tous les 60° — le recouvrement optimal d'un disque par 7 disques égaux (rayon = R/2).
Même endpoint, mêmes filtres, **aucun appel réseau neuf, aucune donnée neuve**. Les cercles débordent (jusqu'à ~136 km) : tout compte à distance
**mesurée** > 100 km est écarté ; un compte **sans position** n'est gardé que s'il vient du cercle central (≤ 50 km prouvé). Interrogation du
centre vers la périphérie, arrêt dès le seuil dans le barreau.
Écartés : « départements dont le chef-lieu < 100 km » (le dépôt n'a aucune table de coordonnées de chefs-lieux ; la recopier de mémoire serait une
donnée devinée ; un département n'est pas un cercle) ; un appel géographique neuf par département.
Coût : jusqu'à 7 passes au lieu d'1 sur ce barreau, bornées par `registry_deadline` et le throttle partagé.

## Critère → commit → AVANT → APRÈS (lu par le test)

| #   | Critère                                                | Commit            | AVANT (lecture du code d'origin/main + mesure de l'issue)                               | APRÈS (test)                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------ | ----------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Aucun saut : 0 sur la ville → 100 km, jamais la France | 2466e20           | échelle 25→50→dép.→région→France ; côté web `widenPreciseAxis` vidait ville+dép.+région | `test_zero_a_lille_le_premier_elargissement_est_100_km_jamais_la_france`, `test_le_saut_lille_france_est_interdit_…` (france jamais appelée) ; contrat : `zoneTiersAfter('city')[0] === 'radius_100'`                                          |
| 2   | Un par un, arrêt au seuil                              | 2466e20           | idem, sur l'ancienne échelle                                                            | `test_les_barreaux_s_enchainent_…` (ordre des appels), `test_seuil_atteint_a_100_km_la_region_n_est_pas_interrogee`                                                                                                                            |
| 3   | Chaque barreau nommé + geste vers le précédent         | 2466e20 + 343aef4 | un seul geste « Revenir à X seule »                                                     | `zoneWidening.steps` ; `ZoneWideningNotice.test` (« Barreaux franchis : 100 km → la grande région → toute la France », « Revenir à la grande région », « Revenir à 100 km ») ; `zoneCeiling` : `test_le_plafond_de_zone_…`, `applyZoneCeiling` |
| 4   | Assez sur la ville → aucun élargissement (#3876)       | 2466e20           | tenu                                                                                    | `test_dit_non_assez_de_comptes_sur_la_ville_aucun_elargissement` (un seul appel, `city`)                                                                                                                                                       |
| 5   | Le geste manuel ne vide plus ville+dép.+région         | 343aef4           | `{city:'',department:'',region:[]}`                                                     | `widenZoneOneStep` : 5 cas (`discover-filters.test.ts`)                                                                                                                                                                                        |
| 6   | Même échelle Laura / Découvrir, une implémentation     | 2466e20           | Laura passait déjà par `/discover/registry`                                             | `test_laura_n_a_pas_sa_propre_echelle` + `test_laura_dit_le_barreau_100_km_…`                                                                                                                                                                  |

Autres tests : géométrie du recouvrement (grille de 1 440 points du disque de 100 km, tous à ≤ 50,5 km d'un centre ; un point à 150 km dit NON),
appels toujours ≤ 50 km, 7 centres distincts, compte mesuré à 120 km écarté / à 80 km étiqueté « à 80 km », compte sans position d'un cercle périphérique écarté.

## Démo (craft rule n°9) — `DEMO_DISCOVER_ZONE_WIDENING_COVERAGE`

Reste **seedée** (raison réécrite). « Toulouse » : 2 comptes de la salle ; rien à 100 km ni en Occitanie → deux barreaux franchis à vide, nommés
(`steps: ['radius_100','region','france']`), palier atteint France. `zoneCeiling` ou `zoneStrict` : aucun élargissement. Prouvé par
`demo-discover-zone-widening.spec.ts` (4 tests) ; `demo-coverage.spec.ts` (91) vert. Aucune table ni clé `raw_analysis` neuve.

## Recherche par compétence

Le moteur d'offres lit des **départements**, pas un cercle : pas de barreau 100 km ; `ville → région → France` (l'ancien barreau « département »
est retiré, il aurait été un saut vers un autre maillage). Dit dans la docstring de `_widen_skill_by_zone`.

## Ce que je n'ai pas pu prouver sans réseau

- Le nombre réel de comptes à 100 km de Lille / Toulouse (registre public non interrogé) ; la durée réelle des 7 passes ; la tenue du quota 7 req/s.
- Que le registre publie une position pour la plupart des sites : sinon les comptes sans position des cercles périphériques sont écartés (au détriment du rappel, jamais de la vérité).
- Aucune suite complète lancée (CI). `tsc --noEmit` web : exit 0. Tests lancés : pytest (échelle, zone, Laura, compétence, dossier : 58 verts + 19), vitest contrats (10), vitest web (zone/filtres/notice/gardes i18n+thème+noms accessibles : 313), jest démo (4 + 91).

## Hors périmètre (volontairement)

- Élargir quand une SOURCE a échoué : non tranché, non touché.
- `prompts/thread_state.py:54` (« une ville vers sa région », consigne de second passage du modèle, #3343) : laissé tel quel ; le tour de Laura qui passe par `run_account_search` suit l'échelle du serveur.
- `tests/test_discover_request_reading.py::test_a_slow_place_lookup_…` échoue **déjà sur origin/main** (« la lecture a mangé 4.85s », identique avant/après mes commits) — non lié.
