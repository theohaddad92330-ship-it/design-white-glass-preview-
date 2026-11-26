# Manifeste — le palier back-office, les 24 issues ouvertes (08/09/2026)

Demande de Louis, 08/09 : « fais un lot en parallèle sur les 24 du back-office,
qu'on couvre tout maintenant ; implémente tout en parallèle et fais la partie
testing sur main une seule fois, pour ne pas avoir trop de shells d'un coup. »

## Les 24, par famille

| Famille | Issues |
| --- | --- |
| Socle UI | #1642 #1643 #1672 #1673 #1674 |
| Écrans revenus / offres / flags | #1646 #1656 #1667 #1655 #1648 |
| Opérations & sécurité | #1665 #1669 #1671 #1676 #1678 |
| Analytique produit — socle | #1681 #1682 #1657 #1683 |
| Analytique produit — écrans | #1684 #1685 #1686 #1687 #1688 |

## Vague A — éclaireurs (lecture seule, aucun `git`)

| # | Périmètre | Rend |
| --- | --- | --- |
| A1 | socle UI | statut par point, `fichier:ligne` + appelant |
| A2 | écrans revenus/offres/flags | idem |
| A3 | opérations & sécurité | idem, + « une route d'écriture refuse-t-elle un viewer ? » |
| A4 | analytique produit — socle | idem, + ce qui est `DÉCISION` (relecture juridique) |
| A5 | analytique produit — écrans | idem, + **donnée d'entrée présente / absente** |

Raison de la vague A : `src/ui/` porte DÉJÀ les 12 primitives, `guard.ts` cite
DÉJÀ la phrase de #1669, `/produit/onboarding` et `/securite` existent. Dispatcher
24 agents d'écriture aurait recodé du livré — le défaut n°1 du dépôt.

## Ce qui est DÉJÀ tranché, et qu'on ne repose pas

- **#1654 (facture légale) ne démarre pas** — refus permanent du dépôt, ET Louis
  exige une validation comptable. #1653 / #1655 sont livrables sans lui.
- **#1642 : les devDependencies ne sont pas l'interdit.** « Aucune dépendance »
  vise ce qui PART DANS LE NAVIGATEUR.
- **#1681 : le cadre technique se code, l'avis juridique est à Louis.** Les cinq
  règles vivent déjà dans `packages/contracts/src/schemas/product-analytics-privacy.ts`
  (GA-240 / GA-241). La relecture RGPD est `DÉCISION`, pas `ABSENT` — elle ne
  bloque pas le code qui respecte les règles déjà écrites.
- **La recette du back-office reste BLOCKED (401 Basic Auth)** : Louis la fait
  lui-même. Aucune de ces 24 ne se clôt sur une vérification que je n'ai pas pu
  faire — verdict BLOCKED (configuration), jamais FAIL.

## Correction d'une fiche mémoire PÉRIMÉE

