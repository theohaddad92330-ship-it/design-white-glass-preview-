# Briefs commerciaux des comptes (données de la salle démo)

Fichier GÉNÉRÉ par `pnpm --filter @bellum/api convert:commercial-brief` — ne pas éditer à la main. Source : classeurs xlsx écrits à la main par le CEO (`agent_docs/sources/briefs-comptes-2026-10-01/`, puis `…-10-04/` pour Naval Group et Chantiers de l’Atlantique ; hors dépôt). Contrat : `packages/contracts/src/schemas/commercial-brief.ts`, contrôles : `checkCommercialBrief`. Le convertisseur échoue (code ≠ 0, aucun fichier écrit) sur tout onglet non mappé, toute colonne lue sans être déclarée, toute violation du schéma ou des contrôles métier. Exception : les DOSSIERS DE COMPTE déposés par le CEO — Orange (12/10/2026), Crédit Agricole, VINCI, Enedis et Safran (15/10/2026) — (JSON + CSV de contacts + sources, hors dépôt) sont convertis par `pnpm --filter @bellum/api convert:account-dossier -- --account <slug> --source-dir <pack>` (cœur partagé `account-dossier.ts`, un mapping par compte) — mêmes schéma et contrôles ; toute clé du dossier est mappée ou écartée avec sa raison ; seules les adresses du domaine du groupe sont reprises, les autres sont comptées parmi les valeurs écartées ; l’ESN prospect de chaque démo (Soluxan, MK4 Technova, Experis, JEMS) n’est jamais nommée.

Règles tranchées (Louis / CEO, 01/10/2026 ; 04/10/2026 pour NGen) : « OneSide », « NGen », « Thélio », « Les Pertinents » et « Alpineo » (ESN prospects) neutralisés · aucune donnée de notre propre performance ·
périmètres sortis marqués `exited` (Equans chez ENGIE, Treezor chez SG, Reichshoffen chez Alstom) · France uniquement, sauf ABB Suisse (périmètre `suisse`, décision Louis 04/10/2026 : sites et entités en CH, jamais mêlés à la France) · BPCE = UN compte, couche Toulouse ajoutée (`toulouse-…`, `cockpit-toulouse`) · coordonnées recopiées en clair, jamais inventées.

| Compte | Fichier | Taille | personnes | entités | sites | esn | prix | sections | violations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ENGIE | `engie.json` | 225 Ko | 566 | 20 | 7 | 13 | 3 | 13 | 0 |
| BPCE | `bpce.json` | 203 Ko | 427 | 9 | 18 | 24 | 16 | 20 | 0 |
| Société Générale | `societe-generale.json` | 443 Ko | 1854 | 11 | 9 | 21 | 6 | 14 | 0 |
| TotalEnergies | `totalenergies.json` | 150 Ko | 114 | 0 | 8 | 10 | 0 | 10 | 0 |
| Alstom | `alstom.json` | 87 Ko | 29 | 1 | 8 | 0 | 0 | 10 | 0 |
| Naval Group | `naval-group.json` | 24 Ko | 20 | 0 | 2 | 0 | 0 | 6 | 0 |
| Chantiers de l'Atlantique | `chantiers-atlantique.json` | 18 Ko | 3 | 0 | 1 | 0 | 0 | 6 | 0 |
| BNP Paribas | `bnp-paribas.json` | 358 Ko | 339 | 83 | 2 | 31 | 13 | 16 | 0 |
| Bpifrance | `bpifrance.json` | 88 Ko | 181 | 9 | 2 | 0 | 0 | 13 | 0 |
| Sanofi | `sanofi.json` | 183 Ko | 150 | 10 | 20 | 12 | 0 | 19 | 0 |
| ADEO - Leroy Merlin | `adeo-leroy-merlin.json` | 162 Ko | 194 | 10 | 4 | 0 | 34 | 12 | 0 |
| Kiabi | `kiabi.json` | 36 Ko | 32 | 0 | 1 | 0 | 0 | 11 | 0 |
| ABB Suisse | `abb-suisse.json` | 131 Ko | 77 | 10 | 12 | 0 | 0 | 14 | 0 |
| Orange | `orange.json` | 192 Ko | 478 | 9 | 7 | 18 | 0 | 8 | 0 |
| Crédit Agricole | `credit-agricole.json` | 186 Ko | 403 | 10 | 13 | 24 | 0 | 13 | 0 |
| VINCI | `vinci.json` | 194 Ko | 255 | 10 | 14 | 34 | 0 | 14 | 0 |
| Enedis | `enedis.json` | 473 Ko | 1598 | 20 | 8 | 24 | 0 | 14 | 0 |
| Safran | `safran.json` | 67 Ko | 105 | 13 | 24 | 27 | 0 | 10 | 0 |

## ENGIE — `ENGIE_BELLUM_BRIEF.xlsx`

Siège : Tour T1, Paris La Défense. Personnes : contact 339 · decision_maker 92 · external 73 · manager 62 (dont 103 `exited`).

| Onglet | Champ du contrat | Lignes | Note |
| --- | --- | --- | --- |
| COCKPIT | kpis | 6 |  |
| COCKPIT | what_i_know | 11 |  |
| COCKPIT | charts | 6 | 57 points |
| FICHE COMPTE | sections[fiche-compte] | 15 |  |
| ACHATS AVANT D APPELER | sections[achats-avant-d-appeler] | 7 |  |
| FONCTIONS OBSERVEES | sections[fonctions-observees] | 37 |  |
| SITES UTILES | sites | 7 |  |
| SITES UTILES | sections[sites-utiles-non-retenus] | 1 | Périmètre sorti du groupe : voir les entités |
| ENTITES | entities | 13 |  |
| ENTITES | sections[entites-non-retenus] | 1 | Hors France : cité uniquement comme chantier d’intégration |
| ESN PRESENTES | esn | 13 |  |
| TECHNOS A VENDRE | sections[technos-a-vendre] | 29 |  |
| BESOINS ET TENDANCES | sections[besoins-et-tendances] | 6 |  |
| PROJETS 2026-2028 | sections[projets-2026-2028] | 8 |  |
| PLAN D ACTION | sections[plan-d-action] | 8 |  |
| GARDE-FOUS | guardrails | 6 |  |
| ORGANIGRAMME | people (role=contact) | 388 | 388 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| EXTERNES EN POSTE | people (role=external) | 73 | 73 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| MANAGERS | sections[managers] | 80 | onglet entier gardé (colonnes hors contrat) |
| MANAGERS | people (role=manager) | 80 | 28 ajoutée(s), 52 fusionnée(s) dans une personne déjà listée |
| DECIDEURS | sections[decideurs] | 92 | onglet entier gardé (colonnes hors contrat) |
| DECIDEURS | people (role=decision_maker) | 92 | 0 ajoutée(s), 92 fusionnée(s) dans une personne déjà listée |
| ENGIE HOME SERVICES | people (role=contact) | 80 | 77 ajoutée(s), 3 fusionnée(s) dans une personne déjà listée, 3 ligne(s) non personnes → section engie-home-services-non-retenus |
| ORGANIGRAMME | colonne retirée « PRIORITÉ » | 388 | priorité de qualification du commercial (P1, Pertinent…) : aucun champ du contrat ; les totaux restent au COCKPIT (graphique « PRIORITÉ DES CONTACTS ») |
| ORGANIGRAMME | colonne retirée « STATUT RELATION » | 49 | notre propre performance commerciale (CEO 01/10/2026) : statut de relation, jamais un fait sur le compte |
| DECIDEURS | colonne retirée « STATUT RELATION » | 4 | notre propre performance commerciale (CEO 01/10/2026) : statut de relation, jamais un fait sur le compte |
| (dérivées) | entities (sorties, par graphie de la source) | 7 | Engie Solutions, COFELY, ENDEL, INEO, AXIMA, AXIMA CONCEPT, EQUANS |
| (dérivés) | prices | 3 | lus dans le texte du classeur, phrases vérifiées |
| (titres et notes) | sections[notes] | 28 |  |

Valeurs écartées (jamais recopiées) :
- 22 × LinkedIn : texte sans adresse
- 4 × MOBILE : valeur qui n'est pas un numéro
- 2 × NUMÉRO : note de suivi de notre prospection (hors compte), écartée
- 32 × RESPONSABLE : code ou action de notre suivi interne (THA, MCL, « envoyé mail »…), écarté
- 1 × VILLE : « ? », écarté
- 8 × VILLE : « N'existe pas » (issue d'un appel de notre prospection), écarté
- 11 × e-mail : note de suivi collée à l'adresse, retirée

