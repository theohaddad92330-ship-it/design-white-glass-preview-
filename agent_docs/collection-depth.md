# Profondeur de collecte — vannes ouvertes par défaut

> Directive produit : « Bellum doit être le meilleur » — la profondeur de collecte est
> **maximisée dans le code** (philosophie zéro-config), le coût est assumé par le quota
> crédits. Les env vars restent des **overrides à la baisse** (tuning down si besoin),
> jamais le chemin nominal.

## Tableau avant / après par cap

| Cap                                                      | Avant  | Après        | Fichier                              | Coût / run                                                                                                           | Latence                                                  |
| -------------------------------------------------------- | ------ | ------------ | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `FIRECRAWL_MAX_PAGES` (défaut code)                      | 7      | **12**       | `app/services/research/firecrawl.py` | +0,005 à +0,03 € (1 crédit Firecrawl/page : 0,08 c€ plan Standard, 0,53 c€ plan Hobby)                               | pire cas +25 s (3 vagues de 5 vs 2), typique +5-10 s     |
| `scrape_hits` `max_chars` (budget total bundle)          | 40 000 | **120 000**  | `app/services/firecrawl.py`          | 0 € (gate interne, pas un appel)                                                                                     | 0                                                        |
| `FIRECRAWL_CHARS_PER_CATEGORY` (défaut code)             | 4 500  | **6 000**    | `app/services/research/firecrawl.py` | +0,015 € (+2,25 k tokens × 3 prompts : Sonnet + Haiku + Sonnet)                                                      | ≈ 0                                                      |
| `CONTACTS_ENRICH_MAX` (défaut code)                      | 30     | **50**       | `app/services/classification.py`     | +0,10 € **pire cas** (Apollo ≥ 50 candidats)                                                                         | ≈ 0 (batches parallèles, organigramme = chemin critique) |
| `APOLLO_WIDE_MAX_PAGES` (cap de la recherche large)      | 5      | **supprimé** | `app/routers/phase2_contacts.py`     | 0 € (People-Search ne facture aucun crédit)                                                                          | +quelques s de pagination sur un très gros compte        |
| `CONTACTS_ENRICH_TOP_N` (défaut code)                    | 5      | **15**       | `app/services/contact_enrich.py`     | +10 crédits Apollo + 10 crédits Bellum **pire cas**, dépensés uniquement là où Apollo a déjà dit qu'un e-mail existe | ≈ 0 (révélations parallèles)                             |
| `_FC_ADEQUATE` (calibrage axe technique)                 | 7      | **10**       | `app/services/confidence.py`         | 0 €                                                                                                                  | 0                                                        |
| `render_dated_signals` `max_items` (news / jobs / legal) | 6      | **8**        | `app/services/dated_signals.py`      | +0,001 € (+~300 tokens × 2 prompts)                                                                                  | 0                                                        |

**Total estimé par run** (base actuelle ≈ 0,65 €) :

- **Pire cas** (gros compte : 12 pages riches + Apollo ≥ 50 candidats) : ≈ **0,78 €** (+0,13 €, +20 %).
- **Cas typique** (pool Apollo < 50, pages ok < 12) : ≈ **0,67-0,70 €** (+0,02-0,05 €).

## Chiffrage détaillé

### 1. Firecrawl 7 → 12 pages

- **Latence** : concurrence 5 (= throttle `firecrawl`), 25 s de cap dur par page
  (`PER_URL_TIMEOUT_S`). 12 pages = ⌈12/5⌉ = 3 vagues × 25 s = **75 s pire cas**
  (vs 50 s à 7 pages). Budget de phase `FIRECRAWL_TIMEOUT_S = 180 s` → marge 2,4×,
  **aucun changement de timeout nécessaire**. Cas dégénéré multi-runs (throttle
  20 rpm partagé, 30 s de max-wait par slot) : 3 × (30 + 25) = 165 s < 180 s — un slot
  affamé dégrade en erreur par URL, jamais en abort de phase.
