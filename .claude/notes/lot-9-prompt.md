# Lot 9 — `/briefing` (7) + `/actions/sequences` (7)

Colle ce texte après un `/clear`. Repartir de `origin/main` **frais**
(`git fetch origin && git checkout -b fix/<nom> origin/main`).

---

## Ce qu'il faut faire

Traite avec `/issues` les retours bêta de **deux écrans**, en **deux PR** :

- **PR 1 — `/briefing` (7)** : `gh issue list --state open --label beta-feedback --search '"/briefing" in:title'`
- **PR 2 — `/actions/sequences` (7)** : idem avec `"/actions/sequences"`

⚠️ **On RECETTE la première avant d'ouvrir la seconde.**

---

## ⚠️⚠️ LE PIÈGE QUI A LE PLUS RAPPORTÉ AU LOT 8 : L'ANTÉRIORITÉ

**Trois issues sur huit de la PR 2 étaient DÉJÀ LIVRÉES**, dans un commit de la
veille (`e7be3e472`) — #1443 en entier, #1447 pour l'essentiel, la moitié de
#1444, et le bug d'icônes de #1442. Elles étaient rédigées comme des demandes
neuves, avec des exemples détaillés.

Deux mesures, à faire AVANT de lire les issues :
```sh
# a. les numéros déjà cités dans le code de l'écran
rg -o '#1[0-9]{3}' apps/web/src/features/<feature> | sort -u

# b. l'historique récent des fichiers de l'écran
git log --oneline -6 -- apps/web/src/features/<feature>
```
Un `#NNNN` dans un commentaire = quelqu'un a déjà répondu à cette demande.

## ⚠️ Les deux séries qui reviennent d'une spec close trop tôt

Comme `#1432→#1440` revenait de **#1322**, il en reste **deux** :
- **`#1412-1417`** (`/accounts`) revient de **#1316** — 4 livrés sur 7 ;
- **`#1426-1431`** (`/partners`) revient de **#1319** — 4 livrés sur 8.

Ouvrir la spec d'origine AVANT les issues filles, croiser point par point, et ne
pas refermer de la même façon : **chaque point a besoin d'une réponse écrite.**

## Décisions parquées — recopiées, ne pas les re-poser

