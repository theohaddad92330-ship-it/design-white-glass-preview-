# Base de connaissance BellumAI (KB) — index

Distillation de la KB métier (Google Drive, dossier "JUIN 2026", owner theo@bellum-it.com). Écrite par des commerciaux : on garde la **puissance métier**, on la ré-ingénierie en prompts propres (logique conservée, structure JSON + contrats dashboard, bavardage retiré). Aucune PII/CRM brute ici (les données CRM réelles → piste RAG-ingestion).

But : source de vérité pour **réécrire les prompts** de `apps/ia/app/prompts/` et, plus tard, alimenter le RAG.

## Docs cœur (méthode + prompts)

| Doc                                                         | Contenu                                                                                    | Nourrit                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| [methode-plan-de-compte-esn](methode-plan-de-compte-esn.md) | LA méthode terrain (Théo) : scoring /25, 5 rôles, plays, cadence 10j, sandwich, 30/60/90   | facts, strategy, organigramme, contacts, plan, messages |
| [system-prompt-bellumai](system-prompt-bellumai.md)         | Prompt maître live : labeling 3-niveaux, pipeline 6 étapes, blocs de sortie, poids scoring | facts, signals, strategy, organigramme, plan            |
| [account-mapping](account-mapping.md)                       | Taxonomie décideurs (familles + niveaux + score), chaîne de décision, zones blanches       | organigramme, contacts                                  |
| [messages-linkedin-esn](messages-linkedin-esn.md)           | 3 personas × 4 scénarios × séquence 3 temps, 8 règles d'or, phrases bannies, templates     | messages, icebreaker, contacts                          |
| [prompt-orion-accountplan](prompt-orion-accountplan.md)     | Archi de référence account-plan-from-name (12 sections, quality gates)                     | facts, organigramme, strategy, plan                     |

## Méthode & tactique

| Doc                                                                                        | Nourrit                                                |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| [modele-plan-de-compte](modele-plan-de-compte.md) — 6 sections plan, 6 niveaux d'influence | organigramme, contacts, strategy, plan                 |
| [pitch-telephonique](pitch-telephonique.md) — call 5 étapes + 2 banques d'objections       | strategy (rdvScript/phoneOpener, objections), messages |
| [soutenance-25-questions](soutenance-25-questions.md) — 25 questions client                | strategy (powerQuestions, objections, rdvScript)       |
| [bible-sales-hacks](bible-sales-hacks.md) — 100 hacks (openers, relances, qualif)          | contacts/messages, icebreaker, strategy                |

## Architecture & principes produit

| Doc                                                     | Principe clé                                                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [taxonomie-donnees](taxonomie-donnees.md)               | **Fait / Signal / Hypothèse / Action** — chaque donnée porte son niveau + confiance                                         |
| [usage-contexte-par-etape](usage-contexte-par-etape.md) | **Faits mutualisés vs interprétation personnalisée** — 2 blocs d'input séparés                                              |
| [dispatch-flux](dispatch-flux.md)                       | Pipeline fan-out : 1 contexte enrichi → 5 sorties métier indépendantes ; pas de payload source brut dans les prompts métier |
| [map-agents](map-agents.md)                             | Carte des agents : collecte → structuration → 5 agents de sortie                                                            |
| [overview-produit](overview-produit.md)                 | Promesse produit, qualité par livrable, anti-hallucination                                                                  |
| [note-v1-prompts](note-v1-prompts.md)                   | V1 en 3 paliers ; prompts = couche d'interprétation métier                                                                  |
| [strategie-rag](strategie-rag.md)                       | RAG = contexte ciblé par type de mémoire (user/account/session) ; pas un dump top-k                                         |

## Ressources

| Doc                                         | Usage                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| [liste-esn-france](liste-esn-france.md)     | ~250 ESN — dictionnaire détection concurrents (signals/strategy)          |
| [crm-data-inventory](crm-data-inventory.md) | Schéma/volumétrie CRM réel (PII gardée hors repo) — piste RAG             |
| [prompt-aquila](prompt-aquila.md)           | Marketing-only — faible valeur ; à emprunter : matrice Impact×Faisabilité |

## Règles transverses à encoder dans TOUS les prompts métier

1. **Étiquetage 3 niveaux** : `Fait vérifié` / `Signal :` / `Non détecté — recherche manuelle recommandée`. Jamais combler un vide.
2. **Fiabilité par recoupement** : 1 source = hypothèse, 2 = probable, 3 = validé.
3. **2 blocs d'input séparés** : `contexte_compte_enrichi` (factuel, mutualisé) + `contexte_user` (oriente/pondère, jamais reformulé en fait).
4. **Phrases bannies** (messages) : « je me permets de », « juste un petit follow-up », « nos expertises reconnues », « notre méthodologie éprouvée », jargon ESN.
5. **Sorties actionnables** : finir par des next steps datés, pas un diagnostic.
