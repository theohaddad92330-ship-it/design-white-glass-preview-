# Tome 1/8 — Le pivot d'accessibilité — 20 août 2026

Source : `agent_docs/sources/tome1-pivot-accessibilite-2026-08-20.pdf` (23 pages,
lues intégralement le 22/08/2026). Auteur ORION. Origine : call bêta du 20/08 avec
**Loïc** (ESN en création, 0 à 2 consultants) + une note stratégique tierce.

Premier document d'une série de **8 tomes** (174 pages), **tous reçus le 22/08**
avec leurs sources Markdown et deux CSV. Il déclare ne pas contenir : le modèle de
barrière d'achat (tome 3), le référentiel ESN (tome 4), Laura (tome 6), les tickets
(tome 8).

**Arbitrage de Louis du 22/08 : tome par tome, validation entre chaque.** Ce tracker
couvre le tome 1 ; chaque tome suivant aura le sien.

### Les deux CSV livrés — ce qu'ils sont vraiment

- **`esn-referentiel-v0.csv`** — 477 ESN (pas 700), colonnes
  `nom;nom_normalise;domaine_hypothese;sources;confiance_domaine;a_verifier`.
  **Aucune entrée n'a de SIREN, de ville, d'effectif, de date, ni d'ouverture à la
  sous-traitance.** Le domaine est « faible (dérivé du nom) » pour 302 entrées et
  « absent » pour 175 — donc **zéro domaine vérifié**, et `a_verifier = oui` pour
  toutes celles qui en ont un. La « source » est le fichier d'origine (`pdf`/`xlsx`),
  pas une source au sens du produit. Le tome 8 le dit lui-même : « 477 noms d'ESN,
  sans SIREN, sans ville, sans effectif, sans agences. **Inexploitable en l'état.**
  Les domaines fournis sont à 93 % devinés. »
  ⇒ Le §9.3 du tome 1 (« chaque entrée porte sa date, sa source et son niveau de
  certitude ») décrit ce que le fichier DEVRAIT être, pas ce qu'il EST. Importer
  `domaine_hypothese` comme domaine officiel présenterait une inférence comme un
  fait — ce que le tome interdit lui-même au §21.5.
  ⇒ La constitution du référentiel est **`BEL-DATA-001`, sujet du tome 4**, pas du
  tome 1. Le lot 11 sort donc du périmètre de ce tracker.
- **`comptes-adressables-v0.csv`** — 281 comptes déjà scorés par le modèle du tome 3
  (`barriere_achat`, `accessibilite`, `classe` A/B/C/D, `libelle`). Répartition :
  188 A « Ouvert probable », 37 B « Ouvert par une entité », 29 C « Semi-ouvert »,
  27 D « Verrouillage probable ».
  ⇒ **Jeu de validation du scoreur, jamais un import de scores.** On reproduit la
  formule (tome 3 §4.3), on ne recopie pas ses résultats.

## 0. Ce qu'il faut savoir avant de le lire

Le tome pose une thèse produit : Bellum classe les comptes par **intérêt**, il doit
les classer par **intérêt × accessibilité pour cette ESN-là**. La phrase du bêta
testeur qui la résume : « il vaut mieux avoir quatre besoins sans savoir qui est
derrière que 10 000 contacts chez BNP, parce que tu sais que la porte est
complètement verrouillée. »

Comme les PDF 1 à 10, ses marqueurs `[Confirmé — repo]` demandent vérification.
Trois sont faux, un est faux dans le sens le plus coûteux (§1.2 ci-dessous).

Le document est en revanche **exact au numéro de ligne près** sur son point central
— les 20 points d'accessibilité jamais calculés — et sur le diagnostic `esnPresence`.

---

## 1. Ce que le croisement a établi

### 1.1 Le point central du tome est vrai, et c'est le moins cher à corriger

`apps/ia/app/services/discover_scoring.py` réserve **20 points sur 100** à
l'accessibilité (`_MAX_ACCESSIBILITY = 20`, l.112 ; `_BLOCK_MAXIMA`, l.634) et ne les
calcule **jamais** : `"accessibility": False` est écrit en dur l.781, avec sa raison
(« non mesurable au stade registre : on ne connaît aucun interlocuteur »).

L'invariant « non mesuré ≠ mesuré à zéro » est **déjà** implémenté (l.784-786 :
`unmeasured` sort du dénominateur, `score` vaut `None` si plus rien n'est mesurable).
Il n'y a donc rien à casser — il y a un bloc à remplir. Les 8 plafonds annoncés par
le PDF correspondent tous aux constantes réelles, et un test verrouille déjà la
somme à 100 (`test_discover_scoring.py:416`).

### 1.2 Trois marqueurs `[Confirmé — repo]` sont faux

| Ce que le tome affirme                                                                | Réalité                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §4 — « objet `Partner`, spécifié au PDF 9 sous `BEL-R2R1-001`, **jamais construit** » | **Construit le 19/08** par le PDF 2 (décision D11), sur 4 couches : `packages/contracts/src/schemas/partner.ts`, table `account_partners` (migration `1789554387190`), module `apps/api/src/modules/partners/`, onglet `TabPartners.tsx`. `partnerScore` a un appelant réel (`partners.service.ts:51`). **Le ticket `BEL-R2R1-001` n'existe nulle part** — zéro occurrence de `R2R1` dans le dépôt ; le PDF 9 ne contient pas le mot « partenaire ». |
| §7.1 — « le mode `filiale_bu` est **entièrement modélisé** »                          | Zéro occurrence de `filiale_bu`. Ce qui existe : `ACCOUNT_ENTITY_KINDS = ['bu','subsidiary','division','unknown']` et les tables `account_entities` / `sites`. Ce n'est pas un **mode d'accès**. `itAutonomy` vit dans `raw_analysis`, pas en colonne. Le score d'entité existe en Python (`prioritization.py:160`) et n'est **pas persisté**. « Viser la filiale plutôt que le siège » n'existe que comme consigne de prompt.                       |
| §14/§20 — « consommation produit : **AUCUNE** »                                       | Vrai **au mot** (zéro occurrence de `esnPresence` dans `apps/web`), trompeur au fond : le contenu atteint l'écran indirectement via `account_vocabulary.py:183-191`, qui en fabrique le `commercialWhy` des termes `internal_competitor` rendus par `AccountVocabularySection.tsx`. La phrase « Soit le concurrencer, soit le solliciter en rang 2 » est **déjà à l'écran**. C'est la LISTE NOMMÉE qui manque, pas la surface.                       |

### 1.3 Cinq défauts trouvés en croisant, qu'aucun tome ne demande

