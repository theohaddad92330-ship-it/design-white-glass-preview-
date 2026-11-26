# Reprise — retours bêta, après le lot « couverture du portefeuille » du 08/09/2026

Coller ce fichier en entier dans une session neuve. Il remplace
`issues-reprise-2026-09-08.md` (du matin), qui ne porte plus le bon « reste ».

Le diagnostic complet des 73 issues reste dans
`.claude/notes/issues-vague-2026-09-07.md` — **ne pas le refaire**, seulement
re-vérifier dans le code.

## 1. Ce qui est TRANCHÉ — à ne pas reposer

### Les quatre arbitrages de Louis du 08/09 (`decisions-louis-2026-09-08.md`)

1. **Mémoire marché : TOUT BRANCHER.** #1622.5 est LEVÉ. → **fait pour #1633 et
   #1635** ; #1634 reste bloqué par une MESURE, pas par un arbitrage (§4).
2. **Recette du back-office : Louis la fait lui-même.** Ne PAS monter de relais.
3. **`/pilotage` : #1439 TIENT, #1440.1 et #1440.6 écartés.** Reste **#1440.4**.
4. **Traceur `/produit` : BLOQUÉ** jusqu'à la relecture juridique RGPD (#1681.6).
   #1682, #1683, #1684, #1685, #1687, #1688 — **ne pas y toucher**.

### Ce qui reste vrai du 07/09

