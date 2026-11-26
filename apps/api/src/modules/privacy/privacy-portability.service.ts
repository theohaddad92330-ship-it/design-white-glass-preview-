import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { PORTABLE_OBJECTS, withheldFromExport, type PortabilityManifest, type PortableFormat } from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { CreditLedgerEntity } from '../../database/entities/credit-ledger.entity'
import { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import { NotificationSmsChannelEntity } from '../../database/entities/notification-sms-channel.entity'
import { ProductEventEntity } from '../../database/entities/product-event.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { RagDocumentEntity } from '../../database/entities/rag-document.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { UserSessionEntity } from '../../database/entities/user-session.entity'
import { ProductAnalyticsService } from '../analytics/product-analytics.service'
import { PrivacyExportService } from './privacy-export.service'
import { tableInventory } from './table-inventory'
import { PrivacyRetentionService } from './privacy-retention.service'

/** Ce qu'un téléchargement d'objet rend au contrôleur. Non exporté : le
 *  contrôleur le lit par inférence, et un type exporté sans lecteur externe est
 *  ce que knip refuse. */
type PortableFile = { filename: string; contentType: string; body: string }

/**
 * La marque qui distingue un export PERSONNEL (cet écran) d'un export vers un
 * outil tiers, dans le même flux d'évènements. Elle vit ici et nulle part
 * ailleurs : c'est elle qui sert à relire « dernier export : … ».
 */
const PERSONAL_EXPORT_DESTINATION = 'personal_export'

/**
 * LA RÉVERSIBILITÉ, CALCULÉE — PDF 7 §9.2, ticket `BEL-INT-608` PR1.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE SERVICE FAIT, ET POURQUOI IL EST À CÔTÉ DE L'EXPORT ET NON DEDANS
 * ─────────────────────────────────────────────────────────────────────────────
 * `PrivacyExportService` répond à « donne-moi tout » (art. 15 & 20). Celui-ci
 * répond à deux autres questions, qui sont celles de l'écran : « qu'est-ce que
 * j'emporte, et combien ? » et « qu'est-ce que je laisse, et pourquoi ? ».
 * Il RÉUTILISE l'export plutôt que de refaire ses requêtes — deux chemins qui
 * lisent la même donnée finissent par en dire deux choses.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS RÈGLES QUI NE SE NÉGOCIENT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Un export est une SORTIE de données personnelles : il est journalisé
 *    (`export_performed`, visible dans le journal d'activité), et le journal ne
 *    porte JAMAIS le contenu — seulement quoi, quand, par qui.
 * 2. Toute lecture est bornée au demandeur. Rien ici n'est scopé espace.
 * 3. Un compte illisible vaut `null`, jamais `0`. « 0 contact » sur un carnet
 *    de 3 890 lignes ferait croire qu'il n'y a rien à emporter, ce qui est le
 *    contraire du message de cette page.
 */
@Injectable()
export class PrivacyPortabilityService {
  private readonly logger = new Logger(PrivacyPortabilityService.name)

  constructor(
    @InjectRepository(ProfileEntity) private readonly profiles: Repository<ProfileEntity>,
    @InjectRepository(EsnProfileEntity) private readonly esnProfiles: Repository<EsnProfileEntity>,
    @InjectRepository(SubscriptionEntity) private readonly subscriptions: Repository<SubscriptionEntity>,
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(ConsultantEntity) private readonly consultants: Repository<ConsultantEntity>,
    @InjectRepository(RagDocumentEntity) private readonly ragDocuments: Repository<RagDocumentEntity>,
    @InjectRepository(UserActionEntity) private readonly actions: Repository<UserActionEntity>,
    @InjectRepository(CreditLedgerEntity) private readonly creditLedger: Repository<CreditLedgerEntity>,
    @InjectRepository(UserSessionEntity) private readonly sessions: Repository<UserSessionEntity>,
    @InjectRepository(ProductEventEntity) private readonly events: Repository<ProductEventEntity>,
    private readonly retention: PrivacyRetentionService,
    private readonly exportService: PrivacyExportService,
    private readonly analytics: ProductAnalyticsService,
    // #1938.4 — en DERNIER : la spec construit ce service par position.
    @InjectRepository(NotificationSmsChannelEntity)
    private readonly smsChannels: Repository<NotificationSmsChannelEntity>,
  ) {}

  /** Le compteur de chaque objet, par clé de charge utile. */
  private counters(userId: string): Record<string, () => Promise<number>> {
    const own = { user_id: userId }
    return {
      profile: () => this.profiles.count({ where: own }),
      esnProfiles: () => this.esnProfiles.count({ where: own }),
      subscription: () => this.subscriptions.count({ where: own }),
      accounts: () => this.accounts.count({ where: own }),
      contacts: () => this.contacts.count({ where: own }),
      consultants: () => this.consultants.count({ where: own }),
      ragDocuments: () => this.ragDocuments.count({ where: own }),
      actions: () => this.actions.count({ where: own }),
      // Le grand livre porte le propriétaire ET l'auteur : la même règle que
      // l'export lui-même, sinon le compte annoncé et le fichier obtenu
      // diffèrent.
      creditLedger: () => this.creditLedger.count({ where: [{ owner_user_id: userId }, { actor_user_id: userId }] }),
      sessions: () => this.sessions.count({ where: own }),
      // #1938.4 — décision Louis 13/09 batch 13 : 0 ou 1 numéro pour les SMS.
      smsChannel: () => this.smsChannels.count({ where: own }),
    }
  }

  /**
   * Le manifeste de l'écran « Mes données ».
   *
   * Les comptes sont lus en parallèle et INDÉPENDAMMENT : un objet illisible
   * rend `null` et n'emporte pas les neuf autres. Un écran de réversibilité qui
   * tombe entier parce qu'une table est verrouillée serait précisément l'écran
   * qu'on ne peut pas montrer.
   */
  async buildManifest(userId: string): Promise<PortabilityManifest> {
    const counters = this.counters(userId)
    const objects = await Promise.all(
      PORTABLE_OBJECTS.map(async object => ({
        labelKey: object.labelKey,
        payloadKey: object.payloadKey,
        formats: [...object.formats],
        rows: await this.countOrNull(counters[object.payloadKey], object.payloadKey),
      })),
    )

    return {
      objects,
      // L'inventaire COMPLET, pas les seules exceptions du registre écrit :
      // dire ce qu'on laisse derrière en ne regardant que vingt-sept tables sur
      // cent quarante serait une réversibilité de façade.
      withheld: withheldFromExport(tableInventory()),
      lastExportedAt: await this.lastExportedAt(userId),
      // Le délai vient de la politique de conservation — pas d'un « 30 » écrit
      // ici, qui serait une seconde vérité sur le même fait (GA-26).
      deletionDelayDays:
        this.retention.getRetentionPolicy().rules.find(rule => rule.key === 'anonymized_records')?.days ?? 30,
    }
  }

  private async countOrNull(counter: (() => Promise<number>) | undefined, key: string): Promise<number | null> {
    if (!counter) return null
    try {
      return await counter()
    } catch (error) {
      this.logger.error(`portability count failed for ${key}`, { error })
      return null
    }
  }

  /** Le dernier export PERSONNEL réussi, relu du flux d'évènements — donc jamais
   *  une colonne de plus à tenir à jour. `null` = jamais, et c'est une réponse. */
  private async lastExportedAt(userId: string): Promise<string | null> {
    try {
      const row = await this.events.findOne({
        where: { user_id: userId, event_name: 'export_performed' },
        order: { occurred_at: 'DESC' },
      })
      return row?.occurred_at ? new Date(row.occurred_at).toISOString() : null
    } catch (error) {
      this.logger.error('portability lastExportedAt failed', { error })
      return null
    }
  }

  /**
   * Un seul objet, dans le format demandé.
   *
   * `payloadKey` est vérifié contre le CATALOGUE et jamais contre la charge
   * utile : accepter n'importe quelle clé rendrait exportable tout champ que
   * l'export ajoutera demain, sans décision.
   */
  async exportObject(userId: string, payloadKey: string, format: PortableFormat): Promise<PortableFile> {
    const object = PORTABLE_OBJECTS.find(candidate => candidate.payloadKey === payloadKey)
    if (!object) throw new BadRequestException(`Objet inconnu : ${payloadKey}`)

    const payload = (await this.exportService.buildExport(userId)) as unknown as Record<string, unknown>
    const value = payload[payloadKey]
    const rows = toRows(value)

    this.trace(userId, payloadKey, format, rows.length)

    const stamp = new Date().toISOString().slice(0, 10)
    if (format === 'json') {
      return {
        filename: `bellum-${payloadKey}-${stamp}.json`,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(value ?? null, null, 2),
      }
    }
    return {
      filename: `bellum-${payloadKey}-${stamp}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: toCsv(rows),
    }
  }

  /** Le journal : quoi, quand, par qui. Jamais le contenu. */
  private trace(userId: string, payloadKey: string, format: PortableFormat, rows: number): void {
    void this.analytics.track('export_performed', {
      userId,
      properties: {
        target: payloadKey,
        destination: PERSONAL_EXPORT_DESTINATION,
        format,
        // Un NOMBRE de lignes n'est pas de la donnée personnelle, et c'est ce
        // qui permet de reconnaître une extraction massive après coup.
        rows,
      },
    })
  }
}

/** Une valeur d'export, ramenée à des lignes. Un objet seul en fait une. */
function toRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[]
  if (value && typeof value === 'object') return [value as Record<string, unknown>]
  return []
}

/**
 * Les lignes en CSV (RFC 4180), avec DEUX précautions.
 *
 * 1. L'en-tête est l'UNION des champs rencontrés, dans l'ordre de première
 *    apparition : prendre les clés de la première ligne perdrait en silence
 *    tout champ que seules les suivantes portent.
 * 2. Une cellule qui commence par `=`, `+`, `-` ou `@` est préfixée d'une
 *    apostrophe. Sans ça, ouvrir l'export dans un tableur EXÉCUTE la cellule —
 *    un export est une donnée, jamais un programme, et c'est le vecteur par
 *    lequel un contact importé d'ailleurs devient une formule chez le client.
 */
function toCsv(rows: readonly Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const columns: string[] = []
  for (const row of rows) {
    for (const key of Object.keys(row)) if (!columns.includes(key)) columns.push(key)
  }
  const lines = [columns.map(escapeCsv).join(',')]
  for (const row of rows) lines.push(columns.map(column => escapeCsv(row[column])).join(','))
  return lines.join('\n')
}

function escapeCsv(value: unknown): string {
  // Absent reste VIDE. Écrire « null » ferait lire un mot là où il n'y a rien.
  if (value === null || value === undefined) return ''
  const raw = typeof value === 'object' ? JSON.stringify(value) : String(value)
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}
