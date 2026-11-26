# Les décisions en attente — 15/09/2026 au soir

140 points `à trancher` sur 4 308. Ils se ramènent à **huit décisions**.
Chacune porte le nombre de points qu'elle débloque, et ma recommandation.

---

## 1. Facturation en onboarding — 21 points

**La question** : pendant l'onboarding, un geste peut-il débiter un crédit ?
Et si oui, que voit l'utilisateur AVANT de cliquer ?

Points : #2084.40/.41/.42/.43/.44/.45 · #2074.26 · #2011.11 · #2008.11 · #2076.4 ·
#2089.25 · #2030.17 · #2091.32 · #2084.11/.19 · #2003.22/.23 · #2004.16 · #2009.16 · #2033.7

**Ce que le dépôt dit déjà** : la facturation est un ARRÊT (« ne pas coder, escalader »).
Rien n'a été codé dessus.

**Recommandation** : l'onboarding est **gratuit de bout en bout**. Le questionnaire,
l'audit sur données déclarées, la mémoire marché, les corrections, les imports locaux
et les prévisualisations ne débitent rien. Seule une **recherche fraîche, un
enrichissement, une analyse externe ou une vérification payante** débite — et alors
le coût, la durée, le périmètre et les crédits restants s'affichent AVANT le clic.
Un échec rembourse. Raison : un utilisateur qui découvre le produit et voit son
compteur descendre pendant un formulaire ne finit pas le formulaire.

---

## 2. La BU est-elle un objet du produit ? — ~30 points

**La question** : « une BU », « une agence », « une équipe », « un territoire » —
est-ce une **partition réelle** (son propre `workspace_id`, ses propres données,
ses propres droits) ou un **libellé déclaratif** porté par le profil ?

Points : #2017.1 à #2017.20 · #2030.2 · #2031.2 · #2034.5 · #2035.2 · #1918.2 · #1910.2 · #2126.43

**Ce que ça change** : si c'est une partition, chaque lecture du produit doit porter
la BU en plus de l'espace — c'est un chantier de fond qui touche toutes les requêtes.
Si c'est un libellé, c'est une question du questionnaire et un filtre.

**Recommandation** : **un libellé déclaratif d'abord**, la partition plus tard si un
client la demande. Raison : la couche BU/agence vient d'être livrée (#2236) comme une
couche de LECTURE ; en faire une partition maintenant rouvrirait le cloisonnement
`workspace_id`, qui est l'arrêt le plus coûteux du dépôt.

---

## 3. Un espace existe déjà pour ce domaine — ~12 points

**La question** : quelqu'un s'inscrit avec `@monesn.fr`, un espace existe déjà pour
ce domaine. Qui reçoit sa demande d'accès, et que se passe-t-il si personne ne répond ?

Points : #2016.1 à #2016.10 · #2017.17 · #2017.18

**Ce qui n'a pas de réponse** : le délai. Un utilisateur bloqué derrière un
administrateur silencieux n'a aucune issue aujourd'hui.

**Recommandation** : la demande part aux **administrateurs de l'espace**, nommés mais
sans leurs coordonnées. **Au bout de 72 h sans réponse**, l'utilisateur peut créer son
propre espace — on ne le laisse pas dehors. Le doublon d'espace est signalé aux deux
côtés, jamais fusionné automatiquement (on propose une fusion, on ne fusionne jamais).

---

## 4. Les chiffres d'argent sont-ils réservés ? — ~8 points

**La question** : marge par consultant, coût d'intercontrat, panier moyen, délai
d'encaissement, owner des comptes — visibles par tous les membres, ou réservés
aux dirigeants et aux personnes autorisées ?

Points : #2053.1/.2/.3/.4/.5/.7 · #2057.10 · #2037.9 · #2036.4/.5/.6

**Recommandation** : **réservés**, et le questionnaire ne les pose qu'aux rôles qui
les portent. Raison : un commercial qui voit la marge de son collègue est un problème
social dans une ESN, et c'est la demande explicite de #2053.5/.7.

---

## 5. Un rôle déclaré donne-t-il des droits ? — ~6 points

Points : #2033.8/.10/.11 · #2018.7/.8/.9 · #2033.9

**La question** : quelqu'un déclare « directeur » dans le questionnaire. Est-ce que
ça lui ouvre des données ?

**Recommandation** : **non, jamais**. Le rôle déclaré règle ce que Laura PROPOSE
(on ne propose pas à un Business Manager un geste réservé au dirigeant), il ne règle
pas ce qu'on AUTORISE. Les droits viennent du RBAC, qui vient de l'invitation.
Un champ de formulaire ne doit jamais être un vecteur d'élévation de privilège.

---

## 6. « Recours externe OBSERVÉ » : filtre, ou pas ? — ~5 points

Points : #2074.21 · #2090.40 · #2165.30 · #2083.16 · #2012.12

**La tension** : GA-259 dit qu'un taux de couverture mesure ce qu'on SAIT, jamais ce
que le marché FAIT. Filtrer des comptes sur « recours externe observé » transforme
un fait de connaissance en fait de marché dès qu'on le met dans un filtre.

**Recommandation** : **le montrer sur la carte, ne pas en faire un filtre.** Sur une
carte, « observé le 12 mars, source X » se lit avec sa provenance. Dans un filtre,
le libellé se lit hors contexte et devient « ces comptes externalisent ».

---

## 7. Les anciens groupes de navigation — 4 points

Points : #2155.4/.5/.6/.27