Anomalies de la SOURCE (gardées telles quelles, à corriger dans le classeur) :
- [COCKPIT] 1 point(s) de graphique sans libellé dans le classeur : rendus « Non renseigné »

## BPCE — `BPCE_BELLUM_BRIEF.xlsx` + `BPCE_TOULOUSE_THELIO_BELLUM_BRIEF.xlsx`

Siège : Tours Duo, Paris. Personnes : alumni 3 · contact 292 · decision_maker 64 · external 58 · manager 10.

| Onglet | Champ du contrat | Lignes | Note |
| --- | --- | --- | --- |
| COCKPIT | kpis | 6 |  |
| COCKPIT | what_i_know | 10 |  |
| COCKPIT | charts | 3 | 31 points |
| FICHE COMPTE | sections[fiche-compte] | 19 |  |
| ACHATS AVANT D APPELER | sections[achats-avant-d-appeler] | 9 |  |
| SITES UTILES | sites | 14 |  |
| ESN PRESENTES | esn | 24 |  |
| TECHNOS A VENDRE | sections[technos-a-vendre] | 36 |  |
| BESOINS RECENTS | sections[besoins-recents] | 18 |  |
| BESOINS RECENTS | prices | 16 | 2 ligne(s) sans prix, gardées en section |
| PROJETS 2026-2027 | sections[projets-2026-2027] | 9 |  |
| PLAN D ACTION | sections[plan-d-action] | 9 |  |
| POSTES OUVERTS | sections[postes-ouverts] | 11 |  |
| GARDE-FOUS | guardrails | 7 |  |
| CONTACTS | people (role par ligne) | 304 | 304 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| EXTERNES EN POSTE | people (role=external) | 58 | 58 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| DECIDEURS | sections[decideurs] | 49 | onglet entier gardé (colonnes hors contrat) |
| DECIDEURS | people (role=decision_maker) | 49 | 46 ajoutée(s), 3 fusionnée(s) dans une personne déjà listée |
| CONTACTS | colonne retirée « STATUT » | 157 | statut de notre CRM (Not Attempted, Reached, Qualified…) : notre propre performance commerciale (CEO 01/10/2026) : statut de relation, jamais un fait sur le compte |
| (titres et notes) | sections[notes] | 21 |  |
| [Toulouse] COCKPIT | kpis | 6 |  |
| [Toulouse] COCKPIT | what_i_know | 10 |  |
| [Toulouse] COCKPIT | charts | 5 | 30 points |
| [Toulouse] FICHE COMPTE | (non lu) | 0 | Identique à l’onglet du même nom de BPCE_BELLUM_BRIEF (compte de base) : lu une seule fois. |
| [Toulouse] ACHATS AVANT D APPELER | (non lu) | 0 | Identique à l’onglet du même nom de BPCE_BELLUM_BRIEF (compte de base) : lu une seule fois. |
| [Toulouse] SITES UTILES | (non lu) | 0 | Identique à l’onglet du même nom de BPCE_BELLUM_BRIEF (compte de base) : lu une seule fois. |
| [Toulouse] DECIDEURS | (non lu) | 0 | Identique à l’onglet du même nom de BPCE_BELLUM_BRIEF (compte de base) : lu une seule fois. |
| [Toulouse] CONTACTS | (non lu) | 0 | Identique à l’onglet du même nom de BPCE_BELLUM_BRIEF (compte de base) : lu une seule fois. |
| [Toulouse] ESN PRESENTES | (non lu) | 0 | Identique à l’onglet du même nom de BPCE_BELLUM_BRIEF (compte de base) : lu une seule fois. |
| [Toulouse] TECHNOS A VENDRE | (non lu) | 0 | Identique à l’onglet du même nom de BPCE_BELLUM_BRIEF (compte de base) : lu une seule fois. |
| [Toulouse] BESOINS RECENTS | (non lu) | 0 | Identique à l’onglet du même nom de BPCE_BELLUM_BRIEF (compte de base) : lu une seule fois. |
| [Toulouse] PROJETS 2026-2027 | (non lu) | 0 | Identique à l’onglet du même nom de BPCE_BELLUM_BRIEF (compte de base) : lu une seule fois. |
| [Toulouse] PLAN D ACTION | (non lu) | 0 | Identique à l’onglet du même nom de BPCE_BELLUM_BRIEF (compte de base) : lu une seule fois. |
| [Toulouse] EXTERNES EN POSTE | (non lu) | 0 | Identique à l’onglet du même nom de BPCE_BELLUM_BRIEF (compte de base) : lu une seule fois. |
| [Toulouse] POSTES OUVERTS | (non lu) | 0 | Identique à l’onglet du même nom de BPCE_BELLUM_BRIEF (compte de base) : lu une seule fois. |
| [Toulouse] GARDE-FOUS | (non lu) | 0 | Identique à l’onglet du même nom de BPCE_BELLUM_BRIEF (compte de base) : lu une seule fois. |
| [Toulouse] ENTITES OCCITANIE | sections[toulouse-entites-occitanie] | 9 |  |
| [Toulouse] ENTITES OCCITANIE | sites | 9 |  |
| [Toulouse] ENTITES OCCITANIE | entities | 9 |  |
| [Toulouse] POSTES DATA TOULOUSE | sections[toulouse-postes-data] | 14 |  |
| [Toulouse] COMPETENCES DATA A VENDRE | sections[toulouse-competences-data-a-vendre] | 8 |  |
| [Toulouse] ESN TOULOUSE | sections[toulouse-esn] | 42 |  |
| [Toulouse] COMPTES SIMILAIRES | sections[toulouse-comptes-similaires] | 21 |  |
| [Toulouse] MARCHE TOULOUSE | sections[toulouse-marche-toulouse] | 6 |  |
| [Toulouse] PLAN D ACTION TOULOUSE | sections[toulouse-plan-d-action] | 8 |  |
| [Toulouse] GARDE-FOUS TOULOUSE | guardrails | 6 |  |
| [Toulouse] CE QUE JE SAIS NATIONAL | sections[toulouse-ce-que-je-sais-national] | 10 |  |
| [Toulouse] DECIDEURS OCCITANIE | sections[toulouse-decideurs-occitanie] | 24 | onglet entier gardé (colonnes hors contrat) |
| [Toulouse] DECIDEURS OCCITANIE | people (role par ligne) | 21 | 21 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée, 3 ligne(s) non personnes → section toulouse-decideurs-occitanie |
| [Toulouse] PROFILS TOULOUSE | people (role par ligne) | 8 | 8 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| [Toulouse] (titres et notes) | sections[notes] | 18 |  |
| [Toulouse] (couche) | people | 29 | 19 ajoutée(s), 10 fusionnée(s) dans une personne déjà listée du groupe |

Anomalies de la SOURCE (gardées telles quelles, à corriger dans le classeur) :
- [COCKPIT] tuile « CONTACTS » (304) écartée : contredit la liste des contacts (427 / 469 / 304) — décision Louis 05/10/2026

## Société Générale — `SG_BELLUM_BRIEF.xlsx`

Siège : Tours Société Générale, Puteaux. Personnes : contact 1779 · decision_maker 32 · external 43.

