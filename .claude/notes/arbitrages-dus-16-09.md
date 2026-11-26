# Les arbitrages qui bloquent — au 16/09/2026, 2 h 30

Chacun de ces points est **mesuré, pas supposé** : le code a été lu, l'absence est
nommée. Aucun ne se lève par du code — ils se lèvent par une décision. Tant qu'ils
sont ouverts, les points qu'ils commandent restent `retenu`, et c'est honnête :
un `écarté` écrit par un agent serait un arbitrage produit volé à l'humain.

Ordre : ce qui débloque le plus de points d'abord.

---

## 1. Les 17 points de Business Unit (#2087.1-8, .11-17) — un DROIT D'ACCÈS, pas un filtre

**Ce qui a changé cette nuit** : la PR #2357 est mergée, le cloisonnement `workspace_id`
tient sur les trois portes qui restaient ouvertes, et un module
`apps/api/src/modules/business-unit/` existe désormais sur `main`.

**Ce qui bloque quand même** : créer une BU, en rejoindre une, lister celles qu'on a le
droit de voir — **aucune règle d'accès n'est écrite**. Ce n'est pas un filtre d'affichage,
c'est une question de droits. Et les droits d'accès sont un arrêt obligatoire
(`.claude/projet.md` §10).

La question : **qui a le droit de créer une BU, qui a le droit d'en rejoindre une, et
qu'est-ce qu'un membre d'une BU voit des AUTRES BU de son espace ?**

⚠️ #2087.10 en dépend entièrement — il n'a pas d'appelant possible sans #2087.1.

---

## 2. #2068 — le plan et les paliers sont RENDUS, mais rien ne les mesure

**Ce qui a changé cette nuit** : `AuditPlanAndMilestones` est monté sur
`/settings/profile/audit`, la chaîne d'appel est complète, et le contrat versionné
`CommercialAuditContext` a enfin un appelant en production.

**Ce qui bloque** : `thirtyDayPlan`, `milestones` et `productConfiguration` arrivent à
l'écran **à `null`** — aucune source ne les remplit. Le composant est juste, le contrat
est juste, il n'y a rien dedans.

Deux questions, et la seconde est la vraie :
1. **Qui écrit le contenu** du plan à 4 semaines et des paliers 60j/90j/6m/12m — le
   moteur, un catalogue statique, ou l'utilisateur ?
2. **Quel champ alimente chacune des 9 aires produit** (scoring · Découvrir ·
   priorisation · contacts · messages · Reverse Market · Laura · routines · pilotage) ?
   Sans cette table, « personnaliser le produit » n'a pas de destinataire.

⚠️ Ne pas inventer le contenu : JAMAIS de donnée fictive. Un palier sans condition de
passage mesurable est une promesse, pas un jalon.

---

## 3. #2078.22 / .23 — le connecteur Google demande TOUT, ou rien

Mesuré : l'OAuth Google réclame le paquet complet de droits dès la première connexion.
Il n'existe pas de palier « lecture seule » chez le fournisseur pour ce que le produit
fait.

La question : **accepte-t-on de demander moins de droits au départ**, quitte à
redemander plus tard quand une capacité en a besoin — ou garde-t-on la demande unique ?

Ce que chaque branche coûte : demander tout d'un coup fait reculer des gens à
l'inscription ; demander en deux fois multiplie les écrans de consentement et casse le
parcours au milieu.

---

## 4. Les 3 derniers « zéros qui mentent » du back-office (`crm-kpis.service.ts:240-247`)

