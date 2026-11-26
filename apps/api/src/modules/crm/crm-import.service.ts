import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { classifyProviderError } from '../../common/connector-error'
import { looksLikeEmailAddress, writableContactName } from '../contacts/contact-display-name'
import { isContactNameCollision } from '../contacts/contact-name-collision'
import { refusePlaceholderEmail } from '../contacts/placeholder-email'
import { In, Repository } from 'typeorm'
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import {
  CRM_TOOL_NAMES,
  applyFieldUpdates,
  decideSync,
  isStaleSinceHumanCorrection,
  summarizeSync,
  type KeepCrmValueInput,
  type IncomingRecord,
  type StartSyncInput,
  type SyncDecision,
  type SyncIndex,
  type SyncOutcome,
  type SyncProvider,
  type SyncRun,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { SyncLinkEntity } from '../../database/entities/sync-link.entity'
import { SyncRecordEventEntity } from '../../database/entities/sync-record-event.entity'
import { SyncRunEntity } from '../../database/entities/sync-run.entity'
import { ProvenanceService } from '../crm-core/provenance.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { normalizeSiren } from './crm-deal-account-link'
import {
  pickSameCompanyAccount,
  sameCompanyPrefilterToken,
  type SameCompanyCandidate,
} from '../accounts/same-company-account'

/**
 * L'index de l'import EN COURS — le contrat de décision, plus le droit de le
 * compléter au fil des lignes.
 *
 * `linkedInternalIds` est un `Set` mutable ici alors que le contrat ne promet
 * qu'un `ReadonlySet` : c'est délibéré. L'index vit avec l'import, et une fiche
 * rattachée à la ligne n devient « déjà liée » pour la ligne n+1 — sans quoi
 * deux lignes du même lot partageant une adresse seraient toutes deux
 * rattachées à la même fiche.
 */
type MutableSyncIndex = Omit<SyncIndex, 'linkedInternalIds'> & { linkedInternalIds: Set<string> }

/** Ce qu'un connecteur doit savoir faire pour être importable. */
export type CrmSource = {
  provider: SyncProvider
  /**
   * Une page de contacts, telle que le fournisseur la rend. `since` (ISO) : seulement ce qui
   * a bougé après (#4189) — absent, tout est relu.
   */
  listContacts(
    userId: string,
    limit: number,
    opts?: { since?: string },
  ): Promise<{ records: IncomingRecord[]; truncated: boolean }>
}

/** #4189 — les options d'un passage : la reprise incrémentale ne relit que ce qui a bougé. */
type CrmImportOptions = { since?: string }

/** Les fiches modifiées des deux côtés, comptées pendant le passage. */
type ConflictTally = { conflicts: number }

/** Une valeur de fiche rendue en texte pour la proposition ; vide = absente (jamais « 0 » ni « null »). */
/** #4189.9 — les champs qu'un écart peut proposer (ceux que `importContacts` / `importAccounts` protègent). */
const KEEPABLE_FIELDS: Record<'account' | 'contact', readonly string[]> = {
  account: ['company_name'],
  contact: ['email', 'full_name'],
}

/** J.6 — deux noms de société identiques à la casse et aux blancs près ; un nom absent n'est jamais « identique ». */
function sameName(current: string | undefined, incoming: string | null | undefined): boolean {
  const next = incoming?.trim().toLowerCase()
  return Boolean(next) && current?.trim().toLowerCase() === next
}

type JournalRow = QueryDeepPartialEntity<SyncRecordEventEntity>

/** Lignes de journal par INSERT — borne la taille de la requête (paramètres Postgres). */
const JOURNAL_CHUNK = 500

const asText = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)

/** Même valeur, au blanc et à la casse près ? (une valeur humaine IDENTIQUE à celle du CRM n'est pas un conflit) */
const sameValue = (a: unknown, b: unknown): boolean =>
  String(a ?? '')
    .trim()
    .toLowerCase() ===
  String(b ?? '')
    .trim()
    .toLowerCase()

/**
 * #2388.24 — même contrat que {@link CrmSource}, côté SOCIÉTÉS. Un type
 * distinct plutôt qu'une méthode optionnelle sur `CrmSource` : un appelant qui
 * lance une reprise de comptes ne doit pas pouvoir, par erreur de type, se voir
 * remettre une source qui ne sait lire que des contacts.
 */
export type CrmAccountSource = {
  provider: SyncProvider
  /** Une page de sociétés, telle que le fournisseur la rend (`since` : voir {@link CrmSource}). */
  listCompanies(
    userId: string,
    limit: number,
    opts?: { since?: string },
  ): Promise<{ records: IncomingRecord[]; truncated: boolean }>
}

