# Lot 7 — `/dashboard` (13 issues)

Colle ce texte après un `/clear`. Repartir de `origin/main` **frais**
(`git fetch origin && git checkout -b fix/dashboard-lot-7 origin/main`).

---

## Ce qu'il faut faire

Traite avec `/issues` les **13 retours bêta** de `/dashboard`. Ils forment
**DEUX séries**, et c'est la première chose à comprendre :

**Série « MOI » (8)** — #1404 #1405 #1406 #1407 #1408 #1409 #1410 #1411
**Série « ÉQUIPE » (5)** — #1460 #1461 #1462 #1463 #1464

---

### ⚠️⚠️ LE PIÈGE DU LOT : les cinq « ÉQUIPE » portent sur un onglet SUPPRIMÉ

Les titres disent `/dashboard — TABLEAU DE BORD > ÉQUIPE`. **Cet onglet n'existe
plus.** La décision de Louis du 04/09 — « un seul cockpit d'équipe » — l'a
retiré, et `DashboardContent.tsx:10` en porte la trace :

```
#1457 / #1458 / #1459 — il portait un second onglet « Équipe » qui rendait…
```

#1457, #1458 et #1459 sont CLOSES pour cette raison. La décision dit en toutes
lettres : **« #1460→#1464 deviennent des retours sur `/team` »**.

Donc : ne pas coder ces cinq-là sur `/dashboard`. Les **relire** comme des
retours sur `/team`, écran par écran, avant la moindre ligne. Le risque, sinon,
est de livrer cinq retours sur un onglet que personne ne verra jamais — c'est la
cause racine « du code juste que personne n'appelle », prise à sa source.

⚠️ **#1462 et #1463 sont un DOUBLON non tranché** (même titre, « PIPELINE &
OBJECTIFS »). Ils attendent l'accord NOMMÉ de Louis pour être clos — on ne clôt
jamais un doublon sans lui.

---

### ⚠️ #1408 porte une contradiction de FOND, pas un pixel

« Mes comptes » filtre sur le **CRÉATEUR**, `/comptes` sur le **RESPONSABLE**.
Deux populations, deux vérités, et le même mot pour les deux. C'est la famille
« même nom, forme différente » — et c'est exactement ce qui a produit, au lot 6,
une tuile qui annonçait 2 et un filtre qui rendait zéro ligne. Ça se tranche
avant de coder, pas après.

---

## ⚠️ À FAIRE AVANT DE CODER

