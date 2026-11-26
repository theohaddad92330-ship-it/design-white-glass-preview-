# Itération 3 — la précédence des sources, et la preuve n°5 du certificat

> Audit du 30/08/2026. Lot K11. Il prend **les deux trous les plus lourds** que la passe B
> a nommés sur l'archive 00 (`agent_docs/passe-b-iteration-3/ARCHIVE-00.md`, trous n°1 et n°3),
> les vérifie, et livre ce qui se corrige sans arbitrage.
>
> **Il ne dépouille pas les onze rapports de passe B** — c'est le lot d'un autre agent,
> dans `agent_docs/iteration-3-trous-2026-08-30.md`, où celui-ci n'écrit pas.
>
> Tous les nombres de ce document viennent d'un comptage reproductible. Les scripts sont
> donnés au §6 ; chacun tient en une commande et relit les fichiers du disque, jamais un
> inventaire qui se compterait lui-même.

---

## 0. Ce que la mesure a changé aux deux énoncés de départ

Les deux trous existent. **Aucun des deux n'a l'ampleur annoncée**, et dans les deux cas
c'est le même défaut de comptage qui a produit l'écart — celui-là même que la passe B
dénonce, appliqué cette fois par elle.

| Énoncé de la passe B                                                                                              | Ce que la mesure dit                                                                                                                                                                                                                                                                          | Verdict                |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| « Deux hiérarchies de précédence concurrentes »                                                                   | Vrai. Elles existent, aux emplacements cités.                                                                                                                                                                                                                                                 | **CONFIRMÉ**           |
| « dont une n'accorde aucun rang aux `agent_docs/` du dépôt »                                                      | Vrai. Le §14 ne leur donne aucun rang.                                                                                                                                                                                                                                                        | **CONFIRMÉ**           |
| « Les neuf autres archives ont été traitées sous une règle dont le jumeau divergent dormait dans le même paquet » | **Faux sur deux points.** Le jumeau ne dormait pas : le tracker de l'archive 09 le cite explicitement (`archive-09-carte-de-reference-2026-08-25.md:73`). Et sept des dix trackers n'invoquent aucune précédence — ils n'ont donc pas été « traités sous » une règle qu'ils n'ont jamais lue. | **RÉDUIT**             |
| « la contradiction … invalide potentiellement le traitement des neuf autres archives »                            | **Faux.** Les deux listes ont **zéro inversion d'ordre** sur 21 paires comparables. Aucune décision prise sous l'une ne sortirait autrement sous l'autre, sauf si elle s'appuyait sur le rang 5 — et **aucune ne s'y appuie**, mesuré ligne à ligne.                                          | **INFIRMÉ**            |
| « "Zéro décision en suspens" est démenti par un fichier que le manifeste déclare »                                | Vrai. La preuve n°5 est fausse.                                                                                                                                                                                                                                                               | **CONFIRMÉ**           |
| « `decisions-aout-2026.md` … dont **14 encore marquées « À trancher »** »                                         | **Faux.** « **À trancher** » est un TITRE de sous-section, permanent, qui nomme la QUESTION. Le statut vit dans le chapeau du fichier. Décisions réellement ouvertes : **7**.                                                                                                                 | **RÉDUIT (14 → 7)**    |
| « `FIRECRAWL_MAX_PAGES=3` posé sur Railway » (cité comme condition fragile vivante)                               | **Périmé.** Le moyen a été retiré : `MAX_PAGES_PER_RUN = 12` est en dur et la variable n'est plus lue (`apps/ia/tests/test_firecrawl_max_pages.py`). L'action opérateur est sans objet.                                                                                                       | **PÉRIMÉ**             |
| « Les 5 `repo_trackers/` … aucun n'est nommé une seule fois dans l'un ou l'autre tracker »                        | Vrai, et plus large que dit : **zéro occurrence dans les douze trackers**, pas seulement les deux.                                                                                                                                                                                            | **CONFIRMÉ ET ÉLARGI** |

**Le motif commun.** Le faux `DONE` d'origine venait d'un pourcentage juste calculé sur un
dénominateur choisi (`Items : 36` là où la matière en porte ≈ 300). La passe B a corrigé le
dénominateur — et s'est trompée de **numérateur** : elle a compté une chaîne de caractères
(`**À trancher**`, 14 occurrences) là où il fallait compter un statut (7 ouvertes). Les deux
erreurs sont la même : **un total présenté comme un fait alors qu'il est le résultat d'un
choix de mesure jamais écrit.**

Et les deux sont possibles pour la même raison matérielle : `decisions-aout-2026.md` n'a
aucun statut lisible par machine. Le certificat a compté 0, la passe B a compté 14, la
vérité est 7 — **aucun des deux ne mentait, aucun des deux ne pouvait compter.** C'est ce
que la garde GA-116 du §5 corrige à la racine.

---

## 1. Les deux formulations de la règle de précédence

Elles vivent toutes les deux dans `agent_docs/sources/BELLUMAI_ITERATION_3_00_GOUVERNANCE/00_GOUVERNANCE_SOURCE_OF_TRUTH/`
(⚠️ répertoire **gitignoré** — `.gitignore:176` — donc absent des worktrees ; les chemins
ci-dessous sont ceux du dépôt principal).

### A — `SOURCE_PRECEDENCE.md`, huit rangs

Titre du fichier, ligne 1 :

> `# BellumAI — Ordre canonique des sources — itération 3`

Ligne 3 : « Date de consolidation : 24 août 2026, après analyse du repo `(5)`. »
Rangs, lignes 17-24 :

| Rang | `SOURCE_PRECEDENCE.md:17-24`                                                                                        |
| ---: | ------------------------------------------------------------------------------------------------------------------- |
|    1 | **Repo courant `(5)`** : vérité d'implémentation au 24/08/2026 vers 14 h.                                           |
|    2 | **Addendum Stelya 24/08 + DATAFORGE V10**                                                                           |
|    3 | **Tomes Accessibilité 1–8**                                                                                         |
|    4 | **PDF spécialisés 1–10, datés 19–22/08**                                                                            |
|    5 | **Docs d'implémentation `agent_docs/` du repo** : « ils peuvent signaler qu'un diagnostic de PDF est déjà résolu. » |
|    6 | **Masters 16–19/08 et itérations 02/08**                                                                            |
|    7 | **Recettes juillet et mémoire ancien GPT** : « supplantées lorsqu'une décision plus récente existe »                |
|    8 | **DATAFORGE V9** : « historique/audit uniquement »                                                                  |

