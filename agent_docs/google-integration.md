# Intégration Google Workspace

Module NestJS autonome `apps/api/src/modules/google/` + feature web `apps/web/src/features/google/`.
Env-gated : sans `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI`, la feature est un
**no-op strict** (aucun appel réseau, la carte Réglages › Intégrations reste « bientôt disponible »).

OAuth 2.0 unique (Authorization Code + refresh) ; tokens chiffrés AES-256-GCM au repos (crypto CRM,
clé `CRM_TOKEN_ENC_KEY` → `INTERNAL_API_SECRET`) ; `state` signé HMAC ; connexion scoped par workspace
(table `google_connections`). Le callback rebondit vers `/settings/integrations?google=connected|error`.

## Scopes & capacités

`GOOGLE_SCOPES` (optionnel) surcharge le défaut. **Défaut élargi** (`google-config.ts`) :

| Capacité (`getStatus().capabilities`) | Scope Google        | Usage                                         |
| ------------------------------------- | ------------------- | --------------------------------------------- |
| `calendar`                            | `calendar.events`   | Créer un événement / rappel de relance        |
| `calendarRead`                        | `calendar.readonly` | Lire l'agenda → brief de prépa réunion        |
| `gmail`                               | `gmail.send`        | Envoyer un email (1 destinataire/appel)       |
| `gmailRead`                           | `gmail.readonly`    | Lire les derniers échanges (métadonnées only) |
| `gmailDraft`                          | `gmail.compose`     | Créer un brouillon (revue avant envoi)        |
| `drive`                               | `drive.readonly`    | Lister + ingérer des Docs/PDF dans le RAG     |
| `sheets`                              | `spreadsheets`      | Exporter des contacts vers un nouveau Sheet   |

**Dérivation depuis les scopes réellement accordés** (whole-token match) : un compte connecté AVANT
l'élargissement conserve son ancien grant → les nouvelles capacités restent `false`, l'UI les grise
avec un CTA « Reconnecter ». Aucune régression pour les tokens existants — reconnecter élargit le grant
(`access_type=offline&prompt=consent&include_granted_scopes=true`).

## Endpoints API (`google.controller.ts`, JWT sauf callback)

- `GET /google/status` — configured/connected + capabilities + accountLabel.
- `GET /google/authorize` → `{ url }` (consent) ; `GET /google/callback` (redirige la SPA).
- `POST /google/gmail/send` — envoi (opt-out `SuppressionService`).
- `POST /google/gmail/draft` — brouillon (même opt-out).
- `GET  /google/gmail/threads?email=` — échanges récents, métadonnées only (sujet/from/date/snippet,
  jamais le corps complet ; dédupliqués au message le plus récent par thread).
- `POST /google/calendar/events` — créer un événement.
- `GET  /google/calendar/events/upcoming?query=` — RDV à venir filtrés par domaine du compte.
- `GET  /google/drive/files` + `POST /google/drive/ingest` — picker Drive → RAG (`ia.ragIngest`).
- `POST /google/sheets/export` — `{ title, columns, rows }` → nouveau Sheet.
- `DELETE /google` — déconnecte (workspace-scoped).

## Ce qui est surfacé, et où (web, react-i18next FR+EN, namespace `google`)

| Surface                                                                                                                            | Composant                                     | Fichier de montage                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------- |
| Réglages › Intégrations : carte Google + capability chips + toast `?google=`                                                       | `GoogleWorkspaceCard` (inline)                | `features/settings/view/IntegrationsView.tsx`                                |
| Fiche contact : « Rédiger un email » (brouillon/envoi pré-rempli du message généré) + « Derniers échanges » (lecture à la demande) | `ContactGmailCard` → `GmailComposeDialog`     | `features/contacts/view/contact-detail/ContactDetail.tsx`                    |
| Plan d'action : « Ajouter à Google Agenda » par action                                                                             | `AddToCalendarButton` → `AddToCalendarDialog` | `features/accounts/view/account-detail/tabs/plan/ActionPlanBoard.tsx`        |
| Aperçu compte : « Brief de prépa réunion » (RDV à venir matchant le compte)                                                        | `MeetingPrepBrief`                            | `features/accounts/view/account-detail/tabs/TabOverview.tsx`                 |
| Connaissances › Mes documents : « Importer depuis Google Drive »                                                                   | `DriveImportDialog`                           | `features/knowledge/view/Knowledge.tsx`                                      |
| /contacts : « Exporter vers Google Sheets »                                                                                        | `ExportSheetButton`                           | `features/contacts/view/ContactContent.tsx` (via `ContactsToolbar` trailing) |

Réutilisables : `GmailComposeDialog` (revue AVANT envoi — « Créer un brouillon » recommandé + « Envoyer »,
**jamais d'auto-send**), `AddToCalendarDialog`, `DriveImportDialog`, `GoogleConnectNotice` (CTA reconnexion).
Le statut/capacités viennent de `useGoogleStatus` ; chaque feature est grisée tant que son scope n'est pas
accordé. Aucune donnée inventée : API vide = section vide (les sections lecture ne s'affichent que connecté).

## Sécurité

- Envoi email = action sortante irréversible → toujours un écran de revue + clic explicite. Le brouillon
  est mis en avant (plus safe). Opt-out serveur (`SuppressionService`) sur send ET draft.
- Gmail read : jamais le corps complet stocké ; métadonnées lues à la demande, rien persisté.
- Sheets : les cellules sont envoyées en `userEnteredValue.stringValue` (littéral, jamais formule) →
  pas de surface d'injection.

## Activation (à faire côté opérateur — projet Cloud « Bellum » `bellum-502706`)

1. **Écran de consentement OAuth** : ajouter les nouveaux scopes sensibles — `gmail.readonly`,
   `gmail.compose`, `calendar.readonly`, `spreadsheets` — à la config de l'app (les scopes Gmail/Calendar
   restreints peuvent nécessiter une vérification Google selon le mode de publication).
2. **APIs activées** : Gmail / Calendar / Drive le sont déjà. **Activer l'API Google Sheets** si l'export
   Sheets est utilisé.
3. Poser `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` (= `<API_PUBLIC_URL>/google/callback`).
   Sans clés, tout reste no-op.
4. Les utilisateurs déjà connectés doivent **se reconnecter** (bouton « Reconnecter » sur la carte) pour
   accorder les nouveaux scopes ; sinon les nouvelles features restent grisées.
