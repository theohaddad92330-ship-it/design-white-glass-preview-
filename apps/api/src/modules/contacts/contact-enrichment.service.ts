import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { type Queue } from 'bullmq'
import { Repository } from 'typeorm'
import type { BulkVerifyOutcome, EnrichJobAccepted, EnrichJobStatus, EnrichmentCoordinate } from '@bellum/contracts'
import { failure, isFailure, isSuccess, success, type Result } from '@bellum/utils'
import { ContactEntity } from '../../database/entities/contact.entity'
import {
  CONTACT_ENRICHMENT_JOB_OPTIONS,
  CONTACT_ENRICHMENT_QUEUE,
  contactEnrichmentJobId,
  type ContactEnrichmentJobData,
  type ContactEnrichmentJobResult,
  type EnrichedContactPayload,
} from './contact-enrichment.queue'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { contactGestureWhere } from './contact-gesture-scope'
import { ContactsService, type ContactFailure } from './contacts.service'
import { ENRICHMENT_FAILURE_MESSAGES } from './enrichment-failure'

/** #AM.39 — jobs lus pour l'index « en cours » : une borne, jamais toute la file. */
const IN_FLIGHT_SCAN_LIMIT = 200

/** États BullMQ qui signifient « pas encore commencé ». */
const QUEUED_STATES = new Set(['waiting', 'waiting-children', 'delayed', 'prioritized'])

/**
 * Enrichissement contact en tâche de fond : mise en file + suivi.
 *
 * Ce qui reste SYNCHRONE, et doit le rester : les refus qu'on connaît sans
 * appeler personne (contact inconnu, cooldown d'idempotence, crédits épuisés).
 * L'utilisateur les apprend immédiatement, comme avant. Seule la cascade
 * fournisseur — la partie qui dure 30 à 85 s — part dans un job.
 *
 * Autonome au sens de la règle #7 : le retirer supprime la file et l'endpoint de
 * suivi, `ContactsService.enrichContact` (utilisé tel quel par le serveur MCP,
 * où l'appelant est un assistant qui peut attendre) continue de fonctionner.
 */
@Injectable()
export class ContactEnrichmentService {
  private readonly logger = new Logger(ContactEnrichmentService.name)