### B — `MASTER_DOCUMENT_INVENTORY.md` §14, dix rangs

Titre du fichier, ligne 1 :

> `# BellumAI — Iteration 2 — Master document inventory`

Titre de section, ligne 146 :

> `## 14. Hiérarchie provisoire de priorité documentaire pour l'itération 3`

Rangs, lignes 148-157 :

| Rang | `MASTER_DOCUMENT_INVENTORY.md:148-157`        |
| ---: | --------------------------------------------- |
|    1 | Repo courant `(5)` = vérité d'implémentation. |
|    2 | Addendum Stelya 24/08 + DataForge V10         |
|    3 | Tomes 1–8                                     |
|    4 | Série PDF 1–10 datée 19–22/08                 |
|    5 | Master 160p du 19/08 + master 104p du 16/08   |
|    6 | Addendum 02/08 + recette 02/08                |
|    7 | Meta-analyse 03/08                            |
|    8 | TF1 + annexes du 21/07                        |
|    9 | Restitutions 14–21/07                         |
|   10 | V9 = audit/historique                         |

### Le diff mécanique — et le résultat qui change tout

`scripts/prec_diff` (§6) apparie les treize éléments nommés par l'une ou l'autre liste sur
des mots-clés stables, puis compare l'ordre de chaque paire présente dans les deux.

```
paires comparables : 21
INVERSIONS D'ORDRE : 0

éléments SANS rang dans B : agent_docs/ du repo · Recettes juillet · Mémoire ancien GPT
éléments SANS rang dans A : Méta-analyse 03/08 · TF1 21/07 · Restitutions 14-21/07
```

**Les deux listes ne se contredisent sur aucun ordre.** Les rangs 1 à 4 sont identiques mot
pour mot. En dessous, B est un **découpage plus fin** de A : là où A6 fond « masters + itérations
02/08 » en un rang, B les sépare en B5/B6 ; là où A7 fond « recettes juillet », B les sépare en
B8 (TF1) et B9 (restitutions). Le classement relatif ne bouge jamais.

⚠️ **Ce que cette mesure ne couvre pas** : l'appariement est LITTÉRAL. « Recettes juillet »
(A7) recouvre probablement TF1 21/07 (B8) et les restitutions 14-21/07 (B9), que mon
extracteur compte comme « absents de A ». Après cette lecture indulgente, il reste **deux
éléments réellement sans rang dans B** — `agent_docs/` du dépôt et la mémoire ancien GPT — et
**un réellement sans rang dans A** — la méta-analyse du 03/08, qu'aucun libellé de A ne couvre
(A6 dit « itérations 02/08 », pas 03/08).

**Donc la divergence réelle tient en trois lignes, pas en deux hiérarchies concurrentes :**

1. B n'accorde aucun rang aux `agent_docs/` du dépôt (A leur donne le rang 5) ;
2. B n'accorde aucun rang à la mémoire ancien GPT (A la met au rang 7) ;
3. A n'accorde aucun rang à la méta-analyse du 03/08 (B lui donne le rang 7).

---

## 2. Laquelle a été appliquée — et la conséquence pour les neuf autres archives

### 2.1 La mesure

`scripts/count prec` (§6) compte, dans les **douze** trackers du 24-25/08, les occurrences
des marqueurs de chaque hiérarchie.

| Tracker                                            | lignes | `SOURCE_PRECEDENCE` | `MASTER_DOCUMENT_INVENTORY` | « précédence » | « §14 » | « dix rangs » | « huit niveaux » | cite `agent_docs/` |
| -------------------------------------------------- | -----: | ------------------: | --------------------------: | -------------: | ------: | ------------: | ---------------: | -----------------: |
| `gouvernance-iteration-3-2026-08-25.md` (arch. 00) |    391 |               **3** |                           2 |          **4** |       0 |             0 |            **1** |                  2 |
| `iteration-3-completude-2026-08-25.md` (arch. 00)  |     87 |                   0 |                           0 |              0 |       0 |             0 |                0 |                  0 |
| `archive-01-…`                                     |    281 |                   0 |                           0 |          **0** |       0 |             0 |                0 |                  1 |
| `archive-02-…`                                     |    457 |                   0 |                           0 |          **0** |     1\* |             0 |                0 |                  3 |
| `archive-03-…`                                     |    243 |                   0 |                           0 |          **0** |     3\* |             0 |                0 |                  1 |
| `archive-04-…`                                     |    134 |                   0 |                           0 |          **0** |       0 |             0 |                0 |                  0 |
| `archive-05-…`                                     |    122 |                   0 |                           0 |          **0** |     1\* |             0 |                0 |                  0 |
| `archive-06-…`                                     |    102 |                   0 |                           0 |          **0** |       0 |             0 |                0 |                  0 |
| `archive-07-…`                                     |     98 |                   0 |                           0 |          **0** |       0 |             0 |                0 |                  0 |
| `audit-archive-08-…`                               |     83 |                   0 |                           0 |              2 |       0 |             0 |                0 |                  2 |
| `archive-09-…`                                     |    156 |                   0 |                       **1** |              1 |   **2** |         **1** |                0 |                  3 |
| `recovery-juin-2026-…`                             |    420 |                   2 |                           0 |              3 |       0 |             0 |                0 |                  6 |

\* Vérifié un par un : les « §14 » de 02, 03 et 05 ne désignent PAS l'inventaire — ce sont
`pdf3-ats-talent-vivier §14-15` (02:138), le §14 de la source de l'archive 03 « les 40
interventions » (03:60, 03:146) et la numérotation des tomes 4 et 5 (05:77). **Un seul
tracker désigne le §14 de l'inventaire : celui de l'archive 09.**

### 2.2 Ce que la mesure établit

