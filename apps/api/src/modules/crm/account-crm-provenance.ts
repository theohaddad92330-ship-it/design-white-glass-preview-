import {
  CRM_MIRROR_ACTIVITY_KINDS,
  CRM_MIRROR_DEAL_STATUSES,
  CRM_PROVIDERS,
  classifyContactCrmOrigin,
  isKnownContactSource,
  type AccountCrmProvenance,
  type AccountCrmSays,
  type ContactCrmProvenance,
  type CrmProvider,
} from '@bellum/contracts'

/** Ce qu'il faut de l'exécuteur SQL — `EntityManager` le satisfait, un double de spec aussi. */
type SqlRunner = { query: (sql: string, params?: unknown[]) => Promise<unknown> }

type AccountRow = {
  status: string
  import_marked: boolean
  linked?: boolean
  import_kind?: string | null
  import_at?: Date | string | null
}
type ContactRow = {
  id: string
  source: string | null
  import_marked: boolean
  linked?: boolean
  pushed: boolean
  imported_at?: Date | string | null
}

/**
 * #4459.2 — « Déjà dans ton CRM » / « Apporté par Bellum », contact par contact.
 *
 * Aucune colonne neuve : la provenance est lue là où les imports l'écrivent DÉJÀ — `contacts.source`
 * (`import` / `crm`) et la trace d'import `record_import_marks` (#4051), que pose chaque reprise (fichier
 * ou CRM branché), y compris sur une fiche existante qu'elle complète. `contact_crm_exports` (#3719.4)
 * dit ce que Bellum a déjà poussé : un tel contact reste « apporté », il n'est simplement plus reproposé.
 *
 * `sync_links` EST lu (#4459.2, recette prod 23/10) : la synchro d'un CRM branché relie une fiche que Bellum
 * avait DÉJÀ trouvée à son enregistrement HubSpot sans poser de trace d'import ni toucher `source` — sans ce
 * lien, les 35 contacts d'un compte venu de HubSpot restaient muets. Le lien est écrit par les imports
 * seulement (CRM → Bellum, ou référence d'un fichier) ; la poussée de Bellum n'en pose AUCUN, elle écrit
 * `contact_crm_exports` : un contact apporté ne devient donc pas « déjà dans ton CRM » le lendemain de son envoi.
 *
 * Bornée à l'espace de l'appelant ; un compte d'un autre espace rend `null`, jamais une provenance devinée.
 */
