import type { CrmList, CrmSequence, PipelinePeriod, PipelineReport, ScoredLead } from '@bellum/contracts'
import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CrmDealFactEntity } from '../../database/entities/crm-deal-fact.entity'
import { CrmPipelineSyncEntity } from '../../database/entities/crm-pipeline-sync.entity'
import { SuppressionService } from '../mailer/suppression.service'
import { buildDemoCrmDeals } from '../demo/demo-crm-deals'
import { CrmDealAccountLinker } from './crm-deal-account-linker'
import { crmReadFailure, CrmService } from './crm.service'
import { HubspotDepthClient, type BatchUpsertOutcome, type ContactEngagement } from './hubspot-depth.client'
import { rankLeads } from './lead-score'
import { buildPipelineReport, type DealFact } from './pipeline-report'

/**
 * La profondeur CRM : pipeline calculé, listes, séquences, scoring, import.
 *
 * Un service distinct de `CrmService`, qui reste le gardien de la connexion et
 * des gestes de fiche. Celui-ci ne sait rien d'OAuth : il demande un jeton et
 * travaille. Retirer ce fichier ne casse ni l'export de contact ni la présence
 * CRM — c'est la règle d'indépendance des modules appliquée à l'intérieur d'un
 * module devenu grand.
 */

/** Au-delà, le cache est relu chez le fournisseur. Vingt-quatre heures parce
 *  qu'un pipeline se lit le matin et que la question posée — « où en est mon
 *  trimestre » — ne change pas d'une heure sur l'autre. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

/** Le fournisseur de la bêta. La colonne existe pour que Salesforce/Pipedrive
 *  s'ajoutent sans migration, comme `crm_connections` le fait déjà. */
const PROVIDER = 'hubspot'

/** Raison pour laquelle un contact n'a PAS été inscrit dans une séquence. */
type EnrollmentSkip = { contactId: string; reason: string }

export type EnrollmentOutcome = {
  sequenceId: string
  enrolled: string[]
  skipped: EnrollmentSkip[]
}

@Injectable()
export class CrmDepthService {
  private readonly logger = new Logger(CrmDepthService.name)
  private readonly client = new HubspotDepthClient()

  constructor(
    private readonly crm: CrmService,
    @InjectRepository(CrmDealFactEntity)
    private readonly facts: Repository<CrmDealFactEntity>,
    @InjectRepository(CrmPipelineSyncEntity)
    private readonly syncs: Repository<CrmPipelineSyncEntity>,
    // Le désabonnement CÔTÉ BELLUM. **Obligatoire**, et ce n'est pas un détail.
    //
    // Il était `@Optional()`, et son absence retombait sur `return false` —
    // c'est-à-dire « personne n'est désabonné ». Le seul chemin du produit qui
    // programme des envois dans un MOTEUR TIERS perdait donc son contrôle Bellum
    // en silence si l'injection manquait, alors que le `catch` juste en dessous
    // est correctement fail-closed. `CrmModule` importe `MailerModule` depuis
    // toujours : l'option ne servait qu'à un constructeur nu de test, et un
    // garde-fou qu'un test peut faire disparaître n'en est pas un.
    private readonly suppressions: SuppressionService,
    // #3918.a — rattache les deals relus à leurs comptes (id société, SIREN,
    // domaine — jamais le nom). Optionnel : un module sans lui garde son rapport.
    @Optional() private readonly dealAccounts?: CrmDealAccountLinker,
  ) {}

  // ---- Pipeline : lecture profonde, cache, rapport --------------------------