Tous de la famille que ce dépôt connaît : un producteur et un lecteur qui ne se
rencontrent pas.

1. **`account_partners.source = 'analysis'` n'est jamais écrit.** La valeur est dans
   la contrainte CHECK (`1789554387190:39`), dans le zod (`partner.ts:37`), et
   `TabPartners.tsx:122` **affiche déjà un badge « détecté »** pour elle, avec son
   commentaire. `partners.service.ts:97` n'écrit que `'declared'`. L'écran est prêt,
   il manque le producteur — image miroir exacte du « chemin d'écriture non branché ».

2. **Le barème du web a deux versions de retard.**
   `apps/web/src/features/discover/lib/discover-score.ts:13-22` porte encore 5 blocs
   (30/20/20/25/5) quand le backend en a 8. Le rattachement d'un facteur à son bloc
   se fait **par mots-clés du libellé** (`BLOCK_TERMS`, l.32-38) — le commentaire du
   fichier dit pourquoi : « le contrat ne transporte pas le bloc d'origine ». Résultat :
   `it_surface`, `accessibility` et `evidence` tombent tous dans `other`.
   **Remplir le bloc accessibilité l'afficherait dans « divers ».** Corollaires : le
   docstring de `discover_scoring.py:34-48` affiche l'ancien barème, et l'i18n
   `fr/discover.json:297` dit « 3 des 5 critères » quand le code en exige 4 sur 8.

3. **L'onglet Sites ne lit pas la table Sites.** `account_entities` et `sites` sont en
   base et servis par `account-entities.controller.ts:47,55,65,75` — **aucun appelant
   dans `apps/web`**. `TabSites.tsx:27,46` lit `raw_analysis.sites_france`, et les
   contacts se regroupent encore sur le libellé libre `contact.entity`
   (`contactGrouping.ts:14,53`) alors que `contacts.entity_id` existe.

4. **Le journal des exclusions n'a aucun écran.** `decision_gate_crossings` et
   `GET /decision-gates` ont été livrés le 22/08 : zéro consommateur web. Aucun écran
   « comptes écartés » (pas de filtre `priority_gate` dans la liste). `includeExcluded`
   existe au contrat (`contact.ts:456`) et au service (`contacts.service.ts:879`) et
   **aucun composant web ne le passe** : on ne voit un contact exclu qu'en ouvrant sa fiche.

5. **Une lecture morte.** `account_vocabulary.py:190` lit `pres.get("sourceRefs")` ;
   `build_esn_presence` ne pose jamais ce champ ⇒ toujours `None` depuis le 06/07.

### 1.4 Ce qui de-risque le chantier

- **La certitude à 3 niveaux existe déjà** sur le champ frère : `esnSynergies` porte
  `certainty: forte|moyenne|faible` (`bellum_signals.py:132`). `esnPresence` porte
  `presence: confirmée|probable`. Réutiliser le vocabulaire du frère, ne pas en
  inventer un troisième.
- **La correction humaine qui survit à une réanalyse est un mécanisme livré** :
  `FIELD_SOURCES = ['human','connector','pipeline','model']` avec `human:4 > pipeline:2`
  (`provenance.ts:32`) et `decideFieldWrite` (`:123`). Le point 5 de BEL-ACC-004 se
  réutilise, il ne se réécrit pas.
- **La maturité déclarée existe** : `consultants_on_mission` avec les paliers
  `'0','1-5','6-15',…` (`profile-questionnaire.ts:112,318`). C'est l'entrée du tri par
  défaut (§8.3) et de la profondeur adaptée (§13.5, D57).
- **`scope` est déjà lu** par `build_esn_presence` (`esn_presence.py:91`) et jamais
  émis : le rendre coûte une ligne.
- **Le projet porte déjà les 11 colonnes** annoncées au §4 (table physique
  `opportunities`, entité `ProjectEntity`), 9 stades dont `detected` par défaut.
  Les 3 champs du §4 sont des ajouts additifs.

### 1.5 La limite dure : DECP ne donne pas l'échéance

`apps/ia/app/services/data_sources/decp.py` extrait le **titulaire** (`_winner`, l.141),
l'**acheteur**, le **montant** (l.311) et la **date de notification** (l.295-298).
**Aucun champ de durée n'est extrait** (`dureeMois` : grep vide).

Conséquence : A1 « verrouillé » est calculable dès aujourd'hui ; l'**échéance**
(« panel fermé jusqu'en 2027 », l'alerte T-9 mois de U12, la demi-vie « durée du
marché + 3 mois » du §10.3) ne l'est **pas** sans ajouter ce champ. L'ajout est
additif sur le même appel réseau — mais le fichier signale déjà qu'un champ attendu
renvoie « Unknown field » (l.347), donc **à vérifier sur données réelles avant de
promettre l'échéance à l'écran**.

---

## 2. Inventaire

Statuts : `LIVRÉ` (preuve `fichier:ligne`) · `PARTIEL` · `ABSENT` · `PÉRIMÉ`
(tranché autrement depuis) · `REFUS` (contredit une règle permanente) · `DÉCISION`.

### 2.1 Le call et le pivot (items 1-22, p.1-3)

