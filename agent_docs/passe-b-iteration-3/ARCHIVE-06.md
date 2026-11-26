### Passe B — archive 06 DATAFORGE / MULTIDOMAINE / STELYA

> Lecture seule, 29/08/2026. Source : `agent_docs/sources/BELLUMAI_ITERATION_3_06/` (242 fichiers).
> Trackers contredits : `agent_docs/archive-06-dataforge-stelya-2026-08-25.md` (87 l.) et
> `agent_docs/dataforge-v10-plan.md` (117 l.).
> ⚠️ `repo_mirrors/` et `code_evidence/` sont des extraits du DÉPÔT, pas de la source — vérifié :
> `dataforge-v10-plan.md`, `offer-domains.md`, `account-data-coverage.md` sont byte-identiques à
> leur jumeau du dépôt (0 ligne d'écart) ; `code_evidence/*.txt` sont des `grep` sur
> `/mnt/data/orion_repo_current/`. Aucun n'a servi de vérité.

**Fichiers ouverts : 242 / 242 recensés · 127 distincts par SHA-256 · 115 doublons byte-identiques**

Ce que « ouvert » veut dire ici, fichier par famille :

| Famille             | N   | Traitement                                                                                                                                                                                                                                                |
| ------------------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PDF Stelya          | 1   | **Lu intégralement** (23 p, 2 088 lignes `pdftotext -layout`). Pas d'`original_markdown_sources/` dans cette archive — le seul substitut était `repo_mirrors/`, écarté.                                                                                   |
| Markdown            | 20  | 14 distincts. **12 lus en entier**, 2 (`DATAFORGE_V8_MASTER.md` 35 Ko, `DATAFORGE_CONSOLIDATION_CLAUDE_OPENAI` 25 Ko) lus par plan + sections citées ci-dessous.                                                                                          |
| JSON                | 17  | 10 distincts. `schema_v10`, `qa_v10`, `manifest_v10`, `qa_v9`, `schema_v9` lus en entier ; `dataforge_audit_internal.json` (509 Ko) et `_internal_aggregates` échantillonnés — ce sont des agrégats V8 recalculables.                                     |
| **CSV**             | 177 | 80 distincts. **Tous mesurés** (lignes, colonnes, colonnes 100 % vides, délimiteur, lignes bancales) avec un vrai lecteur CSV. Deux lus CELLULE PAR CELLULE : le transport canonique V10 (78 870 × 158) et le canonique V9 (38 240 × 185).                |
| JSONL               | 11  | 8 distincts. **Non lus ligne à ligne** — `manifest_v10.json` et `schema_v10.json` les déclarent comme le jumeau du CSV que j'ai mesuré (`account_domain_opportunities_v10.jsonl` = 162 Mo pour les mêmes 78 870 lignes). Vérification de forme seulement. |
| SQLite              | 2   | **Non ouverts.** 124 Mo + 71 Mo. `schema_v10.json:canonical_tables` les déclare comme la même donnée que les CSV mesurés + `raw_cells`. Coût élevé, aucune décision changée. **Dit tel quel.**                                                            |
| XLSX                | 3   | 1 distinct (`DATAFORGE_V4_ORIGINAL.xlsx`). **Non ouvert** : ses 14 onglets sont exportés en `raw_v4/*.csv`, mesurés un par un (`qa_v10.json:all_14_raw_tabs_present: true`, recompté vrai).                                                               |
| ZIP                 | 8   | **Non décompressés** : les 8 sont déjà extraits à côté dans l'arborescence (`*_EXTRACTED/`), et les SHA du manifeste concordent.                                                                                                                          |
| TXT `code_evidence` | 3   | Lus en tête. Ce sont des extraits du dépôt (miroirs) — écartés comme source.                                                                                                                                                                              |

**Le comptage brut ne se lit pas sans ceci** : 224 des 242 fichiers vivent sous
`canonical_v10/MASTER_PACK_EXTRACTED/` — et 115 fichiers sont des doublons exacts, parce que
`DATAFORGE_V9_MASTER_PACK` embarque un `v8_snapshot/` complet, lui-même dupliqué dans
`legacy_packs/DATAFORGE_V8_MASTER_PACK_EXTRACTED/`. Un comptage à 242 surestime la matière d'un
facteur 1,9 ; le dénombrement utile est **127**.

---

## ⚠️ Le dénominateur du tracker — d'où sort-il, et qu'exclut-il ?

Le tracker l'écrit lui-même, ligne 4 :

> « 137 404 274 octets, **16 fichiers au manifeste — 16 intègres**, SHA-256 recalculé. »

**Son dénominateur est 16.** C'est `MANIFEST_SHA256.md`, le manifeste du ZIP d'expédition. Et sur
ces 16, seuls **8 sont de la source** : 3 sont des `repo_mirrors/`, 1 est `repo_root/DOMAINS.md`,
3 sont `code_evidence/*.txt` — sept fichiers qui sont le DÉPÔT, comptés comme de la matière à
croiser. Il en reste huit : `README.md`, 2 zips, 4 CSV V9 et le PDF Stelya.

Ce que ce 16 exclut, sur le disque, en clair :

| Ce qui est exclu du dénominateur                     | Volume réel                                                                                  |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Le contenu de `DATAFORGE_V10_MASTER_PACK.zip`        | **224 fichiers déjà extraits**, dont **63 déclarés au `manifest_v10.json` du pack lui-même** |
| Les 26 tables canoniques V10                         | **97 668 lignes, 457 colonnes**                                                              |
| Les 14 onglets `raw_v4/`                             | **50 918 lignes, 361 colonnes**                                                              |
| Les packs V6 / V8 / V9 imbriqués                     | ~30 tables de plus (dont 10 que le V10 a SUPPRIMÉES, cf. §Trous 12)                          |
| Le PDF Stelya, compté comme **une ligne de tableau** | **23 pages, 31 sections, 18 tickets BEL-DOM, 8 décisions D-ST, 10 goldens, 10 interdits**    |

Et la clôture est écrite noir sur blanc, §3 du tracker :

> « **Mesurer le `MASTER_PACK` (102 Mo)** — Le transport canonique EST la voie d'intégration
> déclarée ; le master pack est l'amont. Le mesurer demanderait de le décompresser entièrement
> pour un chiffre qui ne change aucune décision. **Non mesuré**, dit tel quel. »

Trois choses fausses dans ce paragraphe. **(a)** Le pack n'a pas besoin d'être décompressé : il
l'est déjà, sur le disque, dans l'archive même. **(b)** Le README du pack (`README_V10.md`) donne
un **ordre d'ingestion en 8 étapes** dont le transport canonique ne fait PAS partie — la voie
déclarée par la source est `master_accounts_v10.jsonl` → `consulting_domain_taxonomy_v10.csv` →
`account_domain_opportunities_v10.jsonl` → `account_domain_evidence_v10.jsonl` →
`account_entity_graph` + `gatekeepers` → `source_registry_v10.csv` → SQLite → `raw_v4/`.
**(c)** Le mesurer change au moins six décisions, listées plus bas.

**Le deuxième dénominateur** est celui du corps du tracker : « les cinq résolutions du README » +
« **les trois instructions** ». Or le `README.md` de l'archive en porte **quatre** :

```
## Instructions Claude Code
- Ne jamais ingérer le CSV comme table métier unique.
- Entity Resolver par SIREN/alias.
- Brancher OfferPortfolio et ConsultingDomainContext.   ← jetée
- Conserver goldens IT et ajouter non-IT.
```

La troisième est **absente du tableau du tracker**, qui passe directement de « Entity Resolver »
à « Conserver goldens ». C'est le motif « le tracker jette la 3ᵉ colonne », littéralement : la
3ᵉ ligne. Et la ligne jetée est celle qui porte tout le chantier Stelya.

Enfin, `README.md:24` porte un **renvoi** que le tracker ne relève pas :
« Toujours lire le paquet `00_GOUVERNANCE_SOURCE_OF_TRUTH` avant implémentation. »

**Bilan du dénominateur : 8 items statués (5 résolutions + 3 instructions) sur une matière qui en
porte, au dénombrement reconstruit, plus de 350.**

---

## Le dénombrement reconstruit, EN CHIFFRES

### A. Le transport canonique V10 — relu cellule par cellule (78 870 × 158, 0 ligne bancale)

| Mesure                                 | Tracker                            | Ma mesure                                                                             |
| -------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------- |
| Lignes / comptes / domaines / colonnes | 78 870 / 1 195 / 66 / 158          | ✅ **identique**                                                                      |
| `evidence_tier`                        | D 76 871 · C 1 451 · B 412 · A 136 | ✅ **identique** (et concorde avec `qa_v10.json`)                                     |
| `scoring_policy` `PRIOR_ONLY` 100 %    | ✅                                 | ✅ `PRIOR_ONLY__RECALCULATE_WITH_SELLER_OFFER_PORTFOLIO_LIVE_EVIDENCE_ACCE…` × 78 870 |
| Colonne SIREN vide                     | 1 161 comptes                      | ✅ 76 626 lignes ÷ 66 = **1 161**                                                     |
| Cellules SIREN non vides               | 34 comptes                         | ✅ 2 244 ÷ 66 = **34**                                                                |
| **SIREN à 9 chiffres**                 | **« 0 »**                          | ❌ **4 comptes / 264 lignes** — voir trou n°1                                         |

Ce que le tracker n'a jamais compté :

| Colonne `bellum_*`                     | Valeur / remplissage                                                                                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bellum_grain`                         | `account_domain_prior` sur 78 870/78 870 — le fichier se déclare **grain de prior**, pas grain de fait                                                                |
| `bellum_live_research_required`        | `YES_BEFORE_USER_FACING_ACCOUNT_STRATEGY_OR_CLAIM` sur **100 %**                                                                                                      |
| `bellum_prompt_usage`                  | `INJECT_AS_CONSULTING_DOMAIN_CONTEXT_PRIOR__NEVER_MERGE_SECTOR_PRIOR_WITH_VERIFIED_EVIDENCE` sur 100 %                                                                |
| `bellum_ingestion_recommendation`      | `STAGE_RAW_TABLES_IMMUTABLE__INGEST_THIS_CANONICAL_VIEW_AS_PRIOR_INDEX__RESOLVE_ACCOUNT_ID_TO_BELLUM_ACCOUNT_ID__VERSION_ALL_CLAIMS` — **4 consignes, 1 seule tenue** |
| `bellum_code_impacts`                  | `EntityResolver;DomainRegistry;OfferPortfolio;DiscoverScoring;AccountScore;ContactPriority;Coverage;SourcePolicy;PromptContext;EvidenceGraph` — **10 impacts nommés** |
| `bellum_prompt_impacts`                | `Facts;Signals;Strategy;Contacts;OrgInfluence;Discover;Copilot;Laura;ScoringExplanations` — **9 prompts**                                                             |
| `bellum_existing_offer_pack`           | esn_it 14 domaines · generic **23** · pmo 8 · finance 7 · product_design 6 · supply_chain 5 · rh 3                                                                    |
| `bellum_existing_pack_status`          | `no_curated_pack_yet` **23 domaines (27 485 l.)** · `scaffold_needs_curation` 16 · `scaffold_or_generic` 6                                                            |
| `bellum_domain_support_gap`            | 5 niveaux, dont `CRITICAL_FOR_NON_IT__CREATE_DOMAIN_PACK_BEFORE_USER_FACING_CLAIMS`                                                                                   |
| `bellum_unique_value_not_scrapable`    | nomme 5 valeurs non-scrapables du pack, dont `CROSS_SELL_DOMAIN_LOGIC` et `REFERENCING_AND_ACCESS_MEMORY`                                                             |
| `bellum_manual_verification_task`      | **166 / 78 870 (0,21 %)** — exactement les 166 lignes de `manual_verification_queue_v10.csv`                                                                          |
| `bellum_evidence_summary` / `_sources` | **784 / 78 870 (0,99 %)** chacune                                                                                                                                     |
| `bellum_gatekeeper_summary`            | 1 386 (1,76 %)                                                                                                                                                        |
| `bellum_expansion_candidates`          | 2 310 (2,93 %)                                                                                                                                                        |

Remplissage des colonnes typées ingérées — jamais donné par le tracker :

- `domain__median_observed_tjm` : **404 lignes sur 78 870 (0,51 %)**. Vérifié non-constant par
  domaine (34 des 47 domaines couverts ont ≥ 2 valeurs) : c'est bien un fait compte × domaine.
- `domain__recommended_procurement_route` : **0 compte sur 1 195** avec deux routes distinctes.
  Confirmé, la mesure du plan tient.
- `account__business_units` et `account__internal_startups_labs` : **66 lignes = 1 seul compte**.
- `account__sub_sector` : **vide sur 100 %** en V8 (117 col.), V9 (129 col.) ET V10 (155 col.) —
  une colonne au dictionnaire canonique, jamais remplie sur trois générations.

### B. Le `MASTER_PACK` — « non mesuré » par le tracker, mesuré ici

**26 tables canoniques, 97 668 lignes, 457 colonnes.**

| Table                               | Lignes | Col. | Citée par un tracker ?                          |
| ----------------------------------- | ------ | ---- | ----------------------------------------------- |
| `account_domain_opportunities_v10`  | 78 870 | 46   | oui (via le transport)                          |
| `top_accounts_by_domain_v10`        | 6 600  | 12   | **non**                                         |
| `account_domain_evidence_v10`       | 1 649  | 17   | plan §6 « reste à faire »                       |
| `missions_and_needs_normalized_v10` | 1 336  | 27   | plan §6                                         |
| `account_aliases_v10`               | 1 319  | 6    | **non** — alors que l'instruction dit « alias » |
| `luxembourg_ao_normalized_v10`      | 1 183  | 14   | **non**                                         |
| `master_accounts_v10`               | 1 195  | 155  | **non**                                         |
| `cross_sell_account_view_v10`       | 1 195  | 8    | **non**                                         |
| `account_clusters_v10`              | 1 150  | 7    | **non**                                         |
| `claim_audit_v10`                   | 1 011  | 12   | plan §6                                         |
| `source_registry_v10`               | 543    | 10   | **non**                                         |
| `contact_signal_aggregates_v10`     | 516    | 10   | **non**                                         |
| `data_dictionary_v10`               | 259    | 3    | **non**                                         |
| `manual_verification_queue_v10`     | 166    | 9    | **non**                                         |
| `decision_makers_normalized_v10`    | 93     | 12   | **non**                                         |
| `account_expansion_candidates_v10`  | 92     | 11   | **non**                                         |
| `account_entity_graph_v10`          | 86     | 12   | **non**                                         |
| `consulting_domain_taxonomy_v10`    | 66     | 16   | partiellement (5 des 16 colonnes)               |
| `tjm_benchmarks_v10`                | 66     | 10   | **non**                                         |
| `talent_supply_by_domain_v10`       | 66     | 9    | **non**                                         |
| `domain_demand_supply_gap_v10`      | 66     | 7    | **non**                                         |
| `unmatched_internal_entities_v10`   | 69     | 6    | **non**                                         |
| `public_claims_v10`                 | 26     | 14   | **non**                                         |
| `gatekeepers_v10`                   | 25     | 14   | plan §6                                         |
| `v10_summary_metrics`               | 14     | 2    | **non**                                         |
| `organigramme_segments_v10`         | **7**  | 8    | **non**                                         |

**`raw_v4/` — 14 onglets, 50 918 lignes, 361 colonnes**, cités par aucun tracker :

`11_LUXEMBOURG` 12 493 × 156 (dont **21 colonnes 100 % vides**) · `12_HISTORIQUE_MISSIONS`
22 168 × 3 · `02_CONTACTS` 10 614 × 19 · `05_ORGANIGRAMMES` 1 449 × 98 · `04_MISSIONS_BESOINS`
1 336 × 37 · `01_COMPTES` 1 195 × 9 · `06_PAR_SECTEUR` 771 × 5 · `13_PROSPECTS_ESN_412` 412 × 4 ·
`08_PAR_VILLE` 191 × 4 · `03_DECIDEURS_CLES` 93 × 5 · `14_CEGID_LYON` 91 × 5 ·
`09_COMPTES_A_EXPLORER` 81 × 8 (**1 colonne « Priorité » 100 % vide**) · `07_PAR_TECHNO` 15 × 5 ·
`10_DONNEES_MANQUANTES` 9 × 3.

`qa_v10.json` donne aussi, et personne ne les a repris : **40 clusters de doublons (85 comptes)**,
**69 entités internes non appariées**, `research_status` = `deep_evidence` **5** /
`partial_evidence` **67** / `internal_or_prior_only` **1 123**, `raw_nonempty_cells` **285 327**.

### C. Le PDF Stelya — 23 pages, compté comme UNE ligne

31 sections. **18 tickets BEL-DOM-1001→1018** (dont 1017 et 1018 n'ont AUCUN bloc de détail dans
le §22 — le tableau les annonce, le corps s'arrête à 1016). **8 décisions D-ST-01→08**,
**10 goldens G1-G10**, **10 interdits (§25.3)**, **10 invariants (§1.1)**, **10 critères de
viabilité (§2.3)**, **6 vérifications repo avant code (§25.2)**, **6 feature flags (§24.2)**,
**8 métriques (§24.3)**, **10 PR PR0-PR9**, **13 attentes de la matrice finale (§27)**,
**14 familles d'acheteurs (§10)**, **15 familles de signaux (§11)**, **4 niveaux de source
(§11.1)**, **5 classes de confidentialité (§20)**, **16 fichiers à étendre + 7 à créer (§21)**,
**66 domaines (§6)**, **17 domaines du pack curé (§7)**, **9 actifs V10 avec leur « ne pas faire »
(§19)**, **6 manques nommés pour Stelya (§19.1)**, **8 étapes de query planner (§19.2)**,
**1 fixture canonique (§31)**.

Le tracker de l'archive 06 en retient une ligne : « Feedback Stelya anonymisé / généralisé —
TENUE ». Il ne cite **jamais** `agent_docs/addendum-stelya-industrial-2026-08-24.md`, qui
inventorie pourtant ces items sous les repères I-01 → I-81. Le renvoi manque ; sans lui, un
lecteur de l'archive 06 conclut que la matière Stelya tient en une phrase.

---

## Ce que le tracker ne mentionne NULLE PART

| #   | Ce que la source demande                                                                                                                                                                                                                                                 | Où                                                                                                                                                                                                                                                                                                                                                         | Pourquoi c'est un trou                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Le pack porte **4 SIREN confirmés, avec leur source** (`352 463 574 (RCS Bourg-en-Bresse) [confirmé — mentions légales]`, Chanel `542 052 766`, France TV `432 766 947`)                                                                                                 | `DATAFORGE_V10_BELLUMAI_CANONICAL_INTEGRATION.csv`, colonne `account__siren_siret`, comptes DF-0014, DF-0415, DF-0758, DF-0827                                                                                                                                                                                                                             | Le tracker écrit « SIREN à 9 chiffres : **0** », corrige explicitement la mesure antérieure (« soit elle était optimiste ») et déclare « le chiffre ci-dessus est **reproductible** ». Il est faux : 264 lignes ÷ 66 = 4 comptes. Le code lui-même le savait (`1790000841267-DataforgeStaging.ts:11` : « seuls 4 comptes arrivent avec un vrai SIREN »). **Une contradiction résolue en silence, dans le mauvais sens** — et elle fonde le refus « Compléter les SIREN depuis ce fichier : il n'en porte aucun ».                                                                                                                                                                                                                                        |
| 2   | **18 colonnes** que V10 AJOUTE dans quatre espaces de noms neufs : `domain_taxonomy__*` (7), `domain_gap__*` (4), `talent_supply__*` (4), `tjm__*` (3)                                                                                                                   | En-tête du transport canonique. **V9 en avait 0** (185 col. = 129 `account__` + 30 `bellum_` + 26 `domain__`, aucune « autre »)                                                                                                                                                                                                                            | `dataforge-csv.ts:221-228` ne garde que `account__` / `domain__` / `bellum_` — **la liste de préfixes de V9**. Les 18 colonnes tombent, **sans compter comme rejets** (`parseDataforgeRecord` ne rejette que sur nombre de colonnes, identifiant, domaine ou tier). Aucune occurrence de ces quatre préfixes dans `apps/` ni `packages/`. Aucun tracker ne les nomme. C'est « un normaliseur avale les champs neufs », en 18 exemplaires.                                                                                                                                                                                                                                                                                                                |
| 3   | `consulting_domain_taxonomy_v10.csv` livre **16 colonnes pour 66 domaines** : `profiles`, `buyers`, `keywords`, `contracts`, `signals`, `barriers`, `adjacent`, `truth_rule`…                                                                                            | `canonical_v10/…/DATAFORGE_V10/consulting_domain_taxonomy_v10.csv` ; répliqué par domaine dans les 7 colonnes `domain_taxonomy__*`                                                                                                                                                                                                                         | `CONSULTING_DOMAINS` (`packages/contracts/src/schemas/consulting-domains.ts:53`) ne garde que code / labelFr / labelEn / groupe / pack. Les 6 champs métier (profils, acheteurs, mots-clés, contrats, signaux, barrières) sont **jetés à l'ingestion et absents du contrat**. Or l'addendum §19 demande explicitement : « `consulting_domain_taxonomy_v10` → Registry 66 domaines, **profils, buyers, signaux, contrats, barrières** ».                                                                                                                                                                                                                                                                                                                  |
| 4   | Le dé-silotage des SOURCES de Découvrir, pour **les 66 domaines**                                                                                                                                                                                                        | `domain_taxonomy__keywords` + `domain_taxonomy__signals` (66/66 remplis) ; `search_lexicon_by_domain.csv` (V9, 32 domaines, 7 col.)                                                                                                                                                                                                                        | `domain_job_filters.py` et `domain_market_filters.py` ne déclarent que **2 packs** (`esn_it`, `industrial_engineering`) sur 8. Pour un vendeur finance, PMO, RH, supply-chain ou product-design, les sources restent ROME `M18` et CPV `48/72`. Le lexique de recherche des 64 autres domaines était **dans le CSV, dans des colonnes que le parseur jette**.                                                                                                                                                                                                                                                                                                                                                                                            |
| 5   | `bellum_existing_pack_status` = `no_curated_pack_yet` sur **23 des 66 domaines (27 485 lignes)**, et `bellum_domain_support_gap` = `CRITICAL_FOR_NON_IT__CREATE_DOMAIN_PACK_BEFORE_USER_FACING_CLAIMS`                                                                   | Transport canonique, deux colonnes `bellum_*`                                                                                                                                                                                                                                                                                                              | `dataforge-v10-plan.md:43-46` reprend le mapping `bellum_existing_offer_pack` — et **laisse tomber les deux colonnes qui le qualifient**. Le CSV dit sur 27 485 lignes « pas de pack curé, ne rien affirmer à l'utilisateur avant d'en créer un » ; ces valeurs partent dans `domain_payload` (jsonb) et **rien ne les lit**. La 3ᵉ colonne, encore.                                                                                                                                                                                                                                                                                                                                                                                                     |
| 6   | `bellum_ingestion_recommendation` : `STAGE_RAW_TABLES_IMMUTABLE` · `INGEST_THIS_CANONICAL_VIEW_AS_PRIOR_INDEX` · `RESOLVE_ACCOUNT_ID_TO_BELLUM_ACCOUNT_ID` · `VERSION_ALL_CLAIMS`                                                                                        | Transport canonique, 78 870/78 870 lignes                                                                                                                                                                                                                                                                                                                  | Sur 4 consignes, **1 est tenue** (l'index de priors). Les tables brutes ne sont pas stagées ; il n'existe **aucune table de liaison `dataforge_accounts` ↔ `accounts`** (`grep REFERENCES` sur la migration : 0) ; « versionner toutes les claims » n'a pas de porteur. Non mentionné.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 7   | `README_V10.md` règle non négociable n°4 : « **Use cluster primaries for rankings** to avoid duplicate accounts » — 40 clusters, 85 comptes                                                                                                                              | `README_V10.md`, `account_clusters_v10.csv` (1 150 l.), `qa_v10.json:duplicate_clusters: 40`                                                                                                                                                                                                                                                               | `is_cluster_primary` est **écrit et jamais lu** (`grep isClusterPrimary` : entité, migration, parseur, test — aucun lecteur). Conséquence concrète : `priorsForSiren` fait `findOne({ where: { siren } })` sur un index **non unique**, et DF-0014 / DF-0415 / DF-0425 sont le MÊME Groupe Martin Belaysoud avec le **même SIREN 352 463 574**. Deux des quatre comptes à SIREN du pack sont un doublon. La ligne rendue est arbitraire, et leurs 66 lignes de domaine diffèrent. Le cron de résolution généralisera le problème aux 40 clusters.                                                                                                                                                                                                        |
| 8   | `README_V10.md` règle n°1 : « **use `claim_audit_v10.csv` BEFORE consuming legacy factual fields** » (1 011 lignes) ; règle n°3 : « ne jamais confondre un partenaire techno, un cas client, un outil de facturation ou de conformité avec un panel/VMS »                | `README_V10.md`, `claim_audit_v10.csv`, `bellum_claim_audit_summary`                                                                                                                                                                                                                                                                                       | Le résumé d'audit est **déjà dans le transport canonique** (colonne `bellum_claim_audit_summary`), donc ingéré dans `domain_payload` — et jamais lu. Le tracker de l'archive ne cite ni la règle ni la table ; `dataforge-v10-plan.md:111-112` cite `claim_audit` comme « reste à faire » et l'archive du 25/08 clôt par-dessus sans la reprendre.                                                                                                                                                                                                                                                                                                                                                                                                       |
| 9   | `schema_v10.json:scope_rules` — **6 règles de portée** (héritage groupe, pages carrières ≠ procurement, outils de facturation ≠ VMS, cas client = déclaration fournisseur, clusters, scores à lire avec tier+confidence+sources)                                         | `schema_v10.json`                                                                                                                                                                                                                                                                                                                                          | Une seule est tenue et nommée (l'héritage groupe, via `procurement_inheritance_warning`). Les cinq autres n'apparaissent nulle part — ni au tracker, ni à GA-37, ni au registre de doctrine.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 10  | `README_V10.md` §« Recommended Bloom ingestion order » — **8 étapes**, dont l'étape 8 : « `raw_v4/` **only as immutable provenance; do not flatten heterogeneous tabs blindly** »                                                                                        | `README_V10.md`                                                                                                                                                                                                                                                                                                                                            | L'ordre déclaré par la source ne mentionne pas le transport canonique. Le tracker §3 justifie de ne pas mesurer le pack en écrivant « le transport canonique EST la voie d'intégration déclarée » — **la source déclare l'inverse**. Le renvoi est mort dans les deux sens : ni l'ordre ni la mise en garde ne sont repris.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 11  | `source_registry_v10.csv` (543 lignes × 10) — la couche de provenance, étape 6 de l'ordre d'ingestion                                                                                                                                                                    | `canonical_v10/…/source_registry_v10.csv`                                                                                                                                                                                                                                                                                                                  | Le dépôt a une primitive `Provenance` (source + date) qui est une règle de design gardée. Le pack livre 543 sources normalisées et **aucun tracker ne les compte**. Le transport n'en garde que `domain__source_1/2/3`, remplis à **1,55 % / 1,10 % / 0,66 %**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 12  | Dix tables que **V10 a supprimées** et que le pack conserve dans ses `legacy_packs/` imbriqués                                                                                                                                                                           | `legacy_packs/DATAFORGE_V9_MASTER_PACK_EXTRACTED/` et `…V8…/`                                                                                                                                                                                                                                                                                              | `procurement_channel_taxonomy.csv` (12 canaux d'achat × 5 col. — exactement le `route_type` que réclame l'addendum §12) · `market_archetypes.csv` (21 archétypes avec `default_externalization_score` — la DÉFINITION du prior que le transport canonique porte par ligne sous `account__v9_market_archetype`) · `search_lexicon_by_domain.csv` (32) · `public_research_overlays.csv` (14) · `relationships.csv` (61 × 18) · `sources.csv` (582) · `data_quality_summary.csv` · `iteration_registry.csv` (25) · `raw_v4_verification.csv` (14) · `raw_v4_index.csv` (14). Le tracker écarte le V9 en bloc (« V10 prévaut ») — la résolution du README est vraie, mais elle ne dit pas que V10 a PERDU des tables au passage. **Un item traité en bloc.** |
| 13  | Le pack contient des **données personnelles nommées et non anonymisées**                                                                                                                                                                                                 | `raw_v4/02_CONTACTS.csv` : 10 614 lignes, colonnes `Prénom;Nom;Email;Téléphone;LinkedIn` — **8 920 lignes portent un e-mail** ; `03_DECIDEURS_CLES` 93 ; `decision_makers_normalized_v10` 93 ; `talent_supply_by_domain_v10.example_roles` contient des présentations de candidats verbatim (« Recrutée pour être la future directrice de projet chez … ») | `METHODOLOGY_V10.md` l'assume (« Raw internal contact/candidate files are preserved because they are supplied source data ») et la table porte même une colonne `privacy_note`. **Aucun tracker ne pose la question** — ni rétention, ni base légale, ni ce qu'on fait de 8 920 adresses e-mail. L'archive est `.gitignore`d (`.gitignore:176`, 0 fichier suivi — vérifié), donc pas de fuite par le dépôt ; mais le §3 « ce qu'on ne promet pas » aurait dû nommer la donnée personnelle plutôt que le poids du zip.                                                                                                                                                                                                                                    |
| 14  | `domain_taxonomy__cross_sell_logic` est déclarée dans le transport canonique et **vide sur 78 870/78 870 lignes** — pendant que `bellum_unique_value_not_scrapable` désigne `CROSS_SELL_DOMAIN_LOGIC` comme l'une des **cinq valeurs uniques et non-scrapables** du pack | Transport canonique                                                                                                                                                                                                                                                                                                                                        | La seule colonne 100 % vide du fichier est celle que le fichier présente comme son actif propriétaire. La donnée existe ailleurs (`cross_sell_account_view_v10.csv`, 1 195 l. ; `consulting_domain_taxonomy_v10.adjacent`, 66/66). Personne ne l'a vu parce que personne n'a mesuré le taux de remplissage par colonne.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 15  | `manual_verification_queue_v10.csv` — 166 tâches de vérification priorisées, avec leur `priority_score` et leurs 5 gestes                                                                                                                                                | `manual_verification_queue_v10.csv` + colonne `bellum_manual_verification_task` (166 lignes, 0,21 %)                                                                                                                                                                                                                                                       | Ingérée en colonne typée `manual_verification_task`, **jamais lue**. L'addendum §19 la nomme (« Prioriser les recherches live à forte valeur »), §19.2 en fait l'étape 2 du query planner. Le tracker de l'archive ne la cite pas ; le plan ne la liste même pas dans son §6.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 16  | `domain_demand_supply_gap_v10.csv` : l'indice est calculé **relativement à l'offre de candidats du LUXEMBOURG** (« relative to known Luxembourg candidate supply. Internal analytical indicator only »)                                                                  | `domain_demand_supply_gap_v10.csv`, colonne `interpretation` ; `luxembourg_ao_normalized_v10.csv` 1 183 l. ; `raw_v4/11_LUXEMBOURG.csv` 12 493 l.                                                                                                                                                                                                          | Vérifié : `domain_gap__demand_supply_gap_index` est **constant par domaine** (0 domaine sur 66 avec deux valeurs) — c'est un prior de domaine, à portée luxembourgeoise, transporté sur chaque ligne compte × domaine. Ingéré tel quel il deviendrait « la demande de ce compte ». C'est exactement `prior ≠ evidence`. La portée Luxembourg n'est nommée dans aucun tracker.                                                                                                                                                                                                                                                                                                                                                                            |
| 17  | `tjm_benchmarks_v10.csv` : `source` = « **Internal DATAFORGE missions/needs; not a market-wide benchmark** », `confidence` low/medium                                                                                                                                    | `tjm_benchmarks_v10.csv` (66 l.) ; colonnes `tjm__median_tjm`, `tjm__observed_mission_rows`, `tjm__confidence`                                                                                                                                                                                                                                             | Vérifié constant par domaine (0/48). Deux TJM cohabitent dans le même fichier : `domain__median_observed_tjm` (fait compte × domaine, 0,51 % de remplissage, ingéré) et `tjm__median_tjm` (prior de domaine, jeté). Personne n'a écrit la différence — et l'entité affirme « TJM médian OBSERVÉ par le pack, jamais un TJM estimé » sans dire que 99,49 % des lignes n'en portent aucun.                                                                                                                                                                                                                                                                                                                                                                 |
| 18  | Les 4 instructions du `README.md` de l'archive, dont la 3ᵉ : « **Brancher OfferPortfolio et ConsultingDomainContext** »                                                                                                                                                  | `06_DATAFORGE_MULTIDOMAIN_STELYA/README.md:21`                                                                                                                                                                                                                                                                                                             | Absente du tableau « Les trois instructions ». C'est la seule des quatre qui exige du code produit ; les trois retenues sont des interdits faciles à déclarer TENUS.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 19  | Les **5 chantiers ouverts** que `dataforge-v10-plan.md` §6 laisse en « Reste à faire »                                                                                                                                                                                   | `agent_docs/dataforge-v10-plan.md:103-118` — fichier **inchangé depuis le 24/08** (miroir de l'archive byte-identique au dépôt)                                                                                                                                                                                                                            | L'archive du **25/08** déclare « Deux chantiers **clos** » sans citer ce §6 ni reprendre un seul de ses items. Vérifié dans le code au 29/08 : les tables séparées ne sont toujours pas ingérées ; l'exposition produit des faits Tier A/B n'existe pas (`evidence_tier` n'apparaît nulle part hors `dataforge/`) ; le rafraîchissement des Tier B n'a aucun porteur. **L'archive est close par-dessus un plan qui reste ouvert.**                                                                                                                                                                                                                                                                                                                       |
| 20  | `BEL-DOM-1005` / §13.2 : le bloc « Surface informatique » (20 pts) devient `domain_demand_surface`, « Capacité observée et **signaux spécifiques au domaine** »                                                                                                          | PDF Stelya §13.2, §18 (table de substitution : « Surface informatique → Surface de demande du domaine »)                                                                                                                                                                                                                                                   | `grep domain_demand_surface apps packages` = **0 occurrence**. `DISCOVER_SCORE_BLOCKS` porte toujours `{ key: 'it_surface', max: 20 }` et `_MAX_IT_SURFACE = 20`. Ce qui a été livré est `_surface_wording()` : un **changement de libellé** (« surface industrielle ») sous un test binaire `is_industrial_seller()`. Le calcul est identique (effectif + signaux `hiring`/`tech`) ; les quatre signaux nommés par la source — CAPEX, plan de charge, AO, externalisation — n'y entrent pas. Le tracker Stelya coche pourtant « 6 — sources par domaine, **puis Discover** : ✅ prod ». Le libellé a changé, le barème non.                                                                                                                             |
| 21  | `bellum_prompt_usage` : `INJECT_AS_CONSULTING_DOMAIN_CONTEXT_PRIOR` sur 100 % des lignes                                                                                                                                                                                 | Transport canonique                                                                                                                                                                                                                                                                                                                                        | `priorsForSiren` n'a **aucun consommateur de production** — assumé et écrit au registre de doctrine, tenu par GA-37 plutôt que par un guard. L'arbitrage est défendable ; ce qui manque, c'est que **le tracker de l'archive ne le dise pas** : il coche « Ne jamais ingérer le CSV comme table métier unique — TENUE, staging + résolveur » sans écrire que le staging ne débouche sur rien. Un lecteur en conclut que la donnée est branchée.                                                                                                                                                                                                                                                                                                          |

---

## Colonnes jamais ingérées, ou ingérées et jamais lues

### Jamais ingérées — **18 colonnes**, jetées par un filtre de préfixe, non comptées en rejets

`dataforge-csv.ts:221-228` :

```ts
if (column.startsWith('account__') && !CONSUMED_ACCOUNT_COLUMNS.has(column)) { … }
else if ((column.startsWith('domain__') || column.startsWith('bellum_')) && …) { … }
// tout le reste tombe, en silence
```

| Colonne                                      | Remplissage    | Constante par domaine ? | Ce qu'elle porte                                    |
| -------------------------------------------- | -------------- | ----------------------- | --------------------------------------------------- |
| `domain_taxonomy__profiles`                  | 66/66 domaines | oui                     | les profils vendables du domaine                    |
| `domain_taxonomy__buyers`                    | 66/66          | oui                     | **les fonctions acheteuses** — cœur de BEL-DOM-1006 |
| `domain_taxonomy__keywords`                  | 66/66          | oui                     | **le lexique de recherche** — cœur du lot 6         |
| `domain_taxonomy__contracts`                 | 66/66          | oui                     | modèles de contrat                                  |
| `domain_taxonomy__signals`                   | 66/66          | oui                     | **la grille de signaux** — cœur de BEL-DOM-1005     |
| `domain_taxonomy__barriers`                  | 66/66          | oui                     | barrières de qualification                          |
| `domain_taxonomy__cross_sell_logic`          | **0/78 870**   | —                       | vide à la source (cf. trou 14)                      |
| `domain_gap__verified_account_count`         | 66/66          | oui                     | comptes vérifiés du domaine                         |
| `domain_gap__weighted_average_opportunity`   | 66/66          | oui                     | opportunité moyenne pondérée                        |
| `domain_gap__candidate_supply_rows`          | 66/66          | oui                     | offre de candidats (**périmètre Luxembourg**)       |
| `domain_gap__demand_supply_gap_index`        | 66/66          | oui                     | l'indice demande/offre                              |
| `talent_supply__candidate_profile_rows`      | 66/66          | oui                     | profils au vivier                                   |
| `talent_supply__immediate_availability_rows` | 66/66          | oui                     | disponibilités immédiates                           |
| `talent_supply__eu_work_authorized_rows`     | 66/66          | oui                     | autorisations de travail                            |
| `talent_supply__median_years_experience`     | 63/66          | oui                     | ancienneté médiane                                  |
| `tjm__observed_mission_rows`                 | 66/66          | oui                     | assiette du TJM                                     |
| `tjm__median_tjm`                            | 48/66          | oui                     | TJM médian de domaine                               |
| `tjm__confidence`                            | 66/66          | oui                     | **la confiance associée** — jetée avec le reste     |

Deux choses à retenir. **(a)** V9 (185 colonnes) n'avait aucune colonne hors de ces trois
préfixes : le filtre était juste, et il a cessé de l'être quand le fichier a changé de forme.
**(b)** Toutes ces colonnes sont des **priors de domaine** répétés 1 195 fois : les ingérer
naïvement en colonne de compte fabriquerait de la donnée. Le trou n'est pas « il faut les
ingérer » — c'est que **personne ne sait qu'elles existent**, et qu'aucun rejet ne les signale.

### Ingérées et jamais lues

| Où                                                             | Quoi                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dataforge_accounts.account_payload` (jsonb)                   | les ~63 colonnes `account__*` restantes. **Aucun lecteur** dans `apps/` ni `packages/`.                                                                                                                                                                                                                                                                                     |
| `dataforge_account_domains.domain_payload` (jsonb)             | les colonnes `domain__*` / `bellum_*` restantes, dont `bellum_existing_pack_status`, `bellum_domain_support_gap`, `bellum_live_research_required`, `bellum_prompt_usage`, `bellum_claim_audit_summary`, `bellum_gatekeeper_summary`, `bellum_expansion_candidates`, `bellum_unique_value_not_scrapable`, `bellum_code_impacts`, `bellum_prompt_impacts`. **Aucun lecteur.** |
| `dataforge_accounts.is_cluster_primary` / `cluster_primary_id` | écrits, jamais lus — alors qu'une règle non négociable du pack impose de s'en servir (trou 7).                                                                                                                                                                                                                                                                              |
| `dataforge_account_domains.manual_verification_task`           | colonne typée, 166 lignes, aucun lecteur.                                                                                                                                                                                                                                                                                                                                   |
| Les 23 colonnes typées de `DataforgeAccountDomainEntity`       | lues uniquement par `priorsForSiren`, **qui n'a aucun appelant de production**. Toute la chaîne parseur → staging → lecture s'arrête à un point d'entrée que rien ne consomme.                                                                                                                                                                                              |

---

## Verdict : le `DONE` est-il défendable ?

**Non.**

Ce n'est pas un tracker bâclé — c'est même un des plus soigneux : il refait sa mesure après avoir
identifié son propre parseur naïf, il distingue prior et preuve, il nomme ce qu'il ne promet pas.
Le problème est ailleurs, et il est de la même famille que celui de l'archive 00 : **il a choisi
son dénominateur, puis a été rigoureux à l'intérieur.**

Trois faits suffisent à retirer le `DONE`.

1. **Le dénominateur est 16 fichiers de manifeste (dont 7 sont le dépôt), sur 127 fichiers
   distincts et plus de 350 exigences.** Le `MASTER_PACK` est déclaré « non mesuré » au motif
   qu'il faudrait le décompresser — il est déjà décompressé dans l'archive, il porte 26 tables,
   97 668 lignes et 457 colonnes, son propre README y déclare un ordre d'ingestion en 8 étapes
   dont le transport canonique ne fait pas partie, et le mesurer change au moins six décisions.
   Le PDF Stelya — 23 pages, 18 tickets, 8 décisions — est une ligne de tableau, sans même un
   renvoi vers le tracker qui l'inventorie réellement.

2. **La mesure mise en avant est fausse, et elle fonde un refus.** « SIREN à 9 chiffres : 0 »,
   déclaré « reproductible », contredisant explicitement la bonne mesure antérieure. Il y en a 4,
   confirmés, sourcés dans le fichier, et le commentaire de la migration du dépôt le disait déjà.
   Le refus « Compléter les SIREN depuis ce fichier — il n'en porte aucun » repose sur ce zéro.
   Et deux de ces quatre comptes sont **le même Groupe Martin Belaysoud avec le même SIREN** —
   ce que `is_cluster_primary`, écrit et jamais lu, aurait permis de trancher.

3. **L'archive est close par-dessus un plan qui reste ouvert.** `dataforge-v10-plan.md` §6 liste
   cinq chantiers restants ; le tracker du lendemain écrit « deux chantiers clos » sans en citer
   un seul. Vérifié dans le code au 29/08 : les tables séparées ne sont pas ingérées, les faits
   Tier A/B n'ont aucune surface produit, le rafraîchissement des Tier B n'a pas de porteur, et
   `domain_demand_surface` — le livrable nommé de BEL-DOM-1005 — a **zéro occurrence** dans le
   dépôt alors que le tracker Stelya coche « puis Discover ✅ prod ».

**Les trois trous les plus lourds, par ordre de gravité :**

- **Les 18 colonnes tombées par le filtre de préfixe** (trou 2). Elles ne sont pas rejetées, elles
  sont invisibles. Et ce qu'elles portent — `domain_taxonomy__keywords`, `__signals`, `__buyers`,
  `__barriers`, `__contracts` pour les 66 domaines — est exactement la matière que le lot 6 dit
  manquer pour dé-siloter les sources au-delà de deux packs sur huit. Le dépôt a écrit à la main,
  pour 2 packs, ce que le fichier livrait pour 66.
- **Le zéro SIREN faux + les clusters jamais lus** (trous 1 et 7). Une mesure fausse déclarée
  reproductible, qui ferme une porte ouverte ; et une règle non négociable de la source
  (« use cluster primaries ») dont la colonne est écrite et jamais lue, sur un index `siren`
  non unique où 40 clusters produiront des collisions dès que le cron de résolution aura tourné.
- **Toute la chaîne d'ingestion s'arrête sur un point d'entrée sans appelant** (trou 21), pendant
  que le tracker coche trois instructions « TENUE » qui laissent croire que la donnée est branchée.
  L'arbitrage (garde d'architecture plutôt que guard mort) est bon et documenté au registre de
  doctrine — mais il est absent du tracker qui clôt l'archive.

**Ce que ce `DONE` peut légitimement couvrir**, et qu'il faudrait réécrire ainsi : _le transport
canonique V10 est mesuré, stagé, et ses priors sont tenus à l'intérieur du système par GA-37._
Rien de plus. Le pack de données, lui, n'a pas été ouvert.
