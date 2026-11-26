import type {
  AdminDocsCredentials,
  AdminDocsProvider,
  AdminDocsStatus,
  PendingSignature,
  ProposalSignatureStatus,
  UnpaidInvoice,
} from '@bellum/contracts'
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AdminDocsConnectionEntity } from '../../database/entities/admin-docs-connection.entity'
import { ProjectEntity } from '../../database/entities/project.entity'
import { decryptToken, encryptToken } from '../crm/crm-token.crypto'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { harvestList, normalizeInvoice, normalizeSignature } from './admin-docs-normalize'
import { activateSignatureRequest, fetchList, type AdminDocsAccess } from './admin-docs.client'

/**
 * L'administratif : ce qui attend une signature, ce qui n'a pas été payé.
 *
 * Les deux routines `contrats à signer` et `factures en souffrance` existaient
 * déjà mais ne lisaient que la messagerie : elles repéraient le mot « facture »
 * dans un fil, pas une facture réellement impayée. Ce service leur donne enfin
 * une source.
 *
 * La distinction qui traverse tout : **« rien à signaler » n'est pas « je n'ai
 * pas pu regarder »**. Un outil injoignable remonte dans `unavailable`, et
 * l'appelant peut le dire. Une routine qui annonce « aucune facture en retard »
 * parce qu'un serveur était en maintenance est pire que pas de routine du tout.
 */
@Injectable()
export class AdminDocsService {
  private readonly logger = new Logger(AdminDocsService.name)

  constructor(
    @InjectRepository(AdminDocsConnectionEntity)
    private readonly connections: Repository<AdminDocsConnectionEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projects: Repository<ProjectEntity>,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  async status(userId: string): Promise<AdminDocsStatus> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rows = await this.connections.find({ where: { workspace_id: workspaceId } })
    return { connected: rows.map(row => row.provider) }
  }

  /** Enregistre les identifiants d'un outil. Refusé en salle de démonstration. */
  async connect(userId: string, credentials: AdminDocsCredentials): Promise<AdminDocsStatus> {
    if (await this.workspaceContext.isDemoWorkspace(userId)) {
      throw new BadRequestException(
        'La connexion d’un outil de signature ou de facturation est désactivée dans l’espace de démonstration.',
      )
    }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const existing = await this.connections.findOne({
      where: { workspace_id: workspaceId, provider: credentials.provider },
    })
    await this.connections.save(
      this.connections.create({
        ...(existing ? { id: existing.id } : {}),
        workspace_id: workspaceId,
        created_by: userId,
        provider: credentials.provider,
        credentials_enc: encryptToken(`${credentials.apiKey}\n${credentials.apiSecret ?? ''}`),
        base_url: credentials.baseUrl ?? null,
      }),
    )
    return this.status(userId)
  }

