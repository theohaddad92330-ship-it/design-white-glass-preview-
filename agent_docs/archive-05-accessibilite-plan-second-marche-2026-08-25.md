# Archive 05 — accessibilité, scoring, plan de compte, organigrammes, second marché

> Source : `BELLUMAI_ITERATION_3_05_ACCESSIBILITY_SCORING_ACCOUNT_PLAN_ORGGRAPH_SECOND_MARKET_2026-08-24.zip`
> (950 681 octets, 22 fichiers au manifeste — **22 intègres**, SHA-256 recalculé).
> Croisée le 25/08/2026, après `00`, `08`, `01`, `02`, `03` et `04`.

Quatre sources, toutes closes : **tomes 1, 3, 4 et 5**. Plus un inventaire de code
et — c'est la nouveauté — **deux paquets de données**.

---

## 1. Les deux CSV, mesurés

### 1.1 `esn-referentiel-v0.csv` — 477 lignes, **zéro domaine vérifié**

| Mesure                                        | Valeur         |
| --------------------------------------------- | -------------- |
| Lignes                                        | 477            |
| Domaine **deviné** (`faible (derive du nom)`) | **302** (63 %) |
| Domaine **absent**                            | **175** (37 %) |
| Domaine vérifié                               | **0**          |
| Colonnes SIREN / ville / date                 | **aucune**     |
| Marqué `a_verifier: oui`                      | 302            |

Le fichier le dit lui-même : `confiance_domaine` ne prend que deux valeurs, et
aucune n'est « vérifié ». C'est cohérent avec le refus du tome 1 — le canal
partenaire n'a pas été livré **parce que** ce référentiel n'est pas résolu — et
ça le précise : ce n'est pas « 93 % de domaines devinés » comme le notait la
mémoire, c'est **100 % de lignes non vérifiées**, dont 63 % de suppositions et
37 % de vides.

⚠️ La table `esn_directory` livrée au tome 4 remplit ses SIREN **en tâche de
fond, par lots réservés**, précisément parce que ce CSV ne les porte pas. Rien à
ingérer ici : la voie d'entrée existe et travaille.

### 1.2 `comptes-adressables-v0.csv` — 281 comptes notés, mais notés comment ?

Colonnes : `nom · secteur · statut · effectif_ordre · ville · cote ·
expo_commande_publique · decentralise · barriere_achat · accessibilite · classe ·
libelle`. Aucune ville manquante. Quatre classes : **A 188 · B 37 · C 29 · D 27**.

Ce qui décide du verdict tient en une mesure : **51 tuples numériques distincts
pour 281 lignes**. Les cinq notes (`cote`, `expo`, `decentralise`,
`barriere_achat`, `accessibilite`) ne sont donc pas des observations par compte —
ce sont les **sorties d'une formule** appliquée à trois drapeaux grossiers. Cinquante-sept
comptes partagent exactement `0/0/0/1.0/9.0`.

Le document est honnête sur ce point : ses libellés disent « Ouvert
**probable** », « Verrouillage **probable** ». **Le fichier n'affirme pas, il
suppose.**

**Verdict : ne pas ingérer comme des scores.** Le dépôt porte un invariant
nommé, et il est GARDÉ : `prior_is_not_fact` — « une hypothèse DATAFORGE n'est
jamais présentée à l'utilisateur comme un fait »
(`dataforge-priors-stay-internal.spec.ts`). Écrire `accessibilite: 9.4` sur un
compte le présenterait comme mesuré, alors que tout le tome 1 consiste à dire
« non mesuré » quand l'accès est inconnu — et que le score du dépôt est sur 20,
pas sur 10.

**Ce qui EST utilisable** : la liste de 281 noms avec leur ville, comme jeu de
candidats à analyser. C'est un usage de SOURCE, pas de VÉRITÉ.

---

## 2. Les quatre tomes — ce que le diff des sommaires donne

Appliquant la leçon de l'archive 03 (« une équivalence non vérifiée dispense de
lire »), les sommaires ont été diffés avant toute conclusion.