**Mesuré en prod le 15/09** : `/discover` affiche toujours « Suivre · Trouver ·
Découvrir · Connaître ». Les issues demandent de les retirer et de rediriger les
anciennes routes.

**Recommandation** : les retirer, avec redirections. C'est du travail d'écran, pas
une décision produit — je le prends si tu ne dis rien.

---

## 8. #1950 — le plan multi-étapes de Laura — ~25 points

**La question** : ta décision du 12/09 disait « formaliser les cartes indépendantes
+ plafond agrégé, **à relire après la migration Action OS** ». Action OS n'existe pas
encore. Un écrivain s'est arrêté devant plutôt que d'inventer une seconde
architecture jetable.

**Recommandation** : **gelé** jusqu'à Action OS. Si le calendrier a bougé, dis-le.

---

## Ce que je prends sans te demander

Les **63 points « écran et parcours »** hors des huit ci-dessus : libellés, blocs,
colonnes, états vides, exemples, ordre des étapes. Ce sont des gestes de mise en
œuvre, pas des arbitrages.

Et l'**analytique produit** (#2085.16, #2022.8 — abandon par question, taux de
reprise) : ta décision du 15/09 « fais le et allume le, j'assume les risques »
les couvre déjà, avec le plancher de 5 sessions distinctes.

---

# TRANCHÉ PAR LOUIS — 15/09/2026, soir. **Zéro `à trancher` restant.**

| # | Sujet | Décision | Points |
| - | ----- | -------- | ------ |
| 1 | Facturation en onboarding | **Gratuit de bout en bout.** Questionnaire, audit local, mémoire marché, corrections, imports, prévisualisations = 0 crédit. Seules recherche fraîche / enrichissement / analyse externe / vérification payante débitent, avec coût + durée + périmètre + crédits restants AVANT le clic, et remboursement sur échec. | 20 |
| 2 | La BU | **Un libellé déclaratif**, pas une partition. Réponse de questionnaire + filtre de lecture. Ni données propres ni droits propres — le cloisonnement reste `workspace_id` seul. | 27 |
| 3 | Espace existant | La demande part aux **administrateurs**, nommés sans leurs coordonnées. **Après 72 h de silence, l'utilisateur crée son propre espace.** Le doublon est signalé aux deux côtés — on PROPOSE une fusion, on ne fusionne jamais. | 10 |
| 4 | Chiffres d'argent | **Visibles par tous les membres de l'espace** (contre la recommandation). ⚠️ Cette décision REFUSE #2053.5 et #2053.7, qui exigeaient l'inverse : ces deux points sont `écarté` sur décision, pas sur absence. | 10 |
| 5 | Rôle déclaré | **Aucun droit.** Le rôle règle ce que Laura PROPOSE, jamais ce qu'on AUTORISE. Les droits viennent du RBAC, qui vient de l'invitation. ⚠️ Refuse #2033.11 (« alimenter RBAC »), passé `écarté`. | 9 |
| 6 | « Recours externe observé » | **Sur la carte ET en filtre** (contre la recommandation). ⚠️ Condition qui vient avec : le libellé porte la nuance en toutes lettres — « recours externe observé dans nos sources », jamais « recours externe » nu — parce qu'un libellé de filtre se lit hors contexte et redevient un fait de marché (GA-259). Risque résiduel assumé : un commercial répète le libellé court en rendez-vous. | 3 |
| 7 | #1950 / Action OS | **Action OS d'abord, en priorité sur le reste**, puis #1950 suit. | ~25 `retenu` |
| 8 | Les 46 points écran | **Claude les tranche, sans redemander.** | 52 |

## Ce que la décision 7 a révélé — Action OS était déjà fait aux trois quarts

Mesuré sur `origin/main` = `0c8f6edaf` :

| Lot du plan du 12/09 | État réel |
| --- | --- |
| L1 contrats + schéma | **fait** — migrations `1792800020000-CopilotCardsOnWorkflowRuns` et `1792800021000-CopilotCardProposal`, `cardStateOf` dans les contrats, `snoozed`/`superseded` livrés |
| L2 moteur | **fait** — le défaut D2 est corrigé : `action-os.controller.ts:342` le documente au PASSÉ, et `workflow-runner.service.spec.ts:309` porte le témoin |
| L3 pont conversation | **fait** — `copilot-card-catalog.ts:16` : « Une carte est un run `copilot_proposal` à UN pas » |
| **L4 web** | **PAS fait** — `PendingActions.tsx` importe `actionsApi` (`@/features/actions/api`) et `apiFetch`, jamais `@/features/action-os/api` ; `cardStateOf` n'a **aucun appelant** dans `apps/web` |

C'est le motif n°1 du dépôt, encore : **du code juste, calculé, testé, que personne
n'appelle.** Le lot L4 est parti seul, avec l'existant nommé pour qu'il le branche au
lieu de le recoder.

## Les deux décisions prises CONTRE ma recommandation, et ce qu'elles coûtent

Elles sont écrites ici pour qu'on sache, dans trois mois, qu'elles ont été prises les
yeux ouverts.

- **Les chiffres d'argent visibles par tous.** Le risque est social, pas technique : dans
  une ESN où les Business Managers sont en concurrence, chacun voit la marge du voisin.
  Deux demandes écrites exigeaient le contraire.
- **« Recours externe observé » en filtre.** Le risque est doctrinal : GA-259 dit qu'un
  taux de couverture mesure ce qu'on SAIT, jamais ce que le marché FAIT. Le libellé
  nuancé est ce qui tient la règle — s'il est un jour raccourci en « recours externe »,
  la garde retombe.
