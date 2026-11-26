import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { detectDivergences, type CrmDivergence } from '@bellum/contracts'
import { ContactEntity } from '../../database/entities/contact.entity'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { ToolLatencyObservationEntity } from '../../database/entities/tool-latency-observation.entity'
import { ContactStopService } from '../contact-stop/contact-stop.service'
import { CrmService } from '../crm/crm.service'
import { crmSyncDisabled, maxContactsPerWorkspace, overwriteRemoteValues } from './crm-sync.config'

/** GA-07 — la porte d'écriture CRM (`OutboundWriteService.request`, #4186) vue par son SEUL besoin ici, injectée par
 *  jeton : ce service n'importe pas le service d'un autre module. */
export const CRM_SYNC_WRITE_GATE = Symbol('CRM_SYNC_WRITE_GATE')
type CrmSyncWriteGate = {
  request(input: {
    workspaceId: string
    userId: string
    provider: string
    kind: 'export_contact'
    payload: Record<string, unknown>
    previous?: Readonly<Record<string, unknown>>
    origin: 'user' | 'system'
    idempotencyKey?: string | null
  }): Promise<{ request: { id: string } }>
}

/** Ce qu'un passage a fait, pour le journal et pour les tests. Non exporté :
 *  les appelants lisent la forme inférée du retour. */
type CrmSyncOutcome = {
  scanned: number
  /** Contacts dont on a appris qu'ils étaient déjà dans le CRM. */
  linked: number
  /** Champs vides côté CRM que Bellum a remplis. */
  filled: number
  /** Écarts constatés entre les deux côtés. */
  divergent: number
  /** Écrasements effectifs — zéro tant que `CRM_SYNC_OVERWRITE` n'est pas posé. */
  overwritten: number
}

/**
 * La synchronisation CRM dans les deux sens.
 *
 * Le produit lisait le CRM et exportait vers lui, mais les deux gestes étaient
 * à la main : rien ne rapprochait les deux côtés tout seul. Conséquence, un
 * contact ajouté par un collègue restait inconnu de Bellum jusqu'à ce que
 * quelqu'un ouvre sa fiche, et un e-mail trouvé par Bellum ne parvenait jamais
 * au CRM si personne ne cliquait « exporter ».
 *
 * **Ce que la boucle fait, et la borne qui la rend sûre.** Elle remplit les
 * champs VIDES côté CRM depuis Bellum, apprend de son côté ce que seul le CRM
 * sait (la fiche existe, qui la possède), et SIGNALE les écarts. Elle n'écrase
 * une valeur non vide que si un opérateur l'a explicitement autorisé.
 *
 * Cette borne mérite d'être défendue, parce qu'elle a l'air de contredire
 * l'arbitrage « Bellum fait foi » : l'arbitrage porte sur ce que le produit
 * AFFICHE et propose, là où l'écrasement automatique modifie l'outil d'un
 * client. Les conséquences d'une erreur ne se lisent alors pas chez nous mais
 * chez lui, et personne ne saura dire quelle valeur a été perdue. Remplir un
 * blanc est un gain sans risque ; remplacer une saisie humaine est un pari.
 *
 * #4714.1 — EXCEPTION NOMMÉE à la porte d'écriture (`c147_synchro_crm_remplit_un_champ_vide_jamais_n_ecrase`,
 * décision Louis 31/10/2026). La doctrine veut qu'une écriture CRM passe par `OutboundWriteService` (#4186) ;
 * l'origine ici est un cron, donc système, et la porte imposerait une prévisualisation figée qui tuerait
 * l'automatisme. La synchro REMPLIT donc un champ VIDE sans passer par la porte, et n'écrase jamais une saisie.
 * #4714.2 — `crm-sync-exception-champ-vide.spec.ts` garde ce chemin : deux sites d'écriture décidés, aucune
 * autre écriture, l'exception nommée ici.
 */
@Injectable()
export class CrmSyncService {
  private readonly logger = new Logger(CrmSyncService.name)