  async disconnect(userId: string, provider: AdminDocsProvider): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.connections.delete({ workspace_id: workspaceId, provider })
  }

  /** Les signatures en attente, du silence le plus ancien au plus récent. */
  async pendingSignatures(userId: string): Promise<{ items: PendingSignature[]; unavailable: AdminDocsProvider[] }> {
    return this.collect(userId, 'signatures', (provider, raw, now) => normalizeSignature(provider, raw, now))
  }

  /** Les factures non réglées, la plus en retard d'abord. */
  async unpaidInvoices(userId: string): Promise<{ items: UnpaidInvoice[]; unavailable: AdminDocsProvider[] }> {
    const result = await this.collect(userId, 'invoices', (provider, raw, now) => normalizeInvoice(provider, raw, now))
    return {
      ...result,
      // Une échéance inconnue passe EN DERNIER plutôt que d'être triée comme
      // « pas en retard » : on ne sait pas, ce n'est pas la même chose.
      items: result.items.sort((a, b) => (b.daysOverdue ?? -Infinity) - (a.daysOverdue ?? -Infinity)),
    }
  }

  /**
   * Envoie à signature une demande DÉJÀ préparée chez le fournisseur.
   *
   * Bellum ne fabrique pas le document et ne le stocke pas : il déclenche
   * l'envoi d'une demande que quelqu'un a préparée et relue. C'est la borne qui
   * rend l'action acceptable — un document à valeur légale ne doit pas être
   * composé par un outil qui n'en porte pas la responsabilité.
   */
  async sendToSignature(
    userId: string,
    signatureRequestId: string,
    projectId?: string,
  ): Promise<{ ok: boolean; detail: string }> {
    const access = await this.accessFor(userId, 'yousign')
    if (!access) throw new BadRequestException('Aucun outil de signature connecté.')
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    if (projectId && !(await this.projects.findOne({ where: { id: projectId, workspace_id: workspaceId } }))) {
      throw new NotFoundException('Proposition introuvable.')
    }
    const outcome = await activateSignatureRequest(access, signatureRequestId)
    if (!outcome.ok) {
      this.logger.warn('Envoi à signature refusé par le fournisseur', { detail: outcome.detail })
      return outcome
    }
    // #4295.27 — l'identifiant est retenu À L'ENVOI, rattaché à la proposition : c'est lui que « Relire le statut » lira.
    if (projectId) {
      await this.projects.update(
        { id: projectId, workspace_id: workspaceId },
        {
          signature_request_id: signatureRequestId,
          signature_provider: 'yousign',
          signature_sent_at: new Date(),
          signature_status: null,
          signature_status_at: null,
        },
      )
    }
    return outcome
  }

  /**
   * #4295.27 (#4016.121) — le statut de LA demande de signature de CETTE proposition (l'identifiant retenu à l'envoi),
   * jamais la liste de tout le compte outil. « Signé » ne s'écrit que si l'outil liste la demande parmi les
   * terminées ; ni en cours ni terminée → `not_found` ; l'outil muet → `unread`. Le dernier statut relu et sa date
   * sont gardés sur la proposition.
   */
  async proposalSignatureStatus(userId: string, projectId: string): Promise<ProposalSignatureStatus> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const project = await this.projects.findOne({ where: { id: projectId, workspace_id: workspaceId } })
    if (!project) throw new NotFoundException('Proposition introuvable.')
    const requestId = project.signature_request_id
    const sentAt = project.signature_sent_at ? new Date(project.signature_sent_at).toISOString() : null
    const base = { signatureRequestId: requestId ?? null, sentAt, readAt: null, daysWaiting: null }
    if (!requestId) return { ...base, state: 'not_sent' }

    const provider = (project.signature_provider as AdminDocsProvider | null) ?? 'yousign'
    const access = await this.accessFor(userId, provider)
    const now = new Date()
    const [ongoing, done] = access
      ? await Promise.all([fetchList(access, 'signatures'), fetchList(access, 'signaturesDone')])
      : [null, null]
    if (ongoing === null || done === null) return { ...base, state: 'unread' }

    const listed = (payload: unknown) =>
      harvestList(payload).some(raw => normalizeSignature(provider, raw, now)?.id === requestId)
    const state: ProposalSignatureStatus['state'] = listed(done) ? 'signed' : listed(ongoing) ? 'pending' : 'not_found'
    await this.projects
      .update({ id: projectId, workspace_id: workspaceId }, { signature_status: state, signature_status_at: now })
      .catch(() => undefined)
    return {
      ...base,
      state,
      readAt: now.toISOString(),
      daysWaiting:
        state === 'pending' && sentAt
          ? Math.max(0, Math.floor((now.getTime() - Date.parse(sentAt)) / 86_400_000))
          : null,
    }
  }

  /** Interroge tous les outils branchés et distingue le vide de l'indisponible. */
  private async collect<T>(
    userId: string,
    kind: 'signatures' | 'invoices',
    normalize: (provider: AdminDocsProvider, raw: unknown, now: Date) => T | null,
  ): Promise<{ items: T[]; unavailable: AdminDocsProvider[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rows = await this.connections.find({ where: { workspace_id: workspaceId } })
    if (rows.length === 0) return { items: [], unavailable: [] }

    const now = new Date()
    const items: T[] = []
    const unavailable: AdminDocsProvider[] = []

    // Chaque outil est indépendant : une facturation en panne ne doit pas
    // effacer les signatures d'un autre fournisseur.
    await Promise.all(
      rows.map(async row => {
        const access = this.toAccess(row)
        const payload = await fetchList(access, kind)
        if (payload === null) {
          unavailable.push(row.provider)
          return
        }
        for (const raw of harvestList(payload)) {
          const normalized = normalize(row.provider, raw, now)
          if (normalized) items.push(normalized)
        }
      }),
    )

    return { items, unavailable }
  }

  private toAccess(row: AdminDocsConnectionEntity): AdminDocsAccess {
    const [apiKey, apiSecret] = decryptToken(row.credentials_enc).split('\n')
    return {
      provider: row.provider,
      apiKey: apiKey ?? '',
      apiSecret: apiSecret || null,
      baseUrl: row.base_url,
    }
  }

  private async accessFor(userId: string, provider: AdminDocsProvider): Promise<AdminDocsAccess | null> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const row = await this.connections.findOne({ where: { workspace_id: workspaceId, provider } })
    return row ? this.toAccess(row) : null
  }
}
