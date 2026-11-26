# Rapport #2322.70 — branche claude/offres-cdi-extraction-2322

SHA : 826a06d8 (IA + contrat + web + rattrapage), 04d79f7d (démo). PAS de PR (consigne).

1. Existant branché, pas recodé : `job_family`, `job_context.derive_team`, `tech_stack` n'avaient aucun appelant sur la collecte du dossier ; tension source déjà codée (france_travail.py:787).
2. Extraction : apps/ia/app/services/job_offer_enrichment.py (règles seules), appelée à apps/ia/app/routers/phase1_research.py (après split_job_recruiters). Tension = source_flag | urgent_text | republished_text | online_long (≥60 j mesurés, hors historique), toujours avec sa raison ; sinon aucune clé.
3. Contrat : packages/contracts/src/schemas/analysis/public-data.ts (role, team, tension_reason, tension_days). Carte : CompanyPublicDataSection.tsx (JobRow) + locales FR/EN ; champ absent = aucune ligne.
4. Rattrapage : segment-catchup.ts, entrée '#2322.70' dans signals (at 2026-10-31T15:50Z, commit null, à REMONTER au déploiement réel) ; test segment-catchup.test.ts rouge sans l'entrée. Aucun rejeu automatique.
5. Démo : demo-dataset.ts (2 offres SNCF) + demo-coverage.ts (DEMO_JOB_OFFER_ENRICHMENT_COVERAGE) + demo-job-offer-enrichment-coverage.spec.ts.
   Tests verts : pytest test_job_offer_enrichment/test_job_context/test_phase1_shared_jobs_4045/test_job_recruiters_phase1_sig_b (25) ; vitest contracts segment-catchup (29) + account-analysis (15) ; vitest web CompanyPublicDataSection (32) ; jest demo (coverage, job-offers, history, internship, enrichment).
   Coût modèle par offre : 0 € (aucun appel modèle).
   Non fait : repli Haiku (cache par empreinte, JSON validé) — les règles suffisent pour le périmètre mesuré, aucun cas ne l'exige encore ; `pnpm ci:local` non lancé (VM) ; tsc web inexploitable sans build de contracts (TS6305).
   Écart : test #4762 (segment-catchup.test.ts) assoupli de `toBe` à `>=` sur l'epoch (une capacité plus récente le déplace, précédent #4754) ; #2322.70 porte l'égalité stricte.
   Question : confirmer l'instant `at` du rattrapage au déploiement.
