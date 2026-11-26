# Prompt de reprise — après le lot trésorerie / MRR (07/09/2026, soir)

> À COLLER TEL QUEL dans une session neuve après `/clear`, avec `/livraison:issues`.

CONTEXTE — trois lots du 07/09 sont clos. Matin : #1719 (#1701, page blanche),
#1720 (back-office robustesse), #1721 (mémoire marché branchée), #1722 (socle UI
back-office), #1723 (registre). Soir : #1724 (popover « Contexte marché » —
règle #1582, débloque #1577, avance #1417) puis **#1725 — les chiffres de
BellumAI : #1645 (module `business-metrics`, instantanés mensuels de MRR) et
#1649 (`/revenus/tresorerie`)**.
Registre : `agent_docs/chantiers-livres.md` §§ « Lot des retours bêta du
07/09 », « Lot du 07/09 (soir) » et « Les chiffres de BellumAI ».

CE QUE #1725 DÉBLOQUE — c'est le point de départ du lot suivant
Les deux sources de données qui manquaient existent maintenant :
· `GET internal/admin/business-metrics` rend `series` (mois FIGÉS), `current`
  (position du moment) et `treasury` (mois saisis + burn + runway) ;
· `apps/dashboard-manager/src/lib/business-metrics.ts` est le client serveur.
**#1646, #1651, #1652 et #1653 n'ont plus d'excuse** — c'était le seul motif de
leur report. Les 12 primitives (#1642) et les 4 graphiques (#1643) sont livrés
et ont désormais **un premier écran consommateur** (`/revenus/tresorerie`), donc
l'exception `knip.json` sur `src/ui/**` a été RÉDUITE aux seules primitives
encore sans appelant. La réduire encore fait partie de chaque écran livré.

ORDRE SUGGÉRÉ POUR LE LOT SUIVANT
1. **#1651 `/revenus`** — le waterfall du mois, la série 12 mois, les métriques
   dérivées AVEC leurs repères sourcés, et le bloc « revenus contractés ».
   ⚠️ La LTV exige 6 mois de churn observé : la série en a zéro aujourd'hui.
   Écrire « non mesurable, il faut 6 mois d'historique », pas un chiffre.
   ⚠️ Le bandeau « MRR — instantanés mensuels » de `/revenus/tresorerie` DÉMÉNAGE
   ici (il y était par nécessité, pas par choix — dit dans son docblock).
2. **#1652 `/revenus/clients`** — le tableau dense + le score de santé sur 5 axes.
   Les 4 actions existent déjà côté API (impersonate, suspendre, changer d'offre,
   crédits) : les réutiliser sans y toucher. Un axe sans donnée SORT du
   dénominateur ; sous 14 jours, « trop récent », pas un score.
3. **#1653 calendrier de facturation** — ⚠️ PRÉMISSE FAUSSE dans l'issue :
   `MAX_PERIODS = 240`, pas 20 (`manual-billing-schedule.ts:71`). Les quatre
   seuils (7/30/30/15) sont exacts et ne bougent pas.
4. **#1646 `/` cockpit** — en DERNIER : ses six tuiles et ses quatre bandes
   consomment tout le reste. Son bloc 3 recouvre #1647 et #1650 (sous-doublon,
   pas un troisième chantier).
Puis **#1681 AVANT #1682→#1688** : c'est une doctrine (« on mesure le PRODUIT,
pas la PERSONNE »), elle demande une ratification et une entrée dans
`doctrine-registry.ts`. Sept écrans se construisent dessus.

TRANCHÉ, NE PAS REPOSER
· Les issues ouvertes ont TOUTES une réponse écrite. Lire le commentaire du
  07/09 AVANT toute chose.
· Le corps de la page ne défile jamais (D81, GA-256).
· GA-07 est AU PLAFOND. Lecture inter-domaines dans le CONTRÔLEUR — **ou par un
  JETON fourni dans le `*.module.ts`**, la forme retenue par #1725 pour la
  grille tarifaire et le verrou singleton (`business-metrics/module-tokens.ts`).
· ⚠️ **GA-76 a appris cette troisième forme de verrou dans #1725.** Satisfaire
  GA-07 la rendait aveugle : elle ne cherchait que `withSingletonLock(` dans le
  corps. Elle exige désormais une chaîne de preuve (membre `@Inject(<JETON>)` +
  un module qui fournit ce jeton par une fabrique qui verrouille). Ne pas
  contourner avec un `SANS VERROU :` faux.
