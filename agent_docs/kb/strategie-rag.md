# Stratégie RAG / Mémoire / Données

> Distillé d'un document d'alignement BellumAI ("07_1_Strategie_RAG_memoire_donnees").
> Nature : note d'intention/cadrage stratégique (pas une spec technique). Beaucoup de points
> sont des **intentions** à clarifier, pas du déjà-implémenté. Horizon : V1 vendable sous ~60 jours.

## Posture générale

Le RAG **n'est pas une couche magique à brancher partout**. Il doit avoir un rôle précis :
servir le produit sans le ralentir. Critère de décision permanent : _est-ce que ça rend Bellum
plus utile et monétisable en V1, ou est-ce que ça détourne l'énergie ?_

## Ce qu'on attend du RAG

Le RAG doit aider Bellum à travailler sur une base **contextualisée, à jour, cohérente et
réutilisable dans le temps**. Quatre fonctions attendues :

- Apporter un **contexte plus riche** aux agents / sorties.
- **Réutiliser** des éléments pertinents sans tout recalculer (éviter le recompute).
- Produire des sorties **plus fiables et mieux personnalisées**.
- Préparer plus tard des usages plus ambitieux (notamment le **chat IA**).

## Modèle de mémoire (découpage en types)

Distinction explicite des types de mémoire, pour ne pas tout mélanger et garder l'architecture
lisible. Ce découpage **conditionne comment les agents travaillent proprement** et **comment le
contexte est injecté sans surcharge inutile** :

- **Mémoire utilisateur** (le commercial / l'opérateur).
- **Mémoire compte** (l'entreprise cible analysée).
- **Mémoire recherche / session** (le contexte d'une analyse en cours).
- **Mémoire produit** plus longue — _plus tard seulement_.

## Données et enrichissement

La qualité de Bellum dépend en grande partie de la qualité des données **récupérées, nettoyées,
structurées**. Chantier à garder **très concret**, cadré par 5 questions par source de données :

1. Quelles données récupère-t-on ?
2. À quel coût ?
3. Avec quelle fraîcheur ?
4. Avec quelle fiabilité ?
5. Pour nourrir **quels agents / quelles sorties** exactement ?

## Priorités à clarifier (le cœur du doc)

À trancher explicitement, sans flou :

- Ce qui **entre réellement dans le RAG aujourd'hui** vs. ce qui **devrait y entrer plus tard**.
- **Comment le RAG est mis à jour** et **comment la base reste fraîche**.
- Quels **coûts** cela implique.
- Quels **appels / couches supplémentaires** cela demande.
- **Quelle part du produit en dépend vraiment en V1** (séparer "déjà en place" / "intention" /
  "prioritaire V1" / "repoussé").

## Chat IA

Vu comme une couche **potentiellement très forte mais pas prioritaire** si elle ralentit la V1
vendable. Position : **préparer le socle / les fondations** seulement, à condition que ça reste
cohérent avec le reste et ne détourne pas l'énergie des briques déjà utiles et monétisables.

## Dette technique & qualité

Demande explicite de distinguer, pour le RAG et la mémoire : **ce qui est déjà en place** vs.
**ce qui est une simple intention** ; et d'évaluer l'impact en **qualité de code et dette
technique**. Un renfort IA est envisagé sur multi-agent, mémoire agentic, RAG, automatisation du
RAG, module chat IA et qualité du code.
