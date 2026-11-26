import type { ConnectedTool, ToolFamily, ToolOwnerScope } from '@bellum/contracts'
import type { IntegrationProvider } from '../../database/entities/integration.entity'

/**
 * The declarative catalogue behind the unified Tool Registry.
 *
 * Every third-party tool BellumAI can be wired to is modeled here — INCLUDING
 * the ones that are not connectable yet — so the copilot and the analysis engine
 * can reason about a tool (its data types, actions, cost, memory policy) without
 * having to *guess* whether it exists. The live connection status is resolved at
 * read time by {@link ToolRegistryService} from the real storage silos; this
 * file only carries the *static* capability metadata + a `source` telling the
 * service which silo (if any) backs the tool.
 *
 * Roadmap §8-9 "Connected Account Memory" (v2): every entry is a COMPLETE
 * record — `data_types` (what the tool reads vs what Bellum writes), a
 * `cost_model` (what an action costs the user, e.g. « 1 crédit / enrichissement
 * Dropcontact », « webhook gratuit »), the known `rate_limits` envelope, and a
 * `memory_policy` (what Bellum retains from the tool). All human text is
 * localized FR+EN (standing i18n rule); the chat context reads the FR side.
 *
 * Rules: capability metadata is declarative and honest — it describes what the
 * integration *can* do. It never asserts a connection. Modeled-only tools
 * (`source.kind === 'catalog'`) are always reported `coming_soon`.
 */

/** CRM providers whose OAuth link lives in the shared `crm_connections` table. */
export type CrmProviderKey = 'hubspot' | 'salesforce' | 'pipedrive' | 'attio' | 'odoo' | 'zoho'

/** OAuth providers with their own dedicated connection table (autonomous modules,
 *  CLAUDE rule #7): Google Workspace, Notion, Microsoft 365. Resolved like the CRM
 *  ones — env-gated config + a per-workspace connection row. */
export type OAuthProviderKey = 'google' | 'notion' | 'microsoft'

/**
 * Les silos où l'espace de travail dépose LUI-MÊME ses identifiants — ATS/ERP,
 * outil d'appel, signature et facturation.
 *
 * Ils n'ont aucune porte d'environnement : rien à déclarer côté serveur, le
 * client colle son jeton. Ils étaient donc absents du catalogue, et l'inventaire
 * opérateur affichait « 26 outils » en en ignorant sept — dont l'ERP, qui est
 * l'outil le plus structurant d'une ESN.
 */
export type SecretSiloKey = 'ats' | 'telephony' | 'admin_docs' | 'lemlist'

/** How the live status of a catalogue entry is resolved. */
export type ToolSource =
  /** Self-serve chat/webhook in the `integrations` table (scoped by user). */
  | { kind: 'webhook'; providerKey: IntegrationProvider }
  /** OAuth CRM link in `crm_connections` (scoped by workspace), env-gated. */
  | { kind: 'crm'; providerKey: CrmProviderKey }
  /** OAuth link in a dedicated per-workspace table (Google / Notion / Microsoft),
   *  env-gated on the module's own config. */
  | { kind: 'oauth'; providerKey: OAuthProviderKey }
  /** MCP assistant grant in `oauth_consents` (scoped by user), env-gated. */
  | { kind: 'mcp' }
  /** Identifiants déposés par l'espace lui-même (ATS, téléphonie, administratif).
   *  Toujours `configured` — il n'y a rien à activer côté serveur —, `connected`
   *  dès qu'une ligne existe pour ce fournisseur dans le silo. */
  | { kind: 'workspace-secret'; silo: SecretSiloKey; providerKey: string }
  /** Server-side capability, env-gated on a key on THIS (API) service (no per-user
   *  connection): the key present ⇒ live for the whole workspace, absent ⇒
   *  `coming_soon`. */
  | { kind: 'server'; envKey: string }
  /** Server-side data source whose key lives on the IA service (the API cannot see
   *  it via its own `process.env`): resolved from the IA `/config/integrations`
   *  status endpoint by `providerId`. Configured ⇒ live, absent/unknown ⇒
   *  `coming_soon`. */
  | { kind: 'ia-server'; providerId: string }
  /** Modeled but not connectable yet — always `coming_soon`. */
  | { kind: 'catalog' }

/** A catalogue entry = the static half of a {@link ConnectedTool}, plus its source. */
export type ToolCatalogEntry = Pick<
  ConnectedTool,
  'provider' | 'family' | 'display_name' | 'owner' | 'data_types' | 'allowed_actions'
> & {
  /**
   * #3973 (décision Louis 11/10/2026) — les familles que l'outil sert EN PLUS
   * de `family` (Microsoft 365 : l'agenda). `family` reste son rangement à
   * l'écran ; ces familles comptent pour « branché » et pour l'exclusion
   * « Outils et sources » (`toolFamiliesOf`, @bellum/contracts). Absent =
   * mono-famille.
   */
  additional_families?: NonNullable<ConnectedTool['additional_families']>
  rate_limits?: ConnectedTool['rate_limits']
  cost_model: NonNullable<ConnectedTool['cost_model']>
  memory_policy: NonNullable<ConnectedTool['memory_policy']>
  /**
   * #2261.8 — ce que l'outil DÉCLARE couvrir. Absent ici = `null` (« inconnu »)
   * une fois résolu par {@link ToolRegistryService} — jamais deviné pour
   * combler une entrée qui ne le déclare pas.
   *
   * DÉCISION LOUIS 18/09/2026 : pour les outils BRANCHABLES que l'espace voit
   * sur `/integrations` (HubSpot, Salesforce, Google Workspace, Microsoft 365,
   * Notion), ce champ n'est plus laissé absent — un `null` identique sur cinq
   * outils s'est lu en recette comme un champ oublié, pas comme une réponse.
   * Chacun DÉCLARE désormais, en dur, son propre texte (voir
   * `COVERAGE_PERIOD_UNKNOWN` plus bas) : « non mesuré » est une valeur écrite,
   * jamais une case vide.
   */
  coverage_period?: NonNullable<ConnectedTool['coverage_period']>
  /**
   * #2261.13 — la latence DÉCLARÉE par le fournisseur (texte de doc), servie
   * en DERNIER RECOURS par `ToolRegistryService.resolveLatency` quand aucune
   * mesure réelle (`tool-latency.ts::measureToolLatency`, synchronisations de
   * l'espace) n'est disponible — une mesure réelle passe toujours devant.
   *
   * DÉCISION LOUIS 21/09/2026 (QCM) : remplir depuis la DOCUMENTATION
   * PUBLIQUE de chaque outil, ce que la doc ne dit pas reste `null`, même
   * méthode que le connecteur Odoo (#2565.10, D4). Voir
   * `HUBSPOT_LATENCY_DECLARED` plus bas pour la seule entrée renseignée à ce
   * jour, et le bloc de commentaire au-dessus de `COVERAGE_PERIOD_UNKNOWN`
   * pour les quatre autres outils vérifiés MUETS sur ce champ.
   */
  latency?: NonNullable<ConnectedTool['latency']>
  /**
   * #2207.23 (épopée #3014) — la durée ESTIMÉE d'une PREMIÈRE synchronisation,
   * DÉCLARÉE par Bellum. Absent ⇒ non déclarée pour ce connecteur, jamais
   * devinée (voir `SYNC_DURATION_FEW_MINUTES` plus bas pour la seule entrée
   * renseignée à ce jour).
   */
  sync_duration_estimate?: NonNullable<ConnectedTool['sync_duration_estimate']>
  /**
   * #2261.16 — le statut bêta déclaré par le fournisseur. Absent = `null`
   * (statut inconnu). DÉCISION LOUIS 18/09/2026 : même traitement que
   * `coverage_period` ci-dessus, pour les mêmes outils branchables — voir
   * `BETA_NOT_DECLARED` plus bas.
   */
  beta?: NonNullable<ConnectedTool['beta']>
  source: ToolSource
  /**
   * Le nom affiché DÉCRIT la capacité au lieu de nommer une marque
   * (« Webhook sortant », « Transcription audio »).
   *
   * La garde anti-fuite du copilote compare le digest au premier mot de chaque
   * `display_name` ; sur ces entrées, ce mot est un mot français ordinaire qui
   * peut légitimement apparaître dans une phrase de capacité. Le drapeau vit
   * ICI et non dans une liste d'exceptions du test : une entrée ajoutée demain
   * doit déclarer ce qu'elle est, pas obliger quelqu'un à retrouver pourquoi
   * un test échoue sur le mot « recherche ».
   */
  genericName?: boolean
}

