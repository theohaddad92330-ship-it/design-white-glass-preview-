# Reprise — retours bêta, après le lot « preview mémoire marché de /search » du 08/09/2026

Coller ce fichier en entier dans une session neuve. Il **remplace**
`issues-reprise-2026-09-08-soir.md`, dont le « reste » a bougé.

Le diagnostic complet des 73 issues reste dans `.claude/notes/issues-vague-2026-09-07.md`
— **ne pas le refaire**, seulement re-vérifier dans le code.

## 1. Ce qui est TRANCHÉ — à ne pas reposer

Tout le §1 de `issues-reprise-2026-09-08-soir.md` **tient toujours** : les quatre
arbitrages de Louis du 08/09 (`decisions-louis-2026-09-08.md`), les refus du
07/09, les défauts retenus faute d'arbitre. **Le relire, ne pas le reposer.**

### Tranché dans CE lot (08/09, nuit)

- **`matchingExpertises` vit dans `@bellum/contracts`**, plus dans `apps/api`.
  Le fit structurel du portefeuille (#1635.4) et le « Focus recommandé » de
  `/search` (#1591.1) sont le MÊME appariement. `stackMatchesExpertises` en est
  désormais un cas particulier. **Ne jamais en écrire un second côté web** :
  c'est là que `C#` et `Go` se refont jeter comme des mots courts.
- **La preview pré-compte est `GET /companies/market-preview`**, composée dans
  `CompaniesController` (GA-07 nomme cet endroit). Le départage des chips est
  `GET /companies/market-paths`, une lecture GROUPÉE (`pathsFor`), jamais une
  par chip.
- **`MarketPreview` est une forme RÉDUITE, et c'est le `.strip()` du contrat qui
  tient les quatre interdits de #1589.2** (nom d'ESN, comptage par techno, zone,
  date). Ne pas « enrichir » ce contrat sans relire pourquoi il est pauvre.
- **#1592.2 « Périmètre conseillé : Filiales » est ÉCARTÉ**, écrit dans l'issue :
  le corpus ne porte aucun rattachement juridique. Ne pas le re-proposer sans la
  donnée qui manque (rattachement des établissements observés à leur entité).
- **#1593.2 : la raison affichée est « Recours externe observé sur ce compte »**,
  pas « Data / Cloud compatibles · … ». La version riche demanderait une lecture
  complète PAR chip. Corrigé publiquement dans l'issue.
- **⚠️ Le SIREN de #1589.2 n'est PAS dans le contrat, et c'est mesuré** :
  `market_company_signal` n'en porte pas (son rapprochement fort est
  `website_domain`), `CompanySuggestion` ne porte pas de site web. Les deux
  identités fortes n'existent d'aucun côté de la jointure à cet instant.
- **Numéros de garde** : aucun posé dans ce lot. **Le prochain libre reste GA-260.**
- **Registre de doctrine** : aucune clé ajoutée. Prochaine libre : `c66_*`.

## 2. Ce qui est MERGÉ — état à vérifier au démarrage

- **PR #1753** (`feature/search-market-preview`, merge `a16d8c6ea`) — #1589.2,
  #1591.1, #1592.2, #1593.2. **RECETTÉE en production le 08/09** : verdict PASS.
- **PR #1755** (`fix/preview-famille-de-roles-autre`, merge `5b7a8a398`) — le
  défaut trouvé À LA RECETTE (« Autre » premier sur les cinq entreprises
  testées). **Sa propre recette reste à confirmer** : vérifier que la ligne
  « Familles de rôles » d'ORANGE commence désormais par « Chef de projet ».
- **PR #1754** — cette note. Documentation seule.

### Ce que la recette du 08/09 a PROUVÉ en production

