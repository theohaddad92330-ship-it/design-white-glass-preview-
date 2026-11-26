## `/welcome` — balayage après le déploiement de la vague 11 (16/09, 02 h 40 UTC)

Servi : `30a04a9fb` (API **et** IA, lu sur `GET /version`).
`location.href` relu dans la capture : `https://app.bellum-ai.com/welcome`.
Corpus lu : **53 lignes, 7 boutons** — l'écran n'est pas vide, le relevé porte sur quelque chose.

| Ce qui était cherché | Trouvé |
| --- | --- |
| Vocabulaire INTERDIT (Recrute · Besoin ouvert · Client certain · Fournisseur en place · Externalise aujourd'hui) | **0** |
| Probabilité (« chance de », « % de réussite ») | **0** |
| Zéro nu | **0** |
| Taux affiché | **0** |

Et une phrase qui mérite d'être citée, parce qu'elle fait exactement ce que la doctrine
demande — la provenance ET sa limite, à l'écran :

> « Une réponse corrigée change la prochaine analyse, pas celles déjà produites. »

⚠️ **Ce que ce relevé ne prouve PAS** : le vocabulaire attendu de la mémoire marché
(« Compatible · Observé · À qualifier ») est **absent** de la page. Ce n'est pas un défaut
en soi — la carte ne se rend que s'il y a de la matière — mais ça veut dire que ce relevé
ne dit rien de #2074.23 ni de #2090.42. À re-mesurer sur un espace où la carte s'affiche.

---

# Recette de `4172ec196` — #2361 et #2363 en production (16/09, 02 h 5x UTC)

`GET /api/version` relu DANS chaque capture : `4172ec196`.
⚠️ **Le paquet web se déploie séparément de l'API** — la première capture a lu
`4172ec196` côté API tout en exécutant l'ANCIEN bundle dans l'onglet. Un relevé
pris sans recharger la page mesure le code d'avant. C'est ce qui a failli faire
conclure « le correctif n'est pas passé ».

## ✅ #2361 — « Close » → « Fermer » : RECETTÉ, avec témoin

Même geste, même écran, même corpus, à quinze minutes d'intervalle :

| | paquet web | `sr-only` lus | boutons du panneau | libellé |
| --- | --- | --- | --- | --- |
| avant | l'ancien (onglet non rechargé) | 42 | 24 | **`Close`** |
| après | `index-BzQRdDgC.js` | 42 | 24 | **`Fermer`** |

Geste : `/chat` → bouton « Voir tes conversations » → panneau « Conversations ».
`closeEnAnglais` passe de `["Close"]` à `[]`. **Le relevé sait dire NON** — il a
dit « Close » sur exactement le même geste un quart d'heure plus tôt. C'est ce
qui manquait à la recette de cette nuit : le témoin avait besoin d'un tiroir
OUVERT, `sheet.tsx:133` ne rendant `<span className="sr-only">` que dans ce cas.

## ✅ #2363 — les zéros qui mentaient : RECETTÉ sur la vue d'ensemble

Compte `SARL ER` (volontairement pauvre), onglet `overview`, 124 lignes lues,
45 boutons.

- **0 zéro nu** sur 124 lignes.
- Et la preuve POSITIVE, qui vaut mieux qu'une absence :

  > « Recours à des externes » → **« Non mesuré »** → « Mémoire locale · lecture incluse »

  La valeur absente est NOMMÉE absente, avec sa provenance. Ni « 0 », ni
  « n'externalise pas » — c'est GA-18/GA-19 et GA-259 tenus au même endroit.
- 0 taux affiché, 0 libellé de mémoire marché interdit.

## ✅ Le score n'est pas nu — onglet `evaluation`

`32/100` arrive accompagné de :
- **« Fiabilité du dossier »**, avec sa définition à l'écran : « Qualité de la
  collecte et des sources de cette analyse — **pas le potentiel du compte** ».
  La distinction que la doctrine demande est ÉCRITE, pas seulement calculée.
- « données faibles », puis une **Justification** en prose qui nomme les cinq
  axes : fit, accessibilité, timing, concurrence, capacité.

⚠️ **Ce que ce relevé ne prouve PAS** : ce compte a ses cinq axes évaluables.
« Un axe non évaluable SORT du dénominateur ET est nommé à l'écran » — la partie
livrée par `scoreFactors.ts` (`sumAxisMax`, `excludedAxisLabels`) — n'est donc
**pas exercée ici**. Il faut un compte qui porte un axe non évaluable pour la
recetter. Reste dû.

## ⚠️ Mon filtre était faux — le noter pour ne pas le refaire

`txt.toLowerCase().includes('recrute')` a rendu un POSITIF sur la vue
d'ensemble. La phrase réelle : « aucun budget IT, projet, **recrutement** ou
incident n'est vérifié » — une analyse en prose, qui NIE, et pas le libellé de
mémoire marché « Recrute ».

**La règle** : le vocabulaire interdit est une liste de **LIBELLÉS**, il se
cherche en ligne ENTIÈRE (`l === m || l.startsWith(m + ' ')`), jamais en
sous-chaîne. Une sous-chaîne attrape « recrutement », « recruteur »,
« recrutent » — et une garde qui attrape ce qu'elle ne vise pas est aussi
cassée qu'une garde borgne.

## ✅ `/settings/profile/audit` — la doctrine est ÉCRITE à l'écran, pas seulement calculée

160 lignes lues, 17 boutons. 0 libellé interdit · 0 zéro nu · 0 score nu.

Trois phrases valent d'être relevées telles quelles, parce qu'elles font le
travail que la doctrine demande **devant l'utilisateur** :

> « Chaque ligne vient de tes réponses. **Ce qui n'a pas pu être établi est
> nommé, jamais compté pour zéro.** »

> « **Pas de niveau de confiance chiffré** : un pourcentage mesurerait nos
> données et se lirait comme une chance de réussite. Voici la liste, nommée. »

Le refus de la probabilité n'est pas seulement appliqué : il est EXPLIQUÉ.

Et les trois « non mesuré » portent chacun leur raison, jamais le mot seul :

| Ce qui manque | Ce que l'écran en dit |
| --- | --- |
| Plan à 4 semaines | « Aucune source ne produit encore ce plan. » |
| Paliers | « Aucune source ne mesure encore de palier. » |
| Ce que Laura pourra régler depuis cet audit | « Aucun paramètre : aucune configuration effective n'est encore dérivée de l'audit. » |

⚠️ La troisième est un aveu utile : **l'audit ne commande encore rien chez
Laura, et l'écran le dit** au lieu de faire semblant. C'est le défaut n°1 du
dépôt (du code que personne n'appelle) rendu VISIBLE plutôt que masqué.

### Deux faux positifs de mon propre filtre, notés pour ne pas y retomber

- `tauxAffiches: ["100%"]` → la phrase est « **Modèle 100% freelances** :
  flexibilité immédiate sur les pics de charge » — une description d'activité
  issue des réponses de Louis, pas une métrique. Un `\d{1,3}\s?%` attrape les
  deux ; **il faut lire la phrase avant de crier au taux nu.**
- `vocabulaireAttendu: []` → « Compatible · Observé · À qualifier » est absent
  de cet écran comme de `/welcome`. **Ce n'est pas un défaut, et ce n'est pas
  une preuve** : la carte de mémoire marché n'est pas rendue ici, donc ce
  contrôle n'a pas de corpus. Il reste à mesurer là où la carte s'affiche.

## ✅ `/settings/profile/context` — GA-44 tenu

102 lignes, 36 boutons. 0 libellé interdit · 0 zéro nu · 0 probabilité — et
surtout **0 nom de fournisseur** sur les 21 cherchés (Apollo, Dropcontact,
Hunter, Lusha, Kaspr, SalesQL, FullEnrich, Brave, Firecrawl, Pappers, Serper,
Tavily, Anthropic, Claude, OpenAI, Supabase, Railway, Vercel, Langfuse, INSEE,
INPI). « On nomme la CAPACITÉ, jamais nos fournisseurs » tient sur l'écran qui
décrit précisément ce que les agents lisent.

## 🔍 Pourquoi « Compatible · Observé · À qualifier » n'apparaît nulle part — MESURÉ, pas supposé

Trois écrans balayés (`/welcome`, `/settings/profile/audit`, `/chat`), le
vocabulaire de la mémoire marché absent des trois. J'ai cherché l'APPELANT
plutôt que la fonction :

| Composant | Appelant sur `origin/main` |
| --- | --- |
| `MarketAwarenessCard` | **`apps/web/src/features/welcome/view/WelcomeScreen.tsx:401`** |
| `AuditMarketMemory` | **aucun** — il arrive avec `feat/laudit-rend-ses-tensions-et-ses-axes`, non fusionnée |
| `MarketMemoryCard` | n'existe pas |

La carte est donc CÂBLÉE. Sa condition de silence, `MarketAwarenessCard.tsx:77` :

```ts
if (!query || isPending || !read || read.status !== 'ok' || read.matches.length === 0) return null
```

Et la mesure qui tranche, prise sur la session de production
(`GET /api/companies/market-context-search`, trois critères réels de Louis) :

| Critère | HTTP | `status` | `matches` |
| --- | --- | --- | --- |
| `location=Paris & Île-de-France` | 200 | `ok` | **0** |
| `location=Strasbourg & Grand Est` | 200 | `ok` | **0** |
| `technology=Data & Intelligence Artificielle` | 200 | `ok` | **0** |

**Verdict : le silence est le comportement CORRECT.** La route répond, elle
répond `ok`, et elle n'a rien à montrer — « couverture insuffisante ⇒ on garde
le parcours actuel », ce qui est exactement ce que le retour #1627 demandait.
Ce n'est pas un orphelin, et ce n'est pas un bug.

**Ce que ça implique pour le registre** : les points GA-259 / vocabulaire de
mémoire marché (#2074.23, #2090.42 et voisins) **restent `livré`, pas
`recetté`** — ils ne sont pas observables en production sur cet espace. Écrire
`recetté` sur un écran qui ne rend rien serait le mensonge que tout le reste
interdit.

**Et une question qui n'est pas la mienne** : la mémoire marché ne rend AUCUNE
correspondance pour une ESN Data/IA en Île-de-France. Corpus pas encore
alimenté (attendu) ou défaut en amont ? → arbitrage, §14 des arbitrages dus.

## ✅ Le questionnaire d'onboarding — la doctrine tient question par question

Geste réel : `/welcome` → « Corriger mon profil » → `/onboarding` → bouton
« Compléter mon profil » → `/onboarding/<id>/company_info/temps`.
**Rien n'a été répondu** — la recette LIT.

### L'écran d'entrée dit exactement ce qu'il fait (17 lignes, 5 boutons)

> « Il reste des questions qui ne t'ont jamais été posées »
> « Ton questionnaire a été marqué terminé **avant que ces questions existent**.
> Tes réponses actuelles sont conservées : on ne pose que ce qui n'a jamais été
> demandé. »
> « Environ 6 à 9 minutes pour ce qui manque. »
> « **Aucune action n'est envoyée sans ta validation.** »

C'est le questionnaire ADDITIF qui fonctionne : on ajoute des questions sans
reposer les anciennes, et la promesse « le copilote n'envoie jamais » est
annoncée avant la première réponse, pas enfouie dans des réglages.

### Les trois questions de l'écran `company_info/temps` — 35 lignes, 23 boutons

Chacune porte **trois** lignes, et la troisième est la CONSÉQUENCE :

| Question | Ce qu'elle précise | Ce qu'elle change |
| --- | --- | --- |
| « Combien de temps par semaine **dis-tu** consacrer au développement commercial ? » | « Le temps que tu ANNONCES, celui que tu donnerais en réunion » | « Note le temps que tu annonces…, à côté de celui qui tient vraiment. » |
| « Sur ce temps, combien **tient vraiment** une semaine ordinaire ? » | « Pas ce que tu vises : ce qui survit à une semaine normale » | « Note le temps qui tient vraiment…, jamais confondu avec celui que tu annonces. » |
| « Et une fois que le reste a servi, il te reste combien ? » | « **On ne le calcule pas à ta place : soustraire deux tranches inventerait un chiffre que tu n'as pas donné** » | « Note ce qu'il te reste…, sans jamais le déduire d'une soustraction. » |

**« Aucune question sans dire ce qu'elle modifie » est RECETTÉ** : 3/3 questions
portent leur conséquence à l'écran.

**Et « le questionnaire ne déduit pas » est recetté sur cet écran** : la
troisième question REFUSE explicitement de faire une soustraction que l'écran
aurait pu faire, et dit pourquoi. C'est « jamais de donnée fictive » appliqué à
un endroit où l'inventer aurait été gratuit et invisible.

### « Zéro mesuré » et « je ne sais pas » sont DEUX options distinctes

3/3 questions offrent **« Je ne sais pas »**, séparément de **« Aucune heure
dans une semaine ordinaire »**. C'est GA-18/GA-19 appliqué à l'ENTRÉE, pas
seulement à l'affichage : un utilisateur qui ne sait pas ne se voit pas forcé
de répondre zéro, donc la donnée fausse n'entre jamais dans le système. C'est
le seul endroit où cette règle peut être tenue à la source.

## ✅ `/actions/sequences` — « rien ne part tout seul », dit à l'écran

43 lignes, 12 boutons. 0 libellé interdit. Deux phrases à garder :

> « **Rien ne part tout seul.** Aucune étape de séquence n'envoie quoi que ce
> soit sans toi. Le moteur ne connaît que ces trois natures d'étape. **Un canal
> qui ne figure pas ici n'est pas « bientôt » : il n'existe pas.** »

> « **Ta messagerie** est connectée. Le message est PRÉPARÉ et daté — l'envoi
> reste ton geste. »

La seconde nomme la CAPACITÉ (« ta messagerie »), pas le fournisseur : GA-44
tenu à l'endroit exact où il aurait été tentant d'écrire un nom d'éditeur. Et
la première refuse la promesse creuse — pas de « bientôt », pas de canal
fantôme.

### Les quatre « 0 » relevés sont MESURÉS, pas absents — vérifié un par un

| Ce qui affiche `0` | Verdict |
| --- | --- |
| « Réponses reçues : **0** » | la liste est chargée (le tableau a ses lignes) — zéro réel |
| « Bloquées : **0** » | idem |
| « **0/4** · 12/09/2026 · En attente de ta validation » (×2) | 0 étape faite sur 4 — zéro réel, et le dénominateur est là |

Même arbitrage que « 0 Messages (7j) » : **GA-18/GA-19 interdit « 0 » pour une
valeur ABSENTE, jamais pour une valeur qui VAUT zéro.** Le discriminant est le
corpus : ici le tableau porte ses lignes, donc le compteur a compté.

⚠️ Ce que ce relevé ne prouve pas : ce que ces mêmes compteurs afficheraient si
l'appel ÉCHOUAIT. C'est exactement la classe de défaut que #2363 vient de
corriger ailleurs (`isError` non branché, `?? 0` qui avale l'échec). **À
vérifier sur cet écran-là** — il n'est pas dans le périmètre de #2363.

## 🔍 GA-44 sur `/chat` — alerte levée, puis refermée par la mesure

**Ce qui a déclenché l'alerte** : huit noms d'éditeurs visibles au-dessus du
bouton « Envoyer » — HubSpot, Salesforce, Odoo, Gmail, Outlook, Google
Calendar, Google Drive, Notion. Deux CRM concurrents et deux messageries
concurrentes affichés ensemble : ça ressemblait à un catalogue en dur.

**Ce que la mesure dit.** `GET /api/tool-registry` (session de production) :

```
47 outils · connected 23 · coming_soon 11 · available 13
```

Et les 23 « connected » mélangent **deux familles que la doctrine sépare
strictement** :

| Famille | Providers | Se nomme ? |
| --- | --- | --- |
| Outils que l'ESPACE a branchés | hubspot, salesforce, odoo, gmail, google-calendar, google-drive, notion, microsoft, github | **oui** |
| **NOS fournisseurs** | apollo, brave, serper, tavily, firecrawl, pappers, insee, inpi, embeddings, transcription, stripe, france-travail | **JAMAIS** |

⚠️⚠️ **CORRECTION — j'avais écrit que `owner: "workspace"` distinguait les deux
familles. C'EST FAUX**, et un agent l'a mesuré sur le catalogue réel
(`apps/api/.../tool-catalog.ts`) : `owner` ne vaut que `workspace` ou `user`
(`toolOwnerScopeValues`) et désigne la **PORTÉE de la connexion**, pas son
propriétaire économique. **`apollo`, `brave`, `firecrawl` et `pappers` portent
`owner: WORKSPACE` exactement comme `hubspot` et `gmail`** — 39 `WORKSPACE`
pour 8 `USER` sur 47.

**Conséquence, et elle est sérieuse** : `filter(t => t.owner === 'workspace')`
**a l'air de trier et ne trie rien.** Quelqu'un qui écrirait ce filtre en
croyant protéger la règle exposerait les douze fournisseurs. La liste blanche
`CLIENT_TOOL_BY_PROVIDER` de `connectedClientTools` est **la seule porte**.

**La barre du chat n'affiche que les huit de la première ligne.** Aucun de nos
douze fournisseurs n'apparaît. Vérifié dans le code :
`connectedClientTools` (`tool-naming.ts:179`) filtre par **LISTE BLANCHE** —
`CLIENT_TOOL_BY_PROVIDER.get(tool.provider)`, et `continue` si le provider n'y
est pas. Apollo et Firecrawl ne sont pas dans cette table, donc ils ne peuvent
pas passer, quel que soit leur statut.

**C'est le bon sens du filtre.** Une liste noire aurait laissé passer le
treizième fournisseur ajouté demain ; une liste blanche ne laisse passer que ce
qu'on a décidé de nommer. Les autres consommateurs du registre sont
`IntegrationCenterPage` et ses cartes — soit Réglages › Intégrations, l'exception
NOMMÉE de la règle.

**Verdict : GA-44 tenu. Aucun défaut.** J'ai crié trop vite sur un relevé
d'écran ; c'est la lecture du filtre qui a tranché, pas le nombre de noms.

⚠️ **Ce qui reste vrai et mérite d'être su** : `/api/tool-registry` livre au
NAVIGATEUR les noms de nos douze fournisseurs, avec leur `display_name`. La
garantie ne tient donc pas au réseau, elle tient entièrement à
`CLIENT_TOOL_BY_PROVIDER`. C'est défendable — `useRouteAccess` a besoin du
registre complet — mais ça veut dire qu'un `.map(t => t.display_name)` écrit
ailleurs un jour suffirait. La garde à écrire, si on veut dormir : **aucun
rendu ne lit `display_name` hors de Réglages › Intégrations.**

## ✅ `/briefing` — l'écran où GA-44 se voit le mieux

203 lignes, 52 boutons. 0 libellé interdit · 0 nom de fournisseur sur 16
cherchés · 0 zéro nu · 0 taux · 0 probabilité · 3 « Non mesuré ».

Trois choses qui méritent d'être citées :

> « Sources utilisées aujourd'hui : **ton agenda · connecté** · **ta messagerie
> · connecté** · **tes tâches · connecté** »

La CAPACITÉ est nommée, l'ÉTAT de connexion est dit, et aucun éditeur
n'apparaît. C'est la formulation la plus propre du dépôt pour GA-44 — elle
répond à « qu'est-ce que Bellum a lu ? » sans promettre un outil à qui ne l'a
pas branché.

> « TES 7 ACTIONS — **5 visibles · 2 autres · rien ne sera envoyé** »

La promesse « le copilote n'envoie jamais » est répétée à l'endroit exact où
elle compte : au-dessus de la liste d'actions. Et le compte est honnête —
7 actions, 5 montrées, 2 nommées comme non montrées plutôt que tues.

> « Sources : ton agenda · ta messagerie »

La provenance sous chaque bloc, pas seulement en tête d'écran.

### Une nuance de lisibilité, pas de doctrine

« En cours · **2143 min restantes** » — 2 143 minutes, soit 35 h 43. L'écran
sait pourtant écrire les heures deux lignes plus bas (« 41 h 33 en réunion »).
Un compteur en minutes au-delà de deux heures se relit mal. Ce n'est pas une
règle enfreinte, c'est une unité à harmoniser ; à verser au registre comme
point de confort, pas comme défaut.

## ⚠️ `/discover` — le relevé ne prouve RIEN sur le défaut rouvert du 14/09

Le registre porte un défaut GA-44 **rouvert le 14/09** : `CandidateCard.tsx:165`
interpolait `s.name` brut et les 24 cartes affichaient « Sources : **pappers** »,
un de NOS fournisseurs. Le correctif annoncé passe par
`apps/web/src/lib/data-source-label.ts` (« pappers » → une capacité).

Mon relevé sur `/discover` :

```
71 lignes · 42 boutons · cartes: 0 · lignes « Sources : » : 0
nos fournisseurs nommés : 0     registres publics nommés : 0
```

**Ces deux zéros ne prouvent rien.** L'écran est dans son état d'ENTRÉE — il
propose « Laisse Bellum proposer tes prochaines cibles », les cartes candidates
ne sont pas rendues. `CandidateCard.tsx` n'a donc pas été exécuté, et un
vocabulaire absent d'un composant non monté n'est pas un vocabulaire corrigé.

**Ce qu'il faudrait pour trancher** : lancer réellement la proposition de
cibles — ce qui consomme des crédits d'analyse. Ce n'est pas un geste de
recette à faire seul à 6 h du matin sur le compte de Louis. Le point reste en
l'état, et la raison est écrite.

C'est le même piège que la mémoire marché, et c'est la troisième fois cette
nuit : **un composant qui ne se monte pas rend tous les contrôles verts.**
D'où `corpusLu` dans chaque relevé — ici `cartes: 0` est ce qui sauve la
conclusion.

---

# #2364 — RECETTÉE en production (06 h 37)

`main` = `b1be40799`, prod API = `b1be40799`, paquet web = `index-6AcAfAGb.js`
(il était `index-BzQRdDgC.js` avant — **le paquet a bien changé**, la mesure
porte sur le neuf). Écran : `/settings/profile/audit`, corpus lu 11 845 c.

## Le relevé chiffré

| Mesure | Valeur |
| --- | --- |
| zéros nus | **0** |
| pourcentages | 1 — `100%`, et c'est **la phrase de Louis** (« Modèle 100% freelances »), pas un taux calculé |
| « non mesuré » | 9 |
| « non évaluable » | 2 |
| « Inconnu » | 5 |
| « Rien à signaler » | 1 |
| « Déduit » | 2 |

## Les sept composants, un par un

**`AuditChain` — la distinction que tout le reste du dépôt cherche à tenir.**
« Chaque étape lit ce que les **dix-huit règles de détection** ont mesuré. »
(`ALL_DETECTORS` 0 → 18, confirmé à l'écran.) Neuf étapes, et **trois états
distincts, jamais confondus** :

| État | Étapes |
| --- | --- |
| `1 rupture détectée` | Contact, Démarrage |
| `Rien à signaler` | Échange |
| `Non mesuré à cette étape` | Besoin, Profil, Entretien, Accord, Suivi, Capitalisation |

« Rien à signaler » (on a regardé, on n'a rien trouvé) et « non mesuré » (on n'a
pas regardé) sont **deux phrases différentes**. C'est exactement ce que
« non mesuré n'est jamais 0 » demande, rendu à l'écran sans qu'on ait à
l'expliquer.

**`AuditMaturityAxes` — l'axe non évaluable SORT du dénominateur, et il est
NOMMÉ.** « **19/21 · 5 axe(s) non évaluable(s)** », puis « Non évaluable :
Preuves, Qualification client, Sécurisation candidat, Capitalisation, Alignement
équipe ». Douze axes en tout, sept notés (3+2+3+2+3+3+3 = **19**), dénominateur
7 × 3 = **21**. L'arithmétique est exacte, et les cinq exclus portent « Inconnu »
plutôt qu'un zéro.

**`ConfidenceBadge` — aucun chiffre.** Il rend le mot « Déduit ». C'est
précisément ce que l'écran promet trois blocs plus bas : « Pas de niveau de
confiance chiffré : un pourcentage mesurerait nos données et se lirait comme une
chance de réussite. »

**`AuditVerdict`** — « L'objectif mensuel de comptes dépasse ce que la cadence
recommandée permet d'analyser », avec sa conséquence (« Sans ajustement,
l'objectif se fixe sur un rythme que la cadence recommandée ne peut pas tenir »).
Un verdict qui dit CE QUI SE PASSE SINON, pas un score nu.

**`AuditWeeklyPriority`** — « Faut-il revoir l'objectif mensuel, ou augmenter la
cadence d'analyses ? ». Une **question**, pas un ordre.

**`AuditMarketMemory`** — « Mémoire marché · **inclus** » (la lecture est
gratuite, GA-286), « Aperçu limité à quelques comptes du corpus — **pas une
recherche exhaustive** », puis six comptes `Compatible` avec leur « Observé :
… ». Le vocabulaire GA-259 est maintenant SUR l'écran d'audit.

**`AuditDecisionColumns`** — « Trois décisions, pas une liste de tâches » :
Arrêter · Garder · Renforcer, avec un « Voir l'autre » neuf sur la colonne
Arrêter.

## Ce qui reste, et qui est attendu

Les trois « non mesuré » de bas de page (plan à 4 semaines, paliers, ce que
Laura pourra régler) sont toujours là : ils sont remplis par
`feat/contexte-audit-commercial-cable`, qui n'est **pas** dans cette vague.

Le défaut n°4 est toujours visible (« Tout ce que cet écran affiche a pu être
établi » sous trois « non mesuré »). Corrigé sur une branche en vol, pas dans
cette vague — attendu, à ne pas recompter comme neuf.

## `/chat` sur le paquet neuf — GA-44 et GA-32 tiennent, la reprise n'est pas observée

Même paquet `index-6AcAfAGb.js`.

**GA-44 — mesuré, pas supposé.** Dix-neuf noms de NOS fournisseurs cherchés au
mot entier dans le texte rendu (Apollo, Brave, Firecrawl, Pappers, Anthropic,
Claude, OpenAI, Supabase, Railway, SalesQL, Dropcontact, Hunter, Lusha, Kaspr,
FullEnrich, Serper, Tavily, INSEE, INPI) → **aucun**. Onze outils CLIENT
cherchés → **huit trouvés** (HubSpot, Salesforce, Odoo, Gmail, Outlook, Google
Calendar, Google Drive, Notion). La liste blanche de `tool-naming.ts` filtre, et
elle laisse passer ce qu'elle doit.

**GA-32 — 73 boutons, 0 sans nom.** Aucun bouton d'icône muet sur l'écran.

**Zéros nus : 0.**

⚠️ **`ReplyRetryMenu` : NON OBSERVÉ, et je le dis plutôt que de le supposer.**
Ouvrir une conversation par `?conversationId=…` rend la liste mais pas le fil
(corpus 3 661 c, identique à l'écran sans conversation ; aucun bouton de reprise
dans les 73). Deux tentatives, puis arrêt — ce n'est pas un défaut prouvé, c'est
une mesure qui n'a pas eu lieu. À reprendre en ouvrant le fil par un clic réel,
ou après avoir posé une question à Laura.

## Le questionnaire — `vivier-comptage` est LIVE, et cinq questions sur cinq portent leur conséquence

Chemin réel emprunté, sans rien répondre ni valider :
`/settings/profile` → « Revoir mes réponses » → `/onboarding` → « Compléter mon
profil » → `/onboarding/<id>/company_info/vivier-comptage`.

**C'est la grappe `#2046`** que la réconciliation vient de passer `déjà là` :
elle est en production, et elle se voit.

### L'écran de garde de l'onboarding — la doctrine y est écrite

- « **Tes réponses actuelles sont conservées : rien n'est effacé**, et on ne
  repose que ce qui manque. » — on archive, on ne supprime pas ;
- « **Aucune action n'est envoyée sans ta validation.** » ;
- « Ce qui est public est **prérempli** quand on le trouve — **tu corriges, tu
  valides**. » — une correction humaine gagne toujours ;
- « Tu peux t'arrêter et **reprendre plus tard, là où tu en étais**. » ;
- et le lien « Découvrir le produit en démo » vit ici.

### `vivier-comptage`, cinq questions

| Question | L'aide qui DÉSAMBIGUÏSE | La conséquence |
| --- | --- | --- |
| profils identifiés | « Une bande large suffit » | « Situe la taille de ton vivier identifié dans l'analyse de ta capacité à staffer. » |
| dont qualifiés | — | « Distingue les profils qualifiés des profils simplement identifiés. » |
| disponibles maintenant | « **Distinct de ton intercontrat déclaré plus haut** » | « Précise combien de profils sont disponibles maintenant, dans le funnel du vivier. » |
| fraîcheur de la dispo | « Une bande de **récence**, pas une date exacte » | « Date la fraîcheur de la disponibilité déclarée de ton vivier. » |
| TJM du vivier | « **Le TJM du vivier, pas celui que tu vends** » | « Enregistre le TJM de ton vivier, distinct du TJM que tu vends. » |

**5 sur 5 portent leur conséquence**, et trois portent en plus une phrase qui
dit contre quoi ne PAS la confondre. Aucun bouton sans nom (GA-32). La question
de récence offre « **Je ne sais pas** » comme option distincte.

### ⚠️ Une observation à trancher, pas un défaut prouvé

Les trois questions de comptage offrent **`0`** comme première bande, et
**aucune ne propose « Je ne sais pas »** — seule la question de récence l'a.

La doctrine « non mesuré n'est jamais 0 » porte sur l'AFFICHAGE, et `0` est ici
une réponse parfaitement légitime (« je n'ai personne de qualifié »). Mais c'est
le seul endroit du produit où les deux peuvent se confondre : **quelqu'un qui ne
sait pas combien de profils sont qualifiés a `0` sous le curseur et rien qui
dise « je ne sais pas »**. Laisser la question vide marche (elle retombe dans
les « 62 sans réponse »), mais rien ne l'y invite.

C'est une question de conception, pas un bogue : l'écrire ici pour que Louis
tranche, et ne rien changer sans lui. Si la réponse est « ajouter Je ne sais
pas », elle vaut pour les trois comptages du vivier et probablement pour tous
les comptages du questionnaire — un lot, pas une retouche.

## Ce que je n'ai PAS fait, et pourquoi — lancer la démonstration

L'écran `/demo` est mesuré (voir défaut n°5), mais je **n'ai pas cliqué
« Lancer la démo »**, alors que la parité démo est une règle permanente et que
c'est exactement le geste qui la prouverait.

La raison : la démonstration prend un bail et **peut remplacer la session de
Louis sur `app.bellum-ai.com`** — les cookies sont par origine, ouvrir un
nouvel onglet n'y change rien. Si la session tombe, plus aucune recette n'est
possible cette nuit et il faut un geste humain pour se reconnecter — que je ne
ferai jamais à sa place (saisir un mot de passe n'appartient qu'à lui).

**Le calcul** : la parité démo se vérifie à tout moment ; la session de
production, une fois perdue, ne revient qu'avec Louis. Le geste est donc reporté
**à la toute fin**, quand plus rien d'autre n'a besoin de la session — ou à faire
par Louis lui-même, en une minute.

⚠️ À ne pas confondre avec « pas mesuré parce que compliqué » : c'est une mesure
volontairement différée, et elle reste due.
