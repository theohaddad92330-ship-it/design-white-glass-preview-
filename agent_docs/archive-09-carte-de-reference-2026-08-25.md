# Archive 09 — miroirs historiques et carte de référence

> Source : `BELLUMAI_ITERATION_3_09_HISTORICAL_MIRRORS_AND_REFERENCE_MAP_2026-08-24.zip`
> (579 326 octets, 21 fichiers au manifeste — **21 intègres**, SHA-256 recalculé).
> Croisée le 25/08/2026, **en dernier** — c'est la carte, elle se lit après le
> territoire.

Elle ne porte aucune spécification. Elle porte deux choses qu'aucune autre
n'a : **la liste de ce que le corpus ne contient pas**, et **l'inventaire maître**
des 79 documents de l'itération 2 à croiser.

---

## 1. Les onze binaires déclarés absents — tous couverts

`FILE_LIBRARY_BINARIES_NOT_MOUNTED.md` est le fichier le plus honnête des neuf
archives : il énumère les documents que la File Library référence et dont les
octets ne sont **pas** dans le paquet, avec la règle qui va avec — « ne jamais
présenter ces binaires comme contenus dans les ZIP ».

Vérifié un par un : **chacun a son miroir dans le dépôt**.

| Binaire non monté                                    | Ce qui le porte                                                                                                                                                                              |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RESTITUTION_PRODUIT_COMPLETE_2026-07-14`            | `agent_docs/restitution-*` (5 fichiers) + mémoire `restitution-v2-audit-2026-07-24`                                                                                                          |
| `TF1_RESTITUTION_2026-07-21`                         | `audit-tf1-2026-07-22.md`, `tf1-restitution-execution.md`                                                                                                                                    |
| `ANNEXE_METHODOLOGIE_SALES_ESN_2026-07-21`           | `methodo-sales-esn-plan.md`, `audit-methodo-2026-07-22.md`                                                                                                                                   |
| `ANNEXE_ORGANIGRAMME_ACCOUNT_MAPPING_2026-07-21`     | `org-mapping-plan.md`, `audit-org-mapping-*` (2)                                                                                                                                             |
| `RESTITUTION_FINALE_NOUVELLES_BRIQUES_V2_2026-07-21` | `restitution-v2-plan.md`, `audit-restitution-v2-*` (2)                                                                                                                                       |
| `RECETTE_FINALE_PRODUIT_CODE_VISION_2026-08-02`      | mémoire `recette-finale-2026-08-02`                                                                                                                                                          |
| `ADDENDUM_FINAL_PAGES_69_PLUS_2026-08-02`            | `addendum-final-2026-08-02.md`                                                                                                                                                               |
| `Meta_Analyse_Besoins_Workflows_Requetes`            | `meta-analyse-besoins-2026-08-03.md`                                                                                                                                                         |
| `CRM_ATS_OPERATING_SYSTEM_ESN_2026-08-16`            | `crm-ats-plan.md` + mémoire `crm-ats-natif-chantier`                                                                                                                                         |
| `Product_Operating_System_ESN_160p`                  | c'est le document PARENT de la série : `pdf1-architecture-globale-2026-08-19.md` s'intitule « Architecture globale Operating System ESN », et ses huit à dix enfants ont chacun leur tracker |
| série `PDF_01` à `PDF_08` du 21/08                   | les huit trackers `pdf1-` à `pdf8-`                                                                                                                                                          |

**Onze sur onze.** Aucun trou : ce que l'archive ne transporte pas, le dépôt
l'a déjà digéré.

---

## 2. L'inventaire maître : 79 entrées, pas 69

`MASTER_DOCUMENT_INVENTORY.md` porte **79 entrées numérotées** réparties en
**quinze sections**. ⚠️ La mémoire de l'archive 00 en annonçait 69 — recompté par
script, c'est 79. (Le CSV du même inventaire en portait 38 : une SÉLECTION par
catégorie, pas une troncature — c'était déjà établi, et ça se confirme ici.)

Les quinze sections se rangent sans reste dans les neuf archives traitées :

| Section de l'inventaire                     | Traitée par                              |
| ------------------------------------------- | ---------------------------------------- |
| §0 Repo / code source                       | archive `08`                             |
| §1 Recettes produit juillet                 | archive `09` (miroirs)                   |
| §2 Recette agentique / Copilote / Action OS | archive `03`                             |
| §3 CRM / ATS / ERP — grands masters         | archive `02`                             |
| §4 Série 8 PDF du 20-21/08                  | archives `02`, `04`                      |
| §5 Série 10 PDF du 19-22/08                 | archives `01`, `02`, `03`, `04`          |
| §6 Laura / assistant omniprésent            | archive `03`                             |
| §7 Les 8 tomes Accessibilité                | archives `01`, `04`, `05`                |
| §8 DATAFORGE V9 / V10                       | archive `06`                             |
| §9 Verticalisation non-IT / Stelya          | archive `06`                             |
| §10 Business / pricing / pipeline           | archive `07`                             |
| §11 Sources visuelles et état produit       | archive `07`                             |
| §12 Sources historiques / mémoire           | archive `09`                             |
| §13 Miroirs déjà intégrés — contrôle        | fait à chaque archive (diff des miroirs) |
| §14 Hiérarchie de priorité documentaire     | l'ordre de lecture suivi                 |

---

## 3. La hiérarchie de priorité, et ce qu'elle valide

Le §14 pose dix rangs de précédence documentaire. Le premier est le seul qui
compte pour un chantier :

> **1. Repo courant = vérité d'implémentation.**

C'est exactement la règle qui a produit les résultats des huit archives
précédentes — et la seule qui a permis de **réfuter** ce que les lectures
inversées annonçaient : les quatre écarts « bloquants » du tome 6, la
contradiction supposée entre GA-06 et l'axe 7, les 564 imports « manquants », les
huit gardes de la donnée « absentes ». Dans chaque cas, le document disait une
chose et le code en disait une autre — et le code avait raison.

Les rangs 9 et 10 confirment deux refus déjà écrits : « restitutions 14-21/07 =
historique utile mais **potentiellement supplanté** » et « **V9 = audit ; V10
prévaut** pour toute nouvelle ingestion ».

---

## 4. Ce qu'on ne promet pas

| Ce qu'on ne fait pas                      | Raison                                                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Récupérer les onze binaires non montés    | Ils sont couverts par leurs miroirs (§1), et l'archive elle-même écrit que « les miroirs Markdown restent plus directement exploitables ».       |
| Rejouer `memoire-ancien-GPT`              | Historique de feedback, supplanté par les trackers. Présent en double dans les archives `07` et `09` — conservé comme archive, pas comme source. |
| Re-traiter les treize miroirs historiques | Ce sont les miroirs des chantiers de juillet, tous clos et tous vérifiés identiques à `agent_docs/`.                                             |

---

## 5. Certificat d'épuisement — les dix archives de l'itération 3

Écrit le 25/08/2026, après traitement des dix.

### Les preuves comptables

| Preuve                                                 | État                                                                                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Intégrité** — SHA-256 recalculé, fichier par fichier | `00` ✓ · `01` 29/29 · `02` 21/21 · `03` 23/23 · `04` 23/23 · `05` 22/22 · `06` 16/16 · `07` 19/19 · `08` ✓ · `09` 21/21 — **zéro écart**          |
| **Dérive de miroir** — miroirs vs `agent_docs/`        | `02` 9/9 identiques · `08` 138/140 identiques (2 divergés ADDITIVEMENT, 0 absent)                                                                 |
| **Dérive de code** — routes, modules, chemins cités    | `02` 73/73 routes, 100/100 modules, 14/14 chemins · `08` 5 247 fichiers, 3 disparus, tous les trois le skill `pdf-chantier` retiré volontairement |
| **Binaires déclarés absents**                          | 11/11 couverts par un miroir (§1)                                                                                                                 |
| **Sections de l'inventaire maître**                    | 15/15 rattachées à une archive (§2)                                                                                                               |
| **Contradictions tranchées**                           | 26 au registre de doctrine, GA-38 les garde                                                                                                       |
| **Suites vertes sur le commit de merge**               | API 5899 · web 2894 · contrats 1985 · site 355 · IA 4519                                                                                          |

### Ce que le chantier a livré

Onze PR mergées et déployées. Trois primitives, quatre registres gardés
(GA-38 à GA-41), une 26ᵉ contradiction, une garde de parité tarifaire, deux
métadonnées d'observabilité, cinquante tickets statués, dix cas limites statués,
et **douze comptes faux corrigés** dans huit trackers.

### Ce qui reste ouvert, et où c'est écrit

| Reste                                               | Où                                                        |
| --------------------------------------------------- | --------------------------------------------------------- |
| ~120 exigences perdues par les trackers des PDF 2-5 | §7 de `archive-02` — **avec leur statut de vérification** |
| Les 35 interventions métier et 9 surfaces du tome 6 | §3 et §7 de `archive-03`                                  |
| Les 15 métadonnées Langfuse restantes               | §5 de `archive-03`                                        |
| 4 champs sur 7 d'une fiche source                   | §2 de `archive-04`                                        |
| Un golden « filiale de groupe étranger »            | §2 de `archive-05`                                        |
| Le §12 des 24 features du tome 8 (17 non mesurées)  | `tomes6-8`, §0 corrigé                                    |

**Aucun de ces restes n'est un ticket prêt à ouvrir**, et c'est la conclusion
méthodologique du chantier : sur douze écarts « bloquants » annoncés par les
lectures inversées, **huit ont été réfutés en lisant le code**. Un écart de
couverture contre un tracker n'est pas un défaut ; c'est une question.

### Les trois causes racines inscrites en mémoire

1. **Le tracker jette la troisième colonne** des tableaux — garde-fous, seuils,
   conditions d'entrée, critères d'acceptation. ~120 exigences mesurées.
2. **« A EST B » dispense de lire.** Une équivalence non vérifiée entre deux
   documents a coûté un tiers du tome 6, et la même phrase était fausse une
   seconde fois pour le tome 8. Le remède coûte un `diff` de sommaires.
3. **Un artefact d'analyse statique n'est pas une mesure.** 564 « imports
   manquants » dont zéro réel ; un `migrations.txt` vide en face de 269
   migrations ; et ma propre première lecture du CSV DATAFORGE, qui a failli
   repartir dans le même piège.

### La marque

Les dix archives sont renommées `_DONE` sur le Drive et en local. **Dans le
doute, on n'écrit pas `DONE`** — ici les preuves ci-dessus sont comptables et
reproductibles, et ce qui reste ouvert est nommé, localisé et non promis.
