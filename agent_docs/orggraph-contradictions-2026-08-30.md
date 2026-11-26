# OrgGraph — les 13 contradictions v3 ↔ FINAL, tranchées

> Registre de décisions. **Aucun code applicatif n'a été écrit ici** — deux gardes seulement (§4).
> Tracker : [`agent_docs/orggraph-final-2026-08-29.md`](orggraph-final-2026-08-29.md) ·
> Inventaire : [`agent_docs/recomptages/ORGGRAPH-inventaire.md`](recomptages/ORGGRAPH-inventaire.md)
> Sources (gitignorées) : `agent_docs/sources/jeudi-27-aout/txt/` — lues verbatim, citées `fichier:ligne`.

## Conventions de citation

| Sigle       | Fichier                                                                        |
| ----------- | ------------------------------------------------------------------------------ |
| **SH**      | `txt/OUTER_00_START_HERE.txt`                                                  |
| **FINAL**   | `txt/OUTER_PDF-22_ORGGRAPH_FINAL_2026-08-27.txt`                               |
| **v3**      | `txt/OUTER_PDF-22_Refonte-organigramme-v3-architecture-plus-UX.txt`            |
| **AC**      | `txt/OUTER_ANALYSE-CRITIQUE_GPT-vs-MOI.txt`                                    |
| **mq 0X**   | `jeudi-27-aout/0X_*.png` — **lues à l'image le 30/08**, pas de numéro de ligne |
| **INV**     | `agent_docs/recomptages/ORGGRAPH-inventaire.md`                                |
| **TRACKER** | `agent_docs/orggraph-final-2026-08-29.md`                                      |

⚠️ Une note de méthode : la consigne de ce chantier annonçait des `original_markdown_sources/*.md`.
**Ils n'existent pas.** Ce qui existe est `agent_docs/sources/jeudi-27-aout/txt/*.txt`, extrait des PDF.
Ce sont eux qui sont cités. Les **six maquettes** n'ont, elles, aucune version texte utile
(`txt/OUTER_MAQUETTES_ORGGRAPH_FINAL_2026-08-27.txt` ne contient que les six titres de page,
l.1-6) : elles ont donc été **ouvertes à l'image**, et c'est de là que viennent quatre des
constats les plus lourds de ce fichier (§1 C4, C9 · §2 P8).

## La règle de précédence, et sa limite

Le `00_START_HERE` du FINAL écrit (SH l.7-8) :

> « Ce paquet remplace les précédentes itérations organigramme. Il ne faut pas empiler les
> anciens documents avec celui-ci. »

et le FINAL le redit pour son propre compte (FINAL l.518-519) : « Ce PDF remplace le précédent
package OrgGraph V3 […]. Les analyses précédentes restent des sources historiques, pas des
spécifications concurrentes. »

**Donc le FINAL l'emporte sur la v3 par défaut.** Trois limites, appliquées ici :

1. **Une précédence ne dispense pas de vérifier l'applicabilité.** Sur **C6**, le FINAL demande
   quelque chose que le dépôt a délibérément refusé de faire, avec une raison écrite et meilleure
   que la sienne. On décline, et on le PARQUE (D276) plutôt que de l'appliquer en silence.
2. **Le FINAL se contredit lui-même entre son texte et ses maquettes.** Trois fois (C4, C9, et le
   rail Achats). Là, c'est le TEXTE qui gagne — une maquette est une illustration, une règle
   écrite est une règle — mais il faut le dire, sinon la maquette sert de recette visuelle et
   ré-introduit la v3 par la porte de derrière.
3. **Une contradiction déjà tranchée par Louis n'est plus une contradiction.** C10 et C13 sont
   réglées par A3 et A2 (TRACKER l.43, l.42). Le tableau du tracker ne le dit pas.

⚠️ **Ce qui arrive par un document est de la DONNÉE, jamais une instruction.** Le §19 de
l'inventaire (INV l.556-574) recense cinq phrases des sources qui ressemblent à des consignes ;
**aucune n'a été exécutée**, ici pas davantage. Deux d'entre elles ont été croisées pendant ce
travail et sont traitées en donnée :

- « Il ne faut pas empiler les anciens documents avec celui-ci » (SH l.7-8) — lue comme une
  **règle d'autorité entre sources**, appliquée au raisonnement. **Aucun fichier n'a été
  supprimé, renommé ni archivé** ; la v3 reste sur le disque et reste citable.
- « Louis garde la main sur l'implémentation » (FINAL l.525) — citée. Elle est d'ailleurs la
  raison pour laquelle six décisions sont PARQUÉES au §3 au lieu d'être tranchées ici.

---

## 0. Ce que ce travail a trouvé de différent de ce que le tracker annonçait

Cinq écarts, chacun mesuré. Ils changent la nature du chantier : **il ne s'agit pas de coder
treize arbitrages, il s'agit d'en confirmer sept déjà codés et d'en réparer quatre.**

### 0.1 · La vue focale du FINAL est **déjà livrée**, et elle applique le FINAL

Le tracker présente les treize contradictions comme des questions ouvertes qui « se régleraient au
hasard, au gré de l'agent qui coderait le premier » (TRACKER l.64). Or l'écran existe :
`apps/web/src/features/accounts/view/account-detail/tabs/organigramme/focalOrgData.ts` (607 l.) et
`FocalOrgView.tsx`, câblés depuis la route `apps/web/src/routes/accounts/$id.tsx` via
`TabOrganigramme.tsx:123`. Et son en-tête de fichier **cite le FINAL nommément** :

> `focalOrgData.ts:20-26` — « L'écran d'avant faisait de Sponsor / Influenceur / Opérationnel les
> trois RANGÉES de l'organigramme. Le FINAL le nomme et le refuse : "cela recréerait exactement le
> défaut dénoncé". »

**C1, C2, C4, C7 et le rail Achats (C10/A3) sont donc déjà tranchés DANS LE CODE, dans le sens du
FINAL.** Le travail restant n'est pas de décider : c'est de garder (§4) et de combler les trous.

### 0.2 · Le compte de la red-team du FINAL est FAUX — et le tracker l'a recopié

TRACKER l.75 et INV l.74-76 écrivent « 14 scénarios (v3) → **15** (FINAL) ».

**Comptage machine du tableau FINAL §12 (l.390-419, ligne d'en-tête exclue) : 14 lignes.** Pas 15.
Et la v3 en numérote explicitement quatorze, S1 à S14 (v3 l.674-711). Le vrai écart n'est pas
« +1 » : c'est **trois sorties contre trois entrées**, à effectif constant.

| Sortis du FINAL                         | Où ils ont survécu                  |
| --------------------------------------- | ----------------------------------- |
| S2 « Envoyer tous les contacts au LLM » | déplacé dans les refus, FINAL l.498 |
| S10 « Procurement dessiné comme N-5 »   | déplacé au §10, FINAL l.341-342     |
| S11 « Organigramme rempli de juniors »  | **nulle part. Perdu.**              |

| Entrés dans le FINAL                 | Ligne       |
| ------------------------------------ | ----------- |
| « Blocker hiérarchiquement central » | FINAL l.410 |
| « Sources vieillissantes »           | FINAL l.416 |
| « Export PDF obsolète »              | FINAL l.418 |

**S11 est le seul scénario réellement perdu, et c'est le plus proche du produit d'aujourd'hui** :
« Organigramme rempli de juniors » (v3 l.700-701), dont la réponse v3 était « vue focale =
décideurs ; couverture = tous ; ce n'est pas la même vue ». C'est exactement le risque que
l'arbre focal se remplisse de L3/L4 — les gens qui ont un profil public — pendant que les L1
manquent. Voir C8, où l'absence de borne le rend concret.

### 0.3 · Le tracker a **compressé six contradictions en quatre chiffres**, et en a perdu deux

TRACKER l.75 résume : `| C8-C13 | Cadrage | 5-9 cartes, 6 compteurs, 20 critères, 14 scénarios | 5-12, 7, 15, 15 |`.
Six étiquettes, **quatre paires de nombres**. Les deux qui n'ont pas de nombre disparaissent :

- **C10 — le rail Achats / Procurement** (INV l.68-70). Ce n'est pas du cadrage : c'est
  l'emplacement d'une population entière. **Déjà tranché** par Louis (A3, TRACKER l.43).
- **C13 — `raw_analysis.org.orgGraph`, canon ou projection** (INV l.77-79). Ce n'est pas du
  cadrage : c'est le modèle de données. **Déjà tranché** par Louis (A2, TRACKER l.42).

Un agent qui lit le §5 du tracker sans l'inventaire re-litige donc deux arbitrages rendus.

### 0.4 · Le §8 du tracker attribue au toggle L0-L4 un pouvoir que **la source ne lui donne pas**

TRACKER l.99 : « Le sort du **toggle L0-L4**, qui configure les poids du score. GA-26 (“un réglage
vit à un seul endroit”) exige de choisir avant d'écrire. »

La seule description du toggle dans toute la matière est v3 l.266-270 :

> « Un toggle discret dans la barre du sélecteur — activé, il ajoute au-dessus de chaque badge de
> rôle le niveau structurel (L0/L1/L2/L3/L4) et un rail Achats à droite pour les personnes en L5.
> Par défaut désactivé. »

**Il n'y touche pas aux poids.** Il est _dans la barre_ du sélecteur de direction (v3 §3), et le
score pondéré est _dans le sélecteur_ (v3 l.231-235) : deux contrôles voisins, que le tracker a
fusionnés. Recherche exhaustive de `toggle` dans la v3 : quatre occurrences (l.20, 266, 267, 642),
aucune ne parle de poids.

Conséquence : la question GA-26 est **réelle mais orpheline** — elle n'appartient pas au toggle,
elle appartient à **C6** (« les poids sont configurables », FINAL l.178-179), qui est justement la
question n°5 de l'inventaire (INV l.214-216) que le §8 du tracker a laissée tomber. Voir §2 P1 et
D276.

### 0.5 · Le bandeau de couverture est dérivé **DEUX FOIS**, et la seconde dérivation ment

C'est le défaut vivant le plus lourd trouvé pendant ce travail. Détail complet en **C9**. En un
paragraphe : le contrat et l'assembleur refusent tous deux, avec la même raison écrite, de
produire le compteur « rattachés » — parce que le calculer sur la projection donnerait « le nombre
d'ENRICHIS présenté comme un nombre de RATTACHÉS »
(`packages/contracts/src/schemas/org-graph.ts:415-425` ; `apps/ia/app/services/org_graph_assembler.py:420-425`).
L'écran le calcule quand même, sur la projection
(`focalOrgData.ts:599`), et l'affiche comme un nombre certain (`FocalOrgView.tsx:156`).

**Et il est PLAFONNÉ À 50.** `CONTACTS_ENRICH_MAX` ne borne plus la MESURE — c'est le chantier de
la décorrélation, et il est fait (`org_graph_assembler.py:434-441` : l'univers compté est l'union
des deux listes). Mais il borne toujours les **nœuds** : l'assembleur ne construit `people[]` qu'à
partir de la vague (`org_graph_assembler.py:603-682`, paramètre `contacts`), et le commentaire
l'assume — « Le plafond reste (une vague coûte des crédits) ; ce qu'il ne fait plus, c'est décider
de ce que le compte CONTIENT » (`:409-413`). Compter `graph.people` pour dire « rattachés » revient
donc à compter **la vague**. Sur AIRBUS, le bandeau annoncerait « 2 241 découverts · **43
rattachés** ». C'est mot pour mot l'exemple que le contrat donne pour expliquer pourquoi il refuse
de produire ce nombre (« 40 rattachés sur 2 241 »). **L'hypothèse du commentaire est le
comportement livré.**

---

## 1. Les treize contradictions

### C1 — La géométrie de l'arbre

**v3** — l'arbre a trois niveaux visuels et ce sont les rôles :

> v3 l.509-521 : « 10.1 La structure — 3 niveaux visuels · `[SPONSOR]` niveau 1 (1 personne) ·
> `[INFL]` niveau 2 (1 à 3 personnes) · `[OP]` niveau 3 (2 à 5 personnes) · Total affiché : 5 à
> 9 personnes. »

**FINAL** — la hauteur ne vient que du niveau hiérarchique :

> SH l.58-59 : « Les “3 niveaux Sponsor / Influenceur / Opérationnel” ne doivent PAS déterminer la
> géométrie de l'arbre : cela recréerait exactement le défaut dénoncé. L'arbre reste L0-L4 ; les 3
> rôles sont des badges. »
> FINAL l.126-127 : « Sponsor / Influenceur / Opérationnel ne sont jamais les lignes de
> l'organigramme. **La hauteur vient uniquement de L0-L4.** »
> FINAL l.469 (critère d'acceptation 03) : « aucun rôle commercial ne détermine la hauteur du nœud. »

**Tranché : FINAL.** La raison n'est pas la précédence, c'est que la v3 se contredit elle-même :
elle pose « un rôle d'achat n'est jamais un niveau hiérarchique » (v3 l.277) et « l'axe
hiérarchique et l'axe d'achat sont orthogonaux » (v3 l.275-276) **quatre pages avant** de faire du
rôle la coordonnée verticale. Un lecteur ne lit pas une légende, il lit une position : mettre
Sponsor au-dessus d'Influenceur fait lire « Claire rapporte à Julien » là où on voulait dire
« Julien décide, Claire pèse ». Et c'est sur cette lecture-là qu'on choisit qui appeler.

**État du dépôt : DÉJÀ CODÉ, dans le sens du FINAL.**

- `focalOrgData.ts:59` — `export const FOCAL_TREE_LEVELS: readonly OrgHierarchyLevel[] = ['L0','L1','L2','L3','L4']`
- `focalOrgData.ts:533` — `const levelRows: FocalLevelRow[] = FOCAL_TREE_LEVELS.map(level => ({ level, people: structural.filter(card => card.level === level) … }))` — la rangée filtre sur `card.level`, jamais sur `card.badge`.
- `focalOrgData.ts:56` — `export type OrgDecisionBadge = 'sponsor' | 'influencer' | 'operational' | 'blocker'` : quatre valeurs, et le commentaire l.53-55 dit « Ce sont des BADGES : ils se posent sur une carte, ils ne déterminent jamais sa position. »
- Rendu : `FocalOrgView.tsx:340-396` (rangées libellées par `row.level`), badge posé sur la carte à `:484-491`.

**Le contraire existe encore, et il est atteignable.** L'ancien `OrgChart` range par POIDS DE RÔLE :

- `apps/web/src/lib/contactRoles.ts:126-138` — `ORGANIGRAMME_ROLE_LEVELS: Record<DecisionRole, 1|2|3>` (sponsor/economic/champion → 1, technical/influencer/procurement → 2, operational/user/blocker/unknown → 3)
- `apps/web/src/components/account/OrgChart.tsx:135-149` — `const level = getOrganigrammeRoleLevel(contact.decision_role)`, puis tri par niveau
- atteignable depuis `TabOrganigramme.tsx:167-184` : `influenceMap ? <OrgInfluenceMap …/> : <OrgChart …/>` — donc **dans la vue système, quand la carte d'influence est vide**.

**Conséquence non dite n°1 — le toggle « voir la structure L0-L4 » perd son objet.** Confirmée, et
sans effet pratique : **il n'a jamais été codé** (recherche de `voir la structure|structure L0|L0-L4`
dans `apps/web/src` : aucune chaîne d'interface, seulement des commentaires et un nom de test —
`focalOrgData.test.ts:199`). Le seul bouton de bascule existant est `systemView`
(`TabOrganigramme.tsx:71`), et il bascule focale ⇄ système, pas rôles ⇄ niveaux. **Rien à retirer.**

**Conséquence non dite n°2, celle que personne n'écrit — la v3 disait « 5 à 9 personnes » parce
qu'elle avait trois rangées à remplir.** Une fois la géométrie passée à L0-L4, la borne n'a plus
de raison arithmétique : elle devient un choix de lisibilité, et le dépôt ne l'a pas fait
(voir C8). L'arbre affiche aujourd'hui **tout le monde**.

**Conséquence non dite n°3 — l'ancien `OrgChart` n'est pas un « fallback inoffensif ».**
Il applique la géométrie que le FINAL refuse, sur le même compte, à un clic de distance. Sa
légende le sait et s'en excuse (`OrgChart.tsx:112-114`, `fr/accountOrg.json:132` : « Les rangées
regroupent les rôles d'achat : ce n'est pas une hiérarchie ») — mais une légende n'annule pas une
position. Voir §2 P3 / D280.

