# Rapport — CASCADE-PLANCHER-5 (25/10/2026)

Branche `claude/cascade-plancher-5-2510` (base `decouvrir-sources-4419-2510`). Code : `088dc5cf9f`. Pas de PR.

## Ce qui est fait

Moteur `apps/ia/app/services/offers_cascade.py` (pur, testé) + paliers `offers_cascade_tiers.py` + câblage dans
`it_job_signals_aggregators` (`job_aggregators.py`) et `phase1_research.py`. Tri métier (`keep`) appliqué à CHAQUE offre de CHAQUE palier.

| Palier    | Élargit                                                                                            | Rapporté dans les tests |
| --------- | -------------------------------------------------------------------------------------------------- | ----------------------- |
| 0 base    | Adzuna, Jooble, Fantastic.jobs (toujours interrogées si clé)                                       | 3 offres du métier      |
| 1 sources | Mantiks puis TheirStack (si clé), ouvertes quand les offres DU MÉTIER < 5 (avant : « rendu » ≥ 10) | +1 (test câblage)       |
| 2 termes  | formes voisines déclarées au référentiel (Vue.js → vuejs, vue 3…), jamais devinées                 | +1 (test moteur)        |
| 3 fenêtre | Fantastic + TheirStack jusqu'à 365 j (clé de cache à part)                                         | +2 (test moteur)        |
| 4 groupe  | filiales au SIREN connu, sources gratuites seules                                                  | 0 (test moteur)         |

- **Piège (test n°3)** : les 4 paliers rendent des « Gérant de Magasin » ; résultat = 3 offres du métier, 0 hors métier, `reason` = « sous le plancher après toute la cascade ». Aucun filtre relâché.
- **Deux régimes** : 6 offres au palier 0 → sans demande explicite 0 palier, 6 rendues ; avec → 4 paliers, 11 rendues (> 6). Demande explicite = ce que le commercial a SAISI dans le cadrage (postes, angle, priorités, entités), pas un choix du menu d'objectifs (`run_cadrage.explicit_request`).
- **Plafond d'appels payés** : `CASCADE_PAID_CALLS_MAX = 8` par compte, tous paliers (palier 0 compté, jamais refusé). Cache lu avant ; non tentés comptés par palier (`notAttempted`). Même plafond dans les deux régimes.
- **Compteur par palier** : `result["offersCascade"]` (palier, statut, gagnées, payés, cache, non tentés) + journal `cascade palier=…`. Aucun fournisseur nommé.
- **Apport par source** : avant, le seuil comptait le RENDU avant tri (12 rendues / 1 du métier n'ouvraient ni Mantiks ni TheirStack) ; après, le MÉTIER décide. Mesure réelle avant/après = en prod (aucun réseau ici).
- Tests : `test_cascade_plancher_5_2510.py` 20 verts (rouges avant : ImportError moteur + 4 câblages). Voisins : 53 verts sur 5 fichiers. 4 tests existants ont reçu leurs clés (une source sans clé n'est plus appelée, règle du brief).

## Pas fait / à savoir

- **Écran** : le texte « peu d'offres du métier : recherche élargie… » n'est PAS posé (web, i18n fr/en, contrat, classement démo `demo-coverage.ts` de la clé `offersCascade`). Payload prêt ; modèle = `DossierZoneWideningNotice`. Lot suivant.
- Palier fenêtre : Mantiks exclu (fenêtre figée dans son cache par entité). Palier groupe : gratuit seulement.
- `test_3901_offres_par_compte_profil.py` : > 100 s sans réseau, déjà lent/rouge sur la base — pas de moi. `test_discover_fresh_jobs_4430.py` non relancé.
- Zone en échec : non touchée (décision Louis).

## Recette prod

Rouvrir les comptes qui rendaient 0 et 4 offres ; lire `cascade palier=` et `jobs_source_kept` ; vérifier les crédits TheirStack/Mantiks sous le plafond de 8 appels.