| #   | p.  | Exigence                                                                                         | Statut  | Preuve / raison                                                                                            |
| --- | --- | ------------------------------------------------------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------- |
| 1   | 1   | Profil : ESN en création, 0-2 consultants, abonnement conditionnel                               | —       | contexte, pas une exigence                                                                                 |
| 2   | 1   | Découvrir des comptes sans partir d'un nom                                                       | LIVRÉ   | `apps/web/src/routes/discover/index.tsx:9` — 10 filtres, 4 tris                                            |
| 3   | 1   | Notion d'accessibilité réelle                                                                    | ABSENT  | bloc réservé jamais calculé, `discover_scoring.py:781`                                                     |
| 4   | 1   | Les ESN déjà en place sur un compte                                                              | PARTIEL | données `esn_presence.py:76` + table `account_partners` ; jamais reliées                                   |
| 5   | 1   | Les ESN comme canal d'acquisition                                                                | ABSENT  | `account_partners` est un lien PAR COMPTE, pas un pipeline                                                 |
| 6   | 1   | Les contacts commerciaux de ces ESN                                                              | ABSENT  | aucun objet ESN portant des interlocuteurs                                                                 |
| 7   | 2   | Des besoins, pas des contacts                                                                    | PARTIEL | `project_needs` existe (besoins INTERNES chez clients) ; pas de besoins de marché                          |
| 8   | 2   | Non-dit 1 — réseau dormant                                                                       | ABSENT  | couche zéro rend une CHAÎNE, jamais des candidats (`zero-layer.service.ts:63`)                             |
| 9   | 2   | Non-dit 2 — un « non » a une durée de vie                                                        | ABSENT  | aucune colonne de date de réexamen                                                                         |
| 10  | 2   | Non-dit 3 — l'accessibilité a un prix                                                            | ABSENT  | aucun `access_cost`                                                                                        |
| 11  | 2   | Non-dit 4 — le portage est un mode d'accès                                                       | PARTIEL | `portage` existe comme mode d'ENGAGEMENT d'un consultant (`consultant.ts:50`), pas d'accès à un compte     |
| 12  | 2   | Non-dit 5 — onboarding par situation                                                             | ABSENT  | checklist d'ACTIVATION à 5 jalons (`onboarding.ts:417`), pas de situation                                  |
| 13  | 2   | Non-dit 6 — organigramme servi à une ESN de 2 personnes                                          | ABSENT  | `TabOrganigramme.tsx` : aucun repli, aucune lecture de la taille                                           |
| 14  | 2   | Non-dit 7 — contribution au revenu / churn                                                       | ABSENT  | aucun bloc, et le jeton d'attribution est perdu (défaut n°6)                                               |
| 15  | 2   | La phrase pivot : porte ouverte PUIS comprendre                                                  | —       | thèse, portée par les items 16-21                                                                          |
| 16  | 2   | Classer par intérêt × accessibilité                                                              | ABSENT  | 4 tris existants (`discover-ranking.ts:16`), aucun sur l'accès                                             |
| 17  | 2   | « signaux ET tu peux y entrer »                                                                  | ABSENT  | —                                                                                                          |
| 18  | 2   | Sept portes dont cinq indirectes                                                                 | ABSENT  | aucun `access_mode`                                                                                        |
| 19  | 2   | Le graphe d'accès dit comment on rentre                                                          | ABSENT  | aucun `access_path`                                                                                        |
| 20  | 2   | Un partenaire est aussi un client                                                                | PARTIEL | `PARTNER_RELATIONSHIPS = partner                                                                           | competitor | unknown` (`partner.ts:23`) — pas « client » |
| 21  | 2   | Le score mesure le fit ET le chemin                                                              | ABSENT  | —                                                                                                          |
| 22  | 3   | Invariants conservés (Projet pivot, provenance, zéro invention, zéro scraping, zéro probabilité) | LIVRÉ   | `project.ts:16`, `provenance.ts:32`, `CLAUDE.md:79`, `CLAUDE.md:192`, arbitrage n°4 (`crm-ats-plan.md:16`) |

### 2.2 Le challenge de la note (items 23-37, p.3-4)

| #   | p.  | Exigence                                       | Statut   | Preuve / raison                                                                          |
| --- | --- | ---------------------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| 23  | 3   | Les 4 questions structurantes                  | —        | cadre de lecture                                                                         |
| 24  | 3   | Taxonomie des signaux                          | LIVRÉ    | `data_sources/{decp,public_tenders,france_travail,apec,bodacc}.py`                       |
| 25  | 3   | Règle « job ≠ opportunity »                    | LIVRÉ    | `opportunities.stage` défaut `detected` (`ProjectPivot.ts:82`)                           |
| 26  | 3   | Refus du scraping LinkedIn                     | LIVRÉ    | `CLAUDE.md:192` — règle permanente                                                       |
| 27  | 3   | Page « Why now » avec « ce qu'on ne sait pas » | PARTIEL  | `unmeasured` existe au barème ; pas de bloc « ce qu'on ne sait pas » à l'écran Découvrir |
| 28  | 3   | Reverse matching CV → entreprises à signaux    | ABSENT   | `run_matching` porte le vivier ↔ besoin interne (`chat_tools.py:561`)                    |
| 29  | 3   | REFUS objet Opportunity distinct (D52)         | PÉRIMÉ   | déjà tranché : le pivot Projet est fait (`1789344812907-ProjectPivot.ts`) — rien à faire |
| 30  | 3   | REFUS probabilité 87 % → faisceau (D53)        | PÉRIMÉ   | arbitrage n°4 du 16/08, 5 refus consécutifs (`CLAUDE.md:413`) — rien à faire             |
| 31  | 4   | REFUS Business Radar 10ᵉ entrée (D54)          | PÉRIMÉ   | garde `sections.test.ts:31` `toHaveLength(9)` — rien à faire                             |
| 32  | 4   | Attribution des marchés PRIVÉS = inférence     | ABSENT   | à porter dans le contrat de `access_lock`                                                |
| 33  | 4   | MANQUE — accessibilité ≠ opportunité           | ABSENT   | c'est le chantier                                                                        |
| 34  | 4   | MANQUE — le partenaire est un client           | ABSENT   | pipeline partenaire (D56)                                                                |
| 35  | 4   | MANQUE — péremption de la donnée d'accès       | ABSENT   | aucune demi-vie nulle part                                                               |
| 36  | 4   | MANQUE — donnée communautaire                  | DÉCISION | D51 — touche les CGU                                                                     |
| 37  | 4   | MANQUE — lien avec le churn                    | ABSENT   | §12                                                                                      |

### 2.3 L'objet et le barème (items 38-44, p.4-5)

| #   | p.  | Exigence                                             | Statut | Preuve / raison                                                                                                   |
| --- | --- | ---------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| 38  | 4   | `access_mode` enum                                   | ABSENT | —                                                                                                                 |
| 39  | 4   | `access_path` jsonb                                  | ABSENT | ⚠️ `access_path` existe DÉJÀ comme clé de bloc de briefing (`account-briefing.ts:36`) — collision de nom à éviter |
| 40  | 4   | `addressability` jsonb                               | ABSENT | —                                                                                                                 |
| 41  | 4   | « objet Partner, jamais construit »                  | LIVRÉ  | **le PDF se trompe** — `partner.ts`, `account_partners`, module, onglet (19/08, D11)                              |
| 42  | 5   | Non-régression : aucune migration ne promeut un état | LIVRÉ  | `ProjectPivot.ts:65,70` reporte `nouveau→detected` uniquement                                                     |
| 43  | 5   | 8 blocs, somme 100                                   | LIVRÉ  | `discover_scoring.py:627-636` + `test_discover_scoring.py:416`                                                    |
| 44  | 5   | Les 20 points jamais calculés                        | ABSENT | `discover_scoring.py:781` — **le cœur du chantier**                                                               |

### 2.4 Le score d'adressabilité (items 45-53, p.5-6)

