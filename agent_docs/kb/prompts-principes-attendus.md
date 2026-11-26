# Principes prompts + schémas de sortie attendus (06_2 + 06_3) — distillation

> Source : mémos Drive "06_2 System prompts existants/attendus" + "06_3 Schémas de sortie par agent" (Louis → Matteo). Ce sont des mémos d'alignement (pas des specs détaillées), mais ils donnent la **grille de qualité** d'un bon prompt Bellum.

## Ce qu'est un bon prompt Bellum (06_2, verbatim)

- « Un bon prompt Bellum ne doit pas juste réécrire de la donnée. Il doit **interpréter, hiérarchiser, et produire une lecture commerciale utile**. »
- « J'attends des prompts qu'ils se comportent davantage comme des **sous-cerveaux métier spécialisés** que comme des reformulateurs génériques. »

### 5 critères comportementaux (verbatim)

1. Comprendre l'**objectif métier** de la sortie.
2. S'appuyer sur un **contexte propre**.
3. Savoir **distinguer signal fort et bruit**.
4. Produire des **sorties actionnables**.
5. Garder une **logique ESN / business manager / directeur commercial**.

### Inventaire demandé (statut par prompt)

Chaque prompt doit être taggé : **utilisé / partiel / obsolète / à revoir**, avec rôle, moment d'intervention, type d'entrée, type de sortie.

## Schémas de sortie (06_3)

Un bon agent ne « parle pas bien » — il produit une sortie **lisible, comparable, réutilisable, suffisamment structurée**. Chaque sortie doit avoir « une ossature propre », pas un bloc de texte libre.

### Agents de sortie prioritaires (les 5)

Contacts · Organigramme · Messages · Go/No-Go · Plan d'action.

### Ce que chaque schéma doit préciser

- Champs **obligatoires** / **optionnels**.
- Niveau de **synthèse** attendu.
- Niveau de **justification** attendu.
- **Critères de qualité** minimum.
- Éléments **personnalisés** liés au contexte utilisateur.

### Exemples de logique de lecture (verbatim)

- **Go/No-Go** : pas « juste une opinion » → **argumenté, structuré, lisible visuellement**.
- **Messages** : pas « juste générer du texte » → **message contextualisé, angle clair, logique de variantes ou de priorisation**.

### À construire ensemble (le doc le demande)

Par agent : mapping 3 colonnes = **schéma attendu | forme réelle actuelle | écart**. (= ce qu'on fait dans le repo via `agent_docs/agent-contract.md` + packages/contracts.)

## Application à la réécriture

- Chaque prompt = un sous-cerveau métier : il **interprète + hiérarchise + signal fort vs bruit**, jamais reformule.
- Sortie = ossature structurée (JSON), avec champs obligatoires/optionnels explicites, niveau de justification calibré, et personnalisation par `contexte_user`.
- Go/No-Go (notre `evaluation`/advisor) doit être argumenté + structuré. Messages avec angle + variantes/priorisation.