  /**
   * Relit l'historique des deals et remplace le cache de l'espace.
   *
   * Écriture par lots de 500 : un `upsert` de cinq mille lignes en une requête
   * dépasse la limite de paramètres de Postgres, et l'échec ne se voit qu'en
   * production sur le portail le plus gros.
   */
  async syncPipeline(userId: string): Promise<{ dealsRead: number; truncated: boolean; syncedAt: string }> {
    const { workspaceId, accessToken } = await this.crm.resolveAccess(userId)
    const { deals, truncated } = await this.client.readDealHistory(accessToken)

    const syncedAt = new Date()
    const rows = deals.map(deal => ({
      workspace_id: workspaceId,
      provider: PROVIDER,
      deal_id: deal.id,
      name: deal.name,
      stage: deal.stage,
      stage_label: deal.stageLabel,
      pipeline: deal.pipeline,
      amount: deal.amount == null ? null : String(deal.amount),
      owner_id: deal.ownerId,
      owner_name: deal.ownerName,
      deal_created_at: deal.createdAt ? new Date(deal.createdAt) : null,
      closed_at: deal.closedAt ? new Date(deal.closedAt) : null,
      last_activity_at: deal.lastActivityAt ? new Date(deal.lastActivityAt) : null,
      is_closed: deal.isClosed,
      is_won: deal.isWon,
      // #3918.a — les clés de jointure deal → compte, telles que lues.
      company_external_id: deal.companyExternalId ?? null,
      company_siren: deal.companySiren ?? null,
      company_domain: deal.companyDomain ?? null,
      company_name: deal.companyName ?? null,
      synced_at: syncedAt,
    }))

    for (let i = 0; i < rows.length; i += 500) {
      await this.facts.upsert(rows.slice(i, i + 500), ['workspace_id', 'provider', 'deal_id'])
    }

    // Les deals disparus du portail (supprimés, archivés) doivent quitter le
    // cache, sinon un pipeline « nettoyé » chez le client resterait gonflé chez
    // nous. On ne purge QUE si la lecture est complète : sur une lecture
    // tronquée, l'absence d'un deal ne prouve rien.
    if (!truncated && deals.length > 0) {
      await this.facts
        .createQueryBuilder()
        .delete()
        .where('workspace_id = :workspaceId', { workspaceId })
        .andWhere('provider = :provider', { provider: PROVIDER })
        .andWhere('deal_id NOT IN (:...ids)', { ids: deals.map(d => d.id) })
        .execute()
    }

    await this.syncs.upsert(
      {
        workspace_id: workspaceId,
        provider: PROVIDER,
        deals_read: deals.length,
        truncated,
        synced_at: syncedAt,
      },
      ['workspace_id', 'provider'],
    )

    // #3918.a — juste après la relecture : les deals de CET espace retrouvent
    // leur compte sans attendre le balayage du matin. Best-effort : un
    // rattachement en échec ne fait jamais échouer la synchronisation.
    try {
      await this.dealAccounts?.link(workspaceId)
    } catch (error) {
      this.logger.warn('Rattachement deal → compte en échec après synchronisation (non fatal)', {
        error: error instanceof Error ? error.message : String(error),
        workspaceId,
      })
    }

    if (truncated) {
      this.logger.warn('Lecture du pipeline arrêtée sur sa borne — le rapport le dit à l’écran', {
        workspaceId,
        dealsRead: deals.length,
      })
    }
    return { dealsRead: deals.length, truncated, syncedAt: syncedAt.toISOString() }
  }

  /** Les relectures du CRM en cours, par espace (P5, 29/09). */
  private readonly syncsInFlight = new Map<
    string,
    Promise<{ dealsRead: number; truncated: boolean; syncedAt: string }>
  >()

  /**
   * UNE seule relecture profonde à la fois par espace. `/pilotage` appelle le
   * rapport plusieurs fois en même temps (périodes, remontages) : quand le cache
   * dépasse un jour, CHAQUE appel relisait tout l'historique des deals chez le
   * CRM du client (appel sortant lent, quota du portail). Les appels concurrents
   * attendent la même promesse ; elle est oubliée dès qu'elle se termine, succès
   * ou échec — le cache reste donc rafraîchi à chaque fois qu'il est périmé.
   */
  private syncPipelineOnce(
    workspaceId: string,
    userId: string,
  ): Promise<{ dealsRead: number; truncated: boolean; syncedAt: string }> {
    const running = this.syncsInFlight.get(workspaceId)
    if (running) return running
    const started = this.syncPipeline(userId).finally(() => {
      this.syncsInFlight.delete(workspaceId)
    })
    this.syncsInFlight.set(workspaceId, started)
    return started
  }

