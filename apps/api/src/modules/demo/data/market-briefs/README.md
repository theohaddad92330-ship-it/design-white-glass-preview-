# Briefs de marché de la salle de démonstration

Générés par `pnpm --filter @bellum/api convert:market-brief` depuis les classeurs de `agent_docs/sources/briefs-comptes-2026-10-04/`
(`MARCHE_LILLE_MEEDZ`, `MARCHE_NANTES_SAINT_NAZAIRE`, `META_MARCHE_LYON_SUISSE`). **Ne jamais éditer à la main.** Aucune donnée
inventée : tout vient d’une cellule des classeurs ; ce que le contrat ne porte pas est listé ici avec sa raison.

## Lille et métropole (59) — `lille.json`

Périmètre : départements 59.
259 clients · 89 ESN · 453 personnes (en clair, D5) · 3 sections · 4 garde-fous.

| Onglet | Destination | Lignes | Note |
| --- | --- | ---: | --- |
| COCKPIT | kpis | 6 |  |
| COCKPIT | what_i_know | 8 |  |
| COCKPIT | charts | 4 | 42 points |
| GRILLE DE PRIX LILLE | price_grid | 14 | échantillon 231 |
| TENDANCE DES PRIX | price_trend | 4 |  |
| GALAXIE MULLIEZ | groups | 12 |  |
| CLIENTS LILLE | clients | 259 |  |
| ESN LILLE | esn | 89 |  |
| BESOINS LILLE | section | 231 |  |
| EXTERNES LILLE | people | 453 | externes en poste, en clair (D5) |
| COMPTES STRUCTURES | section | 59 |  |
| GARDE-FOUS | guardrails | 4 |  |

Écarté (jamais en silence) :

- cellule de prix : n < 3, ABSENTE (jamais affichée) — 4
- galaxie : « 0 besoin chiffré » omis (une absence ne s’affiche jamais « 0 ») — 7
- ville : « Greater Lille Metropolitan » est un libellé de métropole de la source, pas une ville — 274
- ville : « Greater Lens-Lievin » est un libellé de métropole de la source, pas une ville — 3
- ville : « Greater Valenciennes » est un libellé de métropole de la source, pas une ville — 1
- ville : « Greater Dunkerque » est un libellé de métropole de la source, pas une ville — 1
- colonne retirée [CLIENTS LILLE] E-MAILS : comptage de coordonnées renseignées : les personnes et leurs coordonnées sont dans l’onglet EXTERNES — 259
- colonne retirée [CLIENTS LILLE] MOBILES : comptage de coordonnées renseignées : les personnes et leurs coordonnées sont dans l’onglet EXTERNES — 259

## Nantes – Saint-Nazaire (44) — `nantes-saint-nazaire.json`

Périmètre : départements 44.
94 clients · 39 ESN · 107 personnes (en clair, D5) · 3 sections · 4 garde-fous.

| Onglet | Destination | Lignes | Note |
| --- | --- | ---: | --- |
| COCKPIT | kpis | 6 |  |
| COCKPIT | what_i_know | 8 |  |
| COCKPIT | charts | 3 | 25 points |
| FILIERES | calendar + section | 7 |  |
| ENTREPRISES DU BASSIN | clients | 94 |  |
| ESN ET INGENIERIES DU BASSIN | esn | 39 |  |
| COMPTES STRUCTURES | section | 30 |  |
| EXTERNES DU BASSIN | people | 107 | externes en poste, en clair (D5) |
| GARDE-FOUS | guardrails | 4 |  |

Écarté (jamais en silence) :

- ville : « Greater Nantes Metropolitan » est un libellé de métropole de la source, pas une ville — 50
- ville : « Greater Saint-Nazaire » est un libellé de métropole de la source, pas une ville — 1
- colonne retirée [ENTREPRISES DU BASSIN] E-MAILS : comptage de coordonnées renseignées : les personnes et leurs coordonnées sont dans l’onglet EXTERNES — 94
- colonne retirée [ENTREPRISES DU BASSIN] MOBILES : comptage de coordonnées renseignées : les personnes et leurs coordonnées sont dans l’onglet EXTERNES — 94

## Lyon et axe Genève (69, 01, 38, 73, 74) — `lyon-axe-geneve.json`

Périmètre : départements 69, 01, 38, 73, 74.
315 clients · 100 ESN · 375 personnes (en clair, D5) · 7 sections · 4 garde-fous.

