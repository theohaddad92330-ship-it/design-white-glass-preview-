# Lot 8 — `/pilotage` (9) + `/integrations` (8)

Colle ce texte après un `/clear`. Repartir de `origin/main` **frais**
(`git fetch origin && git checkout -b fix/<nom> origin/main`).

---

## Ce qu'il faut faire

Traite avec `/issues` les retours bêta de **deux écrans**, en **deux PR** :

- **PR 1 — `/pilotage` (9)** : `gh issue list --state open --label beta-feedback --search '"/pilotage" in:title'`
- **PR 2 — `/integrations` (8)** : idem avec `"/integrations"`

⚠️ **On RECETTE la première avant d'ouvrir la seconde.** Deux PR en vol, c'est
deux lots non vérifiés en production en même temps, et un défaut qui sort ne dit
plus lequel des deux l'a causé.

---

## ⚠️⚠️ LE PIÈGE DU LOT 8 : `/pilotage` REVIENT D'UNE SPEC CLOSE TROP TÔT

`#1432→#1440` n'est pas un lot neuf. C'est le RETOUR de la spec **#1322**
(`/pilotage`, 7 points), qui a été **close alors que 2 points sur 7 seulement
étaient livrés**. Les cinq autres reviennent aujourd'hui, redécoupés.

C'est l'interdit §7 du skill, mot pour mot : *« une spec ne se clôt pas sur ses
points faciles »*. Deux conséquences, aucune facultative :

1. **OUVRIR #1322 AVANT de lire #1432→#1440.** Ses sept points sont le vrai
   inventaire ; les neuf issues d'aujourd'hui en sont la reformulation.
   ```sh
   gh issue view 1322 --json body,state --jq '"[\(.state)]\n\(.body)"'
   ```
   Croiser point par point : lequel a été livré, lequel revient, lequel a été
   écarté SANS le dire.
2. **Ne pas refaire la même clôture.** Chaque point de #1432→#1440 a besoin
   d'une réponse ÉCRITE — livré, reformulé (avec quoi), ou écarté (avec la
   règle). Trois points sur neuf livrés ⇒ l'issue reste OUVERTE, commentée.

⚠️ Deux autres séries ont le même défaut, pour plus tard : `#1412-1417`
(`/accounts`, revient de #1316 — 4 livrés sur 7) et `#1426-1431` (`/partners`,
revient de #1319 — 4 livrés sur 8).

## Décisions parquées qui tombent DANS ce lot

### Q3 — les logos des éditeurs sur `/integrations` (#1442.1)
Nommer l'éditeur en TEXTE y est déjà autorisé (c'est l'exception écrite de la
doctrine). Un **logo** est une autre question : aucun mécanisme n'existe.
- **(a)** 16 SVG embarqués. ~1 j — licence/marque à vérifier par éditeur.
- **(b)** Réutiliser le relais anti-SSRF (`logo-source.ts`, repli favicon) + une
  table connecteur → domaine. ~0,5 j, qualité inégale.
- **(c)** Icônes distinctes par connecteur + teinte de famille. ~2 h.
  **← défaut retenu : on livre uniquement la correction du BUG — Odoo et Attio
  partagent aujourd'hui la même icône `Boxes` — pas le choix esthétique.**

**Toujours pas tranché par Louis.** Livrer (c), signaler (a)/(b), ne pas décider
seul.

### Et une décision du lot 7 qui touche `/integrations`
**L'état « connecté » de `/integrations` est invisible en DÉMONSTRATION**, à
dessein, avec sa raison écrite dans `demo-coverage.ts` (réponse n°2 de Louis du
04/09). Il se recette en production. Ne pas « corriger » ça.

## Numéros du lot 8

- **PR 1 — `/pilotage` (9)** : #1432 #1433 #1434 #1435 #1436 #1437 #1438 #1439 #1440
- **PR 2 — `/integrations` (8)** : #1441 #1442 #1443 #1444 #1445 #1446 #1447 #1448

⚠️ **#1505 n'est PAS de ce lot.** Il remonte sur une recherche `/integrations`
parce que son corps porte le mot « INTÉGRATION », mais son titre dit
`/actions/chaines`. Une recherche n'est pas un inventaire — vérifier le TITRE.

---

## ⚠️ À FAIRE AVANT DE CODER

