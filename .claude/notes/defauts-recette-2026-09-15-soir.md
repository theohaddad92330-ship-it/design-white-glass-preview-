# Défauts mesurés en production — 15/09/2026, soir

Compte : Louis (espace de test). `main` = `ac1a59e1f`.

## 1. ⚠️ D1 CONFIRMÉ EN PRODUCTION — la carte d'action disparaît au rechargement

**Mesuré** sur `/chat?conversationId=b4d99c22-2f80-4f58-b21d-5f94fcb1d10b`
(fil « Relancer Thales demain à 9h30 », 14/09) :

Laura écrit, à 18 h 42 :
> « Je n'ai pas encore l'identifiant de sa fiche contact pour préparer le rappel.
> Ouvre sa fiche depuis Contacts ; **je pourrai ensuite te soumettre le rappel à
> valider.** »

Et **il n'y a aucune carte dans le fil.** Ni carte en attente, ni carte refusée, ni
trace de la proposition. Le fil rouvert un jour plus tard ne porte que du texte.

**La cause est déjà écrite** dans le plan Action OS du 12/09, défaut D1 :
« cartes perdues au rechargement (`Chat.tsx:2122-2126`, `agentChatApi.ts:53-58`) » —
le `context` de la réponse n'est pas stocké, donc les cartes ne survivent pas.

**Ce n'est pas un défaut à ouvrir : c'est exactement ce que le lot Action OS L4 répare**,
parti le 15/09 au soir. La preuve en recette est déjà écrite dans son brief :
« recharger la page → la carte est identique, avec son état ».

Ce que cette mesure apporte : elle transforme un défaut PLANIFIÉ (écrit par un
planificateur en lecture seule le 12/09) en défaut **OBSERVÉ**, avec son fil, son
horodatage et sa phrase. Le lot avait la bonne priorité.

## 2. Ce que la recette a PROUVÉ, et qui passe `recetté`

- **#1957.5** — le message discret à l'approche du quota s'affiche **avant** tout 429 :
  « Il te reste 7 demandes à Laura sur 24 h glissantes — ton plan en prévoit 50. Les
  actions déjà préparées restent accessibles. » Le plafond effectif EST le minimum entre
  le plafond opérateur et celui du plan, et la phrase le dit.
- **#1911.2** — la liste des fils porte le compte associé (FRANCE TELEVISIONS, AIRBUS,
  LATECOERE, SNCF RESEAU) et offre « Par date / Par compte ».
- **#1962.5** — `/settings/memory` porte « Règles de l'ESN » comme **nature** distincte,
  avec son état vide (« Aucune règle partagée avec ton ESN »). Sept sections de nature.
- **#2151.3/.6/.7/.10/.11/.12** — les recherches enregistrées de Découvrir portent
  objectif, cadence, dernière exécution (jamais `savedAt`), auteur et partage, côté
  contrat ET côté table `saved_views`.

## 3. Ce qui n'a PAS pu être mesuré, et pourquoi — ce ne sont pas des défauts

