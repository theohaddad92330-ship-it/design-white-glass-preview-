# FIX-CI-4393-IA — rapport

- A (8 tests offres) : l'exclusion S.14 (santé/soin/tri) s'appliquait sans profil et aux ESN de placement → `_is_digital_esn_profile` dans `domain_job_filters.py` : exclusion seulement pour un profil ESN numérique DÉCLARÉ (`esn_it` / domaine sans filtre propre), jamais sans profil, jamais avec `recruitsForClients`, jamais sur métiers seulement déduits. Les 8 tests intacts ; `test_simon_fix_s14` ajusté (profil ESN numérique ; le placeur garde tout).
- B (corpus copilote) : pages mortes `/consultants/pool`, `/rfp`, `/needs`, `/pilotage/memoire-collective[/$accountId]` (retirées par #4359) → `/consultants`, `/projects`, `/accounts/marches`, `/accounts/$id` (tests scope/market_memory/unknown_request).
- C (sources citées) : libellé « appel d'offres public en cours » changé légitimement dans `chat_tools.py` (#4315, e2e793742d) → test adapté.
- D (golden advisor) : changement venu de nav-nettoyage / RV4-E-FIX / 4288.1 (intentionnel) → `golden/system/advisor.txt` régénéré ; fingerprint inchangé.
- Suite IA complète : 18839 passed, 1 failed, 1 skipped, 3 xfailed.
- Seul échec : `test_crawl_free_tier.py::test_static_rich_page_served_free_without_firecrawl` — échoue identique sur origin/main (environnement, pas de réseau), hors périmètre.
