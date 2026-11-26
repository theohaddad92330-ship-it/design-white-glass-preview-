# Lot 14 — `/settings/legal-entities` (4) + `/settings/catalogues` (4)

Colle ce texte après un `/clear`. Repartir de `origin/main` **frais**
(`git fetch origin && git checkout -b fix/<nom> origin/main`).

---

## L'état à la fin des lots 11-13

**Cinq PR mergées et recettées en production** (nuit du 05/09) :

| PR | Écran | Issues closes |
| --- | --- | --- |
| #1546 | `/actions` | #1497, #1499, #1500, #1501 |
| #1547 | `/watchlist` | #1421, #1424, #1425 |
| #1548 | `/settings/import` | #1449, #1451 |
| #1550 | `/propositions` | #1454, #1455, #1456 |
| #1549 | `/settings/mes-donnees` | (en CI à la fin de la session) |

Plus les lots 10 : #1542 `/mailbox`, #1543 + #1544 « Parcours », #1545 docs.

**Recette live faite** sur `/actions`, `/watchlist`, `/settings/import`, plus un
balayage de douze routes : aucun « Oups », aucun débordement horizontal.

### Ce qui reste OUVERT, avec sa raison écrite dans l'issue

- **#1453 `/propositions`** — ⚠️ **UNE DÉCISION T'ATTEND.** Le retour demande de
  retirer « Propositions » des onglets. `sections.ts:204` est le **SEUL** endroit
  qui pointe vers cette route : la retirer l'orpheline, et la retirer en ne
  gardant que le bouton contextuel laisse sans chemin quelqu'un dont aucun
  dossier n'est qualifié. L'onglet a donc été **renommé** « Préparer une
  proposition ». Dire si on le sort pour de bon.
- **#1422 / #1423 `/watchlist`** — la refonte visuelle de la liste, et
  « confirmé par N autres sources » (le modèle ne porte pas ce compte).
- **#1452 `/settings/import`** — le bloc « ce que ces données vont débloquer » :
  chantier, parce que la contrainte du retour (« ne promettre que les usages
  réellement branchés ») demande de vérifier chaque promesse une par une.
- **#1450 `/settings/import`**, **#1524 `/settings/mes-donnees`**, **#1498
  `/actions`** — design en dur, et traçabilité complète par ligne.
- **#1503, #1505, #1506, #1507 `/actions/chaines`** — la dérivation automatique
  et ce qui en dépend. ⚠️ **#1507.4/.5 est le chantier le plus rentable qui
  reste** : les franchissements de porte sont journalisés ET relisibles
  (`GET /decision-gates/:subject/:subjectId`), personne ne demande.

---

## Le lot suivant

- **PR 1 — `/settings/legal-entities` (4)** : #1516, #1517, #1518, #1519
- **PR 2 — `/settings/catalogues` (4)** : #1525, #1526, #1527, #1529

Restent ensuite : `/settings/mes-donnees` (3 après #1549), `/actions/sequences`
(3), `/contacts` (2), et une poignée d'isolées.

⚠️ **On RECETTE la première avant d'ouvrir la seconde.**

---

## ⚠️⚠️ LE PIÈGE QUI PAIE DEPUIS QUATRE LOTS : LA CAPACITÉ SANS PORTE

Quatre lots d'affilée, et **quatre fois encore** dans les lots 11-13 :

- `/watchlist` : les **règles d'alerte** (par secteur, par mot-clé, création et
  suppression) existaient et ne vivaient que dans Réglages › Notifications —
  invisibles depuis l'écran qu'elles gouvernent.
- `/settings/mes-donnees` : `TABLE_SCOPES` déclare l'appartenance de CHAQUE
  table et `PORTABLE_OBJECTS` dit quelles tables chaque objet emporte. Le
  périmètre par objet se DÉRIVE de deux registres existants — aucun champ neuf.
- `/actions` : `getEvidenceItems` avait un seul appelant, et la page Sécurité
  vers laquelle on voulait renvoyer **ne parle pas de journalisation**.
