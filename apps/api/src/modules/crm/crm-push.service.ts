import { Injectable, NotFoundException, PreconditionFailedException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { In, IsNull, Repository } from 'typeorm'
import {
  crmSupports,
  dispatchFailureOutcome,
  type AccountCrmExport,
  type AccountCrmProvenance,
  type CrmPushPreview,
  type CrmPushRequest,
  type CrmPushResult,
  type CrmPushTarget,
  type CrmPushTargets,
  type CrmProvider,
} from '@bellum/contracts'
import { DEMO_CRM_PUSH_TARGETS } from '../demo/demo-dataset'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { recordContactCrmExport } from '../contacts/contact-crm-exports'
import { loadAccountCrmProvenance } from './account-crm-provenance'
import { crmCompanyRecordUrl, crmRecordUrl, type CrmConnectionForLink } from '../contacts/crm-record-url'
import type { CrmAdapter } from './adapter/crm-adapter'
import { CrmAdapterRegistry } from './adapter/crm-adapter.registry'
import { contactToCrmInput } from './contact-crm-mapper'
import { CrmWriteService, type CrmWriteOutcome } from './crm-write.service'
import { CrmService } from './crm.service'

/**
 * #4188 — « ce compte, je l'envoie sur mon CRM ; ces contacts, je les envoie »,
 * unitaire ET en lot, quel que soit le CRM branché.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS RÈGLES
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Deux temps.** La prévisualisation dit, élément par élément, ce qui sera
 *    créé, mis à jour, ce qui est déjà présent et ce qui est refusé (avec sa
 *    raison). Rien ne part avant la validation.
 * 2. **Jamais de doublon.** Un compte déjà envoyé porte sa RÉFÉRENCE EXTERNE
 *    (`account_crm_exports.crm_record_id`) : un second envoi ne réécrit pas la
 *    société. Côté CRM, chaque adaptateur retrouve avant de créer (nom exact
 *    pour une société, adresse pour une personne).
 * 3. **Par la porte.** Chaque élément passe par `CrmWriteService` (#4186) :
 *    sa propre demande, son propre résultat, groupés sous un `batchId` quand
 *    il y en a plusieurs — jamais un « tout envoyé » qui couvrirait un échec.
 *
 * L'écran nomme l'OUTIL que l'espace a branché ET `destination` (son espace CRM) :
 * la doctrine interdit de nommer NOS fournisseurs, pas l'outil du client (16/10/2026).
 *
 * PLUSIEURS CRM : `targets` liste ceux qui sont branchés ; `preview` et `push` visent
 * celui que `request.provider` désigne (absent = le principal : le premier branché
 * qui accepte l'écriture). L'écran appelle une fois par CRM coché — chacun passe par
 * la même porte, l'échec de l'un n'annule pas l'autre.
 */

type PushError = { status: 'error'; outcome: 'failed' | 'unknown'; expired?: boolean }

type Target = { adapter: CrmAdapter; destination: string | null }
type Listed = CrmPushTarget & { adapter: CrmAdapter | null }
type ExportRow = { entity_id: string; crm_record_id: string }

const NO_CRM = 'Aucun CRM n’est branché sur ton espace : branche-le dans Réglages › Intégrations.'
const NO_IDENTITY = 'Ni adresse e-mail ni nom complet : ton CRM ne saurait pas la retrouver.'
const NO_COMPANY = 'Ton CRM ne reçoit pas encore de sociétés depuis Bellum.'
const REJECTED = 'Ton CRM a refusé cette fiche — rien n’a été écrit. Vérifie-la puis réessaie.'
const NOT_CONNECTED = 'Ce CRM n’est pas branché sur ton espace : rien n’a été envoyé.'
const READ_ONLY =
  'Branché en lecture seule : le droit d’écriture n’a pas été accordé à cet outil. Reconnecte-le dans Réglages › Intégrations.'
const RECONNECT = 'L’autorisation de ton CRM a expiré : reconnecte-le dans Réglages › Intégrations, puis réessaie.'
const NO_ANSWER = 'Partie sans réponse de ton CRM : vérifie la fiche dans ton CRM avant de relancer.'

@Injectable()
export class CrmPushService {
  constructor(
    private readonly adapters: CrmAdapterRegistry,
    private readonly writes: CrmWriteService,
    private readonly hubspot: CrmService,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
  ) {}

  /** Ce qui partirait — sans rien écrire. */
  async preview(userId: string, request: CrmPushRequest): Promise<CrmPushPreview> {
    const workspaceId = await this.writes.workspaceOf(userId)
    const target = await this.resolveTarget(userId, request.provider)
    const provider = target.adapter.provider
    const { accounts, contacts } = await this.collect(workspaceId, request)
    const done = await this.existing(workspaceId, provider, accounts, contacts)
    const links = await this.connection(workspaceId, provider)
    const inCrm = await this.presentInCrm(userId, provider, accounts, done.accounts)
    const companyOf = await this.companyNames(workspaceId, contacts)

    return {
      provider,
      destination: target.destination,
      items: [
        ...accounts.map(account => {
          const seen = done.accounts.get(account.id)
          const found = !seen && inCrm.has(account.id)
          return {
            entity: 'account' as const,
            id: account.id,
            label: account.company_name,
            verdict: !crmSupports(provider, 'upsert_company')
              ? ('refused' as const)
              : seen || found
                ? ('already_present' as const)
                : ('create' as const),
            reason: crmSupports(provider, 'upsert_company') ? null : NO_COMPANY,
            crmRecordId: seen ?? null,
            recordUrl: seen ? crmCompanyRecordUrl(provider, seen, links) : null,
            // #4290.1 — les champs du MÊME payload que l'envoi (`push`), jamais une seconde construction.
            fields: crmSupports(provider, 'upsert_company') ? previewFields(accountPayload(account)) : [],
          }
        }),
        ...contacts.map(contact => {
          const seen = done.contacts.get(contact.id)
          const identified = hasIdentity(contact)
          return {
            entity: 'contact' as const,
            id: contact.id,
            label: contact.full_name,
            verdict: !identified ? ('refused' as const) : seen ? ('update' as const) : ('create' as const),
            reason: identified ? null : NO_IDENTITY,
            crmRecordId: seen ?? null,
            recordUrl: seen ? crmRecordUrl(provider, seen, links) : null,
            fields: identified ? previewFields(contactPayload(contact, companyOf.get(contact.account_id ?? ''))) : [],
          }
        }),
      ],
    }
  }

  /**
   * L.2 — l'aperçu consulte la MÊME règle de présence que le reste de l'espace (lecture seule) :
   * un compte déjà dans le CRM visé est « déjà présent », pas « sera créé ». La présence ne parle
   * que de HubSpot/Salesforce ; celle d'un autre CRM ne dit rien du CRM visé. Échec = inconnu.
   */
  private async presentInCrm(
    userId: string,
    provider: CrmProvider,
    accounts: AccountEntity[],
    exported: Map<string, string>,
  ): Promise<Set<string>> {
    const found = new Set<string>()
    if (provider !== 'hubspot' && provider !== 'salesforce') return found
    for (const account of accounts) {
      if (exported.has(account.id)) continue
      try {
        const domain = domainOf(account.website)
        const presence = await this.hubspot.findPresence(userId, {
          account: account.company_name,
          ...(domain ? { domain } : {}),
        })
        if (presence.matched && presence.provider === provider) found.add(account.id)
      } catch {
        // Inconnu : on ne dit pas « déjà présent » sur une lecture ratée.
      }
    }
    return found
  }

  /** L'envoi validé : chaque élément par la porte, chacun son résultat. */
  async push(userId: string, request: CrmPushRequest): Promise<CrmPushResult> {
    const workspaceId = await this.writes.workspaceOf(userId)
    const target = await this.resolveTarget(userId, request.provider)
    const provider = target.adapter.provider
    const { accounts, contacts } = await this.collect(workspaceId, request)
    const done = await this.existing(workspaceId, provider, accounts, contacts)
    const links = await this.connection(workspaceId, provider)
    const batchId = accounts.length + contacts.length > 1 ? randomUUID() : null
    const items: CrmPushResult['items'] = []
    const runner = this.accounts.manager

    for (const account of accounts) {
      const base = { entity: 'account' as const, id: account.id, label: account.company_name }
      const seen = done.accounts.get(account.id)
      if (seen) {
        items.push({
          ...base,
          outcome: 'already_present',
          reason: null,
          crmRecordId: seen,
          recordUrl: crmCompanyRecordUrl(provider, seen, links),
        })
        continue
      }
      const outcome = await this.attempt(() =>
        this.writes.write({
          userId,
          provider,
          kind: 'create_company',
          payload: accountPayload(account),
          origin: 'user',
          batchId,
        }),
      )
      if (outcome.status === 'written' || (outcome.status === 'already_done' && outcome.externalId)) {
        const crmRecordId = outcome.externalId as string
        const created = outcome.status === 'written' && outcome.created
        await recordAccountCrmExport(runner, {
          workspaceId,
          accountId: account.id,
          userId,
          provider,
          crmRecordId,
          created,
          destination: target.destination,
        })
        items.push({
          ...base,
          // Une société RETROUVÉE dans le CRM est rattachée, pas recréée : « déjà présente ».
          outcome: created ? 'created' : 'already_present',
          reason: null,
          crmRecordId,
          recordUrl: crmCompanyRecordUrl(provider, crmRecordId, links),
        })
      } else items.push({ ...base, ...notWritten(outcome) })
    }

    const companyOf = await this.companyNames(workspaceId, contacts)
    for (const contact of contacts) {
      const base = { entity: 'contact' as const, id: contact.id, label: contact.full_name }
      if (!hasIdentity(contact)) {
        items.push({ ...base, outcome: 'refused', reason: NO_IDENTITY, crmRecordId: null, recordUrl: null })
        continue
      }
      const company = contact.account_id ? companyOf.get(contact.account_id) : undefined
      const outcome = await this.attempt(() =>
        this.writes.write({
          userId,
          provider,
          kind: 'export_contact',
          // #3719.6 — l'entreprise exportée est celle du COMPTE identifié, jamais le libellé importé.
          payload: contactPayload(contact, company),
          origin: 'user',
          batchId,
        }),
      )
      if (outcome.status === 'written' || (outcome.status === 'already_done' && outcome.externalId)) {
        const crmRecordId = outcome.externalId as string
        const created = outcome.status === 'written' && outcome.created
        await recordContactCrmExport(runner, {
          contactId: contact.id,
          workspaceId,
          userId,
          provider,
          crm_record_id: crmRecordId,
          created,
          destination_label: target.destination,
        })
        items.push({
          ...base,
          outcome: created ? 'created' : 'updated',
          reason: null,
          crmRecordId,
          recordUrl: crmRecordUrl(provider, crmRecordId, links),
        })
      } else items.push({ ...base, ...notWritten(outcome) })
    }

    return { provider, destination: target.destination, batchId, items }
  }

  /** « Dans <CRM> » : où ce compte a été envoyé, avec le lien vers sa fiche. */
  async accountExports(userId: string, accountId: string): Promise<AccountCrmExport[]> {
    const workspaceId = await this.writes.workspaceOf(userId)
    const rows = (await this.accounts.manager.query(
      `SELECT e.provider, e.crm_record_id, e.last_action, e.destination_label, e.exported_at,
              c.external_account_id, c.instance_url
         FROM account_crm_exports e
         LEFT JOIN crm_connections c ON c.workspace_id = e.workspace_id AND c.provider = e.provider
        WHERE e.account_id = $1 AND e.workspace_id = $2
        ORDER BY e.exported_at DESC`,
      [accountId, workspaceId],
    )) as Array<{
      provider: AccountCrmExport['provider']
      crm_record_id: string
      last_action: AccountCrmExport['last_action']
      destination_label: string | null
      exported_at: Date | string
      external_account_id: string | null
      instance_url: string | null
    }>
    return (rows ?? []).map(row => ({
      provider: row.provider,
      crm_record_id: row.crm_record_id,
      last_action: row.last_action,
      destination_label: row.destination_label ?? null,
      exported_at: row.exported_at instanceof Date ? row.exported_at.toISOString() : String(row.exported_at),
      record_url: crmCompanyRecordUrl(row.provider, row.crm_record_id, {
        external_account_id: row.external_account_id ?? null,
        instance_url: row.instance_url ?? null,
      }),
    }))
  }

  /** #4459.2 — la provenance CRM de chaque contact du compte (`loadAccountCrmProvenance`). */
  async accountProvenance(userId: string, accountId: string): Promise<AccountCrmProvenance> {
    const workspaceId = await this.writes.workspaceOf(userId)
    // #4604 (craft n°9) — en salle, le miroir semé sous `demo` se lit comme le premier CRM fictif de la salle.
    const demo = (await this.hubspot.getStatus(userId)).demo === true
    const provenance = await loadAccountCrmProvenance(
      this.accounts.manager,
      accountId,
      workspaceId,
      demo ? { demoTool: DEMO_CRM_PUSH_TARGETS[0]?.provider } : {},
    )
    if (!provenance) throw new NotFoundException('Compte introuvable dans ton espace.')
    return provenance
  }

  /** Les CRM branchés de l'espace — ou, en salle de démonstration, les CRM fictifs. Le principal = le premier qui accepte l'écriture. */
  async targets(userId: string): Promise<CrmPushTargets> {
    const listed = await this.listTargets(userId)
    return { targets: listed.map(({ adapter: _adapter, ...target }) => target) }
  }

  private async listTargets(userId: string): Promise<Listed[]> {
    const status = await this.hubspot.getStatus(userId)
    const rows: Array<Omit<Listed, 'primary'>> = status.demo
      ? DEMO_CRM_PUSH_TARGETS.map(row => ({
          provider: row.provider,
          destination: row.destination,
          writable: row.writable,
          readOnlyReason: row.readOnlyReason,
          adapter: this.adapters.get(row.provider),
        }))
      : (await this.adapters.connected(userId)).map(row => {
          // Seul HubSpot dit ce que son jeton autorise ; un autre CRM branché est écrivable (jamais deviné lecture seule).
          const readOnly = row.adapter.provider === 'hubspot' && status.capabilities?.contactsWrite === false
          return {
            provider: row.adapter.provider,
            destination: row.accountLabel,
            writable: !readOnly,
            readOnlyReason: readOnly ? READ_ONLY : null,
            adapter: row.adapter,
          }
        })
    const principal = rows.findIndex(row => row.writable)
    return rows.map((row, index) => ({ ...row, primary: index === principal }))
  }

  /** Le CRM visé : celui demandé s'il est branché ET écrivable, sinon le principal. Jamais un repli sur un autre quand on en nomme un. */
  private async resolveTarget(userId: string, provider: CrmProvider | undefined): Promise<Target> {
    const listed = await this.listTargets(userId)
    if (listed.length === 0) throw new PreconditionFailedException(NO_CRM)
    const hit = provider ? listed.find(row => row.provider === provider) : listed.find(row => row.primary)
    if (!hit) throw new PreconditionFailedException(provider ? NOT_CONNECTED : READ_ONLY)
    if (!hit.writable || !hit.adapter) throw new PreconditionFailedException(hit.readOnlyReason ?? READ_ONLY)
    return { adapter: hit.adapter, destination: hit.destination }
  }

  /** Les comptes et contacts DE L'ESPACE — un identifiant d'un autre espace n'est ni lu ni nommé. */
  private async collect(
    workspaceId: string,
    request: CrmPushRequest,
  ): Promise<{ accounts: AccountEntity[]; contacts: ContactEntity[] }> {
    const accounts = request.accountIds.length
      ? await this.accounts.find({ where: { id: In(request.accountIds), workspace_id: workspaceId } })
      : []
    if (request.accountIds.length > 0 && accounts.length === 0) throw new NotFoundException('Compte introuvable.')
    const explicit = request.contactIds.length
      ? await this.contacts.find({
          where: { id: In(request.contactIds), workspace_id: workspaceId, deleted_at: IsNull() },
        })
      : []
    const ofAccounts =
      request.withAccountContacts && accounts.length > 0
        ? await this.contacts.find({
            where: { account_id: In(accounts.map(a => a.id)), workspace_id: workspaceId, deleted_at: IsNull() },
            take: 200,
          })
        : []
    const contacts = new Map<string, ContactEntity>()
    for (const contact of [...explicit, ...ofAccounts]) contacts.set(contact.id, contact)
    return { accounts, contacts: [...contacts.values()].slice(0, 200) }
  }

  /** Les références externes déjà connues pour ce CRM. */
  private async existing(
    workspaceId: string,
    provider: string,
    accounts: AccountEntity[],
    contacts: ContactEntity[],
  ): Promise<{ accounts: Map<string, string>; contacts: Map<string, string> }> {
    const read = async (table: 'account_crm_exports' | 'contact_crm_exports', column: string, ids: string[]) => {
      if (ids.length === 0) return new Map<string, string>()
      const rows = (await this.accounts.manager.query(
        `SELECT ${column} AS entity_id, crm_record_id FROM ${table}
          WHERE workspace_id = $1 AND provider = $2 AND ${column} = ANY($3::uuid[])`,
        [workspaceId, provider, ids],
      )) as ExportRow[]
      return new Map((rows ?? []).map(row => [row.entity_id, row.crm_record_id]))
    }
    return {
      accounts: await read(
        'account_crm_exports',
        'account_id',
        accounts.map(a => a.id),
      ),
      contacts: await read(
        'contact_crm_exports',
        'contact_id',
        contacts.map(c => c.id),
      ),
    }
  }

  /** Ce qu'il faut de la connexion pour composer un lien — jamais un jeton. */
  private async connection(workspaceId: string, provider: string): Promise<CrmConnectionForLink | null> {
    const rows = (await this.accounts.manager.query(
      `SELECT external_account_id, instance_url FROM crm_connections WHERE workspace_id = $1 AND provider = $2 LIMIT 1`,
      [workspaceId, provider],
    )) as CrmConnectionForLink[]
    return rows?.[0] ?? null
  }

  private async companyNames(workspaceId: string, contacts: ContactEntity[]): Promise<Map<string, string>> {
    const ids = [...new Set(contacts.map(c => c.account_id).filter((id): id is string => Boolean(id)))]
    if (ids.length === 0) return new Map()
    const rows = await this.accounts.find({ where: { id: In(ids), workspace_id: workspaceId } })
    return new Map(rows.map(row => [row.id, row.company_name]))
  }

  /** Une écriture qui lève est déjà CONSIGNÉE par la porte ; ici on la NOMME pour l'écran. */
  private async attempt(write: () => Promise<CrmWriteOutcome>): Promise<CrmWriteOutcome | PushError> {
    try {
      return await write()
    } catch (error) {
      return {
        status: 'error',
        outcome: dispatchFailureOutcome(error),
        expired: (error as { response?: { code?: unknown } } | null)?.response?.code === 'authorization_expired',
      }
    }
  }
}

function hasIdentity(contact: ContactEntity): boolean {
  const input = contactToCrmInput(contact)
  return Boolean(input.email || (input.firstName && input.lastName))
}

/** Le domaine d'un site CONNU (`https://www.acme.fr/` → `acme.fr`) ; rien d'inventé sinon. */
/** Le payload d'une société : ce que l'envoi écrit ET ce que la prévisualisation annonce. */
function accountPayload(account: AccountEntity): { name: string; domain?: string } {
  const domain = domainOf(account.website)
  return { name: account.company_name, ...(domain ? { domain } : {}) }
}

/** Le payload d'un contact — l'entreprise est celle du COMPTE identifié (#3719.6), jamais le libellé importé. */
function contactPayload(contact: ContactEntity, company: string | undefined): ReturnType<typeof contactToCrmInput> {
  return { ...contactToCrmInput(contact), ...(company ? { company } : {}) }
}

const PREVIEW_FIELD_ORDER = [
  'name',
  'domain',
  'email',
  'firstName',
  'lastName',
  'company',
  'jobTitle',
  'phone',
  'linkedinUrl',
] as const

/** #4290.1 — les champs RENSEIGNÉS d'un payload, dans l'ordre de l'écran (une valeur vide n'est jamais listée). */
function previewFields(payload: Record<string, unknown>): CrmPushPreview['items'][number]['fields'] {
  return PREVIEW_FIELD_ORDER.flatMap(field => {
    const value = payload[field]
    return typeof value === 'string' && value.trim() ? [{ field, value: value.trim() }] : []
  })
}

function domainOf(website: string | null | undefined): string | null {
  const raw = website?.trim()
  if (!raw) return null
  const host =
    raw
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split(/[/?#]/)[0]
      ?.toLowerCase() ?? ''
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : null
}

function notWritten(outcome: CrmWriteOutcome | PushError): {
  outcome: CrmPushResult['items'][number]['outcome']
  reason: string | null
  crmRecordId: null
  recordUrl: null
} {
  switch (outcome.status) {
    case 'refused':
      return { outcome: 'refused', reason: outcome.reason, crmRecordId: null, recordUrl: null }
    case 'pending':
      return { outcome: 'pending', reason: null, crmRecordId: null, recordUrl: null }
    case 'error':
      return {
        outcome: outcome.outcome,
        reason: outcome.outcome === 'unknown' ? NO_ANSWER : outcome.expired ? RECONNECT : REJECTED,
        crmRecordId: null,
        recordUrl: null,
      }
    default:
      return { outcome: 'failed', reason: REJECTED, crmRecordId: null, recordUrl: null }
  }
}

/** Consigne un compte envoyé : une ligne par (compte, CRM), mise à jour au second envoi. */
async function recordAccountCrmExport(
  runner: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: {
    workspaceId: string
    accountId: string
    userId: string
    provider: string
    crmRecordId: string
    created: boolean
    destination: string | null
  },
): Promise<void> {
  await runner.query(
    `INSERT INTO account_crm_exports
       (workspace_id, account_id, provider, crm_record_id, last_action, destination_label, exported_by, exported_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (account_id, provider) DO UPDATE SET
       crm_record_id = EXCLUDED.crm_record_id,
       last_action = EXCLUDED.last_action,
       destination_label = COALESCE(EXCLUDED.destination_label, account_crm_exports.destination_label),
       exported_by = EXCLUDED.exported_by,
       exported_at = EXCLUDED.exported_at`,
    [
      input.workspaceId,
      input.accountId,
      input.provider,
      input.crmRecordId,
      input.created ? 'created' : 'updated',
      input.destination,
      input.userId,
    ],
  )
}
