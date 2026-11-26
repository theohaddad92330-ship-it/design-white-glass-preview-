
## ⚠️ Deux lectures de l'EFFECTIF qui divergent — mesuré le 14/09/2026 en production

Sur le MÊME compte (THALES, `86589f46-b00a-4d5e-8032-715e09e9f0c8`), au même instant :

- Section Synthèse › Firmographie : « Employés estimés **83 000** », source réseau professionnel.
- Section Écosystème & accès › COMMENT CE COMPTE ACHÈTE : « **effectif 42 salariés** — la maturité achat croît par paliers », qui contribue **+0,18** au score de barrière d'accès.

Le second alimente un CALCUL (la barrière d'accès à 4,8/10), pas seulement un affichage.
42 salariés est l'effectif d'une entité juridique, 83 000 celui du groupe — deux périmètres,
un seul mot. Même famille que `jointure-par-nom-entre-deux-referentiels` et
`deux-lectures-qui-divergent-domaine-vs-nom` : le calcul est juste sur sa ligne et faux
sur ce que l'utilisateur croit lire.

À vérifier avant de corriger : quel SIREN porte chacun des deux chiffres.

## ⚠️ La timeline du dossier rend un identifiant MACHINE — mesuré le 14/09/2026 en production

Section « Historique & preuves » de THALES, événement du 14/09 à 19:02 :

```
account_priority — accept
Interne · Bellum · Louis Schlegel · Rattaché à la main
```

L'auteur, la date et la source sont bien là (#2124.60/.61/.63 recettés). L'OBJET,
lui, sort en `snake_case` brut. Un commercial ne lit pas « account_priority ».
C'est le point #2124.68 pris en flagrant délit : « l'historique ne devient pas un
journal technique illisible ».

Ce n'est pas un défaut d'affichage isolé : c'est une clé d'événement qui n'a jamais
reçu de libellé métier. À corriger par un catalogue de libellés (FR + EN),
avec un repli qui NOMME l'événement inconnu plutôt que de rendre sa clé —
et une garde qui refuse une clé sans libellé, dans le même esprit que
`entityType` (défaut jumeau trouvé le même jour sur les niveaux d'entité).

## ⚠️ La lecture en sept axes est LIVRÉE, DÉPLOYÉE, et invisible sur les 30 comptes réels

Mesuré le 14/09/2026, après le déploiement de `d2f5ae8a1` : **aucun** des 30 comptes
de l'espace de Louis ne porte `evaluation.dossier_read`. Toutes leurs analyses sont
antérieures au contrat. La Synthèse le dit honnêtement — « Axes non détaillés pour
cette analyse » — et c'est le bon comportement.

Mais le résultat net est qu'une capacité livrée, testée, seedée en démonstration et
déployée **ne se voit nulle part chez l'utilisateur** tant qu'une analyse neuve n'est
pas lancée. Elle se prouve aujourd'hui sur la seule démonstration publique
(comptes SNCF et Société Générale).

Ce n'est pas un bug, c'est une **migration de données manquante** : ou bien on
relance les analyses (coût à annoncer), ou bien on assume que le bloc n'apparaît
qu'aux analyses futures. C'est une décision de Louis, pas un correctif.

⚠️ Le même piège attend toute capacité qui ajoute un bloc au contrat d'analyse :
le code part, la donnée ne suit pas, et la recette sur les comptes existants ne
peut RIEN prouver. À vérifier systématiquement : *combien de comptes réels portent
déjà le champ que ce lot ajoute ?*

## ⚠️⚠️ OUTILLAGE — les worktrees vivent DANS le dépôt : un `grep` depuis la racine lit les autres branches

Mesuré le 14/09/2026. Un vérificateur briefé « arbre `d2f5ae8a1` » a rendu cinq
verdicts sur `AccountCollaborationBand.tsx` en citant des `fichier:ligne` précis.
Ce fichier **n'existe pas sur `main`** :

```
git cat-file -e d2f5ae8a1:…/AccountCollaborationBand.tsx   → n'existe pas
git ls-tree -r --name-only d2f5ae8a1 | grep -i collaborationband → ABSENT
git ls-tree -r --name-only collaboration-sur-le-compte | grep -i … → PRÉSENT
```

Cause : les worktrees d'agents sont créés sous `.claude/worktrees/<nom>/`, donc
**à l'intérieur du dépôt**. Un `grep -rn` lancé depuis la racine descend dedans et
lit le code de branches non mergées, sans que rien ne le signale. Le verdict est
alors juste — mais sur un autre arbre que celui annoncé.

**Ce que ça coûte** : un point classé `recetté` sur du code qui n'est pas en
production. C'est exactement le contraire de ce que la recette garantit.

**Comment s'en prémunir** :
- borner la recherche au chemin utile (`grep -rn <motif> apps/ packages/`), jamais
  depuis la racine nue ;
- mieux : lire par `git show <sha>:<chemin>` ou `git grep <motif> <sha>` — git ne
  sortira jamais de l'arbre demandé ;
- et le contrôle qui tranche en une seconde : `git cat-file -e <sha>:<chemin>`
  avant d'écrire un verdict qui cite ce chemin.

Même famille que « un constat de CE MATIN est déjà périmé » : le verdict décrit un
arbre, et il faut dire LEQUEL.

## Une carte de source écrit son nom DEUX fois (mesuré 14/09, démo, NOVA LOGISTIQUE)

`/accounts/<id>?tab=overview` › « Sources et confiance » › « Sources du dossier ».
La carte rend « Offres d'emploi » **deux fois de suite**, dans la même carte :

- `<p class="text-xs font-medium … truncate">` sous `div.flex.items-center.gap-2` — le **libellé de CATÉGORIE**
- `<p class="text-xs font-normal … block truncate">` sous `div.min-w-0.flex-1` — le **nom de la SOURCE**

Mesure : 4 nœuds feuilles au texte exactement `Offres d'emploi`, dont les deux
premiers dans la MÊME carte (`closest('li,article,[class*=card]')` identique),
parents différents. Ce n'est donc pas une répétition de liste, c'est la même
information écrite deux fois dans une carte.

**Cause** : quand le nom d'une source est égal à son nom de catégorie, les deux
lignes disent la même chose. Rien ne compare les deux avant de rendre.

**Règle heurtée** : loi 4 du tome 7 — « rien n'apparaît deux fois sous la même
forme avec le même contenu » (non gardée, mais appliquée). C'est exactement le
cas que la loi vise : l'entête ne répète plus l'onglet actif ni le nom de section.

**Correctif** : ne rendre la seconde ligne que si `source.name !== source.category`.

## ⚠️⚠️ CRITIQUE — le hero du dossier s'écrase à 0 px de large sur 5 comptes sur 5 (prod, mesuré 14/09 22h45)

**Symptôme** : sur `/accounts/<id>?tab=overview`, le nom du compte, le secteur, le
SIREN et le propriétaire s'affichent **un mot par ligne**, sur 600 à 720 px de
haut, et le bouton « Continuer la prochaine action » recouvre le `<h1>`.

**Mesure** (`getBoundingClientRect` + `getComputedStyle`, fenêtre 1512 px) :

| bloc | classes | `flex-shrink` | largeur |
|---|---|---|---|
| identité | `flex min-w-0 items-center gap-4` | `1` | **0 px** |
| actions | `flex shrink-0 flex-wrap items-center gap-2 lg:justify-end` | **`0`** | **1359 à 1628 px** |

Parent : `display:flex`, `flex-direction:row`, **`flex-wrap:nowrap`**, `justify-content:space-between`, **largeur 1174 px**.

**Cause** : le bloc d'actions porte `shrink-0`, donc il ne rétrécit JAMAIS sous sa
largeur max-content — et cette largeur dépasse le parent (1628 > 1174) parce que
le bloc contient la **phrase entière** de la prochaine action (« Relancer Sandrine
Pata en rappelant l'historique CRM Thales du 31 août 2026 et demander une
introduction vers… »). Flexbox doit bien retirer 454 px quelque part : il les
prend sur le SEUL frère rétrécissable, la colonne d'identité — et `min-w-0` lui a
retiré son plancher `min-width:auto`. Elle tombe donc à zéro.
Le `flex-wrap` posé sur le bloc d'actions ne sert à rien : `shrink-0` l'empêche de
descendre sous max-content, donc l'enroulement ne se déclenche jamais.

**Portée** : THALES, DEVOTEAM, Societe Generale, SARL ER, ROCHE — **5 sur 5**.
**Et sur les SEPT sections** (sonde repassée sur THALES) : Synthèse, Périmètres,
Opportunités, Personnes, Écosystème & accès, Plan d'action, Historique & preuves —
identité à 0 px, actions à 1527 px, bouton sur le `<h1>`, **7 sur 7**. Le hero est
partagé : la portée réelle est **tout compte × toute section**, soit l'état
permanent de l'écran principal du produit. Correction à faire UNE fois.
C'est un défaut de POPULATION sur l'écran principal du produit, pas un cas limite.
Il grandit avec la longueur de la phrase de prochaine action, donc il est INVISIBLE
en CI : jsdom ne met rien en page, et les fixtures de test portent des phrases courtes.

**Correctif** : la phrase de prochaine action ne doit pas vivre dans la rangée
d'actions à `shrink-0`. Soit elle passe sur sa propre ligne sous le hero, soit la
rangée perd `shrink-0` et enroule vraiment. Et la colonne d'identité doit porter
`flex-1` en plus de `min-w-0`, pour réclamer sa part au lieu de la céder.

**Le test qui sait dire NON** : il ne peut PAS être un test jsdom de classes — une
classe présente ne prouve pas une mise en page. Il faut soit une garde qui interdit
`shrink-0` sur un conteneur qui reçoit du texte de longueur libre, soit une mesure
en recette live. La garde de classe seule serait borgne.

## ✅ Vérification de doctrine PASSÉE — le copilote n'a aucun chemin d'écriture (14/09)

Demandée explicitement au vérificateur de #2123, et c'est un résultat à garder :
**aucun chemin d'écriture** n'existe du côté des outils de proposition de Laura.

- `prepare_mail_draft` est documenté « L'outil n'écrit RIEN » et figure dans
  `WRITE_TOOL_NAMES` (`apps/ia/app/services/chat_tools.py:522-535,940-951`).
- Tests dédiés : `test_prepare_message_returns_a_proposal_and_writes_nothing`
  (`test_chat_write_tools.py:200`), `test_create_contact_from_crm_returns_a_proposal_and_writes_nothing`
  (`:136`), `test_orchestrator_surfaces_the_proposal_as_pending_never_as_done` (`:279`).
- Côté web, GA-238 (`laura-surfaces-are-not-second-assistants.test.ts`) interdit
  tout verbe d'envoi (`send|deliver|dispatch|outbox|publish`) dans un chemin d'API
  appelé depuis une surface Laura, **avec un test qui sait dire NON**.

« Ce n'est pas une convention, c'est l'absence de code » : vérifié.

## Piège de méthode — la navigation SPA par `pushState` DÉRIVE pendant la mesure (14/09)

En recette écran sur le dossier de compte, `history.pushState()` + `PopStateEvent`
suivi d'une capture a rendu **trois faux résultats** avant d'être abandonné :

1. `?tab=partners` demandé, URL réelle après attente : `?tab=organigramme`.
2. Une capture censée porter sur « Écosystème & accès » a relevé les **44 lignes
   du tableau des sites** — d'où un faux « 44 doublons entre Périmètres et
   Écosystème », qui n'existe pas : sur un VRAI chargement de `?tab=partners`,
   la section rend 0 liste.
3. Trois dépassements du délai CDP (45 s) sur des boucles qui enchaînaient
   clic + attente sur plusieurs sections.

**Cause** : `pushState` court après le routeur (TanStack), qui recalcule sa propre
destination — la capture tombe entre l'ancien rendu et le nouveau.

**La règle** : pour comparer le CONTENU de deux écrans, passer par un **vrai
chargement de page** (l'outil `navigate`), pas par `pushState`. `pushState` reste
acceptable pour un balayage où l'on ne cherche qu'une erreur ou une mesure de
boîte sur la coque partagée — jamais pour attribuer un contenu à une section.
Et **toujours relire `location.search` dans la capture elle-même** : si l'URL
mesurée n'est pas l'URL demandée, le relevé est nul.


## ❌ RETRAIT — le « défaut d'import CRM » du 14/09 n'existe pas

J'avais consigné, et annoncé à Louis, qu'un contact CRM inconnu était perdu en
silence sous un journal disant « créé » (`crm-import.service.ts:251`,
`if (decision.action !== 'update') return null`), et que l'écran de réconciliation
promis par le docblock n'existait pas.

**C'est faux, et la cause de l'erreur est que j'ai lu le mauvais chemin.**
`crm-import.service.ts` est la SIMULATION de synchronisation, pas l'import.
L'import réel est : `routes/settings/import.tsx` → `ImportWizard` →
`POST /import/apply` → `import-writer.service.ts:140-230`, qui crée bien un
`AccountEntity` ET un `ContactEntity` structurés — pas un stockage RAG.
La déduplication y est présente (`accountKeys` / `dedupKeyOf`, `:145-183`).

**La leçon** : j'avais cherché l'APPELANT du mauvais côté. Trouver qu'une fonction
n'a pas d'appelant ne prouve un défaut QUE si cette fonction est bien celle qui
porte la capacité. Ici elle ne l'était pas — le vrai producteur vivait sous un
autre nom, dans un autre module. Avant de conclure « code que personne n'appelle »,
il faut d'abord établir que la capacité n'a pas d'AUTRE implémentation.

## Encore le défaut n°1 — `RefreshTriggerProposal` n'a aucun consommateur (14/09)

Trouvé hors lot par l'écrivain de #2116 : `RefreshTriggerProposal` et
`refreshTriggerCost` (`packages/contracts`) **n'ont aucun consommateur, ni web ni
API** — sur les SIX déclencheurs de rafraîchissement. Contrat écrit, typé, et
appelé par personne.

Et un second, dans le même lot, qui était le point #2116.31 lui-même :
`DossierCtaContract.permission` n'était lue nulle part dans tout `apps/web` — un
commentaire, rien de plus. Corrigé : le droit s'affiche maintenant avant le clic.

⚠️ **Mais la moitié du point reste ouverte, et c'est une cause racine** : l'app
n'a **aucune source de rôle câblée** — `useRouteAccess` pose `role: 'owner'` EN
DUR. Aucun écran ne peut donc comparer un droit exigé au rôle réel de celui qui
regarde. Tant que ça dure, toute règle de permission côté écran est décorative.

## Deux manques PRODUIT trouvés par inventaire des clés du profil ESN (14/09)

Inventaire exhaustif des clés de `profile_data` lues par `apps/ia/app` sur
`d2f5ae8a1` : `offers` (14 occurrences), `size` (10), `sectors` (7), `personas`
(6), `references` (4), `positioning` (2), `turns_off`, `speaks_in`, `revenues`,
`no_go_sectors`, `lever`. **Et rien d'autre.**

Deux absences comptent :

1. **Le TERRITOIRE de l'ESN n'atteint jamais le moteur.** Aucune clé
   `territory`/`territoires`/`regions`. Une ESN parisienne et une ESN lyonnaise
   reçoivent le MÊME verdict sur le même compte, alors que le territoire est l'un
   des quatre axes déclarés à l'onboarding. Ce n'est pas un point non livré :
   c'est une donnée demandée à l'utilisateur et jetée.
2. **La CAPACITÉ DISPONIBLE non plus.** Aucune clé `capacity`/`availability`.
   L'axe `capacite` du prompt (`bellum_plan.py:190`) note « TON aptitude à
   délivrer ce compte » en ne recevant que `size`, l'effectif TOTAL — qui ne dit
   rien de ce qui est libre. L'axe mesure donc autre chose que ce qu'il annonce.

Deux absences qui, elles, sont cohérentes : la BU et le RÔLE de l'utilisateur ne
sont pas lus non plus, et c'est aligné avec la cause racine du même jour —
l'app n'a aucune source de rôle câblée (`useRouteAccess` pose `role:'owner'` en dur).

## Un état vide GLOBAL qui avale une sous-partie encore pleine (14/09)

Trouvé en complétant les sections de #2115. Le seau « besoins confirmés »
(`LinkedObjectsSummary`, seau `confirmed`) vivait bien dans la section
Opportunités — mais `TabProjects` rendait un **état vide global** dès que
`rows.length === 0`, c'est-à-dire dès qu'un compte n'a aucun PROJET.

Conséquence : un compte sans projet mais AVEC des besoins confirmés n'affichait
**rien du tout**. La donnée existait, le composant existait, le montage existait —
et l'écran était vide. J'avais diagnostiqué « ça vit hors du dossier » ; c'était
faux, et c'est pire : ça vivait dedans, et un frère vide le masquait.

**La forme générique** : un état vide posé au niveau d'un ONGLET éteint toutes
ses sous-parties, y compris celles qui ont de la donnée. L'état vide appartient à
la sous-partie qui est vide, jamais à son conteneur.

⚠️ **Ce que ça dit sur la méthode** : mon diagnostic venait d'une mesure d'écran
sur un compte de démonstration sans projet. L'écran était vide, j'ai conclu à une
absence — au lieu de conclure à « je ne sais pas encore pourquoi c'est vide ».
Un verdict ne se conclut pas d'un silence.
