# Reprise — les 100 issues du 06/09 (back-office + mémoire marché)

## 1. Ce qui est TRANCHÉ — ne pas reposer

- **Les 100 issues ouvertes ne sont pas 100 retours** : ce sont **DEUX documents**
  découpés par le widget. 53 sur la mémoire marché (#1417 → #1640), 47 sur la
  refonte du back-office (#1642 → #1688). Les titres sont des en-têtes de section
  (« CONTEXTE », « CE QUE JE VEUX ») et ne désignent PAS le sujet.
  ⚠️ Le texte HUMAIN médian fait ~1 000 caractères, max 3 191 : trier au volume
  conclut « zéro spec », à tort.
- **Louis, 06/09** : les deux documents avancent **EN PARALLÈLE**. C'est tenable
  ici parce qu'ils déploient sur des services DISJOINTS — le back-office a son
  propre projet Vercel (`belllum-monorepo-dashboard-manager`), la mémoire marché
  passe par web + api. Un défaut dit donc encore lequel des deux l'a causé.
- **Louis, 06/09** : #1668 + #1669 (auth, sessions, rôles) = **lot dédié APRÈS le
  socle de design**, schéma soumis avant écriture (arrêt obligatoire §10).
- **Louis, 06/09** : #1679 et #1680 fermées en doublons de #1678 (texte humain
  strictement identique — le widget a triplé le même morceau).
- **#1654 (facture légale) ne démarre pas**, deux verrous indépendants : Louis
  exige lui-même une validation comptable, ET `.claude/projet.md` §8 porte le
  refus permanent « aucune facture légale n'est émise ». #1653 et #1655 sont
  livrables sans lui.
- **#1642 : les devDependencies ne sont pas l'interdit.** « Aucune dépendance
  ajoutée » vise ce qui PART DANS LE NAVIGATEUR (« le manager reste léger »).
  vitest + @bellum/tooling sont entrés en devDependencies, l'écart est dit dans
  le commit et dans l'issue. L'interdit sur les librairies de COMPOSANTS est
  tenu par une garde.

## 2. RECETTÉ en production

- **PR #1699 — le filet du back-office.** Mergée. Production Vercel sur le bon
  commit. **Recette live BLOQUÉE** : Basic Auth à secret partagé (401), verdict
  **BLOCKED (configuration)**, jamais FAIL. Le 401 prouve quand même que l'app
  tourne (sans identifiants configurés le middleware rendrait 503).
- **PR #1700 puis #1703 — #1577.** La donnée est livrée et VÉRIFIÉE en prod
  (`GET /accounts` : champ présent 25/25, **15 comptes couverts** — ROCHE 16,
  PREVOIR 3, FRANCE TELEVISIONS 113, `null` jamais 0 ailleurs). **Le fragment
  visible a été retiré après mesure** : la 2e ligne fait 159 px pour 679 px de
  besoin, « 64 parcours observés » tenait dans 7 px. #1577 reste OUVERTE —
  aucune surface ne montre la donnée.
- **PR #1702 — restauration de `.claude/projet.md`** §12/§13, que ma PR #1700
  avait supprimées (132 lignes). Reposées, vérifiées sur `origin/main`.
- **Balayage ZÉRO régression fait** : Aujourd'hui, Comptes, Projets, Vivier,
  Missions, Actions, Pilotage, Paramètres — tous rendent, aucune erreur console.

## 2 bis. MERGÉ mais pas encore recetté

- **PR #1699 — le filet du back-office.** Mergée, contenu vérifié sur `origin/main`,
  production Vercel sur le bon commit. **La recette live est BLOQUÉE** : le
  back-office est derrière un Basic Auth à secret partagé (401), et seul un
  porteur du secret peut y entrer. Verdict **BLOCKED (configuration)**, jamais FAIL.
- **PR #1700 — #1577, les parcours observés sur la ligne de compte.** À recetter
  sur `app.bellum-ai.com/accounts` après déploiement.

## 3. JAMAIS vérifié — ne pas compter comme fait

- **Tous les écrans du back-office.** Aucun n'a pu être ouvert de cette session.
  Le mur tombe avec #1668.
- **Le fragment « N parcours observés » sur de la vraie donnée** : il n'apparaît
  que si le corpus de mémoire marché couvre les comptes. **L'ingestion de
  production reste à Louis** — corpus vide ⇒ aucun fragment nulle part, ce qui
  est la vérité de l'état d'ingestion et pas un écran à réparer.

## 3 bis. Les DEUX défauts trouvés que personne n'avait demandés

1. **La 2e ligne de `/accounts` est saturée à 4,3×** — 159 px disponibles,
   679 px demandés. Le SECTEUR d'un compte s'affiche dans 89 px pour 423 requis,
   sur toutes les lignes, et **c'est antérieur à ce lot** (secteur + effectif
   demandaient déjà 561 px). Tout ajout sur cette ligne — #1582 compris — sera
   rendu ET illisible. Signalé sur #1417 avec trois pistes.