export async function loadAccountCrmProvenance(
  runner: SqlRunner,
  accountId: string,
  workspaceId: string,
  options: { demoTool?: CrmProvider } = {},
): Promise<AccountCrmProvenance | null> {
  const accounts = (await runner.query(
    `SELECT a.status,
            EXISTS (SELECT 1 FROM record_import_marks m
                     WHERE m.workspace_id = $2 AND m.entity_type = 'account' AND m.entity_id = a.id) AS import_marked,
            EXISTS (SELECT 1 FROM sync_links s
                     WHERE s.workspace_id = $2 AND s.entity_type = 'account' AND s.internal_id = a.id) AS linked,
            (SELECT m.source_kind FROM record_import_marks m
              WHERE m.workspace_id = $2 AND m.entity_type = 'account' AND m.entity_id = a.id
              ORDER BY m.imported_at DESC LIMIT 1) AS import_kind,
            (SELECT MAX(m.imported_at) FROM record_import_marks m
              WHERE m.workspace_id = $2 AND m.entity_type = 'account' AND m.entity_id = a.id) AS import_at
       FROM accounts a
      WHERE a.id = $1 AND a.workspace_id = $2`,
    [accountId, workspaceId],
  )) as AccountRow[]
  const account = accounts?.[0]
  if (!account) return null

  const rows = (await runner.query(
    `SELECT c.id, c.source,
            EXISTS (SELECT 1 FROM record_import_marks m
                     WHERE m.workspace_id = $2 AND m.entity_type = 'contact' AND m.entity_id = c.id) AS import_marked,
            EXISTS (SELECT 1 FROM sync_links s
                     WHERE s.workspace_id = $2 AND s.entity_type = 'contact' AND s.internal_id = c.id) AS linked,
            EXISTS (SELECT 1 FROM contact_crm_exports e
                     WHERE e.workspace_id = $2 AND e.contact_id = c.id) AS pushed,
            (SELECT MAX(m.imported_at) FROM record_import_marks m
              WHERE m.workspace_id = $2 AND m.entity_type = 'contact' AND m.entity_id = c.id) AS imported_at
       FROM contacts c
      WHERE c.account_id = $1 AND c.workspace_id = $2 AND c.deleted_at IS NULL
      ORDER BY c.created_at ASC, c.id ASC`,
    [accountId, workspaceId],
  )) as ContactRow[]

  const contacts: ContactCrmProvenance[] = []
  for (const row of rows ?? []) {
    const origin = classifyContactCrmOrigin({
      source: row.source ?? null,
      importedFromCrm: row.import_marked === true || row.linked === true,
    })
    // On n'affiche pas ce qu'on n'a pas : un contact sans provenance n'a pas de ligne.
    if (origin) contacts.push({ contactId: row.id, origin, pushed: row.pushed === true })
  }
  // #4680 — les contacts CONNUS (même prédicat que les écrans : `isKnownContactSource`), lus en base. La date de
  // l'import est la plus récente trace posée sur l'un d'eux ; sans trace, `null` — jamais une date devinée.
  const knownRows = (rows ?? []).filter(row => isKnownContactSource(row.source))
  const knownDates = knownRows.map(row => iso(row.imported_at)).filter((date): date is string => date !== null)
  const knownContacts =
    knownRows.length > 0 ? { count: knownRows.length, importedAt: knownDates.sort().at(-1) ?? null } : null
  const importKind: 'file' | 'tool' | null =
    account.import_kind === 'file' ? 'file' : account.import_kind === 'tool' ? 'tool' : null
  const accountImport = importKind ? { kind: importKind, importedAt: iso(account.import_at) } : null
  const crm = await loadAccountCrmSays(runner, accountId, workspaceId, options.demoTool)
  return {
    accountFromCrm: account.status === 'imported' || account.import_marked === true || account.linked === true,
    contacts,
    ...(knownContacts ? { knownContacts } : {}),
    ...(accountImport ? { accountImport } : {}),
    // #4604 — absent (pas `null`) quand aucun CRM n'est connu : la réponse d'un compte sans CRM ne change pas.
    ...(crm ? { crm } : {}),
  }
}

type DealRow = {
  title: string | null
  stage_label: string | null
  status: string | null
  amount: string | number | null
  currency: string | null
  owner_name: string | null
  updated_at: Date | string | null
  crm_custom_fields?: unknown
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function oneOf<T extends string>(values: readonly T[], value: string | null | undefined): T | null {
  return value && (values as readonly string[]).includes(value) ? (value as T) : null
}

const CUSTOM_FIELDS_SHOWN = 12
const CUSTOM_FIELD_VALUE_MAX = 200

/**
 * #4604.4 — les champs personnalisés d'une affaire, en texte lisible. Un champ vide, un objet, un booléen, un texte
 * long ou sur plusieurs lignes (un corps de note, qui ne sort jamais) ne fait AUCUNE ligne ; un nombre, lui, est une
 * valeur que le CRM porte. Triés par nom d'API pour un rendu stable.
 */
function readCustomFields(raw: unknown): Array<{ key: string; value: string }> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
  const fields: Array<{ key: string; value: string }> = []
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const text =
      typeof value === 'string'
        ? value.trim()
        : typeof value === 'number' && Number.isFinite(value)
          ? String(value)
          : ''
    if (!key.trim() || !text || text.length > CUSTOM_FIELD_VALUE_MAX || /[\r\n]/.test(text)) continue
    fields.push({ key, value: text })
  }
  return fields.sort((a, b) => a.key.localeCompare(b.key)).slice(0, CUSTOM_FIELDS_SHOWN)
}

