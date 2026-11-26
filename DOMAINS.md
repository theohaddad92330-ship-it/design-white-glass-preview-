# Les domaines — quel module sert quoi

**Pourquoi ce fichier existe.** Le dépôt compte plus de quatre-vingt-dix modules
NestJS au même niveau. La règle qui les protège est bonne — _chaque module est
indépendant, le retirer ne casse rien_ — mais elle ne dit pas **de quoi** un
module parle, et un dossier plat de quatre-vingt-dix entrées ne se lit pas.

Le tome 7 (§20.2) propose deux options : regrouper les modules en dossiers de
domaine, ou écrire cette table. **On écrit la table.** Déplacer quatre-vingt-dix
modules pour gagner de la lisibilité ferait courir un risque de régression à
tout le produit pour un bénéfice de lecture — et les imports de chaque fichier
changeraient, ce qui rendrait illisible le prochain `git blame`.

⚠️ Ce fichier **ne crée aucune dépendance**. Deux modules du même domaine n'ont
pas plus le droit de s'appeler que deux modules de domaines différents : la
garde GA-07 s'applique de la même façon partout.

## Marché — trouver et qualifier ce qu'il y a dehors

| Module              | Ce qu'il porte                                              |
| ------------------- | ----------------------------------------------------------- |
| `esn-directory`     | le référentiel ESN partagé + l'écran Territoire             |
| `partner-pipeline`  | la relation d'un espace avec une ESN                        |
| `partners`          | les ESN en place CHEZ un compte client                      |
| `account-access`    | la barrière d'achat, les faits d'accès, les portes d'entrée |
| `watchlist-refresh` | la veille quotidienne des comptes suivis                    |

## CRM — les objets commerciaux et leur mouvement

| Module                                               | Ce qu'il porte                            |
| ---------------------------------------------------- | ----------------------------------------- |
| `accounts`, `contacts`, `account-feedback`           | les fiches et leurs corrections           |
| `projects`, `opportunities`, `sprints`               | le pipe, les besoins, le niveau d'effort  |
| `crm`, `hubspot`, `salesforce`, `pipedrive`, `attio` | la synchronisation sortante               |
| `assignment`, `decision-gates`                       | qui porte quoi, et les portes de décision |

## Talent — le vivier et son placement

| Module                                       | Ce qu'il porte                                 |
| -------------------------------------------- | ---------------------------------------------- |
| `consultants`, `talent`, `cv-studio`         | les profils, leurs compétences, leurs dossiers |
| `matching`, `inverse-matching`, `shortlists` | le rapprochement besoin ↔ profil               |
| `ats`                                        | l'ERP/ATS de l'ESN, en lecture                 |

## Delivery — après la signature

| Module                 | Ce qu'il porte                                         |
| ---------------------- | ------------------------------------------------------ |
| `delivery`, `missions` | les missions, les relevés, la facturation              |
| `admin-docs`           | signatures et factures, chez les fournisseurs de l'ESN |

## Assistant — ce qui parle à l'utilisateur

| Module                                   | Ce qu'il porte                                  |
| ---------------------------------------- | ----------------------------------------------- |
| `chat`, `ia-proxy`, `copilot-bridge`     | le copilote et son pont vers les capacités      |
| `laura`                                  | la surcouche proactive                          |
| `memory`                                 | ce que l'assistant retient                      |
| `notifications`, `routines`, `action-os` | ce qui part tout seul, et ce qui attend un clic |

## Socle — ce qui sert tout le monde

| Module                                                           | Ce qu'il porte                      |
| ---------------------------------------------------------------- | ----------------------------------- |
| `auth`, `workspace`, `billing`, `plan-features`                  | identité, espace, offre             |
| `analysis`, `ia`                                                 | le pipeline d'analyse et son client |
| `documents`, `import`, `demo`                                    | ce qui entre et ce qui sort         |
| `tool-registry`, `integrations`, `google`, `microsoft`, `notion` | les connecteurs                     |
