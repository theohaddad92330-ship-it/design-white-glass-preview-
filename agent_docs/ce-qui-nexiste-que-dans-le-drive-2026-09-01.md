# Ce que la suppression des dossiers Drive d'août ferait disparaître

**Écrit le 01/09/2026**, avant que Louis supprime les cinq dossiers de
`AOUT 2026 BELLUMAI`. Les maquettes et les documents sont sauvegardés dans
`agent_docs/sources/` (gitignoré) et leurs exigences sont livrées ou tracées.
**Ce fichier porte le reste** : ce qui n'était écrit nulle part ailleurs.

---

## 1. Deux écrans annoncés, jamais reçus

Le dossier du 26 août annonce **dix-neuf** écrans cibles. Il en contient
**dix-sept**. L'écart est déclaré **trois fois** — dans le LISEZ-MOI, dans
`PDF-01 §5`, et dans `PDF-21 partie 7` — et n'a **jamais été levé**.

**Ce n'est pas une question de code, c'est une question à Théo.** Personne ne
sait si les deux manquants existent, s'ils ont été abandonnés, ou s'ils n'ont
jamais été dessinés. Si le dossier disparaît, la question disparaît avec lui et
la carte de navigation se fige sur dix-sept écrans sans que quiconque sache
qu'il en manquait deux.

## 2. Cinq seuils chiffrés qui ne vivent que sur les IMAGES

Aucun `.txt` du dossier ne les porte. Ils ont été relevés en ouvrant les
maquettes une par une le 01/09.

| Seuil                                  | Où il apparaît          | État dans le dépôt                                                                                                         |
| -------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Rayon de recherche **50 km**           | image 01 (vivier)       | `RADIUS_OPTIONS = ['10','25','50','100','200']` — la valeur existe, mais comme option parmi cinq, pas comme défaut discuté |
| TJM **min 300 € / max 900 €**          | image 01                | `minTjm` / `maxTjm` sont libres — les bornes n'ont jamais été discutées                                                    |
| Localisation **± 20 km**               | image 08 (fiche besoin) | non tranché                                                                                                                |
| Objectif mensuel **350 000 €**         | image 10 (finance)      | l'anneau d'objectif est **saisissable** depuis le 31/08 — la valeur de la maquette n'est qu'un exemple                     |
| Dépôt de fiche de poste **max. 10 Mo** | image 08                | **livré** — `projects.json:1023`                                                                                           |

⚠️ Une **incohérence interne de la maquette 01** à connaître : le champ
s'intitule « TJM **maximum** » et contient **deux** entrées, Min et Max. Qui
reprendra cet écran doit savoir que le libellé est faux dans la source.

## 3. La fiche PDF-22 est FAUSSE sur cinq écrans sur dix-sept

C'est la trouvaille la plus coûteuse à re-payer. `PDF-22_Annexe_les-17-ecrans-cibles.txt`
est la fiche de lecture qui a servi de base à tous les trackers depuis le
26 août. **Elle décrit le mauvais écran** sur cinq fiches, parce que son auteur
a compté « neuf générations du même écran finance » alors qu'il n'y en a que
**sept** (11 et 12 ne sont pas des variantes finance — la fiche leur consacre
elle-même deux fiches distinctes). Sa numérotation a glissé.

Les erreurs vérifiées en ouvrant les images :

- **fiche 15** affirme « aucun sélecteur de période visible — **c'est un défaut
  grave** », et en tire une règle de design. **L'image 15 a un sélecteur de
  période** (« août 2026 », en haut à droite ET en titre de bloc).
- **fiche 16** dit « rejet ferme : une entrée de menu Scrapers ». L'image 16
  n'a pas de « Scrapers » — c'est l'image **13** qui l'a.
- **fiche 17** dit « le repli de la barre latérale (Réduire le menu) ». L'image
  17 n'en a pas — « Réduire le menu » est sur **13**, le chevron sur **16**.
- **fiche 14** attribue à l'image 14 des alertes chiffrées et un cercle orange
  qui sont sur l'image **16** ; l'image 14 porte des « Actions IA suggérées » et
  un cercle violet.
- **fiches 09 / 10 / 13** intervertissent la bannière marketing et l'activité
  récente.

⚠️ **La conséquence pratique** : quiconque reprendra PDF-22 sans les images
recodera « Scrapers à jeter sur la variante 6 » et « pas de sélecteur de période
sur la variante 5 » — deux affirmations inexactes.

**La leçon, qui vaut au-delà de ce dossier** : une fiche de lecture décrit ce
que son auteur a vu, pas ce que la maquette montre. C'est exactement le motif
qui a fait sauter les six maquettes du paquet SOL6 le même jour — deux agents
avaient lu les specs markdown et sauté les PNG.

## 4. Les images sont sauvegardées deux fois — vérifié par md5

Les 17 écrans cibles de `dossier-26-aout/images-produit-cible/` sont le doublon
**octet pour octet** de `jeudi-27-aout/27-aout-v3/images-produit-cible/`
(ex. `01-vivier.png` = `a0835566158d47ace567f6ca33ac64e3` des deux côtés).
Supprimer un des deux dossiers Drive ne perd donc aucune image.

---

## 5. DATAFORGE V10 — vingt tables sur vingt-six ne sont ingérées par RIEN

Mesuré le 01/09 en comptant les fichiers, pas en lisant leur README.