const WORKSPACE: ToolOwnerScope = 'workspace'
const USER: ToolOwnerScope = 'user'

/** Convenience so the family literals stay type-checked against the contract. */
const family = (f: ToolFamily): ToolFamily => f

/** Shared meta for tools that cost nothing per call (subscription-included). */
const INCLUDED = { fr: 'inclus (aucun coût par appel)', en: 'included (no per-call cost)' }
/** Shared meta for the self-serve chat webhooks (identical envelope). */
const WEBHOOK_MEMORY = {
  fr: 'URL de webhook chiffrée AES-256-GCM ; contenu des messages non conservé',
  en: 'webhook URL encrypted with AES-256-GCM; message contents are not retained',
}
const CRM_MEMORY = {
  fr: 'tokens OAuth chiffrés AES-256-GCM ; contacts lus non persistés côté Bellum',
  en: 'OAuth tokens encrypted with AES-256-GCM; contacts read are not persisted by Bellum',
}
/** Tous les enrichisseurs de la cascade débitent pareil, et ne débitent que sur
 *  un résultat : 0 coordonnée trouvée = 0 crédit. */
const ENRICHMENT_COST = {
  fr: '1 crédit par enrichissement réussi (pas de match = aucun débit)',
  en: '1 credit per successful enrichment (no match = nothing charged)',
}
const ENRICHMENT_MEMORY = {
  fr: 'coordonnées trouvées persistées sur la fiche contact ; rien d’autre',
  en: 'contact details found are persisted on the contact card; nothing else',
}
/** Ce qu'une source publique laisse derrière elle : rien de durable. */
const SOURCE_MEMORY = {
  fr: 'résultats injectés dans l’analyse du compte, pas de copie durable',
  en: 'results injected into the account analysis, no durable copy',
}
/** Signature et facturation : Bellum ne signe rien, ne paie rien, ne fabrique
 *  aucun document et ne stocke aucun IBAN. */
const ADMIN_DOCS_MEMORY = {
  fr: 'identifiants chiffrés AES-256-GCM ; aucun document ni IBAN conservé',
  en: 'credentials encrypted with AES-256-GCM; no document and no IBAN retained',
}

/**
 * #2261.8 — DÉCISION LOUIS 18/09/2026 : « déclarés à la main, par connecteur ».
 *
 * Réfuté en production le 18/09 (recette `/integrations`, espace de Louis) :
 * HubSpot, Salesforce, Google Workspace, Microsoft 365 et Notion rendaient
 * TOUS « Période couverte : non précisée » — un seul texte générique, posé par
 * le repli `?? null` du service, identique sur cinq outils. Un connecteur qui
 * ne sait pas dire sa période affiche désormais « non mesuré » EN DUR, dans
 * SON propre manifeste (GA-26 : la déclaration vit à un seul endroit, ici,
 * jamais aussi dans le service) — jamais une date devinée, jamais un champ
 * qu'on laisse simplement absent.
 *
 * Portée de cette décision (mesurée, pas devinée) : les CRM/OAuth qui exposent
 * un état COURANT plutôt qu'une fenêtre de lecture bornée dans le temps —
 * aucun des clients (`hubspot.client.ts`, `salesforce.client.ts`,
 * `google-mail.backend.ts`, `microsoft.client.ts`, `notion.client.ts`) ne
 * documente de fenêtre de rétention ni de purge par ancienneté. À distinguer
 * de BOAMP/France Travail plus bas : ce sont des FLUX dont la fenêtre est
 * réelle et déclarable, pas des systèmes à état courant.
 *
 * RECONFIRMÉ le 21/09/2026 (DÉCISION LOUIS, QCM — même méthode que le
 * connecteur Odoo, #2565.10/D4) : cette fois contre la DOCUMENTATION PUBLIQUE
 * de chaque outil, pas seulement le code de ce dépôt. Aucune des cinq pages
 * lues ne déclare de fenêtre bornée — chacune documente une collection à état
 * courant, cohérent avec le 18/09 :
 *  - HubSpot (Search API) : https://developers.hubspot.com/docs/api-reference/latest/crm/search-the-crm — lue 21/09/2026, muette sur une fenêtre.
 *  - Google (Gmail `messages.list`) : https://developers.google.com/gmail/api/reference/rest/v1/users.messages/list — lue 21/09/2026, muette.
 *  - Notion (`POST /v1/search`) : https://developers.notion.com/reference/post-search — lue 21/09/2026, muette.
 *  - Microsoft Graph (`$search` sur `/me/messages`) : https://learn.microsoft.com/en-us/graph/search-query-parameter — lue 21/09/2026, muette (le header `ConsistencyLevel: eventual` est scopé aux objets d'annuaire, pas aux messages — vérifié sur cette même page).
 *  - Salesforce (Query REST, SOQL) : https://developer.salesforce.com/docs/platform/api-rest/guide/resources-query.html — INACCESSIBLE (403) le 21/09/2026, non lue. Reste `null`-équivalent par prudence, pas par déclaration.
 */
const COVERAGE_PERIOD_UNKNOWN = { fr: 'non mesuré', en: 'not measured' }

/**
 * #2207.23 (épopée #3014) — la durée ESTIMÉE d'une PREMIÈRE synchronisation
 * DÉCLARÉE par Bellum, jamais mesurée sur l'espace précis (ce serait
 * prématuré : c'est justement la synchro qu'on n'a pas encore faite) et
 * jamais une probabilité. L'ordre de grandeur vient de la même borne que
 * `CrmSyncService` applique déjà à tout passage (`maxContactsPerWorkspace`,
 * `crm-sync.config.ts`) : un lot borné à quelques centaines de fiches se
 * termine en quelques minutes, pas en heures.
 *
 * Déclarée pour HubSpot seulement (le seul CRM que ce dépôt sait mesurer
 * pour de vrai, `HUBSPOT_LATENCY_DECLARED` ci-dessus) — pas les quatre
 * autres : une valeur identique recopiée sur cinq connecteurs qu'on n'a
 * jamais mesurés serait exactement le défaut que la doctrine interdit
 * (« un contrat d'API non vérifiable ne se devine pas »). Les autres restent
 * `undefined` ; l'écran de prévisualisation le dit explicitement, jamais en
 * silence (`syncPreviewDurationUnknown`).
 */