1. **Compter les SUJETS, pas les titres.** Au lot 7, treize titres portaient
   **dix-sept sujets** : quatre issues repliaient une seconde section dans leur
   corps sans que le titre le dise (#1407, #1411, #1461, #1463).
   ```sh
   for n in <numéros>; do echo "── #$n"; gh issue view $n --json body --jq '.body' \
     | sed -n '/^### Message/,/^### /p' | grep -cE '^> [A-ZÉÈ /&—-]{12,}$'; done
   ```
   Une ligne en CAPITALES au milieu du corps = une seconde section.

2. **Chercher l'antériorité — c'est ce qui a fait gagner le plus de temps.**
   Au lot 7, **toute la série ÉQUIPE était déjà livrée** : les douze blocs de
   `/team` existaient et étaient branchés sur des données réelles. Ce qui
   manquait était leur ORDRE. Cinq issues réglées sans une ligne de moteur.
   ```sh
   rg -o '#1[0-9]{3}' apps/web/src/features/<feature> | sort -u
   gh issue list --state all --limit 200 --search '"<écran>" in:title' \
     --json number,title,state --jq 'sort_by(.number)|.[]|"\(.state[0:1]) #\(.number) \(.title[0:80])"'
   ```

3. **`/pilotage` est un écran de MESURE — la doctrine y mord fort.**
   `pilotage.ts` porte déjà `value: null ⇒ status: 'non_mesure'` et le
   `denominator` des taux. Ne pas re-livrer ça. Le dictionnaire des 60
   indicateurs est servi depuis le CODE, délibérément.

4. **`/integrations` est le SEUL écran où l'on nomme les éditeurs.** Partout
   ailleurs on nomme la capacité (« ton CRM »). C'est l'exception écrite de la
   doctrine, parce que l'utilisateur y autorise lui-même l'accès. Ne pas
   « corriger » ça en croyant bien faire.

---

## Décisions déjà prises — recopiées, ne pas les re-poser

- **Bandeau proactif de Laura** : PAS tranché (Q2). Défaut : on livre le
  **bouton** `AskLaura`, on SIGNALE le bandeau, on ne décide pas seul.
  #1367, #1375 et #1384 restent ouvertes pour cette seule raison.
- **Q1 `/missions/board`** → tranché **(b)** : le renommer « Historique » et le
  sortir de « Piloter ». ~2 h, `sections.ts` seul. **PAS ENCORE FAIT.**
  Débloque #1376 et #1380.
- **Q5 la garde GA-05 qui lit les commentaires** → tranché **(a)**. **PAS FAIT.**
- **Q3, Q4, Q6** attendent encore Louis (`.claude/notes/decisions-en-attente-2026-09-04.md`).
- **« (client d'exemple) » reste dans le nom du compte en démo.** Demandé trois
  fois, écarté trois fois — un test l'exige.
- **Aucune valeur hexadécimale, aucune taille ni radius hors échelle.** Les
  specs en sont pleines (onze au lot 5, onze au lot 6, deux au lot 7).
- **`{{copilot}}` et `{{brand}}`, jamais « Laura » ni « Bellum » en dur** dans
  une traduction (GA-252). A rougi aux lots 5, 6 ET 7.

---

## Les pièges payés dans le lot 7 — ne pas les repayer

### 1. ⚠️ LE PLUS CHER : quatre défauts sur quatre n'étaient visibles QU'À L'ÉCRAN

7 437 tests verts, 23 jobs de CI verts, et quatre comportements faux.

- **Une pastille arrondie contenait un paragraphe de cinq lignes.**
  `opportunities.label` et `signal_history.label` portent des ANALYSES, pas des
  intitulés — quatre-vingts mots. `shortReason()` existe pour ça
  (`apps/api/src/modules/dashboard/priority-reason.ts`) : **le chercher AVANT
  d'afficher un libellé venu de la base.**
- **Une provenance disait « sur 644 comptes » pour un nombre d'AFFAIRES.**
  Un compteur juste sous un nom faux est pire qu'une absence.
- **« 1 comptes »** — une unité traduite hors du point de vue du compte.
- **Une semaine mesurée ISOLÉE entre deux trous disparaissait du graphe** —
  trouvé en écrivant un test, pas à l'écran. Pire qu'un trou : la mesure
  existait et rien ne la montrait.

**Donc : MESURER en recette.** Compter les lignes rendues contre le compteur,
lire `getBoundingClientRect()`, comparer `scrollWidth`/`clientWidth`, compter
les `<path>` d'un SVG. Charger la page ne prouve rien.

### 2. Une lecture d'espace peut fuir par un AGRÉGAT

`GET /dashboard/me` ne porte que `JwtGuard`. Y servir le facturé aurait rendu à
un `sales` ce que `/delivery` lui masque — la porte de #1457, rouverte par la
fenêtre. **Avant d'ajouter un champ à une route personnelle : chercher qui le
garde AILLEURS.** Le patron du dépôt est « c'est le CHAMP qui se garde, pas la
lecture » (`invoice-readiness.controller.ts` → `financeContext`).

### 3. Le semis de démo doit LIRE comme l'écran

Changer la portée de « mon portefeuille » (créateur → responsable) aurait ouvert
la salle de démonstration **sur du vide**, sans qu'aucun test ne rougisse : les
données étaient là, la lecture était juste, les deux ne se croisaient plus.
Garde posée : `demo-portfolio-is-owned.spec.ts`.

### 4. Les gardes qui ont repris le lot 7

| Garde | Ce qu'elle a refusé |
|---|---|
| `brand-name-is-not-hardcoded` (GA-252) | « Bellum » en dur dans une traduction → `{{brand}}` |
| `display-primitives` (GA-19) | un `?? 0` de plus (cliquet 118→119) — narrower, pas replier |
| `lexicon.test.ts` | « zone blanche » → « périmètre non couvert » |
| `ActivationChecklist.test.tsx` | m'a empêché de poser un SECOND interrupteur sur le même réglage |

### 5. Une garde trop gourmande ne garde plus rien

`not.toContain('a.user_id')` rougissait sur `ua.user_id`. **Borner l'alias** :
`/(?<![A-Za-z_])a\.user_id/`.

### 6. L'outillage qui ment

- **`ls` est intercepté** et rend vide : utiliser `find`.
- **Le `cwd` du Bash PERSISTE** — chemins absolus, ou `cd <racine> &&`.
- **Le résumé de jest est illisible** après interception : `--json --outputFile`
  puis lire le JSON. C'est le seul moyen fiable de voir QUEL test est rouge.
- **Les migrations du dépôt ont des horodatages FUTURS** (max ≈ 1791.6e9) alors
  que `Date.now()` rend ≈ 1788.5e9. Prendre `max + delta`, non rond, 13 chiffres.
- Une boucle de sondage en arrière-plan meurt souvent après une itération —
  sonder en avant-plan par tranches de 3.
- `grep --include=*.ts` non quoté échoue en zsh.

---

## Les gates, dans l'ordre

```sh
node apps/web/node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json
pnpm --filter @bellum/api check-types && pnpm --filter @bellum/api check-types:tests
cd apps/web && node node_modules/vitest/vitest.mjs run     # ~7 440, ~10 min
pnpm --filter @bellum/contracts test                        # ~3 790
cd apps/ia && .venv/bin/python -m pytest tests -q           # ~5 620
pnpm --filter @bellum/web lint                              # ESLint — job CI à part
pnpm lint:exports:types                                     # knip
```

Puis **PR obligatoire**, merge sur **`CI Status`** — le check Railway échoue
TOUJOURS sur une PR. La CI complète prend ~15 min quand tous les jobs tournent.

## Puis la recette live, non négociable

1. **Attendre que Vercel ET Railway servent le commit.**
   - Railway : `GET https://api.bellum-ai.com/version` rend le commit servi.
   - Vercel : le hash de `assets/index-*.js` doit CHANGER.
   - ⚠️ Vercel bascule en ~2 min, Railway en ~10. Recetter entre les deux teste
     un front neuf sur une API ancienne.
2. **Reproduire le geste du client**, sur l'écran de l'issue.
3. **MESURER** — voir piège n°1.
4. **Balayer toute la navigation** (règle ZÉRO régression). Prendre les routes
   dans la NAV, ne pas les deviner. Laisser **8 s** de chargement : `/accounts`
   montrait encore des squelettes à 6 s.
5. Console + réseau : tout 4xx/5xx est un défaut.
6. **Ne clore que ce qui a été vu tourner.**

---

## État au 04/09/2026 (fin du lot 7)

- **#1532 mergée et recettée** (`22947d8c9`) — le recul du cockpit + l'arbitrage
  d'équipe, 13 issues.
- **#1533 mergée, déployée et recettée** (`498841144`) — les quatre défauts que
  seule la recette pouvait voir.
- **Les 13 issues du lot 7 sont CLOSES**, chacune vérifiée en production.
- ⚠️ **86 issues bêta ouvertes**, pas 83 : le compte annoncé en fin de lot 6
  était de 99, il en restait 96 avant clôture, et **trois nouveaux retours sont
  arrivés PENDANT le lot** (même motif qu'au lot 6). **Recompter avant
  d'annoncer un reste à faire**, toujours.

### Ce qui reste, par écran

`/pilotage` (9) · `/integrations` (8) · `/briefing` (7) · `/actions/sequences` (7) ·
`/mailbox` (6) · `/actions/chaines` (6) · `/watchlist` (5) · `/settings/mes-donnees` (5) ·
`/actions` (5) · `/settings/legal-entities` (4) · `/settings/import` (4) ·
`/settings/catalogues` (4) · `/propositions` (4) · `/contacts` (2) ·
`/missions/*` (3) · `/chat` (1) · `/accounts` (1) · #1472 (le niveau visuel d'ensemble).

### Trois chantiers à proposer à Louis, pas à décider seul

1. **Une résolution de domaine vérifiée pour les ESN** — bloque les logos
   partenaires (#1319.3, #1427) et les logos de suggestions (#1415).
2. **Brancher un écrivain sur les compteurs partenaires** (`needs_received_90d`,
   `needs_given_90d`, `placements_active`, `placements_total`).
3. **`SearchInput` (`packages/ui`) n'a AUCUN nom accessible** — `type="text"`
   sans `aria-label`, donc rôle `textbox` et pas `searchbox`. **Trente écrans**
   le montent. Défaut de la primitive PARTAGÉE : à traiter à part.

### Deux observations du lot 7, à confirmer ailleurs

- **L'axe « territoires » de la carte de couverture affiche des ADRESSES**
  (« 12 CHEMIN DE L'ORMEAU », « 12 RUE VIVIENNE ») là où le contrat annonce la
  « ville du siège ». Pas introduit par le lot 7 — à mesurer avant d'y toucher.
- Plusieurs blocs de `/team` portent leur titre en `Text size="sm"` plutôt qu'en
  `<h2>` : la structure de titres de l'écran est plate pour un lecteur d'écran.