Le paquet `BELLUMAI_ITERATION_3_06` contient **26 tables DATAFORGE V10**,
~96 000 lignes cumulées. **Deux seulement atteignent la base** :
`dataforge_accounts` et `dataforge_account_domains`, par la migration
`1790000841267-DataforgeStaging.ts`, et encore : elles sont alimentées par un
CSV de transport unique (`DATAFORGE_V10_BELLUMAI_CANONICAL_INTEGRATION.csv`,
345 Mo, 158 colonnes, 78 870 lignes), jamais par les tables d'origine.

Les vingt-quatre autres — dont `source_registry_v10` (543 lignes, la couche de
provenance), `claim_audit_v10` (1 011 lignes), `manual_verification_queue_v10`
(166 lignes, une file de tâches priorisée), `account_domain_evidence_v10`
(1 649 lignes de preuves sourcées) — **ne sont lues par aucun code du dépôt**,
vérifié sous deux formes de recherche.

⚠️ **Conséquence pour la suppression** : `agent_docs/sources/` est **gitignoré**.
Ces 26 tables ne sont donc PAS dans le dépôt. Supprimer le dossier Drive du
24 août **perdrait la matière**, exactement comme pour ORION.

## 6. Deux PDF cités partout, jamais fournis

Ils sont nommés dans `memoire-ancien-GPT.pdf` (p. 41-42) et listés dans
`_09/reference_map/FILE_LIBRARY_BINARIES_NOT_MOUNTED.md`, qui écrit lui-même
« leurs octets ne sont pas présents » :

- **`BELLUMAI_CRM_ATS_OPERATING_SYSTEM_ESN_VERSION_PRODUCTION_2026-08-16.pdf`**
  — annoncé à **104 pages, 55 chapitres, 110 tableaux, 19 schémas
  d'architecture, 16 epics**, « Revenue Protection OS », « 100 micro-tâches
  ESN », « Integration Fabric », un plan P0/P1/P2 sur 30/60/90 jours et 12 mois.
- **`BellumAI_Product_Operating_System_ESN_160p.pdf`** — même statut.

**Si Louis les a quelque part, ce sont les deux documents les plus lourds jamais
cités et jamais lus.** S'il ne les a pas, il faut le savoir : plusieurs trackers
s'appuient sur eux comme s'ils avaient été dépouillés.

## 7. Un manifeste qui déclare deux fichiers absents

`_08/MANIFEST_SHA256.md` annonce « 163 déclarés, 163 présents, aucun blanc ».
Vérifié par script : **163 déclarés, 163 sur disque, intersection 161**. Deux
instantanés du dépôt sont déclarés et **absents**
(`repo_snapshots/belllum-monorepo-main-current-2026-08-24.zip` et
`…-previous.zip`) ; deux manifestes sont présents et non déclarés. Le total
tombe juste des deux côtés parce que 2 = 2 — c'est le motif « un total est un
argument ».

## 8. `sources-21-aout/` — dix PDF jamais croisés contre le code

**C'est le trou le plus lourd des cinq dossiers**, et il est dans « Jeudi 27 août »,
sous `27-aout-v3/sources-21-aout/` : les **dix documents ORIGINAUX du 21 août**,
137 pages, dont la consolidation du 26 août a été tirée.

Un fichier les a mesurés — `dossier-26-aout/delta-21aout-vers-26aout.md` — mais
**contre les documents du 26, jamais contre le dépôt**. Son ANNEXE H l'écrit :

> « **Aucun code n'a été lu** par ces deux lectures : tout ce qui y est dit du
> dépôt vient des documents eux-mêmes. »

Ses chiffres : **1 107 exigences mesurées, 628 déclarées perdues** dans la
consolidation — dont « **~90 tests nommés (la totalité)** », « **80
identifiants** (`GA-`, `ACC-`, `CRM-`, `TAL-`, `BEL-…`) », « **48 edge cases sur
63** », « **19 tableaux entiers, 185 lignes** ». **Aucune n'a de `fichier:ligne`.**

Trois de ces dix n'ont même pas eu ce traitement-là, et son §1.3 les nomme :
`BellumAICroisementMetaAnalyses.pdf` (un document d'**ARBITRAGE** entre deux
analyses contradictoires — « un arbitrage perdu se re-débat trois semaines plus
tard »), `E2PlanCinqAns.pdf`, `E3GoToMarket.pdf`. **~400 exigences estimées.**

⚠️ Un audit en a **sondé treize. Les treize sont dues.** Le taux ne se
généralise pas, mais il n'invite pas à supprimer le dossier avant d'avoir croisé
les dix.

⚠️ **Le fichier de mesure est lui-même gitignoré** (`.gitignore:176`) : il
disparaîtra avec l'arborescence, comme les dix PDF qu'il mesure.

**Un croisement est en cours** (01/09, 01 h 30). Tant qu'il n'a pas rendu,
« Jeudi 27 août » n'est pas supprimable.

## Ce qui NE doit pas être supprimé

⚠️ **`CRM BASE RAG CLIENTS`** n'est pas dans le même cas que les quatre autres.
Les quatre sont des **specs**, dont le contenu vit désormais dans le dépôt.
Celui-là est de la **DONNÉE** : `ORION_DATAPACK_V12` — 76 CSV, 513 953
enregistrements, 171 Mo décompressés, 1 195 comptes, 11 963 contacts, 3 849
chunks prêts à vectoriser. **Rien n'en a été ingéré.** Le supprimer perdrait la
matière elle-même, pas sa description.