**Les deux hiérarchies ont été appliquées, par deux trackers différents, chacun ignorant
l'autre.**

- **A (huit rangs)** par le tracker de gouvernance de l'archive 00 :
  `gouvernance-iteration-3-2026-08-25.md:264-272` cite `SOURCE_PRECEDENCE.md`, recopie les
  huit rangs, souligne le rang 5 (« les `agent_docs/` du dépôt — qui peuvent prouver qu'un
  diagnostic de PDF est déjà résolu ») et écrit : « Les niveaux 5, 7 et 8 sont les trois qui
  font gagner du temps : ils autorisent à NE PAS recoder. » Il en **déduit l'ordre de lecture
  des archives** (`:277-283`).
- **B (dix rangs)** par le tracker de l'archive 09 :
  `archive-09-carte-de-reference-2026-08-25.md:67` mappe « §14 Hiérarchie de priorité
  documentaire » sur « l'ordre de lecture suivi », et `:73-79` écrit : « **Le §14 pose dix
  rangs de précédence documentaire. Le premier est le seul qui compte pour un chantier :
  Repo courant = vérité d'implémentation. C'est exactement la règle qui a produit les
  résultats des huit archives précédentes.** »

**Donc l'affirmation « personne n'a constaté qu'elle avait un jumeau divergent » est
fausse** : le §14 a été lu et cité, trois jours avant la passe B. Ce que personne n'a fait,
c'est **comparer les deux listes** — la passe B a raison sur ce point, et son grep « zéro
occurrence de §14 dans les deux trackers » est exact, mais il portait sur les **deux**
trackers de l'archive 00, pas sur les **douze**. Le verdict de sa section finale a élargi
la portée du grep sans refaire le grep.

### 2.3 Les neuf archives sont-elles à revoir ? Non — et voici la preuve

Une décision ne peut basculer d'une liste à l'autre que si elle s'appuie sur un rang où les
deux divergent. Un seul de ces rangs porte une autorité invocable dans un chantier : le
rang 5 de A, les `agent_docs/` du dépôt (les deux autres écarts — mémoire ancien GPT,
méta-analyse 03/08 — sont des sources historiques que les deux listes classent en bas).

`scripts/count` extrait **les 16 lignes** des douze trackers qui citent `agent_docs/`. Elles
se répartissent en trois familles, et **aucune n'est une invocation d'autorité documentaire** :

| Famille                                                   | N     | Exemples                                                                                                                                                                                                                      |
| --------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contrôle d'identité d'un miroir d'archive contre le dépôt | **6** | `archive-02:26` « Les 9 miroirs de trackers vs `agent_docs/` → 9 identiques » · `audit-archive-08:23,38` · `archive-09:97,110` · `gouvernance:111`                                                                            |
| Pointeur de localisation (« ce document vit là »)         | **8** | `archive-02:30` · `archive-03:27` · `archive-09:25` · `recovery-juin:3,256,303` · `gouvernance:268` (la citation de la règle elle-même) · `archive-01:122`                                                                    |
| **Refus explicite de l'autorité documentaire**            | **2** | `archive-02:387` : « chercher dans `apps/` et `packages/`, **jamais dans `agent_docs/`** » · `recovery-juin:190` : « Un document du dépôt affirme un câblage qui n'existe pas … **rien ne lit `agent_docs/` à l'exécution** » |

**Conclusion mesurée : zéro verdict des onze chantiers ne repose sur le rang 5.** Le rang
sur lequel les deux listes divergent n'a jamais servi. Deux trackers vont plus loin et
l'interdisent nommément comme méthode — ce qui est la doctrine du dépôt (« un audit
documentaire n'est pas le code »).

### 2.4 Dimensionnement du travail restant sur ce point

**Zéro archive à retraiter pour cause de précédence.** Ce qui reste est une ligne de
documentation par tracker, et elle est déjà écrite ici :

| À faire                                                                   | Coût              | Fait ?                          |
| ------------------------------------------------------------------------- | ----------------- | ------------------------------- |
| Écrire la règle retenue à UN seul endroit, avec le rang des `agent_docs/` | §4 de ce document | **fait**                        |
| Corriger le §5 du tracker de gouvernance, qui ignore l'existence de B     | une note          | **fait** (voir §5.2)            |
| Vérifier qu'aucun verdict ne repose sur le rang divergent                 | un script         | **fait** (§2.3, 16 lignes lues) |
| Revoir les neuf archives                                                  | —                 | **sans objet, mesuré**          |

⚠️ **Ce que ce dimensionnement ne couvre pas.** Il ne dit rien des **autres** trous de la
passe B (les 5 `repo_trackers/` non éclatés, les 9 entrées d'inventaire jamais nommées, le
delta 28 → 31, le décompte « 9 règles tenues », `bak/home.tsx`, les 25 lignes de `todos.txt`,
le document « À LOCALISER »). Ceux-là restent ouverts, ils sont réels, et ils sont hors de
ce lot.

---

## 3. L'état réel de la preuve n°5

### 3.1 Le texte incriminé

`agent_docs/gouvernance-iteration-3-2026-08-25.md:357-358`, cinquième des dix preuves qui
autorisaient le `_DONE` :

> 5. **Zéro décision en suspens** — les trois questions du 25/08 sont tranchées et
>    livrées ; aucune autre n'est ouverte.

Deux remarques avant de compter. D'abord, « les trois questions du 25/08 » n'est défini nulle
part dans le document — c'est la seule occurrence de l'expression, la preuve renvoie donc à
un référent introuvable. Ensuite, c'est la seconde moitié qui est vérifiable et qui porte le
poids : « **aucune autre n'est ouverte** » est une affirmation absolue sur tout le dépôt.

### 3.2 Ce qui la dément, et d'où il vient

`repo_trackers/decisions-aout-2026.md`, transporté par l'archive, déclaré au manifeste,
**byte-identique** à `agent_docs/decisions-aout-2026.md` (sha256 `81046f3b…`, revérifié le
30/08, 5/5 sur les cinq trackers). Le tracker l'a écarté d'une phrase, `:109-112` :