/**
 * La REPRISE — importer un CRM existant sans doublonner ni écraser.
 *
 * Quatre propriétés, dans l'ordre où elles protègent :
 *
 * 1. **Simulation par défaut.** `dryRun` vaut `true` tant que personne ne dit le
 *    contraire : un import écrit seulement quand quelqu'un a VU ce qu'il allait
 *    faire. Le compte-rendu d'une simulation est enregistré comme les autres —
 *    c'est la trace qu'on a regardé avant d'écrire.
 * 2. **`sync_links` empêche le doublon.** Un identifiant externe déjà lié
 *    produit une mise à jour, jamais une création. C'est ce qui rend un import
 *    rejouable, et donc reprenable après une coupure.
 *
 *    ⚠️ Cette phrase a été FAUSSE pendant toute la vie de la table : le lien
 *    n'était jamais INSÉRÉ, seulement mis à jour — un `UPDATE` sur une ligne
 *    qui n'existait pas, donc rien. La table restait vide, et l'index de
 *    rattachement avec elle. Conséquence mesurée : la branche `update` était
 *    inatteignable, aucun champ de contact n'était jamais écrit par un import,
 *    et toute adresse déjà connue repartait en `already_linked_elsewhere` à
 *    chaque passage. Le lien est désormais posé à la PREMIÈRE résolution, avant
 *    toute écriture de champ (voir {@link CrmImportService.linkExternalRecord}).
 * 3. **La provenance est `connector`.** L'arbitre de T0 la place SOUS `human` :
 *    une correction faite à la main survit à tous les imports suivants, sans
 *    que l'import ait à le savoir. C'est la seule raison pour laquelle une
 *    cohabitation CRM/Bellum est tenable.
 * 4. **Un conflit n'est pas une fusion.** Deux lignes qui partagent une adresse
 *    sont ÉCARTÉES et journalisées : fusionner est irréversible côté CRM, et un
 *    faux positif détruit l'historique d'un vrai client.
 */
/**
 * #4446 — ce que le journal dit d'un import interrompu : le code du connecteur
 * quand l'erreur en porte un (`connectorFailure`), sinon le classement du
 * message. Un 401 / `invalid_grant` / « autorisation a expiré » est une
 * autorisation à refaire, jamais une panne.
 */
function importFailureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const response = error instanceof HttpException ? error.getResponse() : null
  const declared =
    response && typeof response === 'object' && typeof (response as { code?: unknown }).code === 'string'
      ? (response as { code: string }).code
      : null
  const code = declared ?? classifyProviderError(error)
  if (code === 'authorization_expired' || /\b401\b|unauthori[sz]ed|autorisation a expiré/i.test(message)) {
    return 'authorization_expired'
  }
  // IA-R (Sentry, 657 événements) — « répondu 404 à res.partner.search_read : l'instance n'expose pas … » :
  // l'instance du client ne publie pas ce modèle. Un ÉTAT du connecteur, jamais une panne de notre côté.
  if (/\b404\b[^]*n['’]expose pas/i.test(message)) return 'provider_endpoint_missing'
  return code
}

/** IA-R — la phrase dite sur /integrations quand l'instance n'expose pas les contacts (Odoo : `res.partner`). */
const ENDPOINT_MISSING_MESSAGE: Record<string, string> = {
  odoo: 'Ton instance Odoo n’expose pas les contacts : vérifie l’adresse branchée et le droit de lecture de la clé, ou rebranche l’instance.',
}

@Injectable()
export class CrmImportService {
  private readonly logger = new Logger(CrmImportService.name)

  constructor(
    @InjectRepository(SyncLinkEntity) private readonly links: Repository<SyncLinkEntity>,
    @InjectRepository(SyncRunEntity) private readonly runs: Repository<SyncRunEntity>,
    @InjectRepository(SyncRecordEventEntity) private readonly events: Repository<SyncRecordEventEntity>,
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    @Optional() private readonly provenance?: ProvenanceService,
  ) {}

  /**
   * Importe (ou simule) une page de contacts depuis une source.
   *
   * Le compte-rendu est enregistré DANS TOUS LES CAS, simulation comprise :
   * savoir qu'on a regardé, et ce qu'on a vu, fait partie de la reprise.
   */
  async importContacts(
    userId: string,
    source: CrmSource,
    input: StartSyncInput,
    options: CrmImportOptions = {},
  ): Promise<SyncOutcome> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)

    const run = await this.runs.save(
      this.runs.create({
        workspace_id: workspaceId,
        provider: source.provider,
        entity_type: 'contact',
        dry_run: input.dryRun,
        started_by: userId,
      }),
    )

    const tally: ConflictTally = { conflicts: 0 }
    const journal: JournalRow[] = []
    try {
      const fetched = await source.listContacts(
        userId,
        input.limit,
        options.since ? { since: options.since } : undefined,
      )
      // #4599.2 — la garde d'écriture couvre la synchro CRM : un gabarit (`prenom.nom@…`) venu du CRM est
      // retiré AVANT la décision, l'index et l'écriture (il rapprocherait sinon deux personnes sur la même fausse adresse).
      const page = {
        ...fetched,
        records: fetched.records.map(record => ({ ...record, email: refusePlaceholderEmail(record.email).email })),
      }
      const index = await this.buildIndex(workspaceId, source.provider)

      const decisions: { ref: string; decision: SyncDecision }[] = []
      const touched: string[] = []
      for (const record of page.records) {
        const decision = decideSync(record, index)
        decisions.push({ ref: record.externalId, decision })

        if (input.dryRun) {
          this.journal(journal, run.id, workspaceId, record, decision, null)
          continue
        }
        const internalId = await this.apply(userId, workspaceId, source.provider, record, decision, {
          runId: run.id,
          tally,
        })
        this.journal(journal, run.id, workspaceId, record, decision, internalId)
        // L'index vit avec l'import : sans ça, deux lignes du MÊME lot qui
        // partagent une adresse seraient toutes deux créées. `linkedInternalIds`
        // suit la même règle — la fiche que la ligne n vient de rattacher est
        // « déjà liée » pour la ligne n+1, qui devient donc le conflit qu'elle
        // est réellement plutôt qu'un second rattachement silencieux.
        if (internalId) {
          touched.push(internalId)
          index.byExternalId.set(record.externalId, internalId)
          index.linkedInternalIds.add(internalId)
          const email = record.email?.trim().toLowerCase()
          if (email) index.byEmail.set(email, internalId)
        }
      }

      await this.flushJournal(journal)
      if (!input.dryRun) await this.markImported(workspaceId, 'contact', touched, source.provider)
      const outcome = {
        ...summarizeSync(decisions, {
          provider: source.provider,
          entityType: 'contact',
          dryRun: input.dryRun,
          truncated: page.truncated,
        }),
        conflicts: tally.conflicts,
      }

      await this.runs.update(run.id, {
        created: outcome.created,
        updated: outcome.updated,
        skipped_count: outcome.skipped.length,
        truncated: outcome.truncated,
        conflict_count: tally.conflicts,
        finished_at: new Date(),
      })
      return outcome
    } catch (error) {
      const message = (error as Error).message
      // L'erreur du fournisseur est gardée TELLE QUELLE : « l'import a échoué »
      // n'aide personne, « 401 invalid_grant » se répare.
      await this.flushJournal(journal)
      await this.runs.update(run.id, { finished_at: new Date(), error: message })
      // #4446 — le message et le code fournisseur EN CLAIR (un `Error` sérialisé
      // part vide vers Sentry) ; une autorisation expirée est un geste attendu
      // de l'utilisateur, dit à l'écran (`unavailable`) — un warn, pas une panne.
      const code = importFailureCode(error)
      const expected = code === 'authorization_expired' || code === 'provider_endpoint_missing'
      this.logger[expected ? 'warn' : 'error'](`Import CRM interrompu: ${message}`, {
        message,
        code,
        tags: { 'sync.provider': source.provider },
      })
      return {
        provider: source.provider,
        entityType: 'contact',
        dryRun: input.dryRun,
        created: 0,
        updated: 0,
        skipped: [],
        truncated: false,
        unavailable: (code === 'provider_endpoint_missing' && ENDPOINT_MISSING_MESSAGE[source.provider]) || message,
      }
    }
  }

  /** L'historique des imports — simulations comprises. */
  async listRuns(userId: string, limit = 20): Promise<SyncRun[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rows = await this.runs.manager.query<
      (SyncRunEntity & { first_name: string | null; last_name: string | null; email: string | null })[]
    >(
      `SELECT r.*, p.first_name, p.last_name, p.email
         FROM sync_runs r
         LEFT JOIN profiles p ON p.user_id = r.started_by
        WHERE r.workspace_id = $1
        ORDER BY r.started_at DESC
        LIMIT $2`,
      [workspaceId, limit],
    )
    return rows.map(row => {
      const full = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
      return {
        id: row.id,
        provider: row.provider as SyncProvider,
        entityType: row.entity_type as SyncRun['entityType'],
        dryRun: row.dry_run,
        created: row.created,
        updated: row.updated,
        skippedCount: row.skipped_count,
        truncated: row.truncated,
        startedAt: new Date(row.started_at).toISOString(),
        finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
        startedByName: full || row.email || null,
        error: row.error,
      }
    })
  }

  /**
   * #2388.24 — la même REPRISE, côté SOCIÉTÉS.
   *
   * Contrairement aux contacts, une société n'a besoin d'aucun « compte de
   * rattachement » : la CRÉATION est donc branchée dès ce premier lot, pas
   * seulement journalisée en attente d'un geste humain. Le reste — simulation
   * par défaut, lien posé avant écriture, provenance `connector` sous `human` —
   * suit exactement la même doctrine que {@link importContacts}.
   */
  async importAccounts(
    userId: string,
    source: CrmAccountSource,
    input: StartSyncInput,
    options: CrmImportOptions = {},
  ): Promise<SyncOutcome> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)

    const run = await this.runs.save(
      this.runs.create({
        workspace_id: workspaceId,
        provider: source.provider,
        entity_type: 'account',
        dry_run: input.dryRun,
        started_by: userId,
      }),
    )

    const tally: ConflictTally = { conflicts: 0 }
    const journal: JournalRow[] = []
    // Le CRM source qui refuse ou ne répond pas est une dégradation attendue,
    // dite à l'écran (`unavailable`) ; une panne de NOTRE côté reste `error`.
    let sourceFailed = false
    try {
      const page = await source
        .listCompanies(userId, input.limit, options.since ? { since: options.since } : undefined)
        .catch((cause: unknown) => {
          sourceFailed = true
          throw cause
        })
      const index = await this.buildAccountIndex(workspaceId, source.provider)

      const decisions: { ref: string; decision: SyncDecision }[] = []
      const touched: string[] = []
      const currentNames = await this.currentAccountNames(page.records, index)
      for (const record of page.records) {
        const decided = decideSync(record, index)
        // #4603.11 — sens inverse : une société DÉJÀ ANALYSÉE (même SIREN, ou même nom normalisé) est reprise, jamais
        // doublée. Le CRM s'y rattache (lien posé), il ne réécrit pas le nom de l'analyse.
        const analysed = decided.action === 'create' ? await this.findAnalysedSameCompany(workspaceId, record) : null
        // J.6 — une fiche liée dont le nom n'a pas bougé est « inchangée », pas « à mettre à jour ».
        const decision: SyncDecision = analysed
          ? { action: 'update', internalId: analysed }
          : decided.action === 'update' && sameName(currentNames.get(decided.internalId), record.name)
            ? { action: 'skip', reason: 'unchanged' }
            : decided
        decisions.push({ ref: record.externalId, decision })

        if (input.dryRun) {
          this.journalAccount(journal, run.id, workspaceId, record, decision, null)
          continue
        }
        const internalId = await this.applyAccount(userId, workspaceId, source.provider, record, decision, {
          runId: run.id,
          tally,
          linkOnly: analysed !== null,
        })
        this.journalAccount(journal, run.id, workspaceId, record, decision, internalId)
        if (internalId) {
          touched.push(internalId)
          index.byExternalId.set(record.externalId, internalId)
          index.linkedInternalIds.add(internalId)
        }
      }

      await this.flushJournal(journal)
      if (!input.dryRun) await this.markImported(workspaceId, 'account', touched, source.provider)
      const outcome = {
        ...summarizeSync(decisions, {
          provider: source.provider,
          entityType: 'account',
          dryRun: input.dryRun,
          truncated: page.truncated,
        }),
        conflicts: tally.conflicts,
      }

      await this.runs.update(run.id, {
        created: outcome.created,
        updated: outcome.updated,
        skipped_count: outcome.skipped.length,
        truncated: outcome.truncated,
        conflict_count: tally.conflicts,
        finished_at: new Date(),
      })
      return outcome
    } catch (error) {
      const message = (error as Error).message
      await this.flushJournal(journal)
      await this.runs.update(run.id, { finished_at: new Date(), error: message })
      this.logger[sourceFailed ? 'warn' : 'error']('Import de sociétés interrompu', {
        error,
        tags: { 'sync.provider': source.provider },
      })
      return {
        provider: source.provider,
        entityType: 'account',
        dryRun: input.dryRun,
        created: 0,
        updated: 0,
        skipped: [],
        truncated: false,
        unavailable: message,
      }
    }
  }

  // ─────────────────────────────── interne ─────────────────────────────────

  /**
   * L'index de rattachement : les liens déjà posés, et les adresses déjà prises.
   *
   * Chargé UNE FOIS par import. Le reconstruire par ligne rendrait un import de
   * mille contacts quadratique.
   */
  private async buildIndex(workspaceId: string, provider: SyncProvider): Promise<MutableSyncIndex> {
    const linkRows = await this.links.find({
      where: { workspace_id: workspaceId, provider, entity_type: 'contact' },
      select: ['external_id', 'internal_id'],
    })
    const emailRows = await this.links.manager.query<{ email: string | null; id: string }[]>(
      // #1473 — en INNER, un contact à qualifier était INVISIBLE de l'index de
      // dédoublonnage : l'import suivant recréait la même personne une seconde
      // fois, et c'est ce doublon-là qu'on retrouve six mois plus tard sans
      // savoir lequel est à jour.
      `SELECT c.email, c.id
         FROM contacts c
         LEFT JOIN accounts a ON a.id = c.account_id
        WHERE (a.workspace_id = $1 OR (c.account_id IS NULL AND c.workspace_id = $1))
          AND c.email IS NOT NULL AND c.deleted_at IS NULL`,
      [workspaceId],
    )

    return {
      byExternalId: new Map(linkRows.map(row => [row.external_id, row.internal_id])),
      byEmail: new Map(
        emailRows.flatMap(row => (row.email ? [[row.email.trim().toLowerCase(), row.id] as const] : [])),
      ),
      // Les fiches DÉJÀ revendiquées par une ligne de ce CRM. C'est ce qui
      // sépare « première résolution » de « conflit » : sans cet ensemble, les
      // deux se ressemblent, et l'import a choisi le conflit pendant tout le
      // temps où `sync_links` est resté vide.
      linkedInternalIds: new Set(linkRows.map(row => row.internal_id)),
    }
  }

  /**
   * Applique une décision. Rend l'identifiant interne touché, ou `null`.
   *
   * HUBSPOT-J.5 — la CRÉATION d'un contact est branchée : SANS compte (`account_id` nul = « à qualifier »,
   * #1473), jamais rattaché au flair. Avant, la simulation annonçait « 200 à créer » et l'import réel ne
   * créait RIEN ni ne posait de lien : la simulation suivante redisait « 200 à créer », à l'infini. La fiche
   * créée est liée à l'identifiant externe (et son e-mail entre dans l'index du lot), donc le second passage
   * la compte en « mise à jour ».
   */
  private async apply(
    userId: string,
    workspaceId: string,
    provider: SyncProvider,
    record: IncomingRecord,
    decision: SyncDecision,
    ctx: { runId: string; tally: ConflictTally },
  ): Promise<string | null> {
    if (decision.action === 'create') return this.createContact(userId, workspaceId, provider, record)
    if (decision.action !== 'update') return null

    // LE LIEN D'ABORD, et sans condition.
    //
    // Il était posé en dernier, par un `UPDATE` — sur une ligne que personne
    // n'insérait jamais. Un `UPDATE` sur une table vide ne lève rien : la
    // déduplication d'import reposait donc sur une table vide pendant que le
    // docblock de cette classe affirmait le contraire. Et il était sauté dès
    // qu'il n'y avait aucun champ à écrire, c'est-à-dire exactement dans le cas
    // le plus fréquent d'un second import : rien n'a changé, donc rien à
    // rattacher — donc tout à refaire au suivant.
    await this.linkExternalRecord(workspaceId, provider, record.externalId, decision.internalId)

    const patch: Record<string, unknown> = {}
    if (record.email) patch['email'] = record.email.trim()
    // #4586 — un nom qui est une adresse ne remplace jamais le nom d'une fiche.
    if (record.name && !looksLikeEmailAddress(record.name)) patch['full_name'] = record.name.trim()
    if (Object.keys(patch).length === 0) return decision.internalId

    // La provenance `connector` place l'écriture SOUS `human` dans l'arbitre :
    // une correction faite à la main survit à tous les imports suivants.
    if (this.provenance) {
      const current = await this.provenance.currentSources('contact', decision.internalId)
      const humanFields = Object.keys(patch).filter(field => current[field] === 'human')
      if (humanFields.length > 0) {
        // #4189 — un champ corrigé à la main ET différent côté CRM = modifié des deux côtés : la
        // valeur humaine reste (elle gagne toujours), l'écart est COMPTÉ et journalisé.
        const row = await this.contacts.findOne({ where: { id: decision.internalId }, select: ['email', 'full_name'] })
        const conflicted = humanFields.filter(field => !sameValue(row?.[field as 'email' | 'full_name'], patch[field]))
        const proposal = Object.fromEntries(
          conflicted.map(field => [
            field,
            { bellum: asText(row?.[field as 'email' | 'full_name']), crm: asText(patch[field]) },
          ]),
        )
        for (const field of humanFields) delete patch[field]
        await this.recordConflict(
          ctx,
          workspaceId,
          'contact',
          record.externalId,
          decision.internalId,
          proposal,
          asText(row?.full_name),
        )
      }
    }
    if (Object.keys(patch).length === 0) return decision.internalId

    await this.updateToleratingNameCollision(decision.internalId, patch)
    return decision.internalId
  }

  /**
   * #4479 — `idx_contacts_account_normalized_name` : si le nom du CRM est déjà porté par une AUTRE fiche du
   * compte, il est écarté (jamais fusionné ici) et le reste du patch s'écrit. Une autre erreur remonte.
   */
  private async updateToleratingNameCollision(id: string, patch: Record<string, unknown>): Promise<void> {
    try {
      await this.contacts.update({ id }, patch)
    } catch (cause) {
      if (!isContactNameCollision(cause) || !('full_name' in patch)) throw cause
      const { full_name: _dropped, ...rest } = patch
      this.logger.warn(`Import CRM : nom déjà porté par une autre fiche du compte, nom écarté (contact ${id})`)
      if (Object.keys(rest).length > 0) await this.contacts.update({ id }, rest)
    }
  }

  /** J.5 — crée un contact « à qualifier » (sans compte) et le lie à son identifiant externe. */
  private async createContact(
    userId: string,
    workspaceId: string,
    provider: SyncProvider,
    record: IncomingRecord,
  ): Promise<string | null> {
    const email = record.email?.trim() || null
    // #4586 — jamais l'adresse pour nom : la partie locale lisible (marquée dérivée), sinon « à compléter ».
    if (!record.name?.trim() && !email) return null
    const { name: fullName, derived } = writableContactName(record.name, email)
    const created = await this.contacts.save(
      this.contacts.create({
        user_id: userId,
        workspace_id: workspaceId,
        account_id: null,
        full_name: fullName,
        email,
        source: 'crm',
        ...(derived ? { raw_data: { nameDerivedFromEmail: true } } : {}),
      }),
    )
    await this.linkExternalRecord(workspaceId, provider, record.externalId, created.id)
    return created.id
  }

  /**
   * Pose — ou rafraîchit — le lien entre l'identifiant externe et le nôtre.
   *
   * `ON CONFLICT` sur la clé unique `(espace, fournisseur, type, identifiant)`
   * plutôt qu'un `SELECT` suivi d'un `INSERT` : deux imports simultanés
   * passeraient tous deux le `SELECT`. C'est l'index unique qui tranche, comme
   * pour l'idempotence des runs de workflow.
   *
   * Best-effort assumé : le contact a pu être mis à jour juste avant, et faire
   * échouer l'import entier sur un lien non posé transformerait une reprise
   * partielle en reprise nulle. Ce qu'on perd alors est une résolution à
   * refaire au prochain passage, pas une donnée.
   */
  private async linkExternalRecord(
    workspaceId: string,
    provider: SyncProvider,
    externalId: string,
    internalId: string,
  ): Promise<void> {
    try {
      await this.links.manager.query(
        `INSERT INTO sync_links (workspace_id, provider, entity_type, external_id, internal_id, last_synced_at)
         VALUES ($1, $2, 'contact', $3, $4, now())
         ON CONFLICT (workspace_id, provider, entity_type, external_id)
         DO UPDATE SET last_synced_at = now()`,
        [workspaceId, provider, externalId, internalId],
      )
    } catch (error) {
      this.logger.warn(`Lien d'import non posé pour ${externalId}: ${(error as Error).message}`)
    }
  }

  /**
   * #4189 — une fiche modifiée des deux côtés. La valeur humaine reste ; le conflit est compté
   * (une fois par fiche) et journalisé avec les champs concernés. Best-effort comme tout le
   * journal : un blip d'écriture ne doit pas interrompre le passage.
   */
  /**
   * Théo D settings-integrations.N3 — « Garder la valeur Bellum » (onglet À relire) : le choix se RETIENT sur l'écart,
   * rien n'est écrit sur la fiche (la valeur gardée est déjà la nôtre). Sans cette trace, l'écart reviendrait à chaque
   * passage. Un champ absent de la proposition, ou un écart disparu, est refusé.
   */
  async keepBellumValue(userId: string, input: KeepCrmValueInput): Promise<{ field: string }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const event = await this.events.findOne({
      where: { id: input.eventId, workspace_id: workspaceId, action: 'conflict' },
    })
    if (!event?.proposal?.[input.field]) throw new NotFoundException('Cet écart n’existe plus.')
    const kept = event.kept_fields ?? []
    if (!kept.includes(input.field)) await this.events.update({ id: event.id }, { kept_fields: [...kept, input.field] })
    return { field: input.field }
  }

  /**
   * #4189.9 — « Garder la valeur du CRM » : la valeur annoncée par le CRM remplace la nôtre.
   *
   * Un GESTE utilisateur : la porte d'écriture est auto-approuvée (doctrine « une écriture passe par une
   * porte »), la modification est tracée en source `human` avec l'ancienne valeur (historique de la fiche).
   * Une correction humaine POSTÉRIEURE au passage qui a vu l'écart gagne toujours : on ne la réécrase jamais.
   * Un CRM qui n'annonce aucune valeur n'efface rien.
   */
  async keepCrmValue(userId: string, input: KeepCrmValueInput): Promise<{ field: string; value: string }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const event = await this.events.findOne({
      where: { id: input.eventId, workspace_id: workspaceId, action: 'conflict' },
    })
    const entry = event?.proposal?.[input.field]
    if (!event || !event.internal_id || !entry) throw new NotFoundException('Cet écart n’existe plus.')
    const crmValue = asText(entry.crm)
    if (!crmValue) throw new ConflictException('Le CRM n’annonce aucune valeur : la nôtre est gardée.')
    const entityType = event.entity_type === 'account' ? 'account' : 'contact'
    const column = (['company_name', 'email', 'full_name'] as const).find(
      field => field === input.field && KEEPABLE_FIELDS[entityType].includes(field),
    )
    if (!column) throw new NotFoundException('Ce champ ne se remplace pas depuis un écart.')

    const detailed = (await this.provenance?.currentSourcesDetailed(entityType, event.internal_id)) ?? {}
    const current = detailed[input.field]
    if (current?.source === 'human' && isStaleSinceHumanCorrection(event.created_at, current.observedAt)) {
      throw new ConflictException('Cette valeur a été corrigée à la main depuis le passage : la correction est gardée.')
    }

    const id = event.internal_id
    let previous: string | null
    if (column === 'company_name') {
      previous = asText((await this.accounts.findOne({ where: { id }, select: ['company_name'] }))?.company_name)
      await this.accounts.update({ id }, { company_name: crmValue })
    } else {
      const row = await this.contacts.findOne({ where: { id }, select: ['email', 'full_name'] })
      if (column === 'email') {
        previous = asText(row?.email)
        await this.contacts.update({ id }, { email: crmValue })
      } else {
        previous = asText(row?.full_name)
        await this.updateToleratingNameCollision(id, { full_name: crmValue })
      }
    }
    await this.provenance?.commit({
      workspaceId,
      entityType,
      entityId: event.internal_id,
      source: 'human',
      actorId: userId,
      changes: [{ field: column, oldValue: previous, newValue: crmValue }],
    })
    return { field: column, value: crmValue }
  }

  /**
   * #4051 — « Importé le <date> depuis <outil> » : une trace par fiche touchée, sous le nom de l'outil BRANCHÉ du
   * client (jamais un fournisseur à nous). Best-effort : une trace manquée ne fait jamais échouer un import.
   */
  private async markImported(
    workspaceId: string,
    entityType: 'contact' | 'account',
    entityIds: readonly string[],
    provider: string,
  ): Promise<void> {
    const tool = Object.entries(CRM_TOOL_NAMES).find(([key]) => key === provider)?.[1]
    if (!tool) return
    try {
      await this.provenance?.markImported({ workspaceId, entityType, entityIds, sourceKind: 'tool', sourceLabel: tool })
    } catch (error) {
      this.logger.warn(`Trace d'import non écrite (${entityType}): ${(error as Error).message}`)
    }
  }

  private async recordConflict(
    ctx: { runId: string; tally: ConflictTally },
    workspaceId: string,
    entityType: 'contact' | 'account',
    externalId: string,
    internalId: string,
    proposal: Record<string, { bellum: string | null; crm: string | null }>,
    entityLabel: string | null,
  ): Promise<void> {
    const fields = Object.keys(proposal)
    if (fields.length === 0) return
    ctx.tally.conflicts += 1
    try {
      await this.events.insert({
        run_id: ctx.runId,
        workspace_id: workspaceId,
        entity_type: entityType,
        external_id: externalId,
        internal_id: internalId,
        action: 'conflict',
        fields,
        proposal,
        entity_label: entityLabel,
        reason: 'human_correction_kept',
      })
    } catch (error) {
      this.logger.warn(`Journal de conflit non écrit pour ${externalId}: ${(error as Error).message}`)
    }
  }

  /** Le journal par enregistrement s'écrit par paquets : un INSERT multi-lignes, pas une transaction par ligne. */
  private async flushJournal(rows: JournalRow[]): Promise<void> {
    for (let i = 0; i < rows.length; i += JOURNAL_CHUNK) {
      const chunk = rows.slice(i, i + JOURNAL_CHUNK)
      try {
        await this.events.insert(chunk)
      } catch (error) {
        this.logger.warn(`Journal d'import non écrit (${chunk.length} ligne(s)): ${(error as Error).message}`)
      }
    }
  }

  /** Le journal par enregistrement — best-effort, jamais bloquant. */
  private journal(
    rows: JournalRow[],
    runId: string,
    workspaceId: string,
    record: IncomingRecord,
    decision: SyncDecision,
    internalId: string | null,
  ): void {
    const action =
      decision.action === 'create'
        ? 'created'
        : decision.action === 'update'
          ? 'updated'
          : decision.reason === 'already_linked_elsewhere'
            ? 'conflict'
            : 'skipped'
    rows.push({
      run_id: runId,
      workspace_id: workspaceId,
      entity_type: 'contact',
      external_id: record.externalId,
      internal_id: internalId ?? (decision.action === 'update' ? decision.internalId : null),
      action,
      fields: decision.action === 'update' ? ['email', 'full_name'] : [],
      reason: decision.action === 'skip' ? decision.reason : null,
    })
  }

  /**
   * L'index de rattachement des SOCIÉTÉS.
   *
   * Pas d'équivalent `byEmail` : une société n'a pas d'adresse qui l'identifie
   * de façon fiable, et faire correspondre par NOM produirait des faux
   * positifs (deux clients différents peuvent partager un nom commercial) —
   * exactement le risque que la doctrine anti-fusion écarte. Sans deuxième clé,
   * `decideSync` ne peut résoudre que par lien déjà posé ; le reste est une
   * création, jamais un rapprochement deviné.
   */
  private async buildAccountIndex(workspaceId: string, provider: SyncProvider): Promise<MutableSyncIndex> {
    const linkRows = await this.links.find({
      where: { workspace_id: workspaceId, provider, entity_type: 'account' },
      select: ['external_id', 'internal_id'],
    })
    return {
      byExternalId: new Map(linkRows.map(row => [row.external_id, row.internal_id])),
      byEmail: new Map(),
      linkedInternalIds: new Set(linkRows.map(row => row.internal_id)),
    }
  }

  /**
   * #4603.11 — le compte ANALYSÉ de la même société dans l'espace, ou `null`. La décision est celle de la prévention
   * (`pickSameCompanyAccount` : SIREN d'abord, puis la clé de nom partagée, serrures SIREN-différent et ambiguïté) ;
   * ce SQL ne fait que rétrécir la lecture. Seul un compte portant au moins un run d'analyse est repris — jamais une
   * autre fiche venue du CRM (deux clients peuvent partager un nom commercial). Échec de lecture : `null`, au pire
   * un doublon que le rattrapage ciblé (`AccountCrmFusionService`) ramasse.
   */
  private async findAnalysedSameCompany(workspaceId: string, record: IncomingRecord): Promise<string | null> {
    const companyName = record.name?.trim()
    if (!companyName) return null
    const siren = normalizeSiren(record.siren)
    const token = sameCompanyPrefilterToken(companyName)
    if (!siren && !token) return null
    try {
      const rows = await this.links.manager.query<SameCompanyCandidate[]>(
        `SELECT a.id, a.company_name, a.siren, a.status, a.updated_at,
                EXISTS (SELECT 1 FROM analysis_runs r WHERE r.account_id = a.id) AS has_runs
           FROM accounts a
          WHERE a.workspace_id = $1
            AND a.merged_into_id IS NULL
            AND a.status <> 'deleted'
            AND EXISTS (SELECT 1 FROM analysis_runs r WHERE r.account_id = a.id)
            AND (($2::text IS NOT NULL AND a.siren = $2::text)
                 OR ($3::text IS NOT NULL AND bellum_normalize_name(a.company_name) LIKE '%' || $3::text || '%'))
          LIMIT 50`,
        [workspaceId, siren, token],
      )
      const analysed = (rows ?? []).filter(row => row.has_runs)
      return pickSameCompanyAccount(analysed, { companyName, siren })?.account.id ?? null
    } catch (error) {
      this.logger.warn(`Reprise d'un compte analysé non cherchée (${record.externalId}): ${(error as Error).message}`)
      return null
    }
  }

  /** J.6 — le nom ACTUEL des sociétés déjà liées que cette page touche (une requête par page). */
  private async currentAccountNames(
    records: readonly IncomingRecord[],
    index: MutableSyncIndex,
  ): Promise<Map<string, string>> {
    const ids = [...new Set(records.flatMap(record => index.byExternalId.get(record.externalId) ?? []))]
    if (ids.length === 0) return new Map()
    const rows = await this.accounts.find({ where: { id: In(ids) }, select: ['id', 'company_name'] })
    return new Map(rows.map(row => [row.id, row.company_name]))
  }

  /**
   * Applique une décision de société. Contrairement aux contacts, la CRÉATION
   * est branchée : un compte n'a besoin d'aucun rattachement pour exister.
   */
  private async applyAccount(
    userId: string,
    workspaceId: string,
    provider: SyncProvider,
    record: IncomingRecord,
    decision: SyncDecision,
    ctx: { runId: string; tally: ConflictTally; linkOnly?: boolean },
  ): Promise<string | null> {
    if (decision.action === 'update') {
      await this.linkExternalAccountRecord(workspaceId, provider, record.externalId, decision.internalId)
      // #4603.11 — société déjà analysée : le lien suffit, le nom de l'analyse n'est pas réécrit par le CRM.
      if (ctx.linkOnly) return decision.internalId
      const name = record.name?.trim()
      if (!name) return decision.internalId

      // La provenance `connector` place l'écriture SOUS `human`, via le même
      // arbitre que le reste du dépôt (`applyFieldUpdates`) — pas une
      // réimplémentation à la main de sa décision (GA-131).
      const existing = await this.accounts.findOne({
        where: { id: decision.internalId },
        select: ['company_name'],
      })
      const currentSources = this.provenance ? await this.provenance.currentSources('account', decision.internalId) : {}
      // `''` et non `null` : la colonne est non nullable (`account.entity.ts`),
      // et une chaîne vide est déjà un blanc pour l'arbitre (`isBlank`) — même
      // décision, sans faire mentir le type de la colonne.
      const { accepted } = applyFieldUpdates({
        incoming: { company_name: name },
        incomingSource: 'connector',
        current: { company_name: existing?.company_name ?? '' },
        currentSources,
      })
      if (accepted.company_name === undefined) {
        // #4189 — refusé par l'arbitre parce que `human` gagne : si le nom diffère, c'est un conflit.
        if (currentSources['company_name'] === 'human' && !sameValue(existing?.company_name, name)) {
          await this.recordConflict(
            ctx,
            workspaceId,
            'account',
            record.externalId,
            decision.internalId,
            { company_name: { bellum: asText(existing?.company_name), crm: name } },
            asText(existing?.company_name),
          )
        }
        return decision.internalId
      }

      await this.accounts.update({ id: decision.internalId }, accepted)
      if (this.provenance) {
        await this.provenance.commit({
          workspaceId,
          entityType: 'account',
          entityId: decision.internalId,
          source: 'connector',
          actorId: null,
          changes: [
            { field: 'company_name', oldValue: existing?.company_name ?? null, newValue: accepted.company_name },
          ],
        })
      }
      return decision.internalId
    }

    if (decision.action === 'create') {
      const name = record.name?.trim()
      if (!name) return null
      // #4603 — la fiche naissait avec trois champs : sans `origin`, sans SIREN et au statut de colonne
      // `analyzing`, elle n'était candidate à AUCUN rapprochement, et analyser la même société créait un
      // second compte (deux « Veepee » en production, 26/10/2026). Elle porte désormais d'où elle vient,
      // qu'elle n'a jamais été analysée (`imported`), et le SIREN quand le CRM le porte — normalisé, ou rien.
      const created = await this.accounts.save(
        this.accounts.create({
          user_id: userId,
          workspace_id: workspaceId,
          company_name: name,
          origin: 'crm',
          status: 'imported',
          siren: normalizeSiren(record.siren),
        }),
      )
      await this.linkExternalAccountRecord(workspaceId, provider, record.externalId, created.id)
      // #4604 — la provenance PAR CHAMP de ce que le CRM vient d'écrire : c'est elle que la fiche lit pour dire
      // « vient de HubSpot » à côté de la valeur. Même arbitre que la mise à jour (`connector`, sous `human`).
      if (this.provenance) {
        await this.provenance.commit({
          workspaceId,
          entityType: 'account',
          entityId: created.id,
          source: 'connector',
          actorId: null,
          changes: [
            { field: 'company_name', oldValue: null, newValue: name },
            ...(created.siren ? [{ field: 'siren', oldValue: null, newValue: created.siren }] : []),
          ],
        })
      }
      return created.id
    }

    return null
  }

  /** Même discipline que {@link linkExternalRecord}, côté sociétés. */
  private async linkExternalAccountRecord(
    workspaceId: string,
    provider: SyncProvider,
    externalId: string,
    internalId: string,
  ): Promise<void> {
    try {
      await this.links.manager.query(
        `INSERT INTO sync_links (workspace_id, provider, entity_type, external_id, internal_id, last_synced_at)
         VALUES ($1, $2, 'account', $3, $4, now())
         ON CONFLICT (workspace_id, provider, entity_type, external_id)
         DO UPDATE SET last_synced_at = now()`,
        [workspaceId, provider, externalId, internalId],
      )
    } catch (error) {
      this.logger.warn(`Lien d'import (société) non posé pour ${externalId}: ${(error as Error).message}`)
    }
  }

  /** Le journal par société — best-effort, jamais bloquant. */
  private journalAccount(
    rows: JournalRow[],
    runId: string,
    workspaceId: string,
    record: IncomingRecord,
    decision: SyncDecision,
    internalId: string | null,
  ): void {
    const action =
      decision.action === 'create'
        ? 'created'
        : decision.action === 'update'
          ? 'updated'
          : decision.reason === 'already_linked_elsewhere'
            ? 'conflict'
            : 'skipped'
    rows.push({
      run_id: runId,
      workspace_id: workspaceId,
      entity_type: 'account',
      external_id: record.externalId,
      internal_id: internalId ?? (decision.action === 'update' ? decision.internalId : null),
      action,
      fields: action === 'created' || action === 'updated' ? ['company_name'] : [],
      reason: decision.action === 'skip' ? decision.reason : null,
    })
  }

  /** Un import sans source branchée doit le DIRE, pas rendre zéro ligne. */
  assertSource<T>(source: T | undefined): T {
    if (!source) {
      throw new BadRequestException(
        'Aucun CRM connecté pour cette source. Connecte-le dans Réglages › Intégrations avant de lancer une reprise.',
      )
    }
    return source
  }
}
