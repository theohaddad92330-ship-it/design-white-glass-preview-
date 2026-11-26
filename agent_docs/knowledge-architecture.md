# BellumAI — Architecture du knowledge (actif de donnée scalable)

Source : échange Théo 2026-07-06 (« je ne veux pas un RAG lourd pour faire un RAG ;
si une grosse partie de la méthode peut devenir algos/règles/config, c'est mieux
pour la scalabilité — mais évitons que ça reste un dossier knowledge + prompts
flous »). Ce fichier est la référence in-repo de la structuration du knowledge.
Fait à partir d'un scan du code réel (chaque niveau cite les fichiers).

## Thèse

> Le knowledge n'est pas un dossier de docs + prompts. C'est **3 couches
> distinctes**, chacune avec son mode de stockage et de mise à jour :
> **(1) config/règles** versionnées, **(2) prompts spécialisés**, **(3) RAG/mémoire**.
> La règle de scalabilité : tout ce qui est déterministe descend en couche 1
> (config), le jugement reste en couche 2 (prompts), l'historique/continu monte
> en couche 3 (RAG) — plus tard.

## Les 3 niveaux (Théo) → état du code

### Niveau 1 — Règle / algo / config

Ce qui est déterministe : scoring, taxonomies (contacts, technos, rôles, statuts),
qualité des sources, no-go, zones, gates.

| Déjà en code                                                               | Fichier                                                                                                            |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Grilles de score /25 · /20 · /100                                          | `apps/ia/app/services/account_score.py`, `perimeter_score.py`, `packages/contracts/src/schemas/classified-data.ts` |
| Taxonomie entités + gate + no-go                                           | `apps/ia/app/services/entities.py`                                                                                 |
| Statuts de vérité (7 : fait/registre/signal/hypothèse/reco/risque/inconnu) | `apps/ia/app/services/truth_status.py`                                                                             |
| Qualité de source (faible = ia_reconstruction)                             | `apps/ia/app/services/source_quality.py`                                                                           |
| Zones influence × accessibilité                                            | `apps/ia/app/services/prioritization.py`                                                                           |
| Profiler ESN (archetype, entry mode, no-go)                                | `apps/ia/app/services/esn_profiler.py`                                                                             |
| KB sectorielle / concurrents / objections                                  | `apps/ia/app/knowledge/*.json`                                                                                     |

**Le problème** : ces règles SONT en code (bien), mais **éparpillées** dans ~10
fichiers, **sans `VERSION`**, **sans override runtime**, **sans registre central**.
On ne peut pas ajuster un seuil sans redeploy ni tracer d'où vient une valeur.

**La cible — couche config déclarative** `apps/ia/app/config/` :

- 1 module par domaine : `scoring.py`, `taxonomy.py`, `sources.py`, `zones.py`.
- Chaque config = objet Pydantic typé + `VERSION` + réf provenance (Drive Théo).
- **2 tiers** :
  - **defaults shippés** (git, versionnés, testés) — ce qui existe aujourd'hui ;
  - **overrides runtime** = table `config_overrides` (par ESN / tenant). Un loader
    merge `defaults ← overrides`.
- → un seuil se change **sans redeploy** (override), c'est audité + diffable, et
  une page admin peut le tuner plus tard.

C'est ça qui fait du knowledge un **asset** : une source de vérité typée,
versionnée, override-able — pas des constantes dispersées.