/**
 * #4604.7 — la version du CRM d'un champ CORRIGÉ à la main : le dernier écart que l'import a journalisé quand la
 * correction humaine l'a emporté (`sync_record_events`, `proposal.<champ>.crm`). Bornée à l'espace ET au compte ;
 * sans correction humaine on ne lit même pas le journal.
 */
async function loadCrmVersionsOfHumanFields(
  runner: SqlRunner,
  accountId: string,
  workspaceId: string,
  humanFields: ReadonlyArray<'company_name' | 'siren'>,
): Promise<Array<{ field: 'company_name' | 'siren'; value: string }>> {
  if (humanFields.length === 0) return []
  const events = (await runner.query(
    `SELECT e.proposal
       FROM sync_record_events e
      WHERE e.internal_id = $1 AND e.workspace_id = $2 AND e.entity_type = 'account'
        AND e.action = 'conflict' AND e.proposal IS NOT NULL
      ORDER BY e.created_at DESC
      LIMIT 20`,
    [accountId, workspaceId],
  )) as Array<{ proposal: Record<string, { crm?: string | null } | undefined> | null }>
  const versions: Array<{ field: 'company_name' | 'siren'; value: string }> = []
  for (const field of humanFields) {
    for (const event of events ?? []) {
      const value = event.proposal?.[field]?.crm
      if (typeof value === 'string' && value.trim()) {
        versions.push({ field, value: value.trim() })
        break
      }
    }
  }
  return versions
}

/** `connector` = écrit par l'import du CRM ; `human` = corrigé à la main. Toute autre source : aucune étiquette. */
const FIELD_SOURCE_LABEL: Readonly<Record<string, 'crm' | 'human'>> = { connector: 'crm', human: 'human' }

/**
 * #4604 — « Ce que dit ton CRM » : le miroir du CRM DU CLIENT pour ce compte, et la provenance de ses champs.
 *
 * Réutilise ce qui est DÉJÀ écrit, aucune colonne neuve : `sync_links` / `crm_deals` (quel outil), `crm_deals`
 * + `crm_owners` (affaires, étape, propriétaire), `crm_activities` (type et date — JAMAIS le corps ni l'objet),
 * `field_provenance` (le modèle de provenance par champ, que l'import commet en `connector` et une correction
 * en `human`) et `account_crm_fusions` (#4603). Chaque requête est bornée à l'espace ET au compte.
 *
 * `null` quand l'outil n'est pas un CRM connu : on ne nomme pas un CRM qu'on devine.
 */
