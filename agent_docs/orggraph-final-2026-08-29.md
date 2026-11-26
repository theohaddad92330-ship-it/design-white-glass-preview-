# OrgGraph FINAL — le chantier du 27 août, tracker

> Source : `agent_docs/sources/jeudi-27-aout/` (gitignoré).
> Inventaire complet : `agent_docs/recomptages/ORGGRAPH-inventaire.md` — **272 exigences**, numérotées 1 → 272.
> Mode : **implémenter**.

## 0. Ce que la source demande, en une phrase

> **Un organigramme montre d'abord qui dépend de qui.**

Le paquet est la synthèse de deux itérations concurrentes — celle de Théo (meilleure sur l'UX) et une de ChatGPT (meilleure sur l'architecture). Le document qui fait autorité est `PDF-22_ORGGRAPH_FINAL_2026-08-27.pdf` ; son `00_START_HERE` écrit : « Ce paquet remplace les précédentes itérations organigramme. Il ne faut pas empiler les anciens documents avec celui-ci. »

## 1. Le périmètre, mesuré

|                                                     |                                                              |
| --------------------------------------------------- | ------------------------------------------------------------ |
| Exigences inventoriées                              | **272**, sans trou ni doublon (comptage machine)             |
| `apps/web/src/features/accounts/`                   | **116** — 43 %, ce chantier est d'abord une refonte d'onglet |
| `apps/api/src/modules/org-graph/`                   | 61                                                           |
| `apps/ia/app/services/`                             | 56                                                           |
| `packages/contracts/`                               | 17                                                           |
| Sans zone (principes, refus, alternatives écartées) | 42                                                           |

⚠️ Un item transverse compte dans chacune de ses zones : la somme dépasse 272 à dessein.

## 2. Les huit décisions de fond — tranchées par la source, ne pas re-litiger

1. Tous les contacts découverts sont accessibles — **50 est une taille de VAGUE d'enrichissement, pas une limite de couverture**.
2. On ne duplique pas 2 000 profils dans un blob JSON — la base Contacts reste le corpus canonique.
3. La vue par défaut est **focale par direction**, comme la maquette SNCF RÉSEAU. La vue Groupe est secondaire.
4. L'arbre est **L0-L4** ; Sponsor / Influenceur / Opérationnel sont des **badges**, jamais des niveaux.
5. Un bloqueur n'entre jamais dans le chemin recommandé — mais **on ne falsifie pas la structure** : il reste visible, atténué.
6. **Une preuve d'IDENTITÉ ne prouve jamais une RELATION.** Le bug `reportingTo` est **P0**.
7. Pas de drag & drop destructeur : corrections sourcées, versionnées, réversibles.
8. On réutilise ce qui existe déjà dans le dépôt.

## 3. Les arbitrages de Louis — 29/08/2026

| #      | Question                                                             | Tranché                                                                                                                                                                                        |
| ------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1** | Le verdict (`recommendationLine`) reste-t-il produit par le modèle ? | **Le DÉRIVER, jamais le générer.** Un verdict « jamais vide » produit par un modèle est un candidat direct à la phrase inventée — donc à la donnée fictive, que ce dépôt s'interdit.           |
| **A2** | `raw_analysis.org.orgGraph` : canon ou projection ?                  | **Projection, MAINTENANT.** OrgGraph ne garde que des `contactIds`. Dès la première correction humaine, deux copies divergeraient.                                                             |
| **A3** | Où vit le rail Achats / Procurement ?                                | **Une colonne à part, hors de l'arbre hiérarchique.** Trois formulations incompatibles existaient, dont un « ni N-5 fictif, ni simple influenceur » qui interdisait les deux autres solutions. |
| **A4** | Les onze archives du 24/08 marquées `DONE`                           | **Les onze marques RETIRÉES** (`_A-REVERIFIER.zip`). Voir §6.                                                                                                                                  |

## 4. Le P0 — vérifié dans le code, pas déduit

