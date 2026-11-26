# État des lieux technique détaillé — BellumAI

> Distillé d'un doc d'alignement interne (« 01_2 État des lieux technique détaillé »), document de travail à destination de Matteo.
> Aucune donnée personnelle conservée.

## Nature réelle du document

Malgré son titre, ce document **n'est PAS un teardown technique** : c'est un doc de **recalage de roadmap** (stratégie / pilotage produit). Il contient très peu de détail technique concret. Il sert à réaligner la roadmap sur la **capacité réelle d'exécution**, pas à documenter l'architecture. Pour le détail technique réel, se référer aux fichiers `agent_docs/` (architecture.md, pipeline.md, agents.md, etc.) — le présent doc n'y ajoute pas de substance technique nouvelle.

## Constat principal du fondateur

- Le problème **n'est pas l'absence de vision** — la vision produit existe déjà.
- Le problème est que la roadmap est **trop large, trop mélangée, pas assez pilotée par des livrables testables**.
- On ne sait pas répondre simplement à : _Qu'est-ce que Théo peut tester cette semaine ? Qu'est-ce qui est montrable au prochain jalon ? Qu'est-ce qui est vendable en l'état ? Qu'est-ce qu'on repousse ? Qu'est-ce qui justifie un renfort ?_
- Volonté de passer d'une **roadmap par grands thèmes** à une **roadmap par livrables visibles et testables**.

## Chantiers à conserver (jugés toujours justes)

Aucun n'est décrit comme « fait » ou « fiable » — listés comme à conserver dans la lecture globale, sans statut technique :

- Onboarding
- Profil utilisateur / personnalisation
- Architecture multi-agents
- Stripe / abonnements
- Front produit + site
- RAG / mémoire / contexte
- Signaux / enrichissements métier
- Dashboard / notifications / expérience plus riche (plus tard)

## Ce qui manque (gaps de pilotage flaggés)

- Pas de distinction nette **déjà fait / en cours / bloqué / testable**.
- Pas de distinction nette **V1 / V2 / plus tard**.
- Pas de jalons visibles pour Théo (le testeur).
- **Pas de lecture claire du coût réel des requêtes** (revient deux fois — point sensible).
- Pas de lecture claire de ce qui est vendable en l'état.
- Pas de lecture claire de ce qui peut ou non être délégué.

## Plan de recalage proposé (60 jours)

| Fenêtre     | Objectifs                                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1–15 j**  | État des lieux exact du produit ; V1 réellement testable par Théo ; **clarifier l'état du scraping, des APIs, de Stripe, de la personnalisation** ; fixer V1 vs backlog. |
| **15–30 j** | Stabiliser le parcours principal ; **fiabiliser les requêtes les plus utiles** ; démo propre ; clarifier le coût réel d'une recherche.                                   |
| **30–60 j** | V1 montrable à des bêta-testeurs choisis ; corriger les gros points de friction ; première lecture vraiment vendable ; décider ce qui part en V2 / V3.                   |

## Question renfort (profil IA éventuel)

Un renfort doit retirer **un goulot d'étranglement précis**, pas « aider » vaguement. Périmètres candidats explicitement cités :
multi-agent / orchestration · mémoire agentic · RAG · automatisation du RAG · module chat IA · qualité du code.

## Signaux indirects sur l'état technique réel

Le doc ne dit jamais explicitement « X marche » / « X est cassé », mais ces formulations trahissent la perception du fondateur :

- **Scraping, APIs, Stripe, personnalisation = état incertain** — explicitement « à clarifier » en priorité (1–15 j). Donc considérés comme **non vérifiés / fragiles** côté fondateur.
- **Requêtes (analyses) = pas encore fiables** — « fiabiliser les requêtes les plus utiles » est un objectif futur (15–30 j), pas un acquis.
- **Coût des requêtes = inconnu / non maîtrisé** — répété deux fois.
- **Architecture multi-agents & RAG = définis mais pas confirmés câblés** — listés comme chantiers à conserver, et candidats à un renfort, ce qui suggère qu'ils ne sont pas considérés comme stabilisés.
- **Aucune V1 testable de bout en bout n'existe encore** au moment du doc (« rendre une V1 réellement testable »).

## À retenir pour qui touche aux prompts / agents / data

Ce doc **ne fournit aucune liste fiable d'agents, prompts ou sources de données réellement câblés**. Il confirme seulement, de manière indirecte, que les briques data (scraping, APIs externes, RAG) sont jugées **non vérifiées** par le fondateur. Toute hypothèse sur « ce qui est réellement disponible pour alimenter un prompt » doit être validée dans le code, pas dans ce document.