- **Q3 — les logos des éditeurs sur `/integrations` (#1442)** : TOUJOURS PAS
  tranché. Le BUG (Odoo et Attio partageaient `Boxes`) était déjà corrigé ;
  reste le choix esthétique. (a) 16 SVG embarqués, ~1 j + licence par éditeur ·
  (b) relais anti-SSRF `logo-source.ts` + table connecteur → domaine, ~0,5 j,
  qualité inégale · (c) ne rien faire de plus. Défaut retenu : (c).
- **#1440 reste OUVERTE** avec deux questions pour Louis : la **période et la
  dernière mise à jour par KPI** (aucune charge utile ne les porte — chantier à
  part), et le **drawer « Sources & méthode »** (le doublon a déjà été supprimé,
  le catalogue est déjà replié par famille : le tiroir déplacerait sans résoudre).
- **Bandeau proactif de Laura** : PAS tranché (Q2). Défaut : on livre le bouton
  `AskLaura`, on SIGNALE le bandeau. #1367, #1375, #1384 ouvertes pour ça seul.
- **Q1 `/missions/board`** → tranché **(b)** : renommer « Historique », le sortir
  de « Piloter ». ~2 h, `sections.ts` seul. **PAS ENCORE FAIT.** Débloque #1376, #1380.
- **Q5 la garde GA-05 qui lit les commentaires** → tranché **(a)**. **PAS FAIT.**
- **« (client d'exemple) » reste dans le nom du compte en démo.** Écarté 3 fois.
- **Aucune valeur hexadécimale, aucune taille hors échelle.** Les specs en sont
  pleines — onze au lot 5, onze au lot 6, deux au lot 7, **une bonne dizaine au lot 8**.
- **`{{copilot}}` et `{{brand}}`, jamais « Laura » ni « Bellum » en dur** (GA-252).
- **Six sections sur neuf répètent leur nom dans leur premier onglet** — « Comptes >
  Comptes », « Actions > Actions »… Seul `/pilotage` a été renommé (« Décisions »),
  parce que Louis donnait le nom cible. Les six autres attendent un nom.

---

## Les pièges payés dans le lot 8 — ne pas les repayer

### 1. ⚠️ LE PLUS CHER : un test qui CHERCHE ne compte pas

7 471 tests verts, et le détail d'un maillon affichait
**« Rendez-vous · 0 · Rendez-vous »** en production. `getByText('X')` passe
parfaitement quand X est rendu **deux fois**. Aucun test ne comptait.

**Cause racine** : un bloc extrait pour un contexte A (le maillon, où le libellé
sous le chiffre est indispensable) réutilisé dans un contexte B (la ligne, qui
rend déjà ce libellé). Invisible au type-checker.

**Donc** : dès qu'un composant de valeur/libellé est PARTAGÉ entre deux contextes,
ajouter une garde qui compte —
`(container.textContent ?? '').split(needle).length - 1` puis `toBe(1)`.

### 2. Une garde ancrée sur un NOM DE FICHIER rougit au déménagement

GA-109, GA-48 et « un seul dictionnaire » lisaient `PilotagePage.tsx`. Le code a
été extrait dans `LevelDetail.tsx` : les trois ont rougi — **et c'est bien**.
Le piège est la réparation évidente : repointer sur le fichier SURVIVANT, qui ne
porte plus rien. La garde repasse au vert **en ne lisant plus rien**.
Quand c'est possible, ancrer sur un **dossier** (la garde des playbooks vise
maintenant `features/playbooks/view/` entier, et a survécu au découpage en trois).

### 3. Un composant déplacé casse les tests de son NOUVEL hôte

`RitualsPanel` monté sur `/team` a fait tomber **10 tests** de
`ManagerDashboardPage` — et ce n'était pas le test, c'était un VRAI défaut :
`?.lines.map(...)` au lieu de `?.lines?.map(...)`. La faute exacte corrigée le
03/09 dans `DecisionStrip`. ⚠️ Le balayage a trouvé **20+ occurrences** du motif
`?.champ.method(` dans `apps/web/src` — famille non traitée, à signaler.

### 3 bis. Une FAMILLE câblée à moitié passe tous les tests

Le repli des cartes (#1442) a été posé sur `OAuthProviderCard` et `OdooCard`,
**pas** sur `WebhookBackedCard` (six canaux) ni `McpCard`. 7 505 tests verts, et
368 px par canal non branché en production. Chaque carte a son test, et **chacun
passait** : ils testent ce que le composant fait, pas ce que la FAMILLE garantit.
Garde posée : `compact-until-connected.test.ts`, qui lit le DOSSIER.
⚠️ Son angle mort connu : elle vérifie par FICHIER. Deux cartes dans un même
fichier dont une seule est câblée passeraient. Vrai aujourd'hui (un `CardShell`
par fichier), à revoir si ça change.

⚠️ Corollaire du même endroit : **un élément React est TOUJOURS vrai, même quand
le composant rend `null`**. `details={<Foo/>}` allumait un bouton « Voir le
détail » qui n'ouvrait rien. Tester la CONDITION, pas l'élément.

### 4. knip attrape les types exportés inutilement

`ConnectorView`, `StarterStep`, `StarterStepKey` — trois exports de types
consommés dans leur seul fichier. `pnpm lint:exports:types` bloque le push.

### 5. L'outillage qui ment

- **Le `cwd` du Bash PERSISTE** entre appels — chemins absolus, ou `cd <racine> &&`.
  Payé **trois fois** au lot 8.
- **Un backtick dans un `--body "..."` de `gh` est interprété par le shell** :
  le mot disparaît du commentaire. Utiliser `--body-file`.
- **`prettier` n'est pas dans `node_modules/prettier`** :
  `node_modules/.pnpm/prettier@3.8.2/node_modules/prettier/bin/prettier.cjs`.
- Une boucle `for` avec `sleep` dépasse les **120 s** de l'appel : la lancer en
  arrière-plan, ou la découper (3 routes de recette maximum par appel).
- `javascript_tool` dans Chrome coupe à **45 s** : 3 × 9 s d'attente au plus.
- `ls` est intercepté et rend vide : utiliser `find`.

---

## Les gates, dans l'ordre

```sh
node apps/web/node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json
pnpm --filter @bellum/api check-types && pnpm --filter @bellum/api check-types:tests
cd apps/web && node node_modules/vitest/vitest.mjs run     # ~7 505, ~10 min
pnpm --filter @bellum/contracts test                        # ~3 788
cd apps/ia && .venv/bin/python -m pytest tests -q
pnpm --filter @bellum/web lint                              # ESLint — job CI à part
pnpm lint:exports:types                                     # knip
```
Puis **PR obligatoire**, merge sur **`CI Status`** — le check Railway échoue
TOUJOURS sur une PR. Compter ~12 min de CI.

## Puis la recette live, non négociable

1. **Attendre que Vercel ET Railway servent le commit.**
   - Railway : `GET https://api.bellum-ai.com/version` → `.commit`
   - Vercel : le hash de `assets/index-*.js` doit CHANGER (~2 min ; Railway ~10)
2. **Reproduire le geste du client**, sur l'écran de l'issue.
3. **MESURER** — voir piège n°1. Compter les occurrences, lire
   `getBoundingClientRect()`, comparer `scrollWidth`/`clientWidth`.
4. **Balayer toute la navigation** (règle ZÉRO régression), **8 s** de chargement.
5. Console + réseau : tout 4xx/5xx est un défaut. ⚠️ Le **503** sur
   `/crm/pipeline/report` est ATTENDU sur l'espace de Louis (portée CRM manquante).
6. **Ne clore que ce qui a été vu tourner.**

---

## État au 04/09/2026 (fin du lot 8)

- **#1534 mergée, déployée, recettée** (`ce87c094`) — Pilotage devient « Décisions ».
- **#1535 mergée, déployée, recettée** (`61f5f971`) — le libellé en double,
  défaut vu par la SEULE recette.
- **#1536 mergée, déployée, recettée** (`e1a6670b8`) — `/integrations`.
- **#1537 mergée** (`40efbbb78`) — les six canaux et l'assistant se replient
  AUSSI : le premier passage n'avait câblé que 2 cartes sur 4. Défaut vu par la
  seule recette, en MESURANT.
- **14 issues du lot 8 CLOSES** et vérifiées en production :
  #1432 #1433 #1434 #1435 #1436 #1437 #1438 #1439 · #1441 #1443 #1444 #1446
  #1442 #1447 #1448 — soit **15 sur 17**.
- **#1440 reste OUVERTE** — période et dernière mise à jour par KPI (aucune
  charge utile ne les porte), et le drawer « Sources & méthode » (viserait un
  bloc déjà supprimé). Deux questions pour Louis.