- **Coût** : 1 crédit Firecrawl par scrape (cache Redis déduit les re-scrapes).
  +5 pages ≈ +0,4 c€ (plan Standard 83 $/100 k) à +2,7 c€ (Hobby 16 $/3 k).
- **Qualité** : 12 des ~34 hits Brave rankés obtiennent un full-text (presse +
  officiel + projets + jobs) au lieu de 7. L'injection prompt reste bornée par le
  budget par catégorie — les pages ajoutent de la **couverture** et une meilleure
  sélection d'extraits, pas du volume de prompt.

### 2. Le cap caché `max_chars` 40 k → 120 k (le fix qui rend le 12 réel)

`scrape_hits` marquait `skipped` toute page OK au-delà de 40 k chars cumulés. Avec
un markdown moyen de ~8-10 k chars/page (`only_main_content`), le budget saturait à
**~5 pages** : monter `FIRECRAWL_MAX_PAGES` sans toucher ce cap n'aurait presque rien
changé. 120 k = 12 pages × ~10 k. Impact prompt : zéro (l'injection est bornée en aval
par le budget par catégorie) ; impact mémoire : ~120 kB, trivial.

### 3. Chars par catégorie 4 500 → 6 000

- **Volume max injecté** : 6 catégories × 6 000 = 36 k chars ≈ **9 k tokens** de contenu
  scrapé par prompt (vs 27 k chars ≈ 6,75 k tokens). Prompt user complet pire cas
  (scrape + headers des 34 sources + bloc Brave JSON + Pappers + signaux datés +
  contexte) ≈ ~67 k chars ≈ **~17 k tokens** — sain vs les 200 k de contexte.
- **Coût** : +2,25 k tokens × (facts Sonnet 3 $/M + signals Haiku 1 $/M + strategy
  Sonnet 3 $/M) ≈ **+0,015 €/run**.
- **Justification qualité** : 6 000 était la valeur d'origine, trimée à 4 500 quand le
  rendu tronquait par la tête (le modèle « skimmait »). Les extraits sont désormais
  **relevance-selected** (`select_relevant_excerpt`) + dédupliqués near-dup
  (`ContentDeduper`) : les chars supplémentaires portent du signal, pas du boilerplate.

### 4. Contacts enrichis 30 → 50 (classify = #1 cost sink)

- **Télémétrie existante** (commentaires `classification.py`) : batch de 12 ≈ ~11 k
  tokens output Haiku 4.5 ≈ **~917 tokens/contact** (1 $/M in, 5 $/M out).
- **Avant** : 30 contacts = 3 batches ≈ 27,5 k out + ~24 k in ≈ **0,16 $**.
- **Après** : 50 contacts = 5 batches ≈ 45,9 k out + ~40 k in ≈ **0,27 $**.
- **Delta** : **+0,11 $ ≈ +0,10 €/run pire cas** — uniquement quand Apollo renvoie
  ≥ 50 candidats (pool jusqu'à 5 000 : 100/page × 50 pages max).
- **Wall-time inchangé** : les batches tournent en parallèle (throttle Claude 50 rpm /
  10 concurrents admet 5 batches + organigramme en une vague) ; l'organigramme reste
  le chemin critique (~110-120 s). Organigramme : +20 contacts dans l'input ≈ +1,5 k
  tokens Haiku ≈ +0,002 $ — négligeable, output shape-bounded.
- **Garde-fou intact** : `CONTACTS_BATCH_SIZE` = 12 (≤ `_MAX_SAFE_BATCH` 15) — aucun
  risque de troncature 16 k (perte de batch entière).

### 5. `_FC_ADEQUATE` 7 → 10 (axe technique)

12 pages tentées × ~85 % de taux ok réaliste (anti-bot / timeouts cible) = 10 pages ok
= collecte complète. Exiger 12/12 dégraderait presque chaque run pour des causes hors
pipeline ; rester à 7 aurait saturé l'axe trop tôt (7 ok = 100 % alors que 5 slots
restaient vides). Un run bridé à 3 pages score désormais 0,3 sur ce composant (vs
0,43) — plus dur, plus honnête (retour Théo : « Firecrawl 3 pages » ≠ complet).