  constructor(
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(CrmConnectionEntity)
    private readonly connections: Repository<CrmConnectionEntity>,
    // La porte « ne me contactez plus ». Ce passage POUSSE `email` et `phone`
    // vers le CRM du client : sans elle, le numéro de quelqu'un qui a demandé
    // qu'on cesse de l'appeler atterrit chaque nuit dans l'outil qui sert
    // justement à l'appeler. C'est le motif « retirer le MOYEN, pas seulement
    // la permission » — refuser l'envoi chez nous ne sert à rien si l'on
    // recopie la coordonnée ailleurs.
    private readonly contactStops: ContactStopService,
    @Optional() private readonly crm?: CrmService,
    // #2261.13 (19/09) — le dépôt des synchros réelles qui mesurent la
    // latence probable de l'outil (`tool-latency.ts::measureToolLatency`).
    // Optionnel comme `crm` : son absence ne doit pas empêcher la boucle de
    // faire le reste de son travail.
    @Optional()
    @InjectRepository(ToolLatencyObservationEntity)
    private readonly latencyObservations?: Repository<ToolLatencyObservationEntity>,
    // #4714.3 — LA porte d'écriture CRM, pour l'écrasement (`CRM_SYNC_OVERWRITE`). Optionnelle : sans elle,
    // l'écrasement ne part pas (jamais hors porte).
    @Optional() @Inject(CRM_SYNC_WRITE_GATE) private readonly gate?: CrmSyncWriteGate,
  ) {}

  /**
   * Un passage sur tous les espaces qui ont un CRM connecté.
   *
   * Aucune connexion ⇒ zéro appel réseau et un résultat vide : la boucle ne
   * coûte rien à ceux qui n'ont pas branché de CRM.
   */
  async syncAll(): Promise<CrmSyncOutcome> {
    const empty: CrmSyncOutcome = { scanned: 0, linked: 0, filled: 0, divergent: 0, overwritten: 0 }
    if (crmSyncDisabled()) {
      this.logger.log('CRM sync disabled (CRM_SYNC_DISABLED=true) — skipping')
      return empty
    }
    if (!this.crm) return empty

    const cap = maxContactsPerWorkspace()
    if (cap <= 0) return empty

    const connections = await this.connections.find({ take: 200 })
    const total = { ...empty }
    for (const connection of connections) {
      const one = await this.syncWorkspace(connection.workspace_id, cap)
      total.scanned += one.scanned
      total.linked += one.linked
      total.filled += one.filled
      total.divergent += one.divergent
      total.overwritten += one.overwritten
    }

    if (total.scanned > 0) this.logger.log('CRM sync pass complete', total)
    return total
  }

