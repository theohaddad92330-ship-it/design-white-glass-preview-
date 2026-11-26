/issues

Lot 2 — 20 issues. Les décisions sont prises, il n'y a plus qu'à exécuter.

## Les maquettes — à récupérer AVANT tout point de design

Drive de Théo, dossier **« AOUT 2026 BELLUMAI »** :
`https://drive.google.com/drive/folders/1CufvnbgQfLA1886xsQRozt8WA44sbbeU`

⚠️ **Les maquettes sont éparpillées** — Louis : « elles sont un peu partout ».
Explorer les CINQ sous-dossiers, pas seulement le plus récent :

| Sous-dossier | Ce que j'y ai vu |
| --- | --- |
| Lundi 24 août | non exploré |
| Mercredi 26 août | non exploré |
| Jeudi 27 août (`1A0QzLgA8PjP8RcmSoB23iSTlWCgqfxou`) | `MAQUETTES_ORGGRAPH_FINAL_2026-08-27.pdf` (492 Ko), six PNG de vues (`01_vue_focale…` → `06_export_pdf_organigramme`), `BELLUMAI_27-AOUT-2026_v3.zip` (25,5 Mo), trois PDF `PDF-22` |
| CRM BASE RAG CLIENTS | non exploré |
| Lundi 31 août (new Bellum) | non exploré — le plus récent, à ouvrir en premier |

Le navigateur est déjà connecté au compte de Louis.
⚠️ Le double-clic sur une ligne de Drive rate souvent : l'ordre des lignes change
entre le rendu et le clic. Passer par `find` pour obtenir la `ref`, puis
`scroll_to` avant de cliquer — ou ouvrir le dossier par son URL directe.
⚠️ Un fichier de plus de 25 Mo : `drive.usercontent.google.com/download?id=<ID>&export=download&confirm=t`,
jamais un téléchargement qui déverse du base64 dans le contexte.

→ débloque **#1472** et tous les points « niveau visuel » des issues.

## Décisions de Louis, déjà tranchées — ne pas les re-poser

1. **#1320 — chat démo** : coque RÉELLE, conversation VIDE.
   `isDemo` doit choisir le MOTEUR, plus l'écran. Aujourd'hui la route fait
   `isDemo ? <DemoChat /> : <Chat />` — 206 lignes de coque parallèle.
   Cible : `<Chat />` en démo aussi (colonne de conversations, portée dans
   l'entête, mémoire, transparence), fil qui démarre VIDE avec ses amorces, et
   le script `DEMO_CHAT_PROMPTS` se déroule au clic d'une amorce. Zéro appel
   Claude. `DemoChat.tsx` disparaît ; ses graphes (`DemoBarChart`) doivent
   survivre dans le rendu de réponse.

2. **#1324 — KPI /projects** : 4 cartes qui GARDENT la sémantique.
   Chaque carte conserve son « au moins », son « non mesuré » et son
   dénominateur. Format demandé, règles préservées. Pas 4 chiffres nus.

3. **#1473 — contact sans entreprise** : OUI, Louis le veut.
   Chantier réel : migration (`contacts.account_id` nullable, contrainte SQL
   élargie AVANT le code qui écrit), puis les 7 lectures qui en dépendent —
   fiche contact, onglet Contacts d'un dossier, logo emprunté au compte,
   favoris, couverture d'organigramme, matching, export — plus la démo et les
   gardes. Un contact sans compte va dans « À qualifier ».

## Les 20 issues

- **Décidées, à livrer (3)** : #1320 · #1324 · #1473
- **Débloquée par les maquettes (1)** : #1472
- **Série Projets / Portefeuille / Besoins (13)** : #1323 #1325 #1326 #1327
  #1328 #1329 #1330 #1331 #1332 #1333 #1334 #1335 — et #1322 si la PR #1474
  n'est pas mergée.
- **À vérifier puis clore (3)** : #1321 (borne à 6 amorces livrée, invérifiable
  depuis la salle de démo qui monte `DemoChat` — vérifiable une fois #1320
  fait) · #1322 (PR #1474) · #1472 une fois les maquettes lues.

⚠️ **La série est UN chantier sur TROIS écrans**, pas treize passes.
Diagnostiquer les 13 d'abord, livrer par écran ensuite.

## État à la reprise

- PR **#1474** (#1322, bande de décision Pilotage) : en CI, à merger.
- **5 issues closes et vérifiées en prod** : #1315 #1316 #1317 #1318 #1319.
- 7 PR mergées dans la session précédente.
- Repartir de `origin/main` FRAIS (`git fetch` puis brancher sur `origin/main`).

## Pièges payés dans la session précédente — ne pas les repayer

- **`pnpm --filter @bellum/web check-types` est la vraie porte** : `tsc -p
  apps/web/tsconfig.json` NE LIT PAS les tests, et la CI, si. Idem API :
  `pnpm --filter @bellum/api check-types:tests`.
- **Le changelog conflicte à CHAQUE rebase.** Garder les DEUX entrées, puis
  vérifier l'accolade fermante : deux insertions adjacentes au même point
  d'ancrage laissent une entrée NON FERMÉE, que prettier voit comme une erreur
  de syntaxe et que le test du changelog ne voit pas (il ne s'exécute même pas).
- **Le `QueryClient` de `renderWithRouter` est un SINGLETON de module** : une
  assertion synchrone après `findBy…` lit l'état du test PRÉCÉDENT → `waitFor`.
- **Le mock `framer-motion` en Proxy doit MÉMORISER ses composants** — corrigé
  dans les 22 fichiers ; ne pas réintroduire le motif sans cache. Sans lui, un
  clic passe, le `setState` est appelé, et l'écran entier disparaît du DOM.
- **Une garde ancrée sur UNE LIGNE de requête tombe au premier alias.** Ancrer
  sur ce qu'elle protège (`FROM accounts`), pas sur la mise en forme.
- **`rg` et `ls` sont interceptés** dans ce shell (RTK) : `ls -la` rend vide,
  `rg -l` casse. Passer par `find`, `grep -rn`, `python3`.
- **Le cwd du Bash PERSISTE** entre les appels.
- **La CI ne se déclenche que sur une PR**, et un merge sur `main` peut tuer la
  CI d'une PR ouverte : si aucun run n'apparaît, rebaser sur `origin/main` frais.
- **Le check Railway d'une PR échoue toujours** — merger sur les checks GitHub.
- **Les fils d'issue sont PÉRIMÉS** : #1318 `.1` disait « à faire », c'était
  livré depuis le 02/09. Vérifier le CODE, jamais le commentaire.

## Rappels de méthode

- Rien ne se clôt sans avoir été vu tourner **en production** dans Chrome, avec
  le geste du client, la nav balayée en entier, console et réseau propres.
- Un point écarté se dit, avec sa règle. Un point reformulé se dit, avec quoi.
- **Un blocage transverse mérite son propre fil** plutôt que de tenir quatre
  issues ouvertes (c'est ce qui a donné #1472 et #1473).
- **Chercher l'APPELANT, pas la fonction** : le défaut n°1 du dépôt est du code
  juste que personne n'appelle. Quatre points du lot 1 étaient déjà construits.
- **Borner l'affichage ≠ retirer l'accès** : ce qui sort de la vue doit garder
  une porte, sinon c'est « une réponse juste sans chemin ».
