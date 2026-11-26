# Lot 10 — `/mailbox` (6) + `/actions/chaines` (6)

Colle ce texte après un `/clear`. Repartir de `origin/main` **frais**
(`git fetch origin && git checkout -b fix/<nom> origin/main`).

---

## Ce qu'il faut faire

Traite avec `/issues` les retours bêta de **deux écrans**, en **deux PR** :

- **PR 1 — `/mailbox` (6)** : `gh issue list --state open --label beta-feedback --search '"/mailbox" in:title'`
- **PR 2 — `/actions/chaines` (6)** : idem avec `"/actions/chaines"`

⚠️ **On RECETTE la première avant d'ouvrir la seconde.**

---

## ⚠️⚠️ LE PIÈGE QUI A LE PLUS RAPPORTÉ AU LOT 9 : LA CAPACITÉ SANS PORTE

Ce n'est plus l'antériorité (lot 8), c'est son symétrique — **du code juste,
complet, testé, que RIEN n'appelle**. Trois fois en un lot :

- `/actions/sequences` : `const TEMPLATE_KEY = 'prospection_3_touches'` écrit en
  dur. **Cinq gabarits sur six inatteignables**, chacun avec ses étapes, ses
  échéances et sa raison écrite au-dessus.
- `/briefing` : `needsPreparation` (« externe, dans les 24 h ») calculé et servi
  par le serveur **depuis le premier jour**, lu par personne.
- `/actions/sequences` : pause, reprise, annulation, « étape faite » — quatre
  mutations branchées depuis des mois, atteignables **uniquement** depuis une
  fiche contact.

Deux mesures, AVANT de lire les issues :

```sh
# a. les hooks/champs du domaine, et QUI les appelle
grep -rn "useX\|le_champ" apps/web/src --include='*.tsx' | grep -v hooks/
# b. les constantes en dur qui choisissent à la place de l'utilisateur
grep -rnE "^const [A-Z_]+: [A-Za-z]+Key = " apps/web/src
```

## ⚠️ Le second piège du lot 9 : une garde qui perd son sujet

Retirer un bloc d'écran a fait rougir `pipe-total-one-verdict`, qui comparait
`/briefing` et `/projects`. La réparation ÉVIDENTE — repointer sur
`PipelineKpis` — l'aurait fait **se comparer à elle-même** et repasser au vert
en ne lisant plus rien. C'est le piège du lot 8, dans une autre forme.

Et surtout : **la capacité que le bloc portait n'avait qu'un émetteur.** Le lien
« barre du pipe → liste filtrée » (`?stage=`) était le SEUL endroit du produit
qui posait ce paramètre. Le retirer aurait laissé la route avec un
`validateSearch` que plus rien n'atteint. Avant de supprimer un bloc :

```sh
grep -rn "le_param\|to=\"/la_route\"" apps/web/src --include='*.tsx'
```

## ⚠️ L'outillage qui a menti au lot 9 — celui-là est neuf

**`vitest` d'`apps/web` résout `@bellum/contracts` vers `dist/`, pas les
sources.** `exports["."].import = "./dist/index.js"` ; seul `types` pointe sur
`src`. Une entrée de changelog ajoutée dans `packages/contracts` était donc
**invisible** en local : **7 502 tests verts**, et `Test (Web) (1)` rouge en CI,
sur une garde de tutoiement qui lisait le changelog.

**Après toute modification dans `packages/*` :**

```sh
pnpm --filter @bellum/contracts build   # AVANT la suite web, sinon le vert ne prouve rien
```

## Décisions parquées — recopiées, ne pas les re-poser

