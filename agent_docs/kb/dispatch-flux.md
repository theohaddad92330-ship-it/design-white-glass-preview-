# Dispatch des flux — circulation de l'information dans BellumAI

> Distillé de "04_2_Dispatch_complet_des_flux" (doc d'alignement produit).
> Vue métier : comment une entrée simple devient des sorties commerciales actionnables.
> Aucune donnée personnelle.

## Modèle mental : une chaîne de transformation

BellumAI n'est **pas** une juxtaposition de briques de scraping, mais un **pipeline métier cohérent**.
L'utilisateur ne vient pas chercher de la donnée brute — il vient chercher une **lecture exploitable d'un compte**. Le moteur transforme une entrée simple en un ensemble de livrables commerciaux directement actionnables.

```
Entrée user → Contexte user → Collecte/enrichissement → Résumé/structuration → Sous-agents métier → Sorties commerciales
```

## Les 6 étapes du flux

### 1. Entrée utilisateur

Point d'entrée volontairement minimal (faible effort demandé).

- Questionnaire onboarding
- Création / mise à jour de la fiche profil
- Choix ou recherche d'un compte
- Lancement d'une recherche

**Produit :** nom de compte cible + intention de recherche.

### 2. Contexte utilisateur (orientation, pas décoration)

Le profil user **oriente la lecture des données et la génération des recommandations**. Bellum doit savoir _pour quel type d'ESN/commercial/positionnement_ il travaille.

- Offres et expertises de l'ESN
- Zone géographique
- Cibles prioritaires
- Positionnement commercial
- Contexte du business manager / dirigeant
- Autres critères de personnalisation

**Produit :** un cadre de personnalisation injecté en aval (consommé par TOUS les sous-agents).

### 3. Collecte et enrichissement (chaîne progressive)

Pas du simple scraping — la valeur est dans **agréger, fiabiliser, structurer, préparer**.

- **Pappers** → données légales, structurelles, financières de base
- **Firecrawl + Brave** → contenus web, annonces, presse, descriptions d'activité, signaux, contexte
- **Apollo** → contacts, emails, job titles, URLs de profils

**Produit :** données brutes enrichies multi-sources (légal + web/signaux + contacts).

### 4. Résumé contexte & structuration intermédiaire (couche pivot)

Couche **indispensable entre la donnée brute et les agents métier**. Évite que les sous-agents travaillent sur une masse sale, redondante ou dispersée.

- Synthèse du contexte entreprise
- Nettoyage des signaux et données utiles
- Structuration des entrées pertinentes par sous-agent
- Préparation d'un **socle lisible** pour l'interprétation métier

**Produit :** un _contexte compte enrichi_ unique, propre et structuré.

### 5. Interprétation métier via sous-agents

Bellum **interprète**, ne se contente pas d'afficher. Tous les sous-agents partent du **même contexte enrichi** (étape 4) + contexte user (étape 2), puis produisent chacun une sortie structurée de qualité métier.

- Agent **Contacts**
- Agent **Organigramme**
- Agent **Messages**
- Agent **Go / No-Go**
- Agent **Plan d'action**

**Produit :** 5 livrables structurés, indépendants en sortie mais partageant la même entrée.

### 6. Sorties commerciales (la promesse Bellum)

- Les bons contacts
- Un organigramme / chaîne de décision compréhensible
- Des messages contextualisés
- Une lecture argumentée du Go / No-Go
- Un plan d'action exploitable rapidement

## Dépendances clés (qui dépend de quoi)

| Étape                    | Dépend de                                    | Alimente                              |
| ------------------------ | -------------------------------------------- | ------------------------------------- |
| Contexte user (2)        | Entrée user (1)                              | **Tous** les sous-agents (transverse) |
| Collecte (3)             | Compte cible (1)                             | Résumé/structuration (4)              |
| Résumé/structuration (4) | Collecte (3)                                 | Tous les sous-agents (5)              |
| Sous-agents (5)          | Contexte enrichi (4) **+** contexte user (2) | Sorties (6)                           |
| Sorties (6)              | Sous-agents (5)                              | Utilisateur final                     |

**Invariant majeur :** l'étape 4 (structuration) est le **goulot/pivot** — aucun sous-agent ne lit la donnée brute des sources directement ; tous consomment le socle structuré. Le contexte user (2) est **fan-out transverse** vers tous les agents, jamais en chaîne.

## Implications pour les contrats I/O des prompts

1. **Deux entrées distinctes par sous-agent.** Chaque prompt d'agent métier (Contacts, Organigramme, Messages, Go/No-Go, Plan d'action) doit recevoir explicitement deux blocs séparés : (a) le `contexte_compte_enrichi` (sortie étape 4) et (b) le `contexte_user` (étape 2). Ne pas mélanger : le premier est factuel/partagé, le second est l'orientation de personnalisation.

2. **L'étape 4 est un contrat de schéma à part entière.** Définir un objet "socle compte structuré" stable (synthèse entreprise + signaux nettoyés + entrées pré-structurées par agent). C'est l'interface de découplage : les sources (Pappers/Firecrawl/Brave/Apollo) peuvent changer sans toucher les prompts métier, tant que ce socle reste stable.

3. **Pas de lecture directe des sources par les agents métier.** Les prompts ne doivent pas raisonner sur du brut multi-source ; leur input doit déjà être fiabilisé/dédupliqué. Interdire l'injection de payloads bruts Pappers/Apollo/Brave dans les prompts de sortie.

4. **Personnalisation = paramètre, pas contenu.** Le contexte user doit être passé comme cadre d'orientation (offres ESN, géo, cibles, positionnement) que chaque agent utilise pour pondérer/cibler sa sortie — pas comme données factuelles à restituer.

5. **Sorties structurées homogènes.** Chaque agent produit un livrable structuré et autonome (output schema dédié), consommable indépendamment côté UI, tout en partageant l'entrée commune. Penser fan-out (1 contexte → 5 outputs), pas pipeline séquentiel entre agents.

6. **Traçabilité des frontières.** Documenter pour chaque étape : où entre le contexte user, où la donnée brute est transformée, à quel moment chaque sous-agent prend le relais — c'est l'enjeu produit explicite des prochaines semaines.
