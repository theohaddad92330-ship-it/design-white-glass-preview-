# LOT K — #2567, la rétention quotidienne

base : 4de83342330489714e4681892f9585e8e90bf300 — 18/09/2026 (`origin/main`)
branche : `feat/retention-quotidienne-18-09`

## K.1 — ce que `/briefing` porte AUJOURD'HUI (mesure avant code)

Ordre à l'écran (`BriefingPage.tsx`), tel que rendu :

1. Entête + `SourcesStrip` (agenda/mailbox/tasks — état de lecture).
2. `NowStrip` — l'évènement en cours/à venir imminent.
3. Grille « À faire maintenant » (Actions, prospection : meeting_prep, follow_up,
   reply, account, mission_end, conflict, task) + « Tes tâches ».
4. Grille Agenda + Messagerie.
5. « Ce qui a bougé depuis ta dernière visite » (`SinceLastVisitBlock`).
6. « Ce qui bloque dans le processus » (`ChainBlockersBlock`).
7. « Alertes de Découvrir » (prospection marché).
8. « Comptes qui ont bougé » (`accountsToWatch`, prospection, borné à 5).
9. « Mon activité » (`MyActivityBlock`) : CA (4 nombres), capacité à vendre,
   **« Ce qui m'attend »** (file d'interventions), état « espace neuf ».

**Trouvaille (l'APPELANT) : la capacité demandée par le client EXISTE DÉJÀ,
et elle est même RENDUE — mais en position 9, dans une section qui s'appelle
« Mon activité » et se lit comme un tableau de bord financier, pas comme
« ce qu'il faut faire aujourd'hui ».**

La file « Ce qui m'attend » (`MyActivityBlock` bloc 5, `useInterventions()` +
`myQueue()`) lit la table `interventions`, remplie par `InterventionsSweeper`
(apps/api/src/modules/playbooks) à partir de DOUZE natures. Correspondance
avec les six domaines cités par le client :

| Domaine client         | Nature(s) d'intervention couvrant le domaine                 |
|-------------------------|----------------------------------------------------------------|
| Suivi de mission         | `renewal_at_risk`, `mission_without_end_date`                  |
| Besoins / appels d'offres| `need_without_shortlist` (besoin sans profil positionné)        |
| Vivier                   | `submission_stalled` (profil positionné sans retour) — proche  |
| CRA                      | `timesheet_missing` (relevé manquant après relances)            |
| Facturation              | `invoicing_blocked`, `payment_overdue`                          |
| Bons de commande         | cité DANS le détail texte d'`invoicing_blocked` (`missing_po`)  |

Chaque ligne porte : un libellé humain (`playbooks:interventions.kinds.*`),
un détail DATÉ (« fin prévue dans N jours », « depuis N jours », etc.), un
lien vers l'écran concerné (`interventionHref`). Rien à réinventer : c'est
déjà un moteur unique, classé par gravité × âge côté serveur
(`rankInterventions`), déjà testé (`cockpit.test.ts`, `MyActivityBlock.test.tsx`).

**Décision K.2/K.3/K.5** : PROMOUVOIR cette file — pas la refaire. Extraction
du bloc 5 hors de « Mon activité » vers un nouveau bloc autonome
`DailyGesturesBlock`, posé tôt sur la page (juste après la grille
Actions/Tâches, avant Agenda/Messagerie). « Mon activité » perd ce bloc et son
état `awaiting` (CA, capacité et espace-neuf restent inchangés, à leur place
actuelle). Les sections de prospection pure (Alertes Découvrir, Comptes qui
ont bougé) restent où elles sont, mais suivent désormais un bloc non-prospectif
— la prospection n'est plus la première chose lue par quelqu'un qui n'a pas
d'intention de prospecter aujourd'hui.

## K.4 — espace neuf

Déjà couvert par `isBlankWorkspace()` + `<BlankWorkspace/>` dans
`MyActivityBlock` (inchangé par ce lot) : pipe vide ET 0 mission → deux
gestes nommés (lancer une recherche, importer sa base). Le nouveau bloc
`DailyGesturesBlock`, lui, dit honnêtement « rien n'attend de décision » sur
un espace neuf (0 intervention réelle) — pas un « 0 » caché, une file
réellement vide, comme le reste du produit le fait déjà ailleurs (règle
« non mesuré n'est jamais 0 » : ici c'est un compte RÉEL, pas une absence de
lecture, donc l'honnêteté est de le dire tel quel).

## K.6 — semis de démo

`interventions` a `workspace_id` → dans `DEMO_PURGE_TABLES`
(`demo-reset.service.ts:410`) → doit être classée dans
`demo-coverage.ts` (SEEDÉE ou vide à dessein). **Déjà classée** en
« vide à dessein », avec une note PRÉ-EXISTANTE (28-29/08/2026, BEL-BO-002)
qui admet elle-même que ce n'est plus tout à fait vrai depuis que
`/briefing` lit cette table, et qui donne LA RECETTE EXACTE à seeder :

- `renewal_at_risk` sur « Maintenance prédictive de la flotte — mise en
  production » (`ends_in_days: 28`, sous les 30 j du seuil) — détail :
  phrase de `detectRenewalsAtRisk`.
- `mission_without_end_date` × 2, sur « Cadrage données transport — lot 2 »
  (`started_days_ago: 52`) et « Socle conteneurisé des applications terrain
  — run » (`started_days_ago: 138`) — détail : phrase de
  `detectMissionsWithoutEndDate`.

Ce lot exécute cette recette (3 lignes, `INSERT INTO interventions`,
`ON CONFLICT DO NOTHING` — même idempotence que le balayeur réel) et met à
jour la note de couverture pour dire ce qui EST montré désormais.

**Retenu, avec la mesure écrite (ne pas fabriquer)** :
- `timesheet_missing` — silencieux PAR CONSTRUCTION : `reminders_sent` est
  semé à 0 à dessein (`DEMO_LAURA_BUBBLES_SILENT.timesheet_missing_after_reminders`).
- `payment_overdue` — silencieux PAR CONSTRUCTION : les treize mois facturés
  de la salle portent tous `paid_at` renseigné.
- `need_without_shortlist`, `invoicing_blocked`, `submission_stalled`,
  `account_untouched`, `rep_inactive`, `credits_exhausted`,
  `account_no_next_action`, `project_no_decision` — non audités par la note
  existante ; les auditer un par un (vérifier seuils × données du jeu) est
  hors du temps de ce lot borné. Aucune ligne n'est fabriquée pour eux : la
  démo montre donc, pour l'instant, uniquement le domaine « suivi de
  mission » dans « Ce qui attend ta décision ». Les autres domaines
  (CRA, facturation, PO, besoins, vivier) restent couverts par le CODE
  (routes existantes citées ci-dessus), mais pas par le JEU DE DÉMO.

## Bornage confirmé

- Aucune nouvelle table, aucun nouveau moteur : réutilisation de
  `interventions` / `InterventionsSweeper` / `myQueue` / `interventionHref`,
  déjà existants et déjà testés.
- Fichiers touchés : `apps/web/src/features/briefing/**` (page, cockpit,
  vues, tests, i18n FR/EN) + `apps/api/src/modules/demo/demo-seed.service.ts`
  et `demo-coverage.ts` (semis démo — explicitement dans le périmètre du
  brief).
- Aucun nouvel endpoint API : `useInterventions()` existait déjà et est
  seulement appelé depuis un nouvel endroit.
