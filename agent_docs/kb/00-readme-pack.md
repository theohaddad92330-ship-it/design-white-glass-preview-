# 00 — README du pack d'alignement (entry point)

> Source : `00_README_A_LIRE_EN_PREMIER.pdf` (pack interne BellumAI, lettre d'alignement
> du fondateur à un membre de l'équipe). Distillé pour le repo, sans données personnelles.

## Nature du document

Ce n'est **pas** une refonte de vision théorique ni un reproche sur le travail déjà fait.
C'est un **outil de réalignement** : remettre tout à plat proprement et repartir sur une
**lecture commune du produit**, avec plus de **visibilité** et des **jalons testables**.

## Recadrage produit (ce qui a changé dans la tête du fondateur)

Bellum **n'est plus** un « assistant IA large » qui fait plein de choses vaguement
impressionnantes. Bellum devient un **système d'intelligence commerciale spécialisé pour
les ESN**. Le cœur du produit = la **conquête de comptes** :

- identifier les bons comptes ;
- récupérer les bons **signaux** ;
- reconstruire les **organigrammes** ;
- produire des **messages contextualisés** ;
- orienter un **Go / No-Go** ;
- sortir un **plan d'action** utile.

Parcours produit cité : questionnaire onboarding → création/enrichissement fiche profil →
page de recherche → lancement recherche compte → résumé contexte → **sorties structurées**
(contacts, organigramme, messages, Go/No-Go, plan d'action).

## Ce qui est reconnu comme déjà fait / bien avancé

On ne part **pas de zéro** ; plusieurs briques existent, il faut surtout mieux les rendre
visibles :

- onboarding déjà entamé ;
- architecture multi-agents en chantier ;
- certaines briques API déjà branchées ;
- Stripe commencé ;
- couches de design front avancées ;
- personnalisation / user profile via questionnaire en cours ;
- pages produit largement retravaillées (vision / front) ;
- roadmap produit posée, plusieurs itérations menées.

## Le vrai point de friction

Pas « est-ce que tu bosses » mais **manque de visibilité produit** (travail à distance,
lecture technique indirecte). Besoin d'un **état des lieux lisible** distinguant :

- ce qui est **réellement fini** ;
- ce qui est **branché mais pas stable** ;
- ce qui **bloque** ;
- ce que le fondateur **peut tester lui-même rapidement** ;
- ce qui manque pour une **V1 montrable** ;
- ce qui manque pour une **V1 vendable**.

## Pourquoi maintenant

Le produit doit devenir **lisible → testable → monétisable**. La visibilité conditionne les
arbitrages : lancement, roadmap, priorités V1/V2, renforts, projections business.

## Principes top-level à partager (lecture commune)

1. On **ne casse pas la macro-architecture** sans nécessité.
2. On **priorise une V1 testable, utile et vendable**.
3. On **distingue très clairement V1, V2 et V3**.
4. On rend **l'avancement visible**, pas seulement l'intention.
5. Bellum est un **produit métier**, **pas un démonstrateur agentique**.

Objectif final : transformer le réalignement en **jalons testables** et un **plan d'action
exécutable sur les 60 prochains jours**.

## Organisation du pack & ordre de lecture

Le README est le point d'entrée ; le pack est numéroté `00 → 08`. Lire dans l'ordre :

| #    | Document                                | Couvre                                                                |
| ---- | --------------------------------------- | --------------------------------------------------------------------- |
| 00   | README — à lire en premier              | Ce doc : cadrage, recadrage produit, principes, demande de visibilité |
| 01_1 | État des lieux global                   | Vue d'ensemble de l'avancement produit                                |
| 01_2 | État des lieux technique détaillé       | Détail technique : fini / branché-instable / bloquant                 |
| 02_1 | Vision cible produit                    | Cible produit BellumAI (conquête de comptes ESN)                      |
| 02_3 | V1 vs V2 vs V3                          | Découpage des paliers produit                                         |
| 03_3 | Gap analysis roadmap vs capacité réelle | Écart entre roadmap affichée et capacité réelle                       |
| 04_2 | Dispatch complet des flux               | Cartographie des flux produit                                         |
| 05_3 | Usage du contexte par étape             | Quel contexte est utilisé à chaque étape du pipeline                  |
| 06_1 | Map complète des agents                 | Cartographie des agents                                               |
| 06_2 | System prompts existants et attendus    | **Prompts actuels vs attendus** (cœur du chantier prompt-rewrite)     |
| 06_3 | Schémas de sortie par agent             | Schémas/contrats de sortie attendus par agent                         |
| 07_1 | Stratégie RAG / mémoire / données       | RAG, mémoire, gestion des données                                     |
| 08   | Note V1 — paliers, persistance, prompts | Note d'exécution V1 (paliers, persistance, prompts)                   |
| —    | Spec Site Marketing CTO V3              | Spec du site marketing (annexe)                                       |

> Note : le README lui-même n'énumère pas la table ci-dessus ; elle est reconstruite à
> partir de la numérotation réelle des fichiers du dossier Drive partagé.

## Cadrage du chantier prompt-rewrite / V1

Le README fixe le **cadre** dans lequel s'inscrit la réécriture des prompts et le travail V1 :

- Priorité absolue = une **V1 testable et vendable**, pas une démo agentique. Les prompts
  doivent servir les **sorties structurées métier** (contacts, organigramme, messages,
  Go/No-Go, plan d'action), pas la performance technique.
- Le détail opérationnel du prompt-rewrite vit dans **06_2** (system prompts existants vs
  attendus), **06_3** (schémas de sortie par agent) et **08** (paliers V1 + persistance +
  prompts) — le README ne fait que les **encadrer**.
- Contrainte structurante : **ne pas casser la macro-architecture** sans nécessité → la
  réécriture se fait **à l'intérieur** des agents/flux existants.
- Tout doit converger vers des **jalons testables** sur **60 jours**.
