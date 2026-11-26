# Statuage des groupes C et D — 28/08/2026

> **Ce fichier existe pour la preuve n°2 du certificat d'épuisement** : « chaque item statué ».
> Il complète `RECONSTRUIT-groupes-B-C.md` et `RECONSTRUIT-groupes-D-E.md`, qui laissaient
> des lignes hors périmètre et des statuts ouverts.
>
> ⚠️ **Une confrontation au code est DATÉE.** Celle-ci est faite sur `2bed6bf05`. Les statuts
> qu'elle corrige n'étaient pas faux quand ils ont été écrits — ils ont vieilli en un jour.

## Ce que la passe a mesuré

| Groupe        |              Lignes nommées |       Déjà statuées ailleurs | Statuées ici | Sans statut |
| ------------- | --------------------------: | ---------------------------: | -----------: | ----------: |
| C (PDF-07→09) |   84 (75 `C-xx` + 9 `U-xx`) |                           75 |        **9** |       **0** |
| D (PDF-10→13) | 130 (121 `D-xx` + 9 `U-xx`) | 121, dont 18 à re-confronter |       **27** |       **0** |

### Décompte du groupe D, produit par script (130 lignes, ids uniques vérifiés)

| statut         | nombre |    part |
| -------------- | -----: | ------: |
| LIVRÉ          |     75 |  57,7 % |
| ABSENT         |     36 |  27,7 % |
| DOUBLON        |      5 |   3,8 % |
| NON PROUVÉ     |      4 |   3,1 % |
| PÉRIMÉ         |      4 |   3,1 % |
| NON PORTEUR    |      4 |   3,1 % |
| REFUSÉ         |      2 |   1,5 % |
| **À VÉRIFIER** |  **0** | **0 %** |

Le script compte les identifiants, détecte les doublons d'id et **liste les manquants** de `D-01` à `D-121` et `U-01` à `U-09` — aucun. C'est la vérification qu'une relecture ne fait jamais : elle confirme toujours ce qu'on croit.

---

## 1. Ce que la re-confrontation a CHANGÉ

Vingt-sept exigences reprises contre le code du jour. Les mouvements :

- **12 `À VÉRIFIER` → 0.** Neuf deviennent `LIVRÉ` (D-47, D-58, D-77, D-82, D-89, D-95, D-97, D-102, D-114), deux `PÉRIMÉ` (D-53, D-54), une `REFUSÉ` (D-121).
- **6 `NON PROUVÉ` → 2 `LIVRÉ`.** **D-15** : la primitive `Provenance` est branchée depuis, sur `ContactTableRow.tsx:265` et `ContactLifecycleTimeline.tsx:38`. **D-48** : le code a été _supprimé_ le 27/08 parce que le prédicat vivait déjà dans `workflow-runner.service.ts:105`.
- **5 statuts périmés corrigés.** **D-49** passait pour `ABSENT` : `action-os.ts:37-52` porte bien les six niveaux d'autonomie, y compris `n3_manager_approval` que le tracker disait manquant — seul `n6_` (l'irréversible) reste à zéro, et c'est voulu.
- **4 `ABSENT` → `NON PORTEUR`** (D-44, D-98, D-119, D-120). Le tracker les qualifiait lui-même de « méta-entrée » **tout en les comptant comme des trous produit**. Un inventaire de chantiers n'est pas une exigence : c'était du **backlog fantôme**, exactement ce que la passe inverse existe pour éviter.
- **9 `U-xx` jamais statuées** → 3 `LIVRÉ`, 1 `REFUSÉ`, 5 `DOUBLON`. **Aucune n'était une exigence neuve.**

---

## 2. Les quatre seuls `NON PROUVÉ` réels du groupe D

| id        | Ce que c'est                                                                                | Preuve du zéro                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| D-16      | Les 6 chiffres DATAFORGE V10                                                                | `priorsForSiren` → 4 hits, **tous** spec ou registre                                                                        |
| D-17      | Les 4 variables indépendantes de V10                                                        | même zéro ; `doctrine-registry.ts:254` : « l'evidence compte × domaine n'existe dans AUCUNE table »                         |
| D-30      | « 78 870 lignes ingérées, sans consommateur »                                               | la garde `dataforge-priors-stay-internal.spec.ts:25` **assume** l'absence d'appelant                                        |
| **D-117** | **Les 3 familles de KPI produit** — 60 indicateurs, `measurableKpis()`, `kpiGapsByFamily()` | `PRODUCT_KPIS` → hits **uniquement** dans `product-kpi.ts` et son test. **Aucun écran, y compris `apps/dashboard-manager`** |

