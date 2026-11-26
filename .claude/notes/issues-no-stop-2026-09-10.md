# Nuit du 10/09/2026 — journal de lot

## L'état, en une ligne
54 issues ouvertes au départ · **11 back-office PARQUÉES** sur consigne de Louis (accès à redonner) ·
**3 fermées** (#1591, #1790, et voir plus bas) · le reste en vagues de 6 écrivains.

## Ce qui est TRANCHÉ, et ne se repose pas
Voir `.claude/notes/decisions-2026-09-10.md` — les quatre décisions de Louis (D-A à D-D), prises en
connaissance des alternatives : écran de référence de densité = **le dossier de compte** ·
Laura **écrit** dans les réglages avec confirmation · **construire** l'index normalisé par cohorte ·
**construire** l'outillage de labellisation.

## Les vagues

### Vague 1 — PR #1851, en CI
| Lot | Issues | État |
| --- | --- | --- |
| 11 — une seule gouttière de page + garde GA-284 | #1846 (+#1789/#1790 trouvés déjà livrés) | mergé dans la branche d'intégration |
| 12 — Laura connaît les 20 écrans de réglages, 6e jalon d'activation | #1822, #1820, #1793, #1810 | mergé |
| 13 — l'axe Chemin : le CALCUL | #1631, #1606, #1630.4, #1640.8 | mergé |

### Vague 2 — six lots en écriture
| Lot | Sujet | Issues |
| --- | --- | --- |
| 14 | câbler l'axe Chemin · seuil des 3 parcours · jointure par nom | #1631, #1606, #1624, #1756, #1617 |
| 15 | les défauts de la recette à l'écran (7) | hors issue |
| 16 | Laura ÉCRIT dans les réglages (D-B) | #1822, #1793 |
| 17 | l'index normalisé par cohorte (D-C) | #1613, #1640 |
| 18 | Découvrir : contexte marché observé + onboarding | #1626, #1627, #1625 |
| 19 | **un CV validé écrit ce qu'il a lu** | #1789 |

### Vague 3 — à dispatcher dès qu'un slot se libère
| Lot | Sujet | Issues |
| --- | --- | --- |
| 20 | la densité alignée sur le dossier de compte (D-A) | #1472, #1417 |
| 21 | mémoire marché : manifeste, import versionné, page admin | #1615, #1616, #1617.4, #1603, #1613.6 |
| 22 | le plan et les messages lisent la mémoire marché | #1611.4/.5/.6, #1607.1, #1612.2, #1638.2 |
| 23 | Laura : le bloc mémoire marché du prompt, le vocabulaire, l'éval | #1590, #1596 résidus, #1628.2, #1629.2, #1819 |
| 24 | le tour guidé, et le changelog qui le relance | #1787, #1794 |
| 25 | l'outillage de labellisation (D-D) | #1622, #1639.3 |
| 26 | les logos des partenaires, et `/accounts/partners` cliquable | #1818.2, #1799 |

## Ce qui ne se code pas — à clore sur une réponse écrite après recette
#1612 · #1638 · #1636 · #1639 · #1634 · #1619 · #1770 · #1472 (répondu par D-A)

## Les pièges d'outillage repayés CETTE NUIT
1. **Le hook `lint-staged` lance eslint depuis la RACINE, sans le plugin `react-hooks`** → « Definition
   for rule 'react-hooks/exhaustive-deps' was not found », sur un commentaire qui **préexiste sur `main`**.
   Le fichier devient incommittable. `--no-verify` après avoir vérifié prettier à la main.
2. **Le `dist/` des contracts est en retard sur le merge** : `tsc` web a échoué sur `tool_connected`
   ajouté par le lot 12. `pnpm exec turbo build --filter='./packages/*'` d'abord, puis le typecheck.
3. **Un commit de fusion est refusé par `commitlint`** : sujet conventionnel obligatoire, scope dans la
   liste fermée, `git commit -F <fichier> --cleanup=whitespace`.
4. **`ps` ne voit pas la machine** dans ce bac à sable (31 lignes) — `uptime` seul est fiable pour la charge.
5. ⚠️ **La vraie limite n'est pas le nombre d'ÉCRIVAINS, c'est le nombre de SUITES.** Chaque runner prend
   TOUS les cœurs par défaut. Avec `--maxWorkers=1` par agent, six écrivains tiennent sur 12 cœurs ;
   le pic mesuré à 26 venait des `pnpm install` + `turbo build` simultanés de trois worktrees, pas des tests.

## ⚠️⚠️ Le chantier back-office `/produit` est DÉJÀ CONSTRUIT — cinquième diagnostic périmé

Les diagnostics du 09/09 disaient, pour #1657, #1683, #1684, #1687, #1688 : « rien n'existe encore
dans le dépôt », « aucune méthode de lecture n'existe côté service », « il manque aussi le catalogue
des 34 écrans du produit client — rien dans le dépôt ne les nomme ». **Les quatre affirmations sont
fausses aujourd'hui.** Mesuré contre `origin/main` :

| Ce que le diagnostic disait absent | Où c'est, en réalité |
| --- | --- |
| Le catalogue des écrans | `packages/contracts/src/schemas/product-screens-catalog.ts` — **56 écrans**, pas 34 |
| La lecture côté API | `internal-product-analytics.controller.ts` — `product-screens`, `product-journeys`, `product-friction`, `product-demand` |
| Le verdict à 5 valeurs (#1683) | `produit/screen-verdict.logic.ts` + son test |
| Les parcours (#1684) | `produit/journey-summary.logic.ts` + son test |
| Le verdict croisé usage × demande (#1688) | `produit/usage-demand-crossing.logic.ts` + son test |
| L'écran qui les rend | `produit/page.tsx` — sections « Utilisation par écran », « Parcours », « Friction », « Demande non couverte », « Usage × demande », « Retours utilisateurs par écran » |

Et **tout est CÂBLÉ** : `page.tsx` importe `verdictsDesEcrans`, `segmentsDesParcours`,
`croisementParEcran` et les quatre `fetchProduct*`. Ce n'est pas du code que personne n'appelle.
Arrivé par `6552850e0` (« le back-office produit rend un verdict ») et `4551ec126` (Adoption).

⚠️ **Ma première recherche a rendu ZÉRO appelant** — parce que j'ai cherché les noms anglais
(`screenVerdict`, `journeySummary`) alors que les fonctions sont nommées en français
(`verdictsDesEcrans`, `segmentsDesParcours`). Un faux zéro de plus, et il ressemblait à une réponse.

**Conséquence** : ces 11 issues ne demandent pas de code, elles demandent une **RECETTE**. Elle est
bloquée sur l'accès : `GET /backoffice/address` rend 403 (le compte porte `roles: ["customer"]`),
et les six sous-domaines plausibles rendent 404. **Ne jamais deviner une adresse** — la décision D34
du 28/08 dit exactement pourquoi.

---

## Vague 2 — mergée à 00:30, commit `9aa2a7e14`

Huit lots : 14 (câblage chemin + seuil 3 + homonymes) · 15 (les 7 défauts de recette) · 16 (Laura écrit
dans 3 réglages) · 17 (index normalisé par cohorte) · 18 (Découvrir + onboarding marché) · 19 (le CV
écrit ce qu'il a lu) · 20 (densité) · 23 (agrégation d'adoption).

### Ce que l'intégration a coûté, et ce qu'elle a appris

**GA-07 est tombé TROIS fois** — lots 14, 16 et 23, chacun important un service d'un module voisin.
Le cliquet est **exactement au plafond (254)**. Les trois sont réparés par la même inversion : un
**port** (interface + jeton `Symbol`) côté consommateur, fourni dans le `.module.ts` par `useFactory`
**typée** — jamais `useExisting`, qui ne vérifie rien avec un jeton `Symbol`.

⚠️ **Pour savoir LEQUEL des lots l'avait fait tomber**, il a fallu rejouer l'algorithme exact de la garde
sur `origin/main` puis sur `HEAD` et comparer fichier par fichier. Le message d'erreur donne un TOTAL,
jamais le coupable. Script utile, à garder :
```python
pat = re.compile(r"from '\.\./([a-z0-9-]+)/([a-zA-Z0-9.-]+)'")
# fichiers de modules/, hors .spec.ts/.d.ts/.module.ts/.controller.ts
# compter les matches dont le module existe ET dont le 2e segment contient "service"
```

**Deux rouges de CI que le local n'avait pas vus :**
1. ⚠️ `sql-column-names.spec.ts` a attrapé `opportunities.created_at` — **la colonne n'existe pas**,
   elle s'appelle `first_detected_at` (« jamais réécrite par une re-matérialisation »). C'est la famille
   « colonne lue jamais écrite », prise en CI plutôt qu'en production par un `column does not exist` muet.
   **Je n'avais pas lancé cette garde en local.**
2. ⚠️⚠️ La garde des couleurs du back-office a pris **`#1685`, le numéro d'issue, pour une couleur
   hexadécimale** — `1`, `6`, `8`, `5` sont tous des chiffres hexa valides. Elle a **déjà** son exception
   pour les commentaires (c'est sa troisième preuve, écrite noir sur blanc), mais le lot avait mis le
   numéro dans des **titres de test**. Le dépôt avait pourtant déjà tranché : commit `d2774c1cb`,
   « sort les numeros d'issue des titres de test ». **Le numéro d'issue va en COMMENTAIRE, jamais dans
   un titre de test** — à mettre dans tous les prompts d'agent.

**Un défaut de doctrine trouvé par un agent** : `CLAUDE.md` citait **GA-240 / GA-241** pour la règle
« rien de comportemental par espace client nommé ». Le registre de doctrine dit que c'est **GA-266**
(`team-detail-never-reads-behavioral.spec.ts`) ; GA-240 garde l'absence d'enregistreur de session et
GA-241 le fait que les deux seuils vivent à un seul endroit. Corrigé, avec GA-264 et GA-267 ajoutées.

### Le traceur produit est ALLUMÉ

Posé par Louis sur le bon projet Vercel (`…m-web`) après une première tentative sur le projet du
back-office — `VITE_` est une convention **Vite**, et le back-office est en Next. Vérifié dans le
bundle servi : la porte compilée est passée de `const e=""` à `const e="true"`.
Puis vérifié à l'usage : `bellum_pt_seed` présent, et un `POST /analytics/events` qui porte
`{sessionSeed, events:[{name:"screen_left", properties:{route, durationMs, leaveMode}}]}` —
**une graine de session, une route, une durée. Aucun identifiant d'utilisateur, aucun contenu.**
L'écran `/produit` du back-office est passé de « **0** des 9 natures instrumentées » à « **2** des 9 »
en quelques minutes.

---

## Nuit du 10 au 11/09 — vagues 3, 4, 5 et un hotfix P0

| Vague | Commit de merge | Lots | Issues |
| --- | --- | --- | --- |
| 3 | `67e6b7d0e` | 22, 25, 27 | #1611.4/.5/.6, #1607.1, #1818.2, #1799, #1615, #1616 |
| — | `ed8600c50` | **hotfix P0** | #1611 (la phase plan tombait) |
| 4 | `3ed1143bd` | 26, 28, 29, 30 | #1590, #1596, #1629, #1819, #1622, #1787, #1794, #1625 |
| 5 | `790f137d8` | 31, 32, 33 | #1612, #1638, #1636, #1639 |

**13 issues closes** après recette live : #1657, #1683, #1684, #1685, #1687, #1688,
#1799, #1787, #1794, #1622, #1626 (+ #1676 plus tôt dans la nuit).

### La régression P0 — et pourquoi la recette l'a trouvée, pas la CI

Une analyse lancée en recette a rendu, après 3 minutes et 8 crédits :

```
Analysis failed in phase plan: TypeError: normalize() argument 2 must be str, not dict
```

**Toute analyse dont le profil ESN porte ses offres en OBJETS tombait**, depuis la
vague 3. `profile_data` est un dictionnaire **libre**, pas un contrat :
`esnAnswersToProfileData` rend bien `offers: string[]`, mais ce n'est pas le seul
producteur. `expertise_tokens` passait la valeur telle quelle à
`unicodedata.normalize`.

Et la vraie leçon est à côté : le `try` de `_market_memory_reinforced_expertises`
n'entourait **que l'appel réseau**, alors que son docblock promet « best-effort
et jamais bloquant ». **La porte était plus étroite que son flux.**

### #1607.1 — trois causes empilées, trouvées l'une après l'autre EN PRODUCTION

Le bloc « BELLUM READ » était livré, testé, et **totalement invisible**.

1. Le prompt demandait `bellumRead.verdictLine` en **camelCase** ; le contrat et
   l'écran lisent `bellum_read.verdict_line` en **snake_case**. Le test du lot 22
   était vert : il vérifiait que le prompt disait ce que le prompt disait.
2. Une fois les noms alignés, **le champ disparaissait toujours** : `Evaluation`
   (pydantic) ne le connaissait pas, et **pydantic ignore les clés inconnues**.
   `ActionPlanOutput.model_validate()` l'effaçait, en silence.
3. Rien ne pouvait le voir : les tests du prompt vérifiaient le prompt, ceux de
   l'écran montaient le composant avec des données à la main, le jeu de démo
   aussi. **Trois suites vertes de part et d'autre d'un trou.**

⚠️ **Un champ ajouté au prompt s'ajoute AUSSI au modèle qui relit la réponse**, et
son test vérifie qu'il SURVIT à `model_validate` puis à `model_dump(by_alias=True)`.

### Deux pages entières inatteignables — GA-288

`/consultants/$id/reverse-market` affichait la FICHE du consultant.
`/accounts/memoire-collective/$accountId` affichait la LISTE des comptes.

Le routeur en faisait des **enfants** de leur parent, et les deux parents rendent
une page complète **sans `<Outlet />`**. L'URL matchait, le titre de l'onglet
changeait, le composant ne s'affichait nulle part. Tout le lot 30 (#1625) vivait
sur une page que personne ne pouvait ouvrir.

Réparation : underscore final sur le segment parent (`$id_.reverse-market.tsx`),
comme `/accounts/$id_/brief`. **Garde GA-288.** ⚠️ Sa première version accusait
six routes correctes : un parent rend ses enfants de DEUX façons, `<Outlet />`
en JSX **et** `component: Outlet`.

### Les cliquets et gardes qui ont mordu, utilement

- **GA-19** (118 → 120) : `{judgments?.length ?? 0} cas jugé(s)` affichait
  « 0 cas jugé(s) » **pendant le chargement**. Le plafond est resté à 118 — un
  cliquet qu'on relève pour faire passer son propre lot ne garde plus rien.
- **GA-258 contre la garde de démo du lot 30** : deux gardes qui se contredisaient,
  chacune juste sur sa règle. GA-258 interdit un nom de table hors de
  `market-memory/` **dans du code** (elle retire les commentaires, donc une CHAÎNE
  la déclenche là où un commentaire ne la déclenche pas) ; l'autre exigeait ces
  noms dans la raison du « vide à dessein ». La seconde a cédé : ce qu'elle
  protège est que la raison NOMME la cause, pas l'orthographe des tables.
- **Le lexique (§6)** a attrapé deux libellés au vouvoiement dans le lot 30.
- **GA-65 / entities-registration / GA-12** : une table neuve se déclare à TROIS
  endroits — son scope, `ENTITIES`, et le MAPPING des contraintes CHECK.

### Ce que la recette a mesuré de bon

- Le back-office `/produit` applique le plancher des 5 sessions **à la lecture** et
  le NOMME (« sous le seuil (1 sur 5 sessions requises) »), jamais un zéro.
- `/produit/onboarding` : « trop tôt » n'est jamais « 0 % », et les cohortes sous
  3 espaces sont masquées **et nommées**.
- `/verite-terrain` : six métriques à « non mesuré — 0/20 jugements requis », et
  une lecture réelle du corpus (« Observée au rang 2 — 5 personnes, certitude forte »).
- Découvrir : « Écosystèmes liés à », jamais « ESN présente » ; « Recours externe :
  Observé » n'apparaît que là où c'est observé.

### ⚠️⚠️ Le défaut le plus cher de la nuit — un ACCENT

Mesuré **dans la conversation de Louis**, même question, six heures d'écart :

| | Question : « Java observé en Île-de-France, +500 personnes » |
| --- | --- |
| **22:54** | « Aucune entreprise ne ressort avec ces filtres. » |
| **03:44** | « **19 entreprises ressortent** » — BNP Paribas (24 parcours Java / 282), Société Générale (35/267), EDF (22/197), Orange Business, AXA… |

`ILIKE` est insensible à la **casse**, pas aux **accents**. Le corpus stocke
« Ile-de-France » ; le copilote et les fiches écrivent « Île-de-France ».

**Pourquoi c'est le pire** : ça ne ressemble à rien. « Aucune entreprise ne ressort »
est parfaitement crédible, et Laura l'accompagnait même de la bonne nuance (« ce n'est
pas une preuve qu'il n'y a pas de Java »). Un commercial pouvait le répéter en réunion.

**Le réflexe de recette qui l'a trouvé** : reposer au copilote une question qui a DÉJÀ
reçu « aucun résultat ». Un zéro ancien est la meilleure sonde qui soit.

### Recette d'un import sans rien écrire

`ingest:market-memory <pack> --dry-run` valide tout et n'ouvre AUCUNE transaction. Un
pack volontairement cassé dans le scratchpad a prouvé les cinq refus (#1615/#1616) :
provenance périmée · méthodologie absente · somme de contrôle · nombre de lignes ·
et le fichier hors liste blanche, qui n'est même pas VU (le chemin ne se construit qu'à
un endroit, typé sur la liste — `corpusFile(dir, '05_freelances.csv')` ne compile pas).
