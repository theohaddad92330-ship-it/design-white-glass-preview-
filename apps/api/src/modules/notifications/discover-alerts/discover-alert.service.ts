import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  decideDiscoverAlertSurface,
  isDiscoverAlertDue,
  isOutboundAlertChannel,
  isQualifiedOutboundConsent,
  isUrgentDiscoverAlertKind,
  resolveChangelogLanguage,
  type SavedViewAlertChannel,
  type SavedViewAlertFrequency,
} from '@bellum/contracts'
import { SavedViewEntity } from '../../../database/entities/saved-view.entity'
import { SuppressionService } from '../../mailer/suppression.service'
import { NotificationsService } from '../notifications.service'
import { smsRecipientRefusal } from '../sms/sms-recipient'
import { DiscoverAlertEventService } from './discover-alert-event.service'
import { DISCOVER_ALERT_GATE, type DiscoverAlertGate } from './discover-alert-gate'
import { DISCOVER_ALERT_OUTBOUND, type DiscoverAlertOutbound } from './discover-alert-outbound'
import { buildDiscoverAlertEmail, buildDiscoverAlertSms, buildDiscoverAlertTitle } from './discover-alert-message'

/**
 * L'ÉMETTEUR DES ALERTES DE DÉCOUVRIR — 15/09/2026, décision 7 de Louis.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QU'IL CORRIGE
 * ─────────────────────────────────────────────────────────────────────────────
 * `saved_views.last_run_at` n'avait AUCUN écrivain de production. Une recherche
 * de Découvrir pouvait porter une cadence (`weekly`) et un canal (`email`) : les
 * deux colonnes se remplissaient, s'affichaient, et personne ne les lisait. Du
 * code juste que personne n'appelle — le défaut n°1 de ce dépôt. Brancher un
 * canal sans exécuteur de cadence l'aurait laissé entier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ORDRE DES GARDES, ET POURQUOI IL EST CELUI-LÀ
 * ─────────────────────────────────────────────────────────────────────────────
 *  0. **L'interrupteur d'opérateur**, AVANT toute lecture. « Éteint » veut dire
 *     chemin identique à celui d'avant ce lot : pas de requête, pas de trace,
 *     pas de charge. Un « on lit tout puis on jette » n'est pas la même chose.
 *  1. la CADENCE — un périmètre pas encore dû ne déclenche rien ;
 *  2. la DÉMONSTRATION — rien ne part jamais d'une salle de démonstration ;
 *  3. le canal SORTANT — `in_app` n'envoie rien, donc rien à vérifier ;
 *  4. la CLÉ du canal — sans clé, no-op strict : aucune tentative, zéro réseau ;
 *  5. le CONSENTEMENT DATÉ — un `true` non qualifié vaut refus ;
 *  6. l'ADRESSE, et son propre refus (désabonnement, numéro non vérifié) ;
 *  7. la LISTE BORNÉE — en recette, hors liste = refusé.
 *
 * Chaque refus est COMPTÉ ET NOMMÉ. Un passage qui rendrait « 0 envoyé » sans
 * dire pourquoi est exactement le zéro qui ment : on ne saurait pas distinguer
 * « personne n'était dû » de « la clé manque depuis trois semaines ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il ne REJOUE PAS la recherche. Rejouer appelle le moteur et débite un crédit :
 * le faire sans geste de l'utilisateur serait une décision de facturation, qui
 * n'appartient pas à ce lot. L'alerte dit que le périmètre est dû et renvoie à
 * l'écran — c'est un rappel d'un engagement pris, jamais une invitation creuse.
 */

/** Les raisons pour lesquelles une alerte due n'est pas partie. Toutes nommées. */
type DiscoverAlertSkipReason =
  | 'switch_off'
  | 'not_due'
  /**
   * #2151.14 — LA raison neuve du 16/09/2026 : le périmètre était DÛ, et rien
   * n'était apparu. C'est le cas le plus fréquent, et c'est celui qui n'existait
   * pas : avant, un périmètre quotidien produisait une alerte chaque jour.
   */
  | 'no_event'
  /**
   * #2151.25 — l'événement est DÉJÀ arrivé dans Aujourd'hui. Compté ici plutôt
   * qu'ignoré : « rien n'est parti » et « c'est parti par l'autre surface » ne
   * se lisent pas pareil dans un journal.
   */
  | 'already_in_today'
  | 'demo'
  | 'no_provider'
  | 'no_consent'
  | 'no_address'
  /** #4016 L12 — le numéro est d'un pays hors `SMS_ALLOWED_COUNTRY_CODES`. */
  | 'country_not_allowed'
  | 'opted_out'
  | 'not_allowlisted'
  | 'failed'