const SYNC_DURATION_FEW_MINUTES = { fr: 'quelques minutes', en: 'a few minutes' }

/**
 * #2261.13 (décision Louis 21/09/2026, QCM) — la SEULE latence DÉCLARÉE
 * trouvée dans une documentation publique, sur les cinq outils vérifiés
 * ci-dessus. `hubspot.client.ts` interroge `CONTACTS_SEARCH_URL` (l'API de
 * recherche, pas une lecture directe par id) — et la doc HubSpot du Search
 * API déclare noir sur blanc un délai d'indexation :
 *
 * > "It may take a few moments for newly created or updated CRM objects to
 * > appear in search results."
 * > — https://developers.hubspot.com/docs/api-reference/latest/crm/search-the-crm, lue 21/09/2026.
 *
 * Servie par `ToolRegistryService.resolveLatency` UNIQUEMENT quand aucune
 * mesure réelle n'existe (`measureToolLatency` rend `not_measured`) — une
 * synchronisation RÉELLE gagne toujours contre une annonce fournisseur.
 * `window_days`/`sample_count` restent absents : une annonce n'a ni fenêtre
 * ni échantillon, ce serait une mesure qu'on ne fait pas (contrat
 * `toolLatencyKnownSchema`).
 */
const HUBSPOT_LATENCY_DECLARED = {
  source: 'declared' as const,
  value: {
    fr: 'quelques instants (délai d’indexation annoncé par le fournisseur avant qu’un objet créé ou modifié apparaisse dans les résultats de recherche)',
    en: 'a few moments (the provider-declared indexing delay before a created or updated object appears in search results)',
  },
  as_of: '2026-09-21T00:00:00.000Z',
}

/**
 * #2261.16 — même décision, pour le statut bêta.
 *
 * `{beta: false, feature: null}` est un FAIT vérifié sur ce dépôt (aucune
 * portée demandée par ces cinq connecteurs, dans `tool-capabilities.ts`, ne
 * porte la mention « beta » ; Microsoft est vérifié explicitement :
 * `microsoft.client.ts` n'appelle que `graph.microsoft.com/v1.0`, jamais
 * `/beta/`) — pas une supposition sur la feuille de route du fournisseur. À
 * réviser connecteur par connecteur si l'un d'eux documente un jour une
 * fonctionnalité bêta.
 *
 * RECONFIRMÉ le 21/09/2026 contre la DOCUMENTATION PUBLIQUE (mêmes cinq pages
 * que `COVERAGE_PERIOD_UNKNOWN` ci-dessus) : aucune ne marque l'endpoint
 * utilisé comme bêta/preview — HubSpot Search API et Gmail `messages.list`
 * sont présentées comme des endpoints de production standard, Notion `/v1/search`
 * ne porte aucune mention bêta, Microsoft Graph confirme `$search` sur
 * `/me/messages` documenté en v1.0 (jamais `/beta/`). Salesforce : doc
 * INACCESSIBLE (403) le 21/09/2026, non reconfirmée par cette lecture — la
 * valeur ci-dessus reste celle établie le 18/09/2026 par lecture du code.
 */
const BETA_NOT_DECLARED = { beta: false, feature: null }

