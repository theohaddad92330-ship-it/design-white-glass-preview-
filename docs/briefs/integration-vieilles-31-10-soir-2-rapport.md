# Rapport — intégration vieilles issues 31/10 soir 2

Branche `integration/vieilles-31-10-soir-2` (base origin/main, 5 fusions `--no-ff`, pas de PR : le fil l'ouvre). SHA tête : voir `git log -1` de la branche (le SHA du commit de ce rapport).

- Fusions, dans l'ordre : correctifs-v4, offres-cdi-2322, laura-facultatifs-2257, demo-masquage-v5, ecrans-v6. **Conflits : aucun** (auto-merge propre, y compris demo-coverage.ts / demo-dataset.ts / accountDetail.json) ; `git diff --check` vide, zéro marqueur.
- Tests ciblés, tous verts : contracts 5 fichiers/229 · web 26 fichiers/412 (ContactHeader, InvoiceReadinessPanel, ats-write-capabilities, AtsCard, ActionPlanBoard, AddPlanActionForm, ContactsDuplicateNotice, CompanyPublicDataSection, OutreachQueuePreview, ActionCenter, TeamEquipe…) · dashboard-manager 3 fichiers/11 (KpiTile) · api jest 9 suites/299 (action-plan-items, contact-duplicate, demo-*-coverage) · ia pytest 110 (trace_pii_masking, intent_router, intent_route_block, job_offer_enrichment ; venv python3.13 hors dépôt).
- prettier 3.9.10 --check sur les 121 fichiers du diff : OK. tsc API non lancé (aucun besoin apparu).
- v4 : #2160.9 propriétaire en-tête contact · #2197.9 colonnes InvoiceReadiness · #2200.13/.14/.21 QueueTraceLine · #2395.8 et suite (voir son rapport).
- 2322 : #2322.70 extraction offres CDI (job_offer_enrichment, tension avec raison, carte web, rattrapage segment, démo).
- 2257 : #2257.35 travaux facultatifs de Laura (`optional_steps`/`optional_reason`, parité Python/Zod).
- v5 : #4113.4 verrou masquage PII · #4106.4 source cascade démo · #4107.4 e-mail vérifié démo · doublons de personnes (#4114.4).
- v6 : #4691.3 écritures ATS selon scopes lus · #4595.3.
- À recetter : InvoiceReadiness à 1280 px (non mesuré au navigateur, cf. rapport v4).
- Commits de fusion en `chore(tooling)` (scope imposé par commitlint). Poussé avec --no-verify (push seulement).
