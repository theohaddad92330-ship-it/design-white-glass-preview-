# Note V1 — Paliers, Persistance, Prompts (distillée)

> Source : note d'alignement Drive "08_Note_V1_paliers_persistance_prompts".
> Flaggée comme "probablement le point le plus important de tous".
> Objectif : faire émerger une **V1 Bellum vendable sous 60 jours**, sans usine à gaz, par paliers.

## Le vrai nœud produit

Le sujet n'est plus "quelles features construire", mais **le moteur d'exécution réel** : quel type de recherche existe, ce qu'on stocke, ce qu'on recalcule, ce qu'on enrichit plus tard, où intervient la personnalisation, comment éviter de repayer plusieurs fois la même recherche, comment les agents consomment les bonnes données au bon moment.

> "Le cœur du produit n'est pas seulement dans les écrans ou dans les appels API pris séparément. Il est dans la logique d'orchestration : comment une recherche vit dans le temps, comment un compte devient un dossier exploitable, comment on enrichit intelligemment au lieu de repartir de zéro."

## Les 3 paliers V1

### Palier 1 — Recherche socle

> "Une recherche rapide, montrable, robuste et relativement peu coûteuse." Flux qui fonctionne déjà de A à Z, **même sans toute la personnalisation avancée ni tous les enrichissements**.

- résolution entreprise
- données société de base
- collecte web / signaux minimum
- premiers décideurs ou premiers contacts clés
- résumé exécutif
- score simple
- premiers messages / premiers next steps

### Palier 2 — Enrichissement ciblé

Une fois un compte jugé intéressant, l'utilisateur clique pour enrichir : plus de contacts, plus d'organigramme, plus de signaux, plus de précision sur messages et plan d'action.

> "Ce palier ne devrait pas être systématique. Il doit être déclenché volontairement."

### Palier 3 — Refresh / ré-enrichissement

> "Si un utilisateur revient sur le même compte deux semaines plus tard, Bellum ne doit pas relancer tout le pipeline comme si le compte n'avait jamais été vu."
> Logique de reload, refresh léger ou enrichissement plus profond selon l'état du dossier existant.

## Structure produit : dossier compte persistant (pas recherche jetable)

5 couches à séparer clairement :

1. **Fiche compte canonique** : identité, SIRET, entités, statut, dates, métadonnées
2. **Faits bruts** : données légales, pages, annonces, contacts bruts, signaux détectés
3. **Faits normalisés** : organigramme structuré, contacts dédupliqués, signaux catégorisés, provenance et fraîcheur
4. **Interprétations** : score, Go / No-Go, résumé, recommandations, messages, plan d'action
5. **Contexte utilisateur appliqué** : pourquoi ce compte est pertinent pour CE profil précis

> "Cette séparation permet de mutualiser les faits, puis de personnaliser l'interprétation. C'est ce qui rend Bellum plus fort qu'un outil IA générique."

## Persistance / mémoire (V1 minimale)

Pas de "mémoire continue avancée" requise, mais penser **persistance produit** dès maintenant : stocker un dossier compte, savoir quand il a été analysé, quelles couches existent déjà, ce qui doit être rafraîchi plutôt que recalculé en entier.

- lecture immédiate d'un dossier existant
- refresh léger de certaines données
- enrichissement profond sur demande
- enrichissement spécifique des contacts existants
- recherche de nouveaux contacts sans perdre les anciens

## Personnalisation : où elle agit (et où NON)

> "La personnalisation n'a pas besoin d'être injectée partout. Elle doit surtout agir là où elle crée vraiment de la valeur."

**Personnaliser** : cadrage de la recherche · lecture des signaux · scoring et Go/No-Go · recommandations · messages et pitchs · plan d'action.

**Garder mutualisable (NON personnalisé)** : les couches de collecte brute et de normalisation factuelle "doivent rester aussi mutualisables que possible".

---

## PROMPTS — section centrale ("le point le plus important pour moi maintenant")

Le métier des prompts sera écrit côté business (via ChatGPT). Pour les écrire proprement et les intégrer au bon endroit, **un contrat clair sur l'existant** est requis. Éléments demandés à l'équipe technique :

- la liste des agents / sous-modules **réellement actifs**
- pour chaque agent : rôle exact · quand il intervient dans le flow · input exact · output exact
- le schéma JSON actuel ou visé pour chaque sortie
- les prompts existants, **même imparfaits**
- le statut de chaque prompt : **utilisé / partiel / obsolète / à revoir**
- la manière dont le contexte user est injecté aujourd'hui
- ce qui est déjà branché vs encore théorique
- la logique de persistance d'une recherche et d'un dossier compte
- la logique de refresh / enrichissement si un user relance le même compte

### Quality bar / scope des prompts pour la V1

- Les prompts portent la **couche métier d'interprétation**, pas la collecte brute.
- In-scope V1 : cadrage recherche, lecture signaux, scoring/Go-No-Go, recommandations, messages/pitchs, plan d'action — chacun avec un **schéma de sortie JSON** défini.
- Personnalisation **minimum mais réelle** acceptée pour la V1 (pas besoin de RAG / mémoire continue immédiate).
- Chaque prompt doit être qualifié par un **statut** (utilisé/partiel/obsolète/à revoir) pour savoir quoi réécrire vs garder.

## Faisable sans renfort IA immédiat (V1 60 jours)

> "On peut déjà prioriser une V1 utile et vendable dans les 60 jours, même sans attendre un expert IA / RAG / mémoire continue. À condition de séquencer proprement et d'accepter qu'on n'essaie pas de tout régler dans la même couche en même temps."

- une recherche socle robuste
- un premier dossier compte propre
- des sorties utiles : contacts, score, messages, plan d'action
- une personnalisation minimum mais réelle
- une logique simple de persistance / refresh
- une visibilité produit plus fréquente et plus testable

Renfort ciblé (IA/backend) gardé en option **uniquement si un vrai goulet d'étranglement** est identifié et qualifié concrètement.
