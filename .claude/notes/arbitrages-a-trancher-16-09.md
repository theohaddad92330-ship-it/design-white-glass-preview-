# Les points « à trancher » du 16/09/2026 — ce qu'une règle écrite tranche, et ce qui monte

Base : `origin/main` = `03625739f`. Registres lus sur leurs branches (non fusionnées) :
`origin/chore/registres-consultants-missions-16-09` et `origin/chore/registres-projects-dashboard-actions-16-09`.

## Les comptes

Mesurés par `grep -c 'à trancher'`, puis corrigés des lignes de PROSE qui contiennent le mot sans être un point
(l'en-tête de méthode, la ligne de répartition) et d'une ligne dont l'état est `retenu` et qui ne fait que citer
un autre point.

| Registre | `grep -c` brut | lignes de prose | **points réels** | tranchés par une règle | **montent** |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/consultants` | 103 | 0 | **103** | 89 | **14** |
| `/missions` | 127 | 1 (`:9`, méthode) | **126** | 100 | **26** |
| `/projects` | 22 | 2 (`:24` prose, `:307` état `retenu`) | **20** | 2 | **18** |
| `/dashboard` | 40 | 0 | **40** | 17 | **23** |
| `/actions` | 16 | 1 (`:9`, répartition) | **15** | 2 | **13** |
| **Total** | **308** | **4** | **304** | **210** | **94** |

210 + 94 = 304. ✅

**Comment la somme a été vérifiée, et pas seulement additionnée** : les numéros de points ont été extraits de
chaque registre (`grep -oE` sur la première colonne), triés, puis comparés par `comm`/`diff` à la liste des points
que ce dossier classe. Les cinq ensembles coïncident exactement — aucun point n'est classé deux fois, aucun n'est
oublié. C'est ce contrôle, et non l'addition, qui garantit que `écarté` n'a pas absorbé un point que personne ne
relira.

**Ce que 210 sur 304 veut dire, et c'est le résultat principal de ce tri** : les deux tiers des points marqués
« à trancher » ne demandent aucune décision. Ce sont des points dont la PREUVE d'existence n'a pas été lue sous
le plafond de tours — ce que les registres disent eux-mêmes de leur méthode. Ils appellent une vérification, pas
un arbitrage. Les faire monter à Louis, c'est lui demander de trancher « est-ce que cette colonne existe ? ».

⚠️ **Rien n'a été écrit dans les registres.** Ils vivent sur deux branches non fusionnées, dont l'une porte un
écrivain en cours sur `/missions` (#2153.3-.17). Écrire les mêmes lignes depuis une branche partie de `main`
aurait produit exactement le défaut documenté du dépôt : des lignes de registre dupliquées, puis un conflit par
ligne au moment de fusionner. **Le texte à écrire est donné ici, une fois par règle** (partie 1) — il s'applique
en une passe sur la branche qui porte le fichier.

---

# Partie 1 — tranché par une règle écrite (210 points)

Groupé par RÈGLE. Le classement par fréquence est une information en soi : il dit quelle règle le produit
re-litige le plus souvent.

## R1 — La méthode des registres eux-mêmes : sans preuve, l'état est `retenu`, pas `à trancher` — 173 points

**La règle**, écrite le 16/09/2026 en tête des deux registres :

- `.claude/notes/registre-2026-09-16-consultants.md:9` — « `déjà là` n'est posé que quand une chaîne, un enum ou
  un composant a été lu concrètement dans `origin/main` (preuve `fichier:ligne`). **Faute de cette preuve, le
  point est `retenu` par défaut** — ce n'est pas une affirmation que rien n'existe, c'est l'absence de preuve
  directe sous 300 tours sur ~465 points par écran. »
- `.claude/notes/registre-2026-09-16-missions.md:9` — qui DÉFINIT le troisième état : « `à trancher` marque un
  point qui, soit demande une décision produit (renommage, fusion/suppression d'onglets), soit revient sur un
  arbitrage DÉJÀ DOCUMENTÉ dans `sections.ts`. »

**L'application.** Un point dont la colonne « Existant » dit « champ présent, colonne non confirmée », « composant
existe, contenu non lu », « probable », « non confirmé au handoff » ne répond à AUCUNE des deux branches de cette
définition : il ne demande pas de décision produit et ne rouvre aucun arbitrage. Il tombe donc dans le défaut
écrit deux lignes plus haut : `retenu`.

**Ce que ça ne fait pas.** `retenu` n'est pas `écarté`. Aucun de ces 173 points n'est refusé, aucun ne disparaît :
ils restent à faire ou à prouver, et c'est précisément l'état qui les garde vivants. La confusion des deux a déjà
coûté au dépôt de faire lire 368 refus là où il y en avait 14.

**Texte à écrire dans la ligne** (colonne « État » et colonne de droite) :

```
| retenu | <preuve en recette inchangée> — état corrigé le 16/09 : absence de preuve `fichier:ligne` = `retenu`,
  pas `à trancher` (méthode du registre, ligne 9). Aucune décision produit n'est demandée ici.
```

| Registre | Points |
| --- | --- |
| `/consultants` (78) | 2152.52 · 2182.6 .10 .18 .20 .22 .28 .29 .30 .31 .32 .33 .34 .37 .38 .44 .46 .47 .48 .49 .51 .59 · 2183.4 .33 .35 .40 · 2184.2 .4 .18 .19 .20 · 2185.3 .4 .6 .7 .8 .13 .14 .16 .18 .20 .25 .27 .28 .29 .41 .42 .44 .51 .53 .54 · 2186.22 .26 .34 .38 · 2187.4 .14 .21 .29 .42 · 2188.1 .2 .3 .4 .5 .6 .7 .8 .9 .15 · 2189.4 .8 .17 .23 .33 .37 · 2190.15 .18 |
| `/missions` (91) | 2153.20 .21 .30 .31 .32 · 2191.12 .13 .14 .17 .21 .22 .27 .29 .35 .36 .37 · 2192.14 .23 .24 .25 .26 .27 .32 .33 .34 .42 .48 · 2193.3 .4 .5 .6 .7 .8 .11 .16 .19 .20 .23 .36 .40 .41 .42 .43 · 2194.1 .4 .17 .33 .34 .40 .42 .43 · 2195.16 .19 .20 .32 .33 .34 .42 .49 · 2196.4 .6 .30 .40 · 2197.9 .14 .15 .17 .21 .22 .44 .48 · 2198.33 .35 .41 · 2199.3 .4 .5 .6 .10 .12 .17 .22 .23 .27 .30 .31 .34 .42 .44 .47 .51 |
| `/dashboard` (4) | 2106.6 .7 .8 .9 — le producteur d'action manque (ou le `kind` est déclaré sans producteur, 2106.8). C'est un trou de câblage mesuré, pas une question. |

⚠️ **Deux d'entre eux méritent d'être lus avant d'être seulement « vérifiés »**, parce que ce sont des cas du motif
que `agent_docs/chantiers-livres.md` répète : *du code juste, calculé, testé, que personne n'appelle*.
`2106.8` (le `kind` `mission_end` est DÉCLARÉ dans `daily-briefing.ts:246` et aucun producteur ne l'émet) et
`2185.44` / `2188.1-9` (la page Reverse Market fait 630 lignes et personne n'a lu quels champs elle consomme).
Chercher l'APPELANT, pas la fonction.

---

## R2 — GA-254 : il n'y a qu'un cockpit d'équipe, et c'est `/team` — 11 points

**La règle**, mesurée le 04/09/2026 (#1457, #1458, #1459) :
`apps/web/src/architecture/one-team-cockpit.test.ts:5-57`, et elle est reprise dans le code qu'elle protège
(`apps/web/src/features/dashboard/api.ts:12` — « on retire le MOYEN, pas seulement la permission »).

Ce qu'elle vérifie, mot pour mot : *« 3. La porte de données d'équipe (`useManagerStats` / `managerApi`) n'est
importée que depuis `features/manager` — **aucun second écran ne se nourrit tout seul de statistiques d'équipe**.
4. `features/dashboard` n'appelle qu'une porte `/dashboard/…`, la PERSONNELLE. »*

Et la raison pour laquelle c'est une garde et pas seulement un retrait : *« le retrait seul se refait : un second
cockpit s'ajoute toujours "à côté", additivement, sans que personne ne relise la porte de celui qui existe déjà. »*
Ce qui avait été mesuré : l'onglet « Équipe » de `/dashboard` servait des agrégats d'ESPACE derrière `JwtGuard`
seul — zéro occurrence de `team:manage` dans tout `features/dashboard/`.

**L'application.** #2108 demande un bloc Manager sur la page d'arrivée : exceptions équipe, comptes sans prochaine
action, missions à risque, arbitrages, et une liste de priorités d'équipe qui nomme son propriétaire, son statut,
son dernier mouvement et l'action proposée. Chacun de ces blocs est, par définition, un cockpit d'équipe.
La demande est donc satisfaite — **mais sur `/team`**, où `ManagerDashboardPage` porte déjà dix-sept blocs branchés
derrière `manager_cockpit` + `team:manage`. Le LITTÉRAL (les mettre sur `/dashboard`) est ce que la garde refuse ;
l'INTENTION (un manager voit ce qui menace son équipe) est la raison d'être de `/team`.

État posé : **`reformulé`**. Ce qui manque au contenu se traite DANS `/team`, et rien ne s'ajoute à `/dashboard`.

**Texte à écrire** :
```
| reformulé | La surface est `/team`, pas `/dashboard` : GA-254 (`architecture/one-team-cockpit.test.ts:5-57`,
  04/09/2026, #1457-1459) — aucun second écran ne lit la porte d'équipe. Ce qui manque au bloc se traite dans
  `ManagerDashboardPage`. Un LIEN depuis la page d'arrivée reste libre (la garde ne lit pas les destinations).
```

Points : **2108.16 · 2108.17 · 2108.19 · 2108.20** (les blocs) · **2108.27 · 2108.28 · 2108.29 · 2108.31**
(le contenu de la priorité d'équipe) · **2108.92 · 2108.116 · 2208.109** (les critères de recette « manager »,
qui se jouent donc sur `/team`).

⚠️ **Deux points du même bloc ne sont PAS tranchés** : `2108.18` et `2108.30` (« collision »), parce que la notion
n'existe nulle part dans le dépôt — la surface est réglée, la notion ne l'est pas. Ils montent en partie 2, G16.
`2108.21-.25` (persona Dirigeant) ne sont pas tranchés non plus : GA-254 parle de l'équipe, pas du dirigeant, et
c'est une contradiction ouverte avec #2208 — partie 2, G7.

---

## R3 — `c21_donnees` : `unknown` est natif, aucune inférence de zéro, provenance par champ — 5 points

**La règle** : `packages/contracts/src/schemas/doctrine-registry.ts:676-690`, clé `c21_donnees` —
*« `unknown` est natif. Aucune inférence de zéro, provenance par champ, et une correction humaine n'est jamais
écrasée par une réanalyse. »* Tenue par `provenance.ts`, `architecture/display-primitives.test.ts` (GA-18/GA-19).
Reprise dans `CLAUDE.md` : *« Question à se poser : si cette valeur est absente, "0" est-il VRAI ? »*

**L'application.** Ces cinq points ne posent pas de question : ils re-demandent une contrainte que le dépôt a déjà
arbitrée et qui ne se négocie pas. Elle tient, il reste à la vérifier à l'endroit nommé.

État posé : **`retenu`** (la contrainte est acquise, l'implémentation reste à prouver).

**Texte à écrire** :
```
| retenu | Doctrine `c21_donnees` (`doctrine-registry.ts:676-690`) : `unknown` est natif, aucune inférence,
  provenance par champ. Gardes GA-18/GA-19. La contrainte n'est pas négociable — reste à la VÉRIFIER ici.
```

| Point | La demande |
| --- | --- |
| 2183.30 | Ne jamais déduire la disponibilité depuis le CV |
| 2183.31 | Ne jamais déduire le TJM depuis le CV |
| 2186.9 | Chaque état de disponibilité porte sa source |
| 2188.33 | Les chiffres ne s'affichent que s'ils sont réellement calculés |
| 2191.24 | Les inconnues du handoff sont affichées précisément |

---

## R4 — `c14_automatisation` + `c15_integrations` : rien ne s'exécute sans porte, « connecté » n'est pas « vérifié » — 5 points

**Les règles** : `doctrine-registry.ts:538-552` (`c14_automatisation`) — *« Aucune autonomie globale.
Planifier → simuler → approuver → exécuter → VÉRIFIER »* — et `doctrine-registry.ts:555-560` (`c15_integrations`)
— *« "Connecté" n'est pas "lecture vérifiée". L'interface et le copilote ne promettent que la capacité PROUVÉE par
une lecture réelle et datée. »* Reprises dans `CLAUDE.md` : *« Une écriture CRM/ERP passe par une porte : geste
d'utilisateur = auto-approuvé (le clic EST la décision) ; geste de système = demande visible, prévisualisation
FIGÉE, expiration 3 jours. »*

État posé : **`retenu`**.

| Point | La demande | La règle qui la couvre |
| --- | --- | --- |
| 2196.37 | Relance externe : prévisualisation, et stop dès réception | `c14` — simuler → approuver ; prévisualisation FIGÉE |
| 2197.28 | Jamais « facturé » sans confirmation ou déclaration validée | `c14` + `c15` |
| 2198.16 | Facture sans source connectée = « déclarée », pas « confirmée » | `c15`, mot pour mot |
| 2198.43 | « Confirmé » et « déclaré » restent distingués | `c15`, mot pour mot |
| 2199.48 | Action de clôture : mettre à jour le CRM | `c14` + la porte d'écriture (`CLAUDE.md`) |

---

## R5 — L'arbitrage #1376 du 04/09/2026 : le Board Missions est GARDÉ, sorti de « Piloter », nommé « Historique » — 2 points

**La règle** : `apps/web/src/components/navigation/sections.ts:275-306`, un commentaire daté qui cite le retour
qu'il refuse — *« Le retour demandait de SUPPRIMER le board : "l'utilisateur ne doit jamais hésiter entre
Projets > Pipe et Missions > Board pour suivre la même affaire". »* C'est textuellement ce que redemandent #2191.1
et #2192.5.

Trois raisons écrites, et toutes tiennent encore : `object-forms.ts` déclare la forme `f3_kanban` de l'objet
Mission, tenue par **GA-74** (supprimer l'écran ferait PERDRE une forme livrée délibérément) ; le board est le
SEUL endroit qui montre les missions TERMINÉES ; et l'hésitation de navigation — le vrai problème du retour — a
été réglée autrement : *« on le garde, on le SORT de "Piloter", on le nomme "Historique". »*

État posé : **`écarté`**, et la règle écrite DANS la ligne pour qu'elle reste relisible.

**Texte à écrire** :
```
| écarté | Arbitrage de Louis du 04/09/2026 (#1376), écrit dans `sections.ts:275-306` : le board est gardé,
  sorti de « Piloter », renommé « Historique ». Le retirer ferait perdre la forme `f3_kanban` (GA-74) et la
  seule porte vers les missions TERMINÉES. L'hésitation de navigation que le retour vise est déjà réglée —
  les deux entrées ne se disputent plus la même affaire.
```

Points : **2191.1** (« supprimer les deux kanbans concurrents ») · **2192.5** (« supprimer le Board redondant »).

⚠️ **Ce qui n'est PAS tranché par là** : `2153.15` et `2153.17` demandent que l'Historique devienne un FILTRE ou
une sous-vue plutôt qu'un onglet. #1376 a tranché « on le garde », pas « il reste un onglet » — et une vue peut
porter la forme `f3_kanban` aussi bien qu'un onglet. Ces deux-là montent (G1).

---

## R6 — Le copilote n'envoie jamais d'e-mail — 2 points

**La règle** : `CLAUDE.md`, « Ce qui n'écrit pas tout seul » — *« Le copilote n'envoie jamais d'e-mail : il
prépare, le commercial envoie. Ses outils de proposition n'ont aucun chemin d'écriture — ce n'est pas une
convention, c'est l'absence de code. »* Appliquée et expliquée dans le code du moteur :
`apps/web/src/features/outreach/view/SequenceDetailSheet.tsx:22-30` — *« Il n'existe aucune preuve d'envoi dans ce
moteur : une étape e-mail PRÉPARE un brouillon et pose un rappel, et ce qu'on sait d'elle est qu'elle a été
marquée FAITE, avec sa date. La frise dit donc "fait le …", pas "envoyé" — **écrire "envoyé" serait affirmer un
fait qu'aucune ligne du dépôt ne peut établir**. »*

| Point | La demande | État | Ce qui est écrit dans la ligne |
| --- | --- | --- | --- |
| 2188.41 | Ne pas proposer immédiatement l'envoi du CV | `retenu` | Doctrine « le copilote n'envoie jamais » (`CLAUDE.md`) — la contrainte tient, reste à la vérifier sur CE flux |
| 2203.69 | Recette : preuve de chaque envoi | `écarté` | Bellum n'envoie pas, donc Bellum ne peut pas prouver un envoi — `SequenceDetailSheet.tsx:22-30`. **Résidu nommé, et il n'est pas refusé** : observer un envoi dans la boîte CONNECTÉE du commercial est une capacité distincte, qui ne se confond pas avec « Bellum a envoyé » (voir G9) |

---

## R7 — Six règles appliquées une fois chacune — 6 points

| Point | La demande en huit mots | La règle citée (`fichier:ligne` + date) | État |
| --- | --- | --- | --- |
| **2169.4** | Onglet visible « Pipe » au niveau de la section | `sections.ts:205-211` — *« "Projets" et non "Pipe". L'onglet de SECTION ouvre l'écran des projets, qui porte lui-même trois lentilles dont l'une s'appelle "Pipe". Les deux barres étant empilées à cent pixels l'une de l'autre, le même mot apparaissait deux fois sous la même forme — la loi 4 du tome 7 — et désignait deux choses différentes. »* | **`reformulé`** — la lentille « Pipe » s'ouvre déjà sans clic supplémentaire ; le mot ne remonte pas au niveau section. ⚠️ Lié à G3 : si la section est renommée « Opportunités », ce raisonnement est à rejouer sur le nouveau nom |
| **2173.46** | Action de lot : exporter la sélection | `apps/web/src/features/projects/open-needs/model/need-actions.ts:185-191`, `NEED_BULK_ACTIONS_REFUSED.export` — *« Aucune action de masse ne sort de l'entreprise. La seule route d'export qui existe côté besoins (`POST /projects/:id/export-crm`) POUSSE la donnée vers un CRM tiers : ce n'est pas un fichier qu'on télécharge, c'est une sortie. Un export de masse déclenché depuis une case à cocher ferait sortir en un clic ce qu'on a passé un chantier à garder dedans. »* Le refus est déjà écrit « pour que le prochain qui se pose la question lise la raison avant de recoder l'envie » | **`écarté`** — la poussée vers un CRM reste ouverte par sa route dédiée, un par un |
| **2204.1** | Se comparer nommément à Claude / ChatGPT | `CLAUDE.md` (décision Louis 13/09/2026, batch 11) + `doctrine-registry.ts:629-635` (`c19_vocabulaire`) — *« NOTRE fournisseur ne se nomme nulle part, ni à l'écran, ni dans un prompt, ni sur le site »* ; gardes **GA-44** `no-vendor-names-in-app.test.ts:13`, `tool-naming.ts` | **`reformulé`** — le cadrage de positionnement reste dans l'issue ; aucun écran, aucun prompt, aucune page ne nomme un fournisseur de modèle. On nomme la CAPACITÉ |
| **2114.70** | Du violet pour la trajectoire principale | `CLAUDE.md` Design rules (D79) + garde **GA-33** — *« Aucune nuance FIXE de la gamme primaire ne passe AA des deux côtés : `primary-500` donne 5,78:1 en clair et 2,68:1 en sombre. Un lien ou une valeur mise en avant passe par `--bellum-text-accent`. »* 149 endroits écrivaient `text-[var(--bellum-primary-500)]` | **`reformulé`** — l'accent se pose par `--bellum-text-accent` (texte) ou un fond OPAQUE tokenisé, jamais une nuance fixe de la gamme |
| **2186.14** | Après expiration → « À revalider », pas « Disponible » | `CLAUDE.md`, « Ce qui n'écrit pas tout seul » — *« On archive, on ne supprime pas. Un fait périmé redevient inconnu avec sa date ("information de mars 2026, à revérifier"), il ne disparaît pas. »* + `c21_donnees` | **`retenu`** — la règle donne raison à la demande ; reste à vérifier le déclenchement par expiration |
| **2187.41** | Interdit d'inventer mission, client, durée, certification | `CLAUDE.md` Code rules — *« JAMAIS de données fictives. Échec API → erreur claire, pas de fallback inventé »* + `c21_donnees` | **`retenu`** — non négociable ; reste à lire le prompt du CV Studio |

---

## R8 — Quatre règles, une fois chacune, sur des contraintes déjà arbitrées — 4 points

| Point | La demande | La règle | État |
| --- | --- | --- | --- |
| **2190.7** | La recherche publique reste légale | `doctrine-registry.ts:722-737` (`c24_linkedin`) — *« Aucun scraping, aucune automatisation non autorisée. »* `CLAUDE.md` donne le principe qui tranche 100 % des cas ambigus : *« si la collecte suppose de se faire passer pour quelqu'un d'autre — un navigateur humain, un utilisateur connecté, un partenaire autorisé — on ne le fait pas »* | `retenu` |
| **2190.11** | Annoncer le coût avant de lancer le sourcing | **GA-49 / GA-86** — *« le coût annoncé avant le clic est exactement le coût débité »* (`features/search/components/RefreshPlanCard.tsx:23`, `EnrichConfirmDialog.tsx:43`, `useRefreshOrganisation.ts:22`). Le prix vient de la GRILLE, jamais d'un chiffre écrit dans l'écran | `retenu` |
| **2190.27** | Un profil externe n'entre pas seul dans le Vivier | `CLAUDE.md` — *« Une écriture passe par une porte : geste de système = demande visible, prévisualisation FIGÉE »* + *« On PROPOSE une fusion de doublons, on ne fusionne JAMAIS »* | `retenu` |
| **2188.39** | La mémoire marché seule ne crée pas de priorité | `doctrine-registry.ts:1792` (`c65_couverture_nest_pas_un_fait_de_marche`), garde **GA-259** — *« un TAUX DE COUVERTURE mesure ce qu'on SAIT, jamais ce que le marché FAIT »* | `retenu` |

---

## R9 — Une dérivation vit à un seul endroit — 2 points

**La règle** : `CLAUDE.md`, « Ce qui tient les règles » — *« Un réglage vit à UN seul endroit (GA-26). Une
dérivation vit à un seul endroit — deux chemins qui la refont divergent. »*

| Point | La demande | État |
| --- | --- | --- |
| 2193.56 | Aucune donnée divergente entre la page mission et son drawer | `retenu` — `MissionDetailSheet.tsx` et `MissionDossierPage.tsx` sont deux surfaces ; la règle exige une dérivation partagée, pas deux lectures |
| 2107.50 | Mêmes fonctions canoniques entre Aujourd'hui, Découvrir et Reverse Market | `retenu` — la règle donne raison à la demande : `briefing-actions.ts` et `discover.ts` ne doivent pas refaire le même calcul |

---

## Le classement des règles re-litigées

| Rang | Règle | Points |
| --- | --- | --- |
| — | *(méthode des registres — pas une re-litigation, un état mal posé)* | *173* |
| **1** | **GA-254** — il n'y a qu'un cockpit d'équipe, et c'est `/team` | **11** |
| **2** | **`c21_donnees`** — `unknown` est natif, aucune inférence de zéro | **5** |
| **2 ex æquo** | **`c14` / `c15`** — rien ne s'exécute sans porte, « connecté » ≠ « vérifié » | **5** |
| 4 | #1376 — le Board Missions est gardé · « le copilote n'envoie jamais » · « une dérivation à un seul endroit » | 2 chacune |

Ce que ce classement dit : **GA-254 est la règle que le produit re-propose le plus**, et elle le prédit
elle-même dans son propre docblock — *« le retrait seul se refait : un second cockpit s'ajoute toujours à côté,
additivement »*. Onze points en une journée lui donnent raison une deuxième fois.

---

# Partie 2 — les vrais choix produit (94 points, 16 groupes)

Aucun de ces points n'est couvert par une règle écrite. Quand une règle CONTRAINT la solution sans la choisir,
elle est nommée dans le groupe — c'est ce qui permet de trancher sans rouvrir les issues.

---

## G1 — La navigation de `/missions` : treize onglets, quatre groupes demandés — 16 points

`2153.3 .4 .6 .7 .8 .9 .10 .11 .12 .13 .14 .15 .16 .17` · `2192.1` · `2192.4`

⚠️ **Un écrivain travaille dessus en ce moment** (réduction à quatre onglets, #2153.3-.17). Ce groupe est ici pour
la décision, pas pour le code.

**Le sujet.** Les issues demandent de passer de treize onglets à quatre (« En cours », « Planification »,
« Administration / Finance », + un). Le compte de treize est CONFIRMÉ dans `sections.ts:319-491`. Il y a déjà cinq
groupes (`open`, `pilot`, `produce`, `cash`, `archive`), arbitrés le 31/08 puis le 04/09.

**Ce que chaque option coûte et rend**

- **Quatre groupes au lieu de cinq.** Rend : la barre tient dans un regard. Coûte : `open` (un seul membre,
  « Créer une mission ») est là parce que **Louis l'a demandé le plus à gauche** (#1831, `sections.ts:263-270`) ;
  le fondre le fait disparaître du premier regard. Et `archive` existe depuis douze jours pour une raison écrite
  (#1376).
- **Onglets → filtres.** Rend : quatre entrées, le reste en sous-vues. Coûte : **chacun des sept écrans concernés
  a sa ROUTE parce que les notifications de routine y pointent** — `sections.ts:310-317` : *« une notification qui
  atterrit sur un onglet qu'il faut ensuite trouver ne sert à rien. »* Une sous-vue peut porter une route (avec un
  paramètre de filtre) ; c'est du travail, pas un renommage.
- **Ne rien changer.** Coûte : l'issue reste ouverte, et son symptôme est mesuré, pas supposé.

**Recommandation.** Garder les **cinq** groupes et n'en renommer aucun (`pilot` → « En cours », `cash` →
« Administration & finance » sont des renommages sans risque, cf. G3). Convertir en sous-vues les quatre onglets
de `cash` qui se lisent l'un après l'autre le 5 du mois (Facturation, Encaissements, Paiements, Cessions) **en
leur laissant leur route** — c'est ce qui satisfait à la fois le retour et la contrainte des notifications.
Ne pas toucher à `archive` : la décision a douze jours.

---

## G2 — Le Centre d'actions : ce qu'il absorbe, et ce que devient une route retirée — 4 points

`2153.24` · `2153.26` · `2153.27` · `2201.51`

**Le sujet.** #2153 veut que « Écritures à valider » et « Chaînes/Parcours » disparaissent comme entrées et soient
absorbés. Une moitié est FAITE et documentée : #1508 (05/09/2026) a déjà amené les écritures CRM dans la file
unique « À valider », et `sections.test.ts:185` écrit pourquoi la route n'a pas été supprimée — *« elle était le
seul point de montage des écritures CRM, et les retirer sans les avoir d'abord amenées ailleurs aurait supprimé la
capacité au lieu de la déplacer. »*

**Le vrai point ouvert est `2201.51`**, et il vaut pour un PATRON, pas pour une route : quand une entrée quitte la
navigation, sa route **survit sans rediriger** (`routes/actions/ecritures.tsx:5-13`, et le même choix pour
`/watchlist`). #2201 demande une redirection.

- **Survivre sans rediriger** (aujourd'hui). Rend : un lien déjà parti ouvre l'écran attendu. Coûte : deux endroits
  montrent la même file, et le second ne le dit pas.
- **Rediriger.** Rend : un seul endroit, et le lien déjà parti arrive quand même — la raison écrite de #1508 est
  SATISFAITE par une redirection, elle n'y est pas opposée. Coûte : le contexte de l'ancien lien est perdu (une
  notification qui pointait une demande précise atterrit sur la file entière), et ⚠️ **`<Navigate>` de TanStack
  Router est interdit** (GA-27, 106 erreurs React #185) — la redirection se fait dans le `loader` de la route.

**Recommandation.** Rediriger, dans le `loader`, **en conservant l'identifiant s'il y en a un** dans l'URL cible.
Et poser la réponse une fois pour toutes dans `sections.test.ts`, qui est déjà l'endroit où ce patron est écrit —
sinon la question revient à chaque retrait d'onglet. `2153.24` (« Automatisations » contre « Chaînes ») part avec
G4.

---

## G3 — Renommer : « Projets » → « Opportunités », et les onglets du Vivier — 5 points

`2152.1` · `2152.39` · `2152.40` · `2182.1` · `2182.2`

**La pièce qui change la question, et que les registres n'ont pas vue** : le produit a déjà un **lexique d'espace**.
`doctrine-registry.ts:629-635` (`c19_vocabulaire`, D17 du 28/08) : `/settings/lexicon` laisse un espace nommer
chaque objet, `applyWorkspaceLexicon` réécrit le magasin i18next sans rechargement. Donc **« renommer » n'est pas
un chantier de 35 chaînes — c'est le choix du DÉFAUT.** ⚠️ Avec une borne écrite : le lexique remplace un libellé
dont la valeur ENTIÈRE est le nom de l'objet, jamais un mot DANS une phrase (« Aucun Affaire ne correspond »).

- **« Opportunités » par défaut.** Rend : le mot du métier de l'ESN. Coûte : le raisonnement écrit en
  `sections.ts:205-211` (loi 4 du tome 7 : ne pas répéter le mot de la lentille au niveau section) doit être
  rejoué — « Opportunités » ne collisionne avec aucune lentille, donc il PASSE.
- **Garder « Projets ».** Rend : rien ne bouge, l'espace qui veut « Opportunités » le pose lui-même. Coûte :
  chaque espace doit le découvrir.

**Onglets du Vivier (`2152.39/.40`, `2182.1/.2`) : la contrainte écrite qu'il ne faut pas perdre.** Ces deux
onglets ont été AJOUTÉS le 27/08/2026 pour une raison précise (`sections.ts:243-256`) : *« les deux écrans
existaient et n'étaient atteignables que par une URL tapée à la main »*. Les retirer sans les reloger recrée
exactement le défaut corrigé il y a trois semaines. Mais #2182 ne demande pas de les supprimer — il demande une
page ATS unique où ils deviennent des VUES. Cette forme-là préserve la raison de 27/08.

**Recommandation.** Poser « Opportunités » en défaut (le lexique couvre les dissidents) ; absorber
« Positionnements » et « À réveiller » en vues de la page unique du Vivier, **avec leur route**, et pas les
supprimer. Et écrire dans `sections.ts` que la raison du 27/08 est honorée par la vue — sinon un troisième
passage les remettra en onglets.

---

## G4 — Le mot du métier contre le mot du code — 5 points

`2152.11` (« Signé » / `won` = « gagné ») · `2193.15` (« Finance » / « Risque & opportunité ») ·
`2195.29` (« Bloqué », qui désigne la facturation et pas le renouvellement) · `2196.21` (« À corriger » /
`rejected`) · `2196.25` (« Non applicable » / « sans objet »)

**Le sujet.** Cinq libellés où le mot demandé et le mot livré divergent. ⚠️ **Le lexique d'espace ne les couvre
pas** : il remplace le nom d'un OBJET, pas une valeur d'énumération ni un titre de section (borne écrite en
`c19_vocabulaire`). Ce sont donc de vraies décisions, une par une.

- `2152.11` **« Signé » ou « gagné »** n'est pas cosmétique : la question derrière est *est-ce que `won` porte la
  SIGNATURE ou seulement l'accord ?* Si c'est l'accord, renommer en « Signé » ferait mentir l'étape — et c'est
  l'étape qui déclenche le handoff vers Mission (#2191).
- `2196.21` **« À corriger » / `rejected`** : le mécanisme (rejet avec motif obligatoire) est livré. Seul le mot
  diverge, et « À corriger » dit au consultant ce qu'il doit FAIRE, quand « rejeté » lui dit ce qu'il a subi.
- `2195.29` **« Bloqué »** est le seul cas coûteux : le mot est déjà pris par un autre objet (la facturation).
  Le réutiliser pour le renouvellement met le même mot sur deux états — le défaut que la loi 4 du tome 7 nomme.

**Recommandation.** Renommer `2196.21` (« À corriger ») et `2193.15` (« Finance ») : gain net, zéro ambiguïté.
Trancher `2152.11` sur le FOND avant le mot (que déclenche `won` ?). Refuser « Bloqué » pour le renouvellement et
demander un autre mot. `2196.25` suit la décision sur la représentation de l'inconnu (G13).

---

## G5 — Élargir un enum de classement : le coût est en base, pas dans le libellé — 5 points

`2170.3` (stade « Profils recherchés ») · `2170.34` · `2170.55` · `2176.37` (5ᵉ bucket « Alternative ») ·
`2177.22` (12 statuts de positionnement contre 6)

**Le sujet.** Quatre demandes ajoutent une valeur au milieu d'une séquence déjà en base.

**La contrainte écrite, qui ne choisit pas mais borne** : `CLAUDE.md` — *« Un enum ne perd jamais de valeur et
n'en insère jamais au milieu (GA-08) »* et *« Une valeur qui voyage du code vers la base voit sa contrainte SQL
élargie AVANT le code qui l'écrit (GA-11, GA-12). »* Donc : ajouter en FIN, avec une migration qui élargit
d'abord, et un ordre d'affichage porté séparément de l'ordre de déclaration.

- **Ajouter les stades.** Rend : le pipe dit ce que fait le commercial. Coûte : une migration par enum, plus
  l'ordre d'affichage à extraire. `2176.37` coûte plus cher que les autres : **un 5ᵉ bucket change l'algorithme de
  répartition du matching**, pas seulement la liste.
- **Garder 6 étapes + des motifs.** Rend : zéro migration ; un motif porte la nuance. Coûte : le motif n'est pas
  filtrable comme un stade, et `2170.50` (« vue : avec entretien cette semaine ») devient impossible.

**Recommandation.** Ajouter les stades de PIPE (`2170.3`), qui sont demandés par deux registres et dont
l'absence bloque des vues. Refuser le 5ᵉ bucket de matching (`2176.37`) tant que la règle de répartition n'est pas
écrite — un bucket sans règle est un libellé. Pour `2177.22`, **6 étapes + motifs** : douze statuts sur un objet
que trois personnes mettent à jour à la main se peuplent mal.

---

## G6 — ⚠️ CONTRADICTION — « Entretien » : deux objets voudraient le même mot — 2 points

`2170.5` (#2170 : stade « Entretien » au niveau PROJET) **↔** `#2177` (`interview` existe déjà comme stage de
`Submission`, `submission.ts:37`) · `2170.50` en dépend · et `2152.9` du registre `/consultants` pose la MÊME
question, sans que les deux registres se soient vus.

**Pourquoi c'est un sujet à part.** Livrer les deux est impossible sans qu'un même mot désigne deux statuts
différents sur deux objets, à deux endroits de l'écran. C'est le défaut que `sections.ts:205-211` nomme
explicitement (loi 4 du tome 7) — et là il est pire : ce n'est pas le même contenu sous le même mot, c'est un
contenu DIFFÉRENT sous le même mot.

- **L'entretien vit sur le POSITIONNEMENT** (l'existant). Rend : c'est vrai — un entretien concerne une personne
  présentée, pas une affaire. Coûte : le pipe projet ne peut pas montrer « entretien cette semaine » sans agréger
  ses positionnements.
- **L'entretien vit sur le PROJET.** Rend : le pipe se lit d'un coup. Coûte : un projet à trois candidats dont un
  seul est en entretien est mal décrit par un stade unique, et `submission.interview` devient redondant.
- **Les deux, avec des mots différents.** Le projet porte « En entretien(s) » DÉRIVÉ de ses positionnements
  (jamais saisi). Coûte : une dérivation à écrire — et elle doit vivre à un seul endroit (GA-26).

**Recommandation.** La troisième. La source de vérité reste `Submission.interview` ; le projet AFFICHE un stade
dérivé, nommé au pluriel pour que les deux ne se confondent pas. Cela rend `2170.50` réalisable sans migration.

---

## G7 — ⚠️ CONTRADICTION — la lecture « dirigeant » : un persona sur la page d'arrivée, ou la route `/pilotage` ? — 9 points

`2108.1` · `2108.21 .22 .23 .24 .25` · `2108.107` **↔** `2208.29` · `2208.64`

**Pourquoi c'est un sujet à part.** #2108 demande que la page d'arrivée porte un persona Dirigeant (Revenu,
Risque, Adoption, Cash, Décisions structurantes). #2208 demande, dans sa liste de recette, de **contrôler la route
`/pilotage`** et d'y **lire le pilotage manager**. Les deux livrés, le même contenu existe deux fois, à deux
endroits, sous deux formes — et personne ne saura lequel fait foi.

**Ce qui est déjà tranché à côté, et qui éclaire** : GA-254 a réglé exactement ce problème pour l'ÉQUIPE (partie 1,
R2) : un seul cockpit, et c'est `/team`. La question ici est la même d'un cran plus haut, pour le DIRIGEANT.
Et `c18_manager` (`doctrine-registry.ts:606-628`) donne le critère de tri : *« Chaque chiffre montré à un
responsable doit déboucher sur une INTERVENTION. Aucun retour sur investissement inventé, et un indicateur sans
dénominateur vaut `null`. »* ⚠️ Avec un chiffre à connaître avant de décider : **11 des 62 indicateurs du
dictionnaire sont `measurable: false`** — un sixième du cockpit ne se calcule pas encore.

