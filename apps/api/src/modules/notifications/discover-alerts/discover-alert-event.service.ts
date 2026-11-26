import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  decideDiscoverAlertSurface,
  discoverAlertEventKey,
  isUrgentDiscoverAlertKind,
  type DiscoverAlertDeliverySurface,
  type DiscoverAlertEventKind,
} from '@bellum/contracts'
import { DiscoverAlertEventEntity } from '../../../database/entities/discover-alert-event.entity'

/**
 * LE REGISTRE DES ÉVÉNEMENTS DE DÉCOUVRIR — #2151.14 / #2151.25.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PORTE UNIQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * Tout producteur d'événement passe par {@link record}. C'est le seul endroit
 * qui écrit dans `discover_alert_events`, donc le seul endroit où la question
 * « l'ai-je déjà signalé ? » se pose — et elle s'y pose de la seule façon qui
 * tienne : un `INSERT … ON CONFLICT DO NOTHING` sur l'index unique
 * `(workspace_id, event_key)`.
 *
 * ⚠️ Pourquoi pas une lecture préalable. « Est-ce que cette ligne existe ? »
 * puis « alors j'insère » est deux requêtes : deux répliques du balayage, ou le
 * balayage et le rafraîchissement des comptes suivis, y répondent « non » en
 * même temps et écrivent deux lignes. Le doublon que #2151.25 refuse ne se tient
 * pas par une lecture, il se tient par une CONTRAINTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ARRÊT §10 — LE CLOISONNEMENT EST EXPLICITE SUR CHAQUE LECTURE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les espaces sont des ESN, donc des concurrents. Chaque méthode de ce service
 * prend `workspaceId` en PREMIER paramètre et le pose dans son `where` : il n'y
 * a aucun chemin, ici, qui lise des événements sans espace. Une signature qui
 * le rendrait optionnel ouvrirait la porte au jour où quelqu'un l'oublie.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il n'envoie rien, ne relance aucune analyse et n'écrit dans aucun CRM. Un
 * événement SIGNALE ; le commercial décide. Et il ne supprime jamais : une
 * ligne qui cesse d'être « nouvelle » reste consultable avec sa date.
 */

/** Ce qu'un producteur apporte. Tout est obligatoire sauf ce qui peut manquer. */
type DiscoverAlertEventInput = {
  workspaceId: string
  kind: DiscoverAlertEventKind
  /** L'objet concerné. Sert aussi de sujet dans la clé de déduplication. */
  subjectId: string
  /** Ce que la ligne DIT. Vide accepté : mieux qu'un libellé inventé. */
  subjectLabel: string
  /** QUAND le fait a eu lieu — jamais « maintenant » par commodité. */
  occurredAt: Date
  /** Le périmètre qui l'a demandé, ou `null` = événement d'espace. */
  savedViewId?: string | null
}

/** Le verdict de la porte. Nommé, jamais un booléen muet. */
type DiscoverAlertRecordResult =
  | { status: 'recorded'; surface: DiscoverAlertDeliverySurface | null }
  | { status: 'duplicate' }

@Injectable()
export class DiscoverAlertEventService {
  private readonly logger = new Logger(DiscoverAlertEventService.name)

  constructor(
    @InjectRepository(DiscoverAlertEventEntity)
    private readonly events: Repository<DiscoverAlertEventEntity>,
  ) {}

  /**
   * Consigne un événement, UNE fois.
   *
   * La surface de naissance :
   *  - genre URGENT ⇒ `today`. La ligne EST la délivrance — Aujourd'hui lit
   *    cette table (#2151.23 / #2151.61) — et rien d'autre ne la reprendra ;
   *  - sinon `null` = pas encore délivré. L'émetteur choisira UNE surface au
   *    prochain passage du périmètre concerné, et la stampera.
   *
   * ⚠️ Le jour de la clé est celui de `occurredAt`, en UTC : deux détections du
   * même fait à quatre heures d'intervalle sont le même fait, et deux faits de
   * deux jours différents restent deux faits.
   */
  async record(input: DiscoverAlertEventInput): Promise<DiscoverAlertRecordResult> {
    const occurredOn = input.occurredAt.toISOString().slice(0, 10)
    const eventKey = discoverAlertEventKey({ kind: input.kind, subjectId: input.subjectId, occurredOn })
    // Un genre urgent naît DÉJÀ posé dans Aujourd'hui ; les autres naissent
    // sans surface, et c'est `decideDiscoverAlertSurface` — à un seul endroit —
    // qui dit lequel est lequel.
    const surface = isUrgentDiscoverAlertKind(input.kind)
      ? decideDiscoverAlertSurface({ kind: input.kind, channel: null })
      : null

    const result = await this.events
      .createQueryBuilder()
      .insert()
      .into(DiscoverAlertEventEntity)
      .values({
        workspace_id: input.workspaceId,
        kind: input.kind,
        event_key: eventKey,
        subject_id: input.subjectId,
        subject_label: input.subjectLabel,
        saved_view_id: input.savedViewId ?? null,
        surface,
        occurred_at: input.occurredAt,
      })
      // #2151.25 — LA porte. C'est la base qui refuse le doublon.
      .orIgnore()
      .execute()

    // `identifiers` est vide quand le conflit a mangé la ligne : rien n'a été
    // écrit, donc rien ne doit être délivré.
    const inserted = (result.identifiers ?? []).some(identifier => identifier !== undefined)
    if (!inserted) return { status: 'duplicate' }
    return { status: 'recorded', surface }
  }