  /**
   * Un espace de travail, borné.
   *
   * Les contacts les plus anciennement synchronisés passent d'abord : avec la
   * borne de volume, l'ensemble tourne sur plusieurs passages au lieu de
   * re-balayer indéfiniment les mêmes premiers contacts.
   */
  async syncWorkspace(workspaceId: string | null, cap = maxContactsPerWorkspace()): Promise<CrmSyncOutcome> {
    const outcome: CrmSyncOutcome = { scanned: 0, linked: 0, filled: 0, divergent: 0, overwritten: 0 }
    if (!this.crm || !workspaceId) return outcome

    const rows = await this.contacts
      .createQueryBuilder('c')
      .where('c.workspace_id = :workspaceId', { workspaceId })
      .andWhere('c.email IS NOT NULL')
      .orderBy('c.crm_synced_at', 'ASC', 'NULLS FIRST')
      .take(cap)
      .getMany()

    // Les arrêtés du lot, en UNE requête. Le passage tourne sur deux cents
    // contacts par espace : une lecture par contact rendrait le contrôle assez
    // cher pour qu'on finisse par le retirer, et un contrôle retiré ne protège
    // personne. Un ensemble vide est une réponse, jamais « on ne sait pas ».
    const stopped = await this.contactStops.stoppedAmong(
      workspaceId,
      rows.map(row => row.id),
    )

    for (const contact of rows) {
      outcome.scanned += 1
      // Une personne qui a demandé qu'on cesse ne voit AUCUNE de ses
      // coordonnées repartir vers le CRM — ni pour remplir un blanc, ni pour
      // écraser. Le sens ENTRANT (apprendre que la fiche existe) ne le
      // franchirait pas davantage : ce serait une lecture chez un tiers sur
      // quelqu'un qu'on n'a plus à traiter. On saute la fiche entière, et le
      // compteur `scanned` le dit — elle a été vue, pas ignorée en silence.
      if (stopped.has(contact.id)) continue
      try {
        await this.syncOne(contact, outcome)
      } catch (error) {
        // Un contact qui échoue n'arrête pas le passage : une fiche
        // introuvable, un jeton périmé ou un débit de quota amont ne doit pas
        // priver les 199 suivants de leur synchronisation.
        this.logger.warn('CRM sync skipped one contact (non-fatal)', {
          contactId: contact.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return outcome
  }

  /** Un contact : on apprend, on remplit les blancs, on signale les écarts. */
  private async syncOne(contact: ContactEntity, outcome: CrmSyncOutcome): Promise<void> {
    const snapshot = await this.crm!.findContactRecord(contact.user_id, contact.email)
    if (!snapshot) return

    // #2261.13 (19/09) — CETTE synchro EST une observation réelle : l'instant
    // présent est l'arrivée, `snapshot.lastActivityAt` (quand disponible) est
    // l'horodatage SOURCE. Avant tout retour anticipé plus bas, pour qu'une
    // fiche sans divergence ni champ à remplir compte quand même.
    await this.recordLatencyObservation(contact.workspace_id, snapshot.provider, snapshot.lastActivityAt)

    // Sens ENTRANT : on apprend que la fiche existe. C'est ce qui fait qu'un
    // contact ajouté à la main par un collègue cesse d'être proposé comme
    // « jamais contacté ».
    if (!contact.crm_synced_at) outcome.linked += 1
    await this.contacts.update({ id: contact.id }, { crm_synced_at: new Date() })

    const divergences: CrmDivergence[] = detectDivergences({ email: contact.email, phone: contact.phone }, snapshot)
    outcome.divergent += divergences.length

    // Sens SORTANT : remplir les blancs. Un champ vide côté CRM qui existe chez
    // Bellum est un gain net — aucune information n'est perdue, et le commercial
    // retrouve dans son outil ce que Bellum a trouvé.
    const blanks = (['email', 'phone'] as const).filter(field => {
      const mine = (contact[field] ?? '').trim()
      const theirs = (snapshot[field] ?? '').trim()
      return mine.length > 0 && theirs.length === 0
    })
    for (const field of blanks) {
      await this.crm!.pushContactField(contact.user_id, snapshot.recordId, field, contact[field] as string)
      outcome.filled += 1
    }

    // #4714.3 — Écrasement d'une valeur NON VIDE : seulement sur autorisation explicite d'un opérateur, ET
    // jamais directement. Il passe par LA porte d'écriture CRM (`OutboundWriteService`) : origine système ⇒
    // prévisualisation figée, un humain valide (droits de la porte inchangés). Porte absente ⇒ rien ne part.
    if (overwriteRemoteValues() && this.gate && contact.workspace_id) {
      for (const divergence of divergences) {
        const verdict = await this.gate.request({
          workspaceId: contact.workspace_id,
          userId: contact.user_id,
          provider: snapshot.provider,
          kind: 'export_contact',
          payload: { externalId: snapshot.recordId, [divergence.field]: divergence.bellum },
          previous: { [divergence.field]: divergence.crm },
          origin: 'system',
          // Une même divergence ne redépose pas une demande à chaque passage.
          idempotencyKey: `crm-sync-overwrite:${contact.id}:${divergence.field}:${divergence.bellum}`,
        })
        // Rien n'est écrit ici : `overwritten` ne compte que les écrasements EFFECTIFS (zéro tant que personne
        // n'a validé). La demande en attente se lit à l'écran des écritures CRM.
        this.logger.log('CRM overwrite proposed through the write gate (awaiting human validation)', {
          contactId: contact.id,
          field: divergence.field,
          requestId: verdict.request.id,
        })
      }
    }
  }

  /**
   * #2261.13 (décision Louis 19/09) — garde UNE synchro réelle, pour mesurer
   * ensuite la latence probable de l'outil (`ToolRegistryService`,
   * `measureToolLatency`).
   *
   * Best-effort et silencieux par construction : ni l'absence du dépôt
   * (`@Optional()`), ni son échec ne doivent faire échouer une synchro qui,
   * par ailleurs, a réussi. La table exige `workspace_id NOT NULL` — un
   * contact sans espace (legacy) ou une fiche CRM sans `lastActivityAt`
   * (fournisseur qui ne le rend pas) ne produisent simplement aucune ligne,
   * jamais une valeur devinée pour combler le manque.
   */
  private async recordLatencyObservation(
    workspaceId: string | null,
    provider: string,
    lastActivityAt: string | null | undefined,
  ): Promise<void> {
    if (!this.latencyObservations || !workspaceId || !lastActivityAt) return
    const sourceAt = new Date(lastActivityAt)
    if (Number.isNaN(sourceAt.getTime())) return
    const arrivedAt = new Date()
    if (sourceAt.getTime() > arrivedAt.getTime()) return
    try {
      await this.latencyObservations.insert({
        workspace_id: workspaceId,
        provider,
        source_at: sourceAt,
        arrived_at: arrivedAt,
      })
    } catch (error) {
      this.logger.warn('Latency observation not stored (non-fatal)', {
        provider,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
