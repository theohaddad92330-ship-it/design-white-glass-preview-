import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { type Job } from 'bullmq'
import { isFailure } from '@bellum/utils'
import { CREDIT_RESERVATION_SETTLER, type CreditReservationSettler } from '../action-os/credit-reservation.port'
import {
  CONTACT_ENRICHMENT_QUEUE,
  type ContactEnrichmentJobData,
  type ContactEnrichmentJobResult,
} from './contact-enrichment.queue'
import { ContactsService } from './contacts.service'
import { EmailEstimateService } from './email-estimate.service'
import { Correlated } from '../../correlation-id/background-correlation'

/**
 * Plusieurs enrichissements à la fois (ce sont des clics d'utilisateurs, pas une
 * tâche de fond), mais pas une horde : le débit réel est de toute façon borné en
 * amont par le throttle Apollo partagé. Le verrou dure plus longtemps que le pire
 * cas de la cascade — 60 s côté IA + ~24 s de polling Dropcontact — sinon un job
 * lent-mais-vivant serait déclaré perdu et son résultat payé jeté.
 */
const WORKER_OPTIONS = {
  concurrency: 4,
  lockDuration: 180_000,
}

/** #4016 L4.1 — les refus après lesquels l'e-mail ESTIMÉ a encore un sens : la
 *  cascade n'a rien ramené de neuf, ou le fournisseur ne répond pas. Jamais
 *  après un refus d'accès, une opposition ou une fiche introuvable. */
const ESTIMATE_AFTER_FAILURES: ReadonlySet<string> = new Set(['enrichment_unchanged', 'enrichment_unavailable'])

/**
 * Exécute une cascade d'enrichissement mise en file.
 *
 * Aucune logique métier ici : le worker appelle
 * {@link ContactsService.enrichContact}, c'est-à-dire EXACTEMENT le chemin qui
 * servait la requête synchrone (et qui sert encore le serveur MCP). Débit du
 * crédit, garanties d'idempotence, cascade multi-fournisseurs, journal du cycle
 * de vie : tout reste là-bas, en un seul exemplaire.
 *
 * #1931 L2 (I3) — une seule chose de plus : quand le job porte la réservation
 * posée au clic d'une carte, le worker la SOLDE dans la même exécution que le
 * débit — consommée si un débit a été observé, libérée sinon. Sans cela, un
 * onglet fermé laissait le crédit compté deux fois (réservé ET débité) jusqu'à
 * l'expiration de la réservation.
 */
@Processor(CONTACT_ENRICHMENT_QUEUE, WORKER_OPTIONS)
@Injectable()
export class ContactEnrichmentWorker extends WorkerHost {
  private readonly logger = new Logger(ContactEnrichmentWorker.name)

  constructor(
    private readonly contacts: ContactsService,
    // Ajouté EN FIN, optionnel : le bouton de l'écran ne réserve rien, et un
    // module qui n'a pas Action OS continue d'enrichir exactement comme avant.
    @Optional()
    @Inject(CREDIT_RESERVATION_SETTLER)
    private readonly settler?: CreditReservationSettler,
    // #4016 L4.1 — ajouté EN FIN, optionnel : sans lui, l'enrichissement répond
    // exactement comme avant.
    @Optional()
    private readonly emailEstimate?: EmailEstimateService,
  ) {
    super()
  }