  /**
   * Les événements d'un périmètre qui n'ont ENCORE été délivrés nulle part.
   *
   * `surface IS NULL` est la seconde moitié de #2151.25 : un événement déjà
   * posé dans Aujourd'hui, ou déjà envoyé, n'est pas repris — quel que soit le
   * nombre de périmètres qui le regardent.
   *
   * Un événement d'ESPACE (`saved_view_id IS NULL`) est visible de tous les
   * périmètres ; un événement attaché à un périmètre n'est visible que de lui.
   */
  async undelivered(workspaceId: string, savedViewId: string, limit = 20): Promise<DiscoverAlertEventEntity[]> {
    return this.events
      .createQueryBuilder('event')
      .where('event.workspace_id = :workspaceId', { workspaceId })
      .andWhere('event.surface IS NULL')
      .andWhere('(event.saved_view_id IS NULL OR event.saved_view_id = :savedViewId)', { savedViewId })
      .orderBy('event.occurred_at', 'DESC')
      .limit(limit)
      .getMany()
  }

  /**
   * Stampe la surface par laquelle CES événements sont arrivés.
   *
   * Appelé APRÈS une délivrance réussie, jamais avant : stamper d'abord ferait
   * taire un événement que personne n'a reçu. C'est le sens inverse de
   * `last_run_at`, stampé AVANT l'envoi pour ne pas re-tenter en rafale — les
   * deux règles vont dans le même sens, ne rien perdre et ne rien répéter.
   */
  async markDelivered(
    workspaceId: string,
    ids: readonly string[],
    surface: DiscoverAlertDeliverySurface,
  ): Promise<number> {
    if (ids.length === 0) return 0
    const result = await this.events
      .createQueryBuilder()
      .update(DiscoverAlertEventEntity)
      .set({ surface })
      // Le cloisonnement est posé sur l'ÉCRITURE comme sur la lecture : un
      // identifiant deviné ne doit pas pouvoir stamper la ligne d'un autre.
      .where('workspace_id = :workspaceId', { workspaceId })
      .andWhere('id IN (:...ids)', { ids })
      .andWhere('surface IS NULL')
      .execute()
    return result.affected ?? 0
  }

  /**
   * #2151.23 / #2151.61 — ce qui apparaît dans Aujourd'hui.
   *
   * Seulement ce qui a été jugé urgent (`surface = 'today'`) et que personne
   * n'a encore acquitté. Une liste vide ne dit PAS « il ne s'est rien passé » :
   * l'écran affiche « aucun déclenchement depuis <date> », jamais « 0 alerte ».
   */
  async forToday(workspaceId: string, limit = 5): Promise<DiscoverAlertEventEntity[]> {
    return this.events
      .createQueryBuilder('event')
      .where('event.workspace_id = :workspaceId', { workspaceId })
      .andWhere("event.surface = 'today'")
      .andWhere('event.acknowledged_at IS NULL')
      .orderBy('event.occurred_at', 'DESC')
      .limit(limit)
      .getMany()
  }

  /**
   * #2151.8 — combien d'événements depuis une date, pour UN périmètre.
   *
   * Rend un COMPTE brut. La question « et si le périmètre n'a jamais été
   * rejoué ? » ne se tranche pas ici mais dans `newItemsSince`
   * (`@bellum/contracts`), qui rend `null` — parce que « on n'a pas regardé »
   * et « on a regardé, il n'y a rien » sont deux phrases différentes.
   */
  async countSince(workspaceId: string, savedViewId: string, since: Date): Promise<number> {
    return this.events
      .createQueryBuilder('event')
      .where('event.workspace_id = :workspaceId', { workspaceId })
      .andWhere('(event.saved_view_id IS NULL OR event.saved_view_id = :savedViewId)', { savedViewId })
      .andWhere('event.occurred_at >= :since', { since })
      .getCount()
  }

  /** La date du dernier événement consigné, ou `null` — « aucun déclenchement ». */
  async lastOccurredAt(workspaceId: string): Promise<Date | null> {
    const row = await this.events
      .createQueryBuilder('event')
      .select('MAX(event.occurred_at)', 'max')
      .where('event.workspace_id = :workspaceId', { workspaceId })
      .getRawOne<{ max: Date | string | null }>()
    const value = row?.max ?? null
    if (value === null) return null
    const parsed = value instanceof Date ? value : new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
}