export const TOOL_CATALOG: readonly ToolCatalogEntry[] = [
  /* --- CRM (OAuth, workspace-shared, env-gated) --------------------------- */
  /**
   * #2261.8 / #2261.13 / #2261.16 — défaut mesuré en production le 18/09/2026
   * (recette /integrations, espace de Louis) : HubSpot et Salesforce rendaient
   * « Période couverte : non précisée », « Latence : non communiquée »,
   * « Statut bêta : non communiqué ». `hubspot.client.ts` et
   * `salesforce.client.ts` n'exposent ni fenêtre de lecture historique (la
   * seule notion de date, `searchStaleContacts`, est un FILTRE produit de
   * Bellum — pas une déclaration du fournisseur, même distinction que BOAMP
   * plus bas), ni timeout/latence, ni endpoint « beta » documentés dans ce
   * dépôt.
   *
   * DÉCISION LOUIS 18/09/2026 : `coverage_period`/`beta` sont désormais
   * DÉCLARÉS en dur (`COVERAGE_PERIOD_UNKNOWN`/`BETA_NOT_DECLARED` ci-dessus)
   * plutôt que laissés absents — un `null` identique sur cinq outils se lisait
   * comme un champ oublié. `latency` (#2261.13, DÉCISION LOUIS 19/09/2026) se
   * CALCULE d'abord côté service, sur les synchronisations réelles de
   * l'espace (`ToolRegistryService.resolveLatency`) ; DEPUIS le 21/09/2026,
   * quand rien n'est encore mesuré, le service retombe sur `entry.latency`
   * ICI (`HUBSPOT_LATENCY_DECLARED`, seule entrée renseignée — la doc
   * publique des quatre autres connecteurs de ce groupe reste muette).
   */
  {
    provider: 'hubspot',
    family: family('crm'),
    display_name: 'HubSpot',
    owner: WORKSPACE,
    data_types: { reads: ['contacts', 'companies', 'deals'], writes: ['contacts', 'activity_notes'] },
    allowed_actions: ['export_contact', 'import_contacts', 'log_activity'],
    rate_limits: { fr: '~100 requêtes / 10 s (limite HubSpot)', en: '~100 requests / 10 s (HubSpot limit)' },
    cost_model: INCLUDED,
    memory_policy: CRM_MEMORY,
    coverage_period: COVERAGE_PERIOD_UNKNOWN,
    beta: BETA_NOT_DECLARED,
    // #2261.13 (décision Louis 21/09) — fallback UNIQUEMENT si le service n'a
    // rien mesuré de réel : voir `HUBSPOT_LATENCY_DECLARED` ci-dessus.
    latency: HUBSPOT_LATENCY_DECLARED,
    // #2207.23 — voir `SYNC_DURATION_FEW_MINUTES` ci-dessus.
    sync_duration_estimate: SYNC_DURATION_FEW_MINUTES,
    source: { kind: 'crm', providerKey: 'hubspot' },
  },
  {
    provider: 'salesforce',
    family: family('crm'),
    display_name: 'Salesforce',
    owner: WORKSPACE,
    data_types: { reads: ['contacts', 'accounts', 'opportunities'], writes: ['contacts'] },
    allowed_actions: ['export_contact'],
    rate_limits: {
      fr: 'quota API quotidien par org (limite Salesforce)',
      en: 'daily API quota per org (Salesforce limit)',
    },
    cost_model: INCLUDED,
    memory_policy: CRM_MEMORY,
    coverage_period: COVERAGE_PERIOD_UNKNOWN,
    beta: BETA_NOT_DECLARED,
    // #2261.8/.13/.16 (21/09) — `salesforce.client.ts` interroge le Query
    // REST (SOQL), pas le Search (SOSL) : la doc correspondante
    // (developer.salesforce.com/docs/platform/api-rest/guide/resources-query.html)
    // a répondu 403 (INACCESSIBLE) le 21/09/2026 — non lue, aucune valeur
    // ajoutée par prudence, la ligne du registre le nomme.
    source: { kind: 'crm', providerKey: 'salesforce' },
  },
  {
    provider: 'pipedrive',
    family: family('crm'),
    display_name: 'Pipedrive',
    owner: WORKSPACE,
    data_types: { reads: ['persons', 'organizations'], writes: ['persons'] },
    allowed_actions: ['export_contact'],
    rate_limits: {
      fr: 'budget de tokens API par jour et par compte (limite Pipedrive)',
      en: 'daily API token budget per company (Pipedrive limit)',
    },
    cost_model: INCLUDED,
    memory_policy: CRM_MEMORY,
    source: { kind: 'crm', providerKey: 'pipedrive' },
  },
  {
    provider: 'attio',
    family: family('crm'),
    display_name: 'Attio',
    owner: WORKSPACE,
    data_types: { reads: ['people_records'], writes: ['people_records'] },
    allowed_actions: ['export_contact'],
    cost_model: INCLUDED,
    memory_policy: {
      fr: 'token workspace longue durée chiffré AES-256-GCM ; records lus non persistés',
      en: 'long-lived workspace token encrypted with AES-256-GCM; records read are not persisted',
    },
    source: { kind: 'crm', providerKey: 'attio' },
  },
  {
    provider: 'odoo',
    family: family('crm'),
    display_name: 'Odoo',
    owner: WORKSPACE,
    data_types: { reads: ['people_records'], writes: ['people_records'] },
    allowed_actions: ['export_contact'],
    cost_model: INCLUDED,
    memory_policy: {
      /*
       * ⚠️ Une CLÉ D'API, pas un jeton OAuth — et la nuance compte pour qui lit
       * ce registre : elle n'expire pas, donc aucune reconnexion périodique
       * n'est à prévoir, et elle se révoque depuis le compte du client et non
       * depuis Bellum.
       */
      fr: "clé d'API d'espace chiffrée AES-256-GCM ; contacts lus non persistés",
      en: 'workspace API key encrypted with AES-256-GCM; contacts read are not persisted',
    },
    source: { kind: 'crm', providerKey: 'odoo' },
  },
  {
    // #4187 — Zoho CRM : OAuth 2.0 à région paramétrable. Les écritures passent par la porte commune.
    provider: 'zoho',
    family: family('crm'),
    display_name: 'Zoho CRM',
    owner: WORKSPACE,
    data_types: {
      reads: ['accounts', 'contacts', 'deals', 'users'],
      writes: ['accounts', 'contacts', 'tasks', 'notes'],
    },
    allowed_actions: ['export_contact'],
    cost_model: INCLUDED,
    memory_policy: {
      fr: 'jeton OAuth chiffré AES-256-GCM, domaine d’API rendu par le jeton ; fiches lues non persistées',
      en: 'OAuth token encrypted with AES-256-GCM, API domain returned by the token; records read are not persisted',
    },
    source: { kind: 'crm', providerKey: 'zoho' },
  },

  /* --- Prospection / enrichment (server-side, env-gated) ------------------ */
  {
    provider: 'dropcontact',
    family: family('prospection'),
    display_name: 'Dropcontact',
    owner: WORKSPACE,
    data_types: { reads: ['pro_emails', 'job_titles'], writes: ['contacts'] },
    allowed_actions: ['enrich_contact'],
    rate_limits: {
      fr: 'API asynchrone (batch + polling borné côté Bellum)',
      en: 'asynchronous API (batch + bounded polling on the Bellum side)',
    },
    cost_model: {
      fr: '1 crédit par enrichissement réussi (pas de match = aucun débit)',
      en: '1 credit per successful enrichment (no match = nothing charged)',
    },
    memory_policy: {
      fr: 'email pro + poste persistés sur la fiche contact (source « dropcontact ») ; rien d’autre',
      en: 'pro email + job title persisted on the contact card (source "dropcontact"); nothing else',
    },
    source: { kind: 'server', envKey: 'DROPCONTACT_API_KEY' },
  },
  {
    provider: 'apollo',
    family: family('prospection'),
    display_name: 'Apollo',
    owner: WORKSPACE,
    data_types: { reads: ['contacts', 'pro_emails', 'companies'], writes: ['contacts'] },
    allowed_actions: ['enrich_contact', 'search_contacts'],
    cost_model: {
      fr: '1 crédit par enrichissement réussi (provider par défaut)',
      en: '1 credit per successful enrichment (default provider)',
    },
    memory_policy: {
      fr: 'contacts enrichis persistés sur le compte analysé (source « apollo »)',
      en: 'enriched contacts persisted on the analysed account (source "apollo")',
    },
    source: { kind: 'ia-server', providerId: 'apollo' },
  },

  /* --- Enrichisseurs de secours de la cascade (env-gated) -----------------
   *
   * Ils existent dans le code depuis des semaines et n'apparaissaient NULLE
   * PART — pas même au back-office. Une capacité éteinte faute de clé, sans
   * aucun endroit où s'en apercevoir, n'est pas une capacité : c'est du code
   * mort qu'on croit livré. Les inscrire ici ne les allume pas ; ça rend leur
   * absence VISIBLE, avec le nom exact de la variable à poser.
   *
   * Ordre réel de la cascade : Apollo → SalesQL → Dropcontact → Hunter → Lusha
   * → Kaspr/FullEnrich (contrat non vérifiable, lecture tolérante).
   */
  {
    provider: 'salesql',
    family: family('prospection'),
    display_name: 'SalesQL',
    owner: WORKSPACE,
    data_types: { reads: ['pro_emails', 'phones'], writes: ['contacts'] },
    allowed_actions: ['enrich_contact'],
    cost_model: ENRICHMENT_COST,
    memory_policy: ENRICHMENT_MEMORY,
    source: { kind: 'ia-server', providerId: 'salesql' },
  },
  {
    provider: 'hunter',
    family: family('prospection'),
    display_name: 'Hunter',
    owner: WORKSPACE,
    data_types: { reads: ['pro_emails'], writes: ['contacts'] },
    allowed_actions: ['enrich_contact'],
    rate_limits: {
      fr: 'exige un DOMAINE — sans lui l’appel n’est pas tenté',
      en: 'requires a DOMAIN — without one the call is not attempted',
    },
    cost_model: ENRICHMENT_COST,
    memory_policy: ENRICHMENT_MEMORY,
    source: { kind: 'server', envKey: 'HUNTER_API_KEY' },
  },
  {
    provider: 'lusha',
    family: family('prospection'),
    display_name: 'Lusha',
    owner: WORKSPACE,
    data_types: { reads: ['pro_emails', 'phones'], writes: ['contacts'] },
    allowed_actions: ['enrich_contact'],
    cost_model: ENRICHMENT_COST,
    memory_policy: ENRICHMENT_MEMORY,
    source: { kind: 'server', envKey: 'LUSHA_API_KEY' },
  },
  {
    provider: 'kaspr',
    family: family('prospection'),
    display_name: 'Kaspr',
    owner: WORKSPACE,
    data_types: { reads: ['pro_emails', 'phones'], writes: ['contacts'] },
    allowed_actions: ['enrich_contact'],
    rate_limits: {
      fr: 'contrat d’API non public — lecture tolérante, une adresse devinée est refusée',
      en: 'API contract is not public — tolerant parsing, a pattern-guessed address is rejected',
    },
    cost_model: ENRICHMENT_COST,
    memory_policy: ENRICHMENT_MEMORY,
    source: { kind: 'server', envKey: 'KASPR_API_KEY' },
  },
  {
    provider: 'fullenrich',
    family: family('prospection'),
    display_name: 'FullEnrich',
    owner: WORKSPACE,
    data_types: { reads: ['pro_emails', 'phones'], writes: ['contacts'] },
    allowed_actions: ['enrich_contact'],
    rate_limits: {
      fr: 'contrat d’API non public — lecture tolérante, une adresse devinée est refusée',
      en: 'API contract is not public — tolerant parsing, a pattern-guessed address is rejected',
    },
    cost_model: ENRICHMENT_COST,
    memory_policy: ENRICHMENT_MEMORY,
    source: { kind: 'server', envKey: 'FULLENRICH_API_KEY' },
  },

  /* --- Data sources (server-side on the IA, env-gated) ------------------- */
  {
    provider: 'brave',
    family: family('data'),
    display_name: 'Brave Search',
    owner: WORKSPACE,
    data_types: { reads: ['web_results', 'news'], writes: [] },
    allowed_actions: ['search_web'],
    rate_limits: { fr: 'quota du plan Brave Search API', en: 'Brave Search API plan quota' },
    cost_model: INCLUDED,
    memory_policy: {
      fr: 'résultats injectés dans l’analyse du compte, pas de copie durable',
      en: 'results injected into the account analysis, no durable copy',
    },
    source: { kind: 'ia-server', providerId: 'brave' },
  },
  {
    provider: 'serper',
    family: family('data'),
    display_name: 'Serper (Google SERP)',
    owner: WORKSPACE,
    data_types: { reads: ['web_results'], writes: [] },
    allowed_actions: ['search_web'],
    rate_limits: { fr: 'quota du plan serper.dev', en: 'serper.dev plan quota' },
    cost_model: INCLUDED,
    memory_policy: {
      fr: 'résultats injectés dans l’analyse du compte, pas de copie durable',
      en: 'results injected into the account analysis, no durable copy',
    },
    source: { kind: 'ia-server', providerId: 'serper' },
  },
  {
    provider: 'tavily',
    family: family('data'),
    display_name: 'Tavily',
    owner: WORKSPACE,
    data_types: { reads: ['web_results'], writes: [] },
    allowed_actions: ['search_web'],
    rate_limits: { fr: 'quota du plan tavily.com', en: 'tavily.com plan quota' },
    cost_model: INCLUDED,
    memory_policy: {
      fr: 'résultats injectés dans l’analyse du compte, pas de copie durable',
      en: 'results injected into the account analysis, no durable copy',
    },
    source: { kind: 'ia-server', providerId: 'tavily' },
  },
  {
    provider: 'firecrawl',
    family: family('data'),
    display_name: 'Firecrawl',
    owner: WORKSPACE,
    data_types: { reads: ['scraped_pages'], writes: [] },
    allowed_actions: ['scrape_page'],
    rate_limits: { fr: 'quota du plan Firecrawl', en: 'Firecrawl plan quota' },
    cost_model: INCLUDED,
    memory_policy: {
      fr: 'contenu scrapé injecté dans l’analyse du compte, pas de copie durable',
      en: 'scraped content injected into the account analysis, no durable copy',
    },
    source: { kind: 'ia-server', providerId: 'firecrawl' },
  },
  {
    provider: 'pappers',
    family: family('data'),
    display_name: 'Pappers',
    owner: WORKSPACE,
    data_types: { reads: ['company_registry'], writes: [] },
    allowed_actions: ['lookup_company'],
    rate_limits: { fr: 'quota du plan Pappers API', en: 'Pappers API plan quota' },
    cost_model: INCLUDED,
    memory_policy: {
      fr: 'données registre injectées dans l’analyse du compte, pas de copie durable',
      en: 'registry data injected into the account analysis, no durable copy',
    },
    source: { kind: 'ia-server', providerId: 'pappers' },
  },

  {
    provider: 'insee',
    family: family('data'),
    display_name: 'INSEE Sirene',
    owner: WORKSPACE,
    data_types: { reads: ['company_registry'], writes: [] },
    allowed_actions: ['lookup_company'],
    cost_model: INCLUDED,
    memory_policy: SOURCE_MEMORY,
    source: { kind: 'ia-server', providerId: 'insee' },
  },
  {
    provider: 'inpi',
    family: family('data'),
    display_name: 'INPI (RNE)',
    owner: WORKSPACE,
    data_types: { reads: ['company_registry'], writes: [] },
    allowed_actions: ['lookup_company'],
    cost_model: INCLUDED,
    memory_policy: SOURCE_MEMORY,
    source: { kind: 'ia-server', providerId: 'inpi' },
  },
  {
    provider: 'github',
    family: family('data'),
    display_name: 'GitHub',
    owner: WORKSPACE,
    data_types: { reads: ['tech_signals'], writes: [] },
    allowed_actions: ['search_web'],
    rate_limits: {
      fr: '60 requêtes / h sans jeton, 5000 / h avec',
      en: '60 requests / h without a token, 5000 / h with one',
    },
    cost_model: INCLUDED,
    memory_policy: SOURCE_MEMORY,
    source: { kind: 'ia-server', providerId: 'github' },
  },
  {
    provider: 'zefix',
    family: family('data'),
    display_name: 'Zefix (registre suisse)',
    owner: WORKSPACE,
    data_types: { reads: ['company_registry'], writes: [] },
    allowed_actions: ['lookup_company'],
    cost_model: INCLUDED,
    memory_policy: SOURCE_MEMORY,
    source: { kind: 'ia-server', providerId: 'zefix' },
  },
  {
    provider: 'embeddings',
    family: family('documents'),
    display_name: 'Recherche sémantique (embeddings)',
    genericName: true,
    owner: WORKSPACE,
    data_types: { reads: ['documents'], writes: [] },
    allowed_actions: ['search_files'],
    cost_model: INCLUDED,
    memory_policy: {
      fr: 'vecteurs stockés à côté des documents de la base de connaissance ; sans clé, recherche plein-texte',
      en: 'vectors stored alongside the knowledge-base documents; without a key, full-text search',
    },
    source: { kind: 'ia-server', providerId: 'embeddings' },
  },
  {
    provider: 'transcription',
    family: family('documents'),
    display_name: 'Transcription audio',
    genericName: true,
    owner: WORKSPACE,
    data_types: { reads: ['recordings'], writes: [] },
    allowed_actions: ['transcribe_recording'],
    rate_limits: { fr: '24 Mo par enregistrement', en: '24 MB per recording' },
    cost_model: INCLUDED,
    memory_policy: {
      fr: 'aucun enregistrement conservé ; seul le texte structuré du compte rendu est persisté',
      en: 'no recording is retained; only the structured meeting notes are persisted',
    },
    source: { kind: 'server', envKey: 'TRANSCRIPTION_API_KEY' },
  },
  {
    provider: 'wttj',
    family: family('jobs'),
    display_name: 'Welcome to the Jungle',
    owner: WORKSPACE,
    data_types: { reads: ['it_job_offers'], writes: [] },
    allowed_actions: ['search_offers'],
    rate_limits: {
      fr: 'exige les identifiants Algolia légitimes de l’opérateur — aucune clé du front n’est réutilisée',
      en: 'requires the operator’s own legitimate Algolia credentials — no front-end key is reused',
    },
    cost_model: INCLUDED,
    memory_policy: SOURCE_MEMORY,
    source: { kind: 'ia-server', providerId: 'wttj' },
  },
  {
    provider: 'copilot-bridge',
    family: family('email'),
    display_name: 'Accès messagerie et agenda du copilote',
    genericName: true,
    owner: WORKSPACE,
    data_types: { reads: ['emails', 'events', 'availability'], writes: [] },
    allowed_actions: ['read_emails', 'list_events'],
    cost_model: INCLUDED,
    memory_policy: {
      fr: 'lecture seule ; le corps des messages ne quitte jamais la messagerie',
      en: 'read-only; message bodies never leave the mailbox',
    },
    // Ce n'est pas un fournisseur mais la MÊME question — la clé est-elle
    // posée ? — et son absence est la plus coûteuse du dépôt : les cinq outils
    // du copilote répondent « je n'ai pas accès à ta messagerie » alors que la
    // messagerie EST branchée côté API. Invisible partout jusqu'ici.
    source: { kind: 'ia-server', providerId: 'copilot_bridge' },
  },

  /* --- Communication (self-serve webhooks, per-user) --------------------- */
  {
    provider: 'slack',
    family: family('communication'),
    display_name: 'Slack',
    owner: USER,
    data_types: { reads: [], writes: ['notifications', 'buy_signals'] },
    allowed_actions: ['send_notification'],
    rate_limits: { fr: '~1 message / s par webhook (limite Slack)', en: '~1 message / s per webhook (Slack limit)' },
    cost_model: { fr: 'gratuit (notification webhook)', en: 'free (webhook notification)' },
    memory_policy: WEBHOOK_MEMORY,
    source: { kind: 'webhook', providerKey: 'slack' },
  },
  {
    provider: 'discord',
    family: family('communication'),
    display_name: 'Discord',
    owner: USER,
    data_types: { reads: [], writes: ['notifications', 'buy_signals'] },
    allowed_actions: ['send_notification'],
    rate_limits: {
      fr: '~30 messages / min par webhook (limite Discord)',
      en: '~30 messages / min per webhook (Discord limit)',
    },
    cost_model: { fr: 'gratuit (notification webhook)', en: 'free (webhook notification)' },
    memory_policy: WEBHOOK_MEMORY,
    source: { kind: 'webhook', providerKey: 'discord' },
  },
  {
    provider: 'teams',
    family: family('communication'),
    display_name: 'Microsoft Teams',
    owner: USER,
    data_types: { reads: [], writes: ['notifications', 'buy_signals'] },
    allowed_actions: ['send_notification'],
    rate_limits: {
      fr: '~4 requêtes / s par connecteur (limite Microsoft)',
      en: '~4 requests / s per connector (Microsoft limit)',
    },
    cost_model: { fr: 'gratuit (notification webhook)', en: 'free (webhook notification)' },
    memory_policy: WEBHOOK_MEMORY,
    source: { kind: 'webhook', providerKey: 'teams' },
  },
  {
    provider: 'googlechat',
    family: family('communication'),
    display_name: 'Google Chat',
    owner: USER,
    data_types: { reads: [], writes: ['notifications', 'buy_signals'] },
    allowed_actions: ['send_notification'],
    rate_limits: {
      fr: '~60 écritures / min par espace (limite Google)',
      en: '~60 writes / min per space (Google limit)',
    },
    cost_model: { fr: 'gratuit (notification webhook)', en: 'free (webhook notification)' },
    memory_policy: WEBHOOK_MEMORY,
    source: { kind: 'webhook', providerKey: 'googlechat' },
  },
  {
    provider: 'mattermost',
    family: family('communication'),
    display_name: 'Mattermost',
    owner: USER,
    data_types: { reads: [], writes: ['notifications', 'buy_signals'] },
    allowed_actions: ['send_notification'],
    rate_limits: {
      fr: 'dépend du serveur auto-hébergé',
      en: 'depends on the self-hosted server',
    },
    cost_model: { fr: 'gratuit (notification webhook)', en: 'free (webhook notification)' },
    memory_policy: WEBHOOK_MEMORY,
    source: { kind: 'webhook', providerKey: 'mattermost' },
  },
  {
    provider: 'webhook',
    family: family('communication'),
    display_name: 'Webhook sortant',
    genericName: true,
    owner: USER,
    data_types: { reads: [], writes: ['events'] },
    allowed_actions: ['send_event'],
    cost_model: { fr: 'gratuit (événement webhook)', en: 'free (webhook event)' },
    memory_policy: WEBHOOK_MEMORY,
    source: { kind: 'webhook', providerKey: 'webhook' },
  },

  /* --- MCP (assistant IA du commercial, per-user, env-gated) ------------- */
  {
    provider: 'mcp',
    family: family('mcp'),
    display_name: 'Assistant IA (MCP)',
    genericName: true,
    owner: USER,
    data_types: { reads: ['accounts', 'contacts', 'analyses'], writes: ['analysis_runs'] },
    allowed_actions: ['read_data', 'run_analysis'],
    cost_model: {
      fr: 'lecture gratuite ; 1 crédit par analyse lancée (scope mcp:analysis)',
      en: 'reads are free; 1 credit per analysis launched (mcp:analysis scope)',
    },
    memory_policy: {
      fr: 'access token OAuth 2.1 court ; révocable à tout moment',
      en: 'short-lived OAuth 2.1 access token; revocable at any time',
    },
    source: { kind: 'mcp' },
  },

  /* --- Google Workspace (OAuth, one workspace link → 3 capabilities) ----- */
  /**
   * #2261.8 / #2261.13 / #2261.16 — même défaut mesuré le 18/09/2026 que
   * HubSpot/Salesforce ci-dessus, sur les trois entrées Google Workspace
   * (Gmail, Google Calendar, Google Drive) : `google.client.ts` ne déclare
   * ni fenêtre de lecture, ni latence, ni endpoint « beta » — les emails,
   * événements et fichiers sont lus tels qu'ils existent aujourd'hui dans le
   * compte connecté, sans filtre de date posé par Bellum ni limite annoncée
   * par Google trouvée dans ce dépôt.
   *
   * DÉCISION LOUIS 18/09/2026 : `coverage_period`/`beta` DÉCLARÉS en dur sur
   * les trois entrées (même constantes que HubSpot/Salesforce) — `latency`
   * (#2261.13, DÉCISION LOUIS 19/09/2026) : le concept s'applique (ce sont des
   * outils de SYNCHRONISATION), mais Bellum ne capture pas encore leur
   * horodatage source — `not_measured` avec sa raison, jamais `null` une fois
   * connectés (`LATENCY_SOURCE_WIRED_PROVIDERS`, `tool-registry.service.ts`).
   *
   * RECONFIRMÉ 21/09/2026 contre la doc publique Gmail `messages.list`
   * (https://developers.google.com/gmail/api/reference/rest/v1/users.messages/list,
   * lue le même jour) : aucune fenêtre, aucun délai, aucune mention bêta —
   * les trois entrées restent donc sans `latency` déclarée (voir
   * `HUBSPOT_LATENCY_DECLARED` : Google n'a pas d'équivalent documenté).
   */
  {
    provider: 'gmail',
    family: family('email'),
    display_name: 'Gmail',
    owner: WORKSPACE,
    data_types: { reads: ['emails', 'threads'], writes: ['drafts', 'emails'] },
    allowed_actions: ['read_emails', 'create_draft', 'send_email'],
    cost_model: INCLUDED,
    memory_policy: {
      fr: 'emails non persistés côté Bellum',
      en: 'emails are not persisted by Bellum',
    },
    coverage_period: COVERAGE_PERIOD_UNKNOWN,
    beta: BETA_NOT_DECLARED,
    source: { kind: 'oauth', providerKey: 'google' },
  },
  {
    provider: 'google-calendar',
    family: family('calendar'),
    display_name: 'Google Calendar',
    owner: WORKSPACE,
    data_types: { reads: ['events', 'availability'], writes: ['events'] },
    allowed_actions: ['list_events', 'create_event'],
    cost_model: INCLUDED,
    memory_policy: {
      fr: 'événements non persistés côté Bellum',
      en: 'events are not persisted by Bellum',
    },
    coverage_period: COVERAGE_PERIOD_UNKNOWN,
    beta: BETA_NOT_DECLARED,
    source: { kind: 'oauth', providerKey: 'google' },
  },
  {
    provider: 'google-drive',
    family: family('documents'),
    display_name: 'Google Drive',
    owner: WORKSPACE,
    data_types: { reads: ['documents', 'file_metadata'], writes: [] },
    allowed_actions: ['read_file', 'search_files'],
    cost_model: INCLUDED,
    memory_policy: {
      fr: 'documents ingérés stockés dans la base de connaissance (RAG), supprimables',
      en: 'ingested documents stored in the knowledge base (RAG), deletable',
    },
    coverage_period: COVERAGE_PERIOD_UNKNOWN,
    beta: BETA_NOT_DECLARED,
    source: { kind: 'oauth', providerKey: 'google' },
  },

  /* --- Notion / Microsoft 365 (OAuth, dedicated per-workspace tables) ----- */
  /**
   * #2261.8 / #2261.13 / #2261.16 — même défaut mesuré le 18/09/2026 sur
   * Notion et Microsoft 365 : `notion.client.ts` et `microsoft.client.ts`
   * n'exposent ni fenêtre de lecture, ni latence, ni endpoint « beta »
   * (Microsoft appelle exclusivement `graph.microsoft.com/v1.0`, jamais
   * `/beta/`).
   *
   * DÉCISION LOUIS 18/09/2026 : `coverage_period`/`beta` DÉCLARÉS en dur —
   * `latency` (#2261.13, DÉCISION LOUIS 19/09/2026) : même situation que
   * Google Workspace ci-dessus, non câblée à ce jour — `not_measured` avec sa
   * raison, jamais `null` muet une fois connectés.
   *
   * RECONFIRMÉ 21/09/2026 contre la doc publique : Notion `POST /v1/search`
   * (https://developers.notion.com/reference/post-search, lue le 21/09/2026)
   * et Microsoft Graph `$search` sur `/me/messages`
   * (https://learn.microsoft.com/en-us/graph/search-query-parameter, lue le
   * 21/09/2026 — le header `ConsistencyLevel: eventual` n'y est documenté que
   * pour les objets d'annuaire, jamais pour les messages) sont muets sur
   * délai et statut bêta — aucune `latency` déclarée pour ces deux-là.
   */
  {
    provider: 'notion',
    family: family('documents'),
    display_name: 'Notion',
    owner: WORKSPACE,
    data_types: { reads: ['pages', 'databases'], writes: [] },
    allowed_actions: ['read_pages', 'search_pages'],
    cost_model: INCLUDED,
    memory_policy: {
      fr: 'pages ingérées stockées dans la base de connaissance (RAG), supprimables',
      en: 'ingested pages stored in the knowledge base (RAG), deletable',
    },
    coverage_period: COVERAGE_PERIOD_UNKNOWN,
    beta: BETA_NOT_DECLARED,
    source: { kind: 'oauth', providerKey: 'notion' },
  },
  {
    provider: 'microsoft',
    family: family('email'),
    // #3973 — décision Louis 11/10/2026 : UN outil, deux familles. Décocher
    // l'agenda Google laisse l'agenda Microsoft lisible ; un espace qui n'a que
    // Microsoft a l'agenda branché ; décocher Microsoft retire les deux.
    additional_families: [family('calendar')],
    display_name: 'Microsoft 365 / Outlook',
    owner: WORKSPACE,
    data_types: { reads: ['events', 'availability'], writes: ['emails', 'events'] },
    allowed_actions: ['send_email', 'create_event'],
    rate_limits: { fr: 'quotas Microsoft Graph par mailbox', en: 'Microsoft Graph per-mailbox quotas' },
    cost_model: INCLUDED,
    memory_policy: {
      fr: 'emails et événements non persistés côté Bellum',
      en: 'emails and events are not persisted by Bellum',
    },
    coverage_period: COVERAGE_PERIOD_UNKNOWN,
    beta: BETA_NOT_DECLARED,
    source: { kind: 'oauth', providerKey: 'microsoft' },
  },
  {
    provider: 'linkedin',
    family: family('linkedin'),
    display_name: 'LinkedIn',
    owner: USER,
    data_types: { reads: ['profiles'], writes: ['messages'] },
    allowed_actions: ['view_profile', 'send_message'],
    cost_model: INCLUDED,
    memory_policy: {
      fr: 'aucune donnée LinkedIn persistée',
      en: 'no LinkedIn data persisted',
    },
    source: { kind: 'catalog' },
  },
  {
    provider: 'france-travail',
    family: family('jobs'),
    display_name: 'France Travail',
    owner: WORKSPACE,
    data_types: { reads: ['it_job_offers'], writes: [] },
    allowed_actions: ['search_offers'],
    cost_model: { fr: 'gratuit (API publique)', en: 'free (public API)' },
    memory_policy: {
      fr: 'offres injectées dans l’analyse du compte, pas de copie durable',
      en: 'offers injected into the account analysis, no durable copy',
    },
    // #2261.8 — DÉCLARÉ, pas deviné : l'API « offres d'emploi » de France
    // Travail ne renvoie que les offres ACTIVES au moment de l'appel, jamais
    // un historique — c'est le comportement documenté de l'API de recherche,
    // pas une estimation de Bellum.
    coverage_period: {
      fr: 'les offres actuellement publiées ; l’API ne renvoie aucun historique',
      en: 'currently published offers only; the API returns no history',
    },
    source: { kind: 'ia-server', providerId: 'france_travail' },
  },
  /* --- Appels d'offres / marchés publics (server-side, sans clé) -----------
   *
   * #2261.30 — un AUTRE objet que les offres d'emploi ci-dessus : un appel
   * d'offres n'est ni un candidat ni un recrutement, et le confondre avec
   * `jobs` mélangerait deux capacités distinctes dans le même manifeste. BOAMP
   * (Bulletin officiel des annonces des marchés publics) est LU par
   * `apps/ia/app/services/data_sources/public_tenders.py` — Découvrir v2 (AO
   * ouverts) et l'analyse de compte (`raw_analysis.public_tenders`) le
   * consomment déjà ; il manquait seulement au manifeste des outils branchés.
   */
  {
    provider: 'boamp',
    family: family('tenders'),
    display_name: 'BOAMP (marchés publics)',
    owner: WORKSPACE,
    data_types: { reads: ['public_tenders'], writes: [] },
    allowed_actions: ['search_tenders'],
    // Gratuit et SANS clé (mirroir Opendatasoft public) — vérifié dans le
    // docstring de `public_tenders.py` : « Free, NO key ».
    cost_model: { fr: 'gratuit (API publique, sans clé)', en: 'free (public API, no key)' },
    rate_limits: { fr: '30 requêtes / min, 3 en parallèle', en: '30 requests / min, 3 concurrent' },
    memory_policy: {
      fr: 'avis injectés dans l’analyse du compte, pas de copie durable',
      en: 'notices injected into the account analysis, no durable copy',
    },
    // #2261.8 — `coverage_period` VOLONTAIREMENT absent : BOAMP ne DÉCLARE
    // aucune fenêtre de couverture sur ce mirroir public, et le résolveur
    // rend `null` (« inconnu ») pour toute entrée qui l'omet. La fenêtre de
    // ~18 mois appliquée par `public_tenders.py` (`_MAX_AGE_DAYS`) est un
    // FILTRE de Bellum, pas une déclaration du fournisseur — l'écrire ici
    // afficherait comme « couvert par la source » ce qui n'est qu'un choix
    // produit de notre côté.
    source: { kind: 'ia-server', providerId: 'boamp' },
  },
  /* --- ATS / ERP, téléphonie, administratif (identifiants par espace) ----- */
  {
    provider: 'boondmanager',
    family: family('ats'),
    display_name: 'BoondManager',
    owner: WORKSPACE,
    // #4686 / #4692 — quatre écritures sont livrées ET appelées (`AtsController.decideWrite`),
    // chacune derrière la même porte : demande → approbation d'un AUTRE
    // responsable → exécution. `create_mission` = POST /deliveries,
    // `update_tjm` = PATCH /deliveries/{id}, `update_need_status` = PATCH
    // /opportunities/{id}, `log_call` = POST /actions (compte rendu d'appel). La garde `boond-write-catalog.spec.ts` LIT
    // `ats-write.service.ts` : une écriture sans entrée ici fait échouer la CI.
    data_types: {
      reads: ['missions', 'consultants', 'opportunities'],
      writes: ['deliveries', 'opportunities', 'actions'],
    },
    allowed_actions: [
      'read_missions',
      'read_consultants',
      'read_opportunities',
      'create_mission',
      'update_tjm',
      'update_need_status',
      'log_call',
    ],
    cost_model: INCLUDED,
    memory_policy: {
      fr: 'identifiants chiffrés AES-256-GCM ; missions et consultants lus non persistés ; toute écriture passe par une demande approuvée par un second responsable',
      en: 'credentials encrypted with AES-256-GCM; missions and consultants read are not persisted; every write goes through a request approved by a second manager',
    },
    source: { kind: 'workspace-secret', silo: 'ats', providerKey: 'boondmanager' },
  },
  {
    provider: 'aircall',
    family: family('telephony'),
    display_name: 'Aircall',
    owner: WORKSPACE,
    data_types: { reads: ['calls', 'transcripts'], writes: ['activity_notes'] },
    allowed_actions: ['read_calls', 'log_to_crm'],
    cost_model: INCLUDED,
    memory_policy: {
      fr: 'identifiants chiffrés AES-256-GCM ; transcriptions lues seulement si l’espace les a activées',
      en: 'credentials encrypted with AES-256-GCM; transcripts read only if the workspace enabled them',
    },
    source: { kind: 'workspace-secret', silo: 'telephony', providerKey: 'aircall' },
  },
  {
    provider: 'ringover',
    family: family('telephony'),
    display_name: 'Ringover',
    owner: WORKSPACE,
    data_types: { reads: ['calls'], writes: ['activity_notes'] },
    allowed_actions: ['read_calls', 'log_to_crm'],
    cost_model: INCLUDED,
    memory_policy: {
      fr: 'identifiants chiffrés AES-256-GCM ; journal d’appels non persisté hors note CRM',
      en: 'credentials encrypted with AES-256-GCM; call log not persisted beyond the CRM note',
    },
    source: { kind: 'workspace-secret', silo: 'telephony', providerKey: 'ringover' },
  },
  {
    // #4427 — l'outil de séquences de l'ESN. Bellum y AJOUTE un contact préparé
    // à une campagne EXISTANTE, sur geste de la personne, et relit ses statuts.
    // Il ne crée ni ne lance de campagne, n'écrit aucun message chez Lemlist.
    provider: 'lemlist',
    family: family('prospection'),
    display_name: 'Lemlist',
    owner: WORKSPACE,
    data_types: { reads: ['campaigns', 'lead_activities'], writes: ['campaign_leads'] },
    allowed_actions: ['list_campaigns', 'add_lead_to_campaign', 'read_lead_statuses'],
    cost_model: INCLUDED,
    // https://developer.lemlist.com/api-reference/getting-started/rate-limits
    rate_limits: { fr: '20 requêtes / 2 s par clé d’API', en: '20 requests / 2 s per API key' },
    memory_policy: {
      fr: 'clé chiffrée AES-256-GCM ; seuls l’identifiant du lead et la campagne choisie sont gardés',
      en: 'key encrypted with AES-256-GCM; only the lead id and the chosen campaign are kept',
    },
    source: { kind: 'workspace-secret', silo: 'lemlist', providerKey: 'lemlist' },
  },
  {
    provider: 'yousign',
    family: family('admin_docs'),
    display_name: 'Yousign',
    owner: WORKSPACE,
    data_types: { reads: ['signatures'], writes: [] },
    allowed_actions: ['list_pending_signatures', 'send_to_signature'],
    cost_model: INCLUDED,
    memory_policy: ADMIN_DOCS_MEMORY,
    source: { kind: 'workspace-secret', silo: 'admin_docs', providerKey: 'yousign' },
  },
  {
    provider: 'docusign',
    family: family('admin_docs'),
    display_name: 'DocuSign',
    owner: WORKSPACE,
    data_types: { reads: ['signatures'], writes: [] },
    allowed_actions: ['list_pending_signatures'],
    cost_model: INCLUDED,
    memory_policy: ADMIN_DOCS_MEMORY,
    source: { kind: 'workspace-secret', silo: 'admin_docs', providerKey: 'docusign' },
  },
  {
    provider: 'qonto',
    family: family('admin_docs'),
    display_name: 'Qonto',
    owner: WORKSPACE,
    data_types: { reads: ['invoices'], writes: [] },
    allowed_actions: ['list_unpaid_invoices'],
    cost_model: INCLUDED,
    memory_policy: ADMIN_DOCS_MEMORY,
    source: { kind: 'workspace-secret', silo: 'admin_docs', providerKey: 'qonto' },
  },
  {
    provider: 'tiime',
    family: family('admin_docs'),
    display_name: 'Tiime',
    owner: WORKSPACE,
    data_types: { reads: ['invoices'], writes: [] },
    allowed_actions: ['list_unpaid_invoices'],
    cost_model: INCLUDED,
    memory_policy: ADMIN_DOCS_MEMORY,
    source: { kind: 'workspace-secret', silo: 'admin_docs', providerKey: 'tiime' },
  },

  {
    provider: 'stripe',
    family: family('finance'),
    display_name: 'Stripe',
    owner: WORKSPACE,
    data_types: { reads: ['subscriptions', 'invoices'], writes: ['subscriptions'] },
    allowed_actions: ['manage_billing'],
    cost_model: INCLUDED,
    memory_policy: {
      fr: 'état d’abonnement synchronisé via webhooks signés ; pas de données carte',
      en: 'subscription state synced via signed webhooks; no card data',
    },
    source: { kind: 'server', envKey: 'STRIPE_SECRET_KEY' },
  },
] as const