`app-hors-de-tout-job-de-test.md` disait « `apps/dashboard-manager` est hors de
tout job de test ». **C'est FAUX au 08/09** : `.github/workflows/ci.yml:611` lance
`turbo test --filter=@bellum/dashboard-manager`, le job s'appelle `Test (back-office)`
et il tourne (relevé sur la PR #1764). L'app porte 54 fichiers de test.

---

## Le gel du traceur a été LEVÉ — 08/09/2026 au soir

La décision du matin (`decisions-louis-2026-09-08.md` §4) gelait six issues
(#1682, #1683, #1684, #1685, #1687, #1688) jusqu'à la relecture juridique RGPD.
**Louis l'a levée le soir même**, la contradiction lui ayant été posée avec les
deux versions citées : « je lève le gel, code tout ».

⚠️ **Ce que la levée ne dit PAS** : que la relecture a eu lieu. Elle reste due.
Le cadre technique (`product-analytics-privacy.ts`, GA-240 / GA-241) existe et
n'a jamais été le blocage — c'était l'avis juridique, et il l'est encore.
Aucun commit, aucun commentaire d'issue ne doit laisser croire l'inverse.

## Vague B — les agents d'ÉCRITURE (worktrees, périmètres disjoints)

| # | Lot | Périmètre | Interdits marquants |
| --- | --- | --- | --- |
| B1 | DataTable + `Delta` branché (#1672, #1642.6, #1674.7) | `src/ui/DataTable.*`, `Delta.*`, `queues/**`, `cockpit-business-panel.tsx` | `globals.css`, `charts.tsx`, `architecture/**`, `FilterBar.*` |
| B2 | Filtres, ⌘K, runbook, visite guidée (#1673, #1678.2/.3) | `src/ui/FilterBar.*` (neuf), `_components/global-search.*`, `side-rail`, `layout`, `users/**`, `revenus/clients/**`, `runbook/**` | `DataTable.*`, `globals.css`, `charts.tsx`, `architecture/**` |
| B3 | Accessibilité AA + 3 seuils (#1674, #1642.4/.5) | `globals.css`, `charts.tsx`, `architecture/**`, `reduced-motion.test.ts`, les `font-size` de `src/ui/*.module.css` | tout le reste de `src/ui`, `side-rail`, les pages |
| B4 | Sécurité, alertes, dépendances (#1671.3/.4, #1676, #1665.2) | `api/modules/admin/backoffice-access-journal*`, `api/modules/backoffice-alerts/**` (neuf), `api/modules/impersonation/**`, `app/securite/**`, `impersonations/**`, `dependances-manager/**` | `src/ui/**`, `globals.css`, `architecture/**`, les autres modules d'API |
| B5 | Mouvements du mois, flags/bandeaux/api, rapport hebdo (#1646.6, #1667, #1648) | `app/flags/**`, `banners/**`, `api/page.tsx`, `cockpit-business*`, `lib/decision-queue.ts`, `lib/admin.ts`, `api/modules/business-metrics/**`, un service NEUF dans `api/modules/notifications/` | `admin/**`, `impersonation/**`, `src/ui/**`, `architecture/**` |
| B6 | **Le traceur produit — le PRODUCTEUR** (#1682, #1681.4) | `apps/web/src/lib/product-tracker*`, `contracts/…/product-analytics-privacy.ts`, `api/modules/analytics/**`, une entité + une migration, `api/src/architecture/**` | **tout `apps/dashboard-manager`** — les 5 écrans sont un autre lot |

**Vague C, après B6** : les cinq écrans qui CONSOMMENT le traceur (#1683, #1684,
#1685, #1687, #1688) plus #1657 et #1686.2/.3. Ils ne partent pas en même temps
que B6 : deux lots qui se croisent sur un contrat d'événement en produisent deux.

### Réservations, pour éviter les collisions entre agents isolés

| Ressource | Réservé à |
| --- | --- |
| Horodatages de migration `1789000000000–1789099999999` | B5 |
| Horodatages de migration `1789100000000–1789199999999` | B6 |
| Numéros de garde `GA-264`, `GA-265` | B6 (GA-263 vient d'être prise par le lot Laura) |
| `packages/contracts/src/changelog/**` et `CLAUDE.md` | **l'intégrateur seul** — ils conflictent à chaque vague |

## Ce que les agents laissent à l'intégrateur (à traiter, pas à archiver)

### B1 — DataTable (`025546761`, branche `feature/bo-datatable`) — VÉRIFIÉ
Commit réel, 9 fichiers, conformes au rapport. Livré : pagination serveur DANS
`DataTable` (branchée sur `/queues`), virtualisation maison au-delà de 200
lignes, `status='error'` rendu ATTEIGNABLE sur un vrai chemin d'échec, hauteur
de ligne 32 px, `scope="col"`.

1. ⚠️ **L'export CSV (#1672.6) n'est PAS livré, et le motif est bon.** La garde
   `src/architecture/aucun-export-de-donnees-personnelles.test.ts` (#1670.5)
   interdit tout mécanisme de téléchargement dans le manager. Et le défaut était
   réel : la conception passait par le `sortValue` de chaque colonne, or pour une
   colonne d'e-mail masqué le `sortValue` porte **l'adresse EN CLAIR**
   (`users-table.tsx:117`) — pour pouvoir trier pendant que `MaskedEmail` masque
   l'affichage. Un export générique aurait donc **exfiltré les adresses réelles**
   depuis un composant partagé. **Décision produit à poser** : soit une exception
   nommée dans la garde, soit un accesseur d'export par colonne dont on prouve
   qu'il n'est jamais la valeur brute.
2. **Une régression d'i18n introduite par le lot** : « ← Précédent » / « Suivant → »
   sont en français en dur. `/queues` est le SEUL écran bilingue qui utilise
   `DataTable`, et son ancien pagineur n'avait aucun mot à traduire. À passer par
   `lib/i18n.ts` — hors du périmètre de B1.
3. **Collision de numérotation à réconcilier** : `#1672.4` et `#1672.6` étaient
   DÉJÀ employés dans le code pour d'autres sous-fonctions (le compteur de
   recherche, le bandeau d'état partiel). Les sous-numéros de #1672 ont été
   réattribués sans mettre à jour les commentaires antérieurs.
4. **Un commentaire FAUX corrigé au passage** : `src/ui/index.ts` affirmait
   « Delta reste sans appelant ». Il en a un — `KpiTile` le rend un niveau plus
   bas, ce qu'un `grep '<Delta' src/app` ne voit pas. Le commentaire avait été
   écrit **deux minutes avant** le commit qui le contredisait.
   `Heatmap` reste, lui, réellement orphelin : dit, pas inventé.

### B2 — Filtres, ⌘K, runbook, visite (`f15cde3d3`, `feature/bo-filtres-recherche`) — VÉRIFIÉ
Commit réel, 23 fichiers, conformes au rapport. 246 tests verts sur son périmètre,
322 en l'élargissant aux gardes.

**Collision de fichier avec B1 : `apps/dashboard-manager/src/ui/index.ts`** — les
deux y ajoutent des exports. Fusion triviale, mais elle est à faire à la main.

À reprendre à l'intégration :
1. **`FilterBar` n'a que DEUX consommateurs sur cinq.** `monitoring/_components/filters.tsx`,
   `queues/page.tsx` et `audit/_components/audit-filtres.tsx` étaient hors de son
   périmètre. Trois implémentations divergentes → une, plus deux non touchées :
   le lot RÉDUIT la dette, il ne la solde pas. **À dire dans l'issue #1673.**
2. **La recherche d'espaces ne relie pas un espace à sa fiche ESN** : le champ
   `search` de `fetchAdminWorkspaces` ne matche que `w.name` côté API
   (`admin.service.ts:305`). Noms différents ⇒ pas de rapprochement. C'est la
   même famille que « deux référentiels ne se joignent pas par le NOM ».
3. **Un résultat « Factures » atterrit sur la LISTE**, pas sur la facture : aucune
   route de détail n'existe dans le manager.
4. **`knip` n'a pas été relancé en entier** (machine partagée) — audit manuel des
   types exportés fait à la place, 7 corrigés. **L'intégrateur DOIT lancer
   `pnpm lint:exports:types` jusqu'au vert** : il est EN CASCADE, retirer les
   fuites qu'il nomme en révèle d'autres.
5. Aucune recette navigateur (pas de `.env` dans le worktree) — normal, elle se
   fait sur la branche d'intégration.

### B3 — Accessibilité AA + 3 seuils (`25630441b`, `feature/bo-accessibilite`) — VÉRIFIÉ
Commit réel. 160 tests verts sur son périmètre (21 fichiers), + 11 sur `charts.a11y`.
**Collision avec B1 : `apps/dashboard-manager/src/ui/DataTable.module.css`** (B1 y pose
`height: 32px`, B3 les `font-size`). Fusion à faire à la main.

Ratios mesurés, pas déclarés : `--action` passe de **3,74:1 à 6,85:1** en sombre.
La garde rejoue le vrai bug de `/feedback` (1,00:1) comme preuve qu'elle sait dire NON,
et exclut `--border` (1,21:1) comme témoin qu'elle n'attrape pas ce qu'elle ne vise pas.

⚠️⚠️ **À FAIRE, et c'est le cœur de #1674.9 :** retirer réellement les boutons d'action
du DOM sous 768 px **dans les écrans réels** (`DataTable`, `users/`, `revenus/`,
`queues/`…). B3 n'avait aucun de ces fichiers dans son périmètre. Il laisse le
test-gabarit (`trois-seuils-responsive.test.tsx`, partie 2) — donc **la règle est
prouvée sur une démonstration isolée et appliquée NULLE PART**. C'est exactement
« du code juste que personne n'appelle » : à brancher, sinon le lot ment.

⚠️ **Un vrai défaut AA trouvé et NON corrigé, avec sa raison** : `.btn` et
`.report-primary` peignent du blanc sur `--accent` = **3,74:1 en sombre**. Hors du
périmètre de #1642.4, et le réparer avec `--action` casserait la règle « un seul
bouton d'action par écran » (`.btn` apparaît 3× dans `feedback-card.tsx`). Tracké en
HERITAGE. **C'est une non-conformité réelle sur des boutons, pas une coquille.**

### B5 — Mouvements, flags, bandeau, télémétrie, rapport hebdo (`20b5daa9d`) — VÉRIFIÉ
Commit réel, 30 fichiers, **aucune collision** avec B1/B2/B3. 857 tests jest verts,
77 vitest, les DEUX typechecks de l'API, knip propre.

Ce qu'il a bien fait, et qu'il faut savoir :
- **#1667.1 rend « non mesuré » AVEC SA RAISON, et c'est juste** : il est allé lire
  le SDK réel (`@reflag/node-sdk@1.7.0`) — `bindClient`/`getFlags` n'évaluent qu'UN
  contexte, `FlagDefinition`/`FlagState` ne portent aucune date. La donnée n'existe
  pas côté fournisseur. **Il ne l'a pas inventée** ; c'est la bonne réponse.
- Il a vérifié lui-même une **fausse alerte d'injection** signalée par un autre
  agent (du texte narratif dans un `dist/`) : registre légitime, rien à signaler.

À reprendre à l'intégration :
1. ⚠️ **`flag_matured` est DÉCLARÉ mais pas calculé.** Le type est posé côté
   manager ; le calcul vit dans `apps/api/src/modules/admin/decision-queue.ts`
   (hors périmètre, agent concurrent) et **Reflag n'a de toute façon aucun
   historique de rollout à lire**. Une valeur d'énumération sans écrivain : à
   brancher ou à documenter comme telle. Le docblock le dit déjà — ne pas le
   perdre à la fusion.
2. **Variable neuve : `OPS_WEEKLY_REPORT_RECIPIENTS`** (liste d'e-mails, virgules).
   Sans valeur = no-op strict, zéro lecture de base, zéro envoi. Documentée dans
   `agent_docs/env-reference.md` ; **la ligne de la table de `CLAUDE.md` reste à
   poser par l'intégrateur.**
3. **Parité démo à classer** (craft rule n°9) : le tableau des mouvements, les deux
   colonnes de `/flags`, l'aperçu de bandeau, le volume/p95, le rapport hebdo.
   Chacun est soit seedé, soit **vide à dessein avec sa raison** — jamais déplacé
   vers « vide à dessein » juste pour faire passer la garde.
4. **La télémétrie d'API est un tampon EN MÉMOIRE DU PROCESS** : elle se perd au
   redéploiement et ne s'agrège pas entre répliques. Limite documentée, à répéter
   à l'écran si ce n'est pas déjà le cas.

### B4 — Sécurité, alertes, dépendances (`68028aff7`, `feature/bo-securite-alertes`) — VÉRIFIÉ
Commit réel, 40 fichiers. 834/835 jest verts, 105 vitest, les DEUX typechecks.
Collisions : `nav-sections.ts` (avec B2) et `agent_docs/env-reference.md` (avec B5) —
additives, fusion à la main.

⚠️⚠️ **LA LIGNE ROUGE EST RÉELLE ET C'EST MA TÂCHE** : `GA-77 › chaque module
déclarant est atteint par AppModule` échoue parce que **`apps/api/src/app.module.ts`
n'importe pas `BackofficeAlertsModule`** — fichier partagé, hors du périmètre de B4.
**Sans cette ligne, aucun contrôleur ni cron du module ne tourne** : le lot entier
serait « du code juste que personne n'appelle », et la garde le dit. À poser à la
fusion, et à revérifier en relançant GA-77.

À reprendre aussi :
1. **3 déclencheurs sur 8 sont câblés** (connexion anormale, coût quotidien,
   taux d'échec d'analyse). Les 5 autres sont NOMMÉS dans le registre `AlertKind`
   sans détection : API/worker indisponible, job bloqué, nouveau client, churn,
   rapport hebdomadaire. Deux d'entre eux (nouveau client / churn) demandent une
   sémantique produit non tranchée. **Ne pas laisser croire que #1676 est clos.**
2. **« Dernier changement de mot de passe » rendu « non mesuré » avec sa raison** —
   et la raison est bonne : l'API Admin Supabase ne distingue pas un changement de
   mot de passe d'une autre mise à jour de compte. Mieux vaut ça qu'un champ faux.
3. **Aucune migration**, par choix : l'état de dédup/résolution vit dans Redis,
   déjà obligatoire en production. Pas de nouvelle table, pas de `database.module.ts`.
4. **Variables neuves** : `BACKOFFICE_ALERT_EMAILS`, `BACKOFFICE_ALERTS_SLACK_WEBHOOK_URL`,
   `BACKOFFICE_ALERTS_DISABLED` (kill-switch, le registre API passe à 20),
   `VERCEL_API_TOKEN` + `VERCEL_PROJECT_ID`. Dans `env-reference.md` ;
   **la table de `CLAUDE.md` reste à poser par l'intégrateur**, et le compte de
   kill-switches y est LU par GA-84 — le mettre à jour.
5. **Choix d'affichage à connaître** : sur `/securite`, les adresses d'OPÉRATEURS
   sont en clair, les adresses CLIENTES passent par `MaskedEmail`. La garde
   `emails-masques-dans-les-listes.test.ts` protège les clientes, pas les
   opérateurs (précédent : `side-rail.tsx`). Décision défendable, à confirmer.

## L'INTÉGRATION — branche `feature/palier-backoffice-lot-1`

Six branches fusionnées (119 fichiers), **un seul conflit de contenu** :
`nav-sections.ts`, où B2 et B4 ajoutaient chacun une entrée à la section
Technique. Les deux gardées. Git a fusionné seul `env-reference.md`,
`src/ui/index.ts` et `DataTable.module.css`.

⚠️ **Le piège qui a coûté un cycle** : `commitlint` refuse le message par défaut
de `git merge`. Chaque fusion se termine par un `git commit -F` avec un sujet
conventionnel — c'est écrit dans `.claude/projet.md` §4, et je l'ai quand même
payé une fois.

### Ce que l'intégrateur a posé, et que personne d'autre ne pouvait poser

1. **`BackofficeAlertsModule` dans `app.module.ts`** — GA-77 passe de rouge à
   **725/725**. Sans cette ligne, le module de B4 était « du code juste que
   personne n'appelle », en entier.
2. **#1674.9 branché** : `PosteDeTravailSeulement` (`src/ui`) ne REND pas ses
   enfants sous 768 px ; posé sur les trois écrans qui rendent une suppression,
   une suspension ou une impersonation. **Garde de POPULATION** neuve
   (`actions-irreversibles-hors-mobile.test.ts`) : elle balaie tous les écrans,
   trouve les appelants, exige la porte, et **sait dire NON** (mesuré : retirer
   la porte d'un seul fichier la fait échouer en nommant les deux composants).
3. **La régression d'i18n du pagineur** refermée par une prop `pagerLabels`.
4. **GA-241 épinglait un ÉTAT, pas une RÈGLE** — elle exigeait que le registre
   dise « `session_id` n'a AUCUN écrivain », donc elle est devenue **rouge en
   refusant une AMÉLIORATION**. C'est une garde qui demandait au dépôt de rester
   cassé pour rester verte. Réécrite pour épingler ce qui n'est TOUJOURS pas
   tenu, plus un témoin sur ce qui l'est.
5. `CLAUDE.md` : les six variables neuves, et le compte de kill-switches API de
   **18 (périmé) à 20**, LU dans le registre.

⚠️ **`CLAUDE.md` porte la table des variables d'environnement EN DEUX COPIES**
(lignes ~136-150 et ~152-166) **qui ont DIVERGÉ** — la seconde a des lignes que
la première n'a pas. J'ai mis les deux à jour plutôt que d'en supprimer trente
lignes en silence. **À trancher** : c'est « un réglage vit à un seul endroit »
violé dans le fichier qui énonce la règle.

### Ce que je ne fais PAS, et pourquoi

- **Aucune entrée de changelog.** Le changelog est celui du PRODUIT CLIENT
  (panneau « Nouveautés » de l'app). Ce lot est la console d'exploitation, plus
  un traceur éteint par défaut et invisible. Une entrée ici serait du bruit pour
  les clients — la règle vise ce qu'un utilisateur voit changer.
