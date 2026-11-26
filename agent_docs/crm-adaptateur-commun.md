---
sources:
  - packages/contracts/src/schemas/crm-adapter.ts
  - apps/api/src/modules/crm/adapter/*.ts
  - apps/api/src/modules/crm/crm-write.service.ts
  - apps/api/src/modules/crm/crm-push.service.ts
  - apps/api/src/modules/crm/crm-read-sync.service.ts
  - apps/api/src/modules/zoho/*.ts
  - packages/contracts/src/schemas/crm-import-coverage.ts
  - apps/api/src/modules/crm/crm-first-import.runner.ts
---

# CRM — l'adaptateur commun (#4185, épopée #4184)

**Pourquoi.** Brancher un CRM de plus touchait une dizaine de switchs et de listes (routeur d'actions,
export de besoin, écran de connecteurs, rappel OAuth, recommandation « pour démarrer »). Chaque fournisseur
restait à un niveau différent et personne ne pouvait dire lequel savait quoi.

## Le contrat — `@bellum/contracts` › `crm-adapter.ts` (un seul endroit, GA-26)

- `CRM_PROVIDERS` : les CRM que le produit sait brancher (`hubspot`, `salesforce`, `pipedrive`, `attio`, `odoo`, `zoho`).
- `CRM_ADAPTER_OPERATIONS` : `status` (obligatoire), `upsert_contact`, `upsert_company`, `task_note`, `read`.
- `CRM_PROVIDER_CAPABILITIES` : ce que CHAQUE fournisseur porte aujourd'hui — mesuré, pas promis.
- `CRM_OAUTH_PROVIDERS` : ceux qui se branchent par un rappel OAuth (le web les lit).

`provider` est un identifiant ; l'écran affiche `CRM_TOOL_NAMES` (HubSpot, Salesforce…) suivi de l'espace CRM de
l'utilisateur (`accountLabel`) : « Envoyer vers HubSpot · bellum-it.com ». La doctrine interdit de nommer NOS
fournisseurs (données, modèles, hébergement), pas l'outil que l'espace a lui-même branché (Louis, 16/10/2026).

## L'API — `apps/api/src/modules/crm/adapter/`

- `crm-adapter.ts` : l'interface `CrmAdapter` et `buildCrmAdapters(deps)` — une enveloppe par fournisseur
  autour du service existant, sans changement de comportement. Le type `Record<CrmProvider, CrmAdapter>`
  exige une entrée par fournisseur du contrat.
- `crm-adapter.registry.ts` : `CrmAdapterRegistry` (exporté par `CrmModule`) — `get(provider)`,
  `firstConnected(userId, critère)`, `connected(userId)`.
- Un adaptateur ÉCRIT EN DIRECT : il ne connaît pas la porte. La porte décide, l'adaptateur exécute.

## La porte commune — `CrmWriteService` (#4186)

Doctrine : une écriture CRM/ERP passe par une porte (auto-approuvée sur geste utilisateur, sinon
prévisualisation figée). Au 14/10, seul HubSpot y passait. `CrmWriteService.write({ provider, kind, payload,
origin })` est désormais le SEUL appelant des écritures de l'adaptateur :

1. refus NOMMÉ sans toucher la porte si le CRM n'est pas branché ou ne porte pas l'opération ;
2. salle de démonstration : aucune écriture externe, identifiant stable dérivé de la charge ;
3. `OutboundWriteService.request` — `user` part, `system` attend (`pending`), doublon = `already_done` ;
4. écriture par l'adaptateur du fournisseur visé, et résultat CONSIGNÉ : `written`, `failed`, ou `unknown`
   (requête partie sans réponse — un timeout n'est pas un échec, `unknown` arrête la reprise).

Natures : `export_contact`, `create_company`, `export_need` (nouvelle, en fin de `OUTBOUND_WRITE_KINDS` ;
`kind` est un TEXT sans CHECK). `writeApproved` fait partir une demande de système validée : HubSpot garde son
chemin pour ses natures, les autres CRM partent par leur adaptateur.

Routes : `POST /crm/push/contact` (`provider` dans le corps) remplace `POST /salesforce|pipedrive|attio|odoo/export`
(retirées) ; `POST /crm/companies` passe par la porte. La file `GET /crm/write-requests` sert tous les CRM
branchés et nomme la `destination` (l'`accountLabel` de l'espace CRM).

Garde : `apps/api/src/architecture/crm-ecritures-passent-par-la-porte.spec.ts` — aucun appel d'écriture nue
(`<service>.exportContact|exportNeed|upsertContactDirect|createCompany`, `.taskNote`, `.upsertCompany`) hors de
l'adaptateur et de la porte. Hors garde, nommé : les écritures « profondeur » HubSpot (`importContacts`,
`createList`, `enrollInSequence`) — voir #4186.

## Envoyer un compte et ses contacts — `CrmPushService` (#4188)

- `POST /crm/push/preview` : élément par élément, `create` / `update` / `already_present` / `refused` (avec raison).
  N'écrit rien.
- `POST /crm/push` : comptes d'abord (`create_company`), puis contacts (`export_contact`, l'entreprise est celle du
  COMPTE), chacun par la porte, groupés sous un `batchId` quand il y en a plusieurs. La référence externe d'un compte
  vit dans `account_crm_exports` (migration `1796537700100`, qui élargit aussi `contact_crm_exports` à `odoo`) : un
  compte déjà envoyé n'est pas réécrit. Côté CRM, chaque adaptateur retrouve avant de créer (nom exact).
- `GET /crm/push/accounts/:id` : « Dans <CRM> », avec le lien vers la fiche quand l'URL est vérifiable
  (`crmCompanyRecordUrl` : HubSpot, Salesforce, Pipedrive ; jamais devinée pour Attio et Odoo).
- `GET /crm/push/targets` (16/10) : les CRM branchés, `primary` (le premier qui accepte l'écriture), `writable` et
  `readOnlyReason` (HubSpot seul dit ce que son jeton autorise ; un autre CRM n'est jamais deviné en lecture seule).
  `preview` / `push` visent `provider` (absent = le principal) ; un CRM nommé non branché ou en lecture seule est
  refusé, jamais remplacé par un autre. La fenêtre appelle UNE fois par CRM coché (seul le principal l'est d'office) :
  chacun passe par la même porte, l'échec ou le silence (`unknown`) de l'un n'annule pas l'autre.
- **Dossier / liste cible : non livré, volontairement.** Aucun adaptateur n'a un appel de sélection de destination à la
  fois dans le code, testé au niveau HTTP ET porté par l'écriture de la porte (HubSpot : listes/propriétaires/pipelines
  lus sans test du client, aucun type d'écriture « ajouter à une liste » dans la porte ; Zoho : propriétaires lus et
  testés, mais l'écriture n'envoie aucun `Owner`). Un contrat d'API non vérifiable ne se devine pas.
- **La prévisualisation montre ce qui sera écrit** (#4290.1, vague 5) : chaque élément de `POST /crm/push/preview`
  porte `fields` — les champs RENSEIGNÉS du MÊME payload que l'envoi (`accountPayload` / `contactPayload`, une seule
  construction ; ordre de l'écran `PREVIEW_FIELD_ORDER`, une valeur vide n'est jamais listée). Un CRM qui n'accepte pas
  `upsert_company` ne liste aucun champ de société. L'entreprise d'un contact est celle du COMPTE identifié
  (`companyNames`, #3719.6), jamais le libellé importé.
- Web : `CrmPushDialog` (fiche compte, barre de sélection des comptes, contacts cochés d'un compte).
- Démo : SNCF « déjà envoyé » vers le CRM fictif (`DEMO_ACCOUNT_CRM_EXPORT`), classé dans `demo-coverage.ts`.
- **Compte venu du CRM : provenance et « Compléter le compte »** (#4459, 22/10/2026). `GET /crm/push/accounts/:id/provenance`
  (`accountProvenance` → `loadAccountCrmProvenance`, sans `RequireFeature` : un import de FICHIER porte aussi sa
  provenance) classe chaque contact du compte, `crm` (« Déjà dans ton CRM ») ou `bellum` (« Apporté par Bellum ») —
  règles uniques au contrat `crm-account-provenance.ts`. **Aucune colonne neuve** : `contacts.source` (`import`/`crm`) +
  `record_import_marks` (#4051) disent « y était », `contact_crm_exports` dit « déjà poussé » (jamais reproposé).
  `sync_links` n'est PAS lu (une référence peut venir d'un envoi de Bellum). Le compte vient du CRM si `status: 'imported'`
  ou trace d'import de compte. Web : `AccountCrmProvenanceProvider` (une lecture par fiche), badge par contact
  (Personnes + organigramme), compteur en tête de synthèse, bouton `dossier.hero.completeAccount` →
  `CompleteCrmAccountDialog` (aperçu coché d'office, UN `POST /crm/push` par la porte ; bloqué et DIT en incarnation).
  Démo : Société Générale (`DEMO_CRM_COMPLETION`).

## Qui lit le registre

- `CrmTaskService` (export d'un besoin) : le premier CRM branché qui porte `task_note`.
- Le routeur d'actions (`create_crm_task`) : `crmDoorsFrom(registry)` donne une porte par fournisseur hors
  HubSpot (HubSpot garde sa porte interne et sa note de chronologie).
- Web : `oauth-callback.ts` (`CRM_OAUTH_PROVIDERS`), `recommended.ts` (`CRM_PROVIDERS`), `connectors.ts`
  (`CrmProvider` dans `ConnectorId`).

## Les gardes

- `crm-adapter.registry.spec.ts` : chaque fournisseur déclaré a un adaptateur ; chaque opération déclarée est
  implémentée ; chaque opération implémentée est déclarée. Sait dire NON (fixtures).
- `apps/api/src/architecture/crm-un-registre-pas-de-switch.spec.ts` : aucun `case '<fournisseur>'` dans les
  consommateurs du registre.

## Zoho CRM (#4187) — le premier CRM branché PAR le registre

Module autonome `apps/api/src/modules/zoho/` (client, service, contrôleur, config), même modèle que Pipedrive :
`crm_connections` (provider `zoho`), jeton chiffré, `state` signé. Aucune ligne de switch ailleurs : Zoho existe dans
le contrat (`CRM_PROVIDERS`, capacités) et dans `buildCrmAdapters` — la garde du registre dit ce qui manquait.
Région paramétrable (`ZOHO_ACCOUNTS_REGION`, défaut `eu`), `api_domain` du jeton jamais deviné, « connecté » seulement
après une lecture réussie, écritures par la porte. Clés et raisons : `env-reference.md` (famille CRM).
Un besoin devient une TÂCHE (+ une note sur la société retrouvée) ; le contrat d'API est celui de la documentation
publique (v6), non vérifié sur une organisation réelle.

**Refus et échec du rappel (#4380).** Le contrôleur lit aussi `?error=` (Zoho refuse avant tout code) et ne renvoie plus
un code brut dans `/integrations?zoho=error&reason=` mais un texte lisible, produit par `zohoFailureReason`
(`zoho-config.ts`) : `access_denied` se dit comme un refus de consentement (sans accuser la configuration) ;
`invalid_client`, `invalid_redirect_uri`, `read_failed`, `exchange_failed`, `missing_code` NOMMENT le centre de données
configuré (hôte des comptes) et l'URI de redirection attendue, pour les comparer à la console API Zoho — et
`invalid_client` rappelle l'option Multi-DC. Jamais la valeur du client ni du secret.

## Lecture commune et synchro incrémentale (#4189)

- **Interface de lecture** : `CrmAdapter.read` — `contacts` et `companies` partout ; `deals`, `activities`, `owners`
  seulement là où le CRM les expose. La présence de la méthode EST le « ce CRM expose cet objet » ; le contrat
  (`CRM_PROVIDER_READ_SCOPE`) le dit pour l'écran, et `crm-adapter.registry.spec.ts` compare les deux. Un champ que le
  CRM ne rend pas est `null` (jamais deviné) — `crm-read-types.ts`.
- **Endpoints** (publics, documentés) : Salesforce SOQL sur `Account/Contact/Opportunity/Task` (champs standard) ;
  Pipedrive API v2 (`cursor`, `updated_since`) ; Attio `POST /v2/objects/{people|companies|deals}/records/query` ;
  Odoo JSON-RPC `search_read` (`res.partner`, `crm.lead`, `mail.activity`) ; Zoho v6 (`fields`, `page_token`,
  `If-Modified-Since`). Exposée : `GET /crm/read/:provider/:object` (lecture seule, 404 nommé pour un objet non lu).
- **Synchro** : `CrmReadSyncService` — curseur par (espace, fournisseur, objet) dans `crm_sync_cursors`, passage
  quotidien 04:55 (`CRM_SYNC_DISABLED` le coupe), rapprochement par `CrmImportService` (liens `sync_links`, provenance
  `connector` sous `human`). Le curseur ET `last_run_at` (la dernière synchro RÉUSSIE, sans colonne `last_ok_at`) n’avancent que sur un passage abouti — un passage indisponible (autorisation expirée) ne fait que poser `last_error`, et `lastSyncAt` ne se rabat plus sur `updated_at` de la connexion (recette 21/10 K2) ; Attio (pas de date de modification, lecture
  non ordonnée) ne voit que les créations et n'avance que sur un passage complet (`CRM_INCREMENTAL_SYNC`). La première
  reprise d'un espace reste un geste humain (simulation d'abord) ; HubSpot garde son chemin.
  **Rattrapage (CRM-SYNC-D.1, vague 5)** : un CRM déjà branché SANS curseur n'est plus un simple avertissement du
  journal — `CrmReadSyncService` met sa première reprise en file (`CrmFirstImportEnqueuer.enqueueCatchUp` : un verrou
  par (espace, CRM), un échec recule d'une heure ; jamais d'écriture dans le CRM). Un CRM déconnecté ne met rien en
  file (`not_connected`). La passe suivante, curseurs posés, synchronise.
- **Conflit** (modifié des deux côtés) : la valeur humaine reste, l'écart est COMPTÉ (`sync_runs.conflict_count`) et
  journalisé (`sync_record_events.action = 'conflict'`, champs concernés). Aucune mécanique de proposition entrante
  n'existe au dépôt (le détecteur de contradictions `FieldConflictService` lit les écritures, il ne propose rien) : trace
  - compteur visible, sur la carte du CRM (`GET /crm/import/status`).
    **Écart PROPOSÉ (#4189)** : `sync_record_events.proposal` (jsonb, nullable) porte par champ `{ bellum, crm }` ; le
    statut rend `CrmReadStatus.conflictItems?: CrmReadConflict[]` (`entityType`, `field`, `bellumValue` gardée, `crmValue`
    annoncée, `at`), les 20 plus récents hors simulation (`CONFLICTS_SHOWN`, `CrmReadSyncService`). Rien n'est appliqué ;
    valeur absente = `null` ; champ absent = serveur antérieur.
    **Onglet « À relire » (Théo D settings-integrations.N3, 22/10)** : la même source, un bloc par fiche. L'écart porte le
    NOM de la fiche (`CrmReadConflict.entityLabel`, journalisé à l'écriture dans `sync_record_events.entity_label` ;
    `null` pour un écart antérieur — l'écran ne l'invente pas). « Garder la valeur du CRM » = `POST
/crm/import/conflicts/keep-crm` (inchangé) ; « Garder la valeur Bellum » = `POST /crm/import/conflicts/keep-bellum`
    (`CrmImportService.keepBellumValue`) : le choix se RETIENT dans `sync_record_events.kept_fields` (l'écart sort de la
    liste), rien n'est écrit sur la fiche. Une correction humaine postérieure au passage gagne toujours (409).
    **Historique des échanges (N4)** : `GET /crm/import/exchanges` (`CrmReadSyncService.exchanges`, `crm-exchanges.ts`) —
    union des passages de lecture réels (`sync_runs` non simulés), des écritures validées (`contact_crm_exports`) et des
    premières synchros (`integration_sync_runs`) ; le résultat est celui de l'outil (un refus garde sa raison telle
    quelle, une écriture est « confirmée », un passage qui laisse des écarts est « à relire »). Journal vide hors démo =
    liste vide ; la salle montre des lignes marquées `demo`.
- **Ce qui n'est PAS fait** : les affaires et activités relues ne nourrissent pas les signaux de veille (seule une lecture
  profonde vérifiée sur une instance réelle les alimente — `crm-deal-signal-rules.ts`) ; l'écran le dit.

## Le miroir CRM — ce que chaque fournisseur rend (SYNC-A, 19/10/2026)

`CrmMirrorService` (`apps/api/src/modules/crm-mirror/`, jeton `CRM_MIRROR_SYNC`, contrat `crm-mirror.port.ts`)
copie affaires, activités, propriétaires et pipelines dans les tables `crm_*` (voir `database_schema.md`), par la
lecture commune (`read.deals|activities|owners|pipelines`). `pipelines` n'est PAS un objet de `CRM_READ_OBJECTS`
(l'écran ne le liste pas) : une méthode du miroir seulement. Les lecteurs (fiche compte `GET /crm/mirror/accounts/:id`,
Laura `internal/copilot/crm/deals`, récolte des affaires de veille `CrmDealFactsHarvester`) lisent le MIROIR d'abord,
le fournisseur en repli si le miroir est vide pour ce CRM (`CrmMirrorReader.readDeals` rend `null`).

| CRM        | Affaires (en plus du socle)                                                                     | Activités                                                                                                                                             | Propriétaires                                                                                                                      | Pipelines / étapes                                                            |
| ---------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| HubSpot    | `hubspot_owner_id`, `pipeline`, `dealstage`, `closed_lost_reason`, société et contacts associés | `calls` → `meetings` → `tasks` → `notes` sous un curseur `<type>:<after>` ; portée contacts ; jamais `hs_*_body`                                      | `GET /crm/v3/owners` — portée **`crm.objects.owners.read` ajoutée** (manifest + `crm-config.ts`) : **reconnexion HubSpot requise** | `GET /crm/v3/pipelines/deals` ; gagnée/perdue = étape close à probabilité 1/0 |
| Salesforce | `OwnerId`, lien Lightning                                                                       | `Task` puis `Event` (curseur `event:`) ; `OwnerId`, `AccountId`, `WhoId` (003 = contact), `WhatId` (006 = affaire) ; jamais `Description`             | `User`                                                                                                                             | — (le stade est un libellé, pas un objet lu)                                  |
| Pipedrive  | `owner_id`, `pipeline_id`, `stage_id`, `lost_reason`, `person_id`, `custom_fields`, lien        | `owner_id`, `org_id`, `person_id`, `deal_id` ; jamais `note`                                                                                          | `GET /api/v1/users`                                                                                                                | `/api/v2/pipelines` + `/api/v2/stages` (`order_nr`)                           |
| Odoo       | `crm.lead` **`type = opportunity`** seulement, `user_id`, `stage_id`, `lost_reason_id`, lien    | `mail.activity` : `user_id`, `res_model`/`res_id` (`crm.lead` = affaire, `res.partner` = compte OU contact, tranché par `sync_links`) ; jamais `note` | `res.users`                                                                                                                        | — (pas de pipeline par équipe lu)                                             |
| Attio      | socle seulement                                                                                 | — (droit non demandé)                                                                                                                                 | —                                                                                                                                  | —                                                                             |
| Zoho       | socle seulement                                                                                 | — (portées minimales sans tâches)                                                                                                                     | `ZohoCRM.users.READ` (déjà)                                                                                                        | —                                                                             |

Le type d'activité se normalise par `crmMirrorActivityKind` (vocabulaire CRM, libellés FR d'Odoo) ; un type inconnu
reste `null`, jamais rangé au hasard.

## Brancher un CRM de plus (fait pour Zoho, #4187)

1. Ajouter l'identifiant à `CRM_PROVIDERS` et sa ligne à `CRM_PROVIDER_CAPABILITIES` (+ `CRM_PROVIDER_READ_SCOPE`).
2. Élargir AVANT la contrainte SQL des tables qui stockent `provider` (GA-11/12) : migration `1796541540046`.
3. Écrire son adaptateur dans `buildCrmAdapters` — le compilateur et la garde disent ce qui manque.

## Affaires versées et statut de démonstration (#3918.8, #4189.8, 15/10/2026)

- `CrmDealRecord` (`crm-read-types.ts`) gagne `closedAt` (date de CLÔTURE réelle rendue par le CRM, jamais l'échéance
  prévue `closeDate`) et `createdAt`, tous deux optionnels (`null`/absent = le CRM ne le rend pas).
- `CrmReadSyncService` reçoit `CrmDealFactsHarvester` (optionnel) : après les comptes, les affaires de Pipedrive et d'Odoo
  rejoignent `crm_deal_facts`, relu par les mêmes règles de signaux que HubSpot. Best-effort : un échec est journalisé, il
  ne fait jamais échouer la synchro des fiches. Précise donc « Ce qui n'est PAS fait » ci-dessus pour ces deux CRM.
- `CrmReadStatus.demo?: true` (contrat `crm-adapter.ts`) : sans CRM branché, `status()` rend pour une SALLE de démonstration
  seulement une ligne fictive (`demoCrmReadStatus`, un écart d'e-mail proposé) ; rien n'est semé en base, aucun CRM lu.

## Conflit de lecture et listes à la demande (vague 10, 17/10/2026)

- `crm-read-sync.service.ts` : sur un conflit (valeur Bellum ≠ valeur du CRM), le geste « Garder la valeur du CRM » (#4189.9) écrit la valeur par la porte, auto-approuvé (geste utilisateur), tracé. Un SEUL prédicat de correction humaine, partagé avec les contradictions de faits (#4016.L13, GA-26) : une correction humaine gagne toujours.
- `crm-read-types.ts` : les lectures de LISTE (affaires gagnées / perdues + interlocuteur) alimentent `list_records` côté Laura (#4065.8). CRM non branché = Laura le dit, jamais deviné.

## Affaires lues comme signaux (recette 18/10/2026)

- `crm-adapter.ts` › `CRM_DEAL_SIGNAL_PROVIDERS` (`pipedrive`, `odoo`, `salesforce`) (#3918.7) : les fournisseurs dont les AFFAIRES
  deviennent des signaux de veille (perdue, en sommeil, à renouveler). Une seule liste, lue par la récolte côté API ET par la note de
  périmètre de l'écran Intégrations, qui ne dit « hors périmètre » que pour les autres.

## Retour OAuth des connecteurs (#4359)

Les sept contrôleurs OAuth (Attio, Google, Microsoft, Notion, Pipedrive, Salesforce, Zoho) renvoient désormais le navigateur
vers `/integrations?<fournisseur>=connected` (et non plus `/settings/integrations`, qui n'est plus une route). L'ancienne
adresse reste réécrite vers `/integrations`, chaîne de requête comprise, par `apps/web/src/lib/legacy-addresses.ts`, pour
les retours déjà en vol.

## Une seule date de synchro, et le mode de mise à jour (#4290.16 / #4290.17, 21/10/2026)

- `CrmReadStatus.lastSyncAt` = la dernière synchro **RÉUSSIE** (`crm_sync_cursors.last_success_at`) ; `lastAttemptAt` n'est rendu
  que si un essai plus récent a ÉCHOUÉ (la raison : `lastError`) — la carte dit « Dernier essai il y a 13 min — échec : … ». La date du
  registre (`tool.last_sync`) n'est plus redite par `ConnectorSyncStatus` quand le serveur rend le statut du CRM.
- `CrmReadStatus.refresh` : `crmRefresh()` (`crm-sync-schedule.ts`) — `webhook` seulement si le fournisseur est dans `CRM_WEBHOOK_PROVIDERS`
  (HubSpot, Salesforce) ET son secret est posé ; sinon `poll` à `CRM_SYNC_INTERVAL_MINUTES`. Pipedrive n'a pas de webhook : « toutes les 15 min ».
  `CRM_WEBHOOK_PROVIDERS` vit dans `@bellum/contracts` (une seule liste, GA-26) : la carte NON connectée le lit aussi et dit « pas de webhook,
  relu à intervalle régulier » avant le branchement (#4290.17, recette 22/10 — la note rendait `null` tant que le CRM n'était pas branché).
- Reprise (#4290.15) : le premier passage d'un objet ignore le curseur (`run(…, { ignoreCursor })`) — l'existant est rattrapé ; un miroir
  qui ne rend ni compte ni erreur est « non lu », jamais « terminé à 0 ».

## Ce qu'une reprise reprend, et une reprise rejouée (#4290.18 / #4290.19, 26/10/2026)

- **Contrat CRM ↔ objets Bellum** : `@bellum/contracts` › `crm-import-coverage.ts`. `crmImportCoverage(provider)` dit, pour chaque
  famille (`CRM_IMPORT_FAMILIES` = les objets de la reprise + `needs`), si la reprise la REPREND — relu de `CRM_PROVIDER_READ_SCOPE`,
  aucun périmètre déclaré de plus (GA-26). Non reprise : `not_in_read_scope`, ou `file_only` pour les besoins (aucun CRM ne les
  relit : le module « besoins » est propre au client, son contrat d'API ne se devine pas — ils s'importent par fichier).
  `crmImportUnread` en tire la note « Non repris : … » sous le bilan de reprise (`FirstImportProgress`), propriétaires exclus
  (comme la note de lecture). Prérequis Exteam (19/10) : aucune famille ne se perd en silence.
- **Reprise rejouée sur une base déjà écrite** : rien n'est recréé (le lien `sync_links` fait l'idempotence) ; l'état d'un objet porte
  `created` et `recognized` (mises à jour + inchangées), et `count` = leur somme — avant, des entreprises inchangées faisaient
  « 0 entreprise ». Le miroir (affaires, activités, propriétaires) ne distingue pas : les champs restent absents, jamais un 0.

## Le CRM de la salle de démonstration, et les nuls du miroir (#4604, #4590, #4591, 26/10/2026)

- **En salle, le miroir semé se lit comme un vrai CRM** (craft n°9). `CrmPushService` demande son statut
  à l'adaptateur ; si `getStatus(userId).demo === true`, la provenance est chargée avec
  `{ demoTool: DEMO_CRM_PUSH_TARGETS[0]?.provider }` — le premier fournisseur fictif de la salle. Hors
  démonstration, rien ne change : `loadAccountCrmProvenance` reçoit `{}` et lit la provenance réelle.
  L'outil nommé à l'écran reste **celui que l'espace a branché** (ou son équivalent de salle), jamais un
  de nos fournisseurs.
- **Un compteur de conflits absent n'est pas zéro, et ne fait plus tomber la lecture** (#4590, #4591).
  Côté `CrmReadSyncService`, `conflict_count` est désormais typé `number | null` et sommé en
  `run.conflict_count ?? 0` ; chaque valeur de `proposal` peut être nulle, et les deux côtés sont lus en
  `values?.bellum ?? null` / `values?.crm ?? null`. Avant, une ligne nulle rendait un 500 sur le statut
  du CRM. La règle produit est inchangée : **un conflit non mesuré ne s'affiche jamais « 0 »** (GA-18 /
  GA-19) — il est simplement absent du total.