| Onglet | Champ du contrat | Lignes | Note |
| --- | --- | --- | --- |
| COCKPIT | kpis | 6 |  |
| COCKPIT | what_i_know | 11 |  |
| COCKPIT | charts | 5 | 47 points |
| FICHE COMPTE | sections[fiche-compte] | 18 |  |
| ACHATS AVANT D APPELER | sections[achats-avant-d-appeler] | 20 |  |
| ORGANIGRAMME SI | sections[organigramme-si] | 175 |  |
| SITES UTILES | sites | 9 |  |
| SITES UTILES | sections[sites-utiles-non-retenus] | 1 | Hors France : cité uniquement comme référence de coût |
| FILIALES ET STARTUPS | entities | 11 |  |
| FILIALES ET STARTUPS | sections[filiales-et-startups-non-retenus] | 2 | Hors France : Bangalore, Bucarest ; Fusionné dans le réseau SG : ne plus traiter comme entité distincte |
| ESN PRESENTES | esn | 21 |  |
| TECHNOS A VENDRE | sections[technos-a-vendre] | 30 |  |
| BESOINS ET TENDANCES SG | sections[besoins-et-tendances-sg] | 6 |  |
| BESOINS OBSERVES SG | sections[besoins-observes-sg] | 24 |  |
| SIGNAUX TERRAIN | sections[signaux-terrain] | 26 |  |
| METIERS EXTERNALISES | sections[metiers-externalises] | 14 |  |
| PRIX SG | prices | 6 | 0 ligne(s) sans prix, gardées en section |
| PROJETS 2026-2029 | sections[projets-2026-2029] | 9 |  |
| PLAN D ACTION | sections[plan-d-action] | 8 |  |
| GARDE-FOUS | guardrails | 7 |  |
| CONTACTS | people (role=contact) | 1781 | 1781 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| EXTERNES EN POSTE | people (role=external) | 43 | 43 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| DECIDEURS | sections[decideurs] | 44 | onglet entier gardé (colonnes hors contrat) |
| DECIDEURS | people (role=decision_maker) | 32 | 30 ajoutée(s), 2 fusionnée(s) dans une personne déjà listée, 12 ligne(s) non personnes → section decideurs |
| (titres et notes) | sections[notes] | 33 |  |

Valeurs écartées (jamais recopiées) :
- 38 × TÉLÉPHONE : valeur qui n'est pas un numéro
- 37 × e-mail : note de suivi collée à l'adresse, retirée
- 8 × e-mail : valeur sans adresse

Anomalies de la SOURCE (gardées telles quelles, à corriger dans le classeur) :
- 1 personne(s) dont le nom ou la fonction est une annotation du classeur (« à appeler », « KMJ : », « A supprimer ? »), gardées telles quelles : « à appeler AMODEO Etienne »

## TotalEnergies — `TOTALENERGIES_ONESIDE_BRIEF.xlsx`

Siège : La Défense, Courbevoie. Personnes : contact 12 · decision_maker 91 · external 11.

| Onglet | Champ du contrat | Lignes | Note |
| --- | --- | --- | --- |
| COCKPIT | kpis | 6 |  |
| COCKPIT | what_i_know | 10 |  |
| COCKPIT | charts | 5 | 19 points |
| FICHE COMPTE | sections[fiche-compte] | 16 |  |
| ACHATS AVANT D APPELER | sections[achats-avant-d-appeler] | 11 |  |
| SITES INDUSTRIELS | sites | 8 |  |
| PROGRAMMES | sections[programmes] | 12 |  |
| PRESTATAIRES | esn | 10 |  |
| COMPETENCES A VENDRE | sections[competences-a-vendre] | 10 |  |
| HYPOTHESES | sections[hypotheses] | 21 |  |
| BESOINS ET TENDANCES | sections[besoins-et-tendances] | 6 |  |
| PLAN D ACTION | sections[plan-d-action] | 7 |  |
| GARDE-FOUS | guardrails | 6 |  |
| ORGANISATION METIER | sections[organisation-metier] | 82 | onglet entier gardé (colonnes hors contrat) |
| ORGANISATION METIER | people (role=decision_maker) | 82 | 82 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| CONTACTS METIER | people (role=contact) | 12 | 12 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| EXTERNES METIER | people (role=external) | 11 | 11 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| DECIDEURS ET ROLES | sections[decideurs-et-roles] | 99 | onglet entier gardé (colonnes hors contrat) |
| DECIDEURS ET ROLES | people (role=decision_maker) | 73 | 9 ajoutée(s), 64 fusionnée(s) dans une personne déjà listée, 26 ligne(s) non personnes → section decideurs-et-roles |
| (titres et notes) | sections[notes] | 25 |  |

Anomalies de la SOURCE (gardées telles quelles, à corriger dans le classeur) :
- [ORGANISATION METIER] 1 cellule(s) « [object Object] » (export source cassé) : traitées comme vides
- [DECIDEURS ET ROLES] 1 cellule(s) « [object Object] » (export source cassé) : traitées comme vides
- 11 personne(s) dont le nom ou la fonction est une annotation du classeur (« à appeler », « KMJ : », « A supprimer ? »), gardées telles quelles : « Appeler Gouvernance des SI - », « General Manager Electricité et Gaz France », « Action Théo », « Action Théo », « Appeler Expérience Client », « Appeler Facturation »

## Alstom — `ALSTOM_ONESIDE_BRIEF.xlsx`

Siège : Saint-Ouen-sur-Seine, Saint-Ouen-sur-Seine. Personnes : alumni 6 · decision_maker 17 · external 6.

| Onglet | Champ du contrat | Lignes | Note |
| --- | --- | --- | --- |
| COCKPIT | kpis | 6 |  |
| COCKPIT | what_i_know | 10 |  |
| COCKPIT | charts | 5 | 29 points |
| FICHE COMPTE | sections[fiche-compte] | 13 |  |
| ACHATS AVANT D APPELER | sections[achats-avant-d-appeler] | 13 |  |
| SITES INDUSTRIELS | sites | 8 |  |
| POSTES OUVERTS | sections[postes-ouverts] | 16 |  |
| PROGRAMMES | sections[programmes] | 24 |  |
| COMPETENCES A VENDRE | sections[competences-a-vendre] | 10 |  |
| HYPOTHESES | sections[hypotheses] | 21 |  |
| BESOINS ET TENDANCES | sections[besoins-et-tendances] | 6 |  |
| PLAN D ACTION | sections[plan-d-action] | 7 |  |
| GARDE-FOUS | guardrails | 6 |  |
| DECIDEURS ET ROLES | sections[decideurs-et-roles] | 38 | onglet entier gardé (colonnes hors contrat) |
| DECIDEURS ET ROLES | people (role=decision_maker) | 17 | 17 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée, 21 ligne(s) non personnes → section decideurs-et-roles |
| EXTERNES METIER | people (role=external) | 6 | 6 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| ANCIENS DU COMPTE | people (role=alumni) | 6 | 6 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| (dérivées) | entities | 1 | Reichshoffen |
| (titres et notes) | sections[notes] | 22 |  |

## Naval Group — `NAVAL_GROUP_INDRET_BELLUM_BRIEF.xlsx`

Siège : Paris, Paris. Personnes : alumni 3 · contact 8 · decision_maker 1 · external 8.

| Onglet | Champ du contrat | Lignes | Note |
| --- | --- | --- | --- |
| COCKPIT | kpis | 6 |  |
| COCKPIT | what_i_know | 9 |  |
| COCKPIT | charts | 3 | 23 points |
| FICHE COMPTE | sections[fiche-compte] | 14 |  |
| PROGRAMMES | sections[programmes] | 6 |  |
| COMPETENCES A VENDRE | sections[competences-a-vendre] | 8 |  |
| PLAN D ACTION | sections[plan-d-action] | 7 |  |
| GARDE-FOUS | guardrails | 5 |  |
| PROFILS EN POSTE | people (role par ligne) | 16 | 16 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| ANCIENS | people (role=alumni) | 3 | 3 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| DECIDEURS ET ROLES | sections[decideurs-et-roles] | 8 | onglet entier gardé (colonnes hors contrat) |
| DECIDEURS ET ROLES | people (role=decision_maker) | 1 | 1 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée, 7 ligne(s) non personnes → section decideurs-et-roles |
| (dérivés) | sites | 1 | Naval Group — site de Nantes-Indret |
| FICHE COMPTE | sites (siège dérivé de la ligne Siège) | 1 |  |
| (titres et notes) | sections[notes] | 15 |  |

## Chantiers de l'Atlantique — `CHANTIERS_ATLANTIQUE_BELLUM_BRIEF.xlsx`

Siège : Saint-Nazaire, Saint-Nazaire. Personnes : decision_maker 3.