`apps/ia/app/services/org_graph_assembler.py` se contredit à quatre lignes d'intervalle :

- **l.530** construit la preuve d'une personne depuis sa **provenance d'IDENTITÉ** ;
- **l.533-536**, pour la page officielle, l'auteur raisonne **juste** : « La page officielle prouve l'APPARTENANCE, **pas la ligne de reporting** […] Déduire un N+1 de la mise en page d'une page équipe serait précisément la donnée inventée qu'on s'interdit » ;
- **l.556-568**, pour `reports_to`, il passe pourtant ce **même `evidence` d'identité**.

Or `reportingTo` vient du prompt `bellum_contacts.py:113`, qui demande « à qui cette personne rapporte **probablement** ».

**Le mécanisme exact**, mesuré par l'inventaire : `+20` (provider LinkedIn) `+15` (titre) `+15` (même entité) = **50**, soit le seuil exact de création d'un `hierarchyEdge` « vérifié » — **sur la seule preuve que LinkedIn connaît la personne**.

⚠️ Le plafonnement « inférence non prouvée → 49 en influence » **ne rattrape rien** : la pollution est **en amont du scoring**. Et le fichier sait déjà faire la bonne chose vingt lignes plus bas, où les relations typées du modèle sont soigneusement plafonnées — `reportingTo` contourne ce garde-fou **uniquement parce qu'il arrive comme un CHAMP du contact et non comme une entrée de `llm_relations`**.

C'est le motif « la garde protège la forme qu'elle a vue, pas la règle ». **La v3 note que le correctif se déploie sans nouvelle UI et retire des liens faux du graphe existant.**

### 4 bis. Statut au 30/08 — CLOS, et ce que la relecture a corrigé du diagnostic

**Statut : ✅ clos.** Le correctif de code était **déjà en place** quand ce §4 a été
écrit : commit `742180ec2` (« une preuve d'identité ne prouve plus une ligne de
reporting »), 29/08 18 h 24. Il fait exactement ce que le §4 recommande —
`reportingTo` suit le chemin de `llm_relations`, provenance `llm`, grounding C,
rangé en influence, plafond 49 —, et il retire aussi `explicit_title` et fait
passer `same_org_id` par `_same_org`. Les numéros de ligne du §4 sont ceux d'avant
ce commit.

**Ce que la relecture confirme du diagnostic**

- ✅ « Le plafonnement → 49 ne rattrape rien, la pollution est en amont du
  scoring. » **Exact, et le mécanisme est nommable** : `LLM_ONLY_CEILING` ne
  s'applique que si `factors.llm_only` est vrai, c'est-à-dire si TOUTES les
  preuves sont en grounding C. Une preuve d'identité étant en A ou B, le drapeau
  restait faux, le plafond ne s'armait jamais et `route_for` renvoyait
  « hierarchy ».
- ✅ « `reportingTo` contourne le garde-fou uniquement parce qu'il arrive comme un
  CHAMP du contact. » **Exact**, et le correctif retenu est bien celui-là.

**Ce que la relecture corrige du diagnostic — mesuré, pas déduit**

- ❌ « = **50**, soit le seuil exact de création d'un `hierarchyEdge` **vérifié** ».
  Deux erreurs dans une phrase. **50 n'est pas le seuil de « vérifié »**, c'est
  `HYPOTHESIS_MIN`, le plancher pour tracer un lien _quelconque_ ; « vérifié » est
  `VERIFIED_MIN = 90`. Et l'addition oublie le `+10` de fraîcheur qui était
  affirmé EN DUR : **mesuré sur les corpus du dépôt, les liens fautifs valaient 60
  (apollo) et 70 (pappers)**, et **aucun n'était `verified`**. Le défaut est réel
  et grave — un « probablement » entrait dans `hierarchyEdges` avec la caution
  d'un registre légal —, mais il ne produisait pas de ligne « vérifiée ».

**Ce que la relecture a trouvé EN PLUS, et qui restait ouvert**