**Une fausse alerte, écartée.** Le tome 1 porte **deux séries de sections** :
§1-19, puis — après « §19 Ce que je retiens du call », qui se lit comme une
conclusion — une seconde série §12-19 qui est la **bibliothèque des 40 cas
d'usage**. Le motif est exactement celui qui a fait perdre un tiers du tome 6.
**Vérifié : le tracker du tome 1 la couvre** (son §2.8 « Les 40 use cases », avec
une table par famille et le compte livré/absent de chacune). Rien de perdu.

Les numérotations des tomes 4 (§6-27) et 5 (§0.1-0.5 puis §14-45) ne se suivent
pas d'un tome à l'autre. Vérifié comme non-troncature, même contrôle que pour les
tomes 7 et 8 : les fichiers commencent par leurs sections d'introduction non
numérotées et le contenu est continu.

### Ce que le tracker du tome 5 ne nomme pas

Trois **cas travaillés** du tome n'ont aucune trace : §16 « Exemple complet — plan
généré sur Groupe SEB », §20 « VINCI — le cas du groupe décentralisé », §21
« Club Med — le cas de la filiale de groupe étranger ».

Mesuré contre `apps/ia/tests/test_named_account_golden_sets.py`, qui porte les
comptes nommés du dépôt :

| Cas du tome                           | Archétype                                      | Couvert ?                                                                                                                                 |
| ------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| VINCI — groupe décentralisé           | groupe fédéré qui doit tenir ensemble          | **OUI**, par `test_credit_agricole_federated_group_holds_together`                                                                        |
| Club Med — filiale de groupe étranger | filiale dont la maison mère est hors périmètre | **NON** — le plus proche est `test_sg_divested_subsidiary_is_statused_not_dropped`, qui traite une CESSION, pas une maison mère étrangère |
| Groupe SEB — plan de compte complet   | —                                              | **Sans objet** : le jeu de référence garde la cartographie d'organigramme, pas la génération de plan. Deux choses différentes.            |

**Un seul manque réel** : l'archétype « filiale de groupe étranger ». Il vaut un
cas de référence, pas un chantier — et il est inscrit ici plutôt que livré à
l'aveugle, parce qu'écrire un golden sur un compte qu'on n'a pas analysé
produirait un test qui vérifie une supposition.

---

## 3. Les résolutions du README

| Résolution                                                                | Verdict                                                                                                                                     |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| « OrgGraph vérifié, Buying Committee et Access Graph sont **distincts** » | **TENUE** — trois objets, trois vues ; l'onglet Carte d'influence porte « liens à vérifier, pas un organigramme officiel »                  |
| « Une route achats groupe ne vaut pas pour tous les domaines »            | **TENUE** — c'est la raison d'être des sept modes d'entrée, dont cinq indirects, et du hors-panel qui reste ouvert sur un compte verrouillé |
| « Account Plan Lite avant plan exhaustif »                                | **TENUE** — le premier mouvement en quatre points, dont le quatrième est un INTERDIT                                                        |
| « Scoring explicable et `unknown ≠ 0` »                                   | **TENUE, et c'est le cœur du dépôt** — deux nombres jamais fondus, un axe non évaluable SORT du dénominateur, GA-18/GA-19 en cliquet        |

---

## 4. Ce qu'on ne promet pas

| Ce qu'on ne fait pas                              | Raison                                                                                                                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ingérer `comptes-adressables-v0.csv` comme scores | 51 tuples pour 281 lignes : c'est une formule sur trois drapeaux, pas une mesure. `prior_is_not_fact` est un invariant GARDÉ, et l'échelle diffère (sur 10 contre sur 20). |
| Ingérer `esn-referentiel-v0.csv`                  | 0 domaine vérifié sur 477, aucun SIREN. `esn_directory` les résout déjà en tâche de fond — c'est la voie qui donne une donnée, pas une supposition.                        |
| Un golden « filiale de groupe étranger »          | Inscrit, pas livré : l'écrire sans avoir analysé un compte réel produirait un test qui garde une supposition.                                                              |
| Rejouer les 40 cas d'usage du tome 1              | Déjà inventoriés et statués un par un au §2.8 de leur tracker.                                                                                                             |