| Onglet | Champ du contrat | Lignes | Note |
| --- | --- | --- | --- |
| COCKPIT | kpis | 6 |  |
| COCKPIT | what_i_know | 9 |  |
| COCKPIT | charts | 3 | 10 points |
| FICHE COMPTE | sections[fiche-compte] | 13 |  |
| PROGRAMMES | sections[programmes] | 7 |  |
| COMPETENCES A VENDRE | sections[competences-a-vendre] | 8 |  |
| PLAN D ACTION | sections[plan-d-action] | 6 |  |
| GARDE-FOUS | guardrails | 5 |  |
| DECIDEURS ET ROLES | sections[decideurs-et-roles] | 8 | onglet entier gardé (colonnes hors contrat) |
| DECIDEURS ET ROLES | people (role=decision_maker) | 3 | 3 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée, 5 ligne(s) non personnes → section decideurs-et-roles |
| FICHE COMPTE | sites (siège dérivé de la ligne Siège) | 1 |  |
| (titres et notes) | sections[notes] | 10 |  |

## BNP Paribas — `BNP_PARIBAS_QUICKSORT_BELLUM_BRIEF.xlsx`

Siège : 16 boulevard des Italiens, Paris. Personnes : alumni 87 · contact 126 · decision_maker 41 · external 60 · manager 25.

| Onglet | Champ du contrat | Lignes | Note |
| --- | --- | --- | --- |
| COCKPIT | kpis | 6 |  |
| COCKPIT | what_i_know | 10 |  |
| COCKPIT | charts | 5 | 46 points |
| FICHE COMPTE | sections[fiche-compte] | 14 |  |
| ACHATS AVANT D APPELER | sections[achats-avant-d-appeler] | 22 |  |
| BESOINS AVEC PRIX | sections[besoins-avec-prix] | 13 |  |
| BESOINS AVEC PRIX | prices | 13 | 0 ligne(s) sans prix, gardées en section |
| BESOINS EXPRIMES CIB | sections[besoins-exprimes-cib] | 37 |  |
| DYNAMIQUE 2027+ | sections[dynamique-2027] | 17 |  |
| COMPETENCES A VENDRE | sections[competences-a-vendre] | 8 |  |
| STRUCTURE | sections[structure] | 37 |  |
| FILIALES ET ENTITES | entities | 83 |  |
| FILIALES ET ENTITES | sections[filiales-et-entites-non-retenus] | 346 | Hors France : France — Antilles et Guyane ; Hors France : France — La Réunion ; Hors France : France — Nouvelle-Calédonie ; Hors France : France — Wallis-et-Futuna ; Hors France : Afrique du Sud ; Hors France : Algérie ; Hors France : Allemagne ; Hors France : Arabie saoudite ; Hors France : Argentine ; Hors France : Australie ; Hors France : Autriche ; Hors France : Bahreïn ; Hors France : Belgique ; Hors France : Botswana ; Hors France : Brésil ; Hors France : Bulgarie ; Hors France : Canada ; Hors France : Chili ; Hors France : Chine ; Hors France : Colombie ; Hors France : Corée du Sud ; Hors France : Danemark ; Hors France : Espagne ; Hors France : Finlande ; Hors France : Grèce ; Hors France : Guernesey ; Hors France : Hong Kong ; Hors France : Hongrie ; Hors France : Inde ; Hors France : Indonésie ; Hors France : Irlande ; Hors France : Italie ; Hors France : Japon ; Hors France : Jersey ; Hors France : Kosovo ; Hors France : Koweït ; Hors France : Luxembourg ; Hors France : Malaisie ; Hors France : Maroc ; Hors France : Mexique ; Hors France : Monaco ; Hors France : Namibie ; Hors France : Norvège ; Hors France : Nouvelle-Zélande ; Hors France : Pays-Bas ; Hors France : Philippines ; Hors France : Pologne ; Hors France : Portugal ; Hors France : Pérou ; Hors France : Qatar ; Hors France : Roumanie ; Hors France : Royaume-Uni ; Hors France : Russie ; Hors France : République tchèque ; Hors France : Singapour ; Hors France : Slovaquie ; Hors France : Suisse ; Hors France : Suède ; Hors France : Taïwan ; Hors France : Thaïlande ; Hors France : Turquie ; Hors France : Ukraine ; Hors France : Vietnam ; Hors France : Émirats arabes unis ; Hors France : États-Unis |
| PRESTATAIRES EN PLACE | sections[prestataires-en-place] | 47 |  |
| PRESTATAIRES EN PLACE | esn | 31 |  |
| PRESTATAIRES EN PLACE | lignes non ESN (gardées dans la section de l’onglet) | 16 | Hors France : Belgique, Italie, Luxembourg ou Pologne ; Partenaire tiers (ne vaut ni panel ni sous-traitance) : pas une ESN |
| HYPOTHESES | sections[hypotheses] | 60 |  |
| ACCROCHES | sections[accroches] | 6 |  |
| PLAN D ACTION | sections[plan-d-action] | 6 |  |
| GARDE-FOUS | guardrails | 26 |  |
| EXTERNES EN POSTE | people (role=external) | 60 | 60 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| ANCIENS DE BNP | sections[anciens-de-bnp] | 87 | onglet entier gardé (colonnes hors contrat) |
| ANCIENS DE BNP | people (role=alumni) | 87 | 87 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| CONTACTS | people (role=contact) | 126 | 126 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| PRESCRIPTEURS CIB | sections[prescripteurs-cib] | 25 | onglet entier gardé (colonnes hors contrat) |
| PRESCRIPTEURS CIB | people (role=manager) | 25 | 25 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| DECIDEURS | sections[decideurs] | 41 | onglet entier gardé (colonnes hors contrat) |
| DECIDEURS | people (role=decision_maker) | 41 | 41 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| (dérivés) | sites | 1 | Montreuil — IT Group |
| FICHE COMPTE | sites (siège dérivé de la ligne Siège) | 1 |  |
| (titres et notes) | sections[notes] | 31 |  |

Valeurs écartées (jamais recopiées) :
- 82 × SOCIÉTÉ MÈRE : code technique du classeur (NON_ETABLIE, SANS_OBJET_SUCCURSALE_RATTACHEE), écarté

## Bpifrance — `BPIFRANCE_QUICKSORT_BELLUM_BRIEF.xlsx`

Siège : 27-31 avenue du Général Leclerc, Maisons-Alfort. Personnes : alumni 6 · contact 119 · decision_maker 22 · external 34.

| Onglet | Champ du contrat | Lignes | Note |
| --- | --- | --- | --- |
| COCKPIT | kpis | 6 |  |
| COCKPIT | what_i_know | 9 |  |
| COCKPIT | charts | 4 | 19 points |
| FICHE COMPTE | sections[fiche-compte] | 13 |  |
| ACHATS AVANT D APPELER | sections[achats-avant-d-appeler] | 7 |  |
| BESOINS OBSERVES | sections[besoins-observes] | 66 |  |
| FILIALES ET ENTITES | entities | 9 |  |
| DYNAMIQUE 2026-2030 | sections[dynamique-2026-2030] | 7 |  |
| COMPETENCES A VENDRE | sections[competences-a-vendre] | 7 |  |
| ACCROCHES | sections[accroches] | 5 |  |
| PLAN D ACTION | sections[plan-d-action] | 6 |  |
| GARDE-FOUS | guardrails | 5 |  |
| ANCIENS | sections[anciens] | 6 | onglet entier gardé (colonnes hors contrat) |
| ANCIENS | people (role=alumni) | 6 | 6 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| CONTACTS | sections[contacts] | 130 | onglet entier gardé (colonnes hors contrat) |
| CONTACTS | people (role par ligne) | 128 | 128 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée, 2 ligne(s) non personnes → section contacts |
| PRESCRIPTEURS | sections[prescripteurs] | 11 | onglet entier gardé (colonnes hors contrat) |
| PRESCRIPTEURS | people (role=manager) | 11 | 7 ajoutée(s), 4 fusionnée(s) dans une personne déjà listée |
| DECIDEURS | sections[decideurs] | 22 | onglet entier gardé (colonnes hors contrat) |
| DECIDEURS | people (role=decision_maker) | 22 | 10 ajoutée(s), 12 fusionnée(s) dans une personne déjà listée |
| PROFILS EN POSTE | sections[profils-en-poste] | 30 | onglet entier gardé (colonnes hors contrat) |
| PROFILS EN POSTE | people (role par ligne) | 30 | 30 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| (dérivés) | sites | 1 | Bureaux boulevard Haussmann |
| FICHE COMPTE | sites (siège dérivé de la ligne Siège) | 1 |  |
| (titres et notes) | sections[notes] | 24 |  |

## Sanofi — `SANOFI_QUICKSORT_BELLUM_BRIEF.xlsx`