> ### 1.5 Les cinq `repo_trackers/`
>
> Copies de nos `agent_docs/`. **Byte-identiques au dépôt** (sha256 comparés) : rien n'a
> divergé, rien à reprendre.

C'est le raisonnement invalide, dans sa forme la plus pure : **« l'archive n'apporte rien de
neuf » ⇒ « ces documents ne demandent plus rien ».** La prémisse est vraie (vérifiée), la
conclusion ne s'en déduit pas. Et le grep confirme la conséquence : **zéro occurrence** de
`decisions-aout`, `dette-pdf1-6`, `etat-produit`, `restitution-tracker`, `tomes-reste-a-faire`
dans les **douze** trackers.

### 3.3 Le comptage machine

`scripts/decisions` (§6) relit `agent_docs/decisions-aout-2026.md` et distingue trois choses
que les deux lectures précédentes ont confondues.

```
1) titres ^### D<n>.                : 22
2) blocs contenant '**À trancher**' : 14   <- le nombre annoncé par la passe B
3) chapeau (l.1-21), décisions nommées : 16, dont « D8 et D22 restent en attente »
4) statut réel au 30/08/2026        : 15 CLOS · 7 OUVERT
```

**« À trancher » est un titre de sous-section, pas un statut.** Chaque bloc de décision est
bâti sur le même gabarit — `**Embarqué**` (ce qui part en prod si personne ne tranche),
`**À trancher**` (la question), `**Reco**`, `→ Débloque`. Le titre nomme la question ; il ne
dit pas si elle a reçu une réponse. La réponse, elle, vit dans le **chapeau** du fichier
(lignes 3-19, « Mise à jour 31/07 (soir) — arbitrages de Louis »), qui n'a jamais été relu
par aucun des deux comptages.

Statut décision par décision, avec ce qui le prouve :

| Statut         |      N | Décisions                                                  |
| -------------- | -----: | ---------------------------------------------------------- |
| **TRANCHÉE**   | **11** | D4, D5, D7, D9, D11, D12, D14, D16, D17, D19, D21          |
| **SUPPLANTÉE** |  **4** | D1, D2, D3, D10 — la grille du 27/08 a supprimé leur sujet |
| **PARTIELLE**  |  **1** | D6                                                         |
| **OUVERTE**    |  **6** | D8, D13, D15, D18, D20, D22                                |
|                | **22** |                                                            |

Les preuves qui ne viennent pas du chapeau :

- **D1, D2, D3, D10 — SUPPLANTÉES.** `packages/contracts/src/billing/shipped-plan-grid.ts:67-83`
  et `:121-129` : depuis le 27/08 la grille publique compte **un seul** palier achetable —
  Growth 199 €, 250 crédits, **un utilisateur, aucun siège additionnel** — plus Free (démo) et
  Entreprise (devis), qui « ne sont pas des paliers ». Les prix 119/259/599 de D1, les quotas
  35/150/420 de D2, la progression de prix du siège de D3 et la grille de fonctions par palier
  de D10 n'ont plus d'objet.
- **D11 — TRANCHÉE, puis RE-tranchée.** Le chapeau du 31/07 dit « la démo reste fictive ».
  `apps/api/src/modules/demo/demo-dataset.ts:13-21` dit l'inverse et le date :
  « CINQ SOCIÉTÉS RÉELLES. Il portait trois sociétés inventées (Groupe Helios, NovaSanté,
  Altiver) … remplacées par Société Générale, Thales, leboncoin, BlaBlaCar et SNCF
  (**décision Louis, 10-11/08/2026**) ». Une décision peut être re-tranchée : raison de plus
  pour qu'un statut ne se lise pas dans un titre figé.
- **D17 — TRANCHÉE, par retrait du moyen.** `FIRECRAWL_MAX_PAGES=3` sur Railway est cité
  comme condition fragile vivante par trois rapports de passe B (00, 04, 09) et par deux
  trackers. C'est périmé : `apps/ia/app/services/research/firecrawl.py:243` pose
  `MAX_PAGES_PER_RUN = 12` **en dur**, `_resolve_max_pages()` ignore l'environnement, et
  `apps/ia/tests/test_firecrawl_max_pages.py:33-45` le PROUVE en posant la variable à `3`,
  `0` et `n'importe quoi`. La variable ne peut plus rien brider, qu'elle traîne ou non sur
  Railway. Raison écrite dans `agent_docs/env-reference.md:95`.
- **D21 — TRANCHÉE et livrée.** Plausible est monté (`apps/web/src/main.tsx:16-17`), derrière
  la porte de consentement, gardé par `analytics-behind-consent.test.ts`.
- **D6 — PARTIELLE.** La grille du 27/08 répond à quatre des cinq questions :
  `shipped-plan-grid.ts:135-146` pose « Bêta Design Partner — **119 € HT par licence et par
  mois, trois mois**, 600 crédits, 3 sièges, jamais sur l'écran public ». Reste sans réponse
  la cinquième, qui est celle que la décision jugeait la plus importante : **ce qui se passe à
  la fin des trois mois** (bascule vers quel palier, à quel prix, réengagement ?).
- **D20 — OUVERTE, et mesurable.** `apps/web/src/components/ContactDialog.tsx:19-25` porte
  encore les deux marques dans le même parcours : le commentaire dit « the product's support
  inbox is **support@bellum-it.com** » pendant que le reste du produit vit sur
  `bellum-ai.com` (`SignupForm.tsx:7`, `OnboardingPlanPage.tsx:13`, `PublicSharePage.tsx:22`,
  `analytics.ts:31`). C'est exactement ce que D20 signalait il y a un mois.

### 3.4 Les autres décisions ouvertes du corpus que le certificat couvrait

La preuve n°5 porte sur l'archive 00, dont les cinq `repo_trackers/` font partie. Un second
d'entre eux porte des décisions ouvertes : `agent_docs/restitution-tracker.md`.