| #   | p.  | Exigence                                        | Statut  | Preuve / raison                                                                                                         |
| --- | --- | ----------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------- |
| 45  | 5   | 20 pts sur 5 axes, axe sans donnée = unmeasured | PARTIEL | l'invariant existe (`:784-786`), les axes non                                                                           |
| 46  | 5   | A1 Verrouillage 6 pts                           | ABSENT  | source DECP disponible (`decp.py:141` titulaire)                                                                        |
| 47  | 6   | A1 : 4 états + libellés d'écran                 | PARTIEL | `rank1_incumbent` (`yes                                                                                                 | no  | unknown`) au niveau ENTITÉ (`account-entity.ts:34`) — 3 états, déclaratif |
| 48  | 6   | A2 Proportion 5 pts, table effectif × ESN       | ABSENT  | effectif compte ✅ (`headcountRange`), taille ESN ✅ (`esn_stage.py:25`)                                                |
| 49  | 6   | A3 Chemin connu 5 pts                           | ABSENT  | dépend de l'item 39                                                                                                     |
| 50  | 6   | A4 Relation existante 3 pts                     | ABSENT  | couche zéro rend une chaîne, pas un booléen exploitable                                                                 |
| 51  | 6   | A5 Coût d'accès 1 pt, DÉCLARATIF                | ABSENT  | D60 — jamais estimé                                                                                                     |
| 52  | 6   | Coûts typiques (0 / ~3 % / 10-20 % / 50 €/j)    | —       | valeurs d'exemple du PDF, jamais à coder en dur                                                                         |
| 53  | 6   | Rendu : deux nombres jamais fondus              | ABSENT  | ⚠️ le retour actuel porte UN score (`discover_scoring.py:788-796`) — remplir le bloc sans séparer FUSIONNERAIT les deux |

### 2.5 Graphe d'accès et Découvrir (items 54-61, p.7-8)

| #   | p.  | Exigence                                                        | Statut  | Preuve / raison                                                                                                                  |
| --- | --- | --------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 54  | 7   | Les 7 modes d'entrée                                            | ABSENT  | —                                                                                                                                |
| 55  | 7   | Mode 3 « entièrement modélisé », à recommander quand A2 est bas | PARTIEL | **le PDF se trompe sur « modélisé »** ; en plus l'onglet Sites ne lit pas la table (défaut n°3)                                  |
| 56  | 7   | Mode 7 — couche zéro comme source de découverte                 | ABSENT  | `describeInternalHistory` rend `string`                                                                                          |
| 57  | 7   | Route /discover inchangée, nav inchangée                        | LIVRÉ   | 9 entrées, garde de test                                                                                                         |
| 58  | 7   | 3 modes Comptes / Partenaires / Besoins                         | ABSENT  | ⚠️ le PDF croit que « Comptes » existe : il n'y a **plus de sélecteur de mode**, il est DÉDUIT (`discover-filters.ts:120`)       |
| 59  | 7   | 5 filtres d'accès                                               | ABSENT  | 10 filtres existants, aucun sur l'accès                                                                                          |
| 60  | 8   | 3 tris, défaut déduit de la maturité                            | ABSENT  | ⚠️ le palier le plus fin de l'accueil est `1-10` (`questions.ts:97`) : « moins de 5 » n'est PAS dérivable — utiliser `esn_stage` |
| 61  | 8   | 4 familles, la 4ᵉ affichée avec sa raison                       | ABSENT  | D59                                                                                                                              |

### 2.6 Le canal partenaire (items 62-67, p.8-9)

| #   | p.  | Exigence                                        | Statut  | Preuve / raison                                                                                            |
| --- | --- | ----------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| 62  | 8   | 4 `relation_kind` sur Partner                   | PARTIEL | `PARTNER_RANKS` + `PARTNER_RELATIONSHIPS` couvrent le rang et la posture, pas le SENS de la sous-traitance |
| 63  | 8   | Pipeline commercial partenaire complet          | ABSENT  | D56                                                                                                        |
| 64  | 8   | Découvrir > Partenaires, 6 critères             | ABSENT  | dépend de la base 700 ESN pour « ouverture déclarée »                                                      |
| 65  | 9   | Retourner la lecture des données de recrutement | ABSENT  | `list_hiring_companies` existe (`france_travail.py:442`) — il faut le lire « cette ESN manque de bras »    |
| 66  | 9   | La base des ~700 ESN de Théo                    | BLOQUÉ  | **fichier non fourni** — D55                                                                               |
| 67  | 9   | Fiche partenaire vue « client »                 | ABSENT  | marge déjà gated `finance:read` ailleurs, à réutiliser                                                     |

### 2.7 Sources, fraîcheur, moat (items 68-74, p.9-10)

| #   | p.  | Exigence                                                               | Statut   | Preuve / raison                                                                                                                     |
| --- | --- | ---------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 68  | 9   | 6 sources déjà branchées                                               | LIVRÉ    | `data_sources/*.py` + registre                                                                                                      |
| 69  | 9   | DECP sous-exploitée, donnée de verrouillage                            | PARTIEL  | titulaire/acheteur/montant/date ✅ — **`dureeMois` jamais extrait**                                                                 |
| 70  | 10  | 4 manques (référencement privé, ouverture ESN, contact BM, commission) | ABSENT   | —                                                                                                                                   |
| 71  | 10  | Demi-vies par type de donnée                                           | ABSENT   | ⚠️ des fenêtres de fraîcheur par TYPE existent pour les SIGNAUX (`signal_freshness.py`, D50) — modèle à réutiliser, sujet différent |
| 72  | 10  | Une donnée périmée redevient `inconnu`, datée                          | ABSENT   | —                                                                                                                                   |
| 73  | 10  | Ce qui remonte / ce qui ne remonte jamais                              | DÉCISION | D51                                                                                                                                 |
| 74  | 10  | Opt-in / seuil 3 espaces / réciprocité                                 | DÉCISION | D51 — conditionne les CGU                                                                                                           |

### 2.8 Les 40 use cases (items 75-81, p.10-12 et 18-21)

Couverture réelle mesurée contre le dépôt — le PDF annonce 3 couverts / 7 partiels / 30 absents.