- **REFUS** : hiérarchie de résolution à 5 échelons (#1603.6, #1617.2) — le
  corpus n'en porte que deux ; export CSV du back-office (#1672.5).
- **Défauts retenus faute d'arbitre** : #1639 pas livré (facturation) ·
  #1613.2/#1640 le score d'externalisation ne s'affiche pas (GA-257) ·
  #1575.2 un compteur à 0 reste non cliquable (#1580) · #1605.7 seuil ESN à 2 ·
  #1603.2/#1616.2 on ne renomme pas 4 tables de prod.

### Tranché dans CE lot (08/09 après-midi)

- **L'agrégat de couverture du portefeuille vit dans `MarketMemoryService.portfolioFor`**,
  exposé par **UNE** route, `GET /accounts/market-memory-portfolio`, lue par une
  **seule** clé de cache web (`['market-memory','portfolio']`). Trois écrans, un
  calcul. Ne pas en créer un second : GA-258 le refuse côté API.
- **Le dénominateur est la population de `GET /accounts`**, cloisonnement
  compris (`AccountsService.listPortfolioLookups`, même `portfolioScopeFor`).
  C'est la leçon de #1408 — deux écrans qui comptaient deux choses sous le même
  mot. Ne jamais recalculer cette population ailleurs.
- **#1633.1 « corrections workspace » est ÉCARTÉ**, écrit dans l'issue : rien
  n'enregistre une correction de mémoire marché, et c'est voulu (la mémoire est
  PARTAGÉE entre espaces concurrents). Le monter demanderait d'abord une table
  de correction d'espace qui PRIME à la lecture — patron existant :
  `account_partners.dismissed_at`. C'est un lot à soi.
- **#1635.4 : le nombre oui, la gradation « forte » NON.** Elle exigerait une
  normalisation par cohorte — la même question ouverte que
  `MARKET_MEMORY_SCORING_ENABLED = false`. Ne pas la re-proposer sans la cohorte.
- **Numéros de garde** : GA-259 est PRIS (`market-coverage-is-not-outsourcing.test.ts`).
  **Le prochain libre est GA-260.**
- **Registre de doctrine** : `c65_couverture_nest_pas_un_fait_de_marche` ajouté.
  Prochaine clé libre : `c66_*`.

## 2. Ce qui est MERGÉ — état à vérifier au démarrage

### ⚠️ LE DÉPLOIEMENT WEB NE PART PAS TOUJOURS TOUT SEUL — vérifié le 08/09

Le merge de la PR #1750 (`bd8553f7d`) n'a déclenché **AUCUN déploiement Vercel** :
ni erreur, ni « skipped », juste une absence. L'API était à jour, le web servait le
commit d'avant. Ce qui a permis de le DIRE au lieu d'attendre : les trois merges
précédents avaient déployé en **+2 min chacun** (mesuré via
`gh api .../deployments`). Débloqué à la main : console Vercel → projet
`bellum-web` → ⋯ → **Create Deployment** → brancher `main` → *Deploy to Production*.
« Redeploy » sur une ligne existante rejoue SON commit, pas le nouveau.

**À faire à chaque merge désormais** : vérifier que `Production – bellum-web`
apparaît pour le commit de merge. S'il manque au bout de 5 min, il ne viendra pas.

- **PR #1745, #1747 (`735bec695`), #1748 (`2463af04d`)** — recettées le 08/09.
- **Le lot « couverture du portefeuille »** (#1633, #1635 ; #1634 diagnostiqué) :
  état à relire dans le tracker / la PR au démarrage — s'il est mergé, **la
  recette live reste à faire ou à confirmer** (§3).

**Recette faite le 08/09 sur `app.bellum-ai.com`** (espace de démonstration, corpus de
production). Verdict : **PASS**, avec deux défauts trouvés à l'écran et corrigés par la
PR #1751 — « 1 non résolus » (accords multiples impossibles en i18next) et `Completeness`
employé à contresens (il dit sur quoi on a CALCULÉ, pas ce qu'on a TROUVÉ).

Le contrôle qui compte : la liste de comptes rend `market_paths_observed` sur 4 comptes,
exactement le `covered: 4` de l'agrégat — le refactor de `pathsFor` n'a pas fait diverger
les deux lectures (#1621 mesuré en production).

**#1633 et #1635 sont CLOSES** le 08/09, après recette en production (`e58d0f92f`),
chacune avec ce qui a été écarté écrit dans le commentaire de clôture. **#1634 reste
OUVERTE** : elle attend une MESURE, pas un arbitrage (§4).

⚠️ **Un point n'a PAS pu être vérifié de visu** : le fit structurel avec des expertises
DÉCLARÉES. L'espace de démonstration n'en a aucune, donc l'écran montre l'état « non
déclaré » — qui est la bonne réponse, mais l'autre branche n'est couverte que par les
tests. À regarder sur l'espace de Louis.

## 3. Ce qui n'a JAMAIS pu être vérifié — nommé, jamais compté comme fait

- **Toute la recette du back-office.** `belllum-monorepo-dashboard-manager.vercel.app`
  rend 401 Basic Auth et le middleware passe **avant** le routage : un 401 ne
  prouve rien. **#1643, #1655, #1656, #1669** entièrement livrées, ouvertes pour
  ce seul motif. Louis rend le PASS.
- **La couverture mémoire marché en DÉMO n'est pas semée, et ne doit pas l'être.**
  Les quatre tables `market_*` sont PARTAGÉES entre espaces concurrents : y semer
  des lignes injecterait de la donnée inventée dans le corpus que lisent de vrais
  clients. GA-258 rend le geste impossible, et la raison est écrite dans
  `demo-coverage.ts`. **Conséquence pour la recette** : le bloc dit la vérité sur
  les comptes réels de la salle de démonstration — s'il affiche « 0 couvert »,
  c'est une INFORMATION sur le corpus, pas un trou de semis. À vérifier de ses
  yeux avant de conclure quoi que ce soit.
- **La contradiction de la vue d'ensemble d'un compte** (« Analyse le 7 septembre »
  contre « Dossier pas encore analysé », 40 px plus bas) n'est **toujours pas
  corrigée**, et le pourquoi tient toujours : `last_analyzed_at` vaut `null` en
  production. **Vérifier D'ABORD si les comptes réels de Louis ont des lignes
  `analysis_runs`** — si oui c'est un défaut de démo, si non un défaut de prod.
  Détail complet dans `issues-reprise-2026-09-08.md` §3.

## 4. Ce qui RESTE, avec le découpage

| Lot | Issues | Pourquoi maintenant |
| --- | ------ | ------------------- |
| **La preview mémoire marché pré-compte de `/search`** | #1589.2, #1591.1, #1592.2, #1593.2 | quatre demandes, **un seul** manque racine : aucun endpoint n'expose `coverageFor()` avant la création d'un compte. Le patron est maintenant écrit (`portfolioFor` + sa route) — c'est le lot le moins cher du reste |
| Le 5ᵉ compteur « parcours observés » de `/accounts` | #1575.1, #1575.3 | petit, isolé |
| `/pilotage` | **#1440.4 seulement** | chaque indicateur ouvre sa source, sa période, son dénominateur, sa dernière mise à jour |
| Le reste du dossier de compte | #1603→#1613, #1630→#1632, #1638 | gros, à découper **par onglet** |
| **#1634 — le territoire** | #1634 | ⛔ **attend une MESURE, pas un arbitrage** : le taux de remplissage réel de `market_company_signal.city` / `.region` sur les 60 067 lignes de production. Si le corpus les laisse majoritairement à `null`, la colonne « contexte structurel » n'a pas de matière et l'issue tombe. **C'est le premier geste du lot, avant toute ligne de code.** |
| Le traceur `/produit` | #1682 → #1683, #1684, #1685, #1687, #1688 | ⛔ BLOQUÉ — relecture juridique |
| `/billing` | #1639 | ⛔ arrêt obligatoire (facturation) |

**Ce que #1608 attend encore** : l'agrégation par niveau géographique dans
`RegionDistributionCard`, et la gradation « forte » — même question de cohorte
que `externalization_score` et que #1635.4.

⚠️ **Piège relevé pour #1634** : `RegionDistributionCard` affiche un
**pourcentage**, c'est-à-dire exactement le ratio unique que #1634 interdit. Ne
pas le réutiliser tel quel.

## 5. Les pièges d'outillage payés dans CE lot — à ne pas repayer

- ⚠️⚠️ **Un bloc partagé qui teste la panne NOMMÉE fait tomber l'écran HÔTE.**
  `data.status === 'unavailable'` laissait passer toute autre forme, puis lisait
  `data.coverage.accounts` sur un objet sans `coverage` : **20 tests de
  `DataQuality` et 7 de `MarketWatch`** sont tombés, et aucun test du bloc
  lui-même. La forme juste est `data.status !== 'ok'`. Ce n'est pas un artefact
  de test : c'est la fenêtre de déploiement (web en 1 min, API en plusieurs).
- ⚠️ **Une garde qui ancre une position ABSOLUE refuse ce qu'elle protège.**
  GA-241 vérifiait « `c64` est la DERNIÈRE clé » alors que GA-08 porte sur un
  ORDRE (« aucune insertion au milieu »). Une clé parfaitement légitime,
  appendée, la faisait rougir — et le seul geste qui la calme est de réécrire
  l'assertion, donc de ne plus rien garder. Vérifier l'INVARIANT, pas la place.
- ⚠️ **Un filtre par LONGUEUR ne distingue pas un mot court d'un NOM court.**
  Le rapprochement d'expertises jetait `C#` et `Go` pour attraper « et » et
  « de ». Une liste de mots vides se relit ; un plancher de trois lettres, non.
- ⚠️ **`useMocker(() => ({}))` remplit les dépendances `@Optional()`** : un test
  « la dépendance est absente » passait au vert sans que la branche testée soit
  jamais prise. Une dépendance absente se déclare `useValue: undefined`.
- ⚠️ **`renderWithRouter` monte le routeur de façon ASYNCHRONE.** `getByText`
  juste après ne trouve rien — et un test qui cherche une ABSENCE serait vert
  sans que le composant ait été rendu. Passer par `findBy*`, et vérifier une
  absence seulement APRÈS avoir attendu une présence.
- ⚠️ **Le `Link` de TanStack exige un routeur monté** (`Cannot read properties of
  null (reading 'isServer')` sinon).
- ⚠️ **`grep --include='*.ts'` NON QUOTÉ meurt sous zsh** (`no matches found`)
  et rend `rc=0` — un faux zéro parfait. Toujours quoter.
- ⚠️ **Le typecheck de l'API lit les SOURCES des contracts, la suite web lit leur
  `dist/`.** `tsc` était vert pendant que `dist` ignorait les nouveaux types.
  **Reconstruire `@bellum/contracts` après CHAQUE édition du paquet**, avant
  toute suite web.
- ⚠️ **Deux suites lourdes en même temps rendent des faux rouges** : la suite web
  lancée pendant deux passes de contracts a mis `setup 759 s` (contre ~80 s
  seule). Une durée anormale est un avertissement, pas un verdict.
- **`tail -12` sur une sortie de suite emporte la liste des échecs.** Filtrer
  (`grep -E "×|→ |Tests |Test Files"`) plutôt que couper.
- ⚠️⚠️ **Une sonde qui greppe le bundle d'ENTRÉE ne verra jamais le code d'un écran.**
  Les routes sont en morceaux chargés à la demande ; l'i18n et les contrats, eux, SONT
  dans le bundle d'entrée. D'où un signal trompeur : les traductions du lot étaient
  présentes, le composant absent, les deux lus sur le même fichier. **Le seul test qui
  vaut est l'ÉCRAN.** Si une sonde automatique est nécessaire, l'ancrer sur une clé i18n
  ou une constante de contrat, jamais sur du code d'écran.
- ⚠️ **`Completeness` dit sur quoi on a CALCULÉ, pas ce qu'on a TROUVÉ.** La question qui
  tranche : *si ce nombre baisse, ai-je moins LU ou trouvé moins ?* GA-71 exige le
  montage, elle ne peut pas vérifier qu'il a du sens.
- ⚠️ **i18next n'accorde que sur `count`** : trois nombres dans une phrase ne peuvent pas
  s'accorder chacun. Une phrase à accords multiples n'est pas traduisible — c'est le
  libellé qu'il faut changer.
