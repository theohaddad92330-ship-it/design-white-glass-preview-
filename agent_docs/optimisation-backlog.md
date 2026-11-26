# BellumAI — Backlog d'optimisation (audit 4 axes)

Issu d'un audit code (cache · scraping · RAG/contexte · pertinence IA), 2026-07-06.
Les **7 wins déterministes** déjà shippés sur `feature/palier2-run-parfait` :
drop bruit filiales, convergence signaux→confiance, garde hallucination élargie,
contact d'action inexistant, caps serveur chat, cache des paths text/citations/sync,
Firecrawl strip boilerplate.

Ce fichier = ce qui **reste**, priorisé. `[D]` = buildable déterministe/testable ;
`[L]` = besoin d'un run live pour valider ; `[M]` = migration/schema.

**État (2026-07-06, sweep déterministe TERMINÉ)** : tous les items `[D]` ont été
shippés sur `feature/palier2-run-parfait` (Brave rank #8, seuil RAG #14, injection
signaux datés #5, proximité contact #19, extraction relevance-aware #6, dedup nom
#23, fraîcheur employerMismatch #20, dedup contenu #7, tie-break scrape #9, budget
contexte #15, retrieval FTS #11, fraîcheur vraies dates #17, fenêtre embedding #13,
corroboration #21). **Reste** : la section Cache (déférée, billing-adjacent /
à-valider-en-live) + le tailoring OTHER (gain marginal, skip). Voir ci-dessous.

## Cache — DÉFÉRÉ (billing-adjacent / à valider en live, hors sweep déterministe)

Section volontairement laissée pour une passe dédiée avec revue + run live : elle
touche le chemin de submit (facturation) ou le cache d'appels externes payants, et
le NET des gains cache per-model se valide sur un vrai run, pas en unit-test.

- `[D→revue]` **C1 result-cache clé sur SIREN** (nom → variantes "SG"/"Société Générale"
  ratent le cache 30j). L'infra est là (`findCompletedByUserAndCompany(opts.siren)`),
  MANQUE : un resolver nom→siren sur le chemin de submit (I/O réseau, billing-adjacent)
  → à faire sous revue, pas en grind non-supervisé.
- `[L]` **Phase-4 sections Haiku** ne lisent pas le cache Sonnet warmé (per-model) → valider le net en live.
- `[L]` **Phase-1 corpus caché** : signals+strategy (même Haiku) peuvent partager un bloc système caché — valider live.
- `[D→revue]` **Cache par-siren** des appels list (Apollo/Brave/Pappers), mirror de
  `scrape_cache.py` — cache de résultats d'API externes payantes, à câbler sous revue.

## Scraping / collecte — reste

- `[D→skip]` **Tailoring par-prompt + drop OTHER** : DÉFÉRÉ. OTHER est déjà fortement
  déprioritisé (boost `-5` à la sélection, rendu en dernier, passé par
  `select_relevant_excerpt` + `ContentDeduper`) ; le retirer risque de perdre du
  firmographique pour un gain marginal. Non prioritaire.

## Scraping / collecte

- ✅ **Injecter France Travail (jobs+stack), BODACC, News dans les prompts** (FAIT) :
  `render_dated_signals` + fence `<signaux_dates>` branchée sur signals+strategy ;
  news/jobs/BODACC pré-awaités avant les prompts (coût wall-time ~0, déjà lancés),
  BODACC re-fetch si le siren facts diverge. Dégradable.
- ✅ **Extraction relevance-aware** (FAIT) : `select_relevant_excerpt` score les
  paragraphes par densité de termes ESN/IT + signaux datés (montants/%/années),
  garde la tête (lede) puis remplit le budget par pertinence, ré-émis dans l'ordre
  du doc. Remplace le `[:cap]` head-truncation de `render_for_prompt`.
- ✅ **Dedup de contenu** (FAIT) : `ContentDeduper` (k-shingles + Jaccard, seuil
  0.75) dans `render_for_prompt`, partagé sur toutes les catégories → un communiqué
  mirroré sur 2 URLs (dedup URL-only le ratait) n'est injecté qu'une fois, la copie
  pointe vers l'original. Budget prompt non gaspillé.
- ✅ **Ranking + filtrage bruit du bloc Brave** (FAIT, batch 2) : tri par priorité +
  drop EXCLUDED_DOMAINS avant le `[:20]`.