Siège : Paris, Paris. Personnes : alumni 22 · contact 12 · decision_maker 102 · external 14 (dont 3 `exited`).

| Onglet | Champ du contrat | Lignes | Note |
| --- | --- | --- | --- |
| COCKPIT | kpis | 6 |  |
| COCKPIT | what_i_know | 10 |  |
| COCKPIT | charts | 3 | 8 points |
| LOGIQUE GROUPE | sections[logique-groupe] | 7 |  |
| FICHE COMPTE | sections[fiche-compte] | 13 |  |
| ACHATS AVANT D APPELER | sections[achats-avant-d-appeler] | 12 |  |
| COMPETENCES A VENDRE | sections[competences-a-vendre] | 6 |  |
| PROJETS 2026-2027 | sections[projets-2026-2027] | 52 |  |
| IT SI DATA | sections[it-si-data] | 19 |  |
| ENTITES | entities | 10 |  |
| SITES UTILES | sections[sites-utiles] | 19 |  |
| SITES UTILES | sites | 19 |  |
| ESN PRESENTES | sections[esn-presentes] | 13 |  |
| ESN PRESENTES | esn | 12 |  |
| ESN PRESENTES | lignes non ESN (gardées dans la section de l’onglet) | 1 | Garde-fou : le panel ESN n’est pas démontré, pas une ESN |
| BESOINS OBSERVES | sections[besoins-observes] | 4 |  |
| POSTES OUVERTS | sections[postes-ouverts] | 4 |  |
| DOMAINES | sections[domaines] | 12 |  |
| ACCROCHES | sections[accroches] | 5 |  |
| PLAN D ACTION | sections[plan-d-action] | 6 |  |
| GARDE-FOUS | guardrails | 15 |  |
| ANCIENS DE SANOFI | sections[anciens-de-sanofi] | 22 | onglet entier gardé (colonnes hors contrat) |
| ANCIENS DE SANOFI | people (role=alumni) | 22 | 22 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| CONTACTS | sections[contacts] | 26 | onglet entier gardé (colonnes hors contrat) |
| CONTACTS | people (role par ligne) | 26 | 26 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| DECIDEURS | sections[decideurs] | 102 | onglet entier gardé (colonnes hors contrat) |
| DECIDEURS | people (role=decision_maker) | 102 | 102 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| (dérivées) | entities (sorties, par graphie de la source) | 1 | EUROAPI |
| FICHE COMPTE | sites (siège dérivé de la ligne Siège) | 1 |  |
| COCKPIT (second classeur) | sections[cockpit-lyon] | 41 | 6 indicateurs, 10 rubriques, 4 graphiques (les KPI du compte restent ceux du premier classeur : 6 au plus) |
| PLAN D ACTION (second classeur) | sections[plan-d-action-lyon] | 7 | onglet entier gardé, à clé propre |
| PROJETS 2026-2027 (second classeur) | sections[projets-2026-2027] (lignes absentes du premier classeur) | 0 | 48 ligne(s) déjà présente(s) à l'identique |
| LOGIQUE GROUPE (second classeur) | identique à « LOGIQUE GROUPE » | 7 | rien à ajouter |
| FICHE COMPTE (second classeur) | identique à « FICHE COMPTE » | 13 | rien à ajouter |
| ACHATS AVANT D APPELER (second classeur) | identique à « ACHATS AVANT D APPELER » | 12 | rien à ajouter |
| SITES UTILES (second classeur) | identique à « SITES UTILES » | 19 | rien à ajouter |
| DECIDEURS (second classeur) | identique à « DECIDEURS » | 102 | rien à ajouter |
| CONTACTS (second classeur) | identique à « CONTACTS » | 26 | rien à ajouter |
| BESOINS OBSERVES (second classeur) | identique à « BESOINS OBSERVES » | 4 | rien à ajouter |
| ESN PRESENTES (second classeur) | identique à « ESN PRESENTES » | 13 | rien à ajouter |
| ANCIENS DE SANOFI (second classeur) | identique à « ANCIENS DE SANOFI » | 22 | rien à ajouter |
| POSTES OUVERTS LYON (second classeur) | identique à « POSTES OUVERTS » | 4 | rien à ajouter |
| ENTITES (second classeur) | identique à « ENTITES » | 10 | rien à ajouter |
| IT SI DATA (second classeur) | identique à « IT SI DATA » | 19 | rien à ajouter |
| DOMAINES (second classeur) | identique à « DOMAINES » | 12 | rien à ajouter |
| GARDE-FOUS (second classeur) | identique à « GARDE-FOUS » | 15 | rien à ajouter |
| (titres et notes) | sections[notes] | 46 |  |

## ADEO - Leroy Merlin — `ADEO_LEROY_MERLIN_MEEDZ_BELLUM_BRIEF.xlsx`

Siège : ADEO Services, Ronchin. Personnes : alumni 49 · contact 44 · decision_maker 7 · external 85 · manager 9.

| Onglet | Champ du contrat | Lignes | Note |
| --- | --- | --- | --- |
| COCKPIT | kpis | 6 |  |
| COCKPIT | what_i_know | 9 |  |
| COCKPIT | charts | 5 | 38 points |
| FICHE COMPTE | sections[fiche-compte] | 12 |  |
| ACHATS AVANT D APPELER | sections[achats-avant-d-appeler] | 7 |  |
| GRILLE DE PRIX ADEO | sections[grille-de-prix-adeo] | 13 |  |
| GRILLE DE PRIX ADEO | prices | 34 | 34 prix lus sur 13 ligne(s) (une ligne porte plusieurs prix) |
| BESOINS DETAILLES | sections[besoins-detailles] | 222 |  |
| COMPETENCES A VENDRE | sections[competences-a-vendre] | 8 |  |
| PROJETS 2026-2035 | sections[projets-2026-2035] | 6 |  |
| ENSEIGNES ET ENTITES | entities | 10 |  |
| ENSEIGNES ET ENTITES | sections[enseignes-et-entites-non-retenus] | 1 | Hors France : enseigne italienne |
| ACCROCHES | sections[accroches] | 4 |  |
| PLAN D ACTION | sections[plan-d-action] | 5 |  |
| GARDE-FOUS | guardrails | 5 |  |
| EXTERNES EN POSTE | people (role=external) | 85 | 85 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| ANCIENS | sections[anciens] | 49 | onglet entier gardé (colonnes hors contrat) |
| ANCIENS | people (role=alumni) | 49 | 49 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| CONTACTS | people (role=contact) | 45 | 45 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| DECIDEURS | sections[decideurs] | 16 | onglet entier gardé (colonnes hors contrat) |
| DECIDEURS | people (role par ligne) | 16 | 15 ajoutée(s), 1 fusionnée(s) dans une personne déjà listée |
| (dérivés) | sites | 3 | Leroy Merlin — Lezennes, ADEO — Lille, ADEO — Villeneuve-d’Ascq |
| FICHE COMPTE | sites (siège dérivé de la ligne Siège) | 1 |  |
| (titres et notes) | sections[notes] | 23 |  |

## Kiabi — `KIABI_MEEDZ_BELLUM_BRIEF.xlsx`

Siège : Kiabi Village, Lezennes. Personnes : alumni 10 · contact 2 · decision_maker 6 · external 14.

| Onglet | Champ du contrat | Lignes | Note |
| --- | --- | --- | --- |
| COCKPIT | kpis | 6 |  |
| COCKPIT | what_i_know | 7 |  |
| COCKPIT | charts | 2 | 12 points |
| FICHE COMPTE | sections[fiche-compte] | 13 |  |
| ACHATS AVANT D APPELER | sections[achats-avant-d-appeler] | 5 |  |
| DIGITAL ET DATA | sections[digital-et-data] | 7 |  |
| COMPETENCES A VENDRE | sections[competences-a-vendre] | 6 |  |
| PROJETS 2026-2036 | sections[projets-2026-2036] | 5 |  |
| ACCROCHES | sections[accroches] | 4 |  |
| PLAN D ACTION | sections[plan-d-action] | 4 |  |
| GARDE-FOUS | guardrails | 4 |  |
| PROFILS EN POSTE | sections[profils-en-poste] | 16 | onglet entier gardé (colonnes hors contrat) |
| PROFILS EN POSTE | people (role par ligne) | 16 | 16 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| ANCIENS | sections[anciens] | 10 | onglet entier gardé (colonnes hors contrat) |
| ANCIENS | people (role=alumni) | 10 | 10 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| DECIDEURS | sections[decideurs] | 6 | onglet entier gardé (colonnes hors contrat) |
| DECIDEURS | people (role=decision_maker) | 6 | 6 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| FICHE COMPTE | sites (siège dérivé de la ligne Siège) | 1 |  |
| (titres et notes) | sections[notes] | 17 |  |