**État (fait)** : `apps/ia/app/config/knowledge_config.py` — `KnowledgeConfig`
(frozen, `version`) + `get_config()` / `set_overrides()` / `clear_overrides()`
(defaults ← overrides deep-mergés, in-process). Domaines migrés : `sources`
(weak_sources), `no_go` (min_keyword_len + stopwords), `group_relationship`
(min_esn_name_len + generic_esn_words) — consommés par `source_quality` /
`entities` / `group_relationship`. **Override persistant** : table `config_overrides`
(scope='global', patch JSONB — migration NestJS owner) + loader IA
(`overrides_loader.py`, lu au boot, dégradable) + `POST /config/reload` (interne)
pour appliquer à chaud, `GET /config/current` pour la page admin. **Reste** :
migrer `scoring` + `taxonomy` ; scope par-ESN (aujourd'hui 'global').

### Niveau 2 — Prompts spécialisés

Le jugement : interprétation des signaux, choix d'offres, organigrammes, messages,
plan, justification, juges qualité/source.

**Aujourd'hui** : prompts monolithiques `bellum_facts / signals / strategy / plan /
messages / contacts / advisor`. Scorer + Quality Judge sont déjà **déterministes**
(couche 1, bien).

**La cible (Théo)** — décomposer en agents nommés, alignés sur la mission LangGraph v2
(un node = un agent) :

`ProfileInterpreter · EntitySelector · SignalInterpreter · ContactMapper ·
AccountScorer · PlaySelector · ActionPlanGenerator · MessageGenerator ·
QualityJudge · SourceJudge · AccountVocabularyBuilder`

Refactor progressif : chaque agent = un prompt + un contrat d'E/S typé. Ne pas
tout casser d'un coup ; séquencer par node.

**État (fait)** : registre `app/agents/registry.py` — les 11 agents nommés pointent
vers leur implémentation RÉELLE (résolue/testée) avec leur TYPE `algo` (déterministe,
niveau-1) vs `prompt`. Note : AccountScorer / QualityJudge / SourceJudge /
ProfileInterpreter / EntitySelector sont **algo** ici (c'est le niveau-1 voulu, pas
un prompt flou). **AccountVocabularyBuilder** = prompt `bellum_vocabulary_builder` +
`account_vocabulary.enrich_vocabulary` (enrichit meaning/commercialWhy + termes ratés
par le déterministe), **opt-in** `VOCAB_ENRICH=true` (coût), dégradable. **Reste** :
extraire les prompts monolithiques restants en modules par-node (LangGraph v2).

### Niveau 3 — RAG / mémoire (plus tard)

Plans de compte internes, CRM, notes, historiques, messages envoyés, retours
utilisateurs, chatbot, mémoire continue.

**Déjà** : `rag_documents` (pgvector) — mais c'est une KB méthodologie/secteur, PAS
la mémoire par compte. `chat.py` existe mais **stateless** (pas de persistance
conversation). Objets typés `Play` / `Cockpit` posés (fondation).

**État (fait — branché sur demande, malgré la réserve "pas de RAG lourd" de Théo)** :

- **Grounding chatbot** : `rag_service.retrieve_knowledge_context` injecte les docs
  user dans le prompt advisor (`bellum_advisor`). Dégradable.
- **Grounding analyse** : idem dans le plan (`build_plan_shared_context`, phase 4).
- **Mémoire continue** : table `chat_messages` (RLS) + `conversation_service`
  (load/save via Supabase, dégradable) ; le chat recharge l'historique et persiste
  chaque tour → mémoire cross-session.
- **Embeddings vectoriels** : DÉJÀ présents (`PgVectorSearch` + `ingest` calcule
  l'embedding), **key-gated** — la clé EST l'interrupteur, activer avec
  `EMBEDDING_API_KEY` (OpenAI/Voyage) + le RPC `match_rag_documents`. Sans clé →
  fallback text-search (ILIKE). Pas de code à écrire, juste config/déploiement.

**Cible restante** : `account_memory` structurée (au-delà des tours bruts) ;
validation live de l'effet des embeddings + du grounding sur la sortie Claude.

## L'objet « vocabulaire du groupe » (grille de lecture par compte)

La demande concrète de Théo. Sur VINCI : Axians, VESI, VCSI, ERP Codex, POSIT'V,
Leonard, VINCI Energies, VINCI Construction, Autoroutes, bruit « Da Vinci »… Pour
chaque terme : sens, importance commerciale, nature (entité / programme / concurrent
interne / piège / angle / bruit).

### Schéma

```
AccountVocabulary { accountId, terms: VocabularyTerm[], version, builtAt }
VocabularyTerm {
  term          # "Axians", "ERP Codex", "POSIT'V", "Da Vinci"
  kind          # entity | program | internal_competitor | tool_erp | trap_noise
                #  | angle | person | acronym
  meaning       # ce que ça veut dire
  commercialWhy # pourquoi ça compte commercialement
  aliases[]     # VESI, VCSI…
  relatedEntity # rattachement (VINCI Energies…)
  truthStatus   # réutilise niveau-1 truth_status (fait/registre/hypothèse)
  sourceRefs[]  # d'où ça vient
}
```

### Construction (hybride — pas full-LLM)

- **Déterministe** (réutilise le niveau 1) : `entities.py` (kind entity/noise/
  out_of_sector), competitor detection (`internal_competitor`),
  `group_relationship` (Axians = insider), noise filter (Da Vinci = trap).
  → ~moitié des termes taggés sans LLM.
- **Prompt `AccountVocabularyBuilder`** (niveau 2) : extrait des sources scrapées
  les programmes / ERP / acronymes / pièges que le déterministe rate (Codex,
  POSIT'V, Leonard) + le `commercialWhy`.

### Persistance

Table normalisée **`account_vocabulary`** (PAS dans le blob `raw_analysis`) →
queryable, updatable par terme, **mergeable au re-run partiel** (comme les contacts).
Clé `(account_id, term)`.

### Consommation

Front (page glossaire / grille de lecture), `MessageGenerator` (messages qui
parlent le vrai vocabulaire du groupe = crédibles), chatbot, mémoire.

## Stratégie de persistance — les 3 tiers

| Tier              | Quoi                                                                   | Où                                                                    | Updatable ?           |
| ----------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------- |
| **Config**        | règles / seuils / grilles                                              | git (defaults) + table `config_overrides`                             | oui, sans redeploy    |
| **Objets compte** | account, contacts, angles, plan, **vocabulary**, cockpit/plays (typés) | tables Postgres normalisées + snapshot `raw_analysis`                 | oui, merge par re-run |
| **RAG / mémoire** | plans internes, CRM, notes, messages envoyés, conversations, retours   | `rag_documents` (pgvector) + futures tables `memory` / `conversation` | append continu        |

**Règle d'or** : promouvoir les objets clés du blob `raw_analysis` → **tables**
(le vocabulaire d'abord). C'est ce qui les rend updatables + queryables + mergeables
(re-run) + prêts-chatbot. Le blob reste le snapshot complet ; les tables = la
vérité vivante.

## Séquence

1. **AccountVocabulary** (objet + builder hybride + table) — max valeur : sert
   front / messages / chatbot, buildable + testable maintenant (déterministe) + 1 prompt.
2. **Centraliser la config** `apps/ia/app/config/` — refactor des constantes
   éparses en modules versionnés + loader d'overrides.
3. **Décomposer les prompts** en 11 agents nommés — aligné mission LangGraph v2.
4. Mémoire / chatbot = tier 3, après (objets typés déjà posés).
