---
sources:
  - apps/api/src/migrations/*.ts
---

# Schéma de base de données — Supabase PostgreSQL

## Table : accounts

Stocke chaque entreprise analysée.

```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
user_id UUID REFERENCES auth.users(id),
company_name TEXT NOT NULL,
sector TEXT,
employees TEXT,
revenue TEXT,
headquarters TEXT,
website TEXT,
subsidiaries JSONB DEFAULT '[]',
it_challenges JSONB DEFAULT '[]',
recent_signals JSONB DEFAULT '[]',
priority_score INTEGER,
priority_justification TEXT,
raw_analysis JSONB DEFAULT '{}',  -- COFFRE-FORT : contient TOUT le JSON brut de Claude
status TEXT DEFAULT 'analyzing' CHECK (status IN ('analyzing', 'completed', 'error')),
error_message TEXT,
user_context TEXT,
api_cost_euros NUMERIC(10,4),
created_at TIMESTAMPTZ DEFAULT now(),
updated_at TIMESTAMPTZ DEFAULT now()
```

Dates de collecte par SEGMENT (`*_collected_at`, `timestamptz` NULLABLE — `NULL` = jamais datée, donc concernée
par le rattrapage ciblé ; comparées à `SEGMENT_CAPABILITY_EPOCH`) : `contacts`, `signals`, `entities`, `strategy`,
`dossier_read`, `addressability_relation`, et `dossier_blocks_collected_at` (#4078, migration `1796530330276` —
les cinq blocs du dossier complet, datée par `DossierBlocksStep`).

`contacts_rules_applied_at` (`timestamptz` NULLABLE, LUDOVIC-C LC.1, migration `1796560598667`) : date de la
dernière remise des contacts EXISTANTS aux règles actuelles (filtre d'homonymes), sans recollecte ni crédit — elle
ne touche jamais `contacts_collected_at`. `NULL` = règles jamais repassées. Seul écrivain :
`ContactsService.applyCurrentContactRules`.

RLS : `auth.uid() = user_id`

## Table : contacts

**Disponibilité annoncée des coordonnées (R22 a4, migration `1796574871953`)** : `email_availability` et `phone_availability`
(`text` NULLABLE, CHECK `available | unknown | not_found`, posée avant le code). `available` = la recherche gratuite annonce
que la coordonnée existe sans la livrer ; `not_found` = cherchée, rien ; NULL = jamais annoncée. Écrites à la création depuis
la recherche, montées (jamais dégradées) à la fusion, et mises à jour par le verdict d'un enrichissement ciblé. La date de la
dernière recherche reste dans `enrichment_coordinates`. Lecture unique : `coordinateDisplay` (`@bellum/contracts`).

Chaque contact identifié pour un compte.

```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
user_id UUID REFERENCES auth.users(id),
full_name TEXT NOT NULL,
title TEXT,
entity TEXT,
decision_role TEXT CHECK (decision_role IN ('sponsor','champion','operational','purchasing','influencer','blocker','unknown')),
priority INTEGER,
email TEXT,
email_verified BOOLEAN DEFAULT false,
phone TEXT,
phone_nature TEXT CHECK (phone_nature IS NULL OR phone_nature IN ('professional_verified','professional_declared','personal','unknown')), -- #4178.1, migration 1796461968719 ; NULL = jamais qualifié ; jamais « pro » par déduction du format
phone_nature_source TEXT CHECK (phone_nature_source IS NULL OR phone_nature_source IN ('provider','human')), -- la correction humaine gagne
linkedin_url TEXT,
profile_summary TEXT,
why_contact TEXT,
email_message JSONB,      -- {subject, body}
linkedin_message TEXT,
phone_script TEXT,
followup_message JSONB,   -- {subject, body}
user_status TEXT DEFAULT 'new' CHECK (user_status IN ('new','contacted','replied','meeting','refused','silence')),
source TEXT CHECK (source IN ('linkedin_apify','apollo','ai_generated')),
raw_data JSONB,
created_at TIMESTAMPTZ DEFAULT now(),
updated_at TIMESTAMPTZ DEFAULT now()
```

RLS : `auth.uid() = user_id`

**Envoi individuel (#3699, #4179)** — colonnes ajoutées après coup, toutes NULLABLES (NULL = aucune tentative / jamais observé,
jamais rétro-calculé) : `email_send_state` (`claimed | handed_off | failed | uncertain` — `uncertain` arrête la reprise,
un timeout n'est pas un échec), `email_send_channel`, `email_send_from`, `email_send_attempted_at`, `email_send_attachments`
(JSONB : nom, taille, SHA-256 — jamais le contenu) et `email_sent_observed_at` (#4179.2, migration
`1796461948555-ContactEmailSentObserved`) : l'instant d'un message sortant LU dans la boîte connectée après une tentative
d'envoi par cette boîte. Seul cet instant autorise l'écran à écrire « dans les éléments envoyés de ta messagerie ».

## Table : contact_duplicate_decisions

Migration `1796610000000-ContactDuplicateDecisions`. La décision HUMAINE sur une paire de contacts proposée comme doublon :
`same` (« c'est la même personne ») ou `not_same` (« ce ne sont pas les mêmes »). On PROPOSE une fusion, on ne fusionne jamais
(doctrine) : cette table retient le verdict pour que la paire ne soit plus reproposée, elle ne fusionne rien.

```sql
id UUID PRIMARY KEY, workspace_id UUID NOT NULL → workspaces, account_id UUID NOT NULL → accounts,
left_contact_id UUID NOT NULL, right_contact_id UUID NOT NULL,   -- paire ORDONNÉE : CHECK (left < right)
decision TEXT NOT NULL CHECK (decision IN ('same', 'not_same')),
user_id UUID NOT NULL, decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
UNIQUE (workspace_id, left_contact_id, right_contact_id)          -- une décision par paire et par espace
-- index (workspace_id, account_id) ; RLS : auth.uid() = user_id
```

## Table : attack_angles

```sql
id UUID, account_id UUID, user_id UUID,
title TEXT, description TEXT, entry_point TEXT,
is_recommended BOOLEAN, rank INTEGER, created_at TIMESTAMPTZ
```

## Table : action_plans

```sql
id UUID, account_id UUID, user_id UUID,
strategy_type TEXT, strategy_justification TEXT,
weeks JSONB,  -- Plan complet séquencé
created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
```

## Table : profiles

```sql
id UUID, user_id UUID,
full_name TEXT, company_name TEXT,
onboarding_data JSONB,  -- Réponses au questionnaire (12 questions)
onboarding_completed BOOLEAN DEFAULT false,
created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
```

## Table : rag_documents

```sql
id UUID, user_id UUID,
title TEXT, content TEXT, category TEXT,
embedding VECTOR(1536),  -- pgvector (à activer)
created_at TIMESTAMPTZ
```

Index vectoriels (audit IA M2, migration `1796541541000-RagHnswIndexes`) : `rag_documents_embedding_idx` et
`rag_document_chunks_embedding_idx` sont en **HNSW `vector_cosine_ops`** (plus ivfflat entraîné sur table vide) ;
`match_rag_documents` règle `hnsw.ef_search = 200` et, si pgvector ≥ 0.8, `hnsw.iterative_scan = strict_order`,
pour qu'un petit espace retrouve ses documents APRÈS filtre.

## Tables porteuses de secrets — RLS sans politique (audit IA M6)

Migration `1796541542000-SecretTablesRowLevelSecurity` : `oauth_clients`, `oauth_authorization_codes`,
`oauth_refresh_tokens`, `oauth_consents`, `api_keys`, `google_connections`, `user_sessions` ont la RLS ACTIVÉE
**sans aucune politique** et `REVOKE ALL` pour `anon` / `authenticated` : seule l'API (TypeORM, rôle propriétaire)
et `service_role` les lisent. Un futur accès navigateur passe par l'API, jamais par une policy.

## Table : user_credits

```sql
id UUID, user_id UUID,
plan TEXT DEFAULT 'free',
accounts_limit INTEGER DEFAULT 3,
accounts_used INTEGER DEFAULT 0,
enrichment_credits INTEGER DEFAULT 0,
stripe_customer_id TEXT,
stripe_subscription_id TEXT,
created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
```

## Table : credit_ledger

Registre append-only des mouvements de crédits (consommations, remboursements, grants, top-ups).

```sql
id UUID PRIMARY KEY, owner_user_id UUID NOT NULL, workspace_id UUID, actor_user_id UUID,
kind TEXT NOT NULL,           -- consume_analysis | refund_analysis | consume_enrichment | refund_enrichment | grant_plan | topup
resource TEXT NOT NULL,       -- analysis_slot | enrichment_credit
delta INTEGER NOT NULL, reason TEXT, account_id UUID,
refunds_ledger_id UUID,       -- refund_analysis : id du débit consume_analysis soldé (#4123) ; NULL ailleurs et pour l'historique
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
```

Index : `credit_ledger_owner_created_idx (owner_user_id, created_at DESC)` ;
`credit_ledger_refresh_refund_once_idx (reason) WHERE kind = 'refund_enrichment' AND reason LIKE 'refund:refresh-within-6h:%'` (UNIQUE partiel) ;
`credit_ledger_refund_analysis_once_idx (refunds_ledger_id) WHERE kind = 'refund_analysis' AND refunds_ledger_id IS NOT NULL` (UNIQUE partiel, migration `1796458341011-CreditLedgerRefundAnalysisOnce`) :
un débit d'analyse ne se rembourse qu'une fois, même si l'annulation utilisateur et le `onFailed` du worker arrivent en même temps.
`CreditsService.refundAnalysisSlot` réserve la ligne (`ON CONFLICT DO NOTHING`) AVANT de toucher au compteur ; le perdant est un no-op journalisé.

## Garde-fous entre collègues — `workspace_do_not_contact`, `account_team_members` (#4158 lot L4)

Migration `1796506798642-TeamGuardrails`, AJOUT SEUL (aucune colonne existante touchée).

- **`workspace_do_not_contact`** — la liste « ne pas contacter » de l'ESPACE : `kind` (`contact` | `domain`),
  `contact_id` OU `domain` (CHECK `workspace_dnc_target_check`), `reason` obligatoire (≥ 3 caractères), `added_by`,
  `created_at`. Retirer pose `lifted_at` / `lifted_by` : on archive, on ne supprime pas. Index uniques partiels sur
  les entrées actives. ⚠️ Distincte de `contact_stops` (le refus d'une PERSONNE) et de l'effacement RGPD (c67).
- **`account_team_members`** — les co-équipiers d'un compte, en plus du responsable (`accounts.assigned_to`).
  Retirer pose `removed_at` / `removed_by`. Ne change PAS la visibilité (tout l'espace voit déjà tout) : elle sert
  au filtre `ownership: 'mine'` de la liste des comptes et aux notifications à venir.
- **`account_team_scopes`** (#4996, migration `1796610035100-AccountTeamScopes`) — la zone d'un membre sur un compte
  groupe : une entité du CLIENT (`entity_id` → `account_entities`, `ON DELETE SET NULL`) ou un texte libre (`entity_id`
  NULL). Clé `(account_id, user_id)` sans FK vers `account_team_members` : le responsable (`assigned_to`) peut en
  porter. `label` NOT NULL (2..120, borne du contrat `ACCOUNT_TEAM_SCOPE_LABEL_*`) : texte libre, ou mémoire du nom
  d'une entité retirée. Retirer pose `removed_at` / `removed_by` (couple CHECK). Uniques partiels : une entité et un
  libellé libre (casse/espaces ignorés) une fois par membre actif ; deux membres peuvent couvrir la même entité. FILTRE
  et pré-assigne, ne bloque aucun geste. RLS : lecture par les membres de l'espace (la même politique est posée sur
  `account_team_members`) ; aucune politique d'écriture, seule l'API écrit.

## source_cache — faits PUBLICS partagés entre espaces (#4067)

Créée par le service IA à sa première utilisation (`apps/ia/app/services/source_cache.py`), posée aussi par la
migration `1796461934273-SourceCachePublicFactsBoundary` à la forme exacte du DDL IA (`CREATE TABLE IF NOT EXISTS`).
Clé `(source, category, company_key)`, `payload` JSONB, `expires_at`. Relue par TOUS les espaces (`public_facts.py`) :
c'est pourquoi la RLS est ACTIVÉE **sans politique** (aucun rôle client ne lit ni n'écrit), et un CHECK refuse toute
famille privée d'un espace (CRM, notes, documents, missions, corrections…). Les natures publiques admises sont les
mêmes listes que `public_facts.py` (relues par `apps/ia/tests/test_public_facts.py`).

#3989 — contrat partagé `packages/contracts/src/schemas/shared-public-facts.ts`, redit en SQL par la migration
`1796530328276-SharedPublicFactsContract` sur la seule famille `public_facts` (trois CHECK `NOT VALID` : les lignes
existantes ne sont pas relues, toute écriture neuve l'est) : `source_cache_public_fact_company_key` (la clé est une
ENTREPRISE — `siren:`/`domain:` — suivie d'un jeton fermé, jamais un espace ni un texte libre) ;
`source_cache_public_fact_collected_at` (`collectedAt` et `rows` obligatoires — `COALESCE`, un CHECK à NULL passerait) ;
`source_cache_public_fact_no_workspace_marker` (aucun `workspace_id`/`workspaceId`/`user_id`/`userId` à aucune profondeur
du `payload`). Garde **GA-414** (`ga-414-base-commune-faits-publics.spec.ts`) : le SQL de `public_facts.py` et
`source_cache.py` ne nomme que `source_cache` et aucune colonne d'espace, et les listes Python = le contrat.
⚠️ Hors famille `public_facts` : l'horodatage de re-run (`begin_run`) range une ligne sous l'`account_id` brut — reste
nommé au `gap` de c94.

## Mode équipe — continuité (#4158.29 à .31, lot L5)

Ajout seulement, deux migrations :

- **`account_team_scopes.business_unit_id`** (#4996.4, migration `1796650000000-AccountTeamScopesBusinessUnit`) — la
  zone peut être une BU de NOTRE espace (`business_units`, FK `ON DELETE SET NULL`, NULLABLE). CHECK
  `account_team_scopes_entity_or_bu_check` : entité OU BU, jamais les deux (le libellé libre, les deux NULL, reste
  permis). Unique partiel `account_team_scopes_bu_active` (une BU une fois par membre actif) ; l'unique du libellé
  libre exclut désormais les zones de BU. Écrit par `addTeamScope` (BU lue avec `workspace_id`, sinon 400) ; lu par
  `assigneeCandidates` (couvre les contacts d'un compte dont `accounts.business_unit_id` = la BU).
- **`account_team_members.account_id`** (#4996 L8, migration `1796610035217-AccountTeamFks`) — FK `account_team_members_account_fk → accounts(id) ON DELETE CASCADE`, posée `NOT VALID`, orphelins comptés, puis `VALIDATE` ; s'il y a des orphelins la migration échoue en le disant et ne supprime rien. FK composite d'entité sur `account_team_scopes` écartée (`SET NULL (entity_id)` = PostgreSQL 15+, non vérifié sur Supabase) : « entité du même compte » reste tenu par `addTeamScope`.
- `1796523337902-TeamHandoffNoteAndThreadResolution` — `action_plan_items.handoff_note TEXT NULL` et
  `handoff_by UUID NULL` (la note de contexte d'une délégation à un collègue, et son auteur ; NULL sur l'existant) ;
  `team_comments.parent_comment_id UUID NULL` (une réponse se rattache à la RACINE de son fil),
  `resolved_at TIMESTAMPTZ NULL` et `resolved_by UUID NULL` (fil résolu, porté par la racine ; rouvrir efface la marque).
  Index partiel `team_comments_parent_idx (workspace_id, parent_comment_id) WHERE parent_comment_id IS NOT NULL`.
- `1796530275187-SharedContentVisibility` — `visibility TEXT NOT NULL DEFAULT 'team' CHECK (visibility IN ('team','personal'))`
  sur `sequence_templates` et `message_library_entries` (`team` = partagé avec l'équipe, c'est le comportement d'avant ;
  `personal` = visible de son seul auteur). `sequence_templates` gagne aussi `created_by UUID NULL` et `updated_at TIMESTAMPTZ NULL`
  (NULL sur l'existant : un modèle antérieur reste partagé, sans propriétaire inventé).

`action_plan_items` n'a toujours pas de `workspace_id` : la reprise de portefeuille d'un partant (`actions`, `followups`)
est bornée PAR LE COMPTE (`account_id IN (SELECT id FROM accounts WHERE workspace_id = …)`).

### Colonne vertébrale CRM/ATS — positionnement chiffré, une mission par positionnement (#4192)

Migration `1796481204517-CrmBackbone` (épopée #4191, lot L1) :

- `submissions.planned_days` (entier > 0) et `submissions.daily_cost_cents` (≥ 0), nullables : avec `proposed_rate_cents`,
  ils donnent la marge prévue `(TJM − coût) × jours` (`plannedMarginCents`, contrat `submission.ts`) — un des trois absent
  = marge NON MESURÉE, jamais 0.
- L'unicité « une mission par affaire » (`missions_opportunity_uniq`, BEL-FIX-001) devient « une mission par (affaire,
  positionnement) » : `missions_opportunity_submission_uniq` + `missions_opportunity_nosub_uniq` (une seule mission SANS
  positionnement par affaire).
- `missions.opportunity_id` devient une vraie FK vers `opportunities` `ON DELETE SET NULL` (orphelins remis à NULL) ;
  `missions.submission_id` est recréée `ON DELETE SET NULL` — supprimer une affaire ou un positionnement garde la mission.

### Pilotage › Staffing — absences et seuil TACE (L3, 14/10/2026, `1796537418263-PilotageStaffingTace`)

- `consultant_absences` (neuve) : `id`, `workspace_id` (FK `workspaces`, cascade), `consultant_id` (FK `consultants`, cascade), `kind` (CHECK `leave` / `sick` / `training` / `other`, défaut `leave`), `starts_on`, `ends_on` (CHECK `ends_on >= starts_on`), `created_at`. Index `(workspace_id, starts_on, ends_on)`. RLS : lecture aux membres de l'espace ; l'autorisation réelle vit dans le contrôleur (`team:manage`). Sans elle, une semaine de congés comptait comme capacité disponible et pesait sur le TACE.
- `workspaces.tace_alert_threshold_percent` (numeric, nullable, CHECK 1 à 100) : le seuil d'alerte TACE de l'espace. NULL = rien saisi = aucune alerte, jamais 0. Même doctrine que `margin_alert_threshold_percent`.
- TACE = jours facturés ÷ jours ouvrés disponibles (congés, absences et fériés exclus du dénominateur).

### Réglages › Marque & documents — signature et pied de document (R22-ECRAN-d6, 22/10/2026, `1796574800005-WorkspaceDocumentIdentity`)

- `workspaces.document_signature` (text, nullable, CHECK ≤ 600 caractères) : la signature que l'espace propose en fin de dossier de compétences. NULL = aucune : le document n'en porte pas, rien n'est inventé.
- `workspaces.document_footer` (text, nullable, CHECK ≤ 300 caractères) : le pied répété en bas de chaque page du dossier (Word et PDF). Même doctrine.
- Écriture : `PATCH /workspaces/brand` (propriétaire ou administrateur, refusé en salle de démonstration) ; lecture : `GET /workspaces/brand/documents` (authentifiée — jamais dans la marque publique). Lues par `ConsultantsController.downloadCvDocx` / `downloadCvPdf`.

### Pilotage › Pipe — catégorie déclarée et journal des champs (L2, 14/10/2026, `1796538906517-OpportunityForecastCategory`)

- `opportunities.forecast_category` (text, nullable) : la catégorie DÉCLARÉE par le commercial. CHECK `commit` (« Engagé ») / `best_case` (« Possible ») / `pipeline` (« Pipe ») / `omitted` (« Hors prévision »), posé avant le code qui écrit (GA-11/GA-12). NULL = « non déclarée », jamais devinée. C'est une déclaration humaine, pas une probabilité : aucun pourcentage associé, totaux non pondérés.
- `opportunity_field_changes` (neuve) : `id`, `workspace_id`, `opportunity_id`, `field` (CHECK `amount_cents` / `expected_close_on`), `from_value`, `to_value`, `actor_id`, `occurred_at`. Journal des montants et des dates prévues d'une opportunité ; il alimente le waterfall du pipe (montées / baissées) et les signaux « montant baissé » et « date repoussée ». RLS activée.

### `consultants.availability` accepte `en_mission` (#4196)

Migration `1796531408463-ConsultantAvailabilityEnMission` (épopée #4191, lot L5) : `consultants_availability_check`
s'élargit à `en_mission` (#2186.5), valeur déjà dans `consultantAvailabilitySchema` mais jamais écrite jusqu'ici. L5
la pose à l'affectation d'un consultant à une mission. `down()` ramène `en_mission` à `indisponible` avant de resserrer.

### Cycle de vie d'une mission — rattrapage des consultants archivés en mission (#4196)

Migration `1796531417285-UnarchiveConsultantsOnMission` (épopée #4191, lot L5) : migration de DONNÉES, aucun schéma
changé. Elle désarchive les consultants qui portent une affectation en cours (`mission_assignments` d'une mission en
cours) — un consultant en mission n'est jamais archivé, et `archive`/`archiveBulk` le refusent désormais (409). Idempotente,
elle annonce le nombre de fiches rouvertes (`RAISE NOTICE`) ; `down()` ne réarchive rien (on ne recrée pas un état faux).

### `universal_import_jobs.skipped_lines` — les lignes écartées à la vérification (Théo B c4.N1, migration `1796575083251`)

`jsonb NOT NULL DEFAULT '[]'` : les numéros de ligne du FICHIER (l'en-tête est la ligne 1) que l'humain a décidé de ne pas importer à la vérification. Le worker les saute et les liste au rapport (`reason = 'skipped_by_user'`) ; une reprise respecte la même décision. Colonne ajoutée seulement, un job d'avant se relit à l'identique.

### `universal_import_jobs.sheet` — l'onglet lu d'un classeur (#4426.4, migration `1796570075627`)

`text`, nullable, ajout seul. `NULL` = le choix automatique de l'onglet (celui dont les en-têtes reconnaissent les champs
obligatoires du type, puis le plus fourni) ; un CSV / JSON le laisse à `NULL`. Écrit au lancement (`/start`), relu par le worker.

### `universal_import_jobs.sheet_passes` — un dépôt, toutes les feuilles (#5223, migration `1796900202780`)

`jsonb`, nullable, ajout seul. `NULL` = une seule feuille (CSV, JSON, ou `sheet` d'avant) : chemin inchangé. Sinon une passe
par feuille cochée, dans l'ordre du lancement : `{ name, mapping, done, totalRows, committedRows, created, duplicates,
rejected, toReconcile, reasons[] }`. Chaque feuille garde SA correspondance de colonnes. `committedRows` avance dans la
transaction du paquet (même règle que `committed_rows`) : une reprise saute les feuilles `done` et repart au dernier paquet
validé de la feuille entamée. `totalRows` reste `null` tant que la feuille n'est pas lue jusqu'au bout (jamais 0).
`universal_import_issues.sheet` (`text`, nullable) nomme la feuille d'un écart : deux feuilles ont chacune leur ligne 2.

### `sequence_template_steps.kind` — les scripts d'appel d'une campagne (#4426.7, migration `1796570155559`)

`text NOT NULL DEFAULT 'email'`, `CHECK (kind IN ('email', 'call_script'))`, ajout seul. `email` = une étape de la cadence
(le comportement d'avant) ; `call_script` = un script d'appel importé avec la campagne (ligne « Script : Accroche »),
`subject` = son titre, `delay_days = 0`. La lecture les rend à part (`call_scripts`) : ils ne sont jamais appliqués comme étapes de mail.

### `context_pack_imports` — l'historique des imports de l'assistant (#4422.1, migration `1796570184640`)

Une ligne par fichier importé par « Dépose tes documents » vers les postes cibles, la grille, les séquences ou les connaissances
(les comptes sont déjà des jobs `universal_import_jobs`). `workspace_id → workspaces (id) ON DELETE CASCADE`, `user_id`, `file_name`,
`destination` (CHECK : `target_personas` | `qualification_grid` | `sequences` | `knowledge`), `status` (CHECK : `done` | `failed`),
`imported` et `scripts` NULLABLES (NULL = l'importeur ne le dit pas, jamais un 0), `skipped >= 0`, `message`, `created_at`. RLS par espace.

### Plusieurs boîtes mail par commercial (#4546, migration `20261025100000`)

`google_connections` et `microsoft_connections` gagnent `scope_type text` (ajout seul). L'unicité change de forme :
`<table>_user_provider_uidx` (une seule connexion par utilisateur et par fournisseur) est remplacé par
`<table>_multi_mailbox_uidx`, qui laisse coexister plusieurs boîtes du même fournisseur pour un même commercial.
Conséquence à connaître pour tout code qui lit ces tables : **un `findOne` ne suffit plus à désigner « la » boîte** —
c'est `created_at` qui départage, et le type `ConnectionRow` (`apps/api/src/common/util/personal-connection.ts`)
l'exige désormais. La garde d'isolement entre collègues (`personal-connection.spec.ts`) reste ce qu'elle était :
un commercial ne lit jamais la boîte d'un autre. Réversible : le `down` restaure l'index d'origine et retire la colonne.

### `automation_rules` — comparer un brouillon avant de basculer (#2399.6, #2399.7, migration `1796575200123`)

Deux colonnes, ajout seul : `draft_compared_at timestamptz` (NULL = la comparaison n'a jamais été ouverte — jamais un 0)
et `version_history jsonb NOT NULL DEFAULT '[]'::jsonb`, sous `CHECK` de forme. Elles servent l'écran « Avant de basculer » :
une règle ACTIVE ne change plus en silence, son brouillon se compare à la version en vigueur avant la bascule.
Les deux ayant un défaut, aucune reprise de données n'est nécessaire.

### `context_pack_imports` — l'ORIGINAL du document se garde (#4573, migration `1796583917461`)

Quatre colonnes NULLABLES, sans défaut, ajout seul : `original_status`, `original_storage_path`,
`original_mime_type`, `original_size_bytes`. L'original d'un document de contexte se conserve et se relit, règle
des CV (#4034) : **seau PRIVÉ + URL signée**, jamais un objet public.

Trois `CHECK` posés AVANT le code qui écrit (GA-11/GA-12) : `original_status` dans
`kept | too_big | unavailable | failed_import | erased` (liste tenue par `CONTEXT_PACK_ORIGINAL_STATUSES`,
`@bellum/contracts`), un `original_storage_path` **seulement** pour un original `kept`, et une taille `>= 0`.

Rien de rétroactif : une ligne d'avant garde `original_status = NULL` et l'écran DIT qu'elle n'a pas gardé son
original (« on n'affiche pas ce qu'on n'a pas ») — aucun fichier n'est reconstruit. L'effacement RGPD d'une
personne (c67, #2297) emporte ses originaux et pose `erased` : c'est le seul statut qui retire un fichier déjà
conservé. Le RLS de la table (lecture par les membres de l'espace) couvre déjà ces colonnes. `down` réversible.

## Champ raw_analysis — Structure JSON

Ce JSONB dans accounts contient tout ce que Claude produit en Phase 1 :
businessDescription, entitiesExhaustive, sitesFrance, programNames, budgetSignals,
itChallenges, recentSignals, pains, priorityJustification, competitors, esnSynergies,
technologyStack, regulations, angles, commentOuvrirCompte, rdvScript, powerQuestions,
objections, linkedinSearchKeywords, peopleMentioned, organigrammeLogic.
Plus les données Pappers (siren, dirigeants, établissements).
Plus les données Phase 4 (offresAConstruire, evaluationCompte, planHebdomadaire).

## `is_private` sur `opportunities`, `project_needs`, `missions` (#4158.34)

Migration `1796513491782-ObjetsAssociesPrives` : `is_private boolean NOT NULL DEFAULT false` (ajout seulement —
tout objet existant reste partagé avec l'espace). Un objet privé n'est lu, sur la fiche Contact (« Dossiers
associés »), que par son porteur (`owner_id`) ou un gestionnaire d'équipe (`team:manage`) : il ne fait AUCUNE
ligne chez les autres, ni nom ni compteur. Le filtre est dans le SQL de `contact-associations.ts`.

## Table : notifications — boîte de réception d'équipe (#4158.14, migration `1796498061438`)

La cloche est par utilisateur ; deux colonnes NULLABLES l'ouvrent à l'espace, sans rien réécrire.

```sql
workspace_id UUID,      -- l'espace où le geste a eu lieu ; NULL = notification personnelle (produit, Laura), visible partout
actor_user_id UUID,     -- l'auteur du geste (un collègue), nom lu au moment d'afficher ; NULL = pas d'auteur humain
```

Index `notifications_user_workspace_created_idx (user_id, workspace_id, created_at DESC)`.
Types ajoutés (texte libre, aucune contrainte SQL) : `account_assigned`, `action_delegated`, `team_mention` ;
`esn_description_pending` n'est JAMAIS stocké (entrée calculée à la lecture).

**Anciennes notifications d'équipe sans espace (#4158.56, migration `1796541382915-TeamNotificationsBackfillWorkspace`).**
`chat_mention`, `chat_action_assigned` et `approval_assigned` naissaient SANS `workspace_id` et se lisaient dans tous les
espaces. La migration pose `workspace_id` (ajout seulement : uniquement sur des lignes NULL, rien de supprimé) quand le lien
cite un compte (`accountId=`) ou un fil de chat (`conversationId=`) ; ce qui reste NULL ne se lit plus que dans l'espace
personnel (celui dont on est propriétaire) ou sans espace actif. Les trois producteurs posent désormais l'espace et l'auteur.

## Table : notification_preferences — e-mail entre collègues (#4158.19)

Quatre interrupteurs `BOOLEAN NOT NULL DEFAULT false` : `email_on_assignment`, `email_on_delegation`,
`email_on_mention`, `email_on_manager_digest` (ce dernier réservé au digest du manager, lot L5). Un e-mail
est un ENVOI : faux par défaut, au destinataire seul, sans le corps d'aucun message, jamais depuis une salle de démo.

## Séquences multicanal — `outreach_sequences` / `outreach_sequence_steps` (#4165, 14/10/2026)

Migration `1796489437261-OutreachMultichannelSteps` (contrainte élargie AVANT le code qui l'écrit, GA-11/12) :

- `outreach_sequence_steps.kind` : CHECK élargi à `email`, `reminder`, `task`, `linkedin_invite`, `linkedin_message`, `call`.
  LinkedIn et appel restent des gestes MANUELS (aucune automatisation LinkedIn).
- `outreach_sequences.delay_unit` text NOT NULL DEFAULT `'calendar_days'`, CHECK `business_days` | `calendar_days`.
  Le défaut base garde l'existant en jours calendaires (aucun changement silencieux) ; une NOUVELLE séquence est créée en `business_days`.
- `outreach_sequences.vacation_paused_at` / `vacation_until` timestamptz : pause vacances ; à la reprise, les échéances restantes
  sont décalées de la durée de pause.

## Automatisations — `automation_rules` / `automation_rule_firings` (#4167, lot L-D1, 14/10/2026)

Migration `1796540127394-AutomationRules` (contraintes élargies AVANT le code qui les écrit, GA-11/12). Additive, rien n'est réécrit.

- `outreach_messages.source` et `outreach_call_tasks.source` : CHECK élargi à `automation` (copie de `OUTREACH_SURFACES`) — ce
  qu'une règle prépare arrive dans « À traiter » avec sa provenance.
- `automation_rules` : `workspace_id`, `user_id` (règle PERSONNELLE, scopée à l'espace), `signal` (CHECK = `AUTOMATION_SIGNALS`),
  `action_kind` (`enroll_sequence` | `prepare_action`), `playbook_key` (CHECK = les huit modèles de séquence, nullable),
  `prepared_action` (`email_to_review` | `call_to_make`, nullable), `inactive_days` (7–365, seul réglage d'une source),
  `enabled` (défaut **false** : une règle naît éteinte), `credit_cap` (30 jours, nullable = aucun), `template_key`,
  `last_run_at` (NULL = jamais passée ⇒ compteurs « non mesuré »). `automation_rules_grammar_check` : une inscription porte une
  séquence et pas d'action préparée, une préparation l'inverse.
- `automation_rule_firings` : le JOURNAL — une ligne par signal et par règle (`UNIQUE (rule_id, signal_ref)`, donc un passage
  rejouable ne refait rien), `outcome` (CHECK = `AUTOMATION_OUTCOMES` : `enrolled`, `prepared`, `excluded`, `no_contact`, `failed`,
  `cap_reached`), `reason` (code d'exclusion de l'outreach ou motif nommé), `sequence_id` / `message_id` (ce qui a été créé),
  `credits_spent`. Le compteur « 30 jours » est un COMPTAGE des lignes `enrolled` / `prepared`, jamais une estimation.

## CRM fournisseurs — `account_crm_exports`, `crm_sync_cursors` (#4187/#4188/#4189, 14/10/2026)

Migrations `1796537700100-AccountCrmExports` puis `1796541540046-CrmFournisseursZoho` (contraintes de fournisseur élargies AVANT
le code qui écrit `zoho`, GA-11/12 ; aucune valeur retirée, GA-08) :

- `account_crm_exports` : une ligne par (compte, CRM) — la référence externe (`crm_record_id`) d'un compte déjà envoyé ;
  un second envoi se lit « déjà présent » au lieu de recréer la société.
- `crm_sync_cursors` : le curseur de la synchro incrémentale, par (espace, fournisseur, objet) ; n'avance que sur un passage abouti. `last_run_at` = dernier ESSAI ; `last_success_at` (#4290.16, nullable, migration `1796570094748`) = dernière synchro RÉUSSIE — la seule date que l'écran dit « synchronisé » ; une ligne en échec depuis toujours n'en a pas (jamais une date devinée).
- `sync_runs.conflict_count` : fiches modifiées des deux côtés (correction humaine gardée, écart compté).
- Les CHECK de fournisseur de `contact_crm_exports`, `account_crm_exports` et `sync_links` admettent `zoho`.

Migration `1796541384532-MatchChunksIndexFriendly` (R10C-FIX) : le RPC RAG ne balaie plus la table (compatible index HNSW).

Migration `1796541600000-SyncConflictProposal` (#4189) : `sync_record_events.proposal jsonb` (nullable, ajout seul) — par
champ en écart, `{ "email": { "bellum": "…", "crm": "…" } }` : la valeur gardée (correction humaine) et celle du CRM.
Les journaux déjà écrits restent valides, sans proposition.

Migration `1796575024619-SyncConflictKeptFields` (Théo D settings-integrations.N3, 22/10/2026) : `sync_record_events.kept_fields
text[]` (non nul, défaut `{}`) — les champs d'un écart dont l'utilisateur a gardé la valeur Bellum (l'écart ne se repropose
plus) ; `sync_record_events.entity_label text` (nullable) — le nom de la fiche (contact ou société) au moment de l'écart,
pour que l'onglet « À relire » la nomme sans relire `contacts`. Ajouts seuls : les journaux déjà écrits restent valides.

Migration `20261026230417-SyncRecordEventsEntityLabel` (#4615, 26/10/2026) : la colonne `sync_record_events.entity_label`
annoncée juste au-dessus n'était **jamais ajoutée par le `up()`** de `1796575024619` — seulement supprimée par son
`down()`. `GET /crm/import/status` rendait donc 500 (`column e.entity_label does not exist`, 47 événements Sentry). La
migration déjà passée en production n'est pas réécrite : la colonne est ajoutée ici, `ADD COLUMN IF NOT EXISTS`,
nullable, ajout seul. Un écart déjà journalisé n'a pas de nom, l'écran ne l'invente pas.

Migration `1796575036047-McpAccessIntents` (Théo D settings-outils.N1, 22/10/2026) : `mcp_access_intents` — l'INTENTION d'un
membre de brancher un assistant (« Cadre d'un nouvel accès ») : `name`, `perimeter` ∈ `mine | shared`
(`MCP_ACCESS_INTENT_PERIMETERS`), `status` ∈ `pending | approved | declined` (`MCP_ACCESS_INTENT_STATUSES`, contraintes
posées avant le code), `requested_by`, `decided_by`/`decided_at`. Aucun jeton, aucun droit d'écriture : le jeton naît à la
connexion de l'assistant. Vide à dessein en démo (`demo-coverage.ts`).

## Vague 2 — contraintes élargies et tables neuves (15-16/10/2026)

Migrations additives (contraintes élargies AVANT le code qui écrit, GA-11/12) :

- `1796541700123-EngagementDraftChannelVoicemailRecommendation` : CHECK `channel` de `engagement_drafts` et de
  `message_draft_versions` élargi à `voicemail` et `recommendation` (en plus de `email`, `linkedin`, `phone`, `task`).
- `1796545000000-PublicRegistryAwards` : `public_registry_announcements.source` admet `decp`, `kind` admet `award` ;
  `public_registry_watch_state.awards_checked_at` timestamptz (nullable).
- `1796560050638-PublicRegistryRne` (#3921.9) : `public_registry_announcements.source` admet `rne`, `kind` admet
  `establishment_closure` ; `public_registry_watch_state.rne_checked_at` timestamptz (nullable, curseur du premier passage).
  `esn_directory.public_awards` / `awards_refreshed_at` ont un écrivain depuis #3921.10 (marchés GAGNÉS, rôle titulaire).
- `1796560183915-PublicRegistryAwardWon` (#3915.decp) : `public_registry_announcements.kind` admet `award_won` (compte TITULAIRE) ;
  son CHECK est l'UNION finale (`award`, `award_won`, `establishment_closure`…), posé APRÈS `PublicRegistryRne`.
- `1796546100000-SharedPersonCoordinates` : table `shared_person_coordinates` (`fact_id` PK → `shared_company_people` ON DELETE
  CASCADE, `email`, `phone`, `first_shared_at`, `last_seen_at`) ; CHECK au moins un des deux présent, e-mail de forme valide ;
  RLS activée.
- `1796574600000-SharedCompanyPeopleEmployment` (#4286.15.b) : `shared_company_people.employment_state` text NOT NULL
  DEFAULT `current`, CHECK `current` | `former` ; `left_at` date nullable, CHECK `left_at IS NULL OR employment_state = 'former'`.
  Posés avec `last_seen_at` à chaque observation ; « inconnu » ne se stocke pas (non revu depuis 365 j = lu inconnu).
- `1796574700000-SharedMarketPatternAggregates` (#4286.15.c, `market_pattern`) : table `shared_market_pattern_aggregates`
  (`scope`, `topic` domaine de métier, `sector_key` `all`|`naf_NN`, `size_band`, `region_key` `all`|13 régions,
  `observations`, `window_days`, `contributing_workspaces`) ; PK sur la cellule, CHECK `contributing_workspaces >= 3`,
  vocabulaires fermés, aucune colonne d'espace, de nom ni de coût (GA-43, GA-416) ; RLS activée.
- `1796546200000-LossReasonCode` : `opportunities.loss_reason_code` text nullable, CHECK sur la liste fermée `price`,
  `competitor_won`, `no_budget`, `project_cancelled`, `bad_timing`, `no_profile_available`, `other`.
- `1796546300000-CrmWebhookEvents` : table `crm_webhook_events` (`workspace_id`, `provider` CHECK `hubspot` | `salesforce`,
  `event_id` 1-200 caractères, `received_at`) ; `UNIQUE (provider, event_id)` (un événement rejoué ne refait rien) ; RLS activée.
- `1796560000001-AccountDeclaredRouteBudgetAvailabilityNetwork` : `accounts.declared_route_budget`,
  `declared_route_availability`, `declared_route_network` (text, nullables) — critères de route déclarés.

## Vague 10 — tables neuves et canaux élargis (17/10/2026)

- `1796560184000-RecordImportMarks` (#4051) : table `record_import_marks` (`workspace_id`, `entity_type` CHECK `account` | `contact` | `consultant`, `entity_id`, `source_kind` CHECK `file` | `tool`, `source_label`, `imported_at`) — la ligne « Importé le … depuis … » de l'historique d'une fiche. Classée dans `TABLE_SCOPES` (GA-65).
- `1796560184635-FieldContradictions` (#4016.L13) : table `field_contradictions` (`workspace_id` nullable, `entity_type`, `entity_id`, `field`, `value`, `source` CHECK `connector` | `pipeline` | `model`, `observed_at`) ; index `(entity_type, entity_id, observed_at DESC)` ; RLS activée. Un fait confirmé n'est jamais écrasé : la contradiction se NOMME à côté, datée ; une correction humaine gagne toujours (même prédicat que « Garder la valeur du CRM », #4189.9).
- `1796560200370-OutreachChannelsSmsWhatsappAndPrepared` (#2370) : CHECK `channel` élargi AVANT le code (GA-11/12) sur `outreach_messages`, `message_style_templates`, `outreach_approved_templates`, `engagement_drafts`, `message_draft_versions` à `sms`, `whatsapp`, `task`, `introduction_request`, `partner_message`, `follow_up_email`, `profile_push`, `linkedin_connection_note`. Ces canaux sont PRÉPARÉS, jamais envoyés seuls.
- `1796560255919-WorkspacePersonalMerge` (#4158.57, décision Louis 17/10/2026) — rapatrier l'espace PERSONNEL dans l'espace ESN rejoint. AJOUT SEULEMENT : `workspaces.archived_at` (timestamptz NULL — l'espace rapatrié est archivé, jamais supprimé, ses lignes restent lisibles) et `workspaces.merged_into_workspace_id` (uuid NULL). Table `workspace_merge_requests` (`workspace_id` = espace CIBLE, `source_workspace_id`, `requested_by`, `status` CHECK = `WORKSPACE_MERGE_STATUSES`, `preview` jsonb = l'aperçu FIGÉ, `preview_hash` = son empreinte SHA-256 sur laquelle portent les deux validations, `user_validated_at`, `admin_validated_by/at`, `rejected_by/at`, `started_at`, `finished_at`, `last_error`) ; CHECK source ≠ cible ; index unique partiel « une demande vivante par espace personnel ». Table `workspace_merge_items` (journal du job : `request_id`, `workspace_id` cible, `source_table` CHECK `accounts` | `contacts`, `source_id`, `target_id` = la copie ou la fiche existante proposée, `outcome` CHECK `copied` | `duplicate_proposed` | `held_with_account`, UNIQUE `(request_id, source_table, source_id)` — idempotence et reprise). RLS activée sur les deux ; lecture directe réservée au demandeur et aux owner/admin de la cible. Aucune ligne de `accounts` / `contacts` existante n'est jamais mise à jour : la copie est un INSERT … SELECT borné par l'espace source.

## Vague C→H — suivi explicite, profil d'espace, écarts mémorisés (18-19/10/2026)

Migrations additives (ajout seulement, contrainte posée AVANT le code qui écrit, GA-11/12) :

- `1796560286663-EsnWorkspaceProfile` (#4270.1) : `esn_profiles.workspace_profile` text NULL, CHECK `staffing` | `forfait_conseil`.
- `1796575094807-OnboardingV23Answers` (Théo O onboarding-couverture, 22/10/2026) : 26 colonnes de `esn_profiles`, les « Précisions de cadrage » de l'onboarding V23 — 11 listes `text[]` NOT NULL DEFAULT `'{}'` (`target_nature`, `target_size`, `language_capabilities`, `priority_expertise`, `skill_technos`, `activity_nature`, `data_sources`, `tools`, `delivery_frictions`, `recruiting_priorities`, `country_scope`) et 15 `text` NULL (`account_access`, `horizon`, `success_target`, `offer_pitch`, `workflow_pain`, `autonomy`, `context_policy`, `commercial_limits`, `currency`, `first_name`, `scope_level`, `scope_unit`, `bench_status`, `geography_detail`, `no_go`). Aucun CHECK (valeurs verbatim, catalogue au contrat) ; `NULL` / `'{}'` = pas de réponse, jamais « 0 ».
  NULL = comportement d'avant, à l'octet près (aucun espace existant ne change).
- `1796560290696-AccountFollows` (#4267, décision Louis 18/10) : table `account_follows` (`user_id` → `auth.users` ON DELETE CASCADE,
  `workspace_id`, `account_id` → `accounts` ON DELETE CASCADE, `archived_at`, `archived_reason` CHECK `unfollowed` | `migration_cap`,
  cohérence `archived_at`/`archived_reason`, UNIQUE `(user_id, account_id)`) ; RLS activée. Suivi EXPLICITE, 3 comptes vivants max
  par utilisateur ; la reprise garde les 3 plus récents et archive le reste (`migration_cap`), jamais de suppression.
- `1796560313541-AccountCompletionDismissals` (#4055.10) : table `account_completion_dismissals` (`workspace_id`, `user_id`,
  `account_id` → `accounts` ON DELETE CASCADE, `name_key`, `full_name`, `dismissed_at` ; PK `(workspace_id, user_id, account_id, name_key)`) — une proposition écartée de « complète ce compte » ne revient
  plus au rejeu.
- `1796610000417-EmployerIdentityChoices` (#4419.8) : table `employer_identity_choices` (`workspace_id` → `workspaces` ON DELETE CASCADE,
  `name_key`, `siren` CHECK 9 chiffres, `legal_name`, `chosen_by`, `chosen_at` ; PK `(workspace_id, name_key)`) ; RLS activée — l'entreprise
  qu'un commercial a CHOISIE parmi des homonymes sur Découvrir, gardée POUR L'ESPACE et lue avant tout calcul (la correction humaine gagne).
- `1796560418327-SecurityEventsDataExportStatus` (#4065.8, recette prod 18/10) : `security_events_status_code_check` admet un 2xx
  pour `kind = 'data_export'` seulement (le compteur des sorties de données écrivait 200 et était refusé : aucune sortie
  n'avait jamais été comptée).

## Vague 4 — corrélation des coûts, rejeu d'éval, besoins DataForge (19/10/2026)

Migrations additives (contrainte posée AVANT le code qui écrit, GA-11/12) :

- `1796560601187-ProviderCostCorrelation` (#3717.7 / #3777, DEC-4036) : `provider_costs.correlation_id` text NULL
  (CHECK longueur ≤ 128, index partiel `provider_costs_correlation_idx`). C'est le `x-correlation-id` déjà posé par
  `correlationIdMiddleware` / le job BullMQ : une ligne de coût se recolle à la requête qui l'a produite. NULL = ligne
  antérieure ou hors contexte, jamais un identifiant inventé.
- `1796560602298-ChatEvalSampleBodyException` (#2958.98, `c123_rejeu_eval_corps_compte_louis`) :
  `chat_eval_samples_text_length_check` élargi de 500 à 4 000 caractères pour le SEUL corps de message anonymisé du
  compte désigné par `EVAL_MESSAGE_BODY_USER_ID` ; le service garde 500 pour tout autre tour.
- `1796560603409-DataforgeNeeds` (#4281.1 / #4282.5, décision n°17) : table `dataforge_needs` — un besoin historique
  DataForge par ligne (`source_file` CHECK `24_MISSIONS_BESOINS` | `25_PIPELINE_CRM`, `need_id`, `account_source_id`
  sans FK vers `dataforge_accounts.source_id`, `status` CHECK `GAGNE` | `PERDU` | `ABANDONNE` | `TERMINE` | `EN_COURS` |
  `INCONNU` + `status_raw`, dates ISO, `tjm_eur` > 0, prescripteur, `technologies` text[] indexé GIN, `payload` jsonb
  pour TOUTES les autres colonnes brutes ; UNIQUE `(source_file, need_id)`). Table PARTAGÉE (base commune, fait de
  marché) ; RLS activée sans policy : seul le rôle service lit et écrit. Ingestion : `pnpm --filter api ingest:orion-needs`.

## Invitation acceptée à l'inscription — trigger `on_auth_user_invited_join` (prod 19/10/2026)

Migration `1796560559348-InvitedUserJoinOnConfirm`. Deux invités d'un client s'étaient inscrits sans passer par le lien :
leur invitation (`workspace_invitations`, `pending`) n'était jamais acceptée. La fonction `handle_invited_user_join()`
(SECURITY DEFINER) et son trigger `AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users` acceptent d'office les
invitations `pending` non expirées dont `lower(email)` est celui du nouvel utilisateur — **seulement si l'e-mail est confirmé**
(en UPDATE : transition NULL → non NULL). Effets = `acceptInvitation` : ligne `workspace_members` au rôle invité,
invitation `accepted` + `accepted_at`, `workspace_active_selections` pointée sur l'invitation la plus récente. « Mon espace »
(`handle_new_user_workspace`) reste créé ; pas de contrôle de sièges ; pas de rattrapage de l'existant. Un échec du
rattachement n'annule jamais l'inscription (`EXCEPTION WHEN OTHERS` → `RAISE WARNING`, le lien d'invitation reste le recours).

## Miroir CRM — `crm_deals`, `crm_activities`, `crm_owners`, `crm_pipelines`, `crm_stages` (SYNC-A, 19/10/2026)

Décision Louis 19/10/2026 : « toutes les infos, peu importe le CRM, on puisse les avoir dans Bellum ». Migration
`1796560465886-CrmMirror` (ajout seulement) ; contrat `@bellum/contracts` › `crm-mirror.ts` (`CRM_MIRROR_TABLES`) ;
entités `database/entities/crm-mirror.entity.ts` ; seul écrivain `CrmMirrorService` (`apps/api/src/modules/crm-mirror/`).

- **Colonnes communes** (les cinq tables) : `workspace_id` → `workspaces` ON DELETE CASCADE, `provider` (CHECK
  `<table>_provider_check` : les six CRM du contrat + `demo` pour la salle), `external_id`, `crm_updated_at`, `crm_url`,
  `crm_custom_fields jsonb NOT NULL DEFAULT '{}'`, `archived_at`, `synced_at`, `created_at`, `updated_at`.
  UNIQUE `<table>_external_unique (workspace_id, provider, external_id)` = la clé d'upsert.
- `crm_deals` : `title`, `pipeline_external_id`, `stage_external_id`, `stage_label`, `amount numeric`, `currency`,
  `status` (CHECK `crm_deals_status_check` : `open` | `won` | `lost`, NULL = le CRM ne le dit pas), `lost_reason`,
  `crm_created_at`, `expected_close_date`, `closed_at`, `owner_external_id`, `account_external_id`,
  `account_id` → `accounts` ON DELETE SET NULL, `contact_external_ids text[]`. Index `(workspace_id, account_id)`.
- `crm_activities` : `kind` (CHECK `crm_activities_kind_check` : `call` | `meeting` | `task` | `email` | `note`),
  `subject`, `occurred_at`, `done`, `owner_external_id`, `account_external_id`, `account_id` → `accounts` SET NULL,
  `contact_external_id`, `contact_id` → `contacts` SET NULL, `deal_external_id`. ⚠️ **Aucune colonne de corps**
  (doctrine c96) : type, sujet, date. Index `(workspace_id, account_id)` et `(workspace_id, contact_id)`.
- `crm_owners` : `name`, `email`. `crm_pipelines` : `label`. `crm_stages` : `pipeline_id` → `crm_pipelines` CASCADE,
  `label`, `position`, `status` (CHECK `crm_stages_status_check`).
- `accounts` et `contacts` : `crm_owner_external_id`, `crm_custom_fields jsonb NOT NULL DEFAULT '{}'`,
  `crm_updated_at`, `crm_url` ajoutées (`ADD COLUMN IF NOT EXISTS`) — aucune n'existait. Leur écrivain est la reprise
  des fiches (`CrmImportService`, lot SYNC-B) : ce lot ne les remplit pas.
- **RLS** : la forme des tables d'espace — `"<table>_member_read"` FOR SELECT `workspace_id IN (SELECT workspace_id FROM
workspace_members WHERE user_id = auth.uid())` ; l'écriture passe par l'API (rôle de service).
- **Règles** : une fiche disparue du CRM est ARCHIVÉE (`archived_at`, mode `full` sur lecture complète seulement),
  jamais supprimée ; une fiche modifiée dans Bellum depuis sa copie (`updated_at > synced_at`) n'est pas écrasée ;
  rattachement aux comptes/contacts par `sync_links` (jamais par le nom).
- **Démo** : semées (`DEMO_CRM_MIRROR`, `seedCrmMirror`) sur Société Générale, fournisseur `demo` ; purgées au reset
  (`DEMO_PURGE_TABLES`).

## Lots LUDOVIC-C / LUDOVIC-D — règles des contacts, incarnations (20/10/2026)

- **`accounts.contacts_rules_applied_at`** (`1796560598667-ContactsRulesAppliedAt`, LUDOVIC-C LC.1) : date de la dernière
  « remise des contacts aux règles actuelles » (rattrapage ciblé du segment contacts, homonymes archivés avec raison).
  Jamais `contacts_collected_at` : rien n'a été collecté.
- **`impersonation_audit`** (`1796560887818-ImpersonationTerminateAndRecette`, LUDOVIC-D LC.10) :
  - `impersonation_audit_reason_code_check` élargie à `recette` (ajout EN FIN, GA-08 ; contrainte avant le code, GA-11/12) ;
  - `reason_detail text NULL` — précision libre FACULTATIVE du motif, `CHECK (char_length ≤ 300)` ; lignes existantes `NULL` ;
  - `ended_by text NULL` — sur une ligne `stop` : l'admin qui a terminé depuis /impersonations ; `NULL` = l'opérateur lui-même.
  - Journal append-only : « Terminer » AJOUTE une ligne `stop` ; `ImpersonationStrategy` refuse tout jeton dont le `jti`
    porte un `stop`.
- **Rattrapage `opportunities.source` (#4336.1)** : migration `1796570048729` — aucune colonne neuve ; les lignes
  `kind = 'manual'` sans source passent à `manual` (jamais une source déjà écrite).

- **ENTREPRISE-TOUT #4381 (20/10/2026)** — migration `1796560888330-OpenAllFeaturesOnTeamPlan` : `plan_definitions.features`
  de la ligne `key = 'team'` (« Entreprise (sur devis) ») reçoit TOUTES les clés de `ALL_PLAN_FEATURES`. Données seulement :
  aucune colonne ni contrainte, quotas inchangés, `down()` refusé (forward-only).

## Lot R21-BB (21/10/2026) — Beeper Desktop de l'utilisateur (#4406)

- **`beeper_connections`** (`1796570059737-BeeperConnections`, ajout seulement) : UNE ligne par utilisateur (`beeper_connections_user_uidx`),
  `workspace_id` d'attribution. `base_url` (origine saisie : Remote Access + tunnel), `tunnel_declared` (http accepté, IP privées
  toujours refusées), `status` (`beeper_connections_status_check` : `pending` | `connected`, contrainte avant le code, GA-11/12),
  client OAuth obtenu par enregistrement dynamique (`client_id`, `client_secret_enc`), points rebasés sur l'origine
  (`authorization_endpoint`, `token_endpoint`, `revocation_endpoint`), jetons CHIFFRÉS (`access_token_enc`, `refresh_token_enc`,
  AES-256-GCM, crypto CRM), `expires_at`, `scope`. RLS : lecture `user_id = auth.uid()`. Déconnexion = révocation puis suppression.
- ⚠️ **Aucun corps de message** dans cette table ni ailleurs (c96, lecture en direct). L'envoi d'une réponse laisse une ligne
  `outbound_write_requests` de nature `send_chat_message` (TEXT sans CHECK) dont la charge utile ne porte que la conversation et la
  longueur — jamais le texte.

## Lemlist — `lemlist_connections`, `lemlist_lead_pushes` (#4427, 21/10/2026)

Migration `1796570106283-LemlistConnections`. RLS activée sans politique (clé de service seule).

- `lemlist_connections` : une ligne par espace (`UNIQUE (workspace_id)`), `credentials_enc` = la clé d'API chiffrée
  AES-256-GCM (jamais relue par une route), `created_by`, `last_used_at`, `created_at`.
- `lemlist_lead_pushes` : un contact poussé dans une campagne Lemlist existante —
  `UNIQUE (workspace_id, contact_id, campaign_id)`, `contact_id → contacts (id) ON DELETE CASCADE`, `campaign_id`,
  `campaign_name`, `lead_id` (l'identifiant rendu par Lemlist, sans lequel les statuts ne se relisent pas), `pushed_by`.
  Aucune contrainte d'énumération : aucune valeur fermée ne voyage vers ces tables. La demande d'écriture elle-même
  vit dans `outbound_write_requests` (`provider = 'lemlist'`, `kind = 'enroll_sequence'` — colonnes TEXT sans CHECK).

## `crm_connections` — colonnes par fournisseur (ajouts)

- `instance_url` (Salesforce, Pipedrive) : la base REST propre au compte, lue au retour OAuth.
- `accounts_server` (Zoho, #4187) : le serveur de comptes de la région réelle de l'organisation.
- `login_url` (Salesforce, #4431, migration `1796570052014`) : l'hôte de connexion PROPRE à l'organisation (`https://<société>.my.salesforce.com`, ou `https://test.salesforce.com` pour un sandbox), saisi sur la carte. NULLABLE : NULL = l'hôte global `SALESFORCE_LOGIN_URL`. Le consentement, le jeton, le rafraîchissement et la révocation partent dessus ; la valeur est re-validée (`*.salesforce.com` / `*.force.com`) à chaque usage.

## Théo B (22/10/2026) — validation de brouillon et état des fils de messagerie

Migrations `1796574800001-MessageDraftValidations` et `1796574800002-MailThreadStateSnoozePriorityContact`.

- `message_draft_validations` : la validation d'UNE version de `message_draft_versions` (`version_id` UNIQUE,
  `ON DELETE CASCADE`), `content_hash` (sha-256 hexadécimal du sujet + corps effectifs, `CHECK` sur la forme —
  jamais le corps lui-même), `validated_by`, `workspace_id`. Ligne d'audit, jamais corrigée : modifier un brouillon ajoute
  une version, donc une nouvelle relecture. Valider n'envoie rien.
- `message_draft_archivals` (migration `1796574800004-MessageDraftArchivals`, Théo B m2-brouillons.R6) : « Archiver le
  brouillon » — une ligne par version archivée (`version_id` UNIQUE, `ON DELETE CASCADE`), `archived_by`, `workspace_id`.
  Ligne d'audit sans contenu : on archive, on ne supprime pas ; une version neuve sur le même fil ramène le brouillon dans
  « Brouillons ». Archiver n'envoie rien.
- `mail_thread_marks` : `state` élargi à `treated | irrelevant | archived` (contrainte élargie avant le code,
  `mailThreadMarkSchema`) ; colonnes neuves `snooze_until` (reporté jusqu'à, aucun rappel externe), `priority_manual`
  (priorité posée à la main, défaut `false`), `contact_id` (contact rattaché à la main). Aucun contenu de message.

## Théo C — l'éditeur d'une règle d'automatisation (22/10/2026, migration `1796574823417`)

Additif : aucune ligne existante n'est réécrite (`version` = 1 pour toute règle déjà là).

- `automation_rules` gagne `name` (NULL = jamais nommée ; 1 à 120 caractères), `version` (≥ 1, la version qui TOURNE),
  `draft` (jsonb — la phrase en attente, `saveAutomationRuleDraftRequestSchema`), `draft_tested_at` (le dernier essai RÉUSSI du
  brouillon ; remis à NULL à chaque enregistrement du brouillon) et `archived_at` (on archive, on ne supprime pas : une règle
  archivée s'éteint et sort de la liste). Modifier une règle ne touche JAMAIS celle qui tourne : le brouillon s'active — et
  devient la version suivante — seulement APRÈS un essai réussi.
- `automation_rule_trials` : le JOURNAL DES ESSAIS. Un essai lit les vraies données de l'espace et n'écrit que sa propre ligne —
  ni tâche, ni message, ni inscription ; aucune ligne n'est une preuve d'envoi. `rule_id` n'est PAS une clé étrangère : le nom
  de la règle est copié (`rule_name`), l'essai survit à l'archivage. `signal` / `target` (`live` | `draft`) / `outcome`
  (`ok` | `failed`) portent un CHECK, posé AVANT le code qui les écrit (GA-11/12). `situations_read` et `would_act` sont NULL
  quand l'essai n'a rien pu lire (« non mesuré », jamais 0) ; `situation_labels` nomme les comptes lus.

## Théo M2 (22/10/2026) — envois programmés

Migration `1796574800003-ScheduledMessageSends`.

- `scheduled_message_sends` : un brouillon VALIDÉ que le commercial a daté. Pointe la version (`version_id`) et sa
  validation (`validation_id`), toutes deux `ON DELETE CASCADE`, et garde l'empreinte validée (`content_hash`, relue au
  départ) — jamais le corps. `scheduled_at` + `time_zone` (fuseau de l'utilisateur), `status` ∈ `scheduled | sent |
cancelled | failed | unknown` (`SCHEDULED_SEND_STATUSES`, contrainte posée avant le code), `attempted_at` (posé AVANT
  l'appel au transport : une tentative commencée ne se rejoue jamais, elle devient `unknown`), `sent_at`, `failure_code`.
  Index unique partiel sur `version_id WHERE status = 'scheduled'` : un seul envoi vivant par brouillon. La preuve
  « Envoyé le … » n'est pas stockée ici : elle se lit sur `contacts.email_sent_observed_at` (message retrouvé dans la boîte).

## Théo D team-review (22/10/2026) — le point d'équipe

Migration `1796574800006-TeamReviews`.

- `team_reviews` : le compte rendu d'un « point d'équipe » (`POST /manager/team-review`). `workspace_id`, `held_by`
  (qui l'a tenu), `note` (texte libre, NULL si rien d'écrit), `no_new_action` (point tenu sans créer de ligne de plan),
  `decisions` jsonb `[{ topic_id, item_id, outcome }]` (jamais NULL : `[]` = aucune décision) où `outcome` ∈ `created |
updated`. Les actions elles-mêmes vivent dans `action_plan_items` (création par `createFromPlan`, qui reconnaît le
  doublon : « mises à jour, jamais dupliquées »). RLS : lecture par les membres de l'espace ; écriture par l'API. Aucun
  corps de message, aucun envoi.

## Théo D (22/10/2026) — Équipe › Recherches

Migration `1796575071694-TeamResearchEntries`.

- `team_research_entries` : une recherche Découvrir LANCÉE, gardée pour toute l'équipe (l'historique de Découvrir vivait
  dans le navigateur de chacun). Par personne et par périmètre : `filters` (jsonb) et `filters_key` (empreinte stable,
  index unique `(workspace_id, user_id, filters_key)` — une relance remonte la ligne), `title`, `scope_label`,
  `result_count` (NULL = non mesuré, jamais 0), `account_ids` (les comptes du résultat déjà dans l'espace, pour compter
  les actions ouvertes). Jamais les comptes eux-mêmes. RLS : tout membre lit l'historique de son espace (Q3 du 22/10) ;
  l'écriture passe par l'API. Les analyses de compte de la même page se lisent sur `analysis_runs` (rien de dupliqué).

## Théo C talents-recrutement (22/10/2026) — étapes de recrutement d'une personne

Migration `1796575013276-TalentRecruitmentEvents`.

- `talent_recruitment_events` : journal APPEND-ONLY des changements d'étape de recrutement d'une personne. `talent_id`
  pointe `consultants (id) ON DELETE CASCADE` (l'effacement RGPD à sa demande, c67, emporte son journal ; « Écartée » ne
  supprime rien). `stage` ∈ `to_qualify | call_planned | qualified | on_hold | discarded` (`RECRUITMENT_STAGES`,
  contrainte posée avant le code), `reason` (≤ 500 caractères, consigné et jamais lu pour classer), `planned_at`
  (rendez-vous annoncé, à `call_planned` seulement), `changed_by`. L'étape courante est la ligne la plus récente ; sans
  ligne, la personne est « À qualifier ». Aucune clé vers `submissions` ni `mission_assignments` : l'étape de recrutement
  n'altère ni les présentations ni les affectations (invariant gardé par `talent-recruitment-independence.spec.ts`).

## BoondManager en OAuth2 — `ats_connections` (#4688, 28/10/2026)

Migration `1796584177275-AtsOauth2`. La table existait depuis `1788800000003-AtsConnections` : **une ligne par espace**
(`UNIQUE (workspace_id, provider)` — un ATS est l'outil de l'ENTREPRISE, pas d'un utilisateur), RLS activée sans
politique (clé de service seule), `credentials_enc` chiffrée AES-256-GCM, `base_url` surchargeable par instance dédiée.
Cette migration la rend compatible OAuth2, **en ajout seulement**, parce que la Marketplace de l'éditeur interdit les
jetons permanents.

- `auth_mode` : la contrainte `ats_connections_auth_mode_check` est **élargie** à `user_token | client_jwt | oauth2`
  (posée AVANT le code qui écrit `'oauth2'`, GA-11/GA-12). Les deux premiers modes restent valides pour les connexions
  déjà en base — zéro régression — mais aucun chemin n'en crée plus de neuve.
- `credentials_enc` devient **NULLABLE** : une connexion OAuth2 n'a pas de secret collé par l'utilisateur.
- `access_token_enc`, `refresh_token_enc` : les jetons, chiffrés AES-256-GCM avec la même clé que les CRM
  (`CRM_TOKEN_ENC_KEY`, sinon `INTERNAL_API_SECRET`). Jamais relus par une route, jamais journalisés, jamais rendus
  dans une réponse — y compris tronqués.
- `expires_at` : l'expiration de l'access token, calculée depuis le `expires_in` **rendu par le serveur**. L'éditeur ne
  publie aucune durée de vie : aucune constante ne la devine. Le refresh token reçu est réécrit à chaque échange, car
  rien ne dit publiquement s'il est tournant.
- `refresh_failed_at` : posé quand l'éditeur refuse un rafraîchissement. La connexion passe « à reconnecter », l'écran
  le dit, et le refresh **ne se rejoue pas en boucle**.
- `scopes` : les scopes réellement ACCORDÉS, tels que rendus — relus, jamais supposés. Une capacité dont le scope manque
  se refuse en le nommant (#4691).
- `oauth_state_hash`, `oauth_verifier_enc`, `oauth_started_at` : l'aller-retour PKCE, le seul motif de la Marketplace
  (`code_challenge_methods_supported` = **`S256` seul**). Le `state` est signé avec `INTERNAL_API_SECRET` et vérifié au
  retour (anti-CSRF) ; le `code_verifier` reste côté serveur, chiffré, le temps de l'échange ; `oauth_started_at` borne
  cet aller-retour. Un `state` invalide ou un `code_verifier` absent est un refus **sans aucune écriture**.

La déconnexion appelle `POST <base>/oauth2/revoke` **puis** purge les colonnes chiffrées : une connexion supprimée chez
nous ne laisse pas un jeton vivant chez l'éditeur.

## `user_angles` — les angles d'approche écrits par le commercial (#4739, 28/10/2026)

Huitième table, née du retour client Bedros × Adel : un commercial écrit ses propres angles sur
« Contacter », les retrouve à chaque fois qu'il veut contacter quelqu'un, et les gère.
Migration `apps/api/src/migrations/1796584260871-UserAngles.ts`.

| Colonne        | Type                          | Raison                                                                                                               |
| -------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `id`           | `uuid` PK `gen_random_uuid()` | —                                                                                                                    |
| `user_id`      | `uuid NOT NULL`               | l'angle est **personnel à son auteur** : c'est lui qui le revoit à chaque contact                                    |
| `workspace_id` | `uuid` (nullable)             | l'espace d'origine, pour un futur partage — **le partage n'est pas livré**                                           |
| `title`        | `text NOT NULL`               | ce que le commercial lit dans sa liste                                                                               |
| `content`      | `text NOT NULL`               | l'angle lui-même                                                                                                     |
| `source`       | `text` défaut `'human'`       | contrainte NOMMÉE `user_angles_source_check` : `source IN ('human')` — aucun angle de cette table ne vient du modèle |
| `archived_at`  | `timestamptz` (nullable)      | on archive, on ne supprime pas — un angle retiré redevient inconnu                                                   |
| `created_at`   | `timestamptz NOT NULL`        | —                                                                                                                    |
| `updated_at`   | `timestamptz NOT NULL`        | —                                                                                                                    |

- Index `user_angles_user_active_idx` sur `(user_id, updated_at DESC) WHERE archived_at IS NULL` :
  la liste d'un commercial se lit sans parcourir les archives.
- La contrainte de `source` porte un NOM (`user_angles_source_check`) et vit **hors** de la
  définition de colonne (#4781) : un `CHECK` écrit en ligne dans le `CREATE TABLE` fait remonter le
  cliquet GA-177, qui ne peut que baisser. Nommée, elle est aussi déclarée au MAPPING de GA-12
  (#4782) — à `null`, parce que les valeurs viennent d'une union littérale et non d'un enum TS.
  Le nom et l'horodatage de la migration n'ont PAS changé : elle est déjà appliquée.
- **RLS activée**, politique `Users manage their own angles` : `auth.uid() = user_id`, comme les
  sept autres tables. Une correction humaine gagne toujours — rien ne réécrit un angle écrit à la main.

## `linkedin_send_log` et le mandat LinkedIn FUSIONNÉ dans `outreach_delegations` (#4737, 29/10/2026, migrations `1796590123457` puis `1796591406829`)

Renversement assumé et daté (Louis, 28-29/10/2026) : l'envoi LinkedIn — **LinkedIn seulement, l'e-mail ne bouge pas** — peut être
délégué sous un mandat explicite, daté, borné et révocable, **par un fournisseur établi** (Unipile) : nous ne touchons jamais au cookie du
client. Sans clé fournisseur l'adaptateur est inerte (zéro appel réseau). Un mandat n'est ni un rôle ni une permission.

**Fusion (K2)** : le premier lot avait créé `linkedin_mandates`, un second mandat à côté de `outreach_delegations` (#3702.9). UNE notion de
délégation (GA-26) : la migration `1796591406829` REPREND chaque ligne de `linkedin_mandates` dans `outreach_delegations` avec **le même
`id`** (donc `linkedin_send_log.mandate_id` pointe toujours juste), portée `linkedin_send`. `linkedin_mandates` est **ARCHIVÉE** (plus lue ni écrite,
rien supprimé). Ajouts à `outreach_delegations` :

| Colonne / contrainte                     | Raison                                                                                                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scope` = `linkedin_send`                | sixième valeur de `outreach_delegations_scope_check` ET de `outreach_messages_mandate_scope_check` (élargies AVANT le code qui l'écrit, GA-11/GA-12)                 |
| `daily_limit integer NULL`               | borne **par jour** d'un mandat LinkedIn ; `NULL` pour toute autre portée                                                                                             |
| `outreach_delegations_daily_limit_check` | `CHECK (daily_limit IS NULL OR daily_limit BETWEEN 1 AND 25)` — 25, pas les 50 du premier lot : c'est le compte LinkedIn du client qui est en jeu                    |
| ligne `linkedin_send`                    | `channels = []` (LinkedIn n'est pas un canal e-mail délégable), `sender_mailbox_id = 'linkedin'`, `starts_at/expires_at` = la période, `validated_at` = la signature |

La liste des délégations e-mail (`OutreachDelegationService.list`) ne montre pas la ligne LinkedIn : même notion, deux portes
(`outreach` pour l'e-mail, `linkedin/mandate` pour LinkedIn). Une borne reprise au-dessus de 25 est ramenée à 25. Le total de période
`max_messages` = borne du jour × nombre de jours ; `sent_count` suit le journal.

`linkedin_mandates` (ARCHIVÉE, définition d'origine) : `id`, `workspace_id`, `user_id`, `granted_at`, `valid_from`, `valid_until`,
`daily_limit` (`BETWEEN 1 AND 50`), `revoked_at`, `created_at`.

`linkedin_send_log` :

| Colonne        | Type                          | Raison                                                                                                       |
| -------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `id`           | `uuid` PK `gen_random_uuid()` | —                                                                                                            |
| `workspace_id` | `uuid NOT NULL`               | l'espace                                                                                                     |
| `user_id`      | `uuid NOT NULL`               | l'auteur du geste — la borne du jour se compte par `user_id`, tous mandats confondus                         |
| `mandate_id`   | `uuid` (nullable)             | la délégation `linkedin_send` qui couvrait le geste (NULL : refusé faute de mandat)                          |
| `contact_id`   | `uuid NOT NULL`               | le destinataire                                                                                              |
| `status`       | `text NOT NULL`               | `CHECK (status IN ('refused','not_open','sent','failed','unknown'))` ; `unknown` (timeout) arrête la reprise |
| `reason`       | `text`                        | le refus nommé (`no_mandate`, `revoked`, `expired`, `daily_limit_reached`, `recipient_replied`, …)           |
| `body`         | `text`                        | le CORPS du message : stocké ici, **jamais** exposé (réponse d'API, log, modèle)                             |
| `proof_ref`    | `text`                        | la preuve du fournisseur (identifiant de message) — `CHECK (proof_ref IS NULL OR status = 'sent')`           |
| `created_at`   | `timestamptz NOT NULL`        | —                                                                                                            |

- Index sur `workspace_id`, `mandate_id`, `contact_id`. **RLS activée**, politique `auth.uid() = user_id`.
- Le « fait » déclaratif (`linkedin_interactions.message_sent`) et l'envoi vérifié (`proof_ref`) sont deux notions, deux champs.
- Aucune table neuve à ce lot : `table-scopes.ts` déduit `scoped` des colonnes `workspace_id` / `user_id` (rien à y déclarer).

### `access_facts.kind` accepte `access_status` — l'état d'accès posé à la main (#4802, migration `1796584275703`)

`access_facts_kind_check` s'élargit à `access_status` (GA-11/12 : le `CHECK` bouge AVANT le code qui écrit la
valeur) ; les quatre natures d'avant — `lock`, `mode`, `cost`, `path` — sont inchangées. `value` porte alors l'une
des trois valeurs de `accessStatusValueSchema` : `inconnu`, `referenced`, `to_build`. `inconnu` est un état POSÉ
(« je ne sais pas »), pas une absence : l'ordre des interlocuteurs reste celui d'avant. Seuls les faits de
`provenance = 'human'` sont lus, et la péremption ne s'y applique pas — une correction humaine gagne toujours,
quelle que soit sa date. `down()` supprime les lignes `kind = 'access_status'` avant de resserrer la contrainte.

### `esn_profiles.tooling_internal_names` — les noms internes des outils (migration `20261031180100`)

Colonne `text[]` nullable, ajout seul (`ADD COLUMN IF NOT EXISTS`) : les noms par lesquels l'ESN appelle ses outils en interne.
NULL = non renseigné, jamais une liste vide devinée. Aucune table neuve.

### `consultants.stack_edited_by_human_at` — la correction humaine de la stack gagne (#5016.3, migration `20261031180000`)

Colonne `timestamptz` nullable, ajout seul. Posée par `ConsultantsService.update` quand le corps porte `stack`. Au-delà de cette date,
`syncStackFromSkills` n'ajoute à `consultants.stack` que les compétences de `consultant_skills` créées APRÈS elle, et
`runStackSyncCatchUp` saute la fiche. Aucune ligne n'est supprimée. NULL = jamais corrigée à la main.

### `crm_deal_facts.company_name` et `account_link_basis = 'name'` — le rattachement d'un deal sans clé (lot 762, migration `1796597841263`)

`crm_deal_facts.company_name` (texte, NULLABLE) porte la raison sociale de la société associée chez le fournisseur, quand il la rend.
`crm_deal_facts_account_link_basis_check` s'élargit à `'name'` (GA-11/12 : le `CHECK` bouge AVANT le code qui écrit la valeur) ; les trois clés
d'avant — `crm_company_id`, `siren`, `domain` — sont inchangées et l'emportent toujours. `'name'` n'est posé que si le nom normalisé désigne UN
seul compte de l'espace (ambigu ⇒ non rattaché, jamais fusionné). `down()` délie les deals rattachés par nom avant de resserrer la contrainte.

### `outreach_sequences.consultant_id` — le profil qu'une séquence propose (#5029.1, migration `1796597893675-OutreachSequenceConsultant`)

Colonne `uuid` nullable, ajout seul, FK `consultants(id)` en `ON DELETE SET NULL` (on archive, on ne supprime pas ; l'effacement RGPD d'une fiche garde la séquence et son journal sans le lien). NULL = séquence ordinaire, jamais un rattachement deviné.
Index partiel `idx_outreach_sequences_consultant (workspace_id, consultant_id) WHERE consultant_id IS NOT NULL`. Une séquence qui la porte reste toujours manuelle (#5029.2). Aucune politique RLS neuve.

### `profiles.profile_context_failure_reason` — pourquoi la génération du profil a échoué (#4969, migration `1796610035082`)

Colonne `text` nullable, ajout seul (`ADD COLUMN IF NOT EXISTS`). Posée avec le statut `failed` par la génération du contexte
commercial : un CODE court (`model_error`, `model_unreachable`, `persist_failed`, catalogue `profileContextFailureReasonSchema`),
jamais le message d'erreur ni un corps. Exposée en `failureReason` par `GET /profile-context`. NULL hors de `failed` ; sous
`failed`, NULL = échec antérieur à la colonne, raison inconnue — jamais une raison devinée.

### `routine_runs.attempt`, `attempted_at`, `duration_ms` — reprise et durée d'une routine (#2843 lot L13, migration `1796610003100`)

`attempt` (int, défaut 1, `CHECK 1..3`) numérote la tentative d'une occurrence : une reprise (15 puis 30 min) réécrit
la MÊME ligne, l'unicité de `run_key` reste la garde du double envoi ; au troisième échec l'abonnement passe en
`status = 'error'`. `attempted_at` (timestamptz, NULLABLE) est la base du délai de reprise (repli sur `created_at`).
`duration_ms` (int, NULLABLE, `>= 0`) est lu en back-office seul (`internal/admin/routines/runs`), jamais renvoyé au
client ; NULL = non mesurée, jamais 0. Migration additive, aucune ligne réécrite.

## L15 Missions — satisfaction déclarée et exceptions (#2408.3/.16/.17/.20/.21, migration `1796610003098`)

- `mission_feedback.level` (text, NULLABLE, CHECK `low`/`medium`/`high`) : le niveau DÉCLARÉ d'une entrée du double
  pouls (#2412). NULL = note sans niveau, lue « non mesuré » — jamais un niveau par défaut, jamais une moyenne.
- `mission_risk_resolutions_risk_check` élargie EN FIN aux cinq exceptions de `missionRiskSchema` : `low_satisfaction`,
  `relationship_threatened`, `prolonged_absence`, `consultant_unsecured`, `action_without_owner`. Aucune table neuve :
  les signaux sont LUS par lot (`mission-exception-signals.ts` — `mission_feedback`, `activities`,
  `consultant_absences`, `mission_assignments`, `tasks`, `legal_entities`).

## `market_v2_*` — le pack marché v2.1 en base commune (lot 783, #5205, Louis 03/11/2026)

Migration `1796900104000-MarketV2Rows` — trois tables neuves, ajout seul, **partagées** (`table-scopes.ts` :
`market_v2_rows` `market`, `market_v2_row_identities` et `market_v2_datasets` `operator`), RLS activée sans politique.
Écrites par l'importeur opérateur seul (`ingest:market-v2`, `apps/api/src/scripts/market-v2/`).

- `market_v2_datasets` — PK `(dataset_version, source_table)` ; une ligne = une table du pack CHARGÉE à cette version
  (`dataset_version` = sha256 de `MANIFEST.csv`, CHECK 64 hex) ; `folder` (CHECK sur les 5 dossiers du pack),
  `file_sha256`, `expected_rows` / `rows_read` / `rows_written` / `rows_rejected`, `pii_columns text[]`, `loaded_at`.
- `market_v2_rows` — PK `(dataset_version, source_table, row_no)`, FK vers `market_v2_datasets` ; `account_id`
  (BM-A-nnnnnn, quand la colonne n'est pas pii ; index partiel `(account_id, source_table)`), `data jsonb` = les
  cellules NON pii, une cellule vide est ABSENTE (jamais `''`). Pas de GIN : chaque lecteur posera l'index de sa requête.
- `market_v2_row_identities` — le COFFRE : mêmes clés, FK `ON DELETE CASCADE` vers la ligne (effacement RGPD), `data
jsonb` = les cellules `pii=1` du dictionnaire + `PII_FLAG_CORRECTIONS`. Aucun lecteur hors l'importeur (garde
  `market-v2-pii-never-read.spec.ts`) : rien d'identifiant à l'écran ni vers le modèle (décision 02/11).
- Une nouvelle version du pack AJOUTE ses lignes (on archive, on ne supprime pas) ; un lecteur lit la dernière version
  chargée de sa table.

## `common_account_links` — le référentiel pivot des identifiants d'entreprise (lot 793, Louis 04/11/2026)

Migration `1796900170000-CommonAccountLinks` — table neuve, ajout seul, **partagée** (`shared`/`market`,
`table-scopes.ts`), RLS activée sans politique. Écrite par le script opérateur seul (`ingest:common-account-links`,
`apps/api/src/scripts/common-account-links/`), depuis `market_v2_rows` (`accounts`, `account_aliases`) et
`dataforge_accounts`.

- PK `(key_kind, key_value, common_id)` : une clé de résolution NORMALISÉE (`siren` 9 chiffres, `domain` racine du site
  via `marketRootDomain`, `name` via `marketMatchKey` — noms, raison sociale, variantes fusionnées, alias) → une
  entreprise commune. `common_id` = `COALESCE(bm_account_id, dataforge_source_id)` (CHECK) ; `group_account_id` = la
  racine du groupe (BM-A) ; `company_name` ; `origins text[]` (CHECK sur les trois sources) ; `built_at`.
- Une même clé sur plusieurs entreprises = plusieurs lignes : l'AMBIGUÏTÉ, que le résolveur compte et ne tranche pas
  (sauf entreprises d'un même groupe). Un rejeu est idempotent ; une ligne absente du dernier calcul sort.
- Le compte d'un espace n'y est JAMAIS stocké : `resolveCommonAccounts` (`apps/api/src/common/common-account-links.ts`)
  le résout à la lecture, filtré par l'espace — SIREN, puis domaine, puis nom/alias unique, groupe et filiales compris.

## `market_person_paths` — parcours individuels de la mémoire marché, SANS identité (lot 775, Louis 02/11/2026)

Migration `1796640000000-MarketPersonPaths` — table neuve, ajout seul, **partagée** (`shared`/`market`, `table-scopes.ts`),
RLS activée sans politique (seul `MarketMemoryService` la lit, GA-258).

- Clé d'idempotence : `row_key` (sha256 de `person_key` × `company_key` × poste × début × fin), index unique — rejouer
  un pack donne les mêmes lignes ; `person_key` = HMAC-SHA256 salé (`MARKET_MEMORY_PERSON_HASH_KEY`), jamais lu par un écran.
- Colonnes : `company_key` (clé du corpus, après résolution alias/override), `company_name`, `match_key`, `siren`,
  `job_title`, `role_family`, `skills text[]`, `start_date`/`ended_on` (texte `YYYY-MM-DD`) + `date_precision`
  (`day|month|year`), `work_status` (`freelance|esn|salarie|inconnu`), `esn_name`/`esn_key`, `daily_rate_eur`
  (NULL = inconnu, jamais 0 ; CHECK > 0), `mission_city`/`mission_region` (le lieu de la MISSION, jamais l'adresse de la
  personne), provenance du pack (`corpus_label`, `dataset_version`, `source_checksum`, `methodology_version`,
  `source_family`, `source_artifact_uri`, `period_start`/`period_end`, `imported_at`).
- **Aucune colonne d'identifiant direct** (nom, prénom, genre, téléphone, e-mail, URL de profil, photo, adresse,
  naissance/âge) : liste fermée `market-memory-identifiers.ts`, garde GA-352 réécrite. Voir `doctrine.md` (c148).
- Lot 791 — migration `1796900161651-MarketPersonPathsIsCurrent` : `is_current boolean` NULLABLE (ajout seul, aucun
  CHECK à élargir). `true`/`false` = `positions.is_current_2024` Oui/Non du pack v2.1, `NULL` = non dit ; porte le
  caractère actuel/passé SANS date fabriquée. Les parcours v2.1 sont dérivés de `positions` par
  `ingest:market-paths-v2` (`corpus_label = 'market_v2'`, `row_key` = (person_key, account_id ou nom brut normalisé,
  poste, source), `work_status` `esn` ou `inconnu`, dates NULL).
