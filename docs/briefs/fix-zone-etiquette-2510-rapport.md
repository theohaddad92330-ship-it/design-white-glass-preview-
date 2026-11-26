# Rapport — FIX-ZONE-ÉTIQUETTE (25/10)

Branche `claude/fix-zone-etiquette-2510` (base origin/main), pas de PR.

## #4433.3 — l'étiquette de rayon ne ment plus

- Cause : `candidateZoneLabel` (contrat TS) et `candidate_zone_label` (miroir Python, Laura) repliaient sur
  « à moins de N km de X » dès que `distanceKm` manquait. La distance EST calculée (`_candidate_zone`, haversine) mais
  seulement quand le registre publie la position du site ; sinon le repli écrivait une proximité non mesurée.
- Fix : « à N km de X » uniquement sur une distance mesurée ET ≤ rayon du palier ; sinon « Ajouté par l'élargissement
  de zone » (critère d'entrée, aucune valeur). L'endroit reste dit par la ligne géographie de la carte (ville · dépt).
- Fichiers : `packages/contracts/src/schemas/zone-tiers.ts` (hors périmètre listé, mais c'est là que vit l'étiquette
  partagée — GA-26), `apps/ia/app/services/zone_tiers.py`, tests contrat/IA/web.
- NON corrigé (cause amont, à trancher) : pour une recherche en cercle, `_matching_establishment`
  (`recherche_entreprises.py`) ne lit pas `matching_etablissements` ; la ligne retombe sur le SIÈGE (ville, position,
  département). C'est probablement pourquoi des sièges parisiens entrent dans un cercle albigeois. Je n'ai pas pu le
  vérifier sans réseau et le changer modifierait ville/qualification des lignes : hors brief.

## #4429.4 — zone stricte visible

- `ZoneWideningNotice`/`WideningBanner` : état « Zone stricte : Albi seule » + bouton « Élargir à nouveau autour de
  Albi » (min-h-11), affiché seulement si `zoneStrict` est réellement posé sur la recherche en cours. Un palier
  appliqué l'emporte. i18n fr/en.

## #4429.3 — Laura

- (b) Un rayon demandé part aussi sans rayon (`zoneStrict`, sans paliers) et fusionne par SIREN : jamais moins que la
  ville seule. Corrige l'incohérence de filtre côté Laura ; la cause exacte côté registre (cercle `/near_point`) n'est
  pas mesurée ici, le superset la rend sans effet sur le résultat.
- (a) Un palier tenté se dit toujours, même si rien d'élargi ne survit aux retraits : « J'ai élargi à 25 km sans rien
  trouver de plus : 7 comptes à Albi ». Limite : si AUCUN palier n'a ajouté de compte côté registre (`added` vide),
  Découvrir et Laura n'ont toujours pas de ligne — pas de signal `zone_out` dans ce cas.

## Gates lancés

- pytest : test*4429_zone_tiers, test_4429_laura_zone_tiers, test_4429_3*_, test*4429_taille*_, test_r22_laura_agit_palier — vert (rouge→vert vérifié pour l'étiquette).
- vitest : discover-zone-widening, ZoneWideningNotice, WideningNotice, SurfaceWideningNotice, contracts zone-tiers — vert. `tsc --noEmit` web — propre.
- Non lancé : démo (`demo-coverage`) — aucune donnée/route neuve.