  /**
   * Le rapport de pipeline. Synchronise d'abord si le cache a plus d'un jour.
   *
   * Une synchronisation qui échoue ne fait PAS échouer le rapport : on sert le
   * cache existant, avec sa date. Un rapport daté d'hier est utile ; une page
   * d'erreur ne l'est pas. En revanche un cache absent ET une lecture en échec
   * remontent l'erreur — servir un rapport vide se lirait « pipeline vide ».
   */
  async getPipelineReport(
    userId: string,
    options: { period: PipelinePeriod; refresh?: boolean },
  ): Promise<PipelineReport> {
    // R24 (15/10/2026) — la salle montre un CRM « branché » (/integrations) : le pipeline lit ses affaires de démonstration,
    // sans jeton ni synchro prétendue (`syncedAt` nul), au lieu de « Aucun CRM connecté ».
    if (await this.crm.isDemoUser(userId)) return this.demoPipelineReport(options.period)
    const { workspaceId } = await this.crm.resolveAccess(userId)
    const sync = await this.syncs.findOne({ where: { workspace_id: workspaceId, provider: PROVIDER } })
    const stale = !sync || Date.now() - sync.synced_at.getTime() > CACHE_TTL_MS

    let current = sync
    if (options.refresh || stale) {
      try {
        await this.syncPipelineOnce(workspaceId, userId)
        current = await this.syncs.findOne({ where: { workspace_id: workspaceId, provider: PROVIDER } })
      } catch (error) {
        // Sans cache antérieur, il n'y a RIEN à servir : on remonte l'échec
        // TRADUIT — « ton CRM ne nous a pas accordé cette donnée, reconnecte-le »
        // plutôt qu'un 500 opaque, qui a laissé cet écran mort en production
        // sans que rien n'indique le geste à faire.
        if (!sync) throw crmReadFailure(error)
        this.logger.warn('Synchronisation du pipeline en échec — le rapport sert le cache daté', {
          error: error instanceof Error ? error.message : String(error),
          workspaceId,
        })
      }
    }

    const rows = await this.facts.find({ where: { workspace_id: workspaceId, provider: PROVIDER } })
    const deals: DealFact[] = rows.map(row => ({
      id: row.deal_id,
      name: row.name,
      stage: row.stage,
      stageLabel: row.stage_label,
      pipeline: row.pipeline,
      amount: row.amount == null ? null : Number(row.amount),
      ownerId: row.owner_id,
      ownerName: row.owner_name,
      createdAt: row.deal_created_at ? row.deal_created_at.toISOString() : null,
      closedAt: row.closed_at ? row.closed_at.toISOString() : null,
      lastActivityAt: row.last_activity_at ? row.last_activity_at.toISOString() : null,
      isClosed: row.is_closed,
      isWon: row.is_won,
    }))

    return buildPipelineReport(deals, {
      now: new Date(),
      period: options.period,
      truncated: current?.truncated ?? false,
      syncedAt: current ? current.synced_at.toISOString() : null,
    })
  }

  private demoPipelineReport(period: PipelinePeriod): PipelineReport {
    const now = new Date()
    const deals: DealFact[] = buildDemoCrmDeals(now).facts.map(fact => ({
      id: fact.deal_id,
      name: fact.name,
      stage: fact.stage_label,
      stageLabel: fact.stage_label,
      pipeline: null,
      amount: Number(fact.amount),
      ownerId: null,
      ownerName: null,
      createdAt: fact.deal_created_at.toISOString(),
      closedAt: fact.closed_at ? fact.closed_at.toISOString() : null,
      lastActivityAt: fact.last_activity_at.toISOString(),
      isClosed: fact.is_closed,
      isWon: fact.is_won,
    }))
    return buildPipelineReport(deals, { now, period, truncated: false, syncedAt: null })
  }

  // ---- Listes ---------------------------------------------------------------

  async listLists(userId: string): Promise<CrmList[]> {
    const { accessToken } = await this.crm.resolveAccess(userId)
    return this.client.listLists(accessToken)
  }

  /**
   * Crée une liste statique et y verse des fiches.
   *
   * L'ajout est fait dans la foulée mais rendu SÉPARÉMENT : HubSpot ignore
   * silencieusement les identifiants qu'il ne connaît pas, si bien qu'une liste
   * peut se créer avec deux membres sur trente. Rendre « créée » sans dire
   * combien sont entrés laisserait croire que la liste est prête.
   */
  async createList(
    userId: string,
    input: { name: string; contactIds?: string[] },
  ): Promise<CrmList & { added: number }> {
    const { accessToken } = await this.crm.resolveAccess(userId)
    const list = await this.client.createStaticList(accessToken, input.name)
    const ids = input.contactIds ?? []
    if (ids.length === 0) return { ...list, added: 0 }
    const { added } = await this.client.addToList(accessToken, list.id, ids)
    return { ...list, size: added.length, added: added.length }
  }

  // ---- Séquences ------------------------------------------------------------

  async listSequences(userId: string): Promise<CrmSequence[]> {
    const { accessToken } = await this.crm.resolveAccess(userId)
    return this.client.listSequences(accessToken)
  }