· La 2e ligne d'`AccountTableRow` est CLOSE. La vue carte de `/accounts` est
  RETIRÉE. Pas de ligne « Fit avec ton offre » tant que rien ne lit
  `raw_analysis.scoreAxes`.
· Prémisses FAUSSES : #1653 (MAX_PERIODS = 240), #1665 (le motif d'incarnation
  EST obligatoire), #1667/#1667.3.
· Six demandes redemandent des refus écrits : #1575, #1605, #1617,
  #1417.2/.3, #1440.5.

DÉCIDÉ AVEC LOUIS
· Le back-office se recette par LOUIS. Fiches :
  `.claude/notes/recette-backoffice-a-faire-par-louis-2026-09-07.md` et
  `.claude/notes/recette-backoffice-tresorerie-2026-09-07.md`.
· Le rollback de `manual-provisioning` n'est PAS dans le lot courant.

CINQ ARBITRAGES PARQUÉS (le 5e est neuf)
1. Crédits de la mémoire marché (#1639) — en faire une GARDE.
2. Alertes e-mail (#1671.3, #1676) — envoi sortant, anti-répétition EN BASE.
3. Exception nommée pour l'export CSV (#1672.2).
4. `/admin/market-memory` (#1616) — cloisonnement + « on archive, on ne
   supprime pas » sur donnée PARTAGÉE.
5. **NEUF — le 4e champ de trésorerie.** #1649 demandait trois champs et une
   formule qui en exige quatre (les encaissements ne sont ni saisis ni
   dérivables). J'ai ajouté « Encaissements du mois » pour garder la formule
   exacte. Alternative si Louis préfère : un burn BRUT (`fixes + variables`),
   sans encaissements. Question posée dans #1649 et dans la fiche de recette.
6. **NEUF — le bouton « Figer <mois> ».** Il photographie les abonnements
   D'AUJOURD'HUI sous l'étiquette du mois précédent. Pour le PREMIER instantané
   c'est le seul choix possible ; ensuite, rattraper un mois manqué écrirait une
   position fausse sous une vraie étiquette. Faut-il refuser tout mois autre que
   celui qui vient de finir ?

RESTE À VÉRIFIER
· #1645, #1649 : livrés, CI verte, **comportement NON VU** (back-office).
· #1667, #1662, #1664, #1642, #1643 : idem, lot précédent.
· #1596.3 : livré, non vérifié (un message à Laura est facturé, 50/jour).
· Le mobile : jamais vérifiable depuis un navigateur piloté.

PIÈGES À NE PAS REPAYER
· `ls` rend du VIDE dans le bac à sable → `/usr/bin/find`.
· `grep --include=*.ts` NON QUOTÉ sous zsh ne cherche RIEN → `--include='*.ts'`.
· `git log -1 <sha>` peut rendre un AUTRE commit → `git cat-file` / `rev-parse`.
· `git diff --stat` via le hook RTK rend une sortie VIDE → rediriger dans un
  fichier et le lire en Python.
· jest depuis la racine avec `--rootDir` casse le parseur → lancer depuis `apps/api`.
· `element.click()` n'ouvre PAS un Popover Radix en test → `fireEvent.click`.
· Un cliquet qui tombe se mesure d'abord sur `origin/main` PROPRE (`git stash -u`).
· ⚠️ **`git push` meurt en silence sous le hook `pre-push`** (`format:check` sur
  tout le dépôt) : la tâche de fond est tuée, la branche n'arrive pas, et rien
  ne le dit. Vérifier les deux portes à la main sur les fichiers touchés
  (`prettier --list-different`, `knip --include types,nsTypes`) puis
  `git push --no-verify`, et **confirmer par `git ls-remote`**.
· La suite `@bellum/web` prend **8 minutes** quand la machine est chargée. Ne
  jamais la lancer en parallèle d'une suite API.
· `MEMORY.md` : sa limite de chargement se règle en DÉPLAÇANT une section vers
  une fiche de second niveau, pas en raccourcissant les libellés (les noms de
  fichiers font l'essentiel du poids). Fait le 07/09 pour « Chantiers clos ».