| Famille                  | Cas    | LIVRÉ                                       | PARTIEL                                                      | ABSENT | Note                                                                                             |
| ------------------------ | ------ | ------------------------------------------- | ------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------ |
| Découverte (U01-U08)     | 8      | 1 (U01)                                     | 3 (U02, U06, U07)                                            | 4      | U08 : la donnée existe (`decision_gate_crossings`, `parkedReason`), **aucun écran** (défaut n°4) |
| Accessibilité (U09-U15)  | 7      | 0                                           | 0                                                            | 7      | la famille entière                                                                               |
| Partenaire (U16-U24)     | 9      | 0                                           | 1 (U17 — données présentes, jamais reliées)                  | 8      | dépend de D55 et D56                                                                             |
| Réseau dormant (U25-U30) | 6      | 0                                           | 1 (U27 — badge RISQUE livré, moitié « opportunité » absente) | 5      | —                                                                                                |
| Péremption (U31-U34)     | 4      | 1 (U34 — `excluded_at`, séquences annulées) | 0                                                            | 3      | aucune cadence                                                                                   |
| Besoins (U35-U40)        | 6      | 0                                           | 2 (U36, U38)                                                 | 4      | —                                                                                                |
| **Total**                | **40** | **2**                                       | **7**                                                        | **31** | proche de l'annonce du PDF                                                                       |

### 2.9 Écrans, tickets et décisions (items 82-130, p.12-23)

| #       | p.  | Exigence                                                    | Statut   | Preuve / raison                                                                                                                                                 |
| ------- | --- | ----------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------- |
| 82      | 12  | Bloc contribution au revenu                                 | ABSENT   | ⚠️ **défaut n°6** — le jeton `discover:<siren>` part dans `POST /analysis/start` (`discover-analyze.ts:60`) et `suggestion_id` n'existe nulle part côté serveur |
| 83      | 12  | Jamais « Bellum vous a fait gagner X € »                    | —        | règle à respecter                                                                                                                                               |
| 84-94   | 12  | BEL-ACC-001 à 011                                           | —        | voir §4 (lots)                                                                                                                                                  |
| 95      | 13  | Profondeur adaptée à la taille (D57)                        | ABSENT   | 12 onglets fixes ; seul masquage existant fondé sur le CONTENU (`AccountDetail.tsx:30`)                                                                         |
| 96      | 13  | Onboarding par situation (5 parcours)                       | ABSENT   | questionnaire livré, checklist d'activation livrée, choix de situation non                                                                                      |
| 97      | 13  | Diagnostic esnPresence                                      | LIVRÉ    | exact au numéro de ligne près ; **sauf** « consommation produit AUCUNE » (voir §1.2)                                                                            |
| 98      | 14  | Typer esnPresence (6 champs)                                | ABSENT   | `certainty` : réutiliser `forte                                                                                                                                 | moyenne    | faible` d'`esnSynergies` (`bellum_signals.py:132`) ; `scope`déjà lu, jamais émis ;`detectedAt` : la date du run |
| 99      | 14  | API : exposer, trier par certitude puis nom                 | ABSENT   | —                                                                                                                                                               |
| 100     | 14  | Web : bloc ESN présentes, 2 actions/ligne                   | DÉCISION | où ? onglet Accès neuf ou onglet Partenaires existant                                                                                                           |
| 101     | 14  | Empty state, texte exact                                    | ABSENT   | —                                                                                                                                                               |
| 102     | 14  | Correction utilisateur, provenance `human`                  | PARTIEL  | mécanisme livré (`provenance.ts:123` `decideFieldWrite`) — à brancher, pas à écrire                                                                             |
| 103     | 14  | i18n FR+EN + démo (2 ESN dont 1 faible)                     | DÉCISION | ⚠️ `demo-coverage.ts:192` interdit de nommer une ESN chez un compte réel, avec sa raison → seeder sur un compte FICTIF                                          |
| 104     | 23  | 5 critères, 5 tests, 4 interdits                            | —        | à reprendre tels quels                                                                                                                                          |
| 105     | 15  | BEL-ACC-002 détaillé (5 facteurs, 5 prédicats, T1-T7)       | ABSENT   | ⚠️ prérequis : faire voyager la clé de bloc (défaut n°2)                                                                                                        |
| 106     | 15  | Aucun champ `probability` dans la réponse                   | LIVRÉ    | aucun aujourd'hui                                                                                                                                               |
| 107     | 15  | Chaque info d'accès porte source ET date                    | ABSENT   | —                                                                                                                                                               |
| 108     | 15  | Une ESN peut être concurrent ET client                      | PARTIEL  | `relationship` est aujourd'hui EXCLUSIF (`partner                                                                                                               | competitor | unknown`)                                                                                                       |
| 109     | 16  | BEL-ACC-007 double traitement                               | PARTIEL  | badge RISQUE livré (`contact-score.ts:222`), routine notifie et **ne crée rien**                                                                                |
| 110     | 16  | BEL-ACC-012 réseau dormant relu, jamais collecté            | ABSENT   | —                                                                                                                                                               |
| 111     | 16  | BEL-ACC-013 cadence de réexamen                             | ABSENT   | 4 catalogues de motifs existent ; « pas intéressé » et « ne plus me contacter » n'y sont pas                                                                    |
| 112     | 16  | 4 familles de requêtes en plus                              | PARTIEL  | `/chat/commandes` livré, 24 commandes, 7 familles (`command-catalog.ts:32`)                                                                                     |
| 113     | 16  | Requêtes contextuelles par ÉCRAN                            | ABSENT   | ⚠️ le PDF affirme que le PDF 6 le pose déjà — **faux** : les 19 suggestions sont scopées au COMPTE (`Chat.tsx:1777`), jamais à l'écran                          |
| 114     | 17  | D51 donnée communautaire                                    | DÉCISION | —                                                                                                                                                               |
| 115-117 | 17  | D52 / D53 / D54                                             | PÉRIMÉ   | déjà tranchés dans le même sens                                                                                                                                 |
| 118     | 17  | D55 import base 700 ESN                                     | BLOQUÉ   | fichier non fourni                                                                                                                                              |
| 119     | 17  | D56 pipeline partenaire distinct                            | DÉCISION | —                                                                                                                                                               |
| 120     | 17  | D57 profondeur adaptée                                      | DÉCISION | —                                                                                                                                                               |
| 121     | 17  | D58 bloc contribution                                       | DÉCISION | —                                                                                                                                                               |
| 122     | 17  | D59 hors de portée affiché                                  | —        | reco du PDF conforme aux règles du dépôt : affiché                                                                                                              |
| 123     | 17  | D60 coût d'accès déclaratif                                 | —        | conforme à « jamais de valeur inventée »                                                                                                                        |
| 124     | 17  | Ordre d'attaque 004 → 002 → 001 → 003 → 007 → 006 → 012/013 | —        | voir §4                                                                                                                                                         |
| 125     | 18  | U03 écran `/discover/territoire`                            | ABSENT   | ⚠️ une route neuve — la règle des 9 entrées vise la NAV, un sous-écran de /discover ne l'enfreint pas                                                           |
| 126     | 18  | U04 score d'entité (BEL-ADR-003)                            | PARTIEL  | `_entity_score` existe en Python (`prioritization.py:160`), **non persisté**, jamais rendu                                                                      |
| 127     | 19  | U08 journal des exclusions                                  | PARTIEL  | données là, écran absent (défaut n°4)                                                                                                                           |
| 128     | 19  | U12 alerte T-9 mois                                         | BLOQUÉ   | dépend de `dureeMois` DECP, à vérifier sur données réelles                                                                                                      |
| 129     | 20  | U36 reverse matching étendu au marché (BEL-ACC-014)         | ABSENT   | —                                                                                                                                                               |
| 130     | 20  | U39 répondre « je ne sais pas » + la question à poser       | ABSENT   | conforme à l'esprit du dépôt                                                                                                                                    |