## ABB Suisse — `ABB_SUISSE_BELLUM_BRIEF.xlsx`

Siège : Zurich, Zurich. Personnes : contact 54 · decision_maker 23.

| Onglet | Champ du contrat | Lignes | Note |
| --- | --- | --- | --- |
| COCKPIT | kpis | 6 |  |
| COCKPIT | what_i_know | 10 |  |
| COCKPIT | charts | 4 | 21 points |
| POSTES OUVERTS SUISSE | sections[postes-ouverts-suisse] | 10 |  |
| ESN ET PARTENAIRES SUISSE | sections[esn-et-partenaires-suisse] | 9 |  |
| FICHE COMPTE | sections[fiche-compte] | 12 |  |
| REGLES SUISSE | sections[regles-suisse] | 25 |  |
| REGLES SUISSE | guardrails | 3 | règles retenues comme garde-fous ; l’onglet entier reste en section |
| ACHATS AVANT D APPELER | sections[achats-avant-d-appeler] | 7 |  |
| STRUCTURE | sections[structure] | 44 |  |
| SITES SUISSES | sites | 12 |  |
| SITES SUISSES | sections[sites-suisses-non-retenus] | 2 | Futur siège annoncé : pas encore un site ; Hors Suisse : cité comme concurrent interne |
| IT SI DATA | sections[it-si-data] | 11 |  |
| DOMAINES | sections[domaines] | 11 |  |
| ENTITES | entities | 10 |  |
| ENTITES | sections[entites-non-retenus] | 7 | Opération annoncée : pas une entité ; Hors Suisse : Norvège ; Hors Suisse : France ; Hors Suisse : Royaume-Uni ; Hors Suisse : Italie |
| PLAN D ACTION | sections[plan-d-action] | 8 |  |
| GARDE-FOUS | guardrails | 14 |  |
| CIBLES P1 | sections[cibles-p1] | 33 | onglet entier gardé (colonnes hors contrat) |
| CIBLES P1 | people (role par ligne) | 33 | 33 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| CIBLES P2 | sections[cibles-p2] | 44 | onglet entier gardé (colonnes hors contrat) |
| CIBLES P2 | people (role par ligne) | 44 | 44 ajoutée(s), 0 fusionnée(s) dans une personne déjà listée |
| (titres et notes) | sections[notes] | 24 |  |

## Orange — `orange_account.json + contacts_orange.csv + sources.csv`

Siège : Siège non confirmé, Paris. Personnes : alumni 298 · contact 160 · decision_maker 7 · external 13.

| Onglet | Champ du contrat | Lignes | Note |
| --- | --- | --- | --- |
| contacts_orange.csv | people | 477 | rang d’exploitabilité du fichier conservé ; adresses hors domaine Orange non reprises |
| decideurs | people (role=decision_maker) | 7 | remontés en tête avec leur rôle |
| structure | entities | 9 | confiance recopiée (confirmé / probable / indice faible) |
| sites | sites | 7 | datacenters confirmés (fort) + trois sites en indice faible ; aucun site siège (siège non confirmé) |
| esn_sur_place | esn | 18 | jamais « confirmé » : aucun panel ESN public trouvé |
| legal | sections[fiche-compte] | 8 | seul le SIREN est confirmé ; le reste « non trouvé » est recopié tel quel |
| marche | sections[marche] | 10 | chaque chiffre porte sa source, son lien et sa date de consultation (sources.csv) |
| projets | sections[projets-2026-2027] | 7 | horizon et confiance recopiés ; aucune « offre à monter » inventée |
| achats | sections[achats-avant-d-appeler] | 7 | plateformes + accessibilité + « non trouvé » ; deux lignes erronées de la base écartées (corrections_base) |
| besoins | sections[besoins-en-base] | 3 | colonne « origine » (fichiers internes) écartée ; date, TJM ou contact absents = « non trouvé » |
| decideurs | sections[decideurs] | 7 | adresses hors domaine Orange non reprises |
| sites | sections[villes-consultants] | 52 | Ville du consultant, pas site Orange confirmé |
| sources.csv | sections[sources] | 9 | lien et date de consultation de chaque source ; la base interne est nommée « base interne de l’espace » |
| kpis | kpis | 6 | six tuiles tirées des 13 indicateurs du dossier |
| sites + esn_sur_place | charts | 2 | 28 points |
| limites | guardrails | 7 | quatre limites du dossier recopiées (la cinquième est une note interne, écartée) + trois garde-fous de lecture |

Valeurs écartées (jamais recopiées) :
- 293 × adresse d’un employeur tiers ou d’un domaine personnel : non reprise
- 5 × adresse hors domaine Orange (décideurs) : non reprise
- 255 × adresse personnelle (webmail) : non reprise
- 1 × limite « base légale des contacts » : note interne de l’équipe, pas un garde-fou commercial
- 3 × origine du besoin : nom d’un fichier interne, non repris

Anomalies de la SOURCE (gardées telles quelles, à corriger dans le classeur) :
- « Florent Bazin » : décideur du dossier absent du CSV de contacts, ajouté sans coordonnée

## Crédit Agricole — `credit_agricole_account.json + contacts_credit_agricole.csv + sources.csv`

Siège : Siège de Crédit Agricole S.A. (fiche tierce, à confirmer), Montrouge. Personnes : alumni 218 · contact 155 · decision_maker 18 · external 12.

| Onglet | Champ du contrat | Lignes | Note |
| --- | --- | --- | --- |
| contacts_credit_agricole.csv | people | 396 | ordre du fichier conservé ; seules les adresses du domaine du groupe sont reprises |
| marche | sections[marche] | 23 | chaque chiffre porte sa source, son lien et sa date |
| legal | sections[fiche-compte] | 11 | identifiants de fiches tierces : confiance recopiée |
| structure | entities | 10 | confiance recopiée quand le dossier en donne une ; sinon aucune |
| structure[].sites | sites | 13 | sites de CAGIP et CA-TS cités au dossier ; aucun site siège |
| sites.villes_consultants | sections[villes-consultants] | 54 | ville déclarée du consultant, pas site client confirmé |
| sites.sites_officiels | sections[sites-officiels] | 5 |  |
| zones | sections[consultants-par-zone] | 6 | zones de la démo, gardées comme répartition des consultants ; l’ESN prospect n’est pas nommée |
| esn_sur_place | esn | 24 | jamais « confirmé » : aucun panel ESN public trouvé |
| intermediaires_et_partenaires | sections[partenaires] | 1 |  |
| achats.outils | sections[achats-avant-d-appeler] | 9 |  |
| besoins | sections[besoins-en-base] | 13 | date, entité ou contact absents = « non trouvé » |
| presence_sur_site | sections[presence-sur-site] | 3 | une seule valeur en base ; CAGIP et CA-TS : non trouvé |
| projets | sections[projets-2026-2027] | 9 | horizon et confiance recopiés ; aucune « offre à monter » inventée |
| dirigeants_publics | sections[dirigeants-publics] | 7 |  |
| dirigeants_publics | people (role=decision_maker) | 7 | 7 ajoutée(s) sans coordonnée, absentes du CSV |
| decideurs_base | sections[decideurs] | 11 | adresses hors domaine du groupe non reprises |
| limites | guardrails | 6 | limites du dossier recopiées ; les notes internes de l’équipe sont écartées |
| kpis | kpis | 6 | six tuiles tirées des indicateurs du dossier |
| zones + esn_sur_place | charts | 2 |  |
| sources.csv | sections[sources] | 19 | lien et date de consultation de chaque source |