Le balayage des 113 `catch` de l'API en a trouvé quatre qui mentent vraiment. Les deux
qui alimentaient le cockpit sont corrigés (`fix/trois-zeros-qui-mentent` — l'échec
remonte, l'écran sait montrer une panne). **Il reste ceux du back-office.**

La question est une question de produit, pas de code : **un opérateur qui regarde un KPI
CRM cassé doit-il voir « 0 », « indisponible », ou l'écran refuse-t-il de s'afficher ?**
Le back-office n'a pas les mêmes règles que l'app cliente — c'est pour ça que ce n'est
pas à un agent de trancher.

---

## 5. #1938.13 — `interruption-budget.ts` ou `decideProactivity` ?

Deux mécanismes décident quand Laura a le droit d'interrompre. Ils coexistent. C'est une
décision d'**architecture** : lequel est LA porte, et l'autre disparaît-il ou devient-il
une entrée de celui qui reste ?

⚠️ Tant que les deux existent, ils divergeront — une dérivation vit à un seul endroit
(GA-26), et c'est exactement le motif qui a produit deux chemins de calcul qui ne
disent pas la même chose.

---

## 6. #2084.11 / .19 / .43 / .44 — un composant « coût / durée / crédits » à mutualiser

Quatre points demandent la même chose à quatre endroits, et deux autres issues aussi :
#2091.32 et #2008.3. Six endroits, un seul objet.

La question : **un composant partagé, ou six affichages ?** Et surtout — ⚠️ #2091.32
porte un COÛT dans le parcours d'accueil, alors que l'onboarding est **gratuit de bout en
bout** (décision Louis, 15/09). Il faut trancher si ce point est périmé par cette
décision ou s'il vise autre chose.

---

## 7. #1921.4 / #1921.5 — un teaser suffit-il ?

« Tes incohérences » et « les angles prioritaires » : le code montre un **teaser + un
lien** vers `/settings/profile/context`, pas la restitution complète. C'est une décision
assumée du 13/09 (loi 4 : rien n'apparaît deux fois sous la même forme).

La question : **est-ce suffisant**, ou le retour demande-t-il vraiment la restitution en
place ? Laissé `retenu` avec la nuance écrite dans la ligne.

---

## 8. #2023.3 — une ligne de registre avec trois annotations qui se contredisent

La ligne porte, empilés : `livré`, puis `retenu, PÉRIMÉ`, puis un `écarté` écrit par une
session précédente — **en violation de la règle qui interdit ce mot aux agents.** L'état
en colonne reste `retenu` et personne n'y a retouché.

C'est le seul point de cette liste qui ne demande pas une décision produit mais une
**remise au propre** : il faut dire laquelle des trois lectures est la bonne, et effacer
les deux autres. Une ligne de registre qui dit trois choses ne dit rien.

---

## 9. #2091.40 — Laura ou l'écran d'accueil, à la sortie de l'onboarding ?

⚠️ **Deux décisions écrites se contredisent**, et aucun agent ne doit trancher ça seul.

- **Le retour #2091.40 demande** : le premier écran après l'onboarding est **Laura**, ou
  une action préparée par Laura. C'est aussi ce que dit la règle mobile — « Laura en
  premier onglet ET en écran d'arrivée ».
- **Le code oppose une décision produit antérieure**, documentée dans
  `useOnboardingNavigation.ts:73-81` : la **décision Théo P0-01** exige que
  `WelcomeScreen` reste le point d'arrivée du parcours.

La règle d'antériorité s'applique : un retour qui contredit une décision inscrite est une
**question**, jamais un `écarté` silencieux. La question : **laquelle des deux gagne**, et
si c'est le retour, que devient la raison qui avait fait poser P0-01 ?

Point laissé `retenu`, la tension écrite dans sa ligne.

---

## 10. #2069 — les « premières actions » ne sont jamais prêtes, donc la phrase ne s'affiche jamais

Trouvé en écrivant #2091.39 : les trois libellés de fin (« Ton audit est validé »,
« Laura est configurée », « Tes premières actions sont prêtes ») sont désormais gardés —
chacun ne s'affiche que s'il est **vrai**. C'est juste, et c'est la doctrine.

**Conséquence mesurée** : le troisième ne s'affiche **jamais**, parce que **#2069 laisse
les suggestions vides**. La garde fonctionne ; c'est la source qui manque.

La question : **#2069 est-il dans un lot à venir**, ou faut-il retirer la troisième
promesse de la fin de parcours ? Afficher une phrase qui ne peut pas être vraie serait
une donnée fictive ; la garder muette indéfiniment est une promesse morte dans le code.

---

## Ce qui n'est PAS un arbitrage, et qu'on ne redemande pas

- **La mesure à ~390 px.** Les deux chemins sont fermés et la cause est nommée :
  `content-security-policy: frame-ancestors 'none'` en production, et `resize_window`
  qui ment. **On ne touche pas à cet en-tête** — il protège contre le détournement de
  clic. Conséquence assumée : tout point dont la preuve est « le rendu sur téléphone »
  reste `retenu` jusqu'à ce qu'un humain regarde son écran.
- **« Assistant IA » sur `/settings/mcp`** n'est pas une violation de D82 — tranché le
  14/09, ne pas re-litiguer.

---

## 11. Quatre arbitrages remontés par les écrivains de la nuit (ajoutés à 03 h 15)

Les quatre sont sortis des rapports de lots terminés entre 02 h 30 et 03 h 15. Aucun n'a
été tranché par un agent — c'est la règle : **un agent n'écarte jamais**, il remonte.

**a) `#2047.1` — « collecter les clients actifs » chevauche `active_clients_band`.**
La question existe déjà sous un autre nom. Deux réponses possibles et elles ne sont
pas équivalentes : soit le point est **déjà là** (et on le marque), soit les deux
mesurent des choses différentes (les comptes ACTIFS contre la base de clients au
sens large) et il faut alors **les distinguer à l'écran**, sinon on pose deux fois
la même question à trois écrans d'intervalle — ce que la loi 4 interdit.