---

## 3. Ce que le chantier corrige et que le tome ne demande pas

Six défauts, tous de la même famille — un producteur et un lecteur qui ne se
rencontrent pas. Les cinq premiers sont en §1.3. Le sixième :

6. **Le jeton d'attribution est émis puis jeté.** Le navigateur pose
   `suggestionId: "discover:<siren>"` (`discover-analyze.ts:60`), l'envoie dans
   `POST /analysis/start`, et le contrat dit qu'il sert « à tracer l'origine du run »
   (`analysis.ts:245`). `grep suggestion_id apps/api apps/ia` : **zéro résultat**.
   Aucune colonne, aucune persistance. C'est précisément la donnée dont le bloc
   « contribution » du §12 a besoin pour dire « comptes ouverts via Découvrir ».

## 4. Lots d'implémentation

Ordonnés par dépendance, pas par l'ordre du tome — deux de ses rangs ont un
prérequis qu'il ne voit pas.

- **Lot 0 — les prérequis invisibles** (défauts 2 et 5) — dépend de : rien.
  Faire voyager la clé de bloc dans `discoverScoreFactorSchema`, remettre le barème
  du web à 8 blocs, corriger le docstring et l'i18n « 3 des 5 critères », retirer la
  lecture morte `sourceRefs`. **Sans lui, le lot 2 s'affiche dans « divers ».**
- **Lot 1 — BEL-ACC-004, `esnPresence` atteint le produit** (items 97-104, défaut 1) —
  dépend de : rien. Typer le champ (`certainty` repris d'`esnSynergies`, `scope` déjà
  lu mais jamais émis, `detectedAt` = date du run), le faire alimenter
  `account_partners` en `source='analysis'` (le badge existe déjà), brancher la
  correction humaine sur `decideFieldWrite`, empty state au texte exact, démo sur un
  compte fictif.
- **Lot 2 — BEL-ACC-002, les 20 points** (items 43-53, 105) — dépend de : lot 0.
  Cinq axes, cinq prédicats de mesurabilité, `_capped()`, evidence en français citant
  sa source et sa date. **Rendu en deux nombres, jamais fondus** (item 53).
- **Lot 3 — BEL-ACC-003, l'onglet Accès** (items 54, 86, 107) — dépend de : lots 1-2.
- **Lot 4 — BEL-ACC-001, Découvrir** (items 58-61, 84) — dépend de : lot 2.
  Filtres d'accès, tri adressabilité, 4 familles dont la 4e affichée avec sa raison.
- **Lot 5 — BEL-ACC-007, le changement de poste** (items 90, 109) — dépend de : rien.
  Le badge RISQUE reste sur le compte d'origine ; une proposition d'ouverture naît
  sur le nouveau compte.
- **Lot 6 — BEL-ACC-005 + U04, l'entité plutôt que le siège** (items 55, 88, 126,
  défaut 3) — dépend de : lot 2. Brancher l'onglet Sites sur la table `sites`,
  persister le score d'entité.
- **Lot 7 — U08, le journal des exclusions** (item 127, défaut 4) — dépend de : rien.
- **Lot 8 — BEL-ACC-011, la contribution au revenu** (items 82-83, défaut 6) —
  techniquement autonome, produit : dépend de D58.
- **Lot 9 — BEL-ACC-013, la péremption du refus** (items 79, 111) — dépend de : rien.
- **Lot 10 — BEL-ACC-012, le réseau dormant** (items 78, 110) — dépend de : rien.
- **Lot 11 — BEL-ACC-006, le canal partenaire** (items 62-67, 89) — **dépend de la
  base des 700 ESN**, non fournie.
- **Lot 12 — BEL-ACC-009/010, onboarding par situation et bibliothèque de requêtes**
  (items 92-93, 96, 112-113).

## 5. Décisions demandées à Louis

| #    | Question                                 | Reco                               | Réponse                                                                                                                                                                                                                                        |
| ---- | ---------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1-A | Périmètre de ce chantier sur les 12 lots | lots 0 à 5 + 7                     | **Tout sauf ce qui est bloqué** — lots 0 à 10 + 12 ; le lot 11 démarre à réception de la base ESN                                                                                                                                              |
| T1-B | Où vit la liste des ESN présentes        | alimenter Partenaires              | **Dans Partenaires.** L'analyse écrit `source='analysis'` ; l'onglet Accès ne porte pas de seconde liste                                                                                                                                       |
| T1-C | D51 — cadre de la donnée communautaire   | schéma + opt-in éteint             | **Cadre COMPLET et ACTIVÉ** — opt-in réel, remontée réelle dès 3 espaces confirmants. ⚠️ **La revue CGU appartient à Louis et doit précéder le merge** : le produit se met à faire circuler entre espaces une information saisie par un client |
| T1-D | Informations externes                    | base 700 ESN + tomes 2-8           | **« Je t'envoie tout »** — le lot 11 (canal partenaire) démarre à réception du fichier ; la vérification `dureeMois` sur DECP réel est à ma charge                                                                                             |
| D56  | Pipeline partenaire distinct             | oui, après la base ESN             | retenu — lot 11                                                                                                                                                                                                                                |
| D57  | Profondeur adaptée à la taille           | oui, via `esn_stage`               | retenu                                                                                                                                                                                                                                         |
| D58  | Bloc contribution au revenu              | oui, attribution partielle assumée | retenu — le jeton perdu (défaut 6) se persiste d'abord                                                                                                                                                                                         |
| D59  | Compte hors de portée                    | affiché avec sa raison             | retenu                                                                                                                                                                                                                                         |
| D60  | Coût d'accès                             | déclaratif uniquement              | retenu                                                                                                                                                                                                                                         |