### 6. Signaux datés 6 → 8 items (news / jobs / legal)

Lignes compactes (~200 chars), datées, triées récent-first — les items 7-8 restent
frais. +6 lignes max ≈ +300 tokens sur 2 prompts (signals Haiku + strategy Sonnet)
≈ **+0,001 €/run**. Les marchés publics gardent leurs mins (**tenders 5, awarded 4**) :
lignes les plus longues, rendement décroissant le plus rapide.

## Caps volontairement inchangés (qualité > quantité)

| Cap                                                  | Valeur  | Pourquoi on ne monte pas                                                                                                                                                    |
| ---------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brave `PER_CATEGORY_CAP`                             | 34 hits | 34 candidats pour 12 slots de scrape — aucune troncature ; le tail post-ranking est déjà injecté en snippet via le bundle. Élargir = dupliquer du bruit (lignes `no body`). |
| Bloc Brave JSON `[:20]`                              | 20 hits | Les 12 scrapés sont dans le top-20 après ranking ; les hits 21-34 (OTHER / low-score) sont déjà visibles dans le bundle → duplication pure.                                 |
| `CONTACTS_BATCH_SIZE` / `_MAX_SAFE_BATCH`            | 12 / 15 | Plafond anti-troncature 16 k output Haiku — le dépasser = perte de batchs ENTIERS (observé : 25/30 contacts SG perdus). Ne pas toucher.                                     |
| `FACTS/SIGNALS/STRATEGY_MAX_TOKENS`                  | 12 000  | Caps d'output, remplis à ~10 k aujourd'hui — aucune troncature observée, monter n'apporte rien.                                                                             |
| Pappers `financials_history[:3]` / `executives[:10]` | 3 / 10  | Firmo stable — pas un driver de profondeur ; les dirigeants au-delà de 10 sont du bruit mandataire.                                                                         |

## Action prod requise (Railway)

⚠️ **Purger `FIRECRAWL_MAX_PAGES=3` des variables Railway du service IA.** C'est une
bride héritée (posée quand le défaut code était 7 et la latence un souci) : tant
qu'elle existe, elle **écrase** le défaut code 12 et maintient la prod au tiers de la
profondeur cible. Les env vars de collecte ne doivent porter que du tuning down
temporaire, jamais un état permanent.

## Rappel des overrides (tuning down uniquement)

- `FIRECRAWL_MAX_PAGES` — descendre si la latence Firecrawl devient un problème.
- `FIRECRAWL_CHARS_PER_CATEGORY` — descendre si le budget tokens research doit être trimé.
- `CONTACTS_ENRICH_MAX` — descendre pour le coût ; `0` = tout enrichir (switch de revert).
- `CONTACTS_ENRICH_TOP_N` — combien de décideurs voient leurs coordonnées révélées automatiquement (1 crédit Apollo + 1 crédit Bellum chacun) ; `0` désactive l'auto-enrichissement, le bouton « Enrichir » reste disponible contact par contact.

## Contacts Apollo à demi-nommés (24/07/2026)

Le tier gratuit de People-Search renvoie `first_name` + `last_name_obfuscated`
(`"Mo***y"`), jamais l'e-mail ni le LinkedIn. Le garde d'identité côté API rejetait
donc **100 % des hits Apollo** (prénom seul, aucun identifiant) : Dassault Aviation
ressortait avec 9 contacts — ses seuls mandataires Pappers — pour 1379 personnes
disponibles chez Apollo. L'`apolloId` est désormais reconnu comme identité (il
résout la personne par People-Match) et sert de clé de dédup, ce qui empêche deux
homonymes de fusionner. Un hit n'est gardé que si Apollo annonce un e-mail, un
téléphone direct (`"Yes"` — `"Maybe: …"` ne compte pas) ou un LinkedIn : sans quoi
le contact ne serait joignable par aucun canal.