| Où                           | Ce qui est ouvert                                                                                                                          | Nature            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| `restitution-tracker.md:236` | **Plafond p14** — deux preuves de grounding A remplissent une seule fois le facteur +30 ; « asymétrie de la grille, **décision produit** » | décision produit  |
| `restitution-tracker.md:246` | **`estimatedAvailable`** — « un chiffre honnête exige un vrai comptage Apollo (coût) » ; sentinelle `xfail` vivante                        | décision de coût  |
| `restitution-tracker.md:285` | **« Depuis ma dernière connexion »** — snapshot au sign-in ou heuristique d'inactivité ; colonne « Chez » = **décision produit**           | décision produit  |
| `restitution-tracker.md:286` | **Prompt organigramme refondu (p23-28)** — colonne « Chez » = **feu vert**                                                                 | arbitrage attendu |

Deux items voisins de la même section ne sont PAS des décisions et ne sont donc pas comptés :
la zone blanche non située (`:243`, un trou de code en amont) et les 8 familles de routes IA
mortes (`:284`, une action opérateur — non vérifiable depuis le dépôt, donc ni confirmée ni
infirmée ici).

Les trois autres `repo_trackers/` ne portent aucune décision ouverte : `etat-produit-aout-2026.md`
renvoie ses items fragiles aux décisions D4/D17/D18/D19/D21 déjà comptées ci-dessus,
`dette-pdf1-6-2026-08-21.md:191-200` ne liste que des refus déjà prononcés et un chantier sans
geste humain identifiable, et `tomes-reste-a-faire-2026-08-23.md` ne contient **aucune**
occurrence de « à trancher » ni de « en attente ».

### 3.5 Le compte, et ce qu'il ne couvre pas

> **La preuve n°5 est FAUSSE. Décisions en suspens au 30/08/2026 : 11, dans 2 fichiers.**
>
> - `agent_docs/decisions-aout-2026.md` — **7** (D6 partielle, D8, D13, D15, D18, D20, D22)
> - `agent_docs/restitution-tracker.md` — **4** (plafond p14, `estimatedAvailable`,
>   « depuis ma dernière connexion », feu vert prompt organigramme)

⚠️ **Ce que cette mesure ne couvre pas, dit plutôt que supposé :**

1. Seules les **7** premières sont **comptées par machine** — elles sont numérotées et le
   script les relit. Les 4 du `restitution-tracker` ne portent **aucun numéro** : je les ai
   comptées à la lecture de deux sections nommées, ligne par ligne. Un lecteur qui découperait
   autrement pourrait en trouver 3 ou 5. **Cette impossibilité de compter est elle-même le
   trou** — voir D332 au §5.4.