  @Correlated('worker:contact-enrichment')
  async process(job: Job<ContactEnrichmentJobData>): Promise<ContactEnrichmentJobResult> {
    const { contactId, userId, first_name, last_name, organization_name, force, only, free } = job.data
    const { reservationReference, reservationWorkspaceId } = job.data

    let outcome: ContactEnrichmentJobResult
    try {
      const result = await this.contacts.enrichContact(contactId, userId, {
        first_name,
        ...(last_name ? { last_name } : {}),
        organization_name,
        ...(force ? { force: true } : {}),
        // #2988 — relais du filtre par coordonnée : sans lui, `only` s'arrête
        // au job et le chemin réel (débit, écriture) reste inchangé.
        ...(only ? { only } : {}),
        ...(free ? { free: true } : {}),
      })

      // Un « non » motivé est une RÉPONSE, pas un incident : on le rend en valeur.
      // Le lever ferait de BullMQ le juge d'un échec métier — job failed, bruit dans
      // les métriques — et surtout ferait perdre le `code`/`reason` typé dont le
      // client a besoin pour dire la vérité à l'utilisateur.
      if (isFailure(result)) {
        this.logger.log('Enrichment job finished without a match', {
          contactId,
          code: result.problem.code,
        })
        outcome = { ok: false, failure: result.problem }
      } else {
        outcome = { ok: true, contact: result.output }
      }
    } catch (error) {
      // La cascade a levé AVANT tout débit (le débit est la dernière écriture de
      // `enrichContact`) : la réservation ne sera jamais dépensée.
      await this.settle(reservationWorkspaceId, reservationReference, 'released')
      throw error
    }

    const debited = outcome.ok ? (outcome.contact.credits_debited ?? 0) : 0
    await this.settle(reservationWorkspaceId, reservationReference, debited > 0 ? 'consumed' : 'released')
    return this.estimateMissingEmail(contactId, reservationWorkspaceId, only, outcome)
  }

  /**
   * #4016 L4.1 — la cascade payante n'a pas trouvé d'adresse : Bellum tente
   * l'e-mail ESTIMÉ (motif de l'entreprise, vérifié MX + SMTP). Gratuit, borné
   * par `EMAIL_ESTIMATE_PROBE_TIMEOUT_MS`, et toutes les portes RGPD vivent
   * dans `EmailEstimateService`. Best-effort : une estimation qui échoue ne
   * touche jamais au résultat de l'enrichissement payé.
   */
  private async estimateMissingEmail(
    contactId: string,
    reservationWorkspaceId: string | undefined,
    only: ContactEnrichmentJobData['only'],
    outcome: ContactEnrichmentJobResult,
  ): Promise<ContactEnrichmentJobResult> {
    if (!this.emailEstimate || only === 'phone') return outcome
    const missing = outcome.ok
      ? !(outcome.contact.email ?? '').trim()
      : ESTIMATE_AFTER_FAILURES.has(outcome.failure.code)
    // La borne d'espace (#2671.5) : celle de la fiche que la cascade vient de
    // lire, ou celle de la réservation posée au clic. Sans elle, rien ne part.
    const workspaceId = (outcome.ok ? outcome.contact.workspace_id : null) ?? reservationWorkspaceId ?? null
    if (!missing || !workspaceId) return outcome
    try {
      const estimate = await this.emailEstimate.estimateFor(workspaceId, contactId)
      if (estimate.kind === 'estimated' && outcome.ok) {
        return { ok: true, contact: { ...outcome.contact, email: estimate.email } }
      }
    } catch (error) {
      this.logger.warn('Email estimate failed', { contactId, message: error instanceof Error ? error.message : '' })
    }
    return outcome
  }

  /**
   * Best-effort : un solde manqué n'efface pas un enrichissement payé — la réservation expire d'elle-même (30 min).
   * R4 — jamais sans l'espace : un solde par la seule référence toucherait la même référence dans un autre espace.
   */
  private async settle(
    workspaceId: string | undefined,
    reference: string | undefined,
    outcome: 'consumed' | 'released',
  ): Promise<void> {
    if (!workspaceId || !reference || !this.settler) return
    try {
      await this.settler.settle(workspaceId, reference, outcome)
    } catch (error) {
      this.logger.error('Enrichment reservation settle failed', { error, tags: { 'action_os.settle': outcome } })
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<ContactEnrichmentJobData> | undefined, err: Error): Promise<void> {
    // Ici, seules les pannes d'infra (une exception inattendue) : les refus
    // métier passent par `process` sans lever.
    this.logger.error('Enrichment job crashed', {
      jobId: job?.id,
      contactId: job?.data.contactId,
      message: err.message,
    })
    // #4119 — filet : un worker perdu en plein vol (job « stalled ») ne passe ni par le `try` ni par le
    // `catch` de `process`. On LIBÈRE (jamais « consommé » d'office) plutôt que d'attendre l'expiration
    // à 30 min. Idempotent : `settle` ne matche que `state: 'reserved'` — si `process` a déjà soldé, no-op.
    if (job) await this.settle(job.data.reservationWorkspaceId, job.data.reservationReference, 'released')
  }
}
