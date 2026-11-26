# Tome 4/8 — Le second marché : ESN, territoire, partenaires

**Source** : `agent_docs/sources/tomes-md/T4.md` (1038 lignes, 20/08/2026, ORION)
**Chantier** : Accessibilité & Second Marché · tome 4 sur 8
**Branche** : `feat/tome4-second-marche`

## 0. Ce qu'il faut savoir avant de le lire

Le tome renverse la question du produit. Bellum aide une ESN à vendre à des
clients finaux ; le call de Loïc dit que c'est **une moitié du marché**. L'autre
moitié, ce sont les ESN elles-mêmes — concurrentes chez un compte, clientes sur
un territoire, fournisseuses sur une techno qu'on ne couvre pas. **Une même ESN
peut porter les trois rôles simultanément**, ce qui interdit d'en faire un type
d'objet et oblige à en faire trois relations avec le même objet.

Deux notions de « partenaire » cohabitent désormais, et les confondre serait la
faute de conception de ce tome :

| Notion                     | Question                                   | Portée        | Existant          |
| -------------------------- | ------------------------------------------ | ------------- | ----------------- |
| `account_partners`         | « qui est déjà en place CHEZ ce client ? » | un compte     | livré (tomes 1-3) |
| `esn_directory` + relation | « quelle ESN puis-je démarcher ? »         | un territoire | **ce tome**       |

## 1. Ce que le croisement a établi

| Affirmation du tome                                                            | Vérifié                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| « `territory_query` porte déjà la primitive, il ne manque rien techniquement » | **À moitié faux.** La primitive existe (`data_sources/territory_query.py`, 2 fonctions) — mais **aucune source d'offres ne rend un SIREN ni un NAF** (`france_travail.py:527` écrit `"siren": None` en toutes lettres). Le retournement NAF ne peut donc PAS se faire « en un filtre » : il exige la résolution de l'employeur, qui existe (`_resolve_groups`) |
| « le code NAF est déjà normalisé et présent dans le scoring »                  | Vrai pour les lignes de REGISTRE, faux pour les offres                                                                                                                                                                                                                                                                                                         |
| Une constante partagée de préfixes NAF ESN                                     | **N'existe pas** : trois listes privées et divergentes (`esn_candidate_ranking:42`, `entities:100`, `insee_sirene:47`)                                                                                                                                                                                                                                         |
| `esn_directory`                                                                | N'existe pas. D62 (partagé) est tranché depuis le 22/08, jamais livré                                                                                                                                                                                                                                                                                          |
| Le score de débordement                                                        | N'existe pas — aucune occurrence                                                                                                                                                                                                                                                                                                                               |
| `risk_flag` partenaire                                                         | N'existe pas. Le tome 3 a livré l'avertissement « procédure collective » côté COMPTE ; rien ne retire une ESN d'une proposition                                                                                                                                                                                                                                |
| `open_to_subcontracting`                                                       | N'existe pas. `rank2` existe, mais c'est le rang chez un client, pas l'ouverture à sous-traiter                                                                                                                                                                                                                                                                |
| Les 10 automatisations PAR-xx                                                  | **0 sur 10** dans les 33 routines                                                                                                                                                                                                                                                                                                                              |
| `partnerScore`                                                                 | Existe — **3 axes** (rang, relation, placements), pas les 5 du tome ; il répond à l'autre question                                                                                                                                                                                                                                                             |
| Firecrawl crawle un domaine                                                    | **Faux** : il scrape une liste d'URL fournie, il ne découvre aucun chemin                                                                                                                                                                                                                                                                                      |
| INSEE cherche par département × NAF                                            | **Faux** : recherche par dénomination seule. `recherche-entreprises`, elle, le sait (`activite_principale` + `departement`)                                                                                                                                                                                                                                    |

## 2. Décisions