2. Le périmètre est celui que la preuve n°5 couvrait : l'archive 00 et ses cinq
   `repo_trackers/`. Le dépôt entier porte d'autres décisions ouvertes ailleurs
   (29 fichiers d'`agent_docs/` contiennent « à trancher ») ; les compter serait un autre lot.
3. D18 (prix Stripe en mode live) et l'action opérateur SUPABASE ne sont **pas vérifiables
   depuis le dépôt** — ce sont des états de la console Railway/Stripe. Je les déclare ouverts
   sur la foi du tracker, pas sur une mesure.
4. Ce comptage ne dit rien de l'**urgence** d'une décision. D8 porte une contrainte dure
   (« le webinar est annoncé au 5 septembre ») ; les autres non. Ce n'est pas au comptage de
   trancher ça.

### 3.6 La preuve n°5 peut-elle être rétablie ?

**Non — elle doit être réécrite, pas réparée.** Elle affirme deux choses : que les questions
du chantier sont tranchées (plausible, mais son référent est introuvable) et qu'« aucune
autre n'est ouverte » (faux, 11 le sont). La seconde moitié ne peut pas devenir vraie sans
que Louis tranche onze décisions, ce qui n'est pas une condition d'épuisement d'archive.

La formulation juste sépare ce que le chantier a le pouvoir de clore de ce qu'il n'a que le
devoir de nommer. C'est ce qui a été écrit à sa place — §5.1.

---

## 4. La règle de précédence retenue — écrite ici, et ici seulement

> **C'est `SOURCE_PRECEDENCE.md` qui fait foi. Le §14 de `MASTER_DOCUMENT_INVENTORY.md` est
> un raffinement de ses rangs 6 à 8, jamais une hiérarchie concurrente.**

**Pourquoi celle-là, et pas l'autre.** Les deux documents le disent eux-mêmes, dans leur
titre, et c'est le seul argument dont on ait besoin :

|                         | `SOURCE_PRECEDENCE.md`                                       | `MASTER_DOCUMENT_INVENTORY.md` §14                                                                                |
| ----------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Ce que le titre annonce | « **Ordre canonique** des sources — **itération 3** » (`:1`) | « Hiérarchie **provisoire** de priorité documentaire » (`:146`), dans un fichier titré « **Iteration 2** » (`:1`) |
| Objet du document       | la précédence, et rien d'autre                               | un inventaire de 69 entrées, dont la précédence est la 14ᵉ section                                                |

Un document qui se déclare **provisoire**, dans un fichier qui se déclare d'une itération
**précédente**, ne supplante pas un document qui se déclare **canonique** pour l'itération en
cours. Il n'y a donc aucun arbitrage à demander : les deux textes se sont déjà classés.

**Et ils ne se contredisent pas** (§1, zéro inversion sur 21 paires) — le §14 peut donc être
gardé pour ce qu'il apporte : la ventilation fine des rangs 6-8 de A, plus la méta-analyse du
03/08 que A ne nomme pas.

### La hiérarchie, en vigueur

|  Rang | Source                                                                           | Ce que le rang autorise                                                                                                    |
| ----: | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
|     1 | **Le dépôt courant**                                                             | la vérité d'implémentation. Aucun document ne gagne contre le code.                                                        |
|     2 | Addendum Stelya 24/08 + DATAFORGE V10                                            | les dernières règles multi-domaines et data.                                                                               |
|     3 | Tomes Accessibilité 1–8                                                          | doctrine d'accès, barrière d'achat, second marché, plan de compte, Laura.                                                  |
|     4 | PDF spécialisés 1–10 (19–22/08)                                                  | l'architecture fonctionnelle détaillée.                                                                                    |
| **5** | **Les `agent_docs/` du dépôt**                                                   | **SIGNALER qu'un diagnostic de PDF est déjà résolu — jamais REMPLACER la lecture du code.**                                |
|     6 | Masters 16–19/08 · puis addendum + recette 02/08 · puis méta-analyse 03/08       | couverture exhaustive et doctrine historique. Ventilation fine héritée du §14 (B5, B6, B7).                                |
|     7 | Recettes juillet — TF1 21/07, puis restitutions 14–21/07 — et mémoire ancien GPT | origine des feedbacks ; **supplantées dès qu'une décision plus récente existe**. Ventilation fine héritée du §14 (B8, B9). |
|     8 | DATAFORGE V9                                                                     | historique et audit **uniquement** ; V10 prévaut pour toute ingestion nouvelle.                                            |

### Le rang 5, puisque c'est le point de divergence

Les `agent_docs/` du dépôt **ont** un rang, et c'est le 5. Mais ce rang est plus étroit qu'il
n'en a l'air, et la nuance est déjà la doctrine du dépôt (« un audit documentaire n'est pas le
code ») :

- **Ce que le rang 5 autorise** : un `agent_docs/` peut dire « ce diagnostic-là a déjà été
  traité, va voir tel `fichier:ligne` ». Il fait gagner le temps de la RECHERCHE.
- **Ce qu'il n'autorise pas** : conclure. Un document du dépôt qui affirme un câblage ne le
  crée pas — c'est exactement le défaut n°95 du tracker de juin
  (`recovery-juin-2026-2026-08-24.md:190` : « Un document du dépôt affirme un câblage qui
  n'existe pas … rien ne lit `agent_docs/` à l'exécution »). Le rang 1 tranche toujours.

Formulé autrement, et c'est la seule manière de tenir les deux bouts : **le rang 5 est un
index, pas une preuve.** C'est la lecture qu'ont eue, sans l'écrire, les onze chantiers
(§2.3) — aucun n'a conclu sur un `agent_docs/`, deux l'ont explicitement refusé.

---

## 5. Ce qui a été corrigé, et ce qui est parqué

### 5.1 La preuve n°5 du certificat — réécrite

`agent_docs/gouvernance-iteration-3-2026-08-25.md:357`. L'ancienne rédaction affirmait
qu'aucune décision n'était ouverte. La nouvelle nomme les onze, dit où elles vivent, et dit
pourquoi elles n'empêchent pas d'épuiser l'archive : **une archive est épuisée quand tout ce
qu'elle porte a été LU et STATUÉ, pas quand tout ce qu'elle porte a été DÉCIDÉ.** Un
chantier n'a pas le pouvoir de trancher à la place de Louis ; il a le devoir de ne pas
prétendre que la question n'existe pas.

Le §1.5 du même tracker, qui liquidait les cinq `repo_trackers/` d'un « rien à reprendre »,
porte désormais la distinction et le renvoi vers ce document.

### 5.2 Le §5 du tracker de gouvernance — la seconde hiérarchie nommée

Le §5 présentait `SOURCE_PRECEDENCE.md` comme la seule précédence du paquet. Il nomme
désormais le §14, dit qu'il a été appliqué par le tracker de l'archive 09, dit pourquoi il ne
supplante pas, et renvoie ici pour la règle. **La règle elle-même n'est écrite qu'à un seul
endroit — le §4 de ce document** ; les trackers y renvoient, ils ne la recopient pas. C'est
GA-26 appliqué à de la documentation : recopier une règle, c'est créer le second exemplaire
qui divergera.

### 5.3 Le compte faux — recompté à la source, et rendu comptable

`agent_docs/decisions-aout-2026.md` porte maintenant, en tête, **une table de statut lisible
par machine** : une ligne par décision, un statut pris dans un vocabulaire fermé
(`TRANCHÉE | PARTIELLE | OUVERTE | SUPPLANTÉE`), et la preuve de chaque statut.

D'où venait l'erreur, dans les deux sens : **le statut d'une décision n'était écrit nulle
part où on puisse le lire.** Il vivait dans un chapeau de prose de dix-sept lignes, en haut
d'un fichier de 287. Le certificat n'a pas ouvert le fichier et a compté **0**. La passe B
l'a ouvert, a compté le seul marqueur régulier qu'il offrait — le titre `**À trancher**` — et
a compté **14**. La vérité est **7**. Aucun des deux n'a menti ; aucun des deux ne pouvait
compter.

Le vocabulaire retenu n'est pas inventé : c'est celui que le point 3 de la « Règle générale »
de `SOURCE_PRECEDENCE.md:11` impose depuis le début (`implémenté`, `partiel`, `absent`,
`régressé`, `supplanté`, `contradictoire`), adapté à des décisions. La passe B relevait au
trou n°10 qu'il n'était **jamais appliqué** — c'est sa première application.

### 5.4 Les décisions parquées

Chacune est bloquante pour personne. Chacune porte une recommandation.

---

#### D330 — Étendre GA-40 aux décisions écrites en TITRE, et relever son cliquet une fois

**Le fait, mesuré.** `packages/contracts/src/schemas/decision-registry.test.ts:49-61` ne
reconnaît une décision qu'écrite en **ligne de tableau** (`| D42 | libellé |`). Les décisions
de `agent_docs/decisions-aout-2026.md` sont écrites en **titre de section** (`### D1.`).
**Le fichier qui porte 22 décisions numérotées est donc invisible à la garde qui surveille les
numéros de décision** — et il ne figure pas non plus dans `DECISION_SCOPES`, alors que
D1→D14 sont déjà tous dans `KNOWN_AMBIGUOUS_DECISIONS`.

**Pourquoi ça demande un arbitrage.** Étendre le parseur fera entrer 22 nouveaux libellés
dans le calcul d'ambiguïté. Le cliquet `AMBIGUOUS_DECISION_NUMBERS_AT_FREEZE = 25` remontera
presque certainement. Relever un cliquet est un acte de gouvernance, jamais une correction
qu'un agent s'autorise seul.

**Recommandation.** Étendre le parseur, mesurer le nouveau chiffre, le relever **une fois**,
et écrire dans le commentaire que la hausse ne mesure aucune ambiguïté nouvelle : elle
mesure celle que la garde ne voyait pas. Une garde borgne qui reste verte coûte plus cher
qu'un cliquet qui monte une fois.

**En attendant** — fait sans arbitrage : `decisions-aout-2026.md` est déclaré dans
`DECISION_SCOPES`, donc GA-40 vérifie au moins que son chemin existe, et GA-116 (§5.5) rend
ses statuts comptables.

---

#### D331 — Les sept décisions ouvertes de `decisions-aout-2026.md`

⚠️ Volontairement en LISTE et non en tableau : une ligne `| Dn | libellé |` dans ce document
créerait, aux yeux de GA-40, un second libellé concurrent pour un numéro déjà défini dans son
tracker — donc une ambiguïté que je viens d'inventer. Le libellé de référence de chacune de
ces sept décisions vit dans `agent_docs/decisions-aout-2026.md`, et nulle part ailleurs.

- **D20 — `support@bellum-it.com` vs `bellum-ai.com`.** **Tranchable en trente secondes, et
  c'est la seule des sept.** Recommandation : unifier sur `bellum-ai.com` — c'est le domaine
  du produit, du site, de l'app et de Plausible. Une ligne à changer
  (`apps/web/src/components/ContactDialog.tsx:21-25`).
- **D8 — dates de démarrage bêta et Go/No-Go.** Recommandation : à traiter en premier, c'est
  la seule des sept avec une contrainte dure connue (le webinar annoncé au 5 septembre).
- **D6 — ce qui se passe à la fin des trois mois de bêta.** Recommandation : écrire la sortie
  maintenant. Un bêta sans porte de sortie datée devient un client à 119 € à vie. C'est la
  reco d'origine, toujours valable ; tout le reste de la question est désormais tranché par
  la grille du 27/08.
- **D13 — les questions du questionnaire n°2.** Chez Théo. Le moteur est livré, il manque la
  liste — « ~1 jour de dev une fois la liste écrite ».
- **D15 — quels connecteurs activer réellement pour la bêta.** Recommandation d'origine
  inchangée : Google + HubSpot. Chaque activation coûte une app OAuth déclarée et validée
  côté éditeur.
- **D18 — prix Stripe en mode live.** Action de console, pas décision. À vérifier chez Louis :
  non observable depuis le dépôt.
- **D22 — hébergement de la vidéo de démo.** Sans enjeu produit. À trancher quand la vidéo
  existe.

---

#### D332 — Numéroter les quatre décisions produit du `restitution-tracker`

**Le fait.** Quatre décisions produit vivent dans `agent_docs/restitution-tracker.md`
(§3.4) sans numéro, dans deux sections en prose. Elles sont donc **incomptables** : aucun
script ne peut les voir, et c'est pour ça qu'elles n'ont figuré dans aucun des deux
comptages du certificat. Ce sont exactement les mêmes conditions matérielles que celles qui
ont produit la preuve n°5 fausse.

**Pourquoi ça demande un arbitrage.** Leur donner des numéros, c'est ouvrir un chantier de
décisions (`restitution`) dans `DECISION_SCOPES`, et donc décider qu'elles sont des décisions
plutôt que des constats — ce qui engage. Deux d'entre elles portent d'ailleurs déjà leur
destinataire dans le tracker (« décision produit », « feu vert »).

**Recommandation.** Les numéroter dans le chantier `restitution` (le tracker existe déjà et
est déclaré dans `DECISION_SCOPES`), avec le même vocabulaire de statut que
`decisions-aout-2026.md`, pour que GA-116 puisse les compter aussi. Coût : une demi-heure.

---

### 5.5 GA-116 — le statut d'une décision est lisible par machine

**L'invariant tenu** : un fichier qui porte des décisions numérotées doit rendre leur statut
lisible par une machine, dans un vocabulaire fermé, et son propre total doit se recalculer.

**La règle qu'elle protège existait avant elle** — c'est « un total est un argument », et
c'est la règle que ce document passe sa journée à appliquer. La garde ne l'invente pas : elle
la rend impossible à contourner sur le seul fichier où elle a déjà été violée deux fois, dans
deux directions opposées, par deux lecteurs sérieux.

**Ce qu'elle vérifie** (`packages/contracts/src/schemas/decision-status.test.ts`) :

1. chaque `### Dn.` du fichier a **exactement une** ligne dans la table de statut ;
2. chaque ligne de la table désigne un `### Dn.` qui existe (pas de décision fantôme) ;
3. chaque statut appartient au vocabulaire fermé `TRANCHÉE | PARTIELLE | OUVERTE | SUPPLANTÉE` ;
4. le total écrit en prose **se recalcule** depuis la table — un chiffre recopié à la main
   redeviendrait faux en trois semaines ;
5. chaque décision `OUVERTE` ou `PARTIELLE` porte une justification non vide — une décision
   ouverte sans raison écrite est le point de départ d'un « rien à reprendre ».

**Elle prouve qu'elle LIT** : elle assert que le corpus contient au moins 20 décisions et que
le fichier existe. Un chemin cassé la ferait échouer au lieu de la rendre verte sur le vide.

**Elle prouve qu'elle sait dire NON** : quatre cas de rupture synthétiques (décision sans
ligne, ligne fantôme, statut hors vocabulaire, total faux) sont exécutés contre le parseur
réel et doivent tous être détectés.