async function loadAccountCrmSays(
  runner: SqlRunner,
  accountId: string,
  workspaceId: string,
  demoTool: CrmProvider | undefined,
): Promise<AccountCrmSays | null> {
  const providerRows = (await runner.query(
    `SELECT p.provider AS crm_provider FROM (
       SELECT s.provider, 0 AS rank, s.last_synced_at AS at
         FROM sync_links s
        WHERE s.internal_id = $1 AND s.workspace_id = $2 AND s.entity_type = 'account' AND s.provider <> 'csv'
       UNION ALL
       SELECT d.provider, 1 AS rank, d.synced_at AS at
         FROM crm_deals d
        WHERE d.account_id = $1 AND d.workspace_id = $2
     ) p
     ORDER BY p.rank, p.at DESC NULLS LAST
     LIMIT 1`,
    [accountId, workspaceId],
  )) as Array<{ crm_provider: string | null }>
  const found = providerRows?.[0]?.crm_provider
  // Craft n°9 — le miroir de la salle est semé sous `demo` : il se lit comme le CRM FICTIF que la salle montre
  // déjà branché (`DEMO_CRM_PUSH_TARGETS`), seulement quand l'appelant le dit. Hors salle, `demo` n'est rien.
  const provider = found === 'demo' && demoTool ? demoTool : oneOf(CRM_PROVIDERS, found)
  if (!provider) return null

  const [dealRows, activityRows, fieldRows, fusionRows] = (await Promise.all([
    runner.query(
      `SELECT d.title, d.stage_label, d.status, d.amount, d.currency, d.crm_custom_fields, o.name AS owner_name,
              COALESCE(d.crm_updated_at, d.updated_at) AS updated_at
         FROM crm_deals d
         LEFT JOIN crm_owners o
           ON o.workspace_id = d.workspace_id AND o.provider = d.provider AND o.external_id = d.owner_external_id
        WHERE d.account_id = $1 AND d.workspace_id = $2 AND d.archived_at IS NULL
        ORDER BY COALESCE(d.crm_updated_at, d.updated_at) DESC NULLS LAST
        LIMIT 20`,
      [accountId, workspaceId],
    ),
    runner.query(
      `SELECT a.kind, a.occurred_at
         FROM crm_activities a
        WHERE a.account_id = $1 AND a.workspace_id = $2 AND a.archived_at IS NULL AND a.occurred_at IS NOT NULL
        ORDER BY a.occurred_at DESC
        LIMIT 20`,
      [accountId, workspaceId],
    ),
    runner.query(
      `SELECT f.field, f.source
         FROM field_provenance f
        WHERE f.entity_id = $1 AND f.workspace_id = $2 AND f.entity_type = 'account'
          AND f.field IN ('company_name', 'siren')`,
      [accountId, workspaceId],
    ),
    runner.query(
      `SELECT f.id, f.merged_at, a.company_name AS absorbed_name
         FROM account_crm_fusions f
         JOIN accounts a ON a.id = f.absorbed_id AND a.workspace_id = f.workspace_id
        WHERE f.kept_id = $1 AND f.workspace_id = $2 AND f.undone_at IS NULL
        ORDER BY f.merged_at DESC
        LIMIT 1`,
      [accountId, workspaceId],
    ),
  ])) as [
    DealRow[],
    Array<{ kind: string | null; occurred_at: Date | string | null }>,
    Array<{ field: string; source: string }>,
    Array<{ id: string; merged_at: Date | string; absorbed_name: string | null }>,
  ]

  const fusion = fusionRows?.[0]
  const mergedAt = iso(fusion?.merged_at)
  const fields = (fieldRows ?? []).flatMap(
    (row): Array<{ field: 'company_name' | 'siren'; source: 'crm' | 'human' }> => {
      const source = FIELD_SOURCE_LABEL[row.source]
      return source && (row.field === 'company_name' || row.field === 'siren') ? [{ field: row.field, source }] : []
    },
  )
  const crmValues = await loadCrmVersionsOfHumanFields(
    runner,
    accountId,
    workspaceId,
    fields.filter(entry => entry.source === 'human').map(entry => entry.field),
  )
  return {
    provider,
    deals: (dealRows ?? []).map(row => {
      const amount = row.amount === null || row.amount === undefined ? null : Number(row.amount)
      const customFields = readCustomFields(row.crm_custom_fields)
      return {
        title: row.title?.trim() || null,
        stage: row.stage_label?.trim() || null,
        status: oneOf(CRM_MIRROR_DEAL_STATUSES, row.status),
        amount: amount !== null && Number.isFinite(amount) ? amount : null,
        currency: row.currency?.trim() || null,
        ownerName: row.owner_name?.trim() || null,
        updatedAt: iso(row.updated_at),
        // #4604.4 — absent (pas `[]`) quand le CRM n'en porte aucun : la réponse d'une affaire sans champ ne change pas.
        ...(customFields.length > 0 ? { customFields } : {}),
      }
    }),
    activities: (activityRows ?? []).flatMap(row => {
      const kind = oneOf(CRM_MIRROR_ACTIVITY_KINDS, row.kind)
      const occurredAt = iso(row.occurred_at)
      return kind && occurredAt ? [{ kind, occurredAt }] : []
    }),
    fields,
    ...(crmValues.length > 0 ? { crmValues } : {}),
    fusion: fusion && mergedAt ? { id: fusion.id, mergedAt, absorbedName: fusion.absorbed_name?.trim() ?? '' } : null,
  }
}