| Point | Preuve |
| --- | --- |
| #1589.2 | Bloc « Ce que Bellum sait déjà » rendu sur ORANGE : Observé · `java · sql · gestion de projet` · Plusieurs liens observés · familles de rôles · « ne coûte aucun crédit » |
| #1589.2 (interdits) | Aucun nom d'ESN, aucun comptage, aucune zone, aucune date à l'écran |
| #1593.2 | `market-paths` rend SG 267 · Orange 259 · SNCF 135 · AXA `null` ; les trois couvertes portent « Recours externe observé sur ce compte », AXA garde « Correspond à ta cible déclarée » et reste en dernier |
| Non-régression | Les 10 entrées de navigation balayées une par une, plus `/pilotage/qualite` et `/pilotage/marche` — le bloc de couverture du 07-08/09 est intact (4+1+0+1 = 6) |
| Thèmes | Contraste MESURÉ sur le bloc : min **5,24:1** en sombre, **5,28:1** en clair (AA ≥ 4,5). Tailles 12 et 14 px |
| Console / réseau | 21 appels API, **zéro 4xx/5xx**, zéro erreur console |
- ⚠️ **LE DÉPLOIEMENT WEB NE PART PAS TOUJOURS TOUT SEUL** (vérifié le 08/09) :
  le merge de la PR #1750 n'a déclenché AUCUN déploiement Vercel — ni erreur, ni
  « skipped », juste une absence. **À chaque merge** : vérifier que
  `Production – bellum-web` apparaît pour le commit de merge
  (`gh api repos/Bellum-AI/belllum-monorepo/deployments`). Absent au bout de
  5 min ⇒ il ne viendra pas. Débloquer à la main : console Vercel → projet
  `bellum-web` → ⋯ → **Create Deployment** → brancher `main` → *Deploy to
  Production*. « Redeploy » sur une ligne existante rejoue SON commit.

## 3. Ce qui n'a JAMAIS pu être vérifié

Les trois points du §3 de la note du soir **tiennent tous** :
- toute la recette du back-office (401 Basic Auth ; **Louis la fait lui-même**) ;
- la couverture mémoire marché **n'est pas semée en démo, et ne doit pas l'être**
  (les quatre tables `market_*` sont PARTAGÉES entre espaces concurrents) ;
- la contradiction de la vue d'ensemble d'un compte (`last_analyzed_at` à `null`).

### Ce qui s'ajoute avec CE lot

- ⛔ **#1591.1 et #1592.2 restent NON VÉRIFIÉS en production.** Mesuré :
  `GET /esn-profile` de l'espace de démonstration rend `expertise_areas: []` et
  `offer_domains: []`. Sans expertise déclarée, `focusSuggestions` ne marque
  rien et `scopeAdvice` rend `null` — c'est le comportement JUSTE, et il est
  indiscernable d'un branchement absent depuis l'écran. **Les deux ne se
  recettent que sur l'espace de Louis**, avec des expertises saisies. Ne pas les
  compter comme faits.
- **La preview ne se recette que sur une entreprise que le corpus COUVRE.**
  Utiliser **ORANGE** (259 parcours) : c'est le cas prouvé le 08/09.

## 4. Ce qui RESTE, avec le découpage

| Lot | Issues | Pourquoi maintenant |
| --- | ------ | ------------------- |
| **5ᵉ compteur « parcours observés » de `/accounts`** | #1575.1, #1575.3 | petit, isolé — mais **lire le piège du §5 avant de coder** |
| `/pilotage` | **#1440.4 seulement** | chaque indicateur ouvre sa source, sa période, son dénominateur, sa dernière mise à jour |
| Le reste du dossier de compte | #1603→#1613, #1630→#1632, #1638 | gros, à découper **par onglet** |
| **#1634 — le territoire** | #1634 | ⛔ **attend une MESURE, pas un arbitrage** : le taux de remplissage réel de `market_company_signal.city` / `.region` sur les 60 067 lignes de production. Si le corpus les laisse majoritairement à `null`, la colonne « contexte structurel » n'a pas de matière et l'issue tombe. **Premier geste du lot, avant toute ligne de code.** |
| Le traceur `/produit` | #1682 → #1683, #1684, #1685, #1687, #1688 | ⛔ BLOQUÉ — relecture juridique RGPD |
| `/billing` | #1639 | ⛔ arrêt obligatoire (facturation) |

