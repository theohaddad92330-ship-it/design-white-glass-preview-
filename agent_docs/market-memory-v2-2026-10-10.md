# Chantier — Market Memory v2 (Drive « MARKET MEMORY », 10/10/2026)

Mode : **intégrer des données** (skill chantier, phases 0 → 8). Demande Louis 10/10 :
« brancher parfaitement sur Bellum — signaux, besoins, opportunités, vérification de
données, arbitrage, matière certifiée et solide — sans jamais dire que ça vient de là »

- « renforcer le RAG de Bellum pour que ces données (et tout le Drive, les données des
  users) remontent partout où elles sont utiles ».

## Source

- Drive : dossier `1TMNk9uHwV3aj55x1rTu6RS2xcPBkWD1r` (propriétaire theo@bellum-it.com),
  6 zips `BELLUM_MARKET_MEMORY_v2__partie_0N_sur_06.zip`.
- Téléchargés dans `~/Downloads` (Chrome) : 02, 04, 05, 06. **01 et 03 à re-télécharger**
  (URL `https://drive.usercontent.google.com/download?id=<id>&export=download&confirm=t`,
  ids : 01 `1viax_7ChGjToq8OsCV0Uv7VKiacdekNh`, 03 `1UyC0ua68blJ4W-lRXWFrLkQyha7gMLWS`).
  rclone `gdrive:` = jeton expiré ; curl non authentifié = page HTML.
- Destination d'extraction : `agent_docs/sources/market-memory-v2/` (gitignoré).

## Contenu mesuré (partie 02 = 88 fichiers, 176 Mo décompressés ; 03-06 = morceaux)

- `db/bellum_market_COMPLET.sqlite.bz2.part01..04` (parts 02-04 dans zips 04-06, part01 sans doute dans 03) + `tools/reassemble_db.py`.
- `rag/account_cards.jsonl` (45 Mo) — fiches compte prêtes pour RAG.
- `data_pseudonymized/` : profiles_mm_extra, profiles_mm_techno_tags.
- `data_restricted_internal_crm/` (19 CSV) : pipe, track record, leads OCR, besoins récents, seeds de comptes — CRM INTERNE d'une ESN.
- `data_restricted_pii/` (17 CSV) : people, freelance_identities, candidate_pool(+extra), contacts_crm_status, brief_narratives — PERSONNES NOMMÉES.
- `refs/` (21) : dictionnaires de colonnes, ref_domaines, ref_esn_rang2_ouvert, ref_business_events, ref_market_roles…
- `source_reports/REPORT_E1..E9d.md`, `queries/EXAMPLES.sql`, `tests/run_checks.py` + golden, `tools/bm_*.py`, `logs/`.

## Existant dans le dépôt (v1)

- Tables `market_*` (company_alias, company_signal, company_stack, esn_client, ex_esn_at_client, ground_truth_judgment), migrations MarketMemory\* (versioning, provenance, ground truth).
- Importeur `apps/api/src/scripts/ingest-market-memory.ts` (+ spec).
- Gardes : single source of truth, un seul point d'entrée, reads are free, never creates urgency, unresolved is said, network paths stay anonymous, ESN observation threshold, ground-truth metric floor.
- Doctrine : mémoire marché PARTAGÉE, jamais semée en démo ; « nos fournisseurs ne se nomment jamais » ; coût d'accès jamais agrégé entre espaces (GA-43) ; `MARKET_MEMORY_SCORING_ENABLED=false` (GA-257) ; pas de NO-GO par absence.

## 🔴 Décisions à poser AVANT tout code (arrêts obligatoires : cloisonnement + RGPD)

1. `data_restricted_internal_crm/` = CRM d'UNE ESN (Bellum IT ?) : il va dans l'espace de cette ESN seulement (jamais dans la mémoire partagée) — ou pas du tout ?
2. `data_restricted_pii/` (personnes nommées, freelances, candidats) : ingérer (base légale ? espace ?) ou exclure / pseudonymiser ?
3. `rag/account_cards.jsonl` : brancher dans le RAG partagé (après filtrage PII) — oui ?
4. Remplacement de la v1 (version de mémoire) vs fusion.

## ✅ Décisions Louis (QCM 10/10) — TRANCHÉES

1. CRM interne → **mutualisé ANONYMISÉ** : seuls des faits agrégés, sans nom d'ESN ni montant, alimentent la mémoire partagée (jamais une ligne de pipe identifiable).
2. Personnes → **décideurs pros : OUI** (enrichissent les comptes). **Candidats/freelances : leurs technos, parcours, employeurs servent de SIGNAUX** (besoins, stacks, mouvements) — usage en signal agrégé, pas d'exposition d'identité de candidat dans la mémoire partagée (critères protégés exclus, doctrine).
3. v1 → **nouvelle version active, v1 archivée** (versioning existant), une correction humaine gagne toujours.
4. RAG : renforcer pour que cette matière (et tout le Drive / les données users) remonte partout où utile — sans jamais nommer la source.

## Reprise — prochaine commande

1. Re-télécharger 01 et 03 ; `unzip` les 6 dans `agent_docs/sources/market-memory-v2/` ; `python3 tools/reassemble_db.py`.
2. Phase 1 (inventaire) : un agent `verificateur`/Explore par famille (refs+reports ; CSV non-PII ; sqlite schéma+comptes ; RAG jsonl) → inventaire numéroté ici.
3. Phase 2 : croiser avec v1 (`ingest-market-memory.ts`, tables market\_\*), RAG (`rag_documents`, pgvector), lecteurs (signaux, Découvrir, Laura, score).
4. QCM des 4 décisions ci-dessus.