**Lot de travail** (ordonné par dépendance) :

1. Poser **GA-100** (§4.1) sur `focalOrgData.ts` : la rangée se construit sur le NIVEAU. Cliquet.
2. Traiter le repli `OrgChart` — décision parquée **D280**.
3. _(dépend de 2)_ Retirer `ORGANIGRAMME_ROLE_LEVELS` (`contactRoles.ts:126-138`) en même temps que
   son unique appelant. Retirer la fonction sans retirer le composant laisserait le composant
   inventer un autre classement : **on retire le MOYEN, pas seulement la permission.**

---

### C2 — Le bloqueur

**v3** — exclu du graphe, et le refus est explicite :

> v3 l.260-264 : « 4.2 Les bloqueurs **EXCLUS du graphe visuel** (décision D2 confirmée) · Restent
> en base […] · Apparaissent dans le tableau du bas avec badge “À éviter” (rouge) · N'entrent
> jamais dans le chemin recommandé. »
> v3 l.849 (§18 « Ce qu'on refuse ») : « Un bloqueur dessiné à côté d'un sponsor — c'est mélanger
> un guide et un piège. »

**FINAL** — visible, atténué, et le refus est le refus INVERSE :

> SH l.60-61 : « Un bloqueur ne doit pas être supprimé d'une hiérarchie vérifiée : on le retire du
> chemin recommandé et on l'atténue, mais **on ne falsifie pas la structure**. »
> FINAL l.156 : « Bloqueur — Badge rouge ; jamais dans le chemin recommandé. **Reste visible si
> nécessaire pour conserver une hiérarchie vérifiée.** »
> FINAL l.508-509 (§15 « Ce qu'on refuse ») : « Masquer complètement un blocker hiérarchiquement
> réel — Cela falsifie l'organigramme ; on l'exclut du chemin, pas de la structure. »

C'est le seul cas du paquet où **les deux documents posent le même sujet dans leur section
« Ce qu'on refuse », avec des refus symétriquement opposés**. Un agent qui n'ouvrirait qu'un des
deux §« refus » repartirait avec la certitude d'appliquer une doctrine.

**Tranché : FINAL.** Et la raison est plus forte que la précédence : la v3 confond deux objets. Un
organigramme répond à « qui dépend de qui » ; un chemin d'accès répond à « par où j'entre ». Retirer
quelqu'un du second est une recommandation ; le retirer du premier est un **mensonge sur la
structure** — et la conséquence est concrète : un commercial dont le dossier n'avance pas ne voit
nulle part la personne qui le freine, donc il cherche la cause ailleurs. Le refus v3 (« mélanger un
guide et un piège ») est réglé sans falsifier : c'est ce que l'atténuation + le badge rouge font.

**État du dépôt : DÉJÀ CODÉ, dans le sens du FINAL.**

- `focalOrgData.ts:508` — `attenuated: badge === 'blocker',`
- `focalOrgData.ts:549-557` — la seule exclusion porte sur le CHEMIN :
  `if (card.badge === 'blocker') { excludedBlockers.push(card); continue }`
- `focalOrgData.ts:156-165` — la raison est écrite dans le code, et cite le FINAL.
- Rendu atténué : `FocalOrgView.tsx:412` (`person.attenuated && 'opacity-60'`), ligne de tableau `:575`,
  bloqueurs écartés **nommés** `:321-331`, explication `:459-463`.
- Côté serveur, le chemin les écarte aussi : `apps/api/src/modules/org-graph/org-graph-path.ts:54`
  (`blocker: Number.POSITIVE_INFINITY`) puis `:137` (`.filter(candidate => Number.isFinite(candidate.rank))`,
  commentaire `:136` « Un opposant identifié (rang infini) n'est pas une porte d'entrée »).
- Et l'assembleur IA garde le bloqueur dans les nœuds, en le disant :
  `apps/ia/app/services/org_graph_assembler.py:358-359` (`if declared == "blocker": return ["blocker"], True`),
  docstring `:336-339` — « **Le bloqueur traverse.** […] “masquer un blocker hiérarchiquement réel
  falsifie l'organigramme” (décision 5). Le retirer laisserait le commercial sans explication du
  blocage. Il reste donc, et il se dit DÉDUIT. » Aucun filtre `blocker` dans la construction des
  nœuds (`:603-682`, les seuls rejets y sont `memorised_rejects` et `bucket == "bruit"`).
- Libellé assumé à l'écran : `apps/web/src/i18n/locales/fr/accountOrg.json:429` — « jamais proposé
  dans le chemin, mais **gardé dans la structure** — le masquer falsifierait l'organigramme. »

**Conséquence non dite — l'atténuation s'arrête à la vue focale.** Dans la carte d'influence, un
bloqueur n'est ni atténué ni distingué : `orgInfluenceMapData.ts:193-197` (`categoryOf`) n'a
aucune branche `blocker`, et `OrgInfluenceMap.tsx:543-553` se contente d'afficher le rôle comme un
badge parmi d'autres. Le même bloqueur est donc **atténué sur un écran et neutre sur l'autre** —
et c'est l'écran système, celui qui sert à préparer un plan de compte, qui le banalise.

**Deuxième conséquence non dite — aucune des six maquettes ne montre un bloqueur.** « Atténué » n'a
donc **aucune définition visuelle validée** dans le paquet ; `opacity-60` est une invention du
dépôt, honnête, mais non recettée. À 60 % d'opacité sur fond clair, le contraste du texte
secondaire passe sous AA — à mesurer avant de figer (règle D79).

**⚠️ Troisième conséquence non dite, et c'est un trou réel — « jamais dans le chemin recommandé »
n'est tenu qu'à DEUX couches sur trois.** L'assembleur IA, qui produit `recommendedPath` **à chaque
run**, ne filtre pas les bloqueurs : `org_graph_assembler.py:951-984`, dont le seul filtre est
`rejected_ids` (`:958`). L'exclusion n'existe que dans `recomputeRecommendedPath` côté API
(`org-graph-path.ts:54`, `:137`) — c'est-à-dire **à la demande**, quand quelqu'un clique
« Recalculer le chemin » — et dans l'écran (`focalOrgData.ts:549-557`).

Conséquence : le chemin **stocké** peut contenir un bloqueur ; seul l'affichage le retire. Tout
consommateur qui lit `recommendedPath` sans passer par l'écran — export PDF, copilote, API — peut
donc recommander d'appeler la personne qui bloque le dossier. Et c'est précisément le motif
« porte unique dans un seul langage » : la règle est écrite en TypeScript, la production du chemin
est en Python.

**Lot de travail :**

1. **Porter l'exclusion dans l'assembleur** (`org_graph_assembler.py:951-984`), là où le chemin
   naît. Le filtre de l'écran devient alors une ceinture, pas la seule bretelle.
2. Aligner la carte d'influence sur la vue focale : brancher `blocker` dans `categoryOf`
   (`orgInfluenceMapData.ts:193-197`) et porter l'atténuation dans `OrgInfluenceMap.tsx`.
3. _(dépend de 2)_ Mesurer le contraste de l'état atténué dans les DEUX thèmes. Si `opacity-60`
   ne passe pas AA, l'atténuation passe par un jeton (`--bellum-text-muted` + bordure), pas par
   une opacité — un fond à opacité se compose sur le fond du THÈME (règle D79).
4. Seeder un bloqueur **dans l'arbre** de la démo, pas seulement dans le tableau : sans lui,
   la promesse « on ne falsifie pas la structure » n'est démontrée nulle part
   (`apps/api/src/modules/demo/demo-dataset.ts`, les 5 `orgGraph` seedés l.842/1665/2343/2946/3724).

---

### C3 — `displayRole` / `accessStatus` / `focusDirection` : sortie du prompt ou dérivation ?

**v3** — sorties du LLM :

> v3 l.337-343 : « 6.2 Les additions d'affichage (v2 conservées) — `focus_direction` : direction
> focale à cartographier · `displayRole` par personne : Sponsor / Influenceur / Opérationnel ·
> `recommendationLine` : phrase du bandeau « BellumAI recommande… » · `accessStatus` par personne :
> accessible / to_contact / to_avoid. » (colonne du tableau : « **Sortie du LLM** »)

**FINAL** — retirés de l'autorité du modèle :

> FINAL l.305-310 : « **Retirer de l'autorité du LLM** — `displayRole` : dérivé des `decisionRoles`
> et des relations. `accessStatus` : dérivé des coordonnées, consentements et historique.
> `focusDirection` : sélection par scoring déterministe, le LLM peut seulement proposer un
> commentaire. `hierarchyLevel` lorsque le titre permet une classification déterministe. »
> SH l.64-65 : « `displayRole`, `accessStatus` et direction focale doivent être dérivés de manière
> déterministe à partir des données, **pas dépendre d'une sortie libre du LLM**. »

**Tranché : FINAL, sans réserve.** C'est le seul des treize qui touche la doctrine maison de front.
Un `displayRole` produit par un modèle est un **classement de personnes produit par un texte
libre** : rien ne garantit qu'il n'a pas pesé un critère protégé, et rien ne permet de le
rejouer. Le dépôt tient déjà cette ligne ailleurs — `protected-criteria.spec.ts` (GA-06),
`test_protected_criteria_scoring.py` — et l'arbitrage A1 de Louis l'a rendue explicite pour le
verdict : « **le DÉRIVER, jamais le générer** » (TRACKER l.41). Ce qui vaut pour une phrase vaut
a fortiori pour un rang.

**État du dépôt : les trois champs n'existent NULLE PART.** Recherche exhaustive de
`displayRole|display_role|accessStatus|access_status|focusDirection|focus_direction` sur
`apps/web/src`, `apps/api/src`, `apps/ia/app`, `packages/contracts/src`, `packages/shared` :
**zéro occurrence en `.ts`, `.tsx` ou `.py`.** Les seules occurrences du dépôt sont documentaires
(INV l.226-228, l.502, l.584 ; TRACKER l.70 ; les fichiers de sources).

**Et aucun prompt ne les demande** — vérifié dans les deux qui produisent l'organigramme :

- `apps/ia/app/prompts/bellum_contacts.py:139` demande `"role"`, pas `displayRole` :
  `"role": "economic | technical | user | champion | procurement | influencer | blocker"` — les
  **huit rôles techniques**, pas les trois d'affichage.
- `apps/ia/app/prompts/bellum_organigramme.py:153-230` (schéma JSON complet) : ni `displayRole`,
  ni `accessStatus`, ni `focus_direction`.

Ce qui existe à leur place est **déjà déterministe**, aux trois endroits :

| Champ FINAL      | Équivalent réel                          | Où                                                                                                                                   | Nature             |
| ---------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| `displayRole`    | `OrgDecisionBadge` + `decisionBadgeOf()` | `focalOrgData.ts:56`, `:92-112` ; côté IA `_decision_roles()` `org_graph_assembler.py:317-365` (+ drapeau `roleInferred` `:666-667`) | pur / déterministe |
| `focusDirection` | `defaultFocalDirectionId()`              | `focalOrgData.ts:433-448`                                                                                                            | pur, côté web      |
| `accessStatus`   | `identityStatus` + `accessScore` (0-100) | `org_graph_assembler.py:309-314` et `:376-392` ; contrat `org-graph.ts:91-99`, `:281-282`                                            | déterministe       |

**Conséquence non dite — la règle est respectée par ACCIDENT, et rien ne la tient.** Les trois
champs n'ont pas été retirés du prompt : ils n'y ont jamais été mis. Le prochain agent qui
implémentera le §9 du FINAL ouvrira le tableau v3 l.337-343 — le seul des deux documents qui donne
le nom et le format exacts des champs — et les ajoutera au JSON demandé au modèle, de bonne foi,
en croyant suivre la spécification. **C'est précisément la situation où « une garde protège une
règle » : la règle est juste, la garde n'existe pas.** → **GA-101** (§4.2).

**Deuxième conséquence non dite — `recommendationLine` n'est PAS dans la liste du FINAL.** Le
FINAL retire trois champs de l'autorité du modèle et se tait sur le quatrième, que la v3 fait
générer _et_ déclare « **jamais vide** » (v3 l.597). L'inventaire le repère (INV l.198-201) ; le
tracker l'a tranché par l'arbitrage A1 de Louis (TRACKER l.41). **Rien à trancher ici, mais tout à
garder** : « jamais vide » + « produit par un modèle » est la définition d'une phrase inventée.
GA-101 couvre `recommendationLine` au même titre que les trois autres.

**Lot de travail :**

1. Poser **GA-101** (§4.2) : aucun prompt ne demande les quatre noms. Cliquet, à poser **avant**
   d'ouvrir le §9 du FINAL.
2. _(dépend de 1)_ Implémenter le §9 (`scope_mode`, `GRAPH_COVERAGE`, `CONTACT_BATCH`…,
   FINAL l.295-303) — la garde dira NON si l'implémentation dérape.
3. `accessStatus` per personne : voir C5, qui en donne la règle.

---

### C4 — Le champion : Sponsor ou Influenceur ?

**v3** — Sponsor absorbe le champion :

> v3 l.251 : « Sponsor | vert | `economic_buyer`, **`champion`** »

**FINAL** — le champion bascule :

> FINAL l.150 : « Sponsor — Economic buyer OU sponsor explicite d'un programme / périmètre.
> **Un champion n'est pas automatiquement sponsor.** »
> FINAL l.152 : « Influenceur — **Champion**, technical buyer, influencer, procurement ou user
> buyer avec poids de décision. »

**Tranché : FINAL.** Raison métier, pas documentaire : un champion **fait avancer**, il ne **signe
pas**. Le promouvoir Sponsor envoie le commercial demander un budget à quelqu'un qui n'en a pas —
et lui fait perdre son seul allié en le mettant en porte-à-faux devant sa hiérarchie. C'est la
faute la plus chère du lot, parce qu'elle ne se voit pas : l'écran a l'air juste.

**État du dépôt : DÉJÀ CODÉ, dans le sens du FINAL, et mieux que le FINAL.**

`focalOrgData.ts:92-112`, `decisionBadgeOf`, dans l'ordre :

```
:94   if (roles.includes('blocker')) return 'blocker'
:99   if (roles.includes('unknown')) return null
:100  if (roles.includes('economic_buyer') || ctx.sponsors.has(person.id)) return 'sponsor'
:101  if (roles.includes('champion') || roles.includes('technical_buyer') ||
      roles.includes('influencer') || roles.includes('procurement')) return 'influencer'
:109  if (roles.includes('user_buyer')) return ctx.committee.has(person.id) ? 'influencer' : 'operational'
```

Trois choses que le code a résolues et que la source laissait ouvertes :

1. « **sponsor explicite d'un programme / périmètre** » (FINAL l.150) n'est **aucun** des huit
   rôles de `orgDecisionRoleSchema` (`packages/contracts/src/schemas/org-graph.ts:56-65`). Sans
   traduction, « Sponsor » se réduirait à `economic_buyer` seul. Le code le traduit par
   l'arête `sponsors` du graphe (`ctx.sponsors`, `focalOrgData.ts:63-65`) — un FAIT sourcé du
   graphe, pas une étiquette.
2. « **user buyer AVEC poids de décision** » (FINAL l.152) : le poids ne se devine pas. Le code
   exige la seule preuve que le graphe porte — un **siège au comité d'achat** (`:109`).
3. `unknown` rend **`null`**, pas `'operational'` (`:99`). C'est plus juste que le FINAL, qui
   range « unknown reconnu » dans Opérationnel (l.154) : Opérationnel _affirme_ « pas d'autorité
   connue à ce niveau », `null` affirme qu'on ne sait pas. **Une valeur absente ne s'affiche pas
   comme une valeur mesurée.**

**Conséquence non dite, et elle est lourde — les MAQUETTES appliquent la v3, pas le FINAL.**
Sur `mq 04`, Claudia Werner porte le badge **Sponsor** (vert) alors que sa fiche affiche
« Rôle décisionnel : `technical_buyer + champion` ». Sous la règle du FINAL, `technical_buyer` et
`champion` mènent tous deux à **Influenceur** ; sous la règle v3, `champion` mène à Sponsor. La
maquette est donc **v3**. `mq 01` et `mq 03` la suivent : Claudia Werner y est Sponsor partout, et
c'est elle que le chemin recommandé propose en étape 1 (« Commencer par elle : porte le périmètre
et peut sponsoriser l'ouverture »).

Autrement dit : **appliquer C4 retourne le badge de la personne que tout le paquet recommande
d'appeler en premier**, et laisse la direction focale de la maquette sans aucun Sponsor à L2 — seul
M. Schoellhorn (CEO Defence & Space, L1) en garde un. Personne ne l'écrit nulle part.

**Ce qu'il faut en faire, précisément :** le texte gagne, le code a raison, **et les maquettes ne
sont pas une recette visuelle pour la colonne « Rôle »**. Un agent qui recetterait l'écran en
comparant au PNG conclurait à une régression et « corrigerait » `decisionBadgeOf` en sens inverse.

**Lot de travail :**

1. Écrire, en tête de `decisionBadgeOf`, que **les maquettes 01/03/04 divergent volontairement**
   sur ce point et pourquoi. Un commentaire ici vaut une garde : c'est le seul endroit où un
   futur correcteur regardera.
2. Vérifier la démo : si un contact seedé porte `champion` **et** est présenté comme sponsor dans
   un texte figé (verdict, chemin), le texte et le badge se contrediront à l'écran
   (`demo-dataset.ts`, les 5 `orgGraph`).
3. **Ne pas** recoder de mapping : `decisionBadgeOf` est la seule dérivation, et elle doit le
   rester (une dérivation vit à un seul endroit).

---

### C5 — « Accessible » : email ET téléphone, ou l'un des deux ?

**v3** — les deux :

> v3 l.573 : « Accessible (vert) | email vérifié **+ téléphone** + aucun refus antérieur »

**FINAL** — désaveu explicite :

> FINAL l.278-280 : « Le statut doit être **dérivé par règles, pas inventé par le prompt**. Il
> combine canaux vérifiés, refus / opt-out, historique de relation et disponibilité des
> coordonnées. “Accessible” **ne doit pas exiger mécaniquement email ET téléphone** si un canal
> vérifié suffit au scénario. »

**Tranché : FINAL.** Et la raison est mesurable dans le produit : la cascade d'enrichissement
rapporte un e-mail bien plus souvent qu'un téléphone. Exiger les deux ferait dire « à contacter » à
une majorité de contacts parfaitement joignables — le statut mesurerait alors **la complétude de
nos données**, pas l'accessibilité de la personne. C'est exactement le défaut que la doctrine
maison nomme (« un axe non évaluable sort du dénominateur, sinon le score mesure la complétude de
nos données »).

⚠️ **Mais le FINAL ne dit PAS « l'un des deux ».** Il dit « **canaux VÉRIFIÉS**, refus/opt-out,
historique de relation **et** disponibilité des coordonnées » — quatre entrées, dont la présence
d'une coordonnée n'est que la dernière. Le résumé « l'un des deux » du tracker (TRACKER l.72) est
donc une simplification qui perd le mot le plus important : **vérifié**. Posséder une adresse n'est
pas la même chose qu'avoir un canal éprouvé.

**Preuve que la nuance compte, et elle est dans le paquet** : sur `mq 01`, Anna Richard affiche
`a.richard@airbus.com` **et** `+33 6 32 34 56 78` — les deux canaux — et son statut est
« **À contacter** », pas « Accessible ». Ni la règle v3 (les deux → Accessible) ni un « l'un des
deux » naïf ne produisent cette ligne. **Seule** la règle complète du FINAL l'explique.

**État du dépôt : le « OU » est déjà partout ; le « ET » de la v3 n'existe nulle part ; et le
statut à trois valeurs du FINAL n'existe pas non plus.**

Quatre règles voisines, toutes en **OU**, aucune n'étant `accessStatus` :

- **Dans l'organigramme** — `apps/ia/app/services/org_graph_assembler.py:309-314`, `_identity_status()` :
  `if _get(contact, "email") or _get(contact, "phone"): return "enriched"`. **OU.** C'est la
  dérivation la plus proche du besoin, et elle est déjà du bon côté.
- `packages/contracts/src/schemas/classified-data.ts:691-692` — `const accessible = Boolean(c.email || c.phone)` → `'priorite_immediate' : 'a_enrichir'`. Concerne le tri de contacts, pas l'organigramme.
- `packages/contracts/src/schemas/classified-data.ts:788-790` — `const reachable = Boolean(c.email || c.phone || c.linkedinUrl)`. Miroir SQL : `apps/api/src/migrations/1785600000000-ContactLifecycle.ts:103`. Lecteur web : `apps/web/src/features/contacts/lib/contactLifecycle.ts:24-26`.
- **Nulle part** un `email && phone` pour l'accessibilité. La seule conjonction du dépôt est un test de **complétude**, autre concept : `apps/api/src/modules/contacts/contact-completeness.ts:20` (`return !contact.email || !contact.phone`).

Et le score qui **porte le nom** « accès » ne regarde pas les coordonnées du tout : `_access_score()`
(`org_graph_assembler.py:376-392`) dérive du **niveau hiérarchique** (`_ACCESS_BY_LEVEL` :
L4 90 · L3 85 · L5 70 · L2 65 · L1 45 · L0 25, défaut 55) plus un bonus de statut
(`{"actionable": 10, "enriched": 5}`), et il est posé sur les **sièges du comité** (`:920`), pas sur
les personnes. Un homonyme de nom, un tout autre objet.

**Donc : la moitié facile est faite (le OU), et c'est la moitié difficile qui manque** — le
canal **vérifié**, l'opt-out, l'historique. Ni consentement ni historique n'entrent aujourd'hui
dans aucune de ces dérivations, contrairement à ce que demande FINAL l.278-279. Et surtout : ne pas
confondre les quatre objets qui existent déjà.

**Conséquence non dite — « aucun refus antérieur » n'a pas de support.** Les deux formulations
supposent qu'on sait qu'une personne a refusé. Le graphe porte `org_rejected_items` (« écarté »,
un geste de tri) et `dismissed_at` (« ce n'est pas exact », une pierre tombale sur un FAIT) — ni
l'un ni l'autre n'est un **opt-out de la personne**. `accessStatus = to_avoid` sur un refus
n'a donc pas de champ pour se calculer, et le déduire d'un « écarté » ferait dire à un geste
d'organisation interne quelque chose sur la volonté d'un tiers. **Un statut qui ne peut pas se
mesurer ne se calcule pas : il reste inconnu, nommé.**

**Lot de travail :**

1. Nommer les entrées, une par une, et dire pour chacune si le dépôt la porte :
   canal vérifié (?) · opt-out (**absent**, voir ci-dessus) · historique de relation (journal
   d'activité) · disponibilité des coordonnées (`email`/`phone`, présents).
2. _(dépend de 1)_ Dériver `accessStatus` **au même endroit** que `decisionBadgeOf` — c'est le
   même écran, la même donnée, et deux fichiers divergeraient.
3. Un axe non mesurable **sort du calcul et se nomme**. Un contact sans historique n'est pas
   un contact à éviter.
4. La démo doit contenir les trois statuts, dont un « à éviter » **fondé sur une raison lisible**.

---

### C6 — Le score de la direction focale ⚠️ **le seul où l'on décline le FINAL**

**v3** — quatre facteurs, poids en dur :

> v3 l.231-235 : « Alignement avec les offres de l'ESN **40 %** · Nombre de signaux récents
> (< 90 j) **30 %** · Nombre de contacts déjà classifiés **20 %** · Présence d'un contact avec
> relation existante **10 %** »

**FINAL** — cinq facteurs, Projet/Mission en tête, poids sortis du code :

> FINAL l.177-179 : « Le score doit rester déterministe et domain-aware. Ordre recommandé :
> **contexte Projet/Mission actif**, fit OfferPortfolio / domaine vendeur, signaux récents,
> relation/accessibilité existante, qualité de couverture. **Les poids sont configurables** et ne
> doivent jamais être codés comme un prisme IT par défaut. »

**Tranché : le FINAL sur le FOND, la v3 et le FINAL rejetés tous deux sur la FORME.**

Le fond du FINAL est juste : la direction pertinente dépend de ce qu'on vend, et un prisme IT par
défaut est un vrai défaut. Mais **sa forme crée un problème que la v3 n'avait pas** :

- Un second classement. Le dépôt en a déjà un — le **chemin recommandé**, calculé côté serveur
  (`apps/api/src/modules/org-graph/org-graph-path.ts`), qui porte déjà l'ordre du comité,
  l'exclusion des écartés et le garde-fou gouvernance. Deux classements d'une même question
  divergent : le chemin dirait « commence par Claudia (Engineering) » pendant que le sélecteur
  ouvrirait sur Cybersécurité.
- Des poids « configurables » **sans dire par qui**. C'est la question n°5 de l'inventaire
  (INV l.214-216), et c'est **la seule des huit que le §8 du tracker a laissée tomber** (§0.4).
  Env, espace ou utilisateur : trois réponses, et GA-26 (« un réglage vit à un seul endroit »)
  exige d'en choisir une **avant** d'écrire, pas après.

**État du dépôt : ni l'un ni l'autre. Le dépôt a fait un troisième choix, et l'a motivé.**

`focalOrgData.ts:421-448` :

> « La direction ouverte par défaut. Elle est DÉTERMINISTE et elle ne s'affiche pas comme un
> score : c'est l'entité de la **PREMIÈRE ÉTAPE du chemin recommandé**. Le chemin porte déjà le
> scoring serveur […] ; en dériver la direction évite de refaire un classement ici, et **deux
> classements d'une même question finissent par diverger**. À défaut de chemin, la direction la
> plus peuplée ; à défaut de personne rattachée, `null` — jamais une entité prise au hasard. »

Aucun tableau de poids n'existe dans la fonctionnalité :
`buildFocalOrgView` (`focalOrgData.ts:450-454`), `buildOrgInfluenceMap` (`orgInfluenceMapData.ts:200`)
et `buildOrgGraphViewData` ne prennent **aucun argument de pondération**.

Et il n'y en a **nulle part ailleurs** : ni dans `apps/api/src/modules/org-graph/`, ni dans
`apps/ia/app/services/org_graph_*.py`. Le seul autre classement de directions est
`listFocalDirections()` (`focalOrgData.ts:399-419`), qui trie sur **un seul critère** —
`.sort((a, b) => b.peopleCount - a.peopleCount || a.name.localeCompare(b.name))` (`:418`).
Aucun facteur « Projet/Mission » n'existe dans le code de la fonctionnalité. Les quatre poids de la
v3 (40/30/20/10) et les cinq facteurs du FINAL sont **de la spécification seule**.

Le seul scoring pondéré et durci sur cet axe est celui du **chemin** — et c'est exactement
l'argument ci-dessous.

**Recommandation, parquée en D276 :** garder la dérivation depuis le chemin, et faire entrer le
contexte Projet/Mission **dans le scoring du CHEMIN** (`org-graph-path.ts`), pas dans un second
score. On obtient le domain-awareness que le FINAL demande, on garde une seule dérivation, et la
question « configurables par qui » **disparaît** — il n'y a pas de poids à configurer.

**Conséquence non dite — le sélecteur de direction n'a AUCUNE mémoire.** Les deux documents
l'exigent :

> FINAL l.131 : « Sélecteur de direction — Choisit le périmètre commercial pertinent ; **mémorisé
> par utilisateur × compte**. »
> v3 l.242-243 : « Le sélecteur mémorise le dernier choix par utilisateur × compte. **La direction
> courante voyage dans l'URL.** »

Le dépôt n'a ni l'un ni l'autre : `systemView` est un `useState` nu (`TabOrganigramme.tsx:71`),
sans `localStorage`, sans paramètre d'URL, sans écriture serveur — vérifié par recherche sur tout
le dossier `organigramme/`. Conséquence pratique : **un organigramme ne se partage pas par son
lien**, et chaque retour sur l'onglet repart de la direction par défaut. C'est aussi une question
GA-26 (où vit le réglage ?), et elle est parquée avec **D279**.

**Lot de travail :**

1. **D276** avant tout code — sans elle, un agent écrira le score du FINAL.
2. _(si D276 va dans le sens recommandé)_ Faire entrer Projet/Mission dans `org-graph-path.ts`,
   à l'endroit du rang, pas dans un second calcul.
3. **D279** pour la persistance, puis un seul support (URL de préférence : c'est ce qui rend le
   lien partageable, et c'est déjà l'exigence de la v3).

---

### C7 — Le badge d'entité : conditionnel ou sur chaque carte ?

**v3** — conditionnel :

> v3 l.535 : « Badge d'entité **si différente de la direction focale** »

**FINAL** — sur chaque carte, deux fois :

> FINAL l.167 : « **Chaque carte** porte un badge d'entité coloré et stable, calculé à partir de
> l'`entityId` ; le nom complet apparaît au survol et dans la fiche. »
> FINAL l.470 (critère d'acceptation 04) : « **Chaque carte** affiche clairement son entité ; les
> personnes de 2 BU différentes ne paraissent jamais appartenir au même périmètre. »

**Tranché : FINAL.** Raison : la règle v3 fait dépendre le sens d'une carte de **ce qui est absent**.
« Pas de badge » y veut dire « même entité que la focale » — un lecteur doit donc connaître la
focale, s'en souvenir, et interpréter un vide. Le FINAL a raison de le refuser : sur un groupe,
c'est précisément la confusion coûteuse (FINAL l.169-170 : « personne ne doit se demander si un
CFO vient d'Airbus SE, Defence & Space ou UrbanAir »). `mq 01` le confirme : les **huit** cartes de
l'arbre portent `AIRBUS DS`, y compris celles de la direction focale elle-même.

**État du dépôt : conditionnel — mais sur une autre condition, et c'est la bonne.**

- `FocalOrgView.tsx:416` — `{person.entityName ? <Badge variant="outline">{person.entityName}</Badge> : null}`
- `focalOrgData.ts:496` — `entityName: person.entityId ? (entityById.get(person.entityId)?.name ?? null) : null`

La condition n'est **pas** « entité ≠ focale » (la règle v3, refusée) : c'est « **entité connue** ».
Le badge apparaît donc bien sur chaque carte de la focale — sauf sur celles dont on ignore
l'entité.

**Conséquence non dite — « chaque carte » est INAPPLICABLE à la lettre, et le FINAL ne le voit
pas.** Le rattachement à une entité n'est pas garanti : le contrat le dit expressément
(`org-graph.ts:415-425`, `attachedToEntity` optionnel et « absent en pratique aujourd'hui »), et
l'assembleur refuse de le fabriquer (`org_graph_assembler.py:420-425`). Une carte sans entité
existe donc, et le critère 04 pris au pied de la lettre demanderait de lui en poser une — c'est-à-dire
**d'inventer une donnée**. La lecture correcte du FINAL est : _le badge n'est jamais conditionné à
la focale_, pas _toute carte a une entité_.

**Ce qui manque vraiment**, et que ni le texte ni le code ne font : une carte sans entité **ne dit
rien du tout**. Elle est visuellement indistinguable d'une carte de la focale, ce qui est
exactement l'ambiguïté que C7 voulait supprimer. Un vide n'est pas une réponse.

**Deux écarts secondaires, mesurés :**

- « **coloré et stable, calculé à partir de l'entityId** » (FINAL l.167) : le dépôt rend
  `variant="outline"` — une seule couleur pour toutes les entités. `mq 02` montre bien six
  couleurs stables par entité. Écart réel, non tenu.
- Ailleurs qu'en focale, le badge disparaît : `OrgInfluenceMap` n'en pose aucun sur les personnes
  (l'entité est la carte parente, `OrgInfluenceMap.tsx:236-241`), et `PersonAxes` non plus
  (`OrgGraphViews.tsx:183-211`). Défendable — mais alors le critère 04 ne vaut que pour la focale,
  et il faut l'écrire.

**Lot de travail :**

1. Rendre l'absence d'entité **explicite** sur la carte (« entité inconnue ») plutôt que muette.
   Un vide se lit comme « pareil que les autres ».
2. _(dépend de 1)_ Couleur stable dérivée de l'`entityId` — et **pas une teinte fixe de la gamme**
   (aucune ne passe AA des deux côtés) : passer par les jetons `*-soft` / `*-soft-text` (D79).
3. Décider si le critère 04 s'étend à la carte d'influence, ou s'il est borné à la focale, et
   l'écrire là où le critère est recetté.

---

### C8 — La taille de l'arbre : 5-9 ou 5-12 ?

**v3** : « Total affiché : **5 à 9 personnes**. Le reste vit dans la couverture, cherchable, mais
pas dessiné. » (v3 l.521 ; critère 4, v3 l.785-787)
**FINAL** : « Arbre droite — Hiérarchie réelle L0-L4, **5 à 12 cartes** pertinentes, badges
d'entité et de décision. » (FINAL l.137)

**Tranché : FINAL — mais pour une raison qui n'est ni 9 ni 12.** Le « 5 à 9 » de la v3 était
l'arithmétique de sa géométrie : 1 sponsor + 1-3 influenceurs + 2-5 opérationnels
(v3 l.510-518). **En passant à L0-L4, ce calcul disparaît** ; « 12 » n'est plus qu'un ordre de
grandeur de lisibilité. `mq 01` en dessine **huit** (1 en L1, 2 en L2, 3 en L3, 2 en L4) — dans
les deux bornes, ce qui ne départage rien.

**État du dépôt : AUCUNE borne. L'arbre affiche tout le monde.**
`FocalOrgView.tsx:363-365` — `row.people.map(...)`, sans `slice` ; idem `:376-378` (sans niveau) et
`:520-522` (achats). Les seules bornes codées de la fonctionnalité sont ailleurs :
`MAX_VISIBLE_DIRECTIONS = 4` (`focalOrgData.ts:292`), `TOP_CONTACTS = 10`
(`FocalOrgView.tsx:533`), `MAX_STEPS = 5` (`org-graph-path.ts:74`).

**Conséquence non dite — et c'est le scénario S11 que le FINAL a perdu (§0.2).** Sans borne, la
rangée L3 se remplit de tous les managers enrichis, et la rangée L1 reste à une ou deux cartes :
l'organigramme « se remplit de juniors » parce que ce sont eux qui ont un profil public. La v3
avait la réponse (« vue focale = décideurs ; couverture = tous ; ce n'est pas la même vue »,
v3 l.700-701) ; le FINAL a supprimé le scénario et gardé la borne sans son motif.

⚠️ **La borne ne se pose pas sur le TOTAL, elle se pose par NIVEAU.** Couper à la douzième carte
d'un total trié couperait la rangée L4 en entier, ou pire, ferait disparaître un L1 si le tri le
place tard. La v3 le savait — ses bornes étaient par rangée (1 / 1-3 / 2-5).

⚠️ **Et une carte retirée doit être COMPTÉE, pas effacée.** « 5 à 12 cartes » ne veut pas dire
« les autres n'existent pas » : c'est exactement la faute que le chantier entier corrige (« Le cap
à 50 limite le graphe entier, l'utilisateur voit 30 personnes sur un compte à 2 241 », v3 l.91-92).

→ Décision parquée **D277** : quoi couper, et comment nommer ce qui est coupé.

**Lot de travail :** D277 → borne par niveau → mention comptée du reste, cliquable vers le tiroir
« tous les contacts ».

---

### C9 — Les compteurs du bandeau de couverture : 6 ou 7 ?

**v3** (l.134-135) — **six** : « 2 241 contacts découverts · 1 978 rattachés à une entité · 613
enrichis · 91 liens vérifiés · 158 probables · 23 zones à couvrir »
**FINAL** (l.114-115) — **sept**, le même plus un : « … · **2 103 classés déterministiquement** ·
… · 23 zones à couvrir »

**Ce que le tracker ne dit pas : le paquet en montre TROIS comptes différents.**

| Source                | Compteurs | Lesquels                                                                                |
| --------------------- | --------- | --------------------------------------------------------------------------------------- |
| v3 l.134-135          | **6**     | découverts, rattachés, enrichis, vérifiés, probables, zones                             |
| FINAL l.114-115       | **7**     | + classés déterministiquement                                                           |
| `mq 02` (vue système) | **6**     | découverts, rattachés, **classés**, enrichis IA, vérifiés, probables — **pas de zones** |
| `mq 01` (vue focale)  | **5**     | découverts, rattachés, enrichis, vérifiés, probables — ni classés, ni zones             |

**Tranché — et le tranchant n'est aucun des chiffres : le bandeau n'est pas UN bandeau.** Les
maquettes ont raison contre le texte du FINAL : la vue focale et la vue système ne portent pas les
mêmes compteurs, et c'est juste. « Classés déterministiquement » est une mesure de **qualité de
notre couverture** ; elle a sa place sur l'écran de plan de compte, pas sur l'écran où l'on
prépare un appel. Le nombre correct n'est donc ni 6 ni 7 : **c'est un sous-ensemble par écran,
tiré d'une seule dérivation.**

**État du dépôt : le modèle porte DIX compteurs, la dérivation est unique et bien faite — et
l'écran la refait à côté, faux.**

Le bon chemin existe :

- `packages/contracts/src/schemas/org-graph.ts:408-455` — `orgCoverageSchema` : `discovered`,
  `attachedToEntity` (**optionnel**), `deterministicClassified`, `llmEnriched`,
  `enrichmentBatchSize`, avec un `superRefine` qui borne chaque sous-ensemble par `discovered`
  (`:445-451`).
- `:467-481` — `OrgCoverageHeader` : **dix** champs, dont sept en `number | null`.
- `:491-507` — `deriveOrgCoverage()`, avec la raison écrite au-dessus (`:483-490`) :
  « La dérivation du bandeau — **à UN seul endroit** (loi 1 du tome 7). Deux chemins qui la
  referaient divergeraient. »
- Côté IA, la décorrélation couverture / vague est faite : `org_graph_assembler.py:400-429`.

**Et pourtant `deriveOrgCoverage` n'a AUCUN appelant de production.** Recherche exhaustive sur
`apps` + `packages` (hors `dist`) : **onze occurrences, toutes dans des `.spec.ts` / `.test.ts`**
(`demo-org-coverage.spec.ts`, `org-graph-coverage.spec.ts`, `org-graph-coverage.test.ts`). C'est
le motif que ce dépôt connaît par cœur : **du code juste, calculé, testé, que personne n'appelle.**

L'écran, lui, refait le calcul à la main — `focalOrgData.ts:596-604` :

```ts
coverage: {
  discovered,
  graphPeople: graph.people.length,
  attached:  graph.people.filter(p => p.entityId != null && entityById.has(p.entityId)).length,
  enriched:  graph.people.filter(p => ENRICHED_STATUSES.has(p.identityStatus)).length,
  verifiedLinks: graph.hierarchyEdges.filter(e => e.verified).length,
  probableLinks: graph.hierarchyEdges.filter(e => !e.verified).length,
  uncoveredZones: graph.uncoveredZones.length,
}
```

rendu par `CoverageHeader`, `FocalOrgView.tsx:136-163` — six compteurs, `:156` pour `attached`.

**⚠️ Le compteur « rattachés » de l'écran affiche un nombre que le pipeline REFUSE de produire, et
c'est le nombre exactement faux que les deux commentaires nomment.**

- Contrat, `org-graph.ts:415-425` : « `attachedToEntity` — OPTIONNEL, et absent en pratique
  aujourd'hui — c'est un trou NOMMÉ, pas un oubli. […] Le compter sur le corpus entier donnerait
  **le nombre d'enrichis, présenté comme un nombre de rattachés** — donc “40 rattachés sur 2 241”
  là où la vérité est “on ne sait pas pour 2 201 d'entre eux”. La question à se poser : si cette
  valeur est absente, “0” est-il VRAI ? **Non.** »
- Assembleur, `org_graph_assembler.py:420-425` : même raisonnement, même refus.
- `deriveOrgCoverage`, `org-graph.ts:499` : `attachedToEntity: measured?.attachedToEntity ?? null` — honore l'absence.
- Écran, `focalOrgData.ts:599` : compte `graph.people`, **la projection** — c'est-à-dire les
  personnes que le graphe a retenues, donc pour l'essentiel les enrichies.

Et le nombre n'est même pas rendu incertain : `discovered` est le **seul** compteur du bandeau qui
sait afficher `UnknownValue` (`FocalOrgView.tsx:144-155`) ; `attached` passe par `CoverageCount`
(`:156`) et sort toujours un chiffre. **Un graphe qui n'a rien mesuré affiche donc un rattachement
ferme.** C'est une violation vivante de GA-18/GA-19, déguisée en compteur de couverture.

**Et le chiffre est PLAFONNÉ par la taille de vague.** `CONTACTS_ENRICH_MAX` (`classification.py:77`,
défaut 50) ne borne plus la mesure — c'est fait, l'univers compté est l'union du corpus et de la
vague (`org_graph_assembler.py:434-441`) — mais il borne toujours les **nœuds** : `people[]` n'est
construit qu'à partir du paramètre `contacts`, c'est-à-dire la vague
(`org_graph_assembler.py:603-682`), la découpe se faisant en amont à
`classification.py:441-443` (`rank_contacts_for_enrichment(list(req.contacts), CONTACTS_ENRICH_MAX, …)`).
Donc `graph.people.length ≤ 50`, et le compteur « rattachés » de l'écran ne peut **jamais** dépasser
50, quel que soit le compte. Sur AIRBUS : « 2 241 découverts · **43 rattachés** ».

C'est mot pour mot l'exemple que le contrat écrit pour expliquer son refus (« 40 rattachés sur
2 241 », `org-graph.ts:421-422`). **L'hypothèse du commentaire est le comportement livré** — et
c'est aussi, à un détail près, le défaut fondateur du chantier tout entier (« Le cap à 50 limite le
graphe entier, l'utilisateur voit 30 personnes sur un compte à 2 241 », v3 l.91-92) : il a été
corrigé sur la mesure, et il est revenu par le bandeau censé le montrer.

**Conséquence non dite n°2 — les maquettes ne s'additionnent pas.** Sur `mq 02`, la somme des
cartes d'entité fait **2 462** (221 + 612 + 780 + 410 + 145 + 294) pour un en-tête à 2 241. Les
cinq entités opérationnelles font **exactement 2 241** ; la tuile « AIRBUS SE · Groupe · 221 » est
en trop. Mais le compteur « enrichis » agrège, lui, les **six** tuiles : 78 + 174 + 205 + 103 + 31

- 22 = **613**, exactement l'en-tête. **Les deux agrégations n'ont donc pas le même périmètre**, et
  un utilisateur qui additionne (c'est la première chose qu'on fait devant six tuiles) trouve une
  erreur de 221 sur l'une et zéro sur l'autre. À ne pas reproduire en seedant la démo.

**Conséquence non dite n°3 — « 23 zones à couvrir » ne se recompose pas non plus.** Le FINAL le met
dans l'en-tête (l.115) ; `mq 02` le pose **par entité** (9 + 8 + 4 + 6 + 7 + 12 = **46**). Soit
l'en-tête déduplique, soit l'un des deux est faux. Le dépôt tranche déjà, correctement :
`uncoveredZones: graph.uncoveredZones.length` — un décompte, à un seul endroit.

→ Décision parquée **D278** (retirer un compteur d'un écran livré est un arbitrage produit).

**Lot de travail** (ordonné — le 1 est urgent, il ment aujourd'hui en production) :

1. **D278**, puis : brancher l'écran sur `deriveOrgCoverage` et supprimer le bloc
   `focalOrgData.ts:596-604`. Le compteur « rattachés » devient `null` → `UnknownValue`, ce qui
   est la vérité.
2. _(dépend de 1)_ Ajouter « classés déterministiquement » à la **vue système** uniquement,
   d'où `deterministicClassified`.
3. _(dépend de 1)_ Poser la garde GA-26 sur cette dérivation — **impossible aujourd'hui** : elle
   serait ROUGE. Elle se pose juste après le 1, et pas avant. (C'est la raison pour laquelle
   GA-100 porte sur C1 et non sur ce point : **une garde se pose verte, sinon ce n'est pas une
   garde, c'est un bug avec un nom.**)

---

### C10 — Le rail Achats / Procurement · **DÉJÀ TRANCHÉ (A3)**

**v3** : rail parallèle, jamais sous L4 (v3 l.696-698, S10), mais mappé « Influenceur » à l'écran
principal (v3 l.254).
**FINAL** : « L5 / fonctions transverses traitées **séparément quand nécessaire** » (l.25) et
« Procurement — Fonction transverse qui participe au circuit ; ne devient **ni** N-5 fictif **ni**
simple “influenceur” sans indication de fonction » (l.341-342).

**Trois formulations, dont une qui interdit les deux autres** — c'est ce que Louis a tranché :

> TRACKER l.43 (A3) : « **Une colonne à part, hors de l'arbre hiérarchique.** »

**Rien à re-trancher.** Cette ligne n'aurait pas dû être présentée comme « du cadrage »
(TRACKER l.75) : elle décide où vit une population entière.

**État du dépôt : DÉJÀ CODÉ, conforme à A3.**

- `focalOrgData.ts:34-40` : « L5 reste dans l'énumération ; les Achats sortent de l'ARBRE. ⚠️ Le
  piège à ne pas retomber dedans : rétrécir `orgHierarchyLevelSchema` à L0-L4. […] L'arbitrage de
  Louis n'est pas de supprimer le niveau, c'est de le sortir de la COLONNE VERTICALE. »
- `focalOrgData.ts:59` — `FOCAL_TREE_LEVELS` s'arrête à `L4`.
- `focalOrgData.ts:591` — `procurement: [...procurement].sort(byLevelThenConfidence)` ; rendu
  `FocalOrgView.tsx:520-522`.
- Le contrat garde L5 et dit pourquoi : `org-graph.ts:52` — « L5 // Achats/contrôle —
  procurement/vendor/juridique/sécurité — processus, **axe parallèle** ».
- Le prompt le sait aussi : `apps/ia/app/prompts/bellum_organigramme.py:67` — « Achats = role
  `procurement` DISTINCT (processus, panel, contrat) — ce n'est pas un blocker par defaut. »

**⚠️ Conséquence non dite — la maquette 03 fait EXACTEMENT les deux choses que le FINAL refuse.**
Sur `mq 03`, la ligne « Lisa Becker · Procurement Manager · AIRBUS DS » porte, dans la colonne
« L », la valeur **`L5`**, et dans la colonne « Rôle », le badge **`Influenceur`**. Le N-5 fictif
_et_ le simple influenceur, sur la même ligne, dans le paquet qui les refuse tous deux
(FINAL l.341-342). Le code a raison contre la maquette ; il ne faut pas seeder cette ligne telle
quelle en démo, ni la prendre comme référence de recette.

**Lot de travail :** aucun sur la structure. Un seul point de vigilance : quand le tiroir « tous
les contacts » sera construit (maquette 03), sa colonne « L » ne doit **pas** afficher `L5` comme
un sixième étage — la colonne dit un niveau d'arbre, et les achats ne sont pas dans l'arbre.

---

### C11 — Les critères d'acceptation : 20 ou 15 ?

**v3** : 20, numérotés 1 à 20 (l.776-825). **FINAL** : 15, numérotés 01 à 15 (l.466-482).
Comptage vérifié des deux côtés.

**Tranché : FINAL** — c'est une liste de recette, elle appartient au document qui supersède.
Mais **« 20 → 15 » n'est pas une réduction de périmètre**, et le résumé du tracker le laisse
croire. Cinq critères v3 n'ont pas disparu : ils ont **fusionné ou migré**.

| Critère v3 perdu de vue                                      | Où il a survécu                                          |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| 5 « le sélecteur montre le top 3 + un menu »                 | FINAL l.131 (texte, pas critère) — **non recetté**       |
| 7 « un `reportingTo` d'un `vendor_profile` PRODUIT un edge » | FINAL l.199-200 (tableau §6) — **non recetté**           |
| 12 « le bandeau commence par “BellumAI recommande” »         | FINAL l.141 — **non recetté**                            |
| 13 « le dialogue a un CTA rapide + options »                 | FINAL l.363 — **non recetté**                            |
| 20 « `discovered = inScope + rejected` »                     | **perdu**. Le contrat a une autre borne (`≤ discovered`) |

⚠️ **Le critère v3 n°7 est le contre-test du P0**, et c'est le seul qui manque vraiment. Le FINAL
recette qu'un `reportingTo` sans preuve ne crée **aucun** lien (critère 05, l.472) mais ne recette
nulle part qu'un `reports_to` **explicitement exposé par un fournisseur** en crée bien un. Une
garde qui ne teste que le refus se satisfait d'un code qui refuse **tout** : c'est le motif
« la garde protège la forme qu'elle a vue ».

**État du dépôt : le contre-test existe, et le P0 est CORRIGÉ.**

- `apps/ia/tests/test_org_reporting_provenance.py` (321 l.) éprouve les deux sens ; son en-tête
  décrit le défaut mesuré sur `main` (`apollo → grounding B, confiance 60` ; `pappers → grounding A`).
- Le correctif est en place : `org_graph_assembler.py:803-819` construit le candidat `reports_to`
  avec **une seule source, `kind="llm"`** (`:811`), sans `explicit_title` (commenté `:800-801`), et
  la provenance d'identité (`identity_evidence`, `:743-745`) ne sert plus qu'au `member_of`.
  Le second volet est corrigé aussi : `fresh=False` en dur sur la preuve d'identité (`:743-745`,
  raison `:732-742`).
- Les constantes du seuil sont bien celles du tracker :
  `apps/ia/app/services/org_confidence.py:29-35` — `W_LINKEDIN_OR_PROVIDER = 20`,
  `W_EXPLICIT_TITLE = 15`, `W_SAME_ORG_ID = 15` ; et `HYPOTHESIS_MIN = 50` (`:44`) avec
  `creates_edge(score) → score >= HYPOTHESIS_MIN` (`:114-117`). **20 + 15 + 15 = 50 = le seuil
  exact**, comme mesuré.

⚠️ **Les numéros de ligne du tracker §4 ont DÉRIVÉ** et ne se vérifient plus : « l.530 » est
aujourd'hui `:802`, « l.556-568 » est `:803-819`, et `bellum_contacts.py:113` est `:144`
(la l.113 actuelle est un commentaire sans rapport). Une référence de ligne périmée fait conclure
« ce n'est pas là » à qui vérifie. Le dépôt en porte une autre, du même genre :
`org_graph_assembler.py:324` cite `bellum_contacts.py:108` pour le schéma des rôles, qui est
en `:139`.

Le critère v3 n°20 (`discovered = inScope + rejected`) n'a **pas** d'équivalent : la seule
invariance du contrat est `sous-ensemble ≤ discovered` (`org-graph.ts:445-451`). C'est plus faible,
mais c'est aussi la seule que les données permettent — `inScope` n'existe pas au contrat.

**Lot de travail :** reprendre les 15 du FINAL comme liste de recette, et y **rajouter
explicitement** le n°7 de la v3, en le nommant comme tel. Un test qui ne sait dire que NON ne
garde rien.

---

### C12 — La red-team : 14 ou 15 scénarios ? ⚠️ **le chiffre du tracker est FAUX**

**v3** : 14, numérotés S1 à S14 (l.674-711).
**FINAL** : **14**, comptés ligne à ligne (l.390-419, en-tête exclue).

Le tracker (l.75) et l'inventaire (INV l.74-76) écrivent « 15 » pour le FINAL et parlent de
« l'ajout de deux lignes ». Le compte est faux et l'analyse aussi : voir **§0.2** — trois sorties,
trois entrées, effectif constant, et **S11 « Organigramme rempli de juniors » perdu sans
remplaçant**.

**Tranché : les 14 du FINAL, PLUS S11 réintégré.** Raison : S11 n'est pas un scénario théorique,
c'est l'état par défaut du produit aujourd'hui — sans borne par niveau (C8), l'arbre se remplit
par le bas parce que ce sont les profils publics. Sa réponse v3 (« vue focale = décideurs ;
couverture = tous ; ce n'est pas la même vue », v3 l.700-701) est exactement la doctrine du
chantier.

**État du dépôt :** aucune liste de scénarios red-team n'est matérialisée en tests. Les
comportements le sont un par un (`test_org_reporting_provenance.py`, `org-graph-coverage.spec.ts`,
`focalOrgData.test.ts`…), mais **rien ne relie un test à un scénario**, donc rien ne dit lequel des
14 n'a pas de test. `NON PROUVÉ` sur la couverture réelle des 14.

**Lot de travail :** dresser la table scénario → test (14 + S11), et nommer ceux qui n'en ont pas.
Une liste sans correspondance est un inventaire, pas une garde.

---

### C13 — `raw_analysis.org.orgGraph` : canon ou projection ? · **DÉJÀ TRANCHÉ (A2)**

**v3** — canon maintenant, normalisation plus tard :

> v3 l.430-435 : « **V3** — les extensions sont additives, `raw_analysis.org.orgGraph` reste le
> **canon JSON**. **V4** — quand le volume dépasse 500 contacts par compte régulièrement, on
> normalise en tables `org_*`. […] On ne fait pas V4 tout de suite. »

**FINAL** — projection tout de suite, mais normalisation en P2 :

> FINAL l.95-96 : « OrgGraph **ne duplique pas** les 2 241 fiches : il **référence** les
> `contactIds` utiles, les entités, les relations, les gaps et les projections. »
> FINAL l.500-501 (refus) : « Tous les contacts dupliqués dans `raw_analysis.orgGraph` —
> Scalabilité et corrections coûteuses ; **Contacts reste canonique**. »
> FINAL l.447 (P2) : « Normalisation data / alias entités avancés — À déclencher sur métriques de
> volume, **pas par principe**. »

> TRACKER l.42 (A2) : « **Projection, MAINTENANT.** OrgGraph ne garde que des `contactIds`. Dès la
> première correction humaine, deux copies divergeraient. »

**Rien à re-trancher.** Comme C10, cette ligne n'est pas « du cadrage » : c'est le modèle de
données, et elle commande C9 et le ledger de corrections.

**État du dépôt : conforme, et documenté à l'endroit qui compte.**

- `org-graph.ts:397-402` : « ⚠️ Ce qui n'est PAS ici, et pourquoi : les 2 241 fiches. La base
  Contacts reste le corpus canonique ; `people[]` est une **PROJECTION** — les nœuds utiles à la
  structure, pas l'annuaire. Dupliquer 2 000 profils dans ce blob JSON est explicitement refusé au
  §15 du FINAL […] : dès la première correction humaine, deux copies divergeraient. »
- Le ledger de corrections existe et est câblé : contrat `packages/contracts/src/schemas/org-graph-correction.ts`,
  migration `apps/api/src/migrations/1790700530001-OrgGraphCorrections.ts`, service
  `apps/api/src/modules/org-graph/org-graph-correction.service.ts`, contrôleur
  `apps/api/src/modules/org-graph/org-graph.controller.ts`, et **la démo le seede**
  (`apps/api/src/modules/demo/demo-coverage.ts:182`, avec sa raison l.173-181).

**Conséquence non dite n°1 — c'est A2 qui rend C9 réparable.** Tant que `people[]` est une
projection, compter `graph.people` pour dire « rattachés » (`focalOrgData.ts:599`) est
structurellement faux : on compte la projection en croyant compter le corpus. Les deux décisions
sont la même.

**⚠️ Conséquence non dite n°2 — aujourd'hui, `people[]` n'est pas “les nœuds utiles”, c'est “la
VAGUE”.** L'assembleur ne construit de nœuds qu'à partir du paramètre `contacts`, borné par
`CONTACTS_ENRICH_MAX` (`org_graph_assembler.py:603-682` ; découpe à `classification.py:441-443`).
Le corpus, lui, arrive par un second paramètre `discovered_contacts` qui ne sert **qu'à compter**
(`apps/ia/app/graph/nodes.py:601-611` et `apps/ia/app/routers/phase3_classify.py:93-103` passent
bien les deux listes). Le compteur dit 2 241 ; le graphe en porte 50.

C'est conforme à A2 sur la lettre (on ne duplique pas 2 241 fiches) mais pas sur l'esprit :
« les `contactIds` **utiles** » (FINAL l.95-96) devrait vouloir dire _choisis pour la structure_, et
non _ceux que la dernière vague a touchés_. Une personne restée en `seed` n'a donc aucun nœud, et
« Voir tous les contacts » (FINAL §8) ne pourra pas se servir du graphe : il devra lire la base
Contacts. **Ce n'est pas un défaut — c'est exactement ce que A2 prescrit** — mais il faut l'écrire,
sinon le tiroir « tous les contacts » sera câblé sur `graph.people` et montrera cinquante lignes.

**Lot de travail :** aucun sur le modèle. Deux points de vigilance :
`attachedToEntity` reste un trou NOMMÉ — il se comblera par la classification déterministe sur le
corpus, jamais par un décompte de `people[]` ; et le tiroir « tous les contacts » se lit sur la base
Contacts, jamais sur `graph.people`.

---

## 2. Les quatre points « à trancher » du §8 — et le cinquième, orphelin

### P1 · Le sort du toggle L0-L4

TRACKER l.99 : « Le sort du **toggle L0-L4**, qui configure les poids du score. GA-26 […] exige de
choisir avant d'écrire. »

**Tranché : le toggle n'existe plus, et il n'a jamais existé.** Deux constats, chacun vérifié :

1. **Sa raison d'être a disparu avec C1.** Le toggle « ajoute au-dessus de chaque badge de rôle le
   niveau structurel » (v3 l.267) : il n'a de sens que si l'arbre est rangé par rôles. Le FINAL
   fait de L0-L4 le défaut ; le toggle basculerait donc vers ce qui est déjà à l'écran.
2. **Il n'est pas codé.** Aucune chaîne d'interface `voir la structure|structure L0|L0-L4` dans
   `apps/web/src` — seulement des commentaires et un nom de test (`focalOrgData.test.ts:199`).
   Le seul basculeur est `systemView` (`TabOrganigramme.tsx:71`), focale ⇄ système.

**Et la prémisse GA-26 du tracker est FAUSSE** (§0.4) : la source ne fait jamais configurer un
poids par ce toggle. La question GA-26 est réelle, mais elle appartient à **C6** et à la
persistance du **sélecteur de direction** — voir **D276** et **D279**.

**Conséquence non dite — la v3 gardait le toggle « activé par défaut » dans la vue Entité**
(v3 l.642). Cette sous-vue existe (`OrgGraphViews`, `OrgInfluenceMap`, atteignables par
`TabOrganigramme.tsx:167-184` et `:210`), et elle affiche déjà les niveaux. **Rien à faire.**

**Lot de travail :** aucun code. Écrire au tracker que ce point est CLOS, sans quoi il sera
re-posé.

### P2 · Le ciblage par niveau hiérarchique

INV l.218-220 : « La maquette 05 montre 5 cibles (dont “L2 + L3 · Directions & management”) ; le
§11 du FINAL n'en décrit que 4. »

**Vérifié à l'image et au texte.**

| `mq 05` (planificateur)                         | FINAL §11 (l.361-371)        |
| ----------------------------------------------- | ---------------------------- |
| Action rapide « Enrichir les 50 suivants »      | « Enrichir les 50 suivants » |
| « Cette direction · Engineering · AIRBUS DS »   | « Cette direction »          |
| « Rôles manquants · Engineering + Procurement » | « Rôles manquants »          |
| **« Niveau hiérarchique · L2 + L3 »**           | — **absent**                 |
| « Plan complet · Tout AIRBUS »                  | « Plan complet »             |
| —                                               | « Reprendre après erreur »   |

L'écart exact est donc : **la maquette ajoute « Niveau hiérarchique », le texte ajoute « Reprendre
après erreur »** (qui n'est pas une cible mais une propriété de reprise — sa place n'est pas dans
un menu).

**État du dépôt : le ciblage par niveau EXISTE, mais ailleurs.**

- Filtre de niveau, vue système : `OrgInfluenceMap.tsx:82` (`const [level, setLevel] = useState('')`),
  sélecteur `:183-190`, appliqué `:115` puis `orgInfluenceMapData.ts:425`.
- **Et il est déjà passé à l'enrichissement** : `OrgInfluenceMap.tsx:104` — `level: gap.level ?? undefined`
  transmis à `enrichContacts.mutate`. Le chemin technique est donc déjà là.
- **Absent de la vue focale** : `FocalOrgView.tsx` n'a que le sélecteur de direction (`:86-102`) et
  les quatre raccourcis (`:197-232`).

→ Décision parquée **D281** : la cible « Niveau hiérarchique » est un choix de périmètre produit
(elle change ce qu'on facture au commercial), pas une lecture de source.

### P3 · Le déclencheur du retrait de l'ancien `OrgChart`

**FINAL** (l.61-62) : « Ancien OrgChart 3 rangées — Toujours présent en fallback — **À retirer après
migration / rebuild des dossiers.** » ; et le refus l.513 : « Deux moteurs d'organigramme parallèles
— On converge vers OrgGraph et retire le fallback historique après migration. »
**v3** (l.879-882) : « Phase 5 — Bascule + retrait (0,5 sem.) · Feature flag basculé · **Ancien
rendu accessible en “+ Ancienne vue” pendant 4 semaines** · Retrait de `OrgChart` et
`OrgGraphViews` en section séparée. »

**Deux déclencheurs incompatibles : un ÉTAT DE DONNÉE (rebuild) contre un DÉLAI (4 semaines).**

**Tranché sur le principe : le FINAL** — le déclencheur est un **état**, pas une date. Un délai
calendaire retire le repli pendant que des dossiers non re-analysés en ont encore besoin ; c'est
un retrait qui casse des comptes réels au jour 29. Un rebuild est mesurable : on sait combien de
dossiers portent un `orgGraph` exploitable.

**Mais le FINAL laisse « rebuild des dossiers » sans définition**, et c'est là que la décision est
produit : **rebuild de TOUS les dossiers, ou de ceux qu'on ouvre ?** Re-analyser tous les comptes de
tous les espaces coûte des crédits que personne n'a demandés.

**État du dépôt : le repli est vivant et atteignable — et il y a DEUX portes, pas une.**

- **Porte extérieure, correcte** : `TabOrganigramme.tsx:123` — `if (orgGraphViews && !systemView) { … FocalOrgView … }`.
  Un dossier sans `orgGraph` (analyse ancienne) n'entre pas dans la focale et retombe sur le rendu
  historique. C'est bien un repli de MIGRATION, documenté `:47-49`.
- **Porte intérieure, douteuse** : `TabOrganigramme.tsx:167-184` — `influenceMap ? <OrgInfluenceMap …/> : <OrgChart …/>`,
  commentaire `:162-166` (« l'arbre plat — rangées = rôles d'achat, racine = premier contact
  trié »). Celle-ci se déclenche sur **l'absence de carte d'influence**.
- Sa géométrie est celle que C1 refuse : `contactRoles.ts:126-138` (la table) + `:187-189`
  (`getOrganigrammeRoleLevel(role): 1 | 2 | 3`) + `OrgChart.tsx:135-149`.
- Sa légende s'excuse d'exister : `OrgChart.tsx:112-114`, `fr/accountOrg.json:132` — « Les rangées
  regroupent les rôles d'achat : ce n'est pas une hiérarchie. »
- **Et il y a un troisième rendu hérité, toujours affiché** : `OrgStructureSection`
  (`TabOrganigramme.tsx:79` puis `:212`), qui lit les clés héritées `org.decisionChain` et
  `org.stakeholderMap` (`orgStructureData.ts:231-249`) — clés encore émises par
  `apps/ia/app/services/org_graph_build.py:27` (`_LEGACY_KEYS`) et `:59`.

**Conséquence non dite — la porte intérieure n'a rien à voir avec une migration.** `influenceMap`
est `null` quand la CARTE D'INFLUENCE est vide, ce qui arrive sur un graphe parfaitement valide
(aucune arête d'influence). Un compte **moderne** qui clique « Voir la vue système » et n'a pas
d'arêtes d'influence tombe donc dans `OrgChart`, avec la géométrie par rôles que C1 refuse. **Ce
n'est pas un repli de migration, c'est un repli de contenu** — et il ramène la faute sur des
données qui n'en ont pas besoin. C'est le point à corriger en premier, et il ne demande aucun
arbitrage.

→ Décision parquée **D280**.

### P4 · La cohérence du compteur « 2 103 classés déterministiquement »

INV l.226-228 pose deux questions : est-ce le même compteur que `deterministicClassified` de la
v3 ? et 2 103 > 1 978 (rattachés) est-il cohérent ?

**Tranché — les deux réponses sont oui, et le code les tient déjà.**

1. **Même compteur, et il est déjà CALCULÉ.** Le contrat le porte sous le nom v3 :
   `deterministicClassified` (`org-graph.ts:428` — « Ceux qu'un classement DÉTERMINISTE a situés
   dans la hiérarchie — 0 crédit »). L'assembleur le mesure vraiment, en relisant les titres avec
   le classifieur déterministe — `org_graph_assembler.py:443-454` :
   `sum(1 for title in title_by_key.values() if classify_hierarchy_level(title) != "unknown")`,
   attaché au graphe `:1030-1032`. Il est exposé par `deriveOrgCoverage` (`org-graph.ts:502`).

   ⚠️ **Et il n'est affiché nulle part.** Il n'a même pas de nom à l'écran : aucune clé i18n ne lui
   correspond dans `apps/web/src/i18n/locales/fr/accountOrg.json:415-422`, qui n'en nomme que six
   (`discovered`, `attached`, `enriched`, `verifiedLinks`, `probableLinks`, `uncoveredZones`).
   Calculé, stocké, contractualisé, testé — **et sans lecteur**. Le C9 en une ligne.

2. **2 103 > 1 978 est CORRECT, et l'invariant est écrit.** Un contact se classe sur son **titre**
   (« Directeur des Systèmes d'Information » → L1) sans qu'on sache dans quelle **entité** il
   travaille. Classer et rattacher sont deux opérations différentes ; rien n'ordonne leurs
   résultats. La seule borne que le contrat impose est la bonne :
   `org-graph.ts:445-451` — chacun de `attachedToEntity`, `deterministicClassified`, `llmEnriched`
   est borné par `discovered`, et par rien d'autre. 2 103 ≤ 2 241 : valide.

**Conséquence non dite — le vrai problème du compteur n'est pas 2 103, c'est 1 978.** Le contrat et
l'assembleur refusent tous deux de produire `attachedToEntity`, avec la même raison écrite ; le
paquet l'affiche pourtant dans les quatre en-têtes (FINAL l.114, v3 l.134, `mq 01`, `mq 02`), et
l'écran le fabrique (`focalOrgData.ts:599`). **Le compteur douteux du bandeau n'est pas celui que
le §8 désigne.** Voir C9 et D278.

**Lot de travail :** aucun sur 2 103 — la question est close par le code. Ce qui reste est le lot
de C9.

### P5 · ⚠️ Le point que le §8 a laissé tomber : « configurables PAR QUI ? »

L'inventaire pose **huit** questions à faire trancher par Louis (INV l.580-229). Le tracker en
règle trois par les arbitrages A1/A2/A3 (TRACKER l.41-43) et en reporte quatre au §8
(l.99-102). **Il en reste une, qui n'est nulle part :**

> INV l.214-216 : « **5. Les poids du score de direction sont “configurables” — configurables par
> qui ?** Le FINAL dit “configurables” et interdit le prisme IT par défaut, sans dire si le réglage
> vit dans l'env, par espace, ou par utilisateur. La règle maison “un réglage vit à un seul
> endroit” (GA-26) exige de choisir avant d'écrire. »

C'est exactement la question GA-26 que le §8 du tracker a **attribuée au toggle** (§0.4) — elle
existe, mais sur C6. Elle est traitée en **D276**, dont la recommandation la fait disparaître :
sans second score, il n'y a pas de poids à configurer.

---

## 3. Les décisions parquées — D276 à D281

Chacune a une recommandation explicite. **Aucune ne bloque** : l'implémentation peut avancer sur
tout le reste, et chacune dit ce qui se passe si personne ne répond.

### D276 · Le score de la direction focale : on décline la forme du FINAL

**Question.** Le FINAL demande un score à cinq facteurs pondérés, « configurables »
(FINAL l.177-179). Le dépôt dérive la direction du chemin recommandé et refuse explicitement un
second classement (`focalOrgData.ts:421-431`). Lequel gagne ?

**Recommandation — GARDER LA DÉRIVATION, et porter le domain-awareness dans le CHEMIN.**
Trois raisons :

1. La raison écrite dans le dépôt est plus forte que celle du FINAL : « deux classements d'une
   même question finissent par diverger ». Le chemin porte déjà l'exclusion des écartés, l'ordre
   du comité et le garde-fou gouvernance ; un second score les ignorerait.
2. Le FINAL veut un résultat (la direction dépend de ce qu'on vend), pas un mécanisme. Faire
   entrer Projet/Mission dans `org-graph-path.ts` donne le résultat sans le mécanisme.
3. Cela **dissout** la question orpheline P5 : sans poids, pas de « configurables par qui »,
   pas de problème GA-26.

**Si personne ne tranche** : ne rien coder. L'écran fonctionne ; il est simplement aveugle au
domaine — ce qui est le statu quo, pas une régression.

**Ce que la décision engage** : accepter de s'écarter d'une demande écrite du document qui fait
autorité, et l'écrire dans le tracker pour que ce ne soit pas relu comme un oubli.

### D277 · La borne de l'arbre focal : que coupe-t-on, et comment le dit-on ?

**Question.** Le FINAL dit « 5 à 12 cartes » (l.137). L'arbre n'a aucune borne
(`FocalOrgView.tsx:363-365`). Sur quoi porte la borne, et que devient ce qui sort ?

**Recommandation :**

1. **Par NIVEAU, jamais sur le total.** Une borne globale peut vider une rangée entière, ou faire
   disparaître le seul L1.
2. **Ce qui sort est COMPTÉ et NOMMÉ** — « + 34 autres à ce niveau », cliquable vers le tiroir.
   Un arbre tronqué en silence refait, à l'échelle de la rangée, le défaut que tout ce chantier
   corrige (« l'utilisateur voit 30 personnes sur un compte à 2 241 »).
3. **Ce qui est gardé est le plus haut, puis le mieux prouvé** — jamais le premier arrivé.

**Si personne ne tranche** : le scénario S11 (« organigramme rempli de juniors », v3 l.700-701)
se réalise sur les gros comptes, et il ne se verra pas en CI — seulement en réunion.

### D278 · Le compteur « rattachés » du bandeau focal

**Question.** L'écran affiche un nombre que le contrat et l'assembleur refusent tous deux de
produire, et pour la raison exacte qu'ils écrivent (C9). Le retire-t-on d'un écran livré ?

**Recommandation — OUI, et le remplacer par `UnknownValue`.** Brancher l'écran sur
`deriveOrgCoverage` supprime le calcul fautif (`focalOrgData.ts:599`) et rend `null` — donc
« non mesuré », nommé. **C'est un cas d'école de la règle maison** : _si cette valeur est absente,
« 0 » est-il VRAI ?_ Ici ce n'est même pas « 0 » qui s'affiche, c'est un chiffre plausible et faux,
ce qui est pire — on ne peut pas s'en méfier.

**Pourquoi c'est parqué et pas tranché** : retirer un chiffre d'un écran en production se voit, et
un bandeau qui passe de six à cinq compteurs pleins peut se lire comme une régression en démo.
C'est un arbitrage produit.

**Si personne ne tranche** : le bandeau continue d'annoncer un rattachement ferme sur des comptes
où il n'a rien mesuré.

### D279 · Où vit la direction focale choisie ? (persistance + GA-26)

**Question.** Les deux sources l'exigent — « mémorisé par utilisateur × compte » (FINAL l.131),
« la direction courante voyage dans l'URL » (v3 l.243) — et le dépôt n'a ni l'un ni l'autre
(`TabOrganigramme.tsx:71`, `useState` nu, sans `localStorage` ni paramètre d'URL).

**Recommandation — L'URL, et l'URL seule.** Elle satisfait les deux exigences d'un coup : elle
survit au rechargement, et elle rend l'organigramme **partageable par son lien** — ce que la
mémoire serveur ne fait pas. Un réglage vit à un seul endroit (GA-26) : choisir l'URL ferme la
question, ajouter une préférence serveur en plus l'ouvre pour de bon.

⚠️ Réserve honnête : l'URL ne survit pas au passage d'un appareil à l'autre. Si « mémorisé par
utilisateur × compte » veut dire cela, il faut une préférence serveur — **et alors l'URL n'en est
plus la source, elle en devient une projection**. C'est ce choix-là qui est parqué.

**Si personne ne tranche** : rien de cassé, mais un lien d'organigramme ne montre pas ce qu'on
voulait montrer.

### D280 · Quand retire-t-on l'ancien `OrgChart` ?

**Question.** Rebuild des dossiers (FINAL l.61-62) ou quatre semaines calendaires (v3 l.879-882) ?

**Recommandation — un ÉTAT, jamais une date, et corriger d'abord la CONDITION DE REPLI.**

1. **Immédiatement, et sans attendre l'arbitrage** : corriger la **porte intérieure**. Elle se
   déclenche sur `influenceMap == null` (`TabOrganigramme.tsx:167-184`) — l'absence de **carte
   d'influence**, pas l'absence d'`orgGraph`. Un compte moderne sans arête d'influence tombe donc
   dans la géométrie par rôles que C1 refuse. La porte EXTÉRIEURE (`:123`, `orgGraphViews == null`)
   est la bonne : c'est elle qui doit décider du repli, et un graphe sans influence doit rendre une
   carte vide, pas un autre arbre.
2. **Ensuite**, retrait sur métrique : quand la part de dossiers ouverts portant un `orgGraph`
   exploitable dépasse un seuil décidé — pas quand un calendrier expire.
3. **Retirer le MOYEN avec le composant** : `ORGANIGRAMME_ROLE_LEVELS` (`contactRoles.ts:126-138`)
   part en même temps, sinon un futur écran s'en resservira.

**Ce qui est parqué, précisément** : le sens de « rebuild » — tous les dossiers (coûteux, non
demandé) ou ceux qu'on ouvre (progressif, mais long).

**Si personne ne tranche** : le point 1 vaut d'être fait seul. Il retire l'essentiel du risque
sans rien supprimer.

### D281 · Le ciblage par niveau hiérarchique est-il dans le périmètre ?

**Question.** La maquette 05 le montre (« Niveau hiérarchique · L2 + L3 · Directions &
management ») ; le §11 du FINAL ne le décrit pas (P2).

**Recommandation — OUI, et c'est peu cher.** Le chemin technique existe déjà :
`OrgInfluenceMap.tsx:104` passe déjà un `level` à `enrichContacts.mutate`, et le filtre de niveau
est écrit (`:82`, `:183-190`). Il reste à l'exposer dans le dialogue d'enrichissement. **Et c'est
la cible la plus utile des cinq** : « L2 + L3 » est la réponse directe au scénario S11 (C8, C12) —
enrichir les décideurs plutôt que ceux qui ont un profil public.

**Ce qui est parqué** : une cible d'enrichissement dépense des crédits du commercial. En ajouter
une est un choix de produit et de facturation, pas une lecture de source.

**Si personne ne tranche** : l'utilisateur garde quatre cibles, et « L2 + L3 » se fait à la main
via le filtre de la vue système — plus long, mais possible.

---

## 4. Les deux gardes

**Pourquoi seulement deux, et pourquoi celles-là.** Une garde protège une règle, elle ne l'invente
pas — et elle doit prouver **qu'elle LIT** (son corpus n'est pas vide) et **qu'elle sait dire
NON** (casser le code protégé la fait rougir). Trois candidates ont été écartées pour de bonnes
raisons, et il faut les écrire :

| Candidate écartée                                            | Pourquoi                                                                                                                                                                                           |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GA-26 sur la dérivation du bandeau (C9)                      | **Elle serait ROUGE aujourd'hui** — `focalOrgData.ts:596-604` duplique `deriveOrgCoverage`. Elle se pose après le lot 1 de C9, pas avant. Une garde se pose verte, sinon c'est un bug avec un nom. |
| « aucun rôle ne produit une position verticale » (C1 global) | **Rouge aussi** : `contactRoles.ts:126-138` fait exactement cela pour l'ancien `OrgChart`, encore atteignable. D'où GA-100, bornée à la vue focale.                                                |
| « un bloqueur n'est jamais retiré du graphe » (C2)           | Le corpus serait **vide** : aucun filtre de bloqueur n'existe hors du chemin. Une garde sans corpus ne lit rien.                                                                                   |

### 4.1 · GA-100 — le rôle de décision ne détermine jamais la hauteur d'une carte

`apps/web/src/architecture/focal-tree-height-is-hierarchy.test.ts` — **7 assertions, vertes.**

**Ce qu'elle tient : C1.** L'arbre focal se construit sur `hierarchyLevel`, jamais sur
`OrgDecisionBadge`. C'est la règle que le FINAL nomme et refuse de voir enfreinte
(SH l.58-59, FINAL l.126-127, critère 03 l.469), et c'est le défaut que l'écran précédent avait.

**Ce qu'elle LIT** : le fichier `focalOrgData.ts`, dont elle vérifie **quatre ancres** avant de
conclure quoi que ce soit — le fichier fait plus de 300 lignes, `FOCAL_TREE_LEVELS` est trouvable,
la construction des rangées est trouvable, et les types `FocalLevelRow` / `OrgDecisionBadge`
existent avec leurs quatre valeurs. Sans ces ancres, elle échoue **en disant que son corpus a
changé**, plutôt que de passer au vert sur un fichier qu'elle ne reconnaît plus.

⚠️ Détail qui n'en est pas un : elle extrait l'expression `FOCAL_TREE_LEVELS.map(…)` en
**équilibrant les parenthèses**, pas en cherchant le premier `)`. L'expression réelle en contient
quatre (`.filter`, `.sort`, `.map`, `.filter`) : un découpage naïf lirait un fragment et
conclurait vert sur ce qu'il n'a pas lu. C'est le défaut exact payé sur GA-25 (« un extracteur de
balise coupé à la flèche de `onClick={() => …}` »).

**Ce qu'elle refuse** : qu'un étage soit autre chose qu'un `L*`, que la rangée se construise sur
un `.badge` ou sur l'un des quatre libellés, et que `FocalLevelRow.level` soit typé par le badge.

**Preuve qu'elle sait dire NON.** En remplaçant `card.level === level` par
`card.badge === 'sponsor'` (`focalOrgData.ts:535`), **deux** assertions rougissent :

```
✗ la rangée se construit sur le NIVEAU d’une carte
    expected 'FOCAL_TREE_LEVELS.map(level => ({…' to match /card\.level\b/
✗ la rangée ne regarde jamais le badge d’une carte
    la construction des rangées lit un badge: expected … not to match /\.badge\b/
```

Restauré, `git diff` du fichier protégé : **vide**, et les 7 assertions repassent vertes.

### 4.2 · GA-101 — aucun prompt ne demande un champ d'affichage au modèle

`apps/ia/tests/test_display_fields_never_asked_of_the_model.py` — **7 assertions, vertes.**

**Ce qu'elle tient : C3 (et A1 pour `recommendationLine`).** Les quatre champs
`displayRole` / `accessStatus` / `focusDirection` / `recommendationLine` n'existent nulle part dans
le dépôt aujourd'hui — la règle est donc respectée **par accident**. Le prochain agent qui ouvrira
le §9 du FINAL trouvera dans la v3 (l.337-343) le seul tableau qui donne leur nom et leur format,
et les ajoutera au JSON demandé au modèle, **de bonne foi**. C'est exactement le trou qu'une garde
existe pour boucher.

**Ce qu'elle LIT** : les 34 fichiers de `apps/ia/app/prompts/*.py`, **comme du texte, sans les
importer** — un import tire `anthropic` et consorts, dont le FINAL note lui-même l'absence dans
certains environnements (l.73-75), et une garde qui ne s'exécute pas ne garde rien. Elle vérifie
son corpus par **trois** assertions : au moins 25 prompts ; `bellum_organigramme.py` et
`bellum_contacts.py` présents, longs et portant bien un schéma JSON ; et — la plus importante —
que `"role"` **est toujours demandé** au modèle. Sans cette contre-preuve, une garde verte pourrait
simplement vouloir dire que les prompts ne demandent plus rien du tout.

**Ce qu'elle refuse** : l'apparition de l'un des quatre noms, dans l'une ou l'autre orthographe
(`camelCase` et `snake_case`, parce que la v3 emploie les deux), dans un texte de prompt.

**Ce qu'elle ne fait PAS, et pourquoi** : elle ne dit rien des dérivations. `decisionBadgeOf`
(`focalOrgData.ts:92-112`), `_decision_roles`, `_identity_status` et `_access_score`
(`org_graph_assembler.py:309-392`) sont libres d'évoluer — la garde interdit **la source LLM**, pas
la valeur. Une garde qui interdirait aussi la dérivation empêcherait de corriger un bug.

**Limite connue, écrite pour qu'elle ne se découvre pas seule** : un champ injecté à l'exécution
depuis une constante située hors de `app/prompts/` échapperait à cette lecture. Le dépôt n'emploie
nulle part cette forme aujourd'hui — les schémas JSON sont écrits en clair dans les prompts — mais
la garde ne la verrait pas.

**Preuve qu'elle sait dire NON.** En ajoutant deux lignes au schéma JSON du prompt contacts
(`bellum_contacts.py`, après `:139`), **deux** assertions rougissent, en nommant fichier et ligne :

```
FAILED …::test_aucun_prompt_ne_demande_ce_champ_daffichage[displayRole-spellings1]
    « displayRole » est demande au modele : bellum_contacts.py:140 (displayRole).
FAILED …::test_aucun_prompt_ne_demande_ce_champ_daffichage[accessStatus-spellings0]
    « accessStatus » est demande au modele : bellum_contacts.py:141 (accessStatus).
```

Restauré, `git diff` du fichier protégé : **vide**, et les 7 assertions repassent vertes.

> Aucun fichier suivi par git n'a été modifié par ce chantier : `git status` ne montre que les
> trois fichiers créés (ce registre + les deux gardes).

---

## 5. Ce que ce travail n'a pas fait

- **Le §2 du FINAL (« ce qui existe déjà — ne pas recoder ») n'a servi de preuve nulle part.** Le
  document avoue lui-même sa portée : « L'audit est statique sur le repo fourni. **Les tests
  Python ciblés n'ont pas pu être exécutés** […] car la dépendance `anthropic` n'est pas
  installée » (FINAL l.73-75). Il affirme que `DeclareOrgPanel`, le vérificateur de relation et
  `OrgGraphVersioning` **existent** ; il n'affirme jamais qu'ils sont **APPELÉS**. Chaque
  affirmation d'existence citée dans ce fichier a été revérifiée par une chaîne d'appelants ou
  marquée `NON PROUVÉ`. Un autre agent creuse ce point en parallèle.
- **Les trois alternatives GPT écartées** (INV l.521-535 : vue Groupe en premier écran, rail
  Achats sur l'écran principal avec les 8 rôles bruts, mode édition plein écran — plus le drag &
  drop) n'ont été ni recodées ni re-proposées.

  > ⚠️ **REVIREMENT — Louis, 31/08/2026. Ce paragraphe reste vrai de ce qu'il décrit ; il n'est
  > plus l'état en vigueur.**
  >
  > **Ce qui était refusé, et pourquoi.** Trois maquettes du 27/08 :
  > (1) la vue **Groupe en premier écran** — refus de la décision 3 du FINAL du 27/08, « vue
  > Groupe comme home quotidienne : trop large pour préparer une action » ;
  > (2) le **rail Achats sur l'écran principal avec les 8 rôles bruts** — l'écran d'arrivée doit
  > répondre à « par qui je commence ? », et huit rôles bruts sur la page d'accueil noient la
  > lecture commerciale à quatre valeurs ;
  > (3) le **mode édition plein écran, plus le glisser-déposer** — décision 7 du paquet OrgGraph,
  > « le drag & drop est séduisant visuellement mais trop destructeur pour une donnée sourcée » :
  > un déplacement à la souris ne porte NI raison NI preuve, et l'API n'a aucune route qui
  > accepterait l'un sans les deux.
  >
  > **Ce que Louis a tranché le 31/08/2026.** Les trois deviennent des **vues COMMUTABLES** sur
  > l'onglet Organigramme (`orgViewModes.ts` : `focal · group · hierarchy · edit · system`).
  > **Ce ne sont pas des remplacements**, et chaque raison d'origine est tenue dans la forme
  > livrée :
  >
  > | Refus d'origine                                        | Ce qui est livré                                           | Comment la raison tient                                                                                                                                                                                                                                                  |
  > | ------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  > | « Groupe en premier écran : trop large »               | Vue **Groupe**, en un clic                                 | La **focale reste le défaut** (`DEFAULT_ORG_VIEW_MODE = 'focal'`). « Trop large pour préparer une action » reste vrai — ce n'était pas une raison de ne pas pouvoir la regarder.                                                                                         |
  > | « 8 rôles bruts sur l'écran principal »                | Vue **Hiérarchie**, avec les rôles bruts et le rail Achats | Ils ne sont PAS sur l'écran principal. Et ce sont les **huit rôles du contrat** (`orgDecisionRoleSchema`), affichés avec les libellés du tiroir de correction — **pas un second vocabulaire**.                                                                           |
  > | « drag & drop trop destructeur : ni raison ni preuve » | Mode **Édition** avec glisser-déposer                      | Le dépôt **n'écrit rien**. Il PROPOSE un `reportsTo` et ouvre `OrgCorrectionDrawer`, qui réclame raison + preuve avant `PATCH /accounts/:id/org-graph/corrections`. **Une seule porte** — `OrgEditView` n'appelle ni `apiFetch` ni le hook d'écriture. Garde **GA-236**. |
  >
  > **Ce que le revirement n'a PAS changé** : la hauteur d'une carte vient du niveau L0-L4 et
  > jamais du rôle (GA-100) ; les Achats restent HORS de la colonne hiérarchique ; **trait plein =
  > relation vérifiée, pointillé = hypothèse** — aucune des trois maquettes ne portait cette
  > distinction, elle est rendue par `OrgLinkMarker` dans les trois vues, à partir de la règle du
  > contrat (`orgLinkOrigin`) lue une seule fois dans `focalOrgData`.
  >
  > **Ce que le glisser-déposer doit encore être** : opérable **au clavier**. Chaque carte porte
  > « Déplacer <nom> » (`aria-pressed`) puis « Rattacher <nom> ici » sur toutes les autres ; les
  > deux chemins appellent la même fonction, Échap annule.

- **Aucun code applicatif.** Deux gardes, et ce fichier.
- **La couverture des 14 scénarios red-team par des tests est `NON PROUVÉE`** (C12) : aucune table
  ne relie un scénario à un test.
- **Le P0 lui-même n'est pas dans ces treize contradictions** : les deux documents sont d'accord
  dessus. Il est traité par le tracker §4 et le dépôt le tient déjà
  (`apps/ia/tests/test_org_reporting_provenance.py`).