1. **Chercher l'antériorité — c'est ce qui fait gagner le plus de temps.**
   Au lot 5, huit retours sur vingt et un étaient déjà livrés. Au lot 6,
   **quatre sur seize** (#1369, #1377, #1382, et #1383 à moitié) : leurs marques
   étaient déjà dans le code.
   ```sh
   rg -o '#1[0-9]{3}' apps/web/src/features/dashboard apps/web/src/features/team | sort -u
   gh issue list --state all --limit 200 --search '"/dashboard" in:title' \
     --json number,title,state --jq 'sort_by(.number)|.[]|"\(.state[0:1]) #\(.number) \(.title[0:80])"'
   ```
2. **Chercher les PRIMITIVES avant d'en écrire une.** Le lot 6 n'a écrit AUCUN
   composant neuf côté affichage — tout existait :
   - `ScreenIntro` (entête personnalisé, prénom depuis le profil)
   - `FilterChips` (pastille comptée = le seul objet « compter + filtrer »)
   - `AskLaura` + son variant `prominent` (écrans de LISTE)
   - `CompanyAvatar` / `ContactAvatar` (logo réel, repli favicon puis initiale)
   - `NextAction` (prochaine action = LIEN, jamais du texte mort)
   - `UnknownValue` (« non mesuré » AVEC sa raison)
   - `formatDate` / `formatMonth` / **`formatDateRange`** (« 8 mai → 1 oct. 2026 »)
   - `ResponsiveTable` (cartes sous 768 px ; `column.className` va à l'entête ET
     à la cellule depuis le 04/09)
3. **Lire `.claude/notes/decisions-en-attente-2026-09-04.md`** — Q2, Q3, Q4
   attendent encore Louis. Ne pas les deviner.

---

## Décisions déjà prises — recopiées, ne pas les re-poser

- **Le bandeau proactif de Laura n'est PAS tranché** (Q2). Défaut retenu : on
  livre le **bouton** `AskLaura`, on SIGNALE le bandeau, on ne décide pas seul.
  #1367, #1375 et #1384 sont restées ouvertes pour cette seule raison.
- **« (client d'exemple) » reste dans le nom du compte en démo** — l'une des
  trois précautions écrites du jeu (avec le domaine `.example` et le marquage
  `customer`), et un test l'exige. Demandé deux fois au lot 6, écarté deux fois.
- **Automatisations** → relances vers `/actions/chaines`, rituels vers `/team`.
  Une synthèse « N actives · N inactives → Gérer », jamais un second interrupteur.
- **Aucune valeur hexadécimale, aucune taille ni radius hors échelle.** Les
  specs en sont pleines (onze au lot 5, onze au lot 6). L'intention passe en
  jetons, et ça se note dans le commit ET dans le commentaire de clôture.
- **`{{copilot}}`, jamais « Laura » en dur dans une traduction** (GA-252). Ça a
  rougi au lot 5 ET au lot 6 — c'est la marque blanche.

---

## Les pièges payés dans le lot 6 — ne pas les repayer

### 1. ⚠️ LE PLUS CHER : trois défauts sur cinq n'étaient visibles QU'À L'ÉCRAN

7 429 tests verts, quatorze jobs de CI verts, et cinq comportements faux trouvés
en recette. **jsdom ne met rien en page** : toute coordonnée y rend zéro.

- **Les treize chevrons de la frise étaient rendus HORS de leur piste.**
  `-left-4` / `-right-4` posent un glyphe à côté de la barre — or un bord rogné
  touche par définition le bord de la fenêtre. Celui de gauche était recouvert
  par la colonne collante (`bg-card`, `z-10`).
- **Une tuile annonçait 2, son filtre rendait ZÉRO ligne.** Les tuiles lisaient
  des résumés serveur (12 mois d'encaissements, toutes missions), la table lisait
  UN mois et les missions actives. **Trois dénominateurs.** Un compteur juste
  peut promettre un filtre faux — c'est la famille « même nom, forme différente ».
- **Une colonne d'action poussée hors du champ visible** (x=1469 pour un
  conteneur qui finit à 1479), parce qu'une colonne voisine prenait 394 px.

**Donc : MESURER en recette.** Compter les lignes rendues contre le compteur
annoncé, lire `getBoundingClientRect()`, comparer `scrollWidth`/`clientWidth`.
Charger la page ne prouve rien, et un test vert ne prouve pas une position.

### 2. Une classe posée sur la cellule ne contraint pas la colonne

`ResponsiveTable` n'appliquait `column.className` qu'au `<td>`. Un `<th>`
participe au calcul de largeur : **trois colonnes du dépôt déclaraient une
largeur en pure perte depuis leur écriture** (`w-px`, `w-8` ×2). Corrigé le
04/09 — la classe va aux deux.

### 3. Un test qui cherche une chaîne EXACTE peut mesurer autre chose

`getAllByText('non mesuré')` sur toute la page ne matchait que les TUILES, dont
l'`UnknownValue` est nu — jamais les cellules, dont le texte porte sa raison.
Il serait resté vert avec une table vide. **Borner à la zone qu'on mesure**, et
préférer une expression régulière quand le texte porte un suffixe.

### 4. Le même mot deux fois sur la même ligne

« Fin inconnue » s'écrivait en colonne de disponibilité ET en note de bord, à
trois centimètres. Loi 4 du tome 7. Se voit en écrivant le test, pas en relisant.

### 5. Les gardes qui ont repris le lot 6

| Garde | Ce qu'elle a refusé |
|---|---|
| `brand-name-is-not-hardcoded` (GA-252) | « Laura » en dur dans 3 traductions → `{{copilot}}` |
| `knip` | un type exporté sans consommateur externe (`TrackingConcern`) |
| commitlint | un sujet de commit à 103 caractères (plafond : 100) |

### 6. Toute garde neuve doit prouver qu'elle sait dire NON

Cinq gardes écrites au lot 6, **cinq cassées volontairement pour vérifier
qu'elles rougissent**. Une garde qui n'a jamais échoué ne garde rien.

### 7. L'outillage qui ment

- **Le `cwd` du Bash PERSISTE** — un `cd apps/web` réussi rend tous les chemins
  relatifs suivants faux, EN SILENCE. Payé **deux fois** dans ce lot.
  Chemins absolus, ou `cd <racine> &&` à chaque fois.
- **Lancer vitest avec `--root apps/web` depuis la racine casse
  `route-titles.test.ts`** : il lit `process.cwd()`. Faux rouge. Se lancer
  DEPUIS `apps/web`.
- Une boucle de sondage en arrière-plan meurt souvent après une itération —
  sonder en avant-plan par tranches de 3.
- `git diff --stat` peut ne rien rendre : passer par un fichier.
- `grep --include=*.ts` non quoté échoue en zsh.

---

## Les gates, dans l'ordre

```sh
node apps/web/node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json
pnpm --filter @bellum/api check-types && pnpm --filter @bellum/api check-types:tests
cd apps/web && node node_modules/vitest/vitest.mjs run     # ~7 430, ~15 min
pnpm --filter @bellum/contracts test                        # ~3 790
cd apps/ia && .venv/bin/python -m pytest tests -q           # ~5 620
pnpm --filter @bellum/web lint                              # ESLint — job CI à part
pnpm lint:exports:types                                     # knip
```

Puis **PR obligatoire**, merge sur **`CI Status`** — le check Railway échoue
TOUJOURS sur une PR. ⚠️ La CI met **~1 h 15** quand tous les jobs tournent ;
elle en saute la moitié si la PR ne touche que le web.

## Puis la recette live, non négociable

1. **Attendre que Vercel ET Railway servent le commit.**
   - Vercel : `node -e "fetch('https://app.bellum-ai.com/?cb='+Date.now()).then(r=>r.text()).then(h=>console.log(h.match(/assets\/index-[A-Za-z0-9_-]+\.js/)[0]))"`
   - Railway : **`GET https://api.bellum-ai.com/version`** rend le commit servi.
     C'est le signal fiable, trouvé au lot 6 — plus besoin d'attendre à l'aveugle.
2. **Reproduire le geste du client**, sur l'écran de l'issue.
3. **MESURER** — voir piège n°1. C'est ce qui a trouvé les cinq défauts du lot 6.
4. **Balayer toute la navigation** (règle ZÉRO régression). ⚠️ Prendre les routes
   dans la NAV (`/accounts`, `/consultants`, `/briefing`…), ne pas les deviner
   depuis les libellés — « Comptes » vit sur `/accounts`, pas `/comptes`.
   Et laisser **4 s** de chargement : à 2,6 s, `/briefing` paraît vide.
5. Console + réseau : tout 4xx/5xx est un défaut, sauf le 412/503 délibéré de
   `/crm/pipeline/report`.
6. **Ne clore que ce qui a été vu tourner.**

---

## État au 04/09/2026 (fin du lot 6)

- **#1528 mergée, déployée, recettée** (`13102b968`) — Planification + Suivi.
- **#1530 mergée, déployée, recettée** (`49ca38a68`) — les trois défauts que
  seule la recette pouvait voir (chevrons hors piste, notes tronquées, tuiles
  dont le filtre mentait).
- **#1531** — la colonne d'action du suivi + `ResponsiveTable` (classe de colonne
  appliquée à l'entête). **Vérifier son état avant de commencer.**
- **11 issues closes** : #1369→#1374, #1377, #1378, #1380, #1381, #1382.

### Restent ouvertes du lot 6, et pourquoi

| Issue | Raison |
|---|---|
| **#1375**, **#1384** | Le bouton Laura est livré et vérifié ; leur **bandeau proactif** attend Q2. |
| **#1367** | Même raison, depuis le lot 5. |
| **#1379** | Livré et vérifié SAUF le mot « filtre » : les tuiles RENVOIENT (trois dénominateurs, cf. piège n°1). À clore quand #1531 est recettée. |
| **#1383** | Livré ; sa colonne redevient atteignable avec #1531. |
| **#1385** | Livré (urgence, jetons) ; à clore avec #1531. |

### Ce qui reste après ce lot

`/pilotage` (9) · `/integrations` (8) · `/briefing` (7) · `/actions/sequences` (7) ·
`/mailbox` (6) · `/actions/chaines` (6) · `/watchlist` (5) · `/settings/mes-donnees` (5) ·
`/actions` (5) · `/settings/legal-entities` (4) · `/settings/import` (4) ·
`/settings/catalogues` (4) · `/propositions` (4) · `/contacts` (2) · `/chat` (1) ·
#1472 (le niveau visuel d'ensemble).

⚠️ **99 issues bêta ouvertes** au moment d'écrire — plus que les 78 annoncées en
fin de lot 5 : de nouveaux retours sont arrivés pendant le lot 6. Recompter avant
d'annoncer un reste à faire.

### Trois chantiers à proposer à Louis, pas à décider seul

1. **Une résolution de domaine vérifiée pour les ESN** — bloque les logos
   partenaires (#1319.3, #1427) et les logos de suggestions (#1415).
2. **Brancher un écrivain sur les compteurs partenaires** (`needs_received_90d`,
   `needs_given_90d`, `placements_active`, `placements_total`).
3. **`SearchInput` (`packages/ui`) n'a AUCUN nom accessible** — `type="text"`
   sans `aria-label`, donc rôle `textbox` et pas `searchbox`. **Trente écrans**
   le montent. Défaut de la primitive PARTAGÉE : à traiter à part, pas en passant.