2. **`AccountsGrid` / `AccountCard` ne sont rendus par personne** — importés par
   aucun fichier, seulement mentionnés dans un commentaire (contrôle positif :
   `AccountTableRow` a bien son importeur). **La vue carte de `/accounts` est du
   code mort.** À rebrancher ou à retirer.

## 4. Ce qui RESTE — le découpage

### Back-office (46 issues ouvertes)
1. **Les producteurs, d'abord** : #1642 (12 primitives dans `src/ui/`, CSS
   modules, zéro dépendance), #1643 (LineChart / StackedBar / WaterfallChart /
   CohortGrid, SVG pur), #1672 (le `DataTable` — 9 pages sur 24 en dépendent),
   #1673 (filtres en pilules + ⌘K), #1675 (logo + badge d'environnement).
   ~30 autres issues les consomment : socle §6, le producteur d'abord.
2. Puis le rail à 6 sections (#1644) et le cockpit (#1645 → #1652).
3. Lot auth dédié : #1668, #1669, puis #1666, #1670, #1671.
4. Analytique produit : #1682 → #1688, **contrainte par #1681** (relecture
   juridique à faire par Louis).

### Mémoire marché (53 issues)
- **Prochain lot naturel — le même écran, les mêmes fichiers** (`accounts-list/`) :
  **#1575** (5ᵉ compteur), **#1582** (popover « Contexte marché »), **#1576**
  (les 5 raisons de « comptes proches »).
- ⚠️ **#1575 porte une PRÉMISSE FAUSSE, à trancher avant de coder.** L'issue dit
  « le compteur affiche 0 et reste cliquable — cohérent avec ce qui existe ».
  Le code dit l'inverse : **#1580 a décidé qu'une métrique décisionnelle à zéro
  est NEUTRE et non cliquable** (« filtrer vers une population vide n'aide
  personne »). Question à poser à Louis.
- ⚠️ **#1575 est aussi le plus cher** : les quatre compteurs actuels sont des
  `COUNT(*)` **sur tout le filtre**. Le cinquième doit passer par l'arbitre
  `resolveMarketCompany` (#1617) — le refaire en SQL recréerait le défaut que
  #1617 vient de corriger. Chemin retenu : une méthode du service accounts qui
  rend les lookups du filtre, puis `pathsFor` **dans le contrôleur**, et le
  compteur `undefined` (donc non rendu) au-delà d'une borne — c'est la sémantique
  « je n'ai pas pu compter » qui existe déjà.
- **#1472 laissée ouverte : son corps est VIDE** (0 caractère). Commentée, en
  attente de ce que Louis voulait montrer.

## 5. Les pièges payés dans ce lot — à ne pas repayer

- **Le typecheck des tests de l'API est un script SÉPARÉ.** J'ai lancé un `tsc`
  à la main (et avec le binaire d'`apps/web`) : vert en local, **rouge en CI**.
  La seule commande qui compte : `pnpm --filter @bellum/api check-types:tests`.
- **`jest.fn(async () => …)` sans paramètre déclaré** type `mock.calls` en `[][]` :
  `calls[0][0]` échoue au typecheck des tests, et nulle part ailleurs.
- **`origin/main` a été RÉÉCRIT** en cours de session : mon commit de merge a
  disparu de l'historique et le commit d'une AUTRE session est tombé. Vérifier le
  **CONTENU** servi (`git show origin/main:<fichier>`), jamais le SHA.
- **`git add -A` embarque le travail des sessions concurrentes.** 132 lignes de
  `.claude/projet.md` sont entrées dans mon commit. `git restore
  --source=origin/main -- <chemin>` puis `--amend`.
- **`--include=*.tsx` non quoté sous zsh** : la glob s'étend, `grep` ne tourne
  pas, et `wc -l` rend **0** — un faux zéro qui ressemble à une réponse.
- **`$FILES` passé à prettier** arrive comme UN seul argument : `rc=2`, l'outil
  plante, ce n'est pas un « rien à formater ».
- **GA-07 exclut les `.controller.ts` et les `.module.ts`.** C'est ce qui rend
  l'orchestration dans le contrôleur gratuite pour le cliquet — et c'est aussi
  ce que la garde recommande elle-même.