Les décisions **D52, D53 et D54 ne se posent pas** : déjà tranchées dans le dépôt,
dans le même sens, avec leurs gardes.

### Décisions venues du tome 8, tranchées le 22/08

| ID      | Question                                                | Décision                                                                                                                                                                                                                                       |
| ------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D62** | `esn_directory` partagé entre espaces ou par espace     | **Partagé.** Conséquence assumée : des faits d'entreprise circulent entre clients concurrents dès le premier jour — même engagement que D51, en plus large, et **à porter dans les CGU**                                                       |
| **D65** | Crawl des sites d'ESN pour résoudre domaines et agences | **Crawl général encadré** : Firecrawl (déjà en place), robots.txt respecté, user-agent identifié, 1 req/2 s, journalisé. Ce n'est pas une exception à la règle anti-scraping : un site public d'entreprise n'est pas un réseau social sous CGU |
| **D70** | Le coût d'accès remonte-t-il en communautaire           | **Non, jamais.** Faire circuler des taux de commission entre ESN concurrentes est un échange d'informations tarifaires. Le champ reste local à l'espace qui l'a saisi                                                                          |

### Décisions que je tranche sans question, et pourquoi

| ID      | Question                                                                           | Décision                                                                                                                                                                                                                                                                |
| ------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D71** | « accessibilité » (tome 1, 5 axes) contre « barrière d'achat » (tome 3, 6 proxies) | **Elles se composent, elles ne s'opposent pas.** La formule du tome 3 §4.3 CALCULE l'axe A1 (verrouillage) à partir des proxies de registre ; A2 à A5 restent ceux du tome 1. Les 4 états de A1 sont les 4 classes A/B/C/D du tome 3. Aucun des deux modèles n'est jeté |
| **D72** | Le nom de la notion à l'écran                                                      | **« Comptes ouverts »**, avec le sous-titre obligatoire « Des comptes où rien ne semble bloquer l'entrée. À vérifier au premier contact. » — la seconde phrase transforme une promesse en hypothèse                                                                     |

## 6. Ce qu'on ne promet pas

- **L'échéance d'un référencement** — « panel fermé jusqu'en 2027 », l'alerte T-9 mois
  de U12, la demi-vie « durée du marché + 3 mois » — tant que `dureeMois` n'a pas été
  vérifié sur des données DECP réelles. Le verrouillage, lui, est calculable dès
  aujourd'hui.
- **Le nom `access_path`** tel quel : il désigne déjà un bloc de briefing
  (`account-briefing.ts:36`). Et `accessibility` désigne déjà quatre choses dans le
  dépôt — le nouveau score s'appelle `addressability`.
- **Un seuil « moins de 5 consultants »** : le palier le plus fin du questionnaire
  d'accueil est `1-10`. On s'appuie sur `esn_stage`, déjà lu par six services.
- **Nommer une ESN réelle chez un compte réel en démonstration** : la raison écrite
  dans `demo-coverage.ts:192` tient. Le seed va sur un compte fictif.
- **Un score d'accessibilité présenté comme une probabilité** : 6e refus de
  l'arbitrage n°4.
- **Le scraping**, sous quelque forme que ce soit, y compris pour connaître
  l'ouverture d'une ESN à la sous-traitance : déclaratif, base propriétaire, ou rien.
- **Les tomes 2 à 8** : reçus, mais traités **tome par tome**, chacun avec son
  tracker et sa recette. Ce tracker ne préjuge pas de ce qu'ils déplaceront.
- **Le canal partenaire (lot 11)** : il exige un référentiel ESN résolu, et le
  fichier livré est une liste de noms sans SIREN. C'est `BEL-DATA-001`, sujet du
  tome 4.
- **Le domaine d'une ESN issu du CSV** : 93 % sont le slug du nom. Aucun ne sera
  affiché comme site officiel sans vérification.
- **Les scores du CSV des 281 comptes** : ils servent de jeu de validation, ils ne
  sont jamais importés comme valeurs.

## 7. État de livraison

Branche `feat/tome1-pivot-accessibilite`. Suite complète au vert avant merge :
API 5 712 · web 2 751 · contrats 1 655 · IA 4 194. Prettier et knip verts.

| Lot                                                           | Commit         | Mergé | Vérifié en live                   |
| ------------------------------------------------------------- | -------------- | ----- | --------------------------------- |
| 0 — prérequis invisibles (défauts 2 et 5)                     | `9a6e3bf`      | oui   | oui (22/08)                       |
| 1 — `esnPresence` atteint le produit (BEL-ACC-004, défaut 1)  | `9a6e3bf`      | oui   | oui (22/08)                       |
| 2 — les 20 points d'adressabilité (BEL-ACC-002)               | `fdd7488`      | oui   | oui (22/08)                       |
| 3 — onglet Accès (BEL-ACC-003)                                | `628a2cc`      | oui   | oui (22/08)                       |
| 4 — Découvrir : familles, tris, filtre (BEL-ACC-001)          | `7a009b9`      | oui   | oui (22/08)                       |
| 5 — le changement de poste ouvre une porte (BEL-ACC-007)      | `efeeed0`      | oui   | oui (22/08)                       |
| 6 — l'entité plutôt que le siège (BEL-ACC-005, défaut 3)      | `7885f66`      | oui   | oui (22/08)                       |
| 7 — journal des exclusions (U08, défaut 4)                    | `e2c21ce`      | oui   | oui (22/08)                       |
| 8 — contribution au revenu (BEL-ACC-011, défaut 6)            | `ae5adac`      | oui   | oui (22/08)                       |
| 9 — péremption du refus (BEL-ACC-013)                         | `06c5e3c`      | oui   | oui (22/08)                       |
| 10 — réseau dormant (BEL-ACC-012)                             | `bf992ab`      | oui   | oui (22/08)                       |
| 12 — onboarding par situation, bibliothèque (BEL-ACC-009/010) | `0c2b435`      | oui   | oui (22/08)                       |
| 11 — canal partenaire                                         | hors périmètre | —     | dépend de `BEL-DATA-001` (tome 4) |

### Ce que le chantier a ajouté au dépôt

- **Sept défauts** trouvés en croisant (§1.3 et §3), plus un huitième trouvé en
  passant : `POST /ats/connect`, `POST /ats/test` et `DELETE /ats` n'exigeaient
  AUCUNE permission — n'importe quel membre authentifié, un `viewer` compris,
  pouvait déconnecter l'ERP de toute l'entreprise.
- **Cinq migrations** : `access_facts`, les colonnes de certitude sur
  `account_partners`, les trois champs d'accès du §4 sur `opportunities`,
  `accounts.origin`, et l'élargissement des motifs d'écart.