- **Persona Dirigeant sur `/dashboard`.** Rend : une seule page d'arrivée pour tous. Coûte : un deuxième pilotage,
  exactement ce que GA-254 dit qui « se refait toujours, additivement » ; et la page d'arrivée grossit
  (`2108.107` s'en inquiète déjà).
- **Tout sur `/pilotage`.** Rend : un endroit, déjà gardé par sa capacité de palier. Coûte : le dirigeant a deux
  pages à ouvrir.
- **`/dashboard` porte une ACCROCHE, `/pilotage` porte la lecture.** Trois chiffres et un lien, pas un cockpit.

**Recommandation.** La troisième, et **écrire la règle générale** que GA-254 n'a posée que pour l'équipe :
*une lecture agrégée vit sur UNE route, la page d'arrivée n'en porte que l'accroche.* C'est ce qui empêchera le
quatrième cockpit. `2108.1` (« conserver la même architecture, les mêmes objets, quel que soit le rôle ») devient
alors une réponse et non une question : oui — ce qui change par rôle, ce sont les PORTES ouvertes, pas la page.

---

## G8 — Un Besoin peut-il exister sans Projet parent ? — 4 points

`2174.1` · `2174.14` · `2174.49` · `2173.63`

**Le sujet.** `NeedWizard` exige à l'étape 1 de choisir un PROJET existant. #2174 veut créer un besoin sur un
compte jamais analysé, sans projet préalable. C'est un changement de MODÈLE, pas d'écran.

- **Besoin orphelin autorisé.** Rend : le chemin le plus court entre un appel client et un besoin qualifié — et
  c'est le geste réel d'un commercial qui raccroche. Coûte : tout ce qui remonte du besoin vers le projet
  (rattachement, agrégats du pipe, vues) doit gérer `projectId: null`, donc chaque lecture. Et un besoin orphelin
  qui n'est jamais rattaché devient une donnée que personne ne regarde.
- **Création d'un projet IMPLICITE.** Le wizard crée le projet en même temps, avec le nom du compte. Rend : le
  modèle ne bouge pas, le geste est aussi court. Coûte : des projets à un seul besoin, créés sans intention — et
  il faut une résolution d'entité si l'entreprise n'existe pas (`2174.14`), qui est de toute façon due.
- **Ne rien changer.** Coûte : le critère de recette `2174.49` reste rouge par construction.

**Recommandation.** La création implicite. Elle rend le même geste sans faire voyager un `null` dans toutes les
lectures, et elle a un effet de bord utile : le projet existe pour accueillir le deuxième besoin du même compte.
`2174.14` (résolution d'entité) devient alors le vrai travail, et il est isolable.

---

## G9 — Le moteur de séquences est mono-contact, par choix documenté — 10 points

`2203.32 .33 .34 .35 .36 .37 .38` · `2203.59` · `2203.68` · **`2153.29`** (registre `/missions` — la même
question, non rapprochée par les registres)

**Le sujet.** #2203 décrit une séquence-CAMPAGNE : un tableau d'audience multi-contacts, une ligne par personne
avec son dernier événement, sa prochaine action, sa réponse, son propriétaire, et un geste « retirer ce contact ».
L'existant crée **une séquence PAR contact** (`CreateSequenceDialog.tsx:70-79`, #1515). Ce n'est pas une doctrine —
c'est une limite d'implémentation, donc un vrai choix.

- **Garder N séquences séparées** (aujourd'hui). Rend : zéro travail ; chaque séquence a son propre état, ce qui
  est juste. Coûte : « j'ai lancé une campagne sur 12 contacts » n'a aucune surface — douze lignes qui ne se
  savent pas parentes, et aucun moyen de répondre « où en est ma campagne ? ».
- **Faire émerger un objet « campagne ».** Une campagne GROUPE N séquences ; le tableau d'audience est sa vue.
  Rend : les neuf points d'un coup, et `2203.59` (« retirer un contact ») devient « annuler UNE des séquences »,
  qui existe déjà. Coûte : un objet, sa table, ses lectures — et la question « qui gagne » quand une séquence est
  modifiée seule.
- **Un simple ÉTIQUETAGE.** Les séquences partagent une étiquette ; le tableau filtre dessus. Rend : 80 % de la
  lecture pour 20 % du coût, sans nouvel objet. Coûte : pas de cadence commune, pas d'ajout de contact « à la
  campagne ».

**Recommandation.** L'étiquetage d'abord — il rend `2203.32-.38` lisibles sans toucher au modèle, et `2153.29`
(« la séquence porte une audience ») devient vrai au niveau du groupe. Ne créer l'objet « campagne » que si la
cadence commune est demandée après usage.

**Le résidu de `2203.69`, tranché en partie 1 mais qui appartient à ce sujet** : « preuve de chaque envoi » est
refusée parce que Bellum n'envoie pas. La question ouverte, distincte, est : **faut-il OBSERVER l'envoi dans la
boîte connectée du commercial ?** Le journal d'activité stocke déjà le corps des messages (arbitrage Louis du
16/08) — donc ce n'est pas interdit, c'est un chantier. Ça ne change pas ce que Bellum FAIT, seulement ce qu'il
SAIT.

---

## G10 — Les personas d'approche : trois paliers hiérarchiques, ou des états de relation ? — 3 points

`2204.34` (Partenaire) · `2204.35` (Consultant) · `2204.36` (Ancien contact)

**Le sujet.** Le système à trois personas est **volontairement grossier et dérivé du PALIER HIÉRARCHIQUE**
(`packages/contracts/src/schemas/outreach-scenarios.ts:182-190`) : *« Un persona plus fin ne changerait rien à ce
qu'on en fait (choisir un levier), et donnerait l'impression d'une précision qu'aucune donnée ne soutient. »*
⚠️ Cette décision refuse un persona plus FIN. Les trois demandés ne sont pas plus fins : ce sont des **états de
relation**, un autre axe. La décision ne les couvre donc pas — d'où leur présence ici.

- **Ajouter 3 personas** (6 au total). Coûte : le mélange de deux axes dans une seule énumération. Un décideur qui
  est aussi un ancien contact tombe dans deux cases, et `personaForHierarchyLevel` ne peut plus être déterministe.
- **Traiter la relation sur son axe.** `relationshipState` existe déjà (`dormant_connection`,
  `existing_no_recent_thread`), et les partenaires ont leur écran (`TabPartners.tsx`). Le levier se choisit par le
  COUPLE (palier, état de relation). Rend : « ancien contact » (`2204.36`) est **déjà là** sous ce nom. Coûte :
  la matrice des leviers passe de 3 à 3×N cases — mais rien n'oblige à les remplir toutes.
- **Ne rien faire.** Coûte : approcher un partenaire ESN avec le levier d'un décideur client sonne faux.

**Recommandation.** L'axe relation. Et ne traiter que le cas qui a un vrai levier distinct : **Partenaire**
(`2204.34`), parce qu'une ESN partenaire ne s'approche pas comme un client. « Consultant » (`2204.35`) relève
plutôt du sourcing que de l'approche commerciale — à écarter explicitement, avec sa raison, plutôt qu'à laisser
ouvert.

---

## G11 — #1409 rouvert : « migrer avant de retirer » est une nuance que le refus ne couvre pas — 6 points

`2114.45` (MyPrioritiesCard) · `2114.46` (MyRelancesCard) · `2114.54` · `2114.57` · `2114.43` · `2114.44`

**Le sujet.** #1409 demandait déjà de retirer ces deux cartes, et le refus est écrit
(`PersonalCockpit.tsx:44-54`) : *« Elle reste, parce qu'elle est le SEUL endroit du produit où une relance se
marque faite (`useCompleteRelance` n'a pas d'autre lecteur). Retirer la carte aurait retiré la CAPACITÉ, pas
seulement l'affichage — c'est la faute inverse de celle que le dépôt corrige d'habitude, et elle coûte aussi
cher. »*

**Pourquoi ce n'est pas tranché** : `2114.57` demande explicitement de **migrer d'abord, retirer ensuite** — ce qui
répond au refus au lieu de le contredire. La question est donc neuve.

- **Migrer puis retirer.** Rend : le cockpit personnel redevient du RECUL (#1404), le geste va dans Actions.
  Coûte : porter `useCompleteRelance` dans `ActionsBlock` et prouver qu'aucun autre lecteur ne dépend de la carte.
- **Garder.** Rend : zéro risque. Coûte : deux endroits disent la même chose, et #1409 revient une troisième fois.
- **`2114.43/.44`** est une question différente sous le même numéro d'issue : `ProfileComplementCard` est déjà
  snoozable, mais son DÉCLENCHEUR est une étape d'onboarding, pas un manque détecté par Laura. Passer au
  déclenchement par le manque est un travail de production, pas un arbitrage de suppression.

**Recommandation.** Migrer `useCompleteRelance` vers Actions, PUIS retirer `MyRelancesCard` — en un seul lot, avec
un test qui prouve que le geste survit. **Garder `MyPrioritiesCard` :** le refus de #1409 la concernant tient
toujours (*« la couverture nomme un problème, la priorité nomme un geste »*) et `2114.45` n'apporte aucune nuance
nouvelle. Traiter `2114.43/.44` séparément.

---

## G12 — Les deux rails d'un besoin : client et consultant — 3 points

`2175.31` · `2175.32` · `2175.39`

**Le sujet.** #2175 veut deux rails NOMMÉS — ce qui est sécurisé côté client, ce qui est sécurisé côté consultant —
et la règle *« ne conclure "prêt à démarrer" que si les deux sont sécurisés »*. L'existant
(`NeedVerdictBanner`) ne couvre qu'un côté.

- **Étendre le verdict existant.** Rend : un seul endroit rend le verdict, donc une seule dérivation (GA-26).
  Coûte : le bandeau devient dense, et « ce qui manque » sur deux axes tient mal sur une ligne.
- **Un second rail.** Rend : chaque côté a sa liste, ses manques nommés. Coûte : deux composants, et le risque que
  le verdict global se recalcule à deux endroits — exactement ce que la règle de dérivation interdit.

**Recommandation.** Étendre le verdict (une dérivation, un appelant) et rendre **deux rails d'affichage qui le
LISENT**. Et appliquer la doctrine du score décomposé : *un score n'est jamais nu — ses axes, et ce qui n'a pas pu
être évalué est NOMMÉ* (`CLAUDE.md`). Ici les deux rails SONT les axes : le motif est déjà celui du dépôt.

---

## G13 — Le Vivier : granularité des états de disponibilité, du TJM, et fraîcheur ≠ complétude — 5 points

`2186.5` (« Indisponible » distinct d'« En mission ») · `2186.7` (« Inconnue » distinct d'« À confirmer ») ·
`2186.16` (unité du TJM) · `2186.18` (TJM minimum / cible) · `2152.35` (fraîcheur)

**Le sujet.** Quatre fusions faites dans le code que les issues veulent défaire, et une notion à définir.

- `2186.5` — `consultants.json:49` conflate « indisponible » et « En mission ». Un consultant indisponible pour
  une autre raison (congé, formation, refus) n'a pas d'état. **Coût de séparer** : un état de plus dans une liste
  qu'un BM met à jour à la main.
- `2186.7` — « Inconnue » est fondu avec « À confirmer ». ⚠️ Ce n'est pas une nuance cosmétique : la doctrine
  distingue **ce qu'on n'a jamais su** de **ce qu'on a su et qui a expiré** (*« un fait périmé redevient inconnu
  AVEC SA DATE »*). Deux états, deux gestes : l'un se demande, l'autre se revalide.
- `2186.16/.18` — l'unité « /jour » est dans le LIBELLÉ, pas dans un champ, et il n'y a pas de TJM minimum.
  Sans minimum, « le consultant a refusé » n'est pas représentable, et c'est ce qui fait échouer un
  positionnement à la fin.
- `2152.35` — « fraîcheur » (date de dernière vérification) et « complétude » (champs remplis) sont deux mesures.
  `TalentCompletenessScore` ne fait que la seconde. Une fiche complète et vieille de huit mois affiche un bon
  score : c'est exactement le défaut que la doctrine appelle *« le score mesure la complétude de nos données »*.

**Recommandation.** Séparer `2186.7` (doctrine, pas confort) et ajouter la **fraîcheur comme second axe** du score
de fiche (`2152.35`) — un score n'est jamais nu, ses axes sont nommés. Ajouter le **TJM minimum** (`2186.18`), qui
débloque un cas métier réel. Laisser l'unité en libellé (`2186.16`) tant qu'une seule devise et une seule maille
sont en jeu. `2186.5` : à trancher au vu du coût de saisie, pas d'implémentation.

---

## G14 — Consentement : le bloc RGPD ne porte pas l'accord de représentation — 2 points

`2186.31` · `2189.1`

**Le sujet.** `TalentConsentTab` existe, lié au RGPD (traitement des données). #2186/#2189 demandent qu'on
contrôle, **avant de présenter un consultant à un client**, que celui-ci est d'accord pour être représenté. Ce
sont deux consentements différents : l'un autorise à traiter, l'autre autorise à PARLER DE QUELQU'UN à un tiers
nommé. Aucune règle écrite du dépôt ne les confond ni ne les sépare.

- **Réutiliser le bloc RGPD.** Rend : zéro travail. Coûte : un consentement RGPD coché à l'import vaudrait accord
  de représentation — ce qui est faux, et se découvre le jour où un consultant l'apprend par son employeur.
- **Un accord distinct, daté, par consultant.** Rend : `2189.1` devient contrôlable, et le refus est un fait qu'on
  peut afficher. Coûte : un champ, une date, un geste de plus avant le premier positionnement.
- **Un accord PAR positionnement.** Le plus juste (on accepte d'être présenté à CE client), le plus lourd.

**Recommandation.** Un accord distinct au niveau consultant, **daté** (donc expirable, comme la disponibilité), et
un contrôle bloquant avant présentation. ⚠️ **À faire relire juridiquement** — comme l'analytique produit, c'est un
sujet où le cadre technique ne fait pas la décision.

---

## G15 — Les fenêtres temporelles en dur, et ce qu'on fait d'une date absente — 5 points

`2186.39` (« après X jours sans échange », aujourd'hui six mois en dur) · `2192.10` (45 jours) ·
`2194.3` (30 jours) · `2107.8` + `2108.84` (déclencheur « mission sans date »)

**Le sujet, en deux moitiés.**

**(a) Les fenêtres.** Trois nombres en dur (6 mois, 45 jours, 30 jours) et trois écrans qui n'en demandent pas les
mêmes. La contrainte écrite : *« Un réglage vit à UN seul endroit »* (GA-26). Donc si ces fenêtres deviennent
réglables, elles vivent dans un fichier, pas dans trois écrans.
- **Les rendre réglables par espace.** Rend : une ESN au cycle long ne reçoit pas des alertes inutiles. Coûte : un
  écran de réglages de plus, et un réglage que personne ne touche est un réglage qui ment.
- **Les unifier en dur, à un seul endroit.** Rend : la cohérence, pour un coût quasi nul. Coûte : `2192.10` (45 j)
  et `2194.3` (30 j) ne veulent pas la même — parce qu'ils ne répondent pas à la même question (« qu'est-ce qui
  se termine bientôt » ≠ « qui sera libre bientôt »).

**(b) La mission sans date de fin.** ⚠️ La routine actuelle EXCLUT ces missions, et c'est une règle NOMMÉE du
dépôt : *« ce qu'on ne sait pas n'alerte jamais »* (`apps/api/src/modules/admin/decision-queue.ts:182`,
`decision-queue.service.ts:67`, et `access-fact.entity.ts:51` qui cite déjà « exactement comme une mission sans
date de fin »). Mais la doctrine `c21` dit aussi que l'inconnu se NOMME.
**Ces deux règles ne se contredisent pas — elles ne parlent pas de la même chose**, et c'est pour ça que le point
n'est pas tranché ici : personne ne sait si #2107.8 demande une alerte de FIN (interdite) ou une alerte de DONNÉE
MANQUANTE (souhaitable).

**Recommandation.** (a) Garder les fenêtres en dur mais les **rassembler à un seul endroit**, nommées par leur
question ; ne pas ouvrir de réglage tant que personne ne l'a demandé deux fois. (b) Pas de déclencheur « fin de
mission » sur une mission sans date — la règle tient. En revanche, **nommer la date manquante sur la mission**
(un axe non évalué qui SORT du dénominateur, pas une alerte). `2108.84` devient alors recettable.

---

## G16 — Des notions que le dépôt ne définit pas, et des critères qu'il ne sait pas mesurer — 10 points

`2107.17` · `2108.18` · `2108.30` (« collision d'équipe ») · `2208.40` · `2208.60` (« cible ») ·
`2177.57` (« via un autre partenaire ») · `2178.7` (« besoin trop vague ») · `2178.8` (« besoin contradictoire ») ·
`2169.35` (« la section est comprise en moins de 10 secondes ») · `2208.1` (ordre : les pages avant le corpus Laura)

**Le sujet.** Dix points qui ne peuvent PAS être codés ni recettés, non parce qu'ils sont difficiles, mais parce
que le mot qu'ils emploient n'a pas de définition dans le produit. `git grep collision` ne rend que des collisions
de code ; « cible » n'existe nulle part (le registre `/discover` le note déjà en #2166.46) ; « vague » et
« contradictoire » n'ont aucun critère.

**Ce que ça coûte de les laisser ouverts.** Chacun est déjà **compté deux ou trois fois** — `2107.17` /
`2108.18` / `2108.30` sont la même notion vue de trois issues ; `2208.40` / `2208.60` de deux. Ils gonflent
artificiellement le reliquat et bloquent des points voisins qui, eux, sont clairs.

**Recommandation, notion par notion.**
- **« Collision »** est la plus utile des quatre : deux commerciaux qui travaillent le même compte, ou deux
  positionnements du même consultant sur deux besoins concurrents. **Définir la seconde** (elle est calculable
  aujourd'hui, à partir des positionnements ouverts) et écarter la première, qui demanderait un suivi d'activité
  par personne — et se heurterait à la règle *« l'analytique mesure le PRODUIT, jamais la personne »*.
- **« Cible »** : ne pas l'inventer ici. Elle appartient à `/discover` (#2166.46) et doit être définie là, une
  fois ; `2208.40/.60` en dépendent et se ferment tout seuls ensuite.
- **« Autre partenaire »** (`2177.57`) : supposerait un suivi multi-ESN d'un même candidat, qui n'existe pas et
  qui pose un problème d'échange d'informations entre concurrents — voisin de `COMMUNITY_FORBIDDEN_KINDS.cost`
  (GA-43). **À écarter explicitement**, avec cette raison écrite.
- **« Vague » / « contradictoire »** (`2178.7/.8`) : définissables — un besoin sans compétence nommée, sans
  fourchette de TJM, sans date de démarrage est « vague » ; « contradictoire » est plus dur et peut attendre.
- **`2169.35`** (« compris en 10 secondes ») : ce n'est pas un critère de recette, c'est une intention. **La
  remplacer** par un critère observable (« la section nomme ses trois lentilles sans défilement à 1 280 px »),
  ou l'écarter comme non recettable.
- **`2208.1`** est une décision de SÉQUENCEMENT, pas de produit : valider les écrans avant de constituer le corpus
  Laura. Recommandation : oui — un corpus construit sur des écrans qui vont bouger se refait.

---

# Ce qui reste à faire de ce dossier

1. **Appliquer les 210 états de la partie 1** sur les branches qui portent les registres (les textes sont donnés
   par règle, une fois chacun). ⚠️ `registre-2026-09-16-missions.md` a un écrivain en cours : y appliquer après.
2. **Trancher les 16 groupes de la partie 2.** Sept d'entre eux en débloquent d'autres : G6 (« Entretien ») ferme
   `2170.50` ; G7 ferme `2108.107` ; G8 ferme `2174.14` et `2174.49` ; G16 (« cible ») ferme `2208.40/.60`.
3. **Deux décisions demandent une relecture extérieure** et ne se codent pas : G14 (accord de représentation,
   juridique) et, déjà en attente depuis le 11/09, la relecture RGPD de `c64_analytique_produit`.