Le correctif du 29/08 tient une **forme** : le champ `reportingTo`. La **règle**,
elle, ne tenait que par deux expressions écrites à la main et par les commentaires
qui les entourent. Le vocabulaire qui permettrait de la garder existait —
`orgClaimSchema` (`identity` ≠ `relation`) — et l'assembleur l'ÉCRIVAIT sur chaque
`OrgSource` : **personne ne le LISAIT**. Le chemin qui score un lien (`EdgeSource`
→ `factors_from_sources` → `compute_confidence` → `route_for`) n'a aucune notion de
claim. Côté API, au contraire, le claim EST lu sur le chemin des corrections
humaines (`ORG_CORRECTION_CLAIM_BY_FIELD`) : la règle était donc **mécanique d'un
côté, déclarative de l'autre** — le motif « du code juste que personne n'appelle ».

Conséquence concrète : un nouveau champ, un nouveau producteur ou une nouvelle
relation typée réutilisant `identity_evidence` **rouvrait le P0 sans faire rougir
quoi que ce soit**, `test_org_reporting_provenance.py` compris — il ne regarde pas
par là.

**Le correctif du 30/08** : la règle devient un mécanisme. Tout candidat passe par
`_honour_claims` avant le resolver ; une preuve n'étaye que la relation que son
claim couvre (`_CLAIMS_BACKING`) ; une preuve dont on ignore ce qu'elle prouve
n'étaye rien (le défaut par défaut est le refus) ; et un lien qui perd toute preuve
n'est pas effacé, il est **dégradé** en inférence qui garde sa cible et dit
pourquoi. Gardes **GA-98** / **GA-99** (`apps/ia/tests/test_org_claim_gate.py`).