- **Un module autonome** (`account-access/`), **quatre entrées GA-12**, **deux
  chemins d'écriture** inscrits dans `wired-write-paths.spec.ts`.
- **GA-05 descend** : le contrôleur ATS sort de la liste figée, qui ne peut que
  rétrécir. GA-07 n'a pas bougé — la règle d'accès est pure, dans les contrats.

### ⚠️ Ce que D51 et D62 n'engagent PAS dans cette branche

Louis a tranché « cadre communautaire complet et activé » et « référentiel ESN
partagé entre espaces ». **Rien de tout cela n'est livré ici** : `esn_directory`
n'existe pas, et toutes les lectures de ce chantier sont scopées au
`workspace_id`. Aucune donnée ne traverse les espaces. La revue CGU reste
nécessaire — elle conditionne le tome 4 (`BEL-DATA-001`, `BEL-DATA-005`), pas ce
merge.

### La recette live — faite le 22/08 sur le compte de Louis

Faite écran par écran sur le compte réel (22 dossiers, 4 687 contacts), une fois
la connexion disponible. **Trois défauts, tous de la même famille** : la
fonctionnalité était livrée, testée, déployée — et invisible. Aucun des trois
n'était visible d'un test : c'est la donnée réelle et l'écran ouvert qui les
sortent. Corrigés et revérifiés en live (`9c7f9555`, `7ff10fe7`).

**1. Le second nombre n'atteignait pas l'écran.** `normalizeDiscoverResponse`
recopie le candidat champ par champ ; `addressability` n'était pas dans la
liste. L'objet était pourtant complet dans la réponse d'API (vérifié :
`{score: 11, max: 11, factors: [lock, proportion]}`). Trois conséquences, toutes
sur Découvrir : la famille se déduisant de l'adressabilité, **CHAQUE compte
s'affichait « À investiguer »** — les quatre familles n'en faisaient qu'une ; les
tris « Accès » et « Équilibré » ne triaient rien ; et le second nombre, qui EST
la thèse du tome, ne s'affichait nulle part. Le même normaliseur jetait `block`,
la clé que le lot 0 fait justement voyager. Au passage : un bloc MESURÉ à zéro
disparaissait de la rubrique — la carte annonçait « 32/60 » au-dessus de blocs
dont les plafonds faisaient 50, sans que rien n'explique les dix points
manquants.

**2. Le filtre « réseau dormant » était câblé dans un module mort.** Le lot 10 l'a
posé dans `useContactsPage.ts`, un agrégat que plus RIEN n'importe depuis son
découpage en quatre hooks — seul son propre test en parlait encore. Le menu
proposait l'option, l'URL portait le paramètre, l'API savait répondre (vérifié :
`dormantMonths=12` rend une autre liste), et la requête partait sans lui.

**3. Les ESN déjà présentes restaient invisibles sur les 22 dossiers.** Le pont
`esnPresence → account_partners` ne s'ouvre qu'à la FIN d'une analyse ; les
dossiers analysés avant portaient leur `esn_presence` dans `raw_analysis` depuis
le 06/07 (Capgemini « confirmée » chez Airbus, avec son périmètre) et l'onglet
restait vide. C'est la demande n°3 du bêta testeur, invisible pour une raison de
calendrier. `backfillDetectedPartners` reprend les dossiers déjà analysés, une
fois, au démarrage : **71 lignes écrites sur 22 comptes**, un compte portant déjà
une ligne `analysis` étant sauté — écartée comprise, une reprise qui
ressusciterait un « ce n'est pas exact » serait pire que rien.

### Le verdict qui se concluait d'un silence (arbitrage Louis du 22/08)

Le normaliseur réparé, les familles sont enfin sorties — et **14 comptes sur 24
s'affichaient « Tu peux y aller » alors que le seul axe mesuré était la
proportion**, c'est-à-dire « ce compte est à ta taille ». Personne n'avait
regardé la porte, et l'aide de la famille promet « rien ne semble bloquer
l'entrée ».

La règle « un axe non mesuré sort du dénominateur » est juste pour un SCORE :
elle refuse de noter zéro ce qu'on n'a pas pu regarder. Appliquée à un VERDICT,
elle fait l'inverse — elle transforme l'ignorance en promesse, ce que le §15
interdit précisément pour cet axe-là. `reachable` exige désormais que le
verrouillage ait été MESURÉ et dise ouvert (6/6 = consultation en cours). Prix
assumé : sur du privé, la famille ne sortira qu'à partir d'un fait. Les deux
familles voisines ne bougent pas — elles reposent sur un fait POSITIF, pas sur un
silence.

### Ce que la recette a vérifié, écran par écran

| Lot                                         | Vérifié en live                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 0 — barème à 8 blocs, clé de bloc           | oui — rubrique groupée, plafonds qui totalisent le dénominateur du badge                 |
| 1 — `esnPresence` → Partenaires             | oui — « Les ESN présentes », badge « détecté », note rang 2, « Ce n'est pas exact »      |
| 2 — les 20 points                           | oui — « accès 5/5 » à côté de « 44/67 », axes non mesurés NOMMÉS sous la carte           |
| 3 — onglet Accès                            | oui — verrouillage, 7 portes, entités, coût d'accès déclaratif                           |
| 4 — Découvrir                               | oui — 4 familles, filtre Famille, tris Accès / Équilibré                                 |
| 7 — journal des exclusions (porte G1)       | oui — filtre d'état sur la liste des comptes                                             |
| 8 — contribution au revenu                  | oui — « 0 compte ouvert via Découvrir · 164 besoins détectés · 23 comptes plus anciens » |
| 10 — réseau dormant                         | oui — après correctif : filtre 6 / 12 / 24 mois, pastille visible                        |
| 12 — onboarding par situation, bibliothèque | oui — « Par où tu commences » (4 situations) et `/chat/commandes` (section Accès)        |
| 5 · 6 · 9                                   | routines et seed d'entités — pas d'écran à ouvrir, vérifiés au code                      |

**Deux points laissés ouverts, sans conséquence sur ce tome** : la liste
« par quelle entité entrer » affiche 33 libellés d'entité issus du texte libre
des contacts (« Airbus (entité régionale) », « Airbus Commercial Aircraft /
Airbus India »), avec le même encart répété 33 fois — c'est la réécriture de
l'onglet Sites autour de la table `sites`, explicitement hors périmètre ; et le
lien de démonstration public rend toujours **500** depuis le 21/08
(`POST /demo/session → column "workspace_id" does not exist`), défaut antérieur
au chantier.
