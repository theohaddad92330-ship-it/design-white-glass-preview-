import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy, Optional } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, type EntityManager } from 'typeorm'
import { SHIPPED_PLAN_GRID } from '@bellum/contracts'
import { DirectDbService } from '../../database/direct-db.service'
import { AccountEntity } from '../../database/entities/account.entity'
import { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { SupabaseAuthGateway } from '../auth/supabase-auth.gateway'
import { DEMO_OPERATOR_ALERT, type DemoOperatorAlert } from './demo-alert-token'
import { DEMO_LEASE_TTL_DEFAULT_MINUTES, DemoResetService, demoReseedLockKey } from './demo-reset.service'
import { demoRoomRank, demoRoomVariantOf, demoSlotIndexFor, type DemoRoomVariant } from './demo-room-variant'

/** Verrou global du pool : sérialise le choix d'une salle entre tous les
 *  replicas de l'API. Transaction-scoped, donc relâché même sur erreur. */
const POOL_LOCK_KEY = 'bellum:demo-pool'

const DEFAULT_POOL_SIZE = 8

/** Nom affiché d'une salle. La n°1 garde le nom posé par l'opérateur. */
const ROOM_NAME_PREFIX = 'Démo Bellum'

export interface DemoSlot {
  workspaceId: string
  ownerUserId: string
  slotIndex: number
  /** La salle était DÉJÀ occupée par ce navigateur : on l'y remet sans rien
   *  effacer (rechargement de page, second onglet, retour 5 min plus tard). */
  reused: boolean
  /** Salle fraîchement provisionnée — déjà semée, rien à purger. */
  provisioned: boolean
  /** Pool saturé : on a repris la salle au bail le plus ancien alors qu'il
   *  courait encore. Le seul cas où un visiteur peut être interrompu. */
  recycledActive: boolean
  /** Bail d'AVANT cette location (`null` = jamais louée). Sert au reset à prouver
   *  qu'aucun visiteur n'a touché la salle depuis son dernier semis. */
  previousLeaseAt?: Date | null
  /** #3806 — salle servie EN SECOURS à l'ancienne empreinte (aucune à jour n'était prête) :
   *  ni réparée ni re-semée tant que son bail court. */
  staleFingerprint?: boolean
}

/**
 * #3578 — AUCUNE salle à jour n'est prête : le visiteur n'attend pas un re-semis
 * dans sa requête, il reçoit cet état et revient (l'écran dit « la démo se
 * prépare » et reprend seul). Le re-semis de la salle périmée est déjà parti en
 * arrière-plan.
 */
export interface DemoPreparing {
  preparing: true
  retryAfterSeconds: number
}

/** Ce que le client attend avant de redemander : de l'ordre d'un tour de poll,
 *  sous la limite de 5 appels/min de `POST /demo/session`. */
const PREPARING_RETRY_SECONDS = 15

/** #3578.2 — période du balayage des salles libérées (remise à neuf hors requête). */
const SWEEP_INTERVAL_MS = 120_000

/** Incident pool du 04/10/2026 — la clé d'élection du réplica qui balaie. Ne jamais la changer. */
const SWEEP_LEADER_KEY = 'bellum:demo-sweep-leader'

/** #3806 — « aucune salle à jour prête » au-delà de ce délai : ERROR (la supervision lit les ERROR)… */
const EXHAUSTED_ALERT_AFTER_MS = 120_000
/** …répétée au plus une fois par minute tant que l'épisode dure. */
const EXHAUSTED_ALERT_EVERY_MS = 60_000

export const isDemoPreparing = (outcome: DemoSlot | DemoPreparing | null): outcome is DemoPreparing =>
  outcome !== null && 'preparing' in outcome

/** Résultat d'une tentative de bail : une salle, ou « en préparation », et les
 *  salles périmées à re-semer en arrière-plan. */
interface Leased {
  slot: DemoSlot | null
  preparing: boolean
  toPrepare: Prep[]
}

/** #3578.2 — une salle à remettre en état HORS requête. `reset` = libérée par un
 *  visiteur (remise à neuf, bornée par son dernier bail) ; sinon, réparation du semis. */
interface Prep {
  room: Room
  reset: boolean
  previousLeaseAt: Date | null
}

/** Salle telle que lue en base pendant le bail. */
type Room = Pick<
  WorkspaceEntity,
  | 'id'
  | 'owner_user_id'
  | 'is_demo'
  | 'demo_slot_index'
  | 'demo_leased_at'
  | 'demo_lease_device'
  | 'demo_stale_served_at'
>

/**
 * Construit l'adresse e-mail de la salle `index` à partir de celle de la salle
 * n°1 (le compte dédié créé par l'opérateur). Sous-adressage `+` : même boîte,
 * identités distinctes côté Supabase Auth.
 *
 * Aucun courrier ne part jamais vers ces adresses (comptes sans mot de passe,
 * session ouverte par magic link consommé côté serveur, et le pool les
 * désabonne des e-mails produit) — l'adresse sert d'identité, pas de canal.
 */
export function demoPoolEmail(anchorEmail: string | undefined | null, index: number): string | null {
  const [local, domain] = (anchorEmail ?? '').split('@')
  if (!local || !domain) return null
  const base = local.split('+')[0]
  if (!base) return null
  return `${base}+demo${index}@${domain}`
}

/**
 * Pool de SALLES de démo — ce qui permet à plusieurs personnes d'être dans la
 * démo en même temps.
 *
 * Une salle = un workspace `is_demo` + SON utilisateur. Le lien partagé en loue
 * une par visiteur ; deux prospects ne partagent donc ni les dossiers, ni le fil
 * du copilote, ni les notifications — là où l'espace unique d'origine faisait
 * tout voir à tout le monde et effaçait le premier visiteur dès l'arrivée du
 * second.
 *
 * Trois règles portent la sûreté du dispositif :
 *
 *  - **la remise à neuf n'arrive que sur une salle LIBRE** (bail expiré), jamais
 *    pendant une présentation. C'était le défaut central de l'espace unique ;
 *  - **le navigateur retrouve sa salle** (cookie `bellum_did`) : un
 *    rechargement, un second onglet ou un robot qui suit le lien public ne
 *    consomme pas — et n'efface pas — une salle de plus ;
 *  - **le pool est borné** (`DEMO_POOL_SIZE`) et les salles sont créées à la
 *    demande. Un endpoint public ne peut donc pas faire créer un nombre
 *    illimité de comptes : au-delà de la borne, on recycle la plus ancienne.
 */
@Injectable()
export class DemoPoolService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DemoPoolService.name)
  private sweepTimer: ReturnType<typeof setInterval> | null = null
  private readonly repairing = new Map<string, Promise<void>>()
  /** INC-04-10 — un balayage tourne : le tick suivant saute au lieu d'en empiler un second. */
  private sweeping = false
  /** INC-04-10 — salles dont le dernier re-semis a échoué : elles passent APRÈS les
   *  autres au balayage suivant, pour qu'une salle en échec n'en bloque aucune. */
  private readonly lastFailed = new Set<string>()
  /** #3806 — début (ms) de l'épisode « aucune salle à jour prête » vu par CE réplica ; `null` hors épisode. */
  private noFreshSince: number | null = null
  /** #3806 — dernière alerte ERROR de l'épisode (au plus une par minute). */
  private lastExhaustedAlertAt: number | null = null

  constructor(
    private readonly config: ConfigService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly gateway: SupabaseAuthGateway,
    private readonly reset: DemoResetService,
    @Optional() private readonly direct?: DirectDbService,
    // #4035.3 — l'alerte opérateur existante. Absente : le pool tourne comme avant.
    @Optional() @Inject(DEMO_OPERATOR_ALERT) private readonly alerts?: DemoOperatorAlert,
  ) {}

  /**
   * #4035.3 — la panne de la salle démo part AUSSI vers l'opérateur (Slack si un webhook est posé, sinon e-mail),
   * pas seulement au journal : le 11/10, ~8 h de « Préparation de ta démo… » sans que personne ne le sache.
   * Ne lève JAMAIS — une alerte en échec ne ferme ni la porte ni le pool.
   */
  private async alertOperator(subject: string, title: string, detail: string, resolved: boolean): Promise<void> {
    if (!this.alerts) return
    try {
      await this.alerts.dispatch({ kind: 'salle_demo_indisponible', subject, title, detail, resolved })
    } catch (error) {
      this.logger.warn('Demo pool: could not dispatch the operator alert (non-fatal)', { error })
    }
  }

  private poolSize(): number {
    const raw = Number(this.config.get('demoPoolSize'))
    return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_POOL_SIZE
  }

  private leaseTtlMs(): number {
    const raw = Number(this.config.get('demoLeaseTtlMinutes'))
    const minutes = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEMO_LEASE_TTL_DEFAULT_MINUTES
    return minutes * 60_000
  }

  /** Bail en cours (moins de `DEMO_LEASE_TTL_MINUTES` depuis la dernière activité). */
  private isLive(room: Room, now: number): boolean {
    return room.demo_leased_at !== null && now - new Date(room.demo_leased_at).getTime() < this.leaseTtlMs()
  }

  /**
   * Loue une salle au visiteur. `null` = aucun espace de démo n'existe encore
   * sur cet environnement (l'opérateur doit créer le premier).
   *
   * La purge/le semis se font APRÈS la transaction de bail : la salle est déjà
   * réservée, donc personne d'autre ne peut la prendre pendant, et le verrou du
   * pool n'est pas immobilisé le temps de ~35 DELETE.
   */
  async acquire(
    deviceId: string | null,
    variant: DemoRoomVariant = 'staffing',
  ): Promise<DemoSlot | DemoPreparing | null> {
    let leased: Leased
    try {
      leased = await this.leaseSlot(deviceId, { allowProvisioning: true, variant })
    } catch (error) {
      // Créer une salle suppose un appel à Supabase Auth. S'il échoue, la démo
      // ne doit pas tomber : on repart sur les salles existantes.
      this.logger.error('Demo pool: provisioning failed — falling back to an existing room', { error })
      leased = await this.leaseSlot(deviceId, { allowProvisioning: false, variant })
    }
    // #3578 — une salle périmée croisée en chemin se re-sème ICI, après la transaction et sans que personne
    // l'attende. #3578 (recette Z1 04/10) — UNE SEULE à la fois, et jamais si un re-semis tourne déjà : sinon
    // chaque visiteur lançait en parallèle la purge + le semis de TOUTES les salles périmées (jusqu'à 8 × 258
    // tables), elles se disputaient le pool Postgres (INC-04-10) et la première salle ne devenait prête qu'après
    // 50 s et plus. Une seule va au bout vite ; les autres suivent au balayage (`sweepOneRoom`), une par une.
    const first = leased.toPrepare[0]
    if (first && this.repairing.size === 0) {
      void this.prepareInBackground(
        first.room.id,
        first.room.owner_user_id,
        first.reset ? first.previousLeaseAt : undefined,
      )
    }
    if (leased.preparing) return { preparing: true, retryAfterSeconds: PREPARING_RETRY_SECONDS }
    const slot = leased.slot
    if (!slot) return null

    // #3578.2 — le visiteur n'appelle JAMAIS ni la remise à neuf ni le semis :
    // le pool ne lui sert qu'une salle déjà prête et intacte.
    if (slot.provisioned) {
      // Salle NEUVE : son semis (~50 s) part en arrière-plan ; le visiteur reçoit
      // « en préparation » et reprend seul (sa salle lui est déjà réservée).
      await this.optOutOfProductEmails(slot.ownerUserId)
      // `seeded: false` = la salle portait DÉJÀ des dossiers (espace `is_demo`
      // reconverti) : rien n'a été écrit, et rien ne dit que le semis d'avant
      // avait FINI → on répare si elle est tronquée. INC-04-10 — le tout sous le
      // verrou de re-semis de la salle, pour qu'aucun autre replica ne la purge
      // au milieu de son semis.
      void this.runOnce(slot.workspaceId, () => this.reset.seedNewRoom(slot.workspaceId, slot.ownerUserId))
      return { preparing: true, retryAfterSeconds: PREPARING_RETRY_SECONDS }
    }
    if (slot.reused && !slot.staleFingerprint) {
      // Le visiteur revient dans SA salle (à jour, sinon elle serait partie en
      // re-semis). Garde-fou : une lecture, jamais une purge si elle est entière.
      // #3806 — sauf la salle servie en secours : re-semée à la FIN de son bail, jamais sous son visiteur.
      // R35 — et JAMAIS dans la requête : le visiteur est servi tout de suite.
      return this.settleWithoutWaiting(slot)
    }
    return slot
  }

  /**
   * #3578 — remet une salle en état HORS de toute requête de visiteur.
   * `previousLeaseAt` défini = salle libérée à remettre à neuf ; `undefined` =
   * réparation d'un semis périmé/tronqué. Un seul travail par salle à la fois
   * (par process ; entre replicas, le verrou consultatif de `resetWorkspace`
   * sérialise). Ne lève jamais.
   */
  private prepareInBackground(workspaceId: string, ownerUserId: string, previousLeaseAt?: Date | null): Promise<void> {
    return this.runOnce(workspaceId, async () => {
      if (previousLeaseAt === undefined) await this.reset.repairIfIncomplete(workspaceId, ownerUserId)
      else
        await this.reset.resetWorkspaceUnlessFresh(
          workspaceId,
          ownerUserId,
          undefined,
          previousLeaseAt,
          this.leaseTtlMs(),
        )
    })
  }

  private runOnce(workspaceId: string, work: () => Promise<unknown>): Promise<void> {
    const inFlight = this.repairing.get(workspaceId)
    if (inFlight) return inFlight
    const job = Promise.resolve()
      .then(work)
      .then(async () => {
        const wasFailing = this.lastFailed.delete(workspaceId)
        // #4035.3 — la transition « réparée » ferme l'alerte (dispatch ignore ce qui n'a jamais sonné).
        if (wasFailing)
          await this.alertOperator(workspaceId, `Salle ${workspaceId} réparée`, 'Le re-semis a réussi.', true)
      })
      .catch(async (error: unknown) => {
        this.lastFailed.add(workspaceId)
        this.logger.error('Demo pool: background re-seed failed — the room stays out of service until the next try', {
          error,
          workspaceId,
        })
        await this.alertOperator(
          workspaceId,
          `Le re-semis de la salle ${workspaceId} échoue`,
          `Le re-semis en arrière-plan a échoué : ${error instanceof Error ? error.message : String(error)}\n` +
            'La salle reste hors service jusqu’au prochain essai ; sans salle fraîche, les prospects voient « Préparation de ta démo… ».',
          false,
        )
      })
      .finally(() => this.repairing.delete(workspaceId))
    this.repairing.set(workspaceId, job)
    return job
  }

  /**
   * #3578 — au démarrage de l'API (donc après chaque déploiement), les salles
   * LIBRES dont l'empreinte est périmée sont re-semées en arrière-plan, UNE à la
   * fois : le premier visiteur trouve une salle fraîche, ou l'état « en
   * préparation », jamais un re-semis dans sa requête. Une salle occupée n'est
   * jamais touchée (son visiteur la garde ; `renewLease` la rattrape).
   */
  async warmStaleRooms(): Promise<void> {
    // INC-04-10 — un seul balayage à la fois par process : un tick qui tombe
    // pendant un re-semis de 60-180 s ne relance rien.
    if (this.sweeping) return
    this.sweeping = true
    try {
      // Incident pool du 04/10/2026 — avec la connexion dédiée configurée, UN
      // seul réplica balaie : l'élu du verrou consultatif de SESSION (fiable hors
      // pooler transaction, relâché par Postgres si l'élu meurt — un autre le
      // reprend au tick suivant). Les autres ne lisent rien. Sans elle : chemin
      // d'avant (chaque réplica balaie, le verrou par salle sérialise).
      if (this.direct?.configured && !(await this.direct.isLeader(SWEEP_LEADER_KEY))) return
      // #3806 — tant qu'AUCUNE salle à jour n'est prête (changement d'empreinte : toutes périmées d'un coup),
      // le balayage n'attend pas les 120 s du tick suivant : il ENCHAÎNE la salle libre suivante dès que la
      // précédente est finie (ou a échoué), jusqu'à une salle prête. Toujours une seule à la fois (INC-04-10),
      // jamais une salle sous bail vivant, et chaque salle au plus une fois par balayage (`tried`).
      const tried = new Set<string>()
      let pass = await this.sweepOneRoom(tried, { onlyIfNoFresh: false })
      for (let n = 0; pass.prepared && pass.freshReady === 0 && n < this.poolSize(); n++) {
        pass = await this.sweepOneRoom(tried, { onlyIfNoFresh: true })
      }
    } finally {
      this.sweeping = false
    }
  }

  /**
   * INC-04-10 — AU PLUS UNE salle remise à neuf par passe : un re-semis purge
   * 258 tables, et en enchaîner plusieurs EN PARALLÈLE (sur chaque replica)
   * saturait le pool Postgres partagé jusqu'au login de prod. Les salles en
   * échec au dernier essai passent en dernier, pour ne pas bloquer les autres.
   *
   * #3806 — la passe compte les salles LIBRES à jour (`freshReady`) et remet à
   * neuf d'abord une salle inservable, AVANT une salle ancienne encore servable
   * en secours : celle-là évite un 503 pendant que l'autre se prépare.
   * `onlyIfNoFresh` : passe enchaînée, qui ne prépare rien s'il y a déjà une salle prête.
   */
  private async sweepOneRoom(
    tried: Set<string>,
    opts: { onlyIfNoFresh: boolean },
  ): Promise<{ prepared: boolean; freshReady: number }> {
    const rooms = await this.dataSource.transaction(trx => this.listRooms(trx))
    const now = Date.now()
    const ttl = this.leaseTtlMs()
    const ordered = [
      ...rooms.filter(room => !this.lastFailed.has(room.id)),
      ...rooms.filter(room => this.lastFailed.has(room.id)),
    ]
    let freshReady = 0
    const unservable: Prep[] = []
    const staleServable: Prep[] = []
    for (const room of ordered) {
      const live = room.demo_leased_at !== null && now - new Date(room.demo_leased_at).getTime() < ttl
      if (live) continue
      // #3578.2 — libre : servable seulement si prête ET intacte. Une salle libérée
      // par un visiteur est remise à neuf ICI (balayage), pas à la requête suivante.
      const previousLeaseAt = room.demo_leased_at ? new Date(room.demo_leased_at) : null
      if (await this.readyOf(room, previousLeaseAt)) {
        freshReady++
        continue
      }
      if (tried.has(room.id)) continue
      const prep: Prep = { room, reset: true, previousLeaseAt }
      if (await this.staleServableOf(room, previousLeaseAt)) staleServable.push(prep)
      else unservable.push(prep)
    }
    if (freshReady > 0) this.noteFreshRoom()
    if (opts.onlyIfNoFresh && freshReady > 0) return { prepared: false, freshReady }
    const next = unservable[0] ?? staleServable[0]
    if (!next) return { prepared: false, freshReady }
    tried.add(next.room.id)
    await this.prepareInBackground(next.room.id, next.room.owner_user_id, next.previousLeaseAt)
    return { prepared: true, freshReady }
  }

  onApplicationBootstrap(): void {
    // Sans lien de démo configuré, strict no-op : aucune lecture, aucune salle.
    if (this.config.get<string>('demoPublic') !== 'true' && !this.config.get<string>('demoLinkToken')) return
    const sweep = (): void => {
      void this.warmStaleRooms().catch((error: unknown) => {
        this.logger.error('Demo pool: warm-up failed (non-fatal)', { error })
      })
    }
    sweep()
    // #3578.2 — un visiteur qui part ne prévient personne : le bail expire seul.
    // Ce balayage remet à neuf les salles libérées avant que le visiteur suivant
    // n'arrive (sinon il recevrait « en préparation » au lieu d'une salle prête).
    this.sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS)
    this.sweepTimer.unref?.()
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer)
  }

  /** Salle à jour ET entière. Une lecture qui échoue = « pas prête » (#3747) : jamais une salle partielle. */
  private async readyOf(room: Room, servableAfter?: Date | null): Promise<boolean> {
    // #3578.2 — une salle en cours de remise à neuf n'est pas servable, même si ses
    // lignes d'avant la purge se lisent encore « prêtes » (transaction non validée).
    if (this.repairing.has(room.id)) return false
    try {
      // `servableAfter` défini = salle LIBRE : prête ET intacte depuis son dernier bail.
      if (servableAfter !== undefined) {
        return await this.reset.isRoomServable(room.id, room.owner_user_id, servableAfter)
      }
      return await this.reset.isRoomReady(room.id, room.owner_user_id)
    } catch (error) {
      // #3747.2 — le doute ne profite PLUS au visiteur : servir une salle dont on n'a pas pu lire l'état,
      // c'est risquer de la servir à moitié semée (1 compte sur 14, recette du 06/10). « En préparation » à la
      // place : l'écran d'attente reprend seul, et le balayage relit la salle.
      this.logger.warn('Demo pool: could not read a room’s freshness — treated as NOT ready', {
        error,
        roomId: room.id,
      })
      return false
    }
  }

  /**
   * #3806 — salle LIBRE à l'ancienne empreinte, servable en SECOURS : semis fini (jamais en cours — ni sur ce
   * réplica, ni ailleurs : l'empreinte est effacée dès le début d'une purge) et intacte depuis son dernier bail.
   * Une lecture qui échoue = non (même règle que `readyOf`).
   */
  private async staleServableOf(room: Room, previousLeaseAt: Date | null): Promise<boolean> {
    if (this.repairing.has(room.id)) return false
    try {
      return await this.reset.isStaleRoomServable(room.id, room.owner_user_id, previousLeaseAt)
    } catch (error) {
      this.logger.warn('Demo pool: could not read a stale room’s state — not served as a fallback', {
        error,
        roomId: room.id,
      })
      return false
    }
  }

  /**
   * #3806 — le verrou de re-semis de la salle est-il LIBRE ? Tenté sans attendre, DANS la transaction du bail :
   * tenu ailleurs, une purge tourne (autre réplica) et la salle n'est pas servie ; obtenu, il reste tenu jusqu'au
   * commit du bail, si bien qu'aucune purge ne peut démarrer entre la lecture et la location.
   */
  private async reseedLockFree(trx: EntityManager, roomId: string): Promise<boolean> {
    const rows = (await trx.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked', [
      demoReseedLockKey(roomId),
    ])) as Array<{ locked?: unknown }> | undefined
    return rows?.[0]?.locked === true
  }

  /** #3806 — une salle à jour a été servie (ou vue prête) : l'épisode « aucune salle prête » est clos. */
  private noteFreshRoom(): void {
    // #4035.3 — l'épisode avait sonné : sa fin se dit aussi (sinon l'alerte reste « en cours » pour l'opérateur).
    if (this.lastExhaustedAlertAt !== null) {
      void this.alertOperator(
        'pool-epuise',
        'Salles de démonstration de nouveau prêtes',
        'Une salle fraîche est servie.',
        true,
      )
    }
    this.noFreshSince = null
    this.lastExhaustedAlertAt = null
  }

  /**
   * #3806 — « no fresh room ready » : l'épisode commence (horodatage gardé en mémoire de CE réplica) ; au-delà
   * de 2 min, ERROR `demo pool exhausted for <n>s`, au plus une fois par minute — la supervision lit les ERROR.
   */
  private noteNoFreshRoom(): void {
    const now = Date.now()
    if (this.noFreshSince === null) {
      this.noFreshSince = now
      return
    }
    const elapsed = now - this.noFreshSince
    if (elapsed <= EXHAUSTED_ALERT_AFTER_MS) return
    if (this.lastExhaustedAlertAt !== null && now - this.lastExhaustedAlertAt < EXHAUSTED_ALERT_EVERY_MS) return
    this.lastExhaustedAlertAt = now
    this.logger.error(`demo pool exhausted for ${Math.floor(elapsed / 1000)}s`)
    void this.alertOperator(
      'pool-epuise',
      'Aucune salle de démonstration fraîche',
      `Aucune salle à jour n'est prête depuis ${Math.floor(elapsed / 1000)} s : les prospects voient « Préparation de ta démo… ».`,
      false,
    )
  }

  /**
   * Remettre une salle en état ne doit JAMAIS empêcher d'y entrer.
   *
   * Mesuré en production le 28/08, une heure après la mise en service de la
   * réparation : la salle était bien détectée incomplète — c'est le travail de
   * la réparation, et elle l'a fait — mais le RE-SEMIS échouait sur
   * `missions_opportunity_uniq`, et l'exception remontait jusqu'à
   * `POST /demo/session`. Résultat : **500 pour tous les prospects**, sur la
   * seule surface publique du produit, à cause d'une salle imparfaite.
   *
   * Le compromis se pose tout seul dès qu'on l'écrit : une salle tronquée est
   * une visite pauvre, une porte fermée est une visite impossible. On garde donc
   * la salle telle qu'elle est, on NOMME ce qui a échoué dans le journal, et le
   * visiteur entre. Le défaut du semis se corrige à sa place — il vient de
   * l'être — mais aucune correction future ne doit pouvoir refermer la porte.
   */
  private async tidy(workspaceId: string, ownerUserId: string, kind: 'repair'): Promise<void> {
    try {
      await this.reset.repairIfIncomplete(workspaceId, ownerUserId)
    } catch (error) {
      this.logger.error(`Demo pool: ${kind} failed — the room is served AS IS rather than refused`, {
        error,
        workspaceId,
      })
    }
  }

  /**
   * #3511 — le bail suit l'ACTIVITÉ, pas l'heure d'entrée. Re-date le bail de la
   * salle que ce navigateur tient ; `null` si aucune (jamais louée à lui, ou
   * reprise par un autre visiteur depuis). Un bail échu mais non repris se
   * renouvelle : la purge n'a lieu qu'à la location suivante, donc rien n'a été
   * effacé et la personne retrouve sa salle intacte.
   */
  async renewLease(deviceId: string): Promise<DemoSlot | null> {
    const slot = await this.dataSource.transaction(async (trx: EntityManager) => {
      await trx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [POOL_LOCK_KEY])
      const rooms = await this.listRooms(trx)
      const mine = rooms.find(room => room.demo_lease_device === deviceId)
      if (!mine) return null
      // #3806 — salle servie en secours dont le bail court : elle garde son marqueur et n'est PAS réparée
      // (re-semée à la fin du bail). Bail échu : location normale, marqueur effacé, réparation comme avant.
      const servingStale = mine.demo_stale_served_at != null && this.isLive(mine, Date.now())
      const claimed = await this.claim(trx, mine, deviceId, { reused: true, keepStaleMark: servingStale })
      return servingStale ? { ...claimed, staleFingerprint: true } : claimed
    })
    // #3420 / #3270 (recette Y20) — une session qui traverse un déploiement ne
    // repasse jamais par `acquire` : seul ce renouvellement la rejoint. Sans cette
    // vérification, la salle gardait pour toujours le jeu de données d'AVANT (le
    // message d'exemple, l'ESN rang 2 de Société Générale « absents » alors que
    // le semis est sur main). R35 — la vérification ne fait JAMAIS attendre le
    // visiteur : voir {@link settleWithoutWaiting}.
    if (slot && !slot.staleFingerprint) return this.settleWithoutWaiting(slot)
    return slot
  }

  /**
   * R35 (16/10/2026) — un visiteur n'attend JAMAIS un re-semis, ni dans `POST /demo/session`, ni dans son
   * battement de bail.
   *
   * Panne du 16/10 (13:23-13:28) : `renewLease` ATTENDAIT `repairIfIncomplete`, donc la purge puis le re-semis de
   * 40 à 90 s ; le navigateur, sans réponse, retentait (trois renouvellements simultanés) et affichait « Le serveur ne
   * répond pas ». Désormais, la salle est servie TELLE QUELLE à l'instant, et ce qui reste à faire part en fond :
   *  - salle PÉRIMÉE mais entière (semis fini d'un déploiement antérieur) : servie en secours, marquée ; elle est
   *    re-semée à la FIN du bail, par le balayage — jamais purgée sous les yeux de celui qui la présente (#3806) ;
   *  - salle tronquée : réparée en arrière-plan (une salle à moitié vide ne vaut pas qu'on la protège) ;
   *  - salle à jour et entière : une lecture, rien d'autre.
   */
  private settleWithoutWaiting(slot: DemoSlot): DemoSlot {
    const { workspaceId, ownerUserId } = slot
    void this.runOnce(workspaceId, async () => {
      let staleButWhole = false
      try {
        staleButWhole = await this.reset.isStaleRoomServable(workspaceId, ownerUserId, null)
      } catch (error) {
        this.logger.warn('Demo pool: could not read a leased room’s state — left as is', { error, workspaceId })
        return
      }
      if (staleButWhole) {
        // #4810 — le marqueur porte la date du BAIL, jamais `new Date()`. Posé ici, APRÈS la transaction de
        // bail, un `new Date()` tombe quelques centaines de ms plus tard que `demo_leased_at` — et c'est ce
        // décalage-là qui a condamné les cinq salles staffing du 29/10 (voir `resetUnlessFreshLocked`).
        // L'invariant tenu ici (« marqueur = bail ») ne remplace pas la grâce côté re-semis : il la double.
        const repo = this.dataSource.getRepository(WorkspaceEntity)
        const leasedAt = (await repo.findOne({ where: { id: workspaceId }, select: { demo_leased_at: true } }))
          ?.demo_leased_at
        await repo.update({ id: workspaceId }, { demo_stale_served_at: leasedAt ? new Date(leasedAt) : new Date() })
        this.logger.warn(
          `Demo pool: room ${workspaceId} is stale but whole — served as is, re-seeded when its lease ends`,
        )
        return
      }
      await this.tidy(workspaceId, ownerUserId, 'repair')
    })
    return slot
  }

  private async leaseSlot(
    deviceId: string | null,
    opts: { allowProvisioning: boolean; variant: DemoRoomVariant },
  ): Promise<Leased> {
    return this.dataSource.transaction(async (trx: EntityManager): Promise<Leased> => {
      await trx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [POOL_LOCK_KEY])

      const all = await this.listRooms(trx)
      if (all.length === 0) return { slot: null, preparing: false, toPrepare: [] }

      const now = Date.now()
      // #4291 J — deux espaces démo (staffing, forfait / conseil) dans LE MÊME pool : le visiteur ne voit que les
      // salles de la variante demandée, et tout ce qui suit (bail, remise à neuf, provisionnement) n'y touche
      // qu'à elles. Un appareil tient UNE salle : passer d'une démo à l'autre rend celle de l'autre variante.
      if (deviceId) await this.releaseOtherVariant(trx, all, deviceId, opts.variant, now)
      const rooms = all.filter(room => demoRoomVariantOf(room.demo_slot_index) === opts.variant)
      const isLive = (room: Room): boolean => this.isLive(room, now)
      const serve = (slot: DemoSlot): Leased => ({ slot, preparing: false, toPrepare })
      // #3806 — une salle À JOUR est servie : l'épisode « aucune salle prête » est clos.
      const serveFresh = (slot: DemoSlot): Leased => {
        this.noteFreshRoom()
        return serve(slot)
      }

      // #3578 — une salle périmée ou tronquée n'est JAMAIS servie : la re-semer
      // coûte ~70 s, qu'un visiteur ne doit pas attendre. Elle part en
      // arrière-plan (après la transaction) pendant qu'une salle FRAÎCHE est servie.
      const toPrepare: Prep[] = []
      const leaseOf = (room: Room): Date | null => (room.demo_leased_at ? new Date(room.demo_leased_at) : null)

      // 1. Ce navigateur occupe déjà une salle → il y retourne, intacte — si elle est à jour.
      if (deviceId) {
        const mine = rooms.find(room => room.demo_lease_device === deviceId && isLive(room))
        if (mine) {
          if (await this.readyOf(mine)) return serveFresh(await this.claim(trx, mine, deviceId, { reused: true }))
          // #3806 — la salle servie en secours à ce navigateur : il y retourne telle quelle, sans réparation ;
          // elle sera re-semée à la fin de son bail, jamais sous ses yeux.
          if (mine.demo_stale_served_at != null) {
            // 14/10 (log prod : room=7 reused=true en boucle, jamais re-semée) — chaque retour RENOUVELAIT le bail
            // de secours, qui n'expirait donc jamais : le prospect gardait l'ancienne démo indéfiniment. Dès qu'une
            // salle LIBRE à jour est prête, il y passe (il relance la démo : aucune purge sous ses pieds) et la salle
            // périmée est libérée — marqueur effacé, bail échu — puis re-semée en arrière-plan.
            for (const fresh of rooms.filter(room => room.id !== mine.id && !isLive(room))) {
              if (!(await this.readyOf(fresh, leaseOf(fresh)))) continue
              const expired = new Date(now - this.leaseTtlMs() - 1000)
              await trx
                .getRepository(WorkspaceEntity)
                .update(
                  { id: mine.id },
                  { demo_lease_device: null, demo_leased_at: expired, demo_stale_served_at: null },
                )
              this.logger.warn(
                `Demo pool: room ${mine.demo_slot_index} was a stale-fingerprint fallback — visitor moved to fresh room ${fresh.demo_slot_index}, stale one released for re-seed`,
              )
              toPrepare.push({ room: mine, reset: true, previousLeaseAt: expired })
              return serveFresh(await this.releaseStaleMine(trx, [], deviceId, fresh))
            }
            const back = await this.claim(trx, mine, deviceId, { reused: true, keepStaleMark: true })
            return serve({ ...back, staleFingerprint: true })
          }
          toPrepare.push({ room: mine, reset: false, previousLeaseAt: null })
        }
      }

      // 2. Une salle libre ET à jour (jamais louée d'abord, puis le bail le plus ancien).
      const free = rooms.filter(room => !isLive(room)).sort((a, b) => leaseTime(a) - leaseTime(b))
      for (const room of free) {
        // #3578.2 — libre = prête ET intacte. Une salle que le visiteur précédent a
        // touchée part en remise à neuf d'arrière-plan ; on sert une autre salle.
        if (await this.readyOf(room, leaseOf(room))) {
          return serveFresh(await this.releaseStaleMine(trx, toPrepare, deviceId, room))
        }
        toPrepare.push({ room, reset: true, previousLeaseAt: leaseOf(room) })
      }

      // 2 bis. #3806 — AUCUNE salle libre à jour (changement d'empreinte : toutes périmées d'un coup). Plutôt
      //    qu'un 503, une salle LIBRE à l'ANCIENNE empreinte — semis fini, intacte, et dont aucune purge ne
      //    tourne (verrou de re-semis tenté ici, tenu jusqu'au commit du bail). Marquée : re-semée à la fin de
      //    son bail. Les AUTRES salles libres partent en préparation (après la transaction), jamais celle-ci.
      for (const room of free) {
        if (!(await this.staleServableOf(room, leaseOf(room)))) continue
        if (!(await this.reseedLockFree(trx, room.id))) continue
        const slot = await this.releaseStaleMine(trx, toPrepare, deviceId, room, { staleServed: true })
        const others = toPrepare.filter(prep => prep.room.id !== room.id)
        const preparingCount = new Set([...others.map(prep => prep.room.id), ...this.repairing.keys()]).size
        this.logger.warn(
          `Demo pool: serving stale-fingerprint room while fresh ones seed (room ${room.demo_slot_index} ; ` +
            `0 ready, ${preparingCount} preparing)`,
        )
        this.noteNoFreshRoom()
        return { slot: { ...slot, staleFingerprint: true }, preparing: false, toPrepare: others }
      }

      // 3. Tout est occupé mais le pool n'est pas plein → une salle de plus (toute neuve,
      //    donc seule à demander un semis ici). Pas tant qu'une salle périmée se prépare :
      //    elle sera prête avant qu'une nouvelle soit créée et semée.
      if (opts.allowProvisioning && rooms.length < this.poolSize() && toPrepare.length === 0) {
        return serve(await this.provisionRoom(trx, all, rooms, deviceId, opts.variant))
      }

      // 4. Pool saturé : on reprend le bail le plus ancien QUI EST À JOUR. Choix assumé —
      //    refuser la démo à un prospect serait pire que d'interrompre la session la plus
      //    vieille, probablement déjà abandonnée.
      if (free.length === 0) {
        const byAge = [...rooms].sort((a, b) => leaseTime(a) - leaseTime(b))
        for (const lru of byAge) {
          if (!(await this.readyOf(lru))) continue
          this.logger.warn(
            `Demo pool saturated (${rooms.length}/${this.poolSize()} rooms busy) — recycling room ${lru.demo_slot_index}`,
          )
          // #3578.2 — la salle reprise à un visiteur porte ses traces : on la lui
          // réserve (bail à ce navigateur), on la remet à neuf EN ARRIÈRE-PLAN et
          // on répond « en préparation » ; il la retrouve (`mine`) dès qu'elle est prête.
          const previousLeaseAt = leaseOf(lru)
          const recycled = await this.releaseStaleMine(trx, toPrepare, deviceId, lru, { recycledActive: true })
          if (await this.readyOf(lru, previousLeaseAt)) return serveFresh(recycled) // intacte : rien à effacer
          toPrepare.push({ room: lru, reset: true, previousLeaseAt })
          return { slot: null, preparing: true, toPrepare }
        }
      }

      // #3806 — mesuré en prod le 07/10 (~26 min) : un déploiement qui change
      // l'empreinte de semis périme le pool ENTIER d'un coup, chaque salle
      // encore sous bail (< 30 min). `sweepOneRoom` ne touche JAMAIS une salle
      // vivante — règle de sûreté du pool, « la remise à neuf n'arrive que sur
      // une salle LIBRE, jamais pendant une présentation » — et la boucle
      // ci-dessus ne pousse rien dans `toPrepare` tant qu'aucune salle n'est
      // `readyOf` : aucun re-semis n'était donc JAMAIS planifié, pour personne,
      // jusqu'à l'expiration naturelle d'un bail. On ne purge ni ne réaffecte
      // aucune salle (leur visiteur peut encore y être) : on avance d'une salle
      // SUPPLÉMENTAIRE — une seule, au-delà du format configuré — pour qu'une
      // salle fraîche existe sans attendre un bail.
      //
      // Arbitrage nommé (à trancher plus tard si besoin) : cette salle de plus
      // ne se retire jamais (aucun mécanisme de retrait du pool n'existe), donc
      // le format effectif grandit d'une unité à CHAQUE déploiement qui périme
      // le pool entier pendant qu'il est plein. Plafonné à UNE seule salle
      // d'avance (jamais une boucle de provisionnement) : si le pool, déjà élargi,
      // se périme et se sature de nouveau avant qu'un bail n'expire, le visiteur
      // suivant retrouve l'attente d'avant plutôt qu'une croissance sans borne.
      if (opts.allowProvisioning && toPrepare.length === 0 && rooms.length < this.poolSize() + 1) {
        return serve(await this.provisionRoom(trx, all, rooms, deviceId, opts.variant))
      }

      // 5. Aucune salle à jour n'est prête : « en préparation », jamais une erreur.
      this.logger.warn(`Demo pool: no fresh room ready — ${toPrepare.length} being re-seeded in the background`)
      this.noteNoFreshRoom() // #3806 — alerte ERROR si l'épisode dépasse 2 min
      return { slot: null, preparing: true, toPrepare }
    })
  }

  /**
   * #4291 J — l'appareil qui demande une variante lâche la salle qu'il tenait dans l'AUTRE : bail échu, sans
   * purge dans la requête (le balayage la remettra à neuf, comme toute salle libérée). Sans cela, l'appareil
   * tiendrait deux salles et le renouvellement silencieux (`renewLease`, par appareil) en choisirait une au hasard.
   */
  private async releaseOtherVariant(
    trx: EntityManager,
    all: Room[],
    deviceId: string,
    variant: DemoRoomVariant,
    now: number,
  ): Promise<void> {
    const expired = new Date(now - this.leaseTtlMs() - 1000)
    for (const room of all) {
      if (room.demo_lease_device !== deviceId || demoRoomVariantOf(room.demo_slot_index) === variant) continue
      const patch = {
        demo_lease_device: null,
        demo_leased_at: this.isLive(room, now) ? expired : room.demo_leased_at,
        demo_stale_served_at: null,
      }
      await trx.getRepository(WorkspaceEntity).update({ id: room.id }, patch)
      Object.assign(room, patch)
    }
  }

  /** Loue `room` ; si ce navigateur tenait une salle périmée, il la lâche (elle expire d'elle-même). */
  private async releaseStaleMine(
    trx: EntityManager,
    stale: Prep[],
    deviceId: string | null,
    room: Room,
    flags: { recycledActive?: boolean; staleServed?: boolean } = {},
  ): Promise<DemoSlot> {
    const previousLeaseAt = room.demo_leased_at ? new Date(room.demo_leased_at) : null
    if (deviceId) {
      for (const { room: old } of stale.filter(p => p.room.demo_lease_device === deviceId && p.room.id !== room.id)) {
        await trx.getRepository(WorkspaceEntity).update({ id: old.id }, { demo_lease_device: null })
      }
    }
    return { ...(await this.claim(trx, room, deviceId, flags)), previousLeaseAt }
  }

  /**
   * Les salles existantes, plus vieille d'abord. Adopte au passage tout espace
   * `is_demo` sans numéro : celui que l'opérateur a créé via le backoffice
   * devient la salle n°1, sans intervention ni migration de données.
   */
  private async listRooms(trx: EntityManager): Promise<Room[]> {
    const repo = trx.getRepository(WorkspaceEntity)
    const rooms = await repo.find({ where: { is_demo: true }, order: { created_at: 'ASC' } })

    // #4291 J — un espace opérateur sans numéro devient une salle STAFFING : les numéros forfait n'entrent pas ici.
    let next = rooms.reduce(
      (max, room) =>
        demoRoomVariantOf(room.demo_slot_index) === 'staffing' ? Math.max(max, room.demo_slot_index ?? 0) : max,
      0,
    )
    for (const room of rooms) {
      if (room.demo_slot_index != null) continue
      room.demo_slot_index = ++next
      await repo.update({ id: room.id }, { demo_slot_index: room.demo_slot_index })
    }
    return rooms
  }

  private async claim(
    trx: EntityManager,
    room: Room,
    deviceId: string | null,
    flags: { reused?: boolean; recycledActive?: boolean; staleServed?: boolean; keepStaleMark?: boolean },
  ): Promise<DemoSlot> {
    const leasedAt = new Date()
    // #3806 — servie en secours : le marqueur porte la date même du bail (le re-semis décidé AVANT se reconnaît
    // sous le verrou : marqueur postérieur à son bail d'alors). Bail de secours renouvelé : marqueur gardé.
    // Toute autre location l'efface.
    const staleMark = flags.staleServed
      ? { demo_stale_served_at: leasedAt }
      : flags.keepStaleMark
        ? {}
        : room.demo_stale_served_at != null
          ? { demo_stale_served_at: null }
          : {}
    await trx
      .getRepository(WorkspaceEntity)
      .update({ id: room.id }, { demo_leased_at: leasedAt, demo_lease_device: deviceId, ...staleMark })
    return {
      workspaceId: room.id,
      ownerUserId: room.owner_user_id,
      slotIndex: room.demo_slot_index ?? 1,
      reused: flags.reused ?? false,
      provisioned: false,
      recycledActive: flags.recycledActive ?? false,
    }
  }

  /**
   * Crée la salle suivante : un utilisateur Supabase dédié (sans mot de passe —
   * la session s'ouvre par magic link consommé côté serveur, comme le 2FA) et
   * son workspace `is_demo`.
   *
   * Idempotent sur l'e-mail : si le compte existe déjà (transaction annulée
   * plus tôt, redéploiement), il est réutilisé — on ne crée jamais deux comptes
   * pour la même salle.
   */
  private async provisionRoom(
    trx: EntityManager,
    all: Room[],
    rooms: Room[],
    deviceId: string | null,
    variant: DemoRoomVariant,
  ): Promise<DemoSlot> {
    // L'ancre reste la salle n°1 de l'opérateur, quelle que soit la variante : identité et quotas en dérivent.
    const anchor = all[0]!
    // #4291 J — numérotée DANS sa variante : staffing 1..N, forfait 1001.. (voir `demo-room-variant.ts`).
    const rank = rooms.reduce((max, room) => Math.max(max, demoRoomRank(room.demo_slot_index ?? 0)), 0) + 1
    const index = demoSlotIndexFor(variant, rank)

    const anchorUser = await this.gateway.findUserById(anchor.owner_user_id)
    const email = demoPoolEmail(anchorUser?.email, index)
    if (!email) {
      throw new Error(`Demo pool: cannot derive a room address from the demo owner (${anchor.owner_user_id})`)
    }

    const ownerUserId = await this.resolvePoolUser(email)

    const leasedAt = new Date()
    const name = variant === 'forfait_conseil' ? `${ROOM_NAME_PREFIX} forfait ${rank}` : `${ROOM_NAME_PREFIX} ${index}`
    const workspaces = trx.getRepository(WorkspaceEntity)

    // Le trigger `handle_new_user_workspace` crée « Mon espace » à l'insertion
    // du compte : le chemin normal est donc une conversion, pas une création.
    const owned = await workspaces.findOne({ where: { owner_user_id: ownerUserId }, order: { created_at: 'ASC' } })
    if (owned) {
      const realAccounts = await trx.getRepository(AccountEntity).count({ where: { workspace_id: owned.id } })
      if (!owned.is_demo && realAccounts > 0) {
        // Même garde fail-closed que DemoSeedService : jamais basculer en démo
        // (donc en actions gratuites) un espace qui porte de vrais dossiers.
        // #2259.39 — vérifié AVANT `ensureProfile`/`mirrorEntitlement`, plus bas :
        // un espace réel refusé ne doit garder AUCUNE trace du persona, pas même
        // un abonnement miroir posé « en passant » avant le refus (trouvé en
        // auditant le bail public de #2259, l'ordre inverse le laissait passer).
        throw new Error(`Demo pool: workspace ${owned.id} already holds real dossiers — refusing to convert`)
      }
    }

    await this.ensureProfile(trx, ownerUserId, email)
    await this.mirrorEntitlement(trx, anchor.owner_user_id, ownerUserId)

    if (owned) {
      await workspaces.update(
        { id: owned.id },
        {
          is_demo: true,
          name,
          demo_slot_index: index,
          demo_leased_at: leasedAt,
          demo_lease_device: deviceId,
          // #4173 — allumé par défaut depuis ce lot ; une salle de démonstration n'a pas
          // le droit de le cocher (403 au contrôleur). Forcé ici, pas confié au défaut
          // de colonne, qui ne distingue pas démo/réel.
          chat_eval_sampling_enabled: false,
        },
      )
      this.logger.log(`Demo pool: room ${index} provisioned on workspace ${owned.id} (${email})`)
      return {
        workspaceId: owned.id,
        ownerUserId,
        slotIndex: index,
        reused: false,
        provisioned: true,
        recycledActive: false,
      }
    }

    const created = await workspaces.save(
      workspaces.create({
        name,
        owner_user_id: ownerUserId,
        is_demo: true,
        demo_slot_index: index,
        demo_leased_at: leasedAt,
        demo_lease_device: deviceId,
        // #4173 — voir le commentaire de la branche `owned` ci-dessus.
        chat_eval_sampling_enabled: false,
      }),
    )
    const members = trx.getRepository(WorkspaceMemberEntity)
    await members.save(members.create({ workspace_id: created.id, user_id: ownerUserId, role: 'owner' }))
    this.logger.log(`Demo pool: room ${index} provisioned as workspace ${created.id} (${email})`)
    return {
      workspaceId: created.id,
      ownerUserId,
      slotIndex: index,
      reused: false,
      provisioned: true,
      recycledActive: false,
    }
  }

  private async resolvePoolUser(email: string): Promise<string> {
    const existing = await this.gateway.findUserByEmail(email.toLowerCase())
    if (existing?.id) return existing.id

    // Aucun `password` : le compte n'a pas d'identifiants, il n'y a donc rien à
    // fuiter. La session de démo est mintée par magic link admin côté serveur.
    const { data, error } = await this.gateway.client.auth.admin.createUser({ email, email_confirm: true })
    const userId = data?.user?.id
    if (error || !userId) {
      throw new Error(`Demo pool: auth user creation failed for ${email}${error ? ` — ${error.message}` : ''}`)
    }
    return userId
  }

  /** Le profil est créé paresseusement au premier chargement de l'app ; une
   *  salle doit être utilisable sans ce passage. */
  private async ensureProfile(trx: EntityManager, userId: string, email: string): Promise<void> {
    const profiles = trx.getRepository(ProfileEntity)
    const existing = await profiles.findOne({ where: { user_id: userId } })
    if (existing) return
    await profiles.save(profiles.create({ user_id: userId, email }))
  }

  /**
   * Aligne les quotas affichés d'une salle neuve sur ceux de la salle n°1 :
   * toutes les salles doivent se ressembler, sinon un prospect voit « 0 crédit »
   * là où un autre en voit 40. Aucune conséquence de facturation — un espace
   * `is_demo` ne débite jamais (court-circuit CreditsService) — c'est un
   * affichage.
   *
   * Ne touche à rien si la ligne existe déjà (le trigger `handle_new_user_credits`
   * la pose à la création du compte) et n'écrit JAMAIS d'id Stripe : les webhooks
   * matchent dessus SANS scope utilisateur, seul NULL est garanti sans effet.
   */
  private async mirrorEntitlement(trx: EntityManager, anchorUserId: string, ownerUserId: string): Promise<void> {
    const repo = trx.getRepository(SubscriptionEntity)
    if (await repo.findOne({ where: { user_id: ownerUserId } })) return

    const anchor = await repo.findOne({ where: { user_id: anchorUserId } })
    await repo.save(
      repo.create({
        user_id: ownerUserId,
        // Le palier VENDU, pas un palier gratuit. Depuis le 02/09/2026 `trial`
        // et `decouverte` sont à zéro crédit : les miroiter afficherait
        // « 0 crédit » dans toutes les salles — exactement ce que le paragraphe
        // ci-dessus interdit. Une démonstration montre le produit tel qu'il
        // s'achète, et l'espace `is_demo` ne débite de toute façon rien.
        plan: anchor?.plan ?? 'growth',
        accounts_limit: anchor?.accounts_limit ?? SHIPPED_PLAN_GRID.growth.creditsPerCycle,
        enrichment_credits: anchor?.enrichment_credits ?? 0,
        billing_mode: anchor?.billing_mode ?? 'stripe',
        stripe_customer_id: null,
        stripe_subscription_id: null,
        trial_end: null,
      }),
    )
  }

  /**
   * Une salle de démo n'est lue par personne : la désabonner des e-mails
   * produit évite d'écrire dans le vide à chaque nouveauté (et de compter des
   * envois qui ne seront jamais ouverts). Best-effort — une préférence non
   * posée ne doit jamais faire échouer une démo.
   */
  private async optOutOfProductEmails(userId: string): Promise<void> {
    try {
      await this.dataSource
        .getRepository(NotificationPreferenceEntity)
        .upsert(
          { user_id: userId, newsletter_changelog: false, weekly_digest: false },
          { conflictPaths: ['user_id'], skipUpdateIfNoValuesChanged: true },
        )
    } catch (error) {
      this.logger.warn('Demo pool: could not opt the room out of product e-mails (non-fatal)', { error })
    }
  }
}

/** Ancienneté du bail — `0` (jamais loué) passe naturellement en premier. */
function leaseTime(room: Room): number {
  return room.demo_leased_at ? new Date(room.demo_leased_at).getTime() : 0
}