- **#1396 OUVERTE — logos comptes / avatars contacts dans les priorités du
  brief.** Les cartes d'action ne portent ni identifiant de compte exploitable
  ni contact résolu. Deux options posées à Louis : **(a)** une jointure de plus
  côté serveur, une demi-journée ; **(b)** l'intégrer au chantier « résolution
  de domaine vérifiée pour les ESN », qui bloque déjà les logos partenaires
  (#1319.3, #1427) et les logos de suggestions (#1415). Défaut retenu : **(b)**.
- **#1510 OUVERTE — « créer une cadence personnalisée ».** Le serveur le
  supporte entièrement (étapes custom, borne de 12, validation de l'espacement
  selon l'état de la relation). Il manque l'ÉDITEUR d'étapes. ~1 j.
- **#1513 OUVERTE — le résumé d'import** (« 125 importés · 18 doublons
  fusionnés · … · 97 éligibles à CETTE séquence »). Les quatre premiers chiffres
  existent dans l'import ; le cinquième suppose un chemin import → séquence en
  cours de création. Chantier, pas affichage. Et la distinction « séquence
  Bellum » / « séquence CRM » attend qu'un connecteur expose des séquences
  natives — aucun ne le fait.
- **#1514 OUVERTE — la capacité Laura sur les séquences.** Le lien contextuel
  est livré. L'outil (audience + critères + gabarit + aperçu) est ~1-2 j dans le
  service IA. ⚠️ **Les six interdits du retour sont DÉJÀ tenus** — Laura n'a
  aucun outil d'écriture sur les séquences, ce n'est pas une convention.
- **La section `today` répète son nom dans son premier onglet** (« Aujourd'hui »
  / « Aujourd'hui »). #1389 donnait le nom de l'ÉCRAN, pas celui de la SECTION,
  qui contient aussi Messagerie et Tableau de bord. Proposé à Louis : « Ma
  journée » pour la section. **Cinq autres sections** ont le même défaut.
- **Q3 — les logos des éditeurs sur `/integrations` (#1442)** : toujours pas
  tranché. (a) 16 SVG embarqués ~1 j + licence · (b) relais anti-SSRF ~0,5 j,
  qualité inégale · (c) ne rien faire. Défaut retenu : **(c)**.
- **Q1 `/missions/board`** → tranché **(b)** : renommer « Historique », le sortir
  de « Piloter ». ~2 h, `sections.ts` seul. **PAS ENCORE FAIT.** Débloque #1376, #1380.
- **Q5 la garde GA-05 qui lit les commentaires** → tranché **(a)**. **PAS FAIT.**
- **« (client d'exemple) » reste dans le nom du compte en démo.** Écarté 3 fois.
- **Aucune valeur hexadécimale, aucune taille hors échelle.** Les specs en sont
  pleines — onze au lot 5, onze au lot 6, deux au lot 7, une dizaine au lot 8,
  **deux séries complètes au lot 9** (#1396 et #1515).
- **`{{copilot}}` et `{{brand}}`, jamais « Laura » ni « Bellum » en dur** (GA-252).
- **Un prénom d'exemple dans une spec vient de la salle de démo** (« Maëlle ») :
  il se remplace par `useFirstName()`, jamais figé.

---

## Les autres pièges payés dans le lot 9

### 1. Une garde attrape sa propre copie neuve

`briefing-screen-has-one-name` a rougi sur **« Demander à Laura de prioriser ma
journée »** — « ma journée » y désigne une journée de travail, pas un écran.
C'est le faux positif que son docbloc annonçait, arrivé pour de vrai. Les motifs
sont maintenant **ancrés sur la chaîne entière** (`^ma journée$`), et le cas
réel est ajouté en preuve. Toute garde qui cherche un MOT dans des libellés doit
s'ancrer, ou elle se fait désactiver au troisième faux positif.

### 2. Un composant ajouté casse les tests de son NOUVEL hôte

Un `Link` posé sur l'entête de colonne du kanban a fait tomber **31 tests** dans
quatre fichiers qui ne moquaient pas `@tanstack/react-router`. Le faux doit
**recopier le `search` dans le `href`** — un faux qui jette le paramètre laisse
passer le défaut du 28/08 (un lien juste, une recherche perdue).

### 3. Un compteur qui filtre = un seul prédicat

Quatre KPI cliquables sur `/actions/sequences`. `bucketsOf` est la SEULE
fonction qui décide du seau : le compteur additionne ce qu'elle rend, le filtre
garde ce qu'elle rend. Un test compare **l'égalité des deux chemins**, avec la
contre-épreuve que le corpus n'est pas vide. Sans ça : « 7 en attente » au-dessus
de cinq lignes, et rien ne tombe.

### 4. « Vide à dessein » périmé

`outreach_sequences` était vide en démo au motif qu'« une séquence seedée
laisserait croire que des e-mails partent ». L'écran le dit maintenant trois
fois — le motif ne tenait plus, et la salle montrait un **cockpit vide**.
⚠️ Relire la justification, pas seulement constater qu'elle existe.

### 5. L'outillage

- **Le `cwd` du Bash PERSISTE** entre appels — chemins absolus, ou `cd <racine> &&`.
  Payé **deux fois** au lot 9, après trois au lot 8.
- **`commitlint` plafonne le sujet à 100 caractères.** Un sujet à 101 fait
  échouer `commit-msg` après que lint-staged a tourné.
- **`prettier`** : `node_modules/.pnpm/prettier@3.8.2/node_modules/prettier/bin/prettier.cjs`.
- Une boucle `for` avec `sleep` dépasse les **120 s** : arrière-plan, ou
  3 routes de recette maximum par appel.
- `javascript_tool` dans Chrome coupe à **45 s** : 3 × 9 s d'attente au plus.
- **Un `sleep` en premier plan est BLOQUÉ** par le harnais : arrière-plan.
- `ls` est intercepté et rend vide : utiliser `find`.

---

## Les gates, dans l'ordre

```sh
pnpm --filter @bellum/contracts build       # ⚠️ EN PREMIER si packages/* a bougé
node apps/web/node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json
pnpm --filter @bellum/api check-types && pnpm --filter @bellum/api check-types:tests
cd apps/web && node node_modules/vitest/vitest.mjs run     # ~7 529, ~10 min
pnpm --filter @bellum/contracts test                        # ~3 790
cd apps/api && npx jest --silent                            # suite complète
pnpm --filter @bellum/web lint                              # ESLint — job CI à part
pnpm lint:exports:types                                     # knip
```

Puis **PR obligatoire**, merge sur **`CI Status`** — le check Railway échoue
TOUJOURS sur une PR. Compter ~12 min de CI.

## Puis la recette live, non négociable

1. **Attendre que Vercel ET Railway servent le commit.**
   - Railway : `GET https://api.bellum-ai.com/version` → `.commit` (~10 min, il
     peut être DEUX commits en retard)
   - Vercel : le hash de `assets/index-*.js` dans `https://app.bellum-ai.com/`
     doit CHANGER (~2 min)
2. **Reproduire le geste du client**, sur l'écran de l'issue.
3. **MESURER** — compter les occurrences (`t.split(x).length - 1`), lire
   `getBoundingClientRect().top`, comparer `scrollWidth`/`clientWidth`.
4. **Balayer toute la navigation** (règle ZÉRO régression). Le balayage
   client-side est 4× plus rapide : `history.pushState` + `PopStateEvent`,
   4 routes par appel, 8 s chacune.
   ⚠️ `/propositions` (pas `/proposals`) · `/agenda` n'existe PAS comme route.
5. **La salle de démo montre ce que le compte de Louis ne peut pas** — un
   rendez-vous à venir, un journal non vide. `/demo` → « Lancer la démo ».
6. Console + réseau : tout 4xx/5xx est un défaut. ⚠️ Le **503** sur
   `/crm/pipeline/report` est ATTENDU sur l'espace de Louis.
7. **Ne clore que ce qui a été vu tourner.**

---

## État au 04/09/2026 (fin du lot 9)

- **#1538 mergée, déployée, recettée** (`6613449ba`) — `/briefing` devient
  « Aujourd'hui ». **6 issues closes et vérifiées** : #1389 #1390 #1392 #1393
  #1394 #1395. **#1396 gardée ouverte** (logos/avatars dans les priorités).
- **#1539 mergée, déployée, recettée** (`ac9ce4ecd`) — `/actions/sequences`
  devient un cockpit. **4 issues closes et vérifiées** : #1509 #1511 #1512
  #1515. **3 gardées ouvertes** : #1510 #1513 #1514.
- **#1540 mergée** (`30da74b4c`) — deux défauts trouvés **par la seule recette** :
  le semis de démo sautait la moitié de son plan en silence (deux noms qui
  n'étaient pas des contacts), et une étape due AUJOURD'HUI se lisait « En
  retard » dès l'heure passée, pendant que la ligne disait « en attente ».
- ⚠️ **60 issues bêta ouvertes** au dernier décompte — **recompter avant
  d'annoncer**, de nouveaux retours arrivent PENDANT le lot.

### Ce que la recette a trouvé, et que 7 529 tests n'ont pas vu

1. **Le semis de démo à moitié appliqué.** `seedOutreachSequences` cherche par
   NOM et saute proprement ce qu'il ne trouve pas — le bon comportement, qui
   cache exactement l'erreur de saisie. « Camille Roussel » est une CONSULTANTE,
   « Sophie Lemaire » n'existe pas. Garde posée (`demo-outreach-plan.spec.ts`),
   contre-épreuve exécutée. ⚠️ Son corpus a DEUX sources : `DEMO_DOSSIERS` et
   `DEMO_DELIVERY_CLIENT` (le client fictif).
2. **« En retard » le jour même.** Une comparaison en INSTANTS là où le
   commercial compte en JOURS. La clé `detail.stepDue` existait et n'avait
   aucun lecteur — un libellé écrit et jamais rendu.
3. **Faux positif de MA mesure** : `document.querySelector('[role="dialog"]')`
   trouve encore le nœud après fermeture — Radix le garde le temps de
   l'animation. Lire `data-state` et `offsetParent`, pas la présence.

### Ce qui reste, par écran

`/mailbox` (6) ·
`/actions/chaines` (6) · `/watchlist` (5) · `/settings/mes-donnees` (5) ·
`/actions` (5) · `/settings/legal-entities` (4) · `/settings/import` (4) ·
`/settings/catalogues` (4) · `/propositions` (4) · `/contacts` (2) ·
`/missions/*` (3) · `/pilotage` (1 = #1440) · `/chat` (1) · `/accounts` (1) ·
`/actions/ecritures` (1) · `/integrations` (1 = #1445) · `/briefing` (1 = #1396) ·
`/actions/sequences` (3 = #1510 #1513 #1514) · #1472 (le niveau visuel d'ensemble).

### Chantiers à proposer à Louis, pas à décider seul

1. **`subjectLabel` est du contrat MORT** — le champ existe, le serveur l'écrit
   `null` en dur, personne ne l'a jamais rempli.
2. **La famille `?.champ.method(`** — 20+ occurrences dans `apps/web/src`.
3. **Une résolution de domaine vérifiée pour les ESN** — bloque les logos
   partenaires (#1319.3, #1427), de suggestions (#1415) et de comptes (#1396).
4. **Brancher un écrivain sur les compteurs partenaires** (`needs_received_90d`,
   `needs_given_90d`, `placements_active`, `placements_total`).
5. **`SearchInput` (`packages/ui`) n'a AUCUN nom accessible** — `type="text"`
   sans `aria-label`, donc rôle `textbox` et pas `searchbox`. **Trente écrans**
   le montent.
6. **`/agenda` est déclaré dans `mobile-nav.ts` (`owns`) sans exister comme
   route.** Inoffensif aujourd'hui, mais il nomme une adresse qui n'existe pas.
7. **Le bouton de fermeture de `Sheet` (`packages/ui`) a un nom accessible en
   ANGLAIS** — `<span class="sr-only">Close</span>`, en dur, sur une interface
   française. Même famille que `SearchInput` sans nom accessible : un défaut de
   la primitive PARTAGÉE, à traiter à part.
8. **Le statut `failed` d'une séquence est INATTEIGNABLE.** `hasFailure` n'est
   passé par aucun appelant, et `OutreachStepStatus` ne connaît que
   `pending | done | skipped` : rien ne peut produire un échec d'étape. Soit on
   le branche, soit on le retire du contrat.

### Observations à confirmer ailleurs

- **L'axe « territoires » de la carte de couverture affiche des ADRESSES**
  (« 12 CHEMIN DE L'ORMEAU ») là où le contrat annonce la « ville du siège ».
- Plusieurs blocs de `/team` portent leur titre en `Text size="sm"` plutôt qu'en
  `<h2>` : la structure de titres est plate pour un lecteur d'écran.