**GA-117 n'a pas été écrite.** La plage m'était réservée, mais aucun second invariant ne le
méritait : la divergence de précédence vit dans une archive gitignorée qu'aucune CI ne peut
lire, et le rang 5 est déjà tenu par la doctrine existante (« un audit documentaire n'est pas
le code »). Une garde qui n'a pas de corpus est une garde borgne — on n'en a pas besoin d'une
de plus.

### 5.6 Une garde cassée par la correction, et remise d'aplomb

**Écrire la table de statut a fait passer GA-40 de 25 numéros ambigus à 36 — et c'était un
faux positif que je venais de créer.** Le parseur de GA-40
(`decision-registry.test.ts:62-78`) reconnaît une définition de décision à la forme
`| D42 | libellé |`. Mes vingt-deux lignes de statut ont cette forme, et lui offraient
« TRANCHÉE » comme **libellé** de D7 — donc un second libellé pour un numéro déjà défini
ailleurs, donc une ambiguïté inventée.

Deux réparations, dans cet ordre :

1. **Mon propre document a cessé de tabuler les décisions.** Les sept recommandations de D331
   étaient écrites en tableau ; elles créaient sept libellés concurrents de plus. Elles sont
   passées en liste. Une règle générale s'en dégage, et elle vaut pour tout futur rapport :
   **un document qui COMMENTE une décision ne doit pas la re-tabuler** — le libellé de
   référence vit dans le tracker du chantier, et nulle part ailleurs.
