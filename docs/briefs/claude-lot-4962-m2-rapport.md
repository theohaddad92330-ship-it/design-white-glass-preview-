# Rapport — Lot M2 : la ville + rayon garde les communes du cercle (#4627)

- **Branche** : claude/lot-4962-m2, SHA cece72f3b2 (fusion de claude/lot-4962-m faite en premier geste).
- **#4627 livré** : `discover-filters.ts` `passesCity(candidate, city, radiusKm)` — nom d'abord, puis, si rayon ≠ « ville exacte » et coordonnées connues des DEUX communes, distance haversine ≤ rayon ; sinon règle du nom (jamais deviné). Branché dans `applyRailConstraints` et `matchedSearchCriteria`.
- **Coordonnées** : `knownCityCoordinates` exporté de `siteGeo.ts` (table existante `CITY_COORDS`, 19 villes). LIMITE : le candidat ne porte aucune coordonnée ; seules ces villes sont « connues » — un référentiel de communes complet côté web (ou lat/lng dans la réponse Signaux) élargirait l'effet. À décider.
- **GA-275** : entrée `cityRadiusKm` de `discover-filters-reach-the-search.test.tsx` passée de `mute` à `screen` (« revient sur GA-275, décision Louis 31/10 : le rayon prime sur le nom ») ; elle dit toujours NON (Marseille écartée pour Lyon).
- **Tests** (rouge → vert) : `discover-filters.test.ts` +3 (Grenoble ~94 km gardée à 100 km, écartée à 50 km, Marseille ~275 km écartée, ville inconnue/« exacte » → nom). 4 specs, 301 tests verts. Rouge constaté sans le code.
- **Pas fait** : `tsc -p apps/web` (paquets non construits, TS6305, voir rapport M) ; aucun appel d'écran.
- **Hors périmètre** : `siteGeo.ts` (apps/web/src, une fonction exportée ajoutée).