- `/propositions` : le studio n'avait **aucun paramètre d'URL**, donc aucune
  entrée contextuelle possible.

**La mesure, AVANT de lire les issues :**

```sh
# a. un registre du contrat que l'écran n'interroge pas
grep -rn "TABLE_SCOPES\|PORTABLE_OBJECTS\|<le_registre>" apps/web/src --include='*.tsx'
# b. une capacité qui n'a qu'UN émetteur (candidate à l'orphelinage)
grep -rn "to=\"/la_route\"\|'/la_route'" apps/web/src --include='*.tsx' | grep -v routeTree
# c. une donnée rangée dans un attribut au lieu d'un pixel
grep -rnE "title=\{[^}]*\.(label|name|question|purpose)" apps/web/src --include='*.tsx'
```

⚠️ **Avant TOUT retrait d'onglet ou de bloc, compter les émetteurs.** Si le
compte est 1, le retrait crée un orphelin — c'est arrivé sur `/propositions`,
et c'est ce qui a fait renommer plutôt que retirer.

---

## L'outillage qui a menti pendant ces trois lots — quatre pièges NEUFS

### 1. Une PR peut n'avoir AUCUNE exécution CI

PR #1549 : 7 checks verts (Vercel + Railway), **zéro job de `ci.yml`**, jamais.
`gh pr checks` affichait « Passed: 7, Failed: 0 » — vert, rassurant, et la porte
de qualité n'existait pas.

Ni un `git commit --allow-empty`, ni un `gh pr close && gh pr reopen` ne l'ont
déclenchée. **Seul un push qui change réellement des fichiers** y est arrivé.

```sh
# La seule vérification qui compte avant un merge :
gh pr checks <n> | awk -F'\t' '$1=="CI Status"{print $2}'   # vide = jamais tourné
```

### 2. Un `git checkout` pendant une suite en arrière-plan la fait tester l'AUTRE arbre

Symptôme observé : « 1 fichier en échec, **0 test rouge** », avec
`Cannot find module <un fichier neuf>`. Le pire est le cas symétrique : si
l'autre branche contient tous les fichiers, **la suite passe au vert** en ayant
testé le mauvais code.

### 3. `prettier --write` et la suite dans UNE commande = des rouges fantômes

14 tests rouges dans 2 fichiers ; relancés seuls trente secondes plus tard, sur
le même code, **54/54 verts**. La collecte lisait des fichiers en cours de
réécriture. **Formater et tester sont deux commandes.**

### 4. Le hook pre-commit rougit sur un `eslint-disable react-hooks/*` PRÉ-EXISTANT

`Definition for rule 'react-hooks/exhaustive-deps' was not found`. L'eslint
RACINE de lint-staged ne charge pas le plugin ; le lint autoritaire
(`pnpm --filter @bellum/web lint`, le job CI) rend **0 erreur**. Vérifier que le
commentaire est sur `origin/main`, lancer le lint autoritaire, puis
`--no-verify` **en écrivant la raison dans le message**.

### 5. Le conflit de changelog, à CHAQUE lot — et sa résolution naïve CASSE le fichier

Garder les deux blocs tels quels laisse une accolade en moins : les libellés
**partagent l'accolade fermante** de l'entrée suivante. Résolution déterministe :

```sh
git checkout origin/main -- packages/contracts/src/changelog/entries.ts \
  packages/contracts/src/changelog/labels.fr.ts packages/contracts/src/changelog/labels.en.ts
# puis réinsérer SON entrée en tête, et vérifier : accolades ouvrantes == fermantes
```

---

## Les gardes qui ont repris ces lots-ci

