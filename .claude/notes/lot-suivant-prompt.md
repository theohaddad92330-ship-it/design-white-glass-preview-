# Prompt de reprise — après le lot du popover (07/09/2026, soir)

Colle ce qui suit tel quel dans une session neuve.

---

/livraison:issues

CONTEXTE — deux lots du 07/09 sont clos. Le matin : #1719 (#1701, la page
blanche), #1720 (back-office robustesse), #1721 (mémoire marché branchée),
#1722 (socle UI back-office), #1723 (registre). Le soir : **#1724 — le
popover « Contexte marché »**, qui règle #1582, débloque #1577 et fait
avancer #1417 d'un seul geste.
Registre : `agent_docs/chantiers-livres.md` §§ « Lot des retours bêta du
07/09 » et « Lot du 07/09 (soir) ».

TRANCHÉ, NE PAS REPOSER

- Les issues ouvertes ont TOUTES une réponse écrite. Lire le commentaire du
  07/09 sur l'issue AVANT toute chose. **~80 sur 93 sont du BACKLOG DE
  CONSTRUCTION, pas des corrections.**
- Le corps de la page ne défile jamais (D81, GA-256). `#app-shell` porte
  `overflow: hidden`.
- GA-07 est AU PLAFOND : toute lecture inter-domaines se compose dans le
  CONTRÔLEUR. La garde nomme ses précédents.
- **La 2ᵉ ligne d'`AccountTableRow` est CLOSE** : plus aucun prétendant, le
  cliquet `accountRowSecondLineIsFull.test.ts` le tient. Ce qui doit
  s'afficher sur un compte passe par le popover « Contexte marché » ou par
  une colonne, jamais par cette ligne.
- **La vue carte de `/accounts` est RETIRÉE** (aucun importeur, morte en
  prod). Ne pas la « rebrancher » : c'est tranché.
- **Pas de ligne « Fit avec ton offre »** dans le popover tant que rien ne
  lit `raw_analysis.scoreAxes` côté web. Le fit vit dans Score / axes.
- Trois prémisses d'issues sont FAUSSES : #1653 (`MAX_PERIODS = 240`, pas
  20), #1665 (le motif d'incarnation EST obligatoire depuis #1670),
  #1667/#1667.3 (`flags/page.tsx` est un évaluateur par client,
  `api/page.tsx` un testeur manuel).
- Six demandes redemandent des refus déjà écrits : #1575, #1605, #1617,
  #1417.2/.3, #1440.5.

DÉCIDÉ AVEC LOUIS LE 07/09 AU SOIR

- **Le back-office se recette par LOUIS.** Il est derrière `DM_BASIC_AUTH` +
  TOTP, saisir des identifiants est interdit. Chaque lot back-office sort
  avec sa fiche de gestes et attend son PASS/FAIL. Modèle :
  `.claude/notes/recette-backoffice-a-faire-par-louis-2026-09-07.md`.
- **Le rollback de `manual-provisioning` n'est PAS dans le lot courant** —
  Louis l'a explicitement remis à plus tard. Il reste le plus urgent du
  palier, et c'est un arrêt obligatoire (facturation).

QUATRE ARBITRAGES ENCORE PARQUÉS

1. Politique de crédits de la mémoire marché (#1639) — recommandation : en
   faire une GARDE (aucun contrôleur du module n'importe `CreditsService`).
2. Alertes par e-mail (#1671.3, #1676) — envoi sortant réel. Anti-répétition
   EN BASE, garde d'environnement non-production.
3. Exception nommée pour l'export CSV (#1672.2), sinon la garde
   `aucun-export-de-donnees-personnelles` rougit.
4. `/admin/market-memory` (#1616) — cloisonnement d'accès à trancher, et
   « rollback » sur donnée PARTAGÉE croise « on archive, on ne supprime pas ».

RESTE À VÉRIFIER (jamais prouvé)

- **#1667, #1662, #1664, #1642, #1643** : livrés, CI verte, **comportement non
  vu**. La fiche de recette est écrite, elle attend Louis.
- **#1596.3** (Laura reçoit `observed`) : livré, non vérifié — le prouver
  demande d'envoyer un message à Laura, facturé et plafonné à 50/jour.
- Le mobile : jamais vérifiable depuis un navigateur piloté.

PREMIER LOT SUGGÉRÉ — la trésorerie, et l'ordre de dépendance est MESURÉ

**#1649 + #1645 d'abord**, et pas l'inverse : #1646 (l'accueil), #1651
(`/revenus`), #1652 (`/revenus/clients`) et #1653 en dépendent tous les
quatre, et afficheraient sinon « non mesuré » sur deux tuiles sur six dès le
premier jour.

- **#1645** — module `business-metrics`, table d'INSTANTANÉS mensuels jamais
  recalculés. La règle absolue : le MRR n'inclut QUE le récurrent ; les
  clients « sur facture » ont leur propre ligne `contractedRevenue`, affichée
  À CÔTÉ, jamais additionnée sans le dire. ⚠️ **Facturation = arrêt
  obligatoire** : la table et sa lecture se font, la moindre ÉCRITURE qui
  touche à un montant facturé se pose à Louis.
- **#1649** — `/revenus/tresorerie`, trois champs saisis à la main, burn et
  runway DÉRIVÉS. Un mois non saisi produit « non mesuré », jamais une
  estimation ; le burn moyen exige au moins 2 mois.

**Puis #1681 AVANT #1682→#1688.** C'est une doctrine (« on mesure le PRODUIT,
pas la PERSONNE » — agrégation minimale à 5 sessions, aucun contenu, aucun
rejeu de session, hash de session tourné à 24 h, et surtout **aucune métrique
comportementale par espace client nommé**). Sept écrans se construiraient
sinon sur du sable. Elle demande une ratification de Louis et une entrée dans
`doctrine-registry.ts` — l'issue dit elle-même « je pose le cadre technique,
pas l'avis juridique ».

PIÈGES D'OUTILLAGE À NE PAS REPAYER

- `ls` rend du VIDE dans le bac à sable → `/usr/bin/find`.
- Un `grep --include=*.ts` NON QUOTÉ sous zsh échoue avec « no matches
  found » et ne cherche RIEN → toujours `--include='*.ts'`.
- `git diff --name-only` via RTK rend une sortie VIDE → `/usr/bin/git`, et
  mesurer le CONTENU, jamais le SHA.
- `git log -1 <sha>` peut rendre un AUTRE commit → `git cat-file -p` /
  `git rev-list`.
- `node .../jest.js <chemin> --rootDir apps/api` depuis la racine casse le
  parseur (babel au lieu de ts-jest) → lancer depuis `apps/api`.
- `element.click()` n'ouvre PAS un Popover Radix en test (pas d'`act()`) →
  `fireEvent.click`.
- **Un cliquet qui tombe se mesure d'abord sur `origin/main` PROPRE**
  (`git stash -u`, la garde seule, `git stash pop`) avant de conclure que
  c'est son lot qui l'a fait monter. GA-19 était rouge sur main.
- `MEMORY.md` dépasse sa limite (26,2 Ko pour 24,4) : une partie n'est plus
  chargée au démarrage. À compresser.