Valeurs écartées (jamais recopiées) :
- 196 × adresse d’un employeur tiers ou d’un domaine personnel : non reprise
- 223 × adresse personnelle (webmail) : non reprise
- 13 × besoins.channel : canal par lequel NOUS avons reçu le besoin : notre activité commerciale
- 13 × besoins.origin : nom d’un fichier interne
- 13 × besoins.status : statut de NOTRE réponse au besoin (perdu, abandonné) : la consigne du dossier interdit de le montrer
- 13 × besoins.tjm : TJM de vente et d’achat du CRM interne : la consigne du dossier interdit de le montrer
- 13 × besoins.year : redondant avec la date
- 1 × clé « a_verifier_terrain » : préparation interne de la démo (questions à l’ESN prospect) : écartée
- 1 × clé « strategie_soluxan » : stratégie de vente de l’ESN prospect : écartée (décision Louis 15/10)
- 3 × contact marqué « blacklist » au CRM : non semé
- 327 × contacts_credit_agricole.csv.metropole : regroupement de la ville, déjà portée par la fiche
- 399 × contacts_credit_agricole.csv.rang_exploitabilite : rang interne (l’ordre du fichier est conservé)
- 399 × contacts_credit_agricole.csv.score : score interne d’exploitabilité
- 25 × contacts_credit_agricole.csv.statut_CRM : statut de NOTRE relation commerciale (contactabilité) : notre activité, pas le compte
- 327 × contacts_credit_agricole.csv.zone_soluxan : zone commerciale de l’ESN prospect : non affichée
- 1 × intermediaires_et_partenaires : intermédiaire tiré de NOTRE CRM (notre activité commerciale) : non affiché
- 3 × kpis des besoins (en base, gagnés) : NOTRE activité commerciale, pas le compte
- 3 × kpis des contacts du dossier : recomptés sur le fichier après la liste noire
- 1 × limite du dossier qui est une note interne de l’équipe (RGPD, base, données internes) : non affichée
- 1 × marche : codes de source internes : remplacés par la source nommée de chaque ligne
- 1 × marche : daté dans le libellé de la source (Option Finance du 18/11/2025)
- 1 × marche : recopiée dans la colonne FIABILITÉ de chaque ligne
- 1 × meta (titre, identifiant de base, rendez-vous de démo de l’ESN prospect) : non affiché
- 1 × presence_sur_site.valeurs_en_base.statut : statut de NOTRE réponse au besoin : non affiché
- 9 × projets.confiance : recopiée dans « ce qui est public »
- 1 × source qui est NOTRE CRM (notre activité commerciale) : non affichée

## VINCI — `vinci_account.json + contacts_vinci.csv + sources.csv`

Siège : VINCI SA, Nanterre. Personnes : alumni 109 · contact 56 · decision_maker 83 · external 7.

| Onglet | Champ du contrat | Lignes | Note |
| --- | --- | --- | --- |
| contacts_vinci.csv | people | 250 | ordre du fichier conservé ; seules les adresses du domaine du groupe sont reprises |
| marche.chiffres | sections[marche] | 6 | sources et dates : section SOURCES |
| marche.details | sections[marche-par-metier] | 6 |  |
| legal | sections[fiche-compte] | 9 | confiance recopiée dans le texte du dossier ; « non trouvé » gardé tel quel |
| structure | entities | 10 | repère, description et confiance recopiés |
| structure + sites_officiels | sites | 14 | villes recopiées du dossier (vérifiées), France seulement |
| sites.villes_consultants | sections[villes-consultants] | 24 | ville déclarée du consultant, pas site client confirmé |
| sites.par_entite | sections[consultants-par-entite] | 8 |  |
| sites.sites_officiels | sections[sites-officiels] | 6 |  |
| esn_sur_place | esn | 34 | prestataires publics (observés) puis parcours de consultants (indice) ; jamais « confirmé » |
| esn_sur_place.web | sections[prestataires-publics] | 16 | un cas client ou une conférence n’est jamais un référencement |
| achats.outils | sections[achats-avant-d-appeler] | 23 |  |
| besoins | sections[besoins-en-base] | 5 | date absente = « non trouvé » ; montants et statuts du CRM interne jamais affichés |
| projets | sections[projets-2026-2027] | 26 |  |
| emploi | sections[postes-ouverts] | 18 |  |
| dirigeants_publics | sections[dirigeants-publics] | 26 |  |
| dirigeants_publics | people (role=decision_maker) | 26 | 5 ajoutée(s) sans coordonnée, absentes du CSV |
| personnes_linkedin_collees | people | 22 | déjà au CSV (origine « LinkedIn collé non confirmé ») |
| decideurs_base | sections[decideurs] | 78 | adresses hors domaine du groupe non reprises |
| limites | guardrails | 7 | limites du dossier recopiées ; les notes internes de l’équipe sont écartées |
| kpis | kpis | 6 | quatre tuiles du dossier + référencement + contacts |
| sources.csv | sections[sources] | 143 | lien et date de consultation de chaque source |

Valeurs écartées (jamais recopiées) :
- 1 × ESN de la base qui n’en est pas une (association étudiante) : non reprise
- 70 × adresse d’un employeur tiers ou d’un domaine personnel : non reprise
- 67 × adresse personnelle (webmail) : non reprise
- 5 × besoins.amount_eur : montant ou TJM du CRM interne : la consigne du dossier interdit de le montrer
- 5 × besoins.channel : canal par lequel NOUS avons reçu le besoin : notre activité commerciale
- 5 × besoins.city_norm : ville normalisée, redondante avec le lieu
- 5 × besoins.comment_raw : note de saisie interne
- 5 × besoins.consultant_count : nombre de NOS consultants présentés : notre activité
- 5 × besoins.crm_stage : étape de NOTRE pipeline commercial
- 5 × besoins.days_per_week : lu avec les jours sur site
- 5 × besoins.family : famille de la taxonomie interne
- 5 × besoins.need_uid : identifiant interne
- 5 × besoins.other_raw : champs bruts du CRM interne (montants, identifiants)
- 5 × besoins.platform_raw : lot d’import interne
- 5 × besoins.source : nom d’un fichier interne
- 5 × besoins.status_raw : statut de NOTRE réponse au besoin : la consigne du dossier interdit de le montrer
- 1 × besoins.technologies : code de taxonomie interne, pas un libellé
- 5 × besoins.year : redondant avec la date
- 1 × clé « a_verifier_terrain » : préparation interne de la démo (questions à l’ESN prospect) : écartée
- 1 × clé « comptes_comparables_base » : autres comptes de la base interne : pas ce compte
- 1 × clé « lecture_par_entite » : notation des entités du point de vue de l’ESN prospect : sa stratégie, écartée
- 1 × clé « meta_analyse » : analyse de provenance des documents internes et d’un plan de compte tiers : note interne
- 1 × clé « strategie_mk4 » : stratégie de vente de l’ESN prospect : écartée (décision Louis 15/10)
- 250 × contacts_vinci.csv.a_valider_RGPD : note interne de l’équipe (RGPD) : pas un fait sur la personne
- 116 × contacts_vinci.csv.metropole : regroupement de la ville, déjà portée par la fiche
- 250 × contacts_vinci.csv.rang_exploitabilite : rang interne (l’ordre du fichier est conservé)
- 250 × contacts_vinci.csv.score : score interne d’exploitabilité
- 250 × contacts_vinci.csv.source : noms de fichiers internes
- 50 × contacts_vinci.csv.statut_CRM : statut de NOTRE relation commerciale (contactabilité) : notre activité, pas le compte
- 9 × emploi : offre de STAGE : jamais un signal (Louis 12/10/2026)
- 5 × lien de source vers un fournisseur de données : retiré (la source reste nommée)
- 2 × limite du dossier qui est une note interne de l’équipe (RGPD, base, données internes) : non affichée
- 1 × meta (titre, identifiants de base, rendez-vous de démo de l’ESN prospect) : non affiché
- 2 × phrase qui nomme une source interne : non affichée
- 26 × projets.confiance : recopiée dans « ce qui est public »
- 1 × source qui est NOTRE CRM (notre activité commerciale) : non affichée

## Enedis — `enedis_account.json + contacts_enedis.csv + sources.csv`

Siège : Tour Enedis, Puteaux. Personnes : alumni 1 · contact 1442 · decision_maker 23 · manager 132.