- **GA-19** (« non mesuré » n'est jamais « 0 ») a refusé `count: age ?? 0` — le
  repli était pourtant **inatteignable**. Le cliquet compte les valeurs repliées
  sur zéro, pas leur atteignabilité, et il a raison : la bonne écriture (calculer
  l'âge une fois) est plus simple.
- **knip** refuse un type exporté qui ne sert que dans son fichier.
- Un `useFirstName` ajouté fait tomber tout test qui monte l'écran sans
  `SessionProvider` / `QueryClient` : **mocker le hook**, jamais retirer l'écran
  du corpus de la garde.
- Un faux `Link` doit **recopier le `search` dans le `href`** ET **transmettre la
  ref** (`forwardRef`) — sinon `<Button asChild>` avertit, et un lien contextuel
  perd sa question.

---

## Décisions parquées — recopiées, ne pas les re-poser

- **#1453** le retrait de l'onglet « Propositions » → **à trancher** (ci-dessus).
- **Aucune valeur hexadécimale, aucune taille hors échelle.** Refusé aux lots 5
  à 13 — #1450, #1456, #1501, #1507, #1524 dans ces trois lots-ci.
- **`{{copilot}}` et `{{brand}}`, jamais « Laura » ni « Bellum » en dur** (GA-252).
- **Un prénom d'exemple vient de la salle de démo** (« Maëlle ») : `useFirstName()`,
  et la formule **se passe du prénom** quand il est inconnu.
- **Un nom d'écran vit à TROIS endroits** : le namespace i18n, `routes.json`
  (onglet du navigateur, fil d'Ariane) et `nav.json`. Payé sur « Parcours » puis
  sur « Données & exports ».
- **#1396 logos / avatars** → attendre le chantier « résolution de domaine
  vérifiée » (#1319.3, #1427, #1415). Ré-écarté sur `/mailbox` et `/actions`.
- **Q1 `/missions/board`** → tranché **(b)** : renommer « Historique », le sortir
  de « Piloter ». **PAS ENCORE FAIT.** Débloque #1376, #1380.
- **Q5 la garde GA-05 qui lit les commentaires** → tranché **(a)**. **PAS FAIT.**
- **« (client d'exemple) » reste dans le nom du compte en démo.** Écarté 3 fois.

---

## Les gates, dans l'ordre

```sh
pnpm --filter @bellum/contracts build       # ⚠️ EN PREMIER si packages/* a bougé
node apps/web/node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json
pnpm --filter @bellum/api check-types && pnpm --filter @bellum/api check-types:tests
cd apps/web && node node_modules/vitest/vitest.mjs run     # ~7 580, 4-8 min
pnpm --filter @bellum/contracts test                        # ~3 790
cd apps/api && npx jest --silent                            # lire le CODE DE RETOUR
pnpm --filter @bellum/web lint                              # ESLint — job CI à part
pnpm lint:exports:types                                     # knip
```

Puis **PR obligatoire**, merge sur **`CI Status` par son NOM** — le check Railway
`belllum-backend-service` échoue TOUJOURS sur une PR.

## Puis la recette live, non négociable

1. **Attendre que Vercel ET Railway servent le commit** (`GET /version` → `.commit` ;
   le hash de `index-*.js` doit CHANGER). Railway peut être DEUX commits en retard.
2. Reproduire le geste du client, sur l'écran de l'issue.
3. **MESURER** — compter les occurrences, lire `getBoundingClientRect()`, comparer
   `scrollWidth`/`clientWidth`, interroger l'API en direct depuis la page.
4. Balayer la navigation : `history.pushState` + `PopStateEvent`, 4 routes par
   appel, 6,5 s chacune. ⚠️ `/propositions` (pas `/proposals`) · `/agenda` n'existe pas.
   ⚠️ `/rfp` et `/propositions` à ~580 caractères, c'est leur ÉTAT VIDE normal.
5. **Ouvrir un onglet NEUF** pour comparer avec l'onglet resté ouvert : c'est ce
   geste qui a révélé le défaut du lot 10 (un champ serveur neuf lu sans garde).
6. Console + réseau : tout 4xx/5xx est un défaut. ⚠️ Le **503** sur
   `/crm/pipeline/report` est ATTENDU sur l'espace de Louis. ⚠️ Une adresse de
   CONTACT en `@gmail.com` n'est pas un nom d'éditeur.
7. **Ne clore que ce qui a été vu tourner.**