type DiscoverAlertRunCounts = {
  /** Combien de périmètres la requête a ramenés. */
  scanned: number
  /** Combien de notifications dans l'application ont été déposées. */
  inApp: number
  /** Combien d'envois SORTANTS sont réellement partis. */
  outbound: number
  /** Ce qui n'est pas parti, par raison. Jamais un total muet. */
  skipped: Partial<Record<DiscoverAlertSkipReason, number>>
}

/** Une ligne du balayage — la vue, son propriétaire et ce qui décide de l'envoi. */
type DueRow = {
  id: string
  workspace_id: string | null
  owner_id: string | null
  name: string
  objective: string | null
  alert_frequency: string
  alert_channel: string | null
  alert_consent_at: Date | string | null
  last_run_at: Date | string | null
  is_demo: boolean | null
  email: string | null
  email_language: string | null
  phone_e164: string | null
  phone_verified_at: Date | string | null
  sms_consent_at: Date | string | null
  brand_email_from: string | null
}

/**
 * Le balayage. Il ne lit QUE ce qui peut déclencher quelque chose : une
 * recherche de Découvrir, à cadence non manuelle, avec un canal et un
 * propriétaire. Filtrer en SQL plutôt qu'en mémoire évite de faire voyager la
 * table entière pour en jeter 99 %.
 */
const DUE_QUERY = `
  SELECT v.id, v.workspace_id, v.owner_id, v.name, v.objective,
         v.alert_frequency, v.alert_channel, v.alert_consent_at, v.last_run_at,
         w.is_demo, w.brand_email_from,
         p.email,
         np.email_language,
         sc.phone_e164, sc.phone_verified_at, sc.consent_at AS sms_consent_at
    FROM saved_views v
    LEFT JOIN workspaces w ON w.id = v.workspace_id
    LEFT JOIN profiles p ON p.user_id = v.owner_id
    LEFT JOIN notification_preferences np ON np.user_id = v.owner_id
    LEFT JOIN notification_sms_channels sc ON sc.user_id = v.owner_id
   WHERE v.scope = 'discover'
     AND v.alert_frequency <> 'manual'
     AND v.alert_channel IS NOT NULL
     AND v.owner_id IS NOT NULL
`

@Injectable()
export class DiscoverAlertService {
  private readonly logger = new Logger(DiscoverAlertService.name)

  constructor(
    @InjectRepository(SavedViewEntity) private readonly views: Repository<SavedViewEntity>,
    private readonly notifications: NotificationsService,
    private readonly suppression: SuppressionService,
    @Inject(DISCOVER_ALERT_OUTBOUND) private readonly outbound: DiscoverAlertOutbound,
    @Inject(DISCOVER_ALERT_GATE) private readonly gate: DiscoverAlertGate,
    private readonly config: ConfigService,
    // #2151.14 / #2151.25 — le registre des événements. EN DERNIER : trois
    // specs construisent ce service par position, et un paramètre inséré au
    // milieu les décalerait en silence (même raison que `SmsChannelService`).
    private readonly events: DiscoverAlertEventService,
  ) {}