| Onglet | Champ du contrat | Lignes | Note |
| --- | --- | --- | --- |
| contacts_enedis.csv | people | 1598 | ordre du fichier conservé ; seules les adresses du domaine du groupe sont reprises |
| kpis | kpis | 6 | tuiles du dossier ; « actions commerciales déjà menées » écartée |
| a_retenir | what_i_know | 7 | le titre du dossier est « ce que ça veut dire », le texte « ce qu’on sait » |
| legal | sections[fiche-compte] | 7 |  |
| marche.chiffres | sections[marche] | 6 | sources et dates : section SOURCES |
| marche.details | sections[marche-lecture] | 6 |  |
| signaux | sections[projets-2026-2027] | 15 |  |
| achats.elements | sections[achats-avant-d-appeler] | 12 |  |
| achats.marche_referencement | sections[marche-referencement] | 8 |  |
| achats.panels | sections[panels-groupe-edf] | 4 |  |
| organisation.dsi | sections[organisation-dsi] | 13 |  |
| organisation.territoires | sections[territoires] | 5 |  |
| organisation + contacts | entities | 20 | pôles et territoires du dossier, puis entités du fichier de contacts |
| legal + organisation.territoires | sites | 8 | villes recopiées du dossier (vérifiées) |
| lots_achats | sections[lots-achats] | 17 | cités dans les documents de compte, pas une source publique |
| applications | sections[applications] | 22 |  |
| presence_sur_site | sections[presence-sur-site] | 5 | une ligne par constat, confiance en fin de ligne |
| esn.base | esn | 24 | indice faible de présence, jamais un référencement |
| esn.web | sections[prestataires-publics] | 5 |  |
| limites | guardrails | 8 | limites du dossier recopiées ; les notes internes de l’équipe sont écartées |
| sources.csv | sections[sources] | 27 | lien et date de consultation de chaque source |

Valeurs écartées (jamais recopiées) :
- 1 × ESN de la base sans nom (« ESN ») : non reprise
- 1 × a_retenir : historique de NOTRE prospection sur le compte : notre activité commerciale
- 1 × a_retenir : question posée à l’ESN prospect sur sa propre candidature : sa stratégie, écartée
- 1 × a_retenir : titre qui nomme l’ESN prospect (sa stratégie) : écarté
- 4 × adresse qui ne porte pas le nom de la personne (erreur du fichier) : non reprise
- 1 × clé « contacts » : même liste que contacts_enedis.csv, lu à sa place
- 1 × clé « historique » : historique de NOTRE prospection (rendez-vous, actions par thème et par année) : notre activité commerciale, documents non publics
- 1 × clé « lecture_par_voie » : notation des voies d’entrée du point de vue de l’ESN prospect : sa stratégie, écartée
- 1 × clé « strategie_experis » : stratégie de vente de l’ESN prospect : écartée (décision Louis 15/10)
- 1598 × contacts_enedis.csv.a_valider_RGPD : note interne de l’équipe (RGPD) : pas un fait sur la personne
- 103 × contacts_enedis.csv.derniere_action : date de NOTRE dernière action commerciale : notre activité
- 1598 × contacts_enedis.csv.nb_actions_crm : nombre de NOS actions commerciales : notre activité, pas le compte
- 1598 × contacts_enedis.csv.rang : rang interne (l’ordre du fichier est conservé)
- 1598 × contacts_enedis.csv.score : score interne d’exploitabilité
- 1598 × contacts_enedis.csv.source : noms de documents internes
- 103 × contacts_enedis.csv.sujets_crm : sujets de NOS rendez-vous commerciaux : notre activité
- 1 × kpi « actions commerciales déjà menées » : NOTRE activité commerciale, pas le compte
- 1 × lien de source vers un fournisseur de données : retiré (la source reste nommée)
- 1 × ligne du fichier de contacts qui n’est pas une personne (intitulé de formation) : non semée
- 2 × limite du dossier qui est une note interne de l’équipe (RGPD, base, données internes) : non affichée
- 1 × meta (titre, identifiant de base, rendez-vous de démo de l’ESN prospect) : non affiché
- 4 × phrase qui nomme l’ESN prospect de la démo ou son interlocuteur : non affichée
- 1 × phrase qui nomme une source interne : non affichée
- 1 × phrase qui poursuit une phrase non affichée : non affichée
- 15 × signaux.confiance : recopiée dans « ce qui est public »
- 1 × source qui est NOTRE CRM (notre activité commerciale) : non affichée

Anomalies de la SOURCE (gardées telles quelles, à corriger dans le classeur) :
- « Alexandre Taupiac » : l’adresse « cecile.hamilton@enedis.fr » ne porte pas son nom, non reprise
- « Denis CRUBLE » : l’adresse « catherine.guelmi@enedis.fr » ne porte pas son nom, non reprise
- « Gautier LAROCHE » : l’adresse « damien.de-rekeneire@enedis.fr » ne porte pas son nom, non reprise
- « Guillaume Van Meenen » : l’adresse « myriam.hammadi@enedis.fr » ne porte pas son nom, non reprise

## Safran — `safran_account.json + contacts_safran.csv + sources.csv`

Siège : Safran SA, Paris. Personnes : contact 58 · decision_maker 2 · external 17 · manager 28.

| Onglet | Champ du contrat | Lignes | Note |
| --- | --- | --- | --- |
| contacts_safran.csv | people | 105 | ordre du fichier conservé ; seules les adresses du domaine du groupe sont reprises |
| kpis | kpis | 6 | tuiles du dossier ; une phrase qui nomme l’ESN prospect n’est pas affichée |
| a_retenir | what_i_know | 8 | le titre du dossier est « ce que ça veut dire », le texte « ce qu’on sait » |
| foisonnement | sections[societes-du-groupe] | 13 |  |
| foisonnement | entities | 13 | les sociétés en France ; métier et SI recopiés |
| foisonnement | sites | 24 | villes recopiées de la colonne « métier et sites » (vérifiées) |
| paysage_si | sections[it-si-data] | 10 |  |
| double_erp | sections[double-erp] | 5 | une ligne par constat |
| signaux | sections[projets-2026-2027] | 8 |  |
| achats | sections[achats-avant-d-appeler] | 9 |  |
| marche.chiffres | sections[marche] | 4 | sources et dates : section SOURCES |
| marche.details | sections[marche-lecture] | 3 |  |
| legal | sections[fiche-compte] | 6 |  |
| esn | esn | 27 | prestataires cités (observés) puis parcours de consultants (indice) ; jamais « confirmé » |
| esn.web | sections[prestataires-publics] | 6 |  |
| consultants + esn.base | charts | 3 |  |
| limites | guardrails | 7 | limites du dossier recopiées ; les notes internes de l’équipe sont écartées |
| sources.csv | sections[sources] | 12 | lien et date de consultation de chaque source |

Valeurs écartées (jamais recopiées) :
- 1 × achats : élément d’achat formulé pour l’ESN prospect : écarté (les familles d’achats restent dans les autres lignes)
- 1 × clé « contacts » : même liste que contacts_safran.csv, lu à sa place
- 1 × clé « lecture_par_voie » : notation des angles du point de vue de l’ESN prospect : sa stratégie, écartée
- 1 × clé « strategie_jems » : stratégie de vente de l’ESN prospect : écartée (décision Louis 15/10)
- 105 × contacts_safran.csv.a_valider_RGPD : note interne de l’équipe (RGPD) : pas un fait sur la personne
- 105 × contacts_safran.csv.rang : rang interne (l’ordre du fichier est conservé)
- 105 × contacts_safran.csv.score : score interne d’exploitabilité
- 105 × contacts_safran.csv.source : noms de fichiers internes
- 13 × foisonnement.priorite : priorité commerciale de l’ESN prospect : sa stratégie, écartée
- 13 × foisonnement.statut_jems : statut de l’ESN prospect dans la société (sa relation commerciale) : écarté
- 1 × limite du dossier qui est une note interne de l’équipe (RGPD, base, données internes) : non affichée
- 1 × limite du dossier qui porte sur l’ESN prospect, pas sur le compte : non affichée
- 1 × meta (titre, identifiants de base, rendez-vous de démo de l’ESN prospect) : non affiché
- 1 × meta.statut_jems : statuts de l’ESN prospect par société (sa relation, pas le compte) : écartés
- 12 × phrase qui nomme l’ESN prospect de la démo ou son interlocuteur : non affichée
- 1 × phrase qui poursuit une phrase non affichée : non affichée
- 8 × signaux.confiance : recopiée dans « ce qui est connu »
- 1 × société hors de France (Belgique) : ni entité ni site du périmètre France, gardée dans la section