⚠️ **Trois des quatre sont délibérés** : `doctrine-registry.ts:239` écrit noir sur blanc que DATAFORGE « n'a AUCUN consommateur de production, **et c'est délibéré** » — les priors restent internes par construction (GA-37). **Seul D-117 est une dette** : soixante KPI produit définis et testés qui n'atteignent aucun écran. Sa mise en service est un écran, rien de plus.

---

## 3. Ce que la passe a trouvé et qui n'était pas dans son mandat

### 3.1 ⚠️ Une contradiction doctrine ↔ produit — D-66

La source **refuse** « détecter une réponse positive ». Le code la livre : `routine-catalog.ts:134`, routine `positive_replies`.

Ce n'est pas un manque, c'est une **contradiction ouverte**. Soit le refus est périmé et il faut l'écrire, soit la routine viole un arbitrage et il faut la retirer. **Décision de Louis** — parquée au §6 du journal.

### 3.2 ⚠️ Deux items `LIVRÉ` du groupe C qui sont en réalité `NON PROUVÉ`

Le catalogue des interventions de Laura porte **30 clés** ; le détecteur n'en produit que **huit** (`laura-detector.ts`, `DETECTABLE_KEYS`).

- **C-07**, marqué `LIVRÉ`, s'appuie sur `consultant_free_soon`, `long_bench`, `missions_without_timesheet` → **détecteur : 0, 0, 0**.
- **C-09**, marqué `LIVRÉ`, tient aux deux tiers : `connector_error_48h` ✅ et `credits_expiring` ✅, mais `high_correction_rate` → **0**.

**Vingt-deux des trente interventions sont du code juste, testé, que rien ne peut déclencher.** Une entrée de catalogue n'est pas une intervention : `laura.service.ts` arbitre des `candidateKeys` **fournies par l'appelant**, et l'appelant n'en sait produire que huit. C'est le défaut n°1 du dépôt, reproduit **dans le document censé le traquer**.

### 3.3 ⚠️ Un zéro FAUX dans `RECONSTRUIT-groupes-B-C.md:125`

L'item C-22 fonde son `ABSENT` sur `grep -rn "promptVersion|prompt_version" apps/ia/app` → **0**.

Recoupé : **14 hits**, dont `registry.py:268` (`prompt_version_for`), `chat.py:221`, `agent_envelope.py:80`, et une garde dédiée. **La conclusion `ABSENT` tient quand même**, mais sur un autre fondement (la trace `laura_interventions` porte **8 colonnes**, pas 17). **C'est la preuve qui était fausse, pas le verdict** — et une preuve fausse est un piège pour le prochain lecteur.

Cause : le proxy de ce poste rend des « 0 matches » faux, **et** `grep` sans `-E` traite `|` littéralement.

### 3.4 Trois livraisons tenues par un ZÉRO, pas par un test

- **D-95** (7 garde-fous d'import) est `LIVRÉ` 5/7 par citation directe et **2/7 par l'absence de code** (`grep` → 0 référence RAG ou corps de message dans le module d'import). Un garde-fou tenu par construction **se casse sans bruit**.
- **D-43** (l'alerte de coût quotidienne) est `LIVRÉ` mais **inerte sans `COST_ALERT_DAILY_USD`** — `cost-alert.service.ts:22` le dit : « Sans seuil, ce service ne fait RIEN ». Le code tourne, l'alerte ne part pas.
- **D-121** est `REFUSÉ` et bien tenu : `manager-kpi.ts:69-70` rend le seuil `z.string()` — « Jamais une note, un repère ». Une cible chiffrée y est **inexprimable**. C'est la bonne façon de tenir un refus : par le type, pas par la vigilance.

---

## 4. Un trou de dénombrement, déclaré et non comblé

`passeB-groupe-D.md` annonce **668 unités atomiques** ; il n'en **nomme que 130**. Les 538 autres (les 56 lignes `A01`→`G06`, les 20 requêtes prioritaires, les 12 sources d'import…) sont agrégées sous une ligne-mère et **n'ont aucun identifiant propre** : elles ne sont statuables qu'au niveau du groupe, ce que fait ce tableau.

⚠️ **Aucune ligne du certificat ne doit donc prétendre couvrir 668 unités individuellement.** Le dénominateur honnête de ce groupe est **130**.

Même écart sur le groupe C : l'en-tête annonce 442 non mentionnées, la colonne `n` du même fichier somme à **451** (+14 / +2 / −7 selon le PDF). Ce n'est pas un décalage constant : **l'un des deux comptes a été écrit à la main.** Le dénominateur fiable est le nombre de LIGNES, qui est stable et sert de clé de croisement.