  async run(now: Date = new Date()): Promise<DiscoverAlertRunCounts> {
    const counts: DiscoverAlertRunCounts = { scanned: 0, inApp: 0, outbound: 0, skipped: {} }

    // Garde 0 — l'interrupteur d'opérateur, AVANT la moindre lecture.
    if (!this.gate.enabled) {
      bump(counts, 'switch_off')
      return counts
    }

    const rows = await this.views.manager.query<DueRow[]>(DUE_QUERY)
    counts.scanned = rows.length

    for (const row of rows) {
      try {
        await this.handle(row, now, counts)
      } catch (error) {
        // Un périmètre en échec ne fait pas tomber le passage : les suivants
        // ont leur propre propriétaire, qui n'y est pour rien.
        bump(counts, 'failed')
        this.logger.warn('Alerte Découvrir non délivrée (non fatal)', {
          savedView: { id: row.id },
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return counts
  }

  private async handle(row: DueRow, now: Date, counts: DiscoverAlertRunCounts): Promise<void> {
    if (!isDiscoverAlertDue(row.alert_frequency as SavedViewAlertFrequency, row.last_run_at, now)) {
      bump(counts, 'not_due')
      return
    }
    if (row.is_demo === true) {
      // Rien ne part jamais d'une salle de démonstration — c'est la promesse
      // même du lien de démonstration, et elle n'a aucune exception.
      bump(counts, 'demo')
      return
    }

    // ─────────────────────────────────────────────────────────────────────
    // #2151.14 — UNE ALERTE SURVEILLE L'APPARITION D'UN ÉVÉNEMENT.
    // ─────────────────────────────────────────────────────────────────────
    // La cadence dit QUAND on regarde ; elle ne dit pas qu'il y a quelque
    // chose à dire. Sans cette lecture, un périmètre quotidien produisait une
    // alerte chaque jour, y compris les jours où rien n'était apparu — et un
    // rappel qui sonne pour rien s'éteint au bout d'une semaine.
    const workspaceId = row.workspace_id
    const pending = workspaceId ? await this.events.undelivered(workspaceId, row.id) : []
    if (pending.length === 0) {
      bump(counts, 'no_event')
      return
    }

    // HORODATÉ AVANT l'envoi, comme les digests de veille : si le fournisseur
    // refuse, le passage de demain reprend la main. Stamper après ferait
    // re-tenter à chaque tick tant que l'envoi échoue — une rafale facturée.
    await this.views.update(row.id, { last_run_at: now })

    const language = resolveChangelogLanguage(row.email_language)
    const ownerId = row.owner_id
    if (!ownerId) return

    // ─────────────────────────────────────────────────────────────────────
    // #2151.25 — UN ÉVÉNEMENT NE SORT QUE PAR UN CANAL.
    // ─────────────────────────────────────────────────────────────────────
    // Ce bloc déposait une notification PUIS, si le canal était sortant,
    // envoyait aussi l'e-mail : un même périmètre dû produisait deux arrivées,
    // et Aujourd'hui en ajoutait une troisième. La décision passe désormais par
    // `decideDiscoverAlertSurface`, qui rend UNE surface — c'est le TYPE qui
    // tient la règle, pas la discipline d'écriture de ce fichier.
    //
    // Le genre qui décide est le plus urgent du lot : un signal d'achat au
    // milieu de trois voies d'accès justifie Aujourd'hui, l'inverse n'est pas
    // vrai.
    const deciding = pending.find(event => isUrgentDiscoverAlertKind(event.kind)) ?? pending[0]
    const channel = (row.alert_channel ?? null) as SavedViewAlertChannel | null
    const surface = decideDiscoverAlertSurface({ kind: deciding.kind, channel })
    const pendingIds = pending.map(event => event.id)

    if (surface === 'today') {
      // L'événement EST déjà dans Aujourd'hui — sa ligne y est née. Ajouter une
      // notification ne le ferait pas arriver plus tôt, elle le ferait arriver
      // DEUX fois. On stampe pour qu'aucun passage suivant ne le reprenne.
      if (workspaceId) await this.events.markDelivered(workspaceId, pendingIds, 'today')
      bump(counts, 'already_in_today')
      return
    }

    /**
     * LA SURFACE DE REPLI — et pourquoi ce n'est PAS un doublon.
     *
     * Un envoi REFUSÉ (pas de clé, pas de consentement daté, adresse
     * désabonnée, hors liste bornée) ne fait arriver l'alerte nulle part. La
     * déposer alors dans l'application n'ajoute pas une seconde arrivée : elle
     * en crée la PREMIÈRE. « Refuser un envoi n'est pas retirer une fonction à
     * quelqu'un » — la promesse tenait déjà avant ce lot, et #2151.25 ne la
     * retire pas : ce qu'il interdit, c'est de délivrer DEUX fois le même
     * événement, pas de le délivrer une fois par le second choix.
     */
    const deliverInApp = async (): Promise<void> => {
      await this.notifications.createNotification(ownerId, {
        type: 'discover_alert',
        title: buildDiscoverAlertTitle(language, row.name),
        link: this.discoverLink(row.id),
        origin: 'proactive',
      })
      if (workspaceId) await this.events.markDelivered(workspaceId, pendingIds, 'notification')
      counts.inApp += 1
    }

    if (surface === 'notification') {
      await deliverInApp()
      return
    }

    // Garde 3 — reste `outbound`. Le canal doit VRAIMENT sortir : un `in_app`
    // arrivé jusqu'ici serait une incohérence de données, pas une permission.
    if (!isOutboundAlertChannel(channel)) {
      await deliverInApp()
      return
    }

    // Garde 4 — sans clé, NO-OP STRICT. On s'arrête ici, avant toute lecture de
    // consentement, toute résolution d'adresse et tout appel réseau.
    if (!this.outbound.configuredFor(channel)) {
      bump(counts, 'no_provider')
      await deliverInApp()
      return
    }

    // Garde 5 — le consentement DATÉ. Le dépôt sait dire qu'une case vaut
    // `true` ; il ne sait dire ni quand ni comment elle y est passée. Tant que
    // la question est ouverte, un `true` non qualifié vaut REFUS.
    if (!isQualifiedOutboundConsent(row.alert_consent_at, now)) {
      bump(counts, 'no_consent')
      await deliverInApp()
      return
    }

    const recipient = await this.resolveRecipient(row, channel, now)
    if (recipient.kind !== 'ok') {
      bump(counts, recipient.kind)
      await deliverInApp()
      return
    }

    // Garde 7 — la liste bornée. En recette, hors liste = refusé ; sans liste,
    // personne. Il doit être impossible qu'un essai parte à tout le monde.
    if (!this.gate.allows(recipient.address)) {
      bump(counts, 'not_allowlisted')
      await deliverInApp()
      return
    }

    try {
      if (channel === 'sms') {
        await this.outbound.send({
          channel: 'sms',
          to: recipient.address,
          text: buildDiscoverAlertSms(language, row.name),
        })
      } else {
        const content = buildDiscoverAlertEmail(language, {
          name: row.name,
          objective: row.objective,
          frequency: row.alert_frequency as SavedViewAlertFrequency,
          url: this.discoverLink(row.id),
        })
        await this.outbound.send({
          channel: 'email',
          to: recipient.address,
          from: row.brand_email_from,
          ...content,
        })
      }
      counts.outbound += 1
      // #2151.25 — stampé APRÈS la réussite, jamais avant : stamper d'abord
      // ferait taire un événement que personne n'a reçu.
      if (workspaceId) await this.events.markDelivered(workspaceId, pendingIds, 'outbound')
    } catch (error) {
      // Jamais un faux succès : l'échec est compté ET nommé.
      bump(counts, 'failed')
      this.logger.warn('Envoi d’alerte Découvrir refusé par le transport (non fatal)', {
        savedView: { id: row.id },
        channel,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * L'adresse du destinataire, avec sa PROPRE porte.
   *
   * - e-mail : l'adresse du profil, filtrée par la liste d'opt-out
   *   (`SuppressionService.isSuppressed`) — la porte ADRESSE de GA-122 ;
   * - SMS : le numéro du canal d'alertes urgentes, qui exige déjà un numéro
   *   VÉRIFIÉ et un consentement DATÉ. On reprend cette porte au lieu d'en
   *   ouvrir une seconde : un numéro qui n'a pas été vérifié n'est pas une
   *   adresse, c'est une saisie.
   */
  private async resolveRecipient(
    row: DueRow,
    channel: 'email' | 'sms',
    now: Date,
  ): Promise<{ kind: 'ok'; address: string } | { kind: 'no_address' | 'opted_out' | 'country_not_allowed' }> {
    if (channel === 'sms') {
      // #4016 L12 — UNE seule règle pour « qui reçoit un SMS » (`smsRecipientRefusal`),
      // relue à CHAQUE envoi : numéro, vérification, consentement daté, pays.
      const phone = (row.phone_e164 ?? '').trim()
      const refusal = smsRecipientRefusal(
        {
          phone,
          verifiedAt: row.phone_verified_at,
          consentAt: row.sms_consent_at,
          countryAllowed: this.outbound.allowsSmsRecipient(phone),
        },
        now,
      )
      if (refusal === 'country_not_allowed') return { kind: 'country_not_allowed' }
      if (refusal) return { kind: 'no_address' }
      return { kind: 'ok', address: phone }
    }

    const email = (row.email ?? '').trim()
    if (!email) return { kind: 'no_address' }
    if (row.workspace_id && (await this.suppression.isSuppressed(row.workspace_id, email))) {
      return { kind: 'opted_out' }
    }
    return { kind: 'ok', address: email }
  }

  /** L'adresse de l'écran où rejouer le périmètre. `null` si l'API ne la connaît pas. */
  private discoverLink(savedViewId: string): string | null {
    const base = (this.config.get<string>('frontendUrl') ?? '').replace(/\/$/, '')
    if (!base) return null
    return `${base}/discover?savedView=${encodeURIComponent(savedViewId)}`
  }
}

function bump(counts: DiscoverAlertRunCounts, reason: DiscoverAlertSkipReason): void {
  counts.skipped[reason] = (counts.skipped[reason] ?? 0) + 1
}