- **#1445 reste OUVERTE** — la moitié « la section disparaît » a été vue en
  production (tout est branché chez Louis) ; la moitié « elle s'affiche » ne
  l'a PAS été, et déconnecter un outil de Louis pour la vérifier était exclu.
  Huit tests la couvrent ; la salle de démo la montrera.
- **#1442 close** après la recette de #1537 (canaux mesurés à 231–247 px, contre 368).
- ⚠️ **68 issues bêta ouvertes** au dernier décompte — **recompter avant
  d'annoncer**, de nouveaux retours arrivent PENDANT le lot (vu aux lots 6, 7 et 8).

### Ce qui reste, par écran

`/briefing` (7) · `/actions/sequences` (7) ·
`/mailbox` (6) · `/actions/chaines` (6) · `/watchlist` (5) ·
`/settings/mes-donnees` (5) · `/actions` (5) · `/settings/legal-entities` (4) ·
`/settings/import` (4) · `/settings/catalogues` (4) · `/propositions` (4) ·
`/contacts` (2) · `/pilotage` (1 = #1440) · `/missions/*` (3) · `/chat` (1) ·
`/accounts` (1) · `/actions/ecritures` (1) · `/integrations` (1 = #1445, gardée ouverte) ·
#1472 (le niveau visuel d'ensemble).

### Chantiers à proposer à Louis, pas à décider seul

1. **`subjectLabel` est du contrat MORT** — le champ existe, le serveur l'écrit
   `null` en dur, personne ne l'a jamais rempli. Redondant avec `detail`
   aujourd'hui : soit on le remplit, soit on le retire du contrat.
2. **La famille `?.champ.method(`** — 20+ occurrences dans `apps/web/src`. Une
   seule a explosé (deux fois), mais chaque déploiement ouvre la fenêtre.
3. **Une résolution de domaine vérifiée pour les ESN** — bloque les logos
   partenaires (#1319.3, #1427) et les logos de suggestions (#1415).
4. **Brancher un écrivain sur les compteurs partenaires** (`needs_received_90d`,
   `needs_given_90d`, `placements_active`, `placements_total`).
5. **`SearchInput` (`packages/ui`) n'a AUCUN nom accessible** — `type="text"`
   sans `aria-label`, donc rôle `textbox` et pas `searchbox`. **Trente écrans**
   le montent. Défaut de la primitive PARTAGÉE : à traiter à part.

### Observations à confirmer ailleurs

- **L'axe « territoires » de la carte de couverture affiche des ADRESSES**
  (« 12 CHEMIN DE L'ORMEAU ») là où le contrat annonce la « ville du siège ».
- Plusieurs blocs de `/team` portent leur titre en `Text size="sm"` plutôt qu'en
  `<h2>` : la structure de titres est plate pour un lecteur d'écran.