- ✅ **Tie-break Firecrawl** (FAIT) : `_hit_content_score` (mots-clés titre+snippet +
  bonus année récente 2023+) en clé secondaire du tri `scrape_hits` → à priorité URL
  égale, le contenu le + pertinent/frais passe, plus l'ordre Brave arbitraire.
  (Récence = proxy année : les hits Brave ne portent pas de date.)
- `[D→skip]` **Tailoring par-prompt** + drop `OTHER` — voir section « Scraping / collecte — reste » (déféré, gain marginal).

## RAG / contexte

- ✅ **Vrai retrieval FTS** (FAIT, sans migration) : `TextSearchFallback` passe de
  l'ILIKE une-sous-chaîne à `websearch_to_tsquery` (opérateur PostgREST `wfts`, calculé
  à la volée — recall tokenisé/stemming). ILIKE reste en secours si FTS échoue. Le + gros
  gain RAG en config défaut. (`ORDER BY ts_rank` = amélioration future, nécessiterait un RPC.)
- `[D]` **Dedup + score** dans `format_knowledge_context` (jette la similarity, pas de dedup).
- ✅ **Fenêtre d'embedding élargie** (FAIT, cœur de #13) : l'ingest embed
  `title+content[:2000]` (env `RAG_EMBED_CONTENT_CHARS`) au lieu de `[:500]` — le corps
  n'était plus invisible au vecteur. Fan-out par-chunk (multi-lignes) = étape future.
- `[D/L]` **Seuil de match configurable** (`RAG_MATCH_THRESHOLD`, aujourd'hui 0.7 hardcodé).
- ✅ **Budget global de contexte** (FAIT) : `fit_to_budget` (context_budget.py) plafonne
  la somme des blocs du prompt advisor (kb > plan > contacts), rogne le moins
  prioritaire d'abord. Env `CHAT_CONTEXT_MAX` (défaut 9000). Complète les caps par-bloc.
- `[D]` **Chat error handling** : `success=True` + "Erreur: {exc}" sur exception → un
  échec ressemble à une réponse + pollue l'historique. Retourner success=False.
- `[D/L]` **Résumé rolling** de l'historique long (au lieu de drop).

## Pertinence IA (déterministe)

- ✅ **Fraîcheur depuis vraies dates** (FAIT) : `_real_date_freshness` prend la date la +
  fraîche parmi BODACC/France Travail/news/signaux → poids 0..1 (âge en jours), au lieu du
  `data_freshness` LLM (retombe sur le tristate LLM si rien de datable). Tri signaux/pains
  avant cap = déjà fait (#18).
- ✅ **Contact proximity** (FAIT) : `lookupEntityZone` porte `_entity_matches` (préfixe
  mot-entier bidirectionnel, garde ≥2 tokens, plus spécifique gagne) → un contact
  "VINCI Energies Digital" hérite de la zone P1 "VINCI Energies" (avant : clé exacte → flat).
- ✅ **Axe fraîcheur contact** (FAIT) : `employerMismatch` (Apollo current-employer ≠
  cible = a quitté la boîte) effondre la fraîcheur à 1 → tire contactScore +
  accessibilité vers le bas, plus juste le statut faux_positif. Branché sur le
  scoreInput API (les 3 scores le voient).
- ✅ **Corroboration multi-source** (FAIT) : `_corroboration_score` compte les registres
  officiels INDÉPENDANTS qui confirment l'entité (Pappers SIREN · annuaire · BODACC · RNE ·
  INSEE sites). Diagnostic surfacé sur les factors, PAS pondéré dans le /100 (score calibré
  inchangé) — remplit le stub « cross-source agreement ».
- `[D]` **Noise regex entités** : ajouter SOPARFI / ASSET MANAGEMENT / SAS DE PARTICIPATION
  (conservateur, NAF 64.xx reste operating).
- ✅ **Dedup par nom** (FAIT) : `dedup_by_name` (text_norm) sur competitors +
  esnSynergies ; seed-entity injection dédup désormais siren AND nom (marque sans
  siren ne crée plus de ligne cartographie doublon).

## Déjà solide (ne pas retoucher)

Réconciliation score /25↔/10↔verdict · gate entité target-aware + no-go · Quality
Judge sur les surfaces headline · weak-source deprioritisation plays · employer-
mismatch→faux_positif · caps/whitelist/cache-warming plan phase-4 · scrape_cache.
