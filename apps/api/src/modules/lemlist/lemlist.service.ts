import { lemlistLeadStatusesFromActivities } from '@bellum/contracts'
import type {
  LemlistCampaign,
  LemlistContactLead,
  LemlistCredentials,
  LemlistPushInput,
  LemlistPushResult,
  LemlistStatus,
} from '@bellum/contracts'
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { LemlistConnectionEntity } from '../../database/entities/lemlist-connection.entity'
import { LemlistLeadPushEntity } from '../../database/entities/lemlist-lead-push.entity'
import { decryptToken, encryptToken } from '../crm/crm-token.crypto'
import { OutboundWriteService } from '../crm/outbound-write.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { contactGestureWhere } from '../contacts/contact-gesture-scope'
import {
  LemlistApiError,
  createLeadInCampaign,
  listCampaigns,
  listLeadActivities,
  verifyKey,
  type LemlistLeadInput,
} from './lemlist.client'

const NOT_CONNECTED = "Lemlist n'est pas connecté à cet espace."

/**
 * #4427 — Lemlist : connexion par clé, poussée contrôlée, relecture des statuts.
 *
 * - **Clé par espace**, chiffrée, vérifiée AVANT d'être enregistrée (#4427.1).
 * - **Sans clé = no-op strict** : aucune route ne construit d'appel réseau.
 * - **Rien ne part seul** (#4427.2) : Laura prépare le contact, la personne
 *   choisit la campagne et clique ; l'écriture passe par la même porte que les
 *   écritures CRM (`OutboundWriteService`, auto-approuvée sur geste
 *   utilisateur, tracée). Aucun chemin `system` n'appelle `pushContact`.
 * - **Un statut que l'API n'expose pas n'est pas affiché** (#4427.3).
 */
@Injectable()
export class LemlistService {
  private readonly logger = new Logger(LemlistService.name)

  constructor(
    @InjectRepository(LemlistConnectionEntity)
    private readonly connections: Repository<LemlistConnectionEntity>,
    @InjectRepository(LemlistLeadPushEntity)
    private readonly pushes: Repository<LemlistLeadPushEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly outbound: OutboundWriteService,
  ) {}

