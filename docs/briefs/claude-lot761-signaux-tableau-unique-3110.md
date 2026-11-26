# Brief — lot 761 (31/10/2026) — SIGNAUX 1/2 : l'onglet « Signaux et besoins » devient UN tableau

Branche : `claude/lot761-signaux-tableau-unique-3110` (depuis `origin/main` `973ea8bd`).
Ferme #4755 et #4756 (remplacés par ce tableau, décision Louis du 31/10) ; référence l'épopée #4762.

Périmètre : packages/contracts/**, apps/api/src/modules/accounts/**, apps/api/src/modules/demo/**, apps/web/src/features/accounts/**, apps/web/src/architecture/**, apps/web/src/i18n/**

Hors périmètre (lot 762 en parallèle) : `apps/ia`, le chemin d'actualisation (le bouton « Actualiser » RÉUTILISE
`useRefreshDimension('signals')` tel quel, sans rien y changer).

## Le livrable

Une route JWT `GET /accounts/:id/signal-lines` (contrat `accountSignalLinesSchema`, `packages/contracts`) rend, pour UN
compte, toutes les lignes DATÉES des quatre familles, chacune rangée « Actuel » (< 180 j) ou « Historique » (≥ 180 j),
doublons fusionnés, sans aucune source nommée. L'écran `AccountOpportunityScreen` est remplacé par `AccountSignalTable` :
bascule Actuel / Historique, « Vérifié le » + Actualiser, bande Laura, puces de filtre par type avec compteurs + recherche,
tableau Date · Type · Signal ou besoin · À contacter, colonne latérale (« En un coup d'œil », « Qui revient le plus »,
« Observé sur le marché »), cartes empilées sous 760 px.

## Droits

- **Qui voit** : un membre de l'espace actif qui a le droit de lire le compte (`@WorkspaceRead`, `JwtGuard` du contrôleur).
  La porte d'appartenance est `findOneForWorkspace(id, workspaceId, businessUnitScope)` AVANT toute lecture — la même que
  `:id/market-context`. Hors de l'espace (ou hors de la business unit du lecteur) : **404**, rien n'est lu.
- **Au plus près de la donnée** : CHAQUE requête du service porte `workspace_id = $1 AND account_id = $2` (jamais un
  `where id` seul) ; `signal_history` accepte en plus ses lignes partagées (`workspace_id IS NULL`) comme `AccountFactsService`.
  La base commune (`dataforge_needs`) est un fait de marché PARTAGÉ (GA-16) : elle n'est lue que par le SIREN du compte DÉJÀ
  lu dans l'espace, jamais par une route web vers le module interne (GA-37 tenue : aucun `DataforgeService` injecté).
- **Qui modifie** : personne — route de LECTURE. « Confirmer / Écarter » réutilisent les routes existantes des projets
  possibles (`/accounts/:id/qualification-leads/:key/decision`, `/projects/:key/convert`), avec leurs propres gardes.
- **Qui est REFUSÉ** : un compte d'un autre espace → 404 (test `account-signal-lines.service.spec.ts` « refus cross-espace » :
  le service rend `null` et n'exécute AUCUNE requête de famille ; test contrôleur : 404).

## Familles (P2)

- (a) Bellum : `accounts.recent_signals`, `raw_analysis.{recent_signals, it_job_signals, public_tenders, awarded_contracts,
legal_signals, signal_layers (historique), historical_needs}`, `signal_history`, `project_needs`, `opportunities`
  (projets possibles → `lead_id` ; clos → issue, date `closed_at ?? stage_entered_at`).
- (b) CRM : `crm_deal_facts`, événements CRM (`canonical_trigger_events`, résolus et échus compris, ils deviennent historique),
  miroir `crm_deals` — dédoublonné contre `crm_deal_facts` par (fournisseur, identifiant d'affaire).
- (c) Base commune : `dataforge_needs` par SIREN (`accounts.siren` puis `group_head_siren`), rattachement univoque seulement
  (même règle que `apps/ia/app/services/dataforge_needs.py:60-62,199`) ; `GAGNE`/`PERDU` → issue, prescripteur → indices.
- (d) Mémoire marché : les tables `market_*` ne portent AUCUNE date d'observation (agrégats par entreprise) ⇒ AUCUNE ligne ;
  seul l'encart agrégé « Observé sur le marché » (route existante `GET /accounts/:id/market-context`).

## Antériorité (ce qui est déjà là, réutilisé)

- `proposeContactsForSignal` (`opportunities/signal-contacts.ts`, #4044 / #4182.6) — la sélection « À contacter », inchangée.
- `useContactEngagement().openEngagement` — « Préparer le message » (#4092 : Laura rédige, le commercial envoie).
- Formulaires `ConvertForm` / `DismissForm` de `QualificationLeadsQueue` (#2172.36 → .54) — exportés, pas recopiés.
- `useRefreshDimension('signals')` (#4047.1) — l'actualisation existante.
- `parseSignalDate` / `periodEndMs` (`signal-date.ts`, #4832) — l'horloge d'ÂGE, pas une seconde.
- Décisions revues par ce lot : #3624 / #3676 (un seul écran — tenu, il devient UN tableau), #4022 / #4020 (une carte par
  fait — renversé ASSUMÉ par la maquette du 31/10 : une LIGNE par fait), #4505 (filtres Tous/Enregistrés/Écartés de l'écran
  Signaux — non touché, autre écran), #4329.1 (seuil de preuve des projets possibles — un projet possible n'est plus une file,
  il est accroché à la ligne datée qui l'a fait naître).

## Décisions touchées (porte d'antériorité)

- **garde #2119** — les gestes manuels sur un signal restent l'initiative du commercial : « Au plan » et « Préparer le
  message » vivent sur chaque ligne (Laura prépare, n'envoie jamais).
- **garde #2543** — l'aveu de collecte antérieure : la MÊME fonction `isSegmentCollectionStale` décide, sur l'unique
  ligne de fraîcheur (« Vérifié le » + aveu + Actualiser) ; plus de second bandeau (`SignalsStaleNotice` démonté).
- **garde #3677** — les programmes publics : sans date, aucune ligne ; `SignalPrograms` reste monté (colonne latérale)
  avec l'ancre `#dossier-programs` que vise le lien de la carte Stratégie 5P. Garde réécrite, pas supprimée.
- **revient sur #3678 (sur cet écran)** — l'adéquation de domaine des pistes ordonnait la FILE ; la file n'est plus
  montée ici, un projet possible s'accroche à sa ligne datée. La file et son rang restent dans `QualificationLeadsQueue`.
- **garde #3681, #3895, #4270, #4349** — `demo-seed.service.spec.ts` : le prédicat qui écarte ces besoins du kanban est
  le MÊME, factorisé (`isKanbanNeedInsert`) ; seule la numérotation des ids lit désormais le rang global.
- **garde #3714** — aucun bandeau « À regarder en premier » (test conservé dans `AccountDetailTabContent.test.tsx`).
- **revient sur #3823 (sur cet écran)** — le bloc « Missions pour ce compte » n'est plus monté ici : les affaires en
  cours sont COMPTÉES (« → Affaires »), les projets clos sont des lignes d'Historique ; les missions gardent leur onglet.
- **revient sur #3918 (bloc), garde sa donnée** — `AccountDealFactsSection`, `AccountCrmSignalsSection`,
  `AccountCrmMirrorSection` démontés : faits d'affaires CRM, signaux CRM (résolus et échus compris) et miroir sont des
  lignes du tableau, dédoublonnées.
- **garde #4035** — « Vérifié le … » en haut, sans date aucune ligne.
- **garde #4805 / #4865** — la garde Sanofi (« aucun autre dossier ne porte un historique inventé ») est réécrite pour
  NOMMER l'exception Société Générale (#4755) et dit toujours NON à tout autre dossier.
- **revient sur #4914** — « chercher les offres d'un autre métier » (`AccountJobOffersPanel`) est remplacé par la
  recherche texte du tableau (décision 1 du lot, maquette du 31/10).
- **revient sur #4022 / #4020** (mise en page), **garde #3624 / #3676** (un seul écran) — voir plus haut.

## Écarts à la maquette, tranchés par une garde

- Pastille de type **neutre** : GA-67 (« une couleur porte un état, jamais une catégorie ») refuse une couleur par type.
- Borne mobile à **768 px** (`md:`), la borne unique du dépôt (GA-28), au lieu de 760 px.
- Composants démontés mais pas encore supprimés (fichiers + tests intacts) : `OpportunityCards`, `TrackedDealsBox`,
  `AccountCrmSignalsSection`, `AccountCrmMirrorSection`, `AccountDealFactsSection`, `SignalsStaleNotice`,
  `AccountJobOffersPanel`, `TabSignal`, `TabNeeds`, `TabProjects` (ces trois derniers lus ailleurs ou visés par des
  gardes). Leur suppression est le nettoyage de SIGNAUX 2/2.