**b) `#2052.7` — l'écran du chiffre d'affaires.** Le contrat refuse toute valeur
numérique sur un objectif `kind: 'revenue'` (refinement Zod, branché sur
`modules/objectives`, non dupliqué — GA-26 tenue). Reste la question d'écran : le
cockpit `/objectives/me`, **déjà en production**, suffit-il à fermer le point, ou
faut-il un rendu dans le questionnaire lui-même ? Un agent ne peut pas trancher ça.

**c) `#1903.15` à `.20`, `#1935.5/.14/.15/.24` — `SequencesPage.tsx` n'est pas câblé.**
Le clic depuis le chat ouvre bien `/actions/sequences`, mais `campaignFromSearch`
(`apps/web/src/features/outreach/campaign-prefill.ts`) est **écrit, testé 8/8, et
appelé par personne** : l'écran s'ouvre vide au lieu de s'ouvrir pré-rempli. Neuf
points restent `retenu` derrière ce seul câblage. Ce n'est pas vraiment un
arbitrage — c'est un **lot évident** — mais il vaut d'être vu avant de dispatcher
autre chose sur Laura.

**d) `#2047.13` à `.18` — le même motif, une deuxième fois dans la même nuit.**
`deriveClientBaseCapitalizationSignals` (`client-base-capitalization.ts:65`) dérive
les six liens de capitalisation, avec 70 lignes de test. **Personne ne l'appelle** ;
`onboarding.ts:123` n'est qu'un ré-export. Les six lignes du registre portent
maintenant la raison écrite, pour que le prochain lot câble au lieu de recoder.

⚠️ **Ce que ces deux derniers points disent ensemble** : sur six branches balayées
cette nuit, **deux fonctions sur deux** qui rendaient un calcul de restitution
n'avaient pas d'appelant. Ce n'est pas un accident de lot, c'est la pente naturelle
d'un brief qui dit « écris la règle » sans dire « et montre-la ». Les briefs
suivants nomment l'appelant comme un livrable, pas comme une vérification.

---

## 12. Un audit qui ne peut RIEN mesurer — que montre-t-on ? (mesuré à 03 h 40)