- **Les 12 points d'écran de l'onboarding** (#2013.x, #2022.5, #2077.x, #2085.x,
  #2002.4, #2003.17) : `/onboarding` **redirige vers `/chat`** sur le compte de Louis,
  qui est déjà intégré. Il faudrait un compte neuf. « Non mesuré » n'est pas « 0 » :
  ils restent `livré`, pas `écarté`.
- **#1962.11/.12/.14** (les cinq options de « Enregistrer comme… ») : le menu s'ouvre
  dans un portail hors de `<main>`, que la sonde de texte ne lit pas. Le code EST dans
  l'arbre servi. Deux allers-retours dépensés, on s'arrête — règle du §6 bis.
- **#2166.12** (la confiance sur la carte d'un compte de Découvrir) : `/discover` n'a
  aucun résultat sans critère, et le point demande une carte réelle.

## 4. Un faux positif de plus, et sa cause — la NEUVIÈME famille

`javascript_tool` a rendu **« BLOCKED: Cookie/query string data »** sur `/dashboard` et
`/discover`, alors que la même sonde venait de passer sur `/settings/notifications` et
`/chat`. Ce n'est ni un défaut d'écran ni une session expirée : c'est le classifieur de
l'outil qui refuse la sonde selon ce qu'elle rend.

**Le contournement qui marche** : `get_page_text`, qui lit `<main>` sans exécuter de
script. Il ne donne pas la géométrie — donc pour la sonde de mise en page, il faut
revenir au script, sur les écrans où il passe.

## 5. ⚠️ Deux features revendiquaient le MÊME paramètre positionnel

Trouvé par l'intégrateur en fusionnant `integration-x` sur `main`, le 15/09 au soir.

`AccountsService.findAccountsByWorkspace(workspaceId, filters, scope, marketCoveredIds, …)`
a gagné un **cinquième paramètre positionnel deux fois, indépendamment** :

- `currentUserId` — #2150.14/.15/.18, pour deux filtres personnels ;
- `businessUnitScope` — #2005.9 / #2081.17, la couche BU.

Chacune des deux branches était verte chez elle. Fusionnées, **un appelant passait un
identifiant d'utilisateur là où l'autre lisait une portée de BU**, sans que rien ne
rougisse au typage : les deux sont des valeurs compatibles à cette position.

Corrigé : `businessUnitScope` devient le 5e, `currentUserId` le 6e, tous les appelants
et `accounts.favorite-ownership-filter.spec.ts` / `accounts.market-covered.spec.ts`
ajustés. 238 tests API verts sur le périmètre.

**Ce que ça apprend** : une signature qui grandit par la QUEUE est un rendez-vous de
collision entre deux lots parallèles, et ni la CI de l'un ni celle de l'autre ne peut le
voir — seule la fusion le révèle. Un paramètre ajouté à une fonction déjà longue devrait
arriver dans un OBJET nommé, pas à la position n+1. C'est la troisième famille de défauts
que seule l'intégration attrape, après le marqueur de conflit orphelin et l'import ESM
sans `.js`.

## 6. ⚠️ DIXIÈME famille — la sonde qui SONDE coûte plus cher que ce qu'elle mesure

Mesuré le 15/09 au soir, en préparant le balayage de fondation.

Ma sonde attendait que `innerText` se STABILISE : une lecture toutes les 400 ms,
jusqu'à 8 lectures égales. Deux défauts, tous les deux graves :

**1. Chaque lecture coûte ~1 s, pas 400 ms.** `innerText` force un recalcul de mise en
page. Mesuré : **22 itérations de 400 ms ont pris 22,2 s**. Avec un parcours du DOM
derrière, la sonde dépassait systématiquement le délai de 45 s de l'outil — trois
dépassements de suite, qui ressemblaient à un moteur gelé alors que c'était la sonde.

**2. La courbe de chargement a PLUSIEURS paliers**, pas un. Relevé brut sur `/dashboard` :

```
26 · 0 · 361 · 361 · 361 · 783 · 783 · 783 · … (stable jusqu'à 22 s)
```

Un palier à 361 tenu trois lectures, puis la vraie valeur à 783. Une règle « N lectures
égales » se fait piéger par n'importe quel palier assez long — et la mienne avait déjà
rendu **354 pour un écran qui en fait 783**, soit une sous-lecture de 55 %.

**Le correctif : on n'attend plus une stabilité, on attend un TEMPS.** Une seule attente
fixe de 9 s, puis UNE mesure. C'est plus simple, deux fois plus rapide, et ça ne peut pas
se faire piéger par un palier. Vérifié sur `/accounts` : 9,3 s, 1 735 nœuds, 8 158
caractères, zéro faux positif.

**Trois autres pièges trouvés en chemin :**
- `new Function(...)` + `sessionStorage` pour rejouer la sonde **pend le moteur** : l'IIFE
  asynchrone reste en vol et bloque les appels suivants, qui remontent alors « renderer
  may be frozen ». La sonde s'écrit EN LIGNE à chaque appel, même si c'est plus verbeux.
- `getComputedStyle` appelé sur CHAQUE nœud force un recalcul de style par nœud. Il ne
  s'appelle que sur les candidats déjà suspects géométriquement.
- Un appel qui a dépassé le délai laisse le moteur occupé : le suivant échoue aussi. Il
  faut **recharger l'onglet** pour repartir propre, sinon on diagnostique un écran mort
  qui va très bien.