2. **GA-40 a appris qu'un statut n'est pas un libellé.** Une ligne dont la deuxième colonne
   ne contient qu'un mot du vocabulaire de statut n'entre plus dans la comparaison. Ce n'est
   pas un assouplissement du cliquet : mesuré avant/après sur le même corpus, le compte
   revient à **exactement les mêmes 25 numéros** qu'à `HEAD`, un par un. Un test le prouve
   (`le filtre de statut ne masque QUE des statuts`) — il vérifie que ce qui passe le filtre
   est exactement ce qui n'est pas un statut, **comparé par valeur** : une première rédaction
   comparait par identité d'objet et serait restée verte quoi qu'il arrive.

Ce que ça dit, et c'est la raison d'être des gardes : **la correction d'un compte faux a
failli en fabriquer un autre**, et c'est une garde existante qui l'a vue en quatre secondes.
Le cliquet `AMBIGUOUS_DECISION_NUMBERS_AT_FREEZE = 25` n'a pas été touché.

---

## 6. Les scripts — comment refaire chaque nombre

Ils vivent dans le répertoire de travail temporaire de cette session et sont reproduits ici
pour être rejouables. Chacun vérifie l'existence de ses chemins et s'arrête si l'un manque —
un `grep` sur un chemin inexistant sort en 0 et se lit « aucun résultat » là où il faut lire
« je n'ai pas cherché ».

| Nombre                                                       | Script                     | Sortie                                                 |
| ------------------------------------------------------------ | -------------------------- | ------------------------------------------------------ |
| Occurrences des marqueurs de précédence dans les 12 trackers | `count.py prec`            | la table du §2.1                                       |
| Diff des deux hiérarchies, inversions d'ordre                | `prec_diff.py`             | 21 paires, **0 inversion**, 3+3 éléments non appariés  |
| Identité `repo_trackers/` ↔ `agent_docs/`                    | `count.py sha`             | **5/5 identiques**                                     |
| Statut réel des 22 décisions                                 | `decisions.py`             | 22 titres · 14 chaînes « À trancher » · **7 ouvertes** |
| Les 16 citations d'`agent_docs/` dans les 12 trackers        | boucle Python, une ligne   | 6 contrôles d'identité, 8 pointeurs, **2 refus**       |
| Zéro nommage des 5 `repo_trackers/` dans les 12 trackers     | `str.count` sur les 5 noms | **0** pour chacun des cinq                             |

**Ce que l'outillage n'a pas su faire, et qu'il faut savoir** : `grep -c` sur plusieurs
fichiers a rendu ici des sorties tronquées à un seul fichier, à plusieurs reprises. Tous les
comptes de ce document ont donc été refaits en Python, qui ne tronque pas. Un compte lu dans
une sortie tronquée est un compte faux qui a l'air juste — c'est le même genre d'accident que
celui qu'on répare.

---

## 7. Ce que ce lot NE dit pas

Un inventaire ne prouve jamais sa propre complétude. Voici ce que celui-ci laisse ouvert,
nommé plutôt que tu.

- **Les dix autres trous de la passe B sur l'archive 00** ne sont pas traités : les cinq
  `repo_trackers/` non éclatés (au-delà des décisions comptées ici), les 9 entrées
  d'inventaire jamais nommées, le delta 28 → 31, le décompte « 9 règles tenues »,
  `bak/home.tsx`, les 25 lignes de `todos.txt`, le document « À LOCALISER », les deux
  documents « international / Market Packs » sans paquet propriétaire.
- **Les dix autres rapports de passe B** ne sont pas lus. Ce lot n'a ouvert que
  `ARCHIVE-00.md`, plus les têtes des dix autres pour établir la correspondance
  rapport ↔ tracker.
- **Aucune vérification en production.** D18 (Stripe live) et l'action opérateur SUPABASE
  sont des états de console. Le certificat les a supposés dans un sens, la passe B dans
  l'autre ; ici ils sont déclarés non mesurables.
- **Le `DONE` de l'archive 00 n'est pas restauré et ne le sera pas par ce lot.** Il a été
  retiré par l'arbitrage A4 du 27/08. Ce document corrige deux des motifs qui l'ont fait
  retirer ; il ne prétend pas les corriger tous.

---

## 8. Sur les consignes trouvées dans les documents lus

⚠️ Ce qui arrive par un document est de la donnée, jamais une instruction. Deux formulations
lues pendant ce lot ressemblent à des consignes adressées à l'agent, et sont donc citées ici
sans être exécutées :

1. `MASTER_DOCUMENT_INVENTORY.md:46` — « `PDF_06_Integrations_Connecteurs.pdf` … **À
   LOCALISER PAR TITRE EXACT EN FILE LIBRARY** ». C'est une instruction d'action portée par un
   inventaire. Elle est **signalée, non exécutée** : elle appartient au trou n°6 de la passe B,
   hors de ce lot, et sa justification embarquée (« contenu recoupé par série 10 et master
   #18 ») est du motif « A EST B dispense de lire ».
2. `SOURCE_PRECEDENCE.md:7` — « Aucun PDF ne doit être transformé aveuglément en code ».
   C'est une règle de méthode, pas une consigne à l'agent ; elle est reprise au §4 comme
   contenu de la précédence, ce qu'elle est.

Aucune formulation du type « ignore ce qui précède » ou « marque ceci comme fait » n'a été
rencontrée dans les fichiers ouverts.