  /**
   * Inscrit des contacts dans une séquence du CRM (arbitrage Louis du 03/08 :
   * « Bellum orchestre »).
   *
   * C'est le geste le plus risqué du lot : il programme des envois dans un
   * moteur qui n'est pas le nôtre. Trois garde-fous, dans cet ordre.
   *
   * 1. **Double opt-out.** Le désabonnement de Bellum ET celui du fournisseur
   *    sont vérifiés pour CHAQUE contact. Une personne qui s'est désabonnée
   *    d'un côté ne doit pas être rattrapée par l'autre : c'est exactement ce
   *    que le RGPD appelle un traitement qu'elle a refusé.
   * 2. **Borne dure.** Cinquante inscriptions par appel, comme l'envoi de masse.
   *    Un moteur tiers ne rend pas les envois plus réversibles.
   * 3. **Un contact à la fois, et l'échec n'arrête pas les autres** — mais
   *    chaque refus est nommé, jamais avalé.
   */
  async enrollInSequence(
    userId: string,
    input: { sequenceId: string; contactIds: string[]; senderEmail: string },
  ): Promise<EnrollmentOutcome> {
    const { workspaceId, accessToken } = await this.crm.resolveAccess(userId)
    const enrolled: string[] = []
    const skipped: EnrollmentSkip[] = []

    for (const contactId of input.contactIds.slice(0, 50)) {
      try {
        const state = await this.client.readContactState(accessToken, contactId)
        if (state === null) {
          skipped.push({ contactId, reason: 'Fiche introuvable dans le CRM' })
          continue
        }
        if (state.optedOut) {
          skipped.push({ contactId, reason: 'Désabonné dans le CRM' })
          continue
        }
        if (!state.email) {
          skipped.push({ contactId, reason: 'Fiche sans e-mail — rien à envoyer, et rien à rapprocher' })
          continue
        }
        if (await this.isSuppressedInBellum(workspaceId, state.email)) {
          skipped.push({ contactId, reason: 'Désabonné dans Bellum' })
          continue
        }
        const result = await this.client.enrollInSequence(accessToken, {
          sequenceId: input.sequenceId,
          contactId,
          senderEmail: input.senderEmail,
        })
        enrolled.push(result.id || contactId)
      } catch (error) {
        skipped.push({
          contactId,
          reason: error instanceof Error ? error.message : 'Inscription refusée par le CRM',
        })
      }
    }

    if (input.contactIds.length > 50) {
      skipped.push({ contactId: '—', reason: `${input.contactIds.length - 50} contact(s) au-delà de la borne de 50` })
    }
    return { sequenceId: input.sequenceId, enrolled, skipped }
  }

  /**
   * Le contact est-il désabonné CHEZ NOUS ?
   *
   * Une lecture en échec ne vaut jamais « il accepte » : sur un doute, on saute.
   * Un désabonnement raté ne se rattrape pas.
   */
  private async isSuppressedInBellum(workspaceId: string, email: string): Promise<boolean> {
    try {
      return await this.suppressions.isSuppressed(workspaceId, email)
    } catch {
      return true
    }
  }

  // ---- Scoring --------------------------------------------------------------

  /** Les leads classés par engagement (§13.3 n°8/11/35). */
  async scoreLeads(userId: string, limit = 25): Promise<ScoredLead[]> {
    const { accessToken } = await this.crm.resolveAccess(userId)
    const contacts: ContactEngagement[] = await this.client.readEngagement(accessToken)
    return rankLeads(contacts, limit)
  }

  // ---- Import en masse ------------------------------------------------------

  /** Écrit un lot de contacts dans le CRM, appariés par e-mail (§13.3 n°13). */
  async importContacts(
    userId: string,
    contacts: Array<{
      email: string
      firstName?: string
      lastName?: string
      company?: string
      jobTitle?: string
      phone?: string
    }>,
  ): Promise<BatchUpsertOutcome> {
    const { accessToken } = await this.crm.resolveAccess(userId)
    return this.client.batchUpsertContacts(accessToken, contacts)
  }

  /** Crée une société dans le CRM quand elle n'y est pas encore (§5.1). */
  async createCompany(
    userId: string,
    input: { name: string; domain?: string; industry?: string; city?: string },
  ): Promise<{ id: string; created: boolean }> {
    const { accessToken } = await this.crm.resolveAccess(userId)
    const existing = await this.crm.findCompanyIdFor(userId, { name: input.name, domain: input.domain })
    if (existing) return { id: existing, created: false }
    const created = await this.client.createCompany(accessToken, {
      name: input.name,
      domain: input.domain ?? null,
      industry: input.industry ?? null,
      city: input.city ?? null,
    })
    return { id: created.id, created: true }
  }
}