  async status(userId: string): Promise<LemlistStatus> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const row = await this.connections.findOne({ where: { workspace_id: workspaceId } })
    return { connected: Boolean(row), connectedAt: row?.created_at?.toISOString() ?? null }
  }

  /** #4427.1 — refusée en démo, comme l'ATS : un prospect ne dépose pas la clé de son outil d'envoi. */
  async connect(userId: string, credentials: LemlistCredentials): Promise<LemlistStatus> {
    if (await this.workspaceContext.isDemoWorkspace(userId)) {
      throw new BadRequestException("La connexion de Lemlist est désactivée dans l'espace de démonstration.")
    }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    if ((await verifyKey(credentials.apiKey)) === 'rejected') {
      throw new BadRequestException('Lemlist a refusé cette clé d’API.')
    }
    const existing = await this.connections.findOne({ where: { workspace_id: workspaceId } })
    await this.connections.save(
      this.connections.create({
        ...(existing ? { id: existing.id } : {}),
        workspace_id: workspaceId,
        created_by: userId,
        credentials_enc: encryptToken(credentials.apiKey),
        last_used_at: null,
      }),
    )
    return this.status(userId)
  }

  async disconnect(userId: string): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.connections.delete({ workspace_id: workspaceId })
  }

  /** #4427.2 — les campagnes existantes, pour que la personne CHOISISSE. */
  async campaigns(userId: string): Promise<LemlistCampaign[]> {
    const { apiKey } = await this.requireKey(userId)
    return listCampaigns(apiKey)
  }

  /** #4427.2 — pousse un contact préparé dans la campagne choisie, par la porte d'écriture. */
  async pushContact(userId: string, input: LemlistPushInput): Promise<LemlistPushResult> {
    const { workspaceId, apiKey } = await this.requireKey(userId)
    const contact = await this.contacts.findOne({ where: contactGestureWhere(workspaceId, userId, input.contactId) })
    if (!contact) throw new NotFoundException(`Contact ${input.contactId} introuvable`)
    const lead = await this.toLead(contact)
    if (!lead) {
      throw new BadRequestException('Ce contact n’a ni e-mail ni profil LinkedIn : Lemlist ne peut pas l’ajouter.')
    }

    const decision = await this.outbound.request({
      workspaceId,
      userId,
      provider: 'lemlist',
      kind: 'enroll_sequence',
      payload: { ...lead, campaignId: input.campaignId },
      origin: 'user',
    })
    if (decision.decision !== 'write_now') {
      throw new BadRequestException('Cette demande est déjà en cours de traitement.')
    }

    let created: Awaited<ReturnType<typeof createLeadInCampaign>>
    try {
      created = await createLeadInCampaign(apiKey, input.campaignId, lead)
    } catch (error) {
      const response = error instanceof LemlistApiError ? `HTTP ${error.status}` : 'injoignable'
      await this.outbound.recordOutcome(decision.request.id, { ok: false, response })
      throw error
    }
    await this.outbound.recordOutcome(decision.request.id, {
      ok: true,
      response: created.leadId ?? created.outcome,
    })
    if (created.outcome === 'pushed') {
      await this.pushes.upsert(
        {
          workspace_id: workspaceId,
          contact_id: contact.id,
          pushed_by: userId,
          campaign_id: input.campaignId,
          campaign_name: created.campaignName,
          lead_id: created.leadId,
        },
        ['workspace_id', 'contact_id', 'campaign_id'],
      )
    }
    await this.connections.update({ workspace_id: workspaceId }, { last_used_at: new Date() })
    return {
      outcome: created.outcome,
      campaignId: input.campaignId,
      campaignName: created.campaignName,
      leadId: created.leadId,
    }
  }

  /**
   * #4427.3 — les statuts des leads poussés pour CE contact, relus à la demande.
   * Sans clé : aucune ligne et aucun appel.
   */
  async leadsForContact(userId: string, contactId: string): Promise<LemlistContactLead[]> {
    const access = await this.keyFor(userId)
    if (!access) return []
    const contact = await this.contacts.findOne({
      where: contactGestureWhere(access.workspaceId, userId, contactId),
    })
    if (!contact) throw new NotFoundException(`Contact ${contactId} introuvable`)
    const rows = await this.pushes.find({
      where: { workspace_id: access.workspaceId, contact_id: contactId },
      order: { created_at: 'DESC' },
    })
    return Promise.all(
      rows.map(async row => {
        let statuses: LemlistContactLead['statuses'] = null
        let readAt: Date | null = null
        let stale = false
        if (row.lead_id) {
          try {
            statuses = lemlistLeadStatusesFromActivities(
              await listLeadActivities(access.apiKey, row.campaign_id, row.lead_id),
            )
            readAt = new Date()
            // #4427.3 — le dernier statut relu et sa date sont GARDÉS : une relecture en échec ne les efface pas.
            await this.pushes
              .update({ id: row.id }, { last_statuses: statuses, statuses_read_at: readAt })
              .catch(() => undefined)
          } catch (error) {
            this.logger.warn('Relecture des statuts Lemlist impossible', {
              status: error instanceof LemlistApiError ? error.status : null,
            })
            if (row.last_statuses && row.statuses_read_at) {
              statuses = row.last_statuses as LemlistContactLead['statuses']
              readAt = new Date(row.statuses_read_at)
              stale = true
            }
          }
        }
        return {
          campaignId: row.campaign_id,
          campaignName: row.campaign_name,
          pushedAt: row.created_at.toISOString(),
          statuses,
          statusesReadAt: readAt ? readAt.toISOString() : null,
          statusesStale: stale,
        }
      }),
    )
  }

  private async keyFor(userId: string): Promise<{ workspaceId: string; apiKey: string } | null> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const row = await this.connections.findOne({ where: { workspace_id: workspaceId } })
    return row ? { workspaceId, apiKey: decryptToken(row.credentials_enc) } : null
  }

  private async requireKey(userId: string): Promise<{ workspaceId: string; apiKey: string }> {
    const access = await this.keyFor(userId)
    if (!access) throw new BadRequestException(NOT_CONNECTED)
    return access
  }

  /** Les champs documentés, depuis ce que la fiche SAIT — un champ absent n'est pas envoyé. */
  private async toLead(contact: ContactEntity): Promise<LemlistLeadInput | null> {
    if (!contact.email && !contact.linkedin_url) return null
    const [firstName, ...rest] = (contact.full_name ?? '').trim().split(/\s+/)
    const account = contact.account_id ? await this.accounts.findOne({ where: { id: contact.account_id } }) : null
    const domain = account?.website ? hostOf(account.website) : null
    return {
      ...(contact.email ? { email: contact.email } : {}),
      ...(firstName ? { firstName } : {}),
      ...(rest.length ? { lastName: rest.join(' ') } : {}),
      ...(contact.title ? { jobTitle: contact.title } : {}),
      ...(contact.linkedin_url ? { linkedinUrl: contact.linkedin_url } : {}),
      ...(contact.phone ? { phone: contact.phone } : {}),
      ...(account?.company_name ? { companyName: account.company_name } : {}),
      ...(domain ? { companyDomain: domain } : {}),
    }
  }
}

function hostOf(website: string): string | null {
  try {
    return new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}
