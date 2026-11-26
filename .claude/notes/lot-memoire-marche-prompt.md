# Reprise — la mémoire marché est chargée, ses écrans restent à brancher

## L'état, au 06/09/2026

Le corpus de parcours observés est **ingéré en production** (fait le 06/09). Les
quatre tables partagées portent :

| Table | Lignes |
| --- | --- |
| `market_company_signal` | 60 067 (dont **5 573** au-dessus du seuil de 3 parcours, 15 162 avec un domaine racine) |
| `market_esn_client` | 13 064 |
| `market_company_stack` | 37 643 |
| `market_ex_esn_at_client` | 3 647 |

⚠️ **54 494 entreprises ont un `externalization_score` à `NULL`** — exactement
celles sous le seuil. Aucune n'a reçu un `0` de remplissage. Si un jour ce
compte tombe à zéro, c'est qu'un import a fabriqué des zéros.

Cinq lots mergés, tous recettés en production : `8b972e815` (socle + #1572),
`b949638d5` (#1580, #1579 serveur), `b83edb886` (Laura), `8189e529d` (/search),
`c68486be0` (#1579 écran).

## Ce qu'on lit et écrit — les points d'entrée

- **Contrats** : `packages/contracts/src/schemas/market-memory.ts` — le seuil
  `MARKET_MEMORY_MIN_PATHS = 3` vit LÀ et nulle part ailleurs.
- **Lecture** : `MarketMemoryService` (`apps/api/src/modules/market-memory/`) —
  `coverageFor(lookup)` et `pathsFor(lookups)`. **Ne jette jamais.**
- **Ingestion** : `pnpm --filter @bellum/api ingest:market-memory <dossier> [--dry-run]`.
  Le pack vit **hors dépôt**. Prod : `railway run --service belllum-backend-service
  --environment production -- env NODE_ENV=production npx ts-node ...`.
- **Consommateurs existants, à imiter** : `cockpit-perspective.service.ts`
  (`withMarketPaths`) et `partners.service.ts` (`observedEsn`).

## Les décisions déjà tranchées — ne pas les re-poser

1. **Aucune date n'est exposable.** Ni écran, ni prompt, ni pied de réponse.
   ⚠️ Le README et `SPEC_INTEGRATION_BELLUM.md` du pack disent « observé en 2022,
   non masquable » : c'est **PÉRIMÉ**, corrigé par le catalogue des usages du
   05/09 (base 2024-2025) et par les 31 retours du 06/09.
2. **`marketPaths` vaut `null`, jamais `0`.** Une seule exception, déjà écrite
   dans le type : l'écran de désambiguïsation d'homonymes (#1586), où
   l'asymétrie « 41 / aucun » EST ce qui départage.
3. **`unavailable` n'est pas `covered: false`.** Chaque appelant choisit :
   compteur → pas de compteur ; liste → aucune ligne ; prompt → pas de bloc ;
   onglet Partenaires → pas de bloc, les deux cas rendus pareil À DESSEIN.
4. **Le fichier d'identités et de coordonnées n'entre pas.** `IMPORTABLE_FILES`
   est exhaustive et testée.
5. **Une observation n'est jamais une présence actuelle.** Elle ouvre un chemin
   rang 2 **à qualifier**, jamais un accès connu.
6. **Le champ s'appelle `market_paths`** côté cockpit — snake_case, comme tout
   le contrat.
7. **#1601 est clos en doublon de #1600** (décision de Louis).

## Le lot suivant — 14 issues, débloquées par l'ingestion

Groupées par écran, ~10 par PR, recette entre chaque.

**PR A — /accounts, la liste et la modale**
`#1575` cinquième compteur « N avec des parcours observés » (⚠️ lire `isError`,
pas `Array.isArray` — sur une panne, PAS de compteur) · `#1577` fragment
« · 41 parcours observés » sous le nom, ligne ET carte · `#1582` indicateur
« Contexte marché » en popover, 3 lignes max · `#1586` fait de
désambiguïsation — **c'est l'écran où `0` est vrai**, et l'exception doit rester
écrite en commentaire · `#1576` quatrième et cinquième raisons de similarité.

**PR B — /search et le dossier**
`#1589` seconde moitié (preview mémoire marché avant tout débit, 4 observations
max, vocabulaire Observé/Inconnu/Non couvert, 0 crédit) · `#1593` ranking des
premiers comptes suggérés · `#1591` focus recommandé = Profil ESN × mémoire
(⚠️ la mémoire aide à CLASSER, elle ne décide jamais ce que l'ESN vend) ·
`#1592` périmètre conseillé · `#1584` bloc « Ce que Bellum sait déjà ».

**PR C — Laura et le tableau de bord**
`#1596` architecture d'outils : enrichir les outils existants, **une seule**
primitive nouvelle `search_market_memory` si nécessaire, seuil serveur non
contrôlable par Laura · `#1573`, `#1574` cockpit et opportunités à réveiller ·
`#1581` priorisation.

**PR D — le prompt d'analyse**
`#1590` quatrième bloc de `phase1_research.py`, additif et silencieux, avec le
second bloc « CE QUE CETTE MÉMOIRE NE DIT PAS » **écrit en dur** ; et `origin`
sur `esn_presence.py` (observée + détectée → certitude montée ; divergence →
les deux).

## Ce qui reste ouvert, et pourquoi

- **#1579** — les deux moitiés sont livrées, mais la colonne Accessibilité de
  `/accounts` ne LIT toujours pas `raw_analysis.addressability` : la donnée est
  écrite, le lecteur manque. À brancher dans `account-access` + `account-detail`,
  et ajouter alors le champ au contrat TS **et** le classer dans `demo-coverage.ts`.
- **#1589**, **#1593** — moitiés commentées, débloquées.
- **#1417 / #1440 / #1472** — le même point depuis le 03/09 : « se rapprocher
  des maquettes ». **Le Drive ne contenait que le corpus, aucune maquette.** Il
  faut soit un écran de référence nommé par Louis, soit les maquettes.
- Le vocabulaire « en place / travaille chez » subsiste hors du lot Laura :
  2 handlers de `chat_tools.py`, 11 prompts du pipeline (`bellum_plan`,
  `bellum_strategy`, `bellum_messages`, `bellum_signals`…), la carte « ESN déjà
  en place » du dossier compte et ses traductions. Inventaire complet dans la PR
  #1690.

## Les pièges payés dans ce lot — ne pas les repayer

- ⚠️ **Une machine saturée rend des faux rouges.** Trois agents en parallèle :
  suite API de **82 s à 1 969 s**, **10 rouges dont zéro réel**. Jamais deux
  suites lourdes ensemble ; une durée × 20 est un verdict sur la machine.
- ⚠️ **`renderWithRouter` partage un `QueryClient` de MODULE** — son commentaire
  promet l'inverse. Le cache survit d'un test à l'autre : un identifiant distinct
  par test, sinon le test négatif lit la réponse du précédent et passe au vert
  sans rien mesurer.
- ⚠️ **Les horodatages de migration sont EN AVANCE sur l'horloge.** `Date.now()`
  rangerait une migration AVANT des migrations déjà déployées. Prendre le dernier
  du dossier et ajouter un delta non rond (les ronds sont refusés par une garde).
- ⚠️ **Recetter avant que Vercel ET Railway servent le commit invente des
  pannes.** Vu deux fois : un libellé « pas déployé » qui l'était, et une erreur
  console qui venait de l'ANCIEN bundle cherchant sa mise à jour.
- ⚠️ **Mesurer, ne pas lire.** Un DOM lu avant la refetch annonçait 25 lignes
  filtrées au lieu de 20.
- Un import relatif sans `.js` dans `packages/contracts` passe vitest et casse
  sous node.
- Une table PARTAGÉE n'entre pas dans `DEMO_INTENTIONALLY_EMPTY` : ce registre
  exige que la table soit purgée entre deux visites de démo.