  constructor(
    @InjectQueue(CONTACT_ENRICHMENT_QUEUE) private readonly queue: Queue<ContactEnrichmentJobData>,
    @InjectRepository(ContactEntity) private readonly contactsRepo: Repository<ContactEntity>,
    private readonly contacts: ContactsService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /**
   * Vérifie ce qui est vérifiable tout de suite, puis met en file.
   *
   * Un job par contact : si une cascade est déjà en vol pour cette personne (deux
   * clics, deux onglets, un double-clic), on renvoie CE job au lieu d'en lancer un
   * second — deux cascades concurrentes coûteraient deux fois au fournisseur pour
   * une seule réponse utile. Un job terminé, lui, est retiré : son id doit
   * redevenir libre, sinon `add()` renverrait l'ancien résultat au clic suivant.
   */
  async enqueue(
    contactId: string,
    userId: string,
    dto: {
      first_name: string
      last_name?: string
      organization_name: string
      force?: boolean
      only?: EnrichmentCoordinate
      free?: boolean
    },
  ): Promise<Result<EnrichJobAccepted, ContactFailure>> {
    const accepted = await this.enqueueWithReservation(contactId, userId, dto, {})
    if (isFailure(accepted)) return accepted
    // Le corps 202 de l'écran reste EXACTEMENT celui d'avant : `reservation_attached`
    // ne concerne que les cartes de Laura.
    return success({ job_id: accepted.output.job_id, state: accepted.output.state })
  }

  /**
   * VÉRIFICATION EN MASSE (#2296.38 à .41, épopée #2964) — la même mise en
   * file que {@link enqueue}, contact par contact, jamais un seul appel qui
   * engloberait les cinquante. `force: true` : une vérification demandée
   * explicitement ignore le cooldown d'idempotence (qui ne visait que le clic
   * répété involontaire), sinon un lot de contacts déjà enrichis récemment ne
   * vérifierait RIEN.
   *
   * #2296.39 (« statut par contact ») : chaque ligne du tableau rendu porte
   * son propre `ok`/`code`, jamais un total. #2296.40 (« ne pas invalider le
   * lot pour des ambiguïtés ») : une entrée en échec (introuvable, écartée,
   * en cooldown malgré `force`, panne du fournisseur) est CONSIGNÉE et le
   * `for` continue — jamais un throw qui couperait les contacts suivants.
   * #2296.41 (« cas particulier d'un poste mondial ») : aucune branche ne lit
   * le périmètre ou l'entité du contact, un mondial suit le chemin des autres.
   */
  async enqueueBulk(contactIds: readonly string[], userId: string): Promise<BulkVerifyOutcome[]> {
    const outcomes: BulkVerifyOutcome[] = []
    for (const contactId of contactIds) {
      try {
        // #4803 — la clé de geste est l'ESPACE : un contact collecté par un collègue passe, celui d'un autre espace reste `not_found`.
        const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
        const contact = await this.contactsRepo.findOne({
          where: contactGestureWhere(workspaceId, userId, contactId),
        })
        if (!contact) {
          outcomes.push({ contact_id: contactId, ok: false, code: 'not_found' })
          continue
        }
        const [firstName, ...restName] = (contact.full_name ?? '').trim().split(/\s+/).filter(Boolean)
        const accepted = await this.enqueue(contactId, userId, {
          first_name: firstName || contact.full_name || '',
          ...(restName.length ? { last_name: restName.join(' ') } : {}),
          organization_name: contact.entity ?? '',
          force: true,
        })
        outcomes.push(
          isSuccess(accepted)
            ? { contact_id: contactId, ok: true, job_id: accepted.output.job_id, state: accepted.output.state }
            : { contact_id: contactId, ok: false, code: accepted.problem.code },
        )
      } catch {
        // Une panne inattendue sur CE contact ne dit rien des autres — comptée,
        // jamais avalée, jamais propagée (même discipline que `enrichSelectedContacts`
        // côté web pour l'enrichissement en masse existant).
        outcomes.push({ contact_id: contactId, ok: false, code: 'enrichment_unavailable' })
      }
    }
    return outcomes
  }

  /**
   * #1931 L2 (D4, I3) — la même mise en file, pour une carte de Laura qui a
   * RÉSERVÉ son crédit au clic : la référence voyage avec le job, et son worker
   * la solde au moment où il observe le débit.
   *
   * Ajout minimal au service (dit dans le rapport L2) : `enqueue` passe
   * désormais par ici avec des options vides, chemin identique.
   *
   * `reservation_attached` dit si le job PORTERA la référence. Une recherche
   * déjà en file pour ce contact la reçoit (`updateData` : le worker ne lit ses
   * données qu'au démarrage) ; une recherche déjà ACTIVE, non — ses données
   * sont déjà lues. L'appelant le sait et le dit, au lieu de croire que la
   * réservation sera soldée.
   */
  async enqueueWithReservation(
    contactId: string,
    userId: string,
    dto: {
      first_name: string
      last_name?: string
      organization_name: string
      force?: boolean
      only?: EnrichmentCoordinate
      free?: boolean
    },
    opts: { reservationReference?: string; reservationWorkspaceId?: string },
  ): Promise<Result<EnrichJobAccepted & { reservation_attached: boolean }, ContactFailure>> {
    // R4 — une référence n'est attachée qu'avec SON espace : sans lui, le worker ne
    // pourrait pas la solder dans le bon espace, et elle expirera d'elle-même.
    const reservation =
      opts.reservationReference && opts.reservationWorkspaceId
        ? { reservationReference: opts.reservationReference, reservationWorkspaceId: opts.reservationWorkspaceId }
        : null
    const preflight = await this.contacts.preflightEnrichment(contactId, userId, { force: dto.force, free: dto.free })
    if (isFailure(preflight)) return preflight

    const jobId = contactEnrichmentJobId(contactId)
    const existing = await this.queue.getJob(jobId)
    if (existing) {
      const state = await existing.getState()
      if (state === 'active') return success({ job_id: jobId, state: 'running', reservation_attached: false })
      if (QUEUED_STATES.has(state)) {
        if (reservation) {
          await existing.updateData({ ...existing.data, ...reservation })
        }
        return success({ job_id: jobId, state: 'queued', reservation_attached: Boolean(reservation) })
      }
      // Terminé (completed/failed) : la place est libérée pour cette tentative.
      await existing.remove()
    }

    await this.queue.add(
      'enrich',
      {
        contactId,
        userId,
        first_name: dto.first_name,
        ...(dto.last_name ? { last_name: dto.last_name } : {}),
        organization_name: dto.organization_name,
        ...(dto.force ? { force: true } : {}),
        ...(dto.only ? { only: dto.only } : {}),
        ...(dto.free ? { free: true } : {}),
        ...(reservation ?? {}),
      },
      { ...CONTACT_ENRICHMENT_JOB_OPTIONS, jobId },
    )
    return success({ job_id: jobId, state: 'queued', reservation_attached: Boolean(reservation) })
  }

  /**
   * État du job d'enrichissement de ce contact.
   *
   * Un échec est rendu comme l'échec typé d'origine (`ContactFailure`), pas comme
   * un état : le contrôleur le rejoue en statut HTTP, si bien que le client garde
   * exactement le chemin d'erreur — et les messages localisés par `code` — qu'il
   * avait quand l'appel était synchrone.
   */
  async status(
    contactId: string,
    userId: string,
  ): Promise<Result<EnrichJobStatus<EnrichedContactPayload>, ContactFailure>> {
    // #4609.3 — portée ESPACE (lecture seule) : on ne révèle pas l'état d'un enrichissement sur le contact d'un
    // AUTRE espace, mais celui d'un collègue — que la liste affiche — se lit (`user_id` seul rendait un 404).
    if (!(await this.contacts.canReadContact(contactId, userId)))
      return failure({ code: 'not_found', message: `Contact ${contactId} not found` })

    const jobId = contactEnrichmentJobId(contactId)
    const job = await this.queue.getJob(jobId)
    // Aucune trace : le résultat a expiré (ou Redis a été vidé). On ne l'appelle
    // pas « rien trouvé » — c'est nous qui avons perdu la réponse.
    if (!job) return success({ state: 'unknown', job_id: jobId })

    const state = await job.getState()
    if (state === 'active') return success({ state: 'running', job_id: jobId })
    if (QUEUED_STATES.has(state)) return success({ state: 'queued', job_id: jobId })

    if (state === 'completed') {
      const outcome = job.returnvalue as ContactEnrichmentJobResult | undefined
      if (outcome?.ok === true) return success({ state: 'done', job_id: jobId, result: outcome.contact })
      if (outcome?.ok === false) return failure(outcome.failure)
      // Terminé sans valeur de retour exploitable : anormal, et sûrement pas une
      // information sur le contact.
      this.logger.error('Enrichment job completed without a usable result', { contactId, jobId })
      return failure({
        code: 'enrichment_unavailable',
        message: ENRICHMENT_FAILURE_MESSAGES.upstream_error,
        reason: 'upstream_error',
      })
    }

    // `failed` = le worker a levé (panne d'infra). L'utilisateur doit lire « le
    // fournisseur est indisponible, réessaie », jamais « aucune donnée trouvée » :
    // notre panne n'est pas un fait sur le marché.
    this.logger.warn('Enrichment job failed', { contactId, jobId, state })
    return failure({
      code: 'enrichment_unavailable',
      message: ENRICHMENT_FAILURE_MESSAGES.upstream_error,
      reason: 'upstream_error',
    })
  }

  /**
   * #AM.39 (#4063) — L'INDEX léger des enrichissements EN COURS de cet utilisateur : les contacts dont un job attend
   * ou tourne, avec la coordonnée ciblée quand il y en a une. Choix : on lit la FILE (BullMQ), qui est déjà la source
   * de vérité de « en vol » — ni table neuve, ni clé Redis à tenir synchrone (un second index divergerait du job).
   * Lecture bornée, portée à l'utilisateur ; elle alimente la liste /contacts et tous les chemins d'enrichissement,
   * au lieu d'une sonde `GET :id/enrichment` par fiche. Un contact absent n'est pas « terminé » : il n'est pas en vol.
   */
  async inFlight(userId: string): Promise<Array<{ contactId: string; only?: EnrichmentCoordinate }>> {
    const jobs = await this.queue.getJobs(['waiting', 'active', 'delayed', 'prioritized'], 0, IN_FLIGHT_SCAN_LIMIT)
    const seen = new Set<string>()
    const out: Array<{ contactId: string; only?: EnrichmentCoordinate }> = []
    for (const job of jobs) {
      const data = job?.data
      if (!data || data.userId !== userId || seen.has(data.contactId)) continue
      seen.add(data.contactId)
      out.push(data.only ? { contactId: data.contactId, only: data.only } : { contactId: data.contactId })
    }
    return out
  }
}