⚠️ **Piège relevé pour #1634** : `RegionDistributionCard` affiche un
**pourcentage**, c'est-à-dire exactement le ratio unique que #1634 interdit.

## 4 bis. ⚠️⚠️ TROUVÉ À LA RECETTE — le nom du REGISTRE ne matche pas le corpus

**Le défaut le plus important de la journée, et il n'appartient pas à ce lot.**

Sur `/search`, choisir « SG SOCIETE GENERALE » dans l'autocomplétion rend
« Bellum n'a pas suffisamment d'observations marché sur ce compte » — alors que
le corpus connaît « SOCIETE GENERALE » avec **267 parcours observés**. Mesuré :

```
GET /companies/market-preview?name=SG SOCIETE GENERALE  → { preview: null }
GET /companies/market-preview?name=SOCIETE GENERALE     → { paths_observed: 267, … }
```

**La cause** : le corpus est indexé sur SON libellé, le registre INSEE sur la
raison sociale. `marketMatchKey` normalise la casse et les accents, pas un
préfixe ni un suffixe. Ça marche quand les deux coïncident (ORANGE → 259,
SNCF RESEAU → 64, SNCF VOYAGEURS → 33) et ça échoue sinon
(« SG SOCIETE GENERALE », « SOCIETE NATIONALE SNCF »).

⚠️ **Ce n'est PAS un défaut du lot #1589 — c'est #1586 qui le porte depuis le
06/09**, et personne ne l'avait vu : `withMarketPaths` passe le même nom de
registre. Sur la requête « societe generale », les CINQ lignes de
l'autocomplétion rendent `marketPaths: null`, donc la désambiguïsation ne
départage rien sur ce groupe.

**Ce qu'on ne fait PAS** : ajouter un repli sur le texte tapé par l'utilisateur,
ni retirer les mots courts en tête. Les deux devinent, et un mauvais
rapprochement colle la mémoire d'un compte sur un autre — pire qu'une absence.

**Ce que ça demande** : soit une passe d'alias sur le corpus, soit un
rapprochement par DOMAINE (le rapprochement fort de `market_company_signal`),
qui exigerait que `CompanySuggestion` porte un site web — il n'en porte pas.
**C'est un lot à soi, et il vaut probablement plus que le reste du backlog
`/search`** : il commande combien de comptes voient leur mémoire marché.

## 5. ⚠️ Le piège du 5ᵉ compteur — diagnostiqué, pas encore livré

**Le NOMBRE est gratuit.** `MarketPortfolioCoverage.covered` (`GET /accounts/market-memory-portfolio`,
lu par `useMarketMemoryPortfolio()`) compte déjà exactement « les comptes du
portefeuille couverts avec ≥ 3 parcours observés » — `MARKET_MEMORY_MIN_PATHS`
vaut 3, et le dénominateur est **la même population que `GET /accounts`**
(`listPortfolioLookups` / `portfolioScopeFor`). Une route, une clé de cache,
quatre écrans. **Ne pas en créer un second** : GA-258 le refuse côté API.

**#1575.3 est direct** : lire `status !== 'ok'` (jamais `=== 'unavailable'`) et
ne rendre AUCUN compteur — pas un « 0 ».

**#1575.2 est ÉCARTÉ** : un compteur à 0 reste NON cliquable — #1580 l'a tranché
et `AccountsCountersBand.tsx` le documente. L'issue affirme l'inverse du code.

⚠️ **LE CLIC QUI FILTRE EST LE POINT COÛTEUX, et il n'est pas résolu.**
`HEADLINE_FILTER_PREDICATE` (`accounts.service.ts:252`) est du **SQL**, et la
couverture marché n'est pas une expression SQL : c'est l'arbitrage
`resolveMarketCompany`, en TypeScript, sur les tables d'un AUTRE module (GA-07
au plafond). Un filtre côté client mentirait dès la 2ᵉ page — le défaut exact
que `AccountsCountersBand.tsx` documente en tête de fichier.