**Le fait, vérifié dans le test, pas rapporté** : sur les quatorze formes d'ESN du
corpus #2070, le cas « technicien qui vient de créer sa petite ESN » donne

    0 axe évaluable sur 12 · maturity.score = null · les 12 axes en state 'unknown'
    0 contradiction · les 5 règles calculables rendent `unknown`, pas `clear`

Le moteur se comporte exactement comme il doit : il ne rend ni `0`, ni « rien à
signaler », il rend `null` avec une `reason` non nulle et douze axes NOMMÉS.
**C'est la doctrine tenue à la lettre** — « non mesuré » n'est pas « mesuré à zéro »,
et un axe non évaluable sort du dénominateur.

**Et c'est précisément là qu'il y a un arbitrage produit, pas un bug** : neuf cas sur
quatorze ne lèvent AUCUNE tension, et le plus pauvre n'a rien du tout. Que voit cet
utilisateur en ouvrant l'écran de l'audit ?

Trois réponses possibles, et elles n'ont pas la même valeur :
1. **L'écran s'affiche, honnêtement vide**, avec les douze axes nommés et la raison de
   chacun (« aucune lecture des réponses n'est encore disponible »). C'est vrai, c'est
   conforme, et c'est probablement décourageant à la première ouverture.
2. **L'écran renvoie vers ce qui le remplirait** — les questions du questionnaire qui
   alimentent les axes manquants. Utile, mais il faut alors que la correspondance
   « axe → question » existe, et elle n'existe pas encore.
3. **L'écran n'est pas proposé tant qu'un seuil n'est pas atteint** (par exemple les 3
   axes en dessous desquels il n'y a de toute façon pas de score). Le plus sobre, mais
   il cache une capacité que l'utilisateur a peut-être envie de voir arriver.

⚠️ **Ce qui n'est PAS en question** : afficher `0`, afficher « tout va bien », ou
inventer un score partiel. Les trois sont exclus par la doctrine et par le moteur.

⚠️ **Rappel de cadrage** : sept détecteurs sur douze et cinq axes sur douze rendent
`unknown` pour TOUS les cas aujourd'hui, parce que `ProfileContext` ne porte ni vivier,
ni besoins, ni partenaires, ni RFP, ni missions, ni équipe. Une part de la pauvreté
mesurée ici est donc un manque d'ENTRÉES, pas un manque de règles — et les lots du
questionnaire en cours (vivier, base de clients, objectifs, AO/contenu) remplissent
justement ces entrées-là.

---

## 13. Le lot « ce qui ne se déduit pas » s'arrête à mi-chemin (04 h 25)

`feat/le-questionnaire-ne-deduit-pas` (#2032/#2036) a livré **la garde**, pas les
**questions**. C'est un état stable et honnête, mais il demande une décision.

**Ce qui est fait et tient tout seul** : GA-338 interdit qu'un champ DÉCLARATIF entre
dans un chemin de NOTATION. Elle est vérifiée contre les sept vrais moteurs de score
(`account_score.py`, `account_score_axes.py`, `score_axes.py`, `discover_scoring.py`,
`perimeter_score.py`, `esn_fit.py`, `contact_ranking.py`) et son rouge a été obtenu
deux fois en la cassant réellement. Elle protège #2032.15 ET #2036.10.

**Ce qui est écrit mais pas fini** : sept valeurs de parcours ajoutées EN FIN de
`user_role`, la question `role_functions_practiced`, et la colonne `growth_target_zones`.
Il leur manque l'i18n FR/EN, le semis de démo et le changelog — donc elles ne sont pas
`livré`, et les neuf lignes de registre le disent.

🔴 **Le défaut à trancher, nommé par l'écrivain lui-même** :
`esn-answers.mapper.ts` n'a pas été étendu avec les deux nouvelles clés. L'écriture
passe (par un `.merge()` générique), **la RELECTURE non** — une réponse déjà donnée ne
revient pas à l'écran, donc l'utilisateur se la voit reposer. Ce n'est pas une finition,
c'est un comportement faux.

La question : **finir ce lot (i18n + démo + changelog + mapper) dans un lot de
FINITION, ou le replier** en ne gardant que la garde ? Le coût du premier est faible et
connu ; le second laisse sept valeurs d'énumération dans le contrat sans écran pour les
poser, ce qui est exactement le défaut n°1 du dépôt.

**Un fait utile au passage, vérifié et non supposé** : `user_role` n'entre dans AUCUN
prompt de notation. Il part au TON (`bellum_advisor.py:1035`) et à la famille de voix
(`laura_role_and_voice.py:120-134`), jamais au rang d'une personne. La crainte de GA-06
était fondée en principe et infondée en fait — et c'est maintenant gardé.

## §14 — ⚠️ RETIRÉ : la mesure qui le fondait était fausse (voir §14 bis)

> **Ce paragraphe est conservé tel quel parce qu'il a orienté des décisions, mais
> sa mesure est FAUSSE et sa conclusion aussi.** La mémoire marché porte 20
> environnements en production et la carte les rend. Lire §14 bis, plus bas.

## §14 (périmé) — la mémoire marché ne rend AUCUNE correspondance

**Ce qui est mesuré, sur la production, avec la session de Louis :**

```
GET /api/companies/market-context-search?location=Paris & Île-de-France      → 200 {status:"ok", matches:[]}
GET /api/companies/market-context-search?location=Strasbourg & Grand Est     → 200 {status:"ok", matches:[]}
GET /api/companies/market-context-search?technology=Data & Intelligence Artificielle → 200 {status:"ok", matches:[]}
```

La route répond, elle répond `ok`, elle ne trouve rien. `MarketAwarenessCard`
rend donc `null` (`MarketAwarenessCard.tsx:77`), ce qui est le comportement
DEMANDÉ par #1627 (« couverture insuffisante ⇒ on garde le parcours actuel »).
**Rien n'est cassé.**

**La question, qui n'est pas technique :** est-ce que ce vide est *attendu* —
le corpus de mémoire marché n'est pas encore alimenté, et il le sera — ou bien
est-ce qu'une ESN Data/IA en Île-de-France DEVRAIT avoir des correspondances,
auquel cas le défaut est en amont (alimentation, résolution, seuil) ?

**Pourquoi ça ne se tranche pas tout seul :** les deux lectures produisent le
même écran. Et la conséquence diffère du tout au tout — dans un cas on attend,
dans l'autre on a une capacité livrée que personne ne verra jamais.

**Ce que ça bloque en attendant :** tous les points de vocabulaire de mémoire
marché (« Compatible · Observé · À qualifier », GA-259) restent `livré` et ne
peuvent pas passer `recetté` — ils ne sont pas observables en production sur
cet espace. Trois écrans balayés, zéro occurrence, et **ce zéro-là ne prouve
rien** : il n'y a pas de corpus à mesurer.

**Recommandation :** vérifier d'abord combien de lignes porte la table de
mémoire marché en production. Si elle est vide, c'est une question
d'alimentation et la doctrine est intacte. Si elle est peuplée, c'est la
résolution qu'il faut regarder, et ça devient un défaut.

---

## §15 — GA-267 contre « ne pas taire une question vue » : deux gardes, deux intentions justes

**Ce n'est pas une correction mécanique, c'est un arbitrage.** Je l'ai pris dans
la direction conservatrice pour ne pas bloquer la PR, et il se rejuge en une
minute si tu n'es pas d'accord.

**Le fait.** Dans `apps/api/src/modules/analytics/product-analytics-read.service.ts`,
la lecture neuve `onboardingQuestionAbandonment` applique le plancher des cinq
sessions **par question** — chaque ligne porte `detail: { kind: 'below_threshold' }`
quand la question a été vue par moins de cinq sessions — mais rend son
**enveloppe** sans condition :

```ts
return { kind: 'measured', rows }
```

Ses quatre lectures sœurs, elles, rendent `{ kind: 'not_instrumented' } |
PublishedMeasure<T>` et passent par l'aide partagée `publish()`.

**Les deux gardes qui se contredisent.**

| Garde | Ce qu'elle exige | Où |
| --- | --- | --- |
| **GA-267** | aucune étiquette `measured` nulle part sous le plancher | `behavioral-reads-respect-session-floor.spec.ts:335` |
| la spec de la fonctionnalité | `measured` **à une seule session** — « sous le seuil : la question EXISTE, retenue — jamais absente ni à zéro » | `product-analytics-read.service.spec.ts` |

La seconde n'est pas un oubli : elle sème délibérément UNE session et fait
`if (result.kind !== 'measured') throw new Error('measured attendu')`. Son
intention est juste — une question vue ne doit pas disparaître de l'écran, sinon
on lit son absence comme un zéro. C'est la doctrine « non mesuré n'est jamais 0 »
qui parle par sa bouche.

**Ce que j'ai tranché, et pourquoi.** GA-267 gagne :

1. c'est de la doctrine écrite (`CLAUDE.md`, « aucune métrique sous 5 sessions
   distinctes ») ;
2. **la relecture juridique RGPD de `c64_analytique_produit` est toujours due** —
   reportée trois fois. Tant qu'elle ne l'est pas, on tient le cran le plus
   conservateur ;
3. la direction conservatrice n'expose **jamais plus** que l'autre. Se tromper
   dans ce sens-là se répare ; se tromper dans l'autre a déjà publié.

**La conséquence assumée, et c'est elle que tu dois regarder :** sous le
plancher, le **détail par question ne sort plus du tout**. L'enveloppe dit
`below_threshold` — elle ne dit pas « zéro », et elle ne dit pas non plus « rien
à voir ici ». L'écran devra rendre ça comme une absence de mesure NOMMÉE, pas
comme une liste vide.

**Ce qui reste ouvert, et qui est ta décision :** l'intention de la spec
d'origine — « ne pas taire une question vue » — est-elle satisfaite par une
enveloppe `below_threshold` qui dit « on a regardé, on n'a pas le droit de
publier » ? Si tu réponds non, la voie n'est pas de rendre `measured` : c'est de
faire porter à l'enveloppe la LISTE des questions vues **sans aucun chiffre
dérivé**. C'est plus de code, et ça reste dans les clous de GA-267.

---

## §14 bis — il y a 20 environnements, la carte les rend, et GA-259 est RECETTÉ

**Ce qui est mesuré sur la production (API `4172ec196`, session de Louis) :**

| Requête sur `/companies/market-context-search` | Réponse |
| --- | --- |
| `location` = `Paris & Île-de-France`, **non encodée** | **400** — « exige au moins un filtre discriminant » |
| `location` = `Paris & Île-de-France`, encodée | 200 · **0** correspondance |
| `location` = `Paris`, encodée | 200 · **20** correspondances |
| `location` = `Île-de-France`, encodée | 200 · **20** correspondances |

**Mon erreur du §14, et sa cause exacte.** J'avais écrit trois lignes
`→ 200 {status:"ok", matches:[]}`. La première de ces requêtes ne rend pas 200,
elle rend **400** : le `&` non encodé COUPE la chaîne de requête, le serveur
reçoit `location=Paris ` et un paramètre parasite, et le validateur refuse. J'ai
donc lu un vide qui était une **erreur de ma commande**, pas un état du produit
— la même famille d'erreur que le `zsh` qui mange `git show $B:apps/…`. Et j'en
ai tiré une conclusion beaucoup plus large que la mesure : « il n'y a pas de
corpus à mesurer ». Il y en a vingt.

**Pourquoi la carte marche quand même.** `deriveMarketAwarenessQuery`
(`market-awareness.ts:132`) passe par `firstSegment`, qui coupe le libellé sur
`[&(,/]` : la zone déclarée « Paris & Île-de-France » devient `Paris`. La
normalisation existe, elle vit dans la feature Welcome, et c'est elle qui sauve
l'appel.

⚠️ **Limite mesurée, laissée telle quelle** : `buildMarketContextQuery`
(`discover/lib/market-context.ts:80`) ne fait qu'un `.trim()`. Un libellé
composite tapé à la main dans le filtre « ZONE OBSERVÉE » rend donc zéro
pendant que chacune de ses moitiés rend vingt. Aucun chemin réel ne le produit
aujourd'hui — le bouton de la carte transporte la zone DÉJÀ normalisée — mais
la normalisation n'est pas là où on croit.

### La recette de GA-259, avec son témoin

`/discover` avec la zone `Paris`, 20 environnements rendus. Ce que l'écran dit,
verbatim :

- **le compte, jamais le taux** : « 83 parcours observés », « 591 parcours
  observés ». Zéro pourcentage sur tout l'écran, zéro « externalisent ».
- **la négation ne s'écrit pas** : « Recours externe : Observé » figure sur 14
  des 20 ; sur les 6 autres (Capgemini, France Télévisions, Louis Vuitton, Malt,
  Safran, Sogeti) **la ligne est ABSENTE**. Jamais « Recours externe : Non ».
  C'est exactement la règle « la négation comprise » — un libellé se lit hors
  contexte, la négation se perd, le mot reste.
- **la doctrine est écrite à l'écran** : « Une trace du PASSÉ, jamais un signal
  d'aujourd'hui : "observé" veut dire vu dans le corpus, pas actif en ce moment.
  **Une absence d'observation ne prouve rien.** »
- **aucune gradation** : « Pas de gradation au-dessus : un compte plus grand cite
  mécaniquement plus de technologies, sans que ce soit un fit plus fort. »
- **l'axe non évaluable sort du dénominateur, en toutes lettres** : « Un critère
  sans donnée n'est pas noté zéro : il sort du barème et t'est signalé sur la
  carte. »

**Conséquence** : les points de vocabulaire de mémoire marché que le §14
déclarait non observables **sont observables**, et passent `recetté`.

---

## §16 — « Je ne sais pas » manque aux questions de COMPTAGE (mesuré en prod, 06 h 44)

**Le fait, sur `/onboarding/<id>/company_info/vivier-comptage`**, en production
(`b1be40799`), sans rien répondre :

| Question | Options | « Je ne sais pas » ? |
| --- | --- | --- |
| profils identifiés | `0` · 1-5 · 6-15 · 16-30 · 31-80 · 81-200 · 200+ | **non** |
| dont qualifiés | idem | **non** |
| disponibles maintenant | idem | **non** |
| fraîcheur de la dispo | Cette semaine · Ce mois-ci · Il y a plus d'un mois · **Je ne sais pas** | oui |
| TJM du vivier | 5 bandes | non |

**Pourquoi ce n'est pas un bogue.** La doctrine « non mesuré n'est jamais 0 »
porte sur l'AFFICHAGE d'une valeur absente. Ici `0` est une réponse légitime :
« je n'ai personne de qualifié » est un fait, et il mérite d'être disable.

**Pourquoi ça mérite quand même ta décision.** C'est le seul endroit du produit
où les deux se touchent. Quelqu'un qui **ne sait pas** combien de profils sont
qualifiés a `0` en première position et rien qui nomme son état. Laisser la
question vide fonctionne — elle retombe dans les « 62 questions sans réponse »
que `/settings/profile` compte correctement — mais **rien à l'écran ne l'y
invite**, et le réflexe d'un formulaire est de répondre.

Et la conséquence n'est pas symétrique : un `0` déclaré par erreur **entre dans
le moteur** comme un fait (l'aide de la question le dit : « Situe la taille de
ton vivier identifié dans l'analyse de ta capacité à staffer »), alors qu'une
absence en sort proprement.

**Ce que je n'ai pas fait, et pourquoi.** Rien. Ajouter « Je ne sais pas » à une
question en ajoute une à toutes les questions de comptage du questionnaire —
c'est un lot, pas une retouche, et le choix t'appartient.

**Trois options, si tu veux trancher vite :**
1. **Ne rien changer** — laisser vide EST la réponse « je ne sais pas », et le
   compteur des 62 la lit correctement. Coût : zéro. Risque : le `0` cliqué par
   défaut.
2. **Ajouter « Je ne sais pas » aux comptages** — cohérent avec la question de
   récence qui l'a déjà. Coût : un lot sur toutes les questions de comptage.
3. **Rendre le « passer » visible** sur chaque question plutôt qu'une option de
   plus. Coût intermédiaire, et ça ne gonfle pas la liste des bandes.

Ma recommandation : **2**, parce que la question de récence l'a déjà et qu'une
règle qui vaut pour une question et pas pour ses voisines redevient une opinion.

---

## §17 — ⚠️ J'AI CHANGÉ L'ÉTAT DE TON COMPTE DE PRODUCTION. Un clic te le rend.

**Ce que j'ai fait.** En recette du questionnaire, j'ai cliqué « Revoir mes
réponses » sur `/settings/profile`, en croyant ouvrir un écran. Ce bouton
appelle **`POST /onboarding/refresh`**, et son propre docblock le dit :
« `POST /onboarding/refresh` pose `refresh_required`, **le seul état** que
`resolveOnboardingEntry` traduit en page de reconfiguration guidée »
(`ReconfigureAnswersSection.tsx:13`). Ce n'était pas une lecture.

**L'état avant et après**, mesuré :

| Moment | `GET /onboarding/state` |
| --- | --- |
| avant (06 h 20, `/welcome` rendait 3 247 c) | `completed` |
| après mon clic | `refresh_required`, `current_stage_code: transition_summary` |

Je le sais sans ambiguïté par le code, pas seulement par l'horaire : le bouton
ne s'affiche que depuis un état TERMINAL (`completed` / `activated`), et s'il
était déjà `refresh_required` il aurait seulement ouvert la page **sans appeler
l'endpoint** (`alreadyRequested` ⇒ `open()`, ligne 66).

**Ce que ça coûte, exactement.** Une seule chose : **`/welcome` ne s'ouvre
plus**. Son garde exige `status === 'completed'` (`routes/welcome.tsx:19`), donc
il renvoie vers `/onboarding`, qui te renvoie vers `/chat` — puisque j'ai
recliqué « Reprendre plus tard », ce qui repose `skippedAt`. Tout le reste
fonctionne : `/chat`, `/discover`, `/settings/profile`, `/settings/profile/audit`
(remesuré, 11 845 c, identique à avant). **Aucune réponse n'a été modifiée** —
je n'ai répondu à aucune question et je n'ai rien validé.

**Ce que je n'ai pas fait, et pourquoi.** `refresh_required → completed` est une
transition LÉGALE (`onboarding.service.ts:112`, ajoutée le 16/09 justement pour
qu'un parcours rouvert puisse se refermer). Mais les gestes qui la déclenchent
sont **les tiens** : finir le questionnaire, ou cliquer « Valider » sur ton
audit commercial. Valider ton audit est une décision produit, pas une remise en
état — je ne la prends pas à ta place.

**Pour revenir à `completed`, en dix secondes** : ouvre
`/settings/profile/audit` et clique **« Valider »** (ou termine le
questionnaire). Si tu préfères que je le fasse, dis-le et je le fais.

**Ce que ça m'apprend, et que j'ai écrit en mémoire** : en recette, un bouton
dont le libellé sonne comme une consultation (« Revoir mes réponses », « Voir
les sources ») n'est pas une lecture tant que je n'ai pas lu ce qu'il appelle.
Le geste correct était de lire `ReconfigureAnswersSection.tsx` **avant** de
cliquer — dix lignes, et son docblock nomme l'effet en toutes lettres.