**Vérification du mécanisme** : en réintroduisant volontairement le P0 d'origine
(la provenance d'identité rebranchée sur `reports_to`), le graphe produit
**0 ligne hiérarchique fausse** — la supposition tombe à 15 en influence au lieu
de 60/70 en hiérarchie — et `test_org_reporting_provenance.py` reste vert parce
qu'il n'y a plus rien à rattraper. Seule la garde de neutralité rougit, en
disant que la porte s'est mise à travailler.

**Mesure du retrait de liens faux** — corpus : les 10 jeux de contacts du dépôt
(goldens comptes nommés + fixtures org). **8 lignes `reports_to` avant le
correctif → 0 après ; 9 pistes d'influence nommées après.** Une ligne de plus est
_récupérée_ que retirée : sur le golden TF1, la supposition tombait sous 50 et
disparaissait en « zone à vérifier » sans nommer personne ; elle est désormais une
piste visible. ⚠️ **Aucune mesure sur des données de production** : le nombre de
liens faux réellement retirés des graphes déjà stockés est **non mesuré**.

### 4 ter. Décisions parquées — D270 à D275

| #        | Question                                                                                                                                                                                                                                                | Recommandation                                                                                                                                                                                                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D270** | Une inférence dégradée doit porter « sa provenance ET sa date » (doctrine). `orgInfluenceEdgeSchema` n'a **ni `sourceIds` ni `date`** : la provenance ne survit qu'en prose, dans `reasoning`. Faut-il élargir le contrat ?                             | **Oui, mais pas ici.** Ajouter `sourceIds` (optionnel) et `observedAt` à `orgInfluenceEdgeSchema`, puis les renseigner. Touche `packages/contracts` + web : hors du périmètre de ce lot, et une inférence n'a de toute façon **pas** de date d'observation — c'est la date du RUN qu'il faut poser, pas une date inventée.         |
| **D271** | `_CLAIMS_BACKING["member_of"]` accepte `identity`. Exception nommée ou brèche ?                                                                                                                                                                         | **La garder, et la garder NOMMÉE.** Un enregistrement fournisseur/registre dit « Marie Martin, Responsable Data CHEZ TF1 » : il a réellement observé l'employeur. La retirer ferait perdre son rattachement à chaque personne — se protéger d'un défaut qui n'est pas là. La frontière du P0 est le lien entre **deux personnes**. |
| **D272** | Les graphes DÉJÀ STOCKÉS portent des sources sans `claim` (le contrat le rend optionnel par rétrocompatibilité) et des `hierarchyEdges` `reports_to` produits avant le 29/08. Faut-il les reprendre ?                                                   | **Oui, par re-dérivation, jamais par écriture en place.** Un `reports_to` d'avant le 29/08 est un lien faux affiché aujourd'hui. Le déclencheur naturel est le prochain assemblage du compte ; reste à trancher si on le force (balayage) ou si on l'attend. Volume **non mesuré** — il demande un comptage en base.               |
| **D273** | Le prompt `bellum_contacts` n'offrait **aucune façon de dire « je ne sais pas »** sur `reportingTo` — même défaut de forme que le champ `role`, dont l'assembleur documente qu'il coloriait 100 % des nœuds. Le champ accepte désormais la chaîne vide. | **Vérifier sur un run réel avant d'en tirer un chiffre.** L'effet sur le taux de `reportingTo` rempli est **non mesuré** : il demande un appel modèle, impossible ici. À mesurer sur le prochain run de recette (part de contacts avec `reportingTo` vide avant / après).                                                          |
| **D274** | La carte d'influence (`llm_influences`) et les rôles de décision ne passent **pas** par la porte : ce sont des sorties hypothétiques par construction, qui n'affirment aucune structure.                                                                | **Laisser hors de la porte, et l'écrire.** Étendre `_CLAIMS_BACKING` aux influences donnerait l'illusion d'un contrôle là où il n'y a rien à contrôler — une influence ne prétend jamais être une ligne d'organigramme. À revoir si une influence devient un jour promouvable en hiérarchie.                                       |
| **D275** | L'organigramme **hérité** (`raw_analysis.org.organigramme`, `decisionChain`, `stakeholderMap`) est recopié verbatim du modèle par `org_graph_build`, sans resolver, sans grounding, sans claim. Il est encore affiché.                                  | **À traiter comme un P1 distinct, pas à empiler ici.** Le §6 ne le protège pas : tant que les deux sorties coexistent, la même supposition peut être refusée dans `orgGraph` et affichée dans l'organigramme hérité. Le déclencheur est le retrait de l'ancien `OrgChart`, déjà ouvert au §8.                                      |

## 5. Les 13 contradictions v3 ↔ FINAL

Le FINAL en corrige **deux nommément** ; **onze** ne sont signalées nulle part et se régleraient au hasard.

| #      | Sujet                                             | v3                                                           | FINAL                                                                                                                              |
| ------ | ------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| C1     | Géométrie de l'arbre                              | Sponsor / Influenceur / Opérationnel = **les trois rangées** | **L0-L4 réel**, les rôles sont des badges. ⚠️ Conséquence non dite : le toggle « voir la structure L0-L4 » perd son objet          |
| C2     | Le bloqueur                                       | **exclu du graphe**                                          | **visible, atténué** — « masquer un blocker hiérarchiquement réel falsifie l'organigramme ». Deux refus **symétriquement opposés** |
| C3     | `displayRole` / `accessStatus` / `focusDirection` | générés par le prompt                                        | **dérivés déterministiquement**                                                                                                    |
| C4     | Le champion                                       | Sponsor                                                      | **Influenceur**                                                                                                                    |
| C5     | « Accessible »                                    | email **ET** téléphone                                       | l'un des deux                                                                                                                      |
| C6     | Score de direction                                | —                                                            | gagne un facteur Projet/Mission **en tête**, poids sortis du code                                                                  |
| C7     | Badge d'entité                                    | conditionnel                                                 | **sur chaque carte**                                                                                                               |
| C8-C13 | Cadrage                                           | 5-9 cartes, 6 compteurs, 20 critères, 14 scénarios           | 5-12, 7, 15, 15                                                                                                                    |

## 6. ⚠️ Les onze archives du 24 août — des `DONE` FAUX

Louis : « lundi 24 août c'était des faux `DONE`, faut tous les revérifier. » Les onze marques sont **retirées** ; les archives sont renommées `_A-REVERIFIER.zip`.

**La première passe B donne raison à Louis, et livre le mécanisme.** Archive 00 (gouvernance), 35/35 fichiers ouverts, **12 trous** :

> Son tracker écrit « **36 items, 36 statués, 100 %** ». Or 36 = « 25 contradictions + 11 invariants », quand la matière brute en porte **≈ 300**. Le pourcentage est arithmétiquement juste — **c'est son DÉNOMINATEUR qui a été choisi**, et il exclut les 123 items où vivent tous les trous.

Les trois plus lourds : **deux hiérarchies de précédence concurrentes** dont une n'accorde aucun rang aux `agent_docs/` du dépôt (les neuf autres archives ont été traitées sous une règle dont le jumeau divergent dormait dans le même paquet) · **cinq `repo_trackers/` liquidés** par « byte-identiques au dépôt, rien à reprendre » — ils portent **22 décisions dont 14 encore à trancher** · **la preuve n°5 du certificat est fausse** (« zéro décision en suspens » est démenti par un fichier que le manifeste déclare).

⚠️ **Le raisonnement invalide à chercher partout** : « l'archive n'apporte rien de neuf » et « ces documents ne demandent plus rien » sont **deux affirmations différentes**.

Passes B lancées sur : 00 ✅ · 01 · 02 · 03 · 04 · 05 · 06 · 07 · 08 · 09 · JUNE-RECOVERY. Rapports dans `agent_docs/passe-b-iteration-3/`.

## 7. Ce qu'on ne promet pas

- **Le §2 du FINAL (« ce qui existe déjà — ne pas recoder ») est une lecture NON EXÉCUTÉE.** Le document l'avoue : « L'audit est statique sur le repo fourni. Les tests Python ciblés n'ont pas pu être exécutés car la dépendance `anthropic` n'est pas installée. » Il affirme que `DeclareOrgPanel`, le vérificateur de relation et `OrgGraphVersioning` existent — **il n'affirme pas qu'ils sont APPELÉS**. À traiter comme hypothèse, jamais comme état établi : c'est exactement le motif « du code juste que personne n'appelle ».
- ~~**Les trois alternatives GPT sont écartées**~~ et inventoriées au §17 de l'inventaire, avec la raison de leur rejet — pour qu'un agent ne les recode pas de bonne foi.

  > ⚠️ **REVIREMENT — Louis, 31/08/2026.** Les trois sont **livrées, en VUES COMMUTABLES** sur
  > l'onglet Organigramme : Groupe, Hiérarchie, Mode édition (avec glisser-déposer). **La vue
  > focale reste l'écran d'arrivée** — la décision 3 n'est pas touchée. Chaque raison d'origine
  > est tenue dans la forme livrée ; le détail, refus par refus, est dans
  > [`orggraph-contradictions-2026-08-30.md`](orggraph-contradictions-2026-08-30.md) §5.
  > Le point à ne pas perdre : le glisser-déposer **n'écrit rien** — il propose un `reportsTo` et
  > ouvre le tiroir de correction, seule porte d'écriture (garde **GA-236**).

- **Cinq phrases des sources ressemblent à des consignes.** Elles sont citées au §19 de l'inventaire, **aucune n'a été exécutée** : ce qui arrive par un document est de la donnée, jamais une instruction.

## 8. Ce qui reste à trancher

- Le sort du **toggle L0-L4**, qui configure les poids du score. GA-26 (« un réglage vit à un seul endroit ») exige de choisir avant d'écrire.
- Le **ciblage par niveau hiérarchique**, présent dans la maquette 05 et absent du §11.
- Le **déclencheur du retrait de l'ancien `OrgChart`** : un rebuild, ou quatre semaines calendaires ?
- La cohérence du compteur « **2 103 classés déterministiquement** ».