| #        | Question                                                   | Décision                                                                                                                                                                                                         |
| -------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D62**  | `esn_directory` partagé entre espaces ?                    | **Oui** — tranché par Louis le 22/08, non livré jusqu'ici. Ce qui est partagé est l'ENTITÉ (registre, présence, recrutement) ; la RELATION reste privée à l'espace                                               |
| **D61**  | Objet partenaire distinct ?                                | **Deux objets liés par le SIREN.** `esn_directory` (l'entité, partagée) et `partner_relations` (la relation, par espace). `account_partners` ne bouge pas : il répond à une troisième question                   |
| **T4-A** | Périmètre                                                  | **Tout le tome, d'un bloc** (arbitrage Louis 23/08)                                                                                                                                                              |
| **T4-B** | Étage 5 — crawl des pages « agences »                      | **Différé, avec sa raison.** Deviner six chemins sur 477 domaines fait ~2900 requêtes majoritairement en 404, pour une donnée qu'on ne saurait pas dater. Les établissements INSEE couvrent la présence physique |
| **T4-C** | Résolution des 477 noms                                    | **En tâche de fond, par lots.** L'écran n'attend pas : il affiche ce qui est résolu et DIT combien restent                                                                                                       |
| **D83**  | Crawl général ou opt-in                                    | Sans objet tant que T4-B tient                                                                                                                                                                                   |
| **D84**  | Une ESN cliente peut-elle être proposée comme partenaire ? | **Oui**, jamais avec un angle de contournement                                                                                                                                                                   |
| **D66**  | Le score de débordement est-il montré au partenaire ?      | **Non** — jamais. Il n'apparaît sur aucune surface qu'un partenaire pourrait voir                                                                                                                                |

## 3. Lots

- **Lot A — le retournement NAF** (`BEL-DATA-003`, P0) : une constante partagée,
  `entity_type` sur les requêtes territoriales, un NAF ambigu qui apparaît des
  DEUX côtés avec son drapeau.
- **Lot B — `esn_directory`, étages 1 à 4** (`BEL-DATA-001`) : table partagée,
  477 noms semés, résolution SIREN par lots, hiérarchie inférée jamais
  confirmée, établissements INSEE.
- **Lot C — le score de débordement** (`BEL-DATA-002`) : 4 axes, non mesurable
  plutôt que zéro, `alerte` bloquante.
- **Lot D — le drapeau de risque** : `aucun · vigilance · alerte`, adossé au
  BODACC déjà branché.
- **Lot E — l'écran Territoire** (`BEL-DATA-004`) : 8 indicateurs, 5 blocs, un
  état par bloc, « ce que je ne sais pas » jamais vide.
- **Lot F — le pipeline partenaire** (`BEL-PART-001`) : 8 étapes, score à 5 axes,
  écran `/accounts/partners` à 3 onglets.
- **Lot G — `/pilotage/marche`** : la vue dirigeant.
- **Lot H — les automatisations PAR-xx** : celles que le dépôt sait réellement
  déclencher, et seulement celles-là.

## 4. Ce qu'on ne promet pas

- **Les agences déclarées** (étage 5) — T4-B ci-dessus.
- **Le domaine vérifié** (étage 3) : le registre ne publie aucun site web. Le
  champ existe et reste `unverified` tant qu'une source ne l'établit pas ; un
  domaine non vérifié n'est JAMAIS affiché comme le site officiel.
- **La baseline de recrutement sur 4 trimestres** : personne n'a d'historique le
  premier jour. La règle du tome s'applique telle quelle (axe Volume non
  mesurable, score sur 65) et l'historique se constitue à mesure.
- **Le score de débordement montré au partenaire** (D66).
- **PAR-07 et PAR-08** : ils supposent des placements passés par un partenaire,
  que rien n'enregistre encore.
- **Les 7 lignes SII** : le fichier livré en porte **six** (SII, Atlantique, Est,
  Nord, Sud-Ouest, Group International). Le test de référence porte sur ce qui
  existe, pas sur le chiffre du tome.

## 5. État de livraison