Le chemin le moins cher, à valider avant de coder : **`portfolioFor` connaît
déjà les comptes couverts** (elle construit `coveredKeys` en interne). Lui faire
rendre AUSSI les `lookup.ref` couverts coûte trois lignes ; le contrôleur peut
alors passer cette liste d'identifiants comme filtre au service. Reste à
vérifier que `AccountsService.list` accepte un filtre par liste d'identifiants —
**il ne l'accepte pas aujourd'hui** (`grep -n "accountIds" accounts.service.ts`
ne rend que `resolveLastAnalyzedByAccount`). C'est le vrai coût du lot.

## 6. Les pièges d'outillage payés dans CE lot

- ⚠️ **GA-252 refuse « Bellum » écrit en toutes lettres dans une traduction.**
  Six libellés attrapés. Le produit est renommable (marque blanche P2) :
  `{{brand}}` pour le produit, `{{copilot}}` pour Laura — i18next les fournit à
  TOUTE clé par `defaultVariables`, il n'y a rien à passer à `t()`.
- ⚠️ **`pnpm lint:exports:types` est en CASCADE, et il l'a encore été** : quatre
  types signalés, puis un, puis un. **Le relancer JUSQU'AU VERT**, pas une fois.
  Un type qui n'est consommé que dans son fichier ne s'exporte pas — même quand
  il est le type de retour d'une fonction exportée.
- ⚠️ **TypeScript infère un générique depuis sa CONTRAINTE quand un callback
  participe à l'inférence.** `topObserved<T extends { persons: number }>(rows, row => row.techno)`
  a rendu « Property 'techno' does not exist on type '{ persons: number }' » —
  et le typecheck de l'API le voit là où celui du web ne passait pas.
  Contourné en aplatissant à `{ label, persons }` avant l'appel.
- ⚠️ **`ls` rend du VIDE dans ce bac à sable.** `/usr/bin/find` pour lister.
- ⚠️ **Une commande dont la sortie passe par `head` rend `rc=0`** même quand le
  binaire a échoué (le `$?` est celui de `head`). Rediriger dans un fichier,
  lire `rc=$?` immédiatement, puis filtrer.
- ⚠️ **`node node_modules/typescript/bin/tsc` n'existe pas à la racine** — le
  binaire est dans `apps/web/node_modules`. Un chemin faux + un `head` donnent
  un « rc=0 » parfaitement trompeur.
- ⚠️ **Une TRONCATURE exige un ORDRE.** `market_company_signal.role_families` est
  une colonne `jsonb` qui garde l'ordre du CORPUS (`parseRoleFamilies` ne trie
  pas), contrairement à `market_company_stack` qui sort trié. Trois éléments
  « les plus observés » pris sans trier auraient été trois éléments au hasard.

- ⚠️ **La casse du corpus est mélangée à l'écran** : les technologies sortent en
  minuscules (`java · sql · gestion de projet`), les familles de rôles
  capitalisées (`Chef de projet · Data / IA`) — dans la même carte, à deux
  lignes d'écart. Non corrigé : une capitalisation naïve donne « Sql », et la
  casse canonique d'un vocabulaire technique (`SQL`, `Java`, `iOS`, `C#`)
  demande une table de libellés. La deviner serait une invention. Lot à soi,
  côté corpus.
- ⚠️ **Le service IA était 119 commits en retard** au moment de la recette
  (`cbe8cd335`, PR #1717). Sans effet sur ce lot (zéro fichier `apps/ia`), mais
  la porte « TOUS les commits servis sont les miens » ne peut pas se franchir
  telle quelle tant que ça dure. **À signaler à Louis.**
- ⚠️ **Le déploiement Vercel du web n'est PAS parti tout seul** au merge de
  `a16d8c6ea` : absent à T+1 min, arrivé à T+2,5 min. Le seuil de 5 minutes de
  la note du 08/09 au soir tient — mais il faut le VÉRIFIER à chaque merge,
  pas le supposer.