| Onglet | Destination | Lignes | Note |
| --- | --- | ---: | --- |
| COCKPIT | kpis | 4 |  |
| COCKPIT | what_i_know | 7 |  |
| COCKPIT | charts | 5 | 51 points |
| CLIENTS LYON | clients | 315 |  |
| SECTEURS LYON | section | 7 |  |
| COMPETENCES LYON | section | 27 |  |
| ESN LYON | esn | 100 |  |
| EXTERNES LYON | people | 375 | externes en poste, en clair (D5) |
| COMPTES STRUCTURES LYON | section | 110 |  |
| BESOINS CLIENTS LYON | section | 2 | 9 ligne(s) hors zone dans besoins-clients-lyon-non-retenus |
| ANCIENS SANOFI LYON | ignoré | 0 | porté par le brief du compte Sanofi (anciens de Sanofi : union Lyon + Digital France), pas répété dans la fiche marché |
| AXE LYON-GENEVE | section | 74 |  |
| MARCHE SUISSE | ignoré | 0 | zone Suisse romande (même classeur, autre zone) |
| REGLES SUISSE | ignoré | 0 | zone Suisse romande (même classeur, autre zone) |
| CIBLES ABB SUISSE | ignoré | 0 | zone Suisse romande (même classeur, autre zone) |
| GARDE-FOUS | guardrails | 4 |  |

Écarté (jamais en silence) :

- indicateur laissé à l'autre zone du classeur partagé — 2
- rubrique laissé à l'autre zone du classeur partagé — 5
- ville : « Greater Lyon » est un libellé de métropole de la source, pas une ville — 267
- ville : « Greater Clermont-Ferrand » est un libellé de métropole de la source, pas une ville — 9
- ville : « Greater Chambery » est un libellé de métropole de la source, pas une ville — 9
- ville : « Greater Grenoble Metropolitan » est un libellé de métropole de la source, pas une ville — 17
- ville : « Greater Annecy » est un libellé de métropole de la source, pas une ville — 4
- ville : « Greater Saint-Etienne Metropolitan » est un libellé de métropole de la source, pas une ville — 1
- colonne retirée [CLIENTS LYON] E-MAILS : comptage de coordonnées renseignées : les personnes et leurs coordonnées sont dans l’onglet EXTERNES — 315
- colonne retirée [CLIENTS LYON] MOBILES : comptage de coordonnées renseignées : les personnes et leurs coordonnées sont dans l’onglet EXTERNES — 315
- colonne retirée [COMPETENCES LYON] TAUX EXTERNE : ratio DONT EXTERNES / PROFILS (colonnes voisines, qui restent) : un pourcentage lu avec « externalisation » se lit comme un fait de marché, jamais comme ce qu’on a observé (GA-259, contrôle COVERAGE_AS_MARKET) — 27
- garde-fou laissé à l'autre zone du classeur partagé — 3

## Suisse romande (GE, VD) — `suisse-romande.json`

Périmètre : cantons GE, VD.
1 clients · 0 ESN · 0 personnes (en clair, D5) · 1 sections · 5 garde-fous.

| Onglet | Destination | Lignes | Note |
| --- | --- | ---: | --- |
| COCKPIT | kpis | 2 |  |
| COCKPIT | what_i_know | 5 |  |
| COCKPIT | charts | 0 | 0 points |
| CLIENTS LYON | ignoré | 0 | zone Lyon et axe Genève (même classeur, autre zone) |
| SECTEURS LYON | ignoré | 0 | zone Lyon et axe Genève (même classeur, autre zone) |
| COMPETENCES LYON | ignoré | 0 | zone Lyon et axe Genève (même classeur, autre zone) |
| ESN LYON | ignoré | 0 | zone Lyon et axe Genève (même classeur, autre zone) |
| EXTERNES LYON | ignoré | 0 | zone Lyon et axe Genève (même classeur, autre zone) |
| COMPTES STRUCTURES LYON | ignoré | 0 | zone Lyon et axe Genève (même classeur, autre zone) |
| BESOINS CLIENTS LYON | ignoré | 0 | zone Lyon et axe Genève (même classeur, autre zone) |
| ANCIENS SANOFI LYON | ignoré | 0 | zone Lyon et axe Genève (même classeur, autre zone) |
| AXE LYON-GENEVE | ignoré | 0 | zone Lyon et axe Genève (même classeur, autre zone) |
| MARCHE SUISSE | what_i_know | 7 |  |
| REGLES SUISSE | rules | 25 |  |
| CIBLES ABB SUISSE | ignoré | 0 | les 33 cibles du compte sont déjà dans le brief du compte ABB Suisse (personnes en clair, rattachées à leur employeur) |
| GARDE-FOUS | guardrails | 5 |  |
| MARCHE SUISSE | clients | 1 | compte structuré nommé : ABB Suisse |

Écarté (jamais en silence) :

- indicateur laissé à l'autre zone du classeur partagé — 4
- rubrique laissé à l'autre zone du classeur partagé — 7
- graphique laissé à l'autre zone du classeur partagé — 5
- garde-fou laissé à l'autre zone du classeur partagé — 2