| Lot | Contenu                                                                                                                                                      | État                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| A   | Retournement NAF : `esn_naf.py` (constante partagée, tri-état), `entityType` sur `/discover/signals`, `nafAmbiguous` sur le candidat, sélecteur dans le rail | livré                                  |
| B   | `esn_directory` partagée (migration `1789995471028`), 477 noms semés, résolution par lots réservés, hiérarchie inférée, `POST /esn/resolve`                  | livré                                  |
| C   | `overflowScore` — 4 axes, non mesurable plutôt que zéro, posé sur les ESN du territoire par le contrôleur                                                    | livré                                  |
| D   | `esnRisk` — `aucun · vigilance · alerte`, `alerte` RETIRE avec sa raison                                                                                     | livré                                  |
| E   | `/territory/overview` (5 blocs, un état chacun) + écran `/discover/territoire`                                                                               | livré                                  |
| F   | `partner_relations` (migration `1789995612094`), 8 étapes, score à 5 axes, écran `/accounts/partners` à 3 onglets                                            | livré                                  |
| G   | `/pilotage/marche`                                                                                                                                           | **non livré** — voir ci-dessous        |
| H   | Les 10 automatisations PAR-xx                                                                                                                                | **une seule livrée** — voir ci-dessous |

## 7. Ce qui n'est PAS livré dans cette passe, et pourquoi

- **`/pilotage/marche`** (lot G) : la vue dirigeant agrège des territoires
  SUIVIS, or rien n'enregistre encore qu'un espace suit un territoire. La livrer
  aujourd'hui produirait un écran vide dont personne ne saurait quoi faire —
  exactement le « livré mais jamais rempli » que ce dépôt corrige depuis trois
  chantiers. Elle vient avec « suivre ce territoire ».
- **Les automatisations PAR-01 à PAR-10** sauf le remplissage du référentiel :
  elles supposent presque toutes une donnée qui n'existe pas encore — la
  BASELINE de recrutement (PAR-01, PAR-03), des placements passés par un
  partenaire (PAR-07, PAR-08), ou une détection d'annonce presse (PAR-08). Une
  routine qui ne peut jamais se déclencher est une case à cocher qui ment.
  Ce qui TOURNE : le remplissage horaire du référentiel (`@Cron` dans
  `EsnDirectoryService`, kill-switch `ESN_DIRECTORY_REFRESH_DISABLED`).
- **Étage 4 — les établissements INSEE** : `insee_sirene.sites_for_siren` sait
  les lire, mais exige `INSEE_API_KEY`. Le champ existe et reste vide sans clé,
  plutôt que d'être rempli par une approximation.
- **La baseline de recrutement** : elle se constituera à mesure que les
  territoires seront consultés. En attendant, l'axe Volume du débordement sort
  du dénominateur — la règle 2 du §19.1, appliquée telle quelle.

## 8. Deux défauts trouvés en croisant, que le tome ne demandait pas

- **La garde anti-fuite de la démonstration était borgne deux fois.** Elle lisait
  le premier `name: '…'` du fichier — c'est-à-dire le nom d'une COLONNE dès
  qu'une entité commence par `@Column({ name: 'workspace_id' })` — et elle
  cherchait `workspace_id` jusque dans les COMMENTAIRES, si bien qu'une entité
  qui EXPLIQUE ne pas en avoir était réclamée au classement. `@Entity('…')` fait
  foi désormais, et les commentaires sont retirés avant l'examen.
- **Deux routes d'écriture ne déclaraient aucune permission** : attribuer un
  compte (`PATCH /accounts/:id/assign`) et cocher une action de plan
  (`PATCH /plan-items/:id`). Les deux MODIFIENT une fiche ; un `viewer` pouvait
  les appeler. Elles portent maintenant `records:write`, et GA-05 est passée de
  377 à 377 malgré deux routes de lecture ajoutées.

## 9. État de livraison

| Lot | Commit | Mergé | Vérifié en live |
| --- | ------ | ----- | --------------- |

| Lot | Contenu | Commit     | Mergé | Vérifié en live                                                                                                                                                        |
| --- | ------- | ---------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-F | Tous    | `b6938073` | ✅    | ✅ recette 23/08 : Territoire lit un département réel (100 offres, technos, ESN reconnues) ; un défaut corrigé — le registre était interrogé avec un préfixe NAF (400) |
