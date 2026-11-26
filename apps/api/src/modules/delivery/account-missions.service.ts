import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import {
  FINISHED_MISSION_STATUSES,
  NOT_RENEWED_MISSION_STATUSES,
  RUNNING_MISSION_STATUSES,
  accountPaymentBehaviour,
  activeMissionNextAction,
  dailyMarginPercent,
  daysUntilEnd,
  missionsOfAccount,
  propagated,
  redactFinance,
  renewalWindow,
  type AccountBuyingProfile,
  type AccountMissions,
  type ActiveMissionRow,
  type MissionStatus,
  type NotRenewedMissionRow,
  type PastMissionRow,
  type PaymentBehaviour,
  type PlacedConsultant,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { MissionEntity } from '../../database/entities/mission.entity'
import { MissionCommercialTermsEntity } from '../../database/entities/mission-commercial-terms.entity'
import { PropagationService } from './propagation.service'
import { loadedCostCents } from './revenue.service'

/**
 * L'ONGLET MISSIONS DU DOSSIER DE COMPTE — LES CINQ BLOCS (PDF 4 §3.3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT, MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * La barre du dossier de compte portait treize onglets et aucun ne s'appelait
 * « Missions ». Les missions d'un compte n'existaient qu'enfouies dans
 * « Preuves & REX », réduites à un intitulé et un badge de statut. Et côté
 * serveur, `delivery.controller.ts` exposait le board, la liste, les
 * renouvellements et l'expansion — **jamais par compte**. `expansionMap` en
 * approchait, mais elle ne lit que `active|onboarding` : elle ne pouvait donc
 * rien dire de l'historique, qui est la moitié de ce que cet onglet sert à
 * montrer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ §4.4 — CE SERVICE N'A AUCUN CHEMIN D'ÉCRITURE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Chaque bloc propagé porte un lien vers sa source et ne s'édite jamais sur
 * place. » Tout ce que cet onglet montre se CALCULE dans les missions et s'y
 * corrige. Ce fichier ne contient ni `INSERT`, ni `UPDATE`, ni `DELETE`, ni
 * `.save(` — ce n'est pas une convention, c'est l'absence de code, et la
 * réponse porte `editable: false` posé par `propagated(…)`, le seul
 * constructeur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QUI N'EST PAS RECALCULÉ ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Le TARIF VENDU MOYEN vient de {@link PropagationService.digest} (PDF 2 §4.3),
 * où il vit déjà. Une seconde moyenne écrite ici divergerait de celle du
 * portefeuille le jour où l'une des deux change de règle — et les deux
 * s'afficheraient côte à côte sur des écrans voisins.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ AUCUN ZÉRO DE REMPLISSAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un compte sans mission rend des listes vides et `buying: null` — pas un profil
 * d'achat à zéro. Une durée moyenne sans aucune mission datée vaut `null`, un
 * tarif moyen sans aucun TJM vaut `null`. La question, à chaque champ : *si
 * cette valeur est absente, « 0 » est-il VRAI ?*
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS REQUÊTES, JAMAIS N
 * ─────────────────────────────────────────────────────────────────────────────
 * Les affectations, les motifs de fin et les REX se lisent en trois requêtes
 * groupées quel que soit le nombre de missions — plus une lecture d'entités
 * pour les missions et une pour les conditions commerciales, cette dernière
 * seulement sous droit financier. Sur un compte vide, AUCUNE ne part.
 */
@Injectable()
export class AccountMissionsService {
  private readonly logger = new Logger(AccountMissionsService.name)

  constructor(
    @InjectRepository(MissionEntity)
    private readonly missions: Repository<MissionEntity>,
    /** La SOURCE du coût chargé (D43) — jamais `missions.daily_cost`, que rien
     *  n'écrit. Déclaré dans `DeliveryModule.forFeature` : un dépôt injecté sans
     *  être déclaré rend le healthcheck rouge en laissant les tests verts (GA-20). */
    @InjectRepository(MissionCommercialTermsEntity)
    private readonly terms: Repository<MissionCommercialTermsEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    private readonly propagation: PropagationService,
  ) {}

  /**
   * Les cinq blocs, pour UN compte de l'espace.
   *
   * `canReadFinance` est OBLIGATOIRE et n'a pas de valeur par défaut : un
   * appelant qui l'oublie doit être refusé par le compilateur, pas servi en
   * silence avec la marge de tout le portefeuille. Même parti pris que
   * `DeliveryService.list`.
   */
  async ofAccount(
    workspaceId: string,
    accountId: string,
    options: { canReadFinance: boolean; now?: Date },
  ): Promise<AccountMissions> {
    // Le compte AVANT les missions : on ne fouille pas la table des missions
    // d'un espace pour un identifiant qu'on n'a pas le droit de lire. TypeORM
    // IGNORE une condition dont la valeur est `undefined` — un identifiant
    // absent rendrait sinon le premier compte venu.
    if (!accountId) throw new NotFoundException('Compte introuvable dans votre espace de travail.')
    const account = await this.accounts.findOne({ where: { id: accountId, workspace_id: workspaceId }, select: ['id'] })
    if (!account) throw new NotFoundException('Compte introuvable dans votre espace de travail.')

    const now = options.now ?? new Date()
    const rows = await this.missions.find({
      where: { workspace_id: workspaceId, account_id: accountId },
      // Les fins les plus proches d'abord : l'ordre dans lequel un responsable
      // de compte lit sa liste.
      order: { ends_on: 'ASC', created_at: 'DESC' },
      take: 200,
    })

    const source = missionsOfAccount(accountId)
    if (rows.length === 0) {
      // Rien à montrer — et surtout aucun profil d'achat à zéro. C'est l'écran
      // qui dira qu'il n'y a rien, avec une sortie.
      return propagated(
        redactFinance(
          {
            accountId,
            canReadFinance: options.canReadFinance,
            active: [],
            past: [],
            placedConsultants: [],
            buying: null,
            notRenewed: [],
            // Aucune mission, donc aucune facture : il n'y a pas de comportement
            // de paiement à lire, et surtout pas « ce client paie bien ».
            paymentBehaviour: null,
            // #2124.26 — même raison : aucune mission, donc aucune facture,
            // donc aucun revenu historique à sommer.
            historicalInvoicedRevenueCents: null,
          },
          options.canReadFinance,
        ),
        source,
      )
    }

    const missionIds = rows.map(row => row.id)
    const [assignments, endReasons, feedback, costs, digest, financeHistory, people] = await Promise.all([
      this.assignmentsOf(missionIds),
      this.endReasonsOf(workspaceId, missionIds),
      this.missionsWithFeedback(workspaceId, missionIds),
      // Sans `finance:read`, la requête ne PART pas : on ne charge pas une
      // donnée financière pour la jeter juste après.
      options.canReadFinance ? this.loadedCostsOf(missionIds) : Promise.resolve(new Map<string, number>()),
      this.propagation.digest(workspaceId),
      // Même parti pris, et même raison : les factures de ce client ne se lisent
      // pas pour être rédigées ensuite. `redactFinance` reste la porte, il n'a
      // simplement rien à vider quand on n'a rien lu. #2124.26 — le revenu
      // historique vient de la MÊME lecture, donc la MÊME porte.
      options.canReadFinance
        ? this.financeHistoryOf(workspaceId, accountId, now)
        : Promise.resolve({ paymentBehaviour: null, historicalInvoicedRevenueCents: null }),
      // #2124.19 — le chargé d'affaires n'est pas de la donnée financière : il
      // se lit qu'on ait ou non `finance:read`.
      // #2836 — le manager client, même patron groupé, scopé au compte.
      Promise.all([this.businessManagersOf(rows), this.clientManagersOf(rows, accountId)]).then(
        ([businessManagers, clientManagers]): MissionPeople => ({ businessManagers, clientManagers }),
      ),
    ])
    const { paymentBehaviour, historicalInvoicedRevenueCents } = financeHistory

    const running = rows.filter(row => isRunning(row.status))
    const finished = rows.filter(row => isFinished(row.status))

    return propagated(
      // ⚠️ `redactFinance` et pas un ternaire écrit à la main (D45) : le
      // comportement de paiement est de la donnée de facturation CLIENT, il
      // passe par la porte unique. Une cinquième rédaction écrite ici aurait
      // rouvert la divergence que D45 vient de refermer — et la garde serait
      // restée verte, parce qu'elle ne voit que ce qui est NOMMÉ.
      redactFinance(
        {
          accountId,
          // Le DROIT voyage avec la réponse : sans lui, « pas ton périmètre » et
          // « coût chargé non renseigné » deviennent le même `null`.
          canReadFinance: options.canReadFinance,
          active: running.map(row => this.activeRow(row, assignments, costs, options.canReadFinance, now, people)),
          past: finished.map(row => this.pastRow(row, assignments, endReasons, feedback, people)),
          placedConsultants: placedFrom(rows, assignments),
          buying: buyingProfileOf(rows, digest.accounts.find(entry => entry.accountId === accountId) ?? null),
          notRenewed: notRenewedFrom(rows, assignments, endReasons, people),
          paymentBehaviour,
          historicalInvoicedRevenueCents,
        },
        options.canReadFinance,
      ),
      source,
    )
  }

  /* ── Comment ce client paie (PDF-06 §6.6, PDF-04 §1.1) ───────────────────── */

  /**
   * Les factures ÉMISES à ce compte, telles que le décompte les attend.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * CE QUE LA REQUÊTE RETIENT, ET CE QU'ELLE LAISSE AU CALCUL
   * ─────────────────────────────────────────────────────────────────────────
   * Elle ne retient que la POPULATION — les mois de mission de ce compte
   * réellement facturés. Tout le reste (la fenêtre glissante, le seuil de
   * mesure, ce qui compte comme un retard) vit dans `accountPaymentBehaviour`,
   * pur et testé : une seconde règle écrite dans un `WHERE` divergerait de
   * celle du contrat, et c'est celle des deux qu'on croit qui décide de ce
   * qu'on dit au client.
   *
   * ⚠️ **Aucun filtre sur `invoice_cancelled_at`.** Annuler un « marqué comme
   * facturé » remet `invoiced_at` à `null` : le filtre ci-dessous suffit, et en
   * ajouter un second exclurait un mois annulé PUIS re-facturé — c'est-à-dire
   * une facture qui existe bel et bien.
   *
   * ⚠️ **Une lecture en échec rend `null`, jamais un décompte vide.** Un
   * `catch` qui rendrait « zéro facture » ferait dire « pas assez d'historique »
   * à une panne — « cassé » et « non mesurable » se ressemblent trop pour qu'on
   * les confonde. L'écran distingue les deux grâce à `canReadFinance`.
   */
  /**
   * #1576 — SUR QUELS COMPTES DE L'ESPACE UNE MISSION A ÉTÉ SIGNÉE, ET COMBIEN
   * DE MISSIONS AU TOTAL.
   *
   * ─────────────────────────────────────────────────────────────────────────────
   * CE QUE « GAGNÉ » VEUT DIRE ICI, ET POURQUOI PAS `commercial_status`
   * ─────────────────────────────────────────────────────────────────────────────
   * Une ligne dans `missions` est un CONTRAT : il a été signé, quel que soit son
   * état d'aujourd'hui. Une mission `terminated` a été gagnée puis interrompue —
   * elle prouve autant qu'une mission `active` que l'ESN sait vendre chez ce
   * client, et c'est très exactement la question que la carte pose.
   *
   * `accounts.commercial_status = 'customer'` aurait coûté zéro requête et vaut
   * beaucoup moins : c'est un tri MANUEL, que n'importe qui pose sans qu'aucune
   * affaire n'ait été gagnée. Arbitrage de Louis du 08/09/2026 — la raison la
   * plus forte de l'écran s'adosse à une preuve dure, pas à un rangement.
   *
   * ⚠️ UNE seule requête, groupée : la question se pose pour tout le portefeuille
   * d'un coup, et une lecture par compte serait un N+1 sur le chemin d'ouverture
   * de l'écran des comptes.
   *
   * ⚠️ Aucun zéro de remplissage : un espace sans mission rend un ensemble VIDE
   * et un total à `0` — et c'est vrai, on a compté. C'est l'appelant qui décide
   * qu'en dessous de trois missions il ne nomme rien.
   */
  async signedMissionsByAccount(
    workspaceId: string,
  ): Promise<{ accountIds: ReadonlySet<string>; missionsTotal: number }> {
    if (!workspaceId) return { accountIds: new Set(), missionsTotal: 0 }

    const rows = await this.missions
      .createQueryBuilder('mission')
      .select('mission.account_id', 'account_id')
      .addSelect('COUNT(*)', 'missions')
      .where('mission.workspace_id = :workspaceId', { workspaceId })
      .groupBy('mission.account_id')
      .getRawMany<{ account_id: string | null; missions: string }>()

    const accountIds = new Set<string>()
    let missionsTotal = 0
    for (const row of rows) {
      const missions = Number(row.missions)
      if (!Number.isFinite(missions)) continue
      missionsTotal += missions
      // Une mission sans compte rattaché compte dans le TOTAL (elle a bien été
      // signée) mais ne nomme aucun compte — sans quoi `undefined` entrerait
      // dans l'ensemble et rapprocherait n'importe quelle suggestion.
      if (row.account_id) accountIds.add(row.account_id)
    }

    return { accountIds, missionsTotal }
  }

  /**
   * #2124.26 — LA MÊME LECTURE SERT DEUX SORTIES.
   *
   * `paymentBehaviour` (le comportement — ponctuel/en retard) et
   * `historicalInvoicedRevenueCents` (le CUMUL facturé) viennent des mêmes
   * lignes `invoice_readiness` : une seconde requête pour le total aurait été
   * le prix d'un chiffre que la première lecture porte déjà.
   */
  private async financeHistoryOf(
    workspaceId: string,
    accountId: string,
    now: Date,
  ): Promise<{ paymentBehaviour: PaymentBehaviour | null; historicalInvoicedRevenueCents: number | null }> {
    try {
      const rows = await this.missions.manager.query<
        {
          invoiced_at: string | null
          due_on: string | null
          paid_at: string | null
          // #2419.4 — les deux montants du solde. Sans eux, le comportement de
          // paiement d'un compte est structurellement AVEUGLE au partiel : un
          // client qui règle 500 € sur 10 000 € le jour de l'échéance passait
          // pour ponctuel.
          paid_amount_cents: string | number | null
          invoiced_amount_cents: string | number | null
          disputed_at: string | null
        }[]
      >(
        `SELECT to_char(ir.invoiced_at, 'YYYY-MM-DD') AS invoiced_at,
                to_char(ir.due_on, 'YYYY-MM-DD') AS due_on,
                to_char(ir.paid_at, 'YYYY-MM-DD') AS paid_at,
                ir.paid_amount_cents,
                ir.invoiced_amount_cents,
                to_char(ir.disputed_at, 'YYYY-MM-DD') AS disputed_at
           FROM invoice_readiness ir
           JOIN missions m ON m.id = ir.mission_id
          WHERE ir.workspace_id = $1
            AND m.workspace_id = $1
            AND m.account_id = $2
            AND ir.invoiced_at IS NOT NULL`,
        [workspaceId, accountId],
      )
      const paymentBehaviour = accountPaymentBehaviour(
        rows.map(row => ({
          invoicedAt: row.invoiced_at,
          dueOn: row.due_on,
          paidAt: row.paid_at,
          // `pg` rend un `bigint` en CHAÎNE : `Number(null)` vaudrait 0, et un
          // montant absent deviendrait « zéro euro encaissé ».
          paidAmountCents: centsOrNull(row.paid_amount_cents),
          invoicedAmountCents: centsOrNull(row.invoiced_amount_cents),
          disputedAt: row.disputed_at,
        })),
        { now },
      )
      // #2124.26 — le REVENU HISTORIQUE : la somme des montants facturés,
      // toutes missions confondues. Une facture SANS montant sort du total
      // (elle n'y compte pas comme un zéro) ; AUCUNE facture rend `null`,
      // jamais `0` — « ce client n'a jamais rien acheté » n'est pas la même
      // phrase que « il a été facturé zéro euro ».
      const invoicedAmounts = rows
        .map(row => centsOrNull(row.invoiced_amount_cents))
        .filter((c): c is number => c !== null)
      // `.length === 0` et non `rows.length === 0` : une facture SANS montant
      // n'est pas une facture à 0 €, et un compte dont TOUTES les factures
      // manquent de montant ne doit pas plus se lire « 0 » qu'un compte sans
      // aucune facture.
      const historicalInvoicedRevenueCents =
        invoicedAmounts.length === 0 ? null : invoicedAmounts.reduce((sum, cents) => sum + cents, 0)
      return { paymentBehaviour, historicalInvoicedRevenueCents }
    } catch (error) {
      this.logger.error('payment behaviour read error', { error, tags: { accountId } })
      return { paymentBehaviour: null, historicalInvoicedRevenueCents: null }
    }
  }

  /* ── Bloc 1 ──────────────────────────────────────────────────────────────── */

  private activeRow(
    mission: MissionEntity,
    assignments: Map<string, AssignmentRow[]>,
    costs: Map<string, number>,
    canReadFinance: boolean,
    now: Date,
    people: MissionPeople,
  ): ActiveMissionRow {
    const window = renewalWindow(mission.ends_on, now)
    // ⚠️ `redactFinance` et pas un ternaire écrit à la main : quatre rédactions
    // manuelles avaient déjà divergé dans ce module (D45), et la garde
    // `finance-redaction-single-path.spec.ts` interdit la cinquième.
    const { marginPercent } = redactFinance(
      {
        marginPercent: dailyMarginPercent({
          daily_rate: mission.daily_rate,
          loadedDailyCostCents: costs.get(mission.id) ?? null,
        }),
      },
      canReadFinance,
    )
    return {
      ...identityOf(mission, assignments, people),
      // #R37 — une mission dont le début est futur est « à venir », jamais « en cours ».
      phase: missionPhase(mission.started_on, now),
      // `null` quand la fin n'est pas connue — jamais un grand nombre.
      daysRemaining: daysUntilEnd(mission.ends_on, now),
      renewal: window,
      soldDailyRateCents: soldRateCents(mission.daily_rate),
      marginPercent,
      nextAction: activeMissionNextAction(window),
    }
  }

  /* ── Bloc 2 ──────────────────────────────────────────────────────────────── */

  private pastRow(
    mission: MissionEntity,
    assignments: Map<string, AssignmentRow[]>,
    endReasons: Map<string, string>,
    feedback: Set<string>,
    people: MissionPeople,
  ): PastMissionRow {
    return {
      ...identityOf(mission, assignments, people),
      // `?? null` : personne ne l'a écrit. Une phrase de remplissage se lirait
      // comme un motif réel.
      endReason: endReasons.get(mission.id) ?? null,
      feedbackCollected: feedback.has(mission.id),
    }
  }

  /* ── Les trois lectures groupées ─────────────────────────────────────────── */

  /**
   * Qui est (ou a été) sur ces missions, avec son nom.
   *
   * La jointure sur `consultants` est faite ICI plutôt qu'en deux requêtes : le
   * nom EST l'identité de la ligne, et « Talent inconnu » sur toutes les lignes
   * ressemble exactement à une base vide (cause racine « colonne lue, jamais
   * écrite », déjà payée trois fois).
   */
  private async assignmentsOf(missionIds: string[]): Promise<Map<string, AssignmentRow[]>> {
    const byMission = new Map<string, AssignmentRow[]>()
    const rows = await this.missions.manager.query<AssignmentRow[]>(
      `SELECT ma.mission_id, ma.consultant_id, c.full_name, ma.starts_on, ma.ends_on
         FROM mission_assignments ma
         JOIN consultants c ON c.id = ma.consultant_id
        WHERE ma.mission_id = ANY($1::uuid[])
        ORDER BY ma.starts_on ASC`,
      [missionIds],
    )
    for (const row of rows ?? []) {
      const list = byMission.get(row.mission_id) ?? []
      list.push(row)
      byMission.set(row.mission_id, list)
    }
    return byMission
  }

  /**
   * Le motif de fin, lu dans le JOURNAL.
   *
   * Il n'existe nulle part ailleurs : `missions` ne porte aucune colonne de
   * motif, et le seul écrivain est `DeliveryService.traceMove`, qui pose une
   * ligne `field = 'move_reason'` quand une carte part vers « Perdue » — le seul
   * moment où on l'obtient. `DISTINCT ON` garde le DERNIER : une mission
   * déplacée deux fois a deux motifs, et c'est le plus récent qui vaut.
   */
  private async endReasonsOf(workspaceId: string, missionIds: string[]): Promise<Map<string, string>> {
    const rows = await this.missions.manager.query<{ entity_id: string; new_value: string | null }[]>(
      `SELECT DISTINCT ON (entity_id) entity_id, new_value
         FROM record_field_audit
        WHERE workspace_id = $1
          AND entity_type = 'mission'
          AND field = 'move_reason'
          AND entity_id = ANY($2::uuid[])
        ORDER BY entity_id, created_at DESC`,
      [workspaceId, missionIds],
    )
    const byMission = new Map<string, string>()
    for (const row of rows ?? []) {
      const reason = (row.new_value ?? '').trim()
      // Une chaîne vide n'est pas un motif : la laisser passer afficherait une
      // ligne « motif : » suivie de rien.
      if (reason) byMission.set(row.entity_id, reason)
    }
    return byMission
  }

  /**
   * Les missions dont le RETOUR a été collecté.
   *
   * Le retour lui-même n'est pas rendu ici : il se lit — et se collecte — dans
   * « Preuves & REX ». Le montrer aux deux endroits en ferait deux vérités, ce
   * que la loi 4 interdit ; cet onglet dit seulement s'il existe.
   */
  private async missionsWithFeedback(workspaceId: string, missionIds: string[]): Promise<Set<string>> {
    const rows = await this.missions.manager.query<{ mission_id: string }[]>(
      `SELECT mission_id FROM rex_entries WHERE workspace_id = $1 AND mission_id = ANY($2::uuid[])`,
      [workspaceId, missionIds],
    )
    return new Set((rows ?? []).map(row => row.mission_id))
  }

  /**
   * #2124.19 — LE CHARGÉ D'AFFAIRES INTERNE, PAR MISSION.
   *
   * Lu depuis `missions.owner_id` — le MÊME champ que le panneau Contacts
   * d'une mission (`staffing.service.ts:695-699`) — jamais un contact client.
   * Une seule requête groupée sur les porteurs DISTINCTS : sur un compte à
   * quarante missions, quarante allers-retours vers `profiles` auraient été
   * le prix d'un champ que la ligne porte déjà.
   *
   * `null` (absent de la map) = `owner_id` vide, ou le profil a disparu —
   * jamais un nom inventé pour remplir la colonne.
   */
  private async businessManagersOf(missions: MissionEntity[]): Promise<Map<string, string>> {
    const ownerIds = Array.from(new Set(missions.map(row => row.owner_id).filter((id): id is string => Boolean(id))))
    if (ownerIds.length === 0) return new Map()
    const rows = await this.missions.manager.query<
      { user_id: string; first_name: string | null; last_name: string | null }[]
    >(`SELECT user_id, first_name, last_name FROM profiles WHERE user_id = ANY($1::uuid[])`, [ownerIds])
    const nameByOwner = new Map<string, string>()
    for (const row of rows ?? []) {
      const name = personName(row.first_name, row.last_name)
      if (name) nameByOwner.set(row.user_id, name)
    }
    const byMission = new Map<string, string>()
    for (const row of missions) {
      const name = row.owner_id ? nameByOwner.get(row.owner_id) : undefined
      if (name) byMission.set(row.id, name)
    }
    return byMission
  }

  /**
   * #2836 — LE MANAGER CLIENT, PAR MISSION : le contact, chez le client, qui
   * encadre le consultant (`missions.client_manager_contact_id` → `contacts`).
   *
   * Une seule requête groupée sur les contacts DISTINCTS, SCOPÉE au compte
   * (`account_id = $2`) : un contact rattaché ailleurs ne s'affiche pas sous
   * ce compte. Aucune mission désignée = aucune requête. `null` (absent de la
   * map) = non désigné, contact disparu, ou nom vide — jamais un autre contact
   * du compte pour remplir la ligne.
   */
  private async clientManagersOf(missions: MissionEntity[], accountId: string): Promise<Map<string, string>> {
    const contactIds = Array.from(
      new Set(missions.map(row => row.client_manager_contact_id).filter((id): id is string => Boolean(id))),
    )
    if (contactIds.length === 0) return new Map()
    const rows = await this.missions.manager.query<{ id: string; full_name: string | null }[]>(
      `SELECT id, full_name FROM contacts WHERE id = ANY($1::uuid[]) AND account_id = $2`,
      [contactIds, accountId],
    )
    const nameByContact = new Map<string, string>()
    for (const row of rows ?? []) {
      const name = row.full_name?.trim()
      if (name) nameByContact.set(row.id, name)
    }
    const byMission = new Map<string, string>()
    for (const row of missions) {
      const name = row.client_manager_contact_id ? nameByContact.get(row.client_manager_contact_id) : undefined
      if (name) byMission.set(row.id, name)
    }
    return byMission
  }

  /** Le coût chargé, en CENTIMES — `mission_commercial_terms`, et rien d'autre (D43). */
  private async loadedCostsOf(missionIds: string[]): Promise<Map<string, number>> {
    const costs = new Map<string, number>()
    const rows = await this.terms.find({
      where: { mission_id: In(missionIds) },
      select: ['mission_id', 'loaded_daily_cost_cents'],
    })
    for (const row of rows ?? []) {
      const cents = loadedCostCents(row.loaded_daily_cost_cents)
      if (cents !== null) costs.set(row.mission_id, cents)
    }
    return costs
  }
}

/* ── Ce que les blocs partagent ───────────────────────────────────────────── */

/** Les deux personnes nommées sur chaque ligne : notre chargé d'affaires
 *  (#2124.19) et le manager client (#2836), chacune par mission. */
type MissionPeople = { businessManagers: Map<string, string>; clientManagers: Map<string, string> }

type AssignmentRow = {
  mission_id: string
  consultant_id: string
  full_name: string
  starts_on: string
  ends_on: string | null
}

/** Un TJM en euros (colonne `numeric` historique) devient des CENTIMES, une
 *  seule fois. Cinq appelants recopiaient cette conversion à la main. */
function soldRateCents(dailyRate: number | null): number | null {
  if (dailyRate === null || !Number.isFinite(dailyRate) || dailyRate <= 0) return null
  return Math.round(dailyRate * 100)
}

function isRunning(status: string): boolean {
  return (RUNNING_MISSION_STATUSES as readonly string[]).includes(status)
}

function isFinished(status: string): boolean {
  return (FINISHED_MISSION_STATUSES as readonly string[]).includes(status)
}

function identityOf(mission: MissionEntity, assignments: Map<string, AssignmentRow[]>, people: MissionPeople) {
  return {
    missionId: mission.id,
    label: mission.label,
    roleTitle: mission.role_title,
    startedOn: mission.started_on,
    endsOn: mission.ends_on,
    status: mission.status as MissionStatus,
    consultants: (assignments.get(mission.id) ?? []).map(row => ({
      consultantId: row.consultant_id,
      fullName: row.full_name,
    })),
    // #2124.19 — `?? null`, jamais une chaîne vide : « non désigné » et « un
    // nom vide » ne doivent pas se confondre à l'écran.
    businessManagerName: people.businessManagers.get(mission.id) ?? null,
    // #2836 — même règle : `null` = non désigné, jamais une chaîne vide.
    clientManagerName: people.clientManagers.get(mission.id) ?? null,
  }
}

/** Un nom composé à partir de prénom/nom — `null` si les deux manquent, jamais
 *  une chaîne vide qui se lirait comme un nom renseigné (même règle que
 *  `staffing.service.ts`, dupliquée ici comme le reste du dépôt le fait déjà
 *  — `delivery.service.ts:2064`, `crm-write-request-view.ts:30`). */
function personName(firstName: string | null, lastName: string | null): string | null {
  const full = [firstName, lastName].filter((part): part is string => Boolean(part?.trim())).join(' ')
  return full.length > 0 ? full : null
}

/* ── Bloc 3 ───────────────────────────────────────────────────────────────── */

/**
 * « Marc a fait 3 missions ici » — le qui / quand / combien de fois.
 *
 * Personne n'apparaît à zéro : quelqu'un qui n'a jamais été placé n'est pas
 * dans la liste. Les plus présents d'abord, puis par nom pour que l'ordre soit
 * stable d'une lecture à l'autre.
 */
function placedFrom(missions: MissionEntity[], assignments: Map<string, AssignmentRow[]>): PlacedConsultant[] {
  const known = new Set(missions.map(mission => mission.id))
  const byConsultant = new Map<string, { fullName: string; rows: AssignmentRow[] }>()
  for (const [missionId, rows] of assignments) {
    if (!known.has(missionId)) continue
    for (const row of rows) {
      const entry = byConsultant.get(row.consultant_id) ?? { fullName: row.full_name, rows: [] }
      entry.rows.push(row)
      byConsultant.set(row.consultant_id, entry)
    }
  }
  const placed: PlacedConsultant[] = []
  for (const [consultantId, entry] of byConsultant) {
    const starts = entry.rows
      .map(row => row.starts_on)
      .filter((value): value is string => Boolean(value))
      .sort()
    // ⚠️ Une affectation SANS fin est en cours : c'est un expert sur place, pas
    // une date manquante. Lui prêter une fin ferait disparaître la seule
    // information qui compte ici.
    const stillOnSite = entry.rows.some(row => row.ends_on === null)
    const ends = entry.rows
      .map(row => row.ends_on)
      .filter((value): value is string => Boolean(value))
      .sort()
    placed.push({
      consultantId,
      fullName: entry.fullName,
      missions: new Set(entry.rows.map(row => row.mission_id)).size,
      firstStartedOn: starts[0] ?? null,
      // `null` tant qu'une affectation court : « dernière fin » n'a pas de sens
      // sur quelqu'un qui est encore là.
      lastEndedOn: stillOnSite ? null : (ends.at(-1) ?? null),
      stillOnSite,
    })
  }
  return placed.sort((a, b) => b.missions - a.missions || a.fullName.localeCompare(b.fullName))
}

/* ── Bloc 4 ───────────────────────────────────────────────────────────────── */

/**
 * « Ce que ce client achète » — le bloc qui prépare la prochaine vente.
 *
 * Le tarif vendu moyen vient de la PROPAGATION, pas d'un second calcul. Quand
 * elle n'a pas de ligne pour ce compte, le tarif vaut `null` et le reste du
 * bloc existe quand même : la durée et les rôles, eux, sont mesurés ici.
 */
function buyingProfileOf(
  missions: MissionEntity[],
  propagationRow: { missions: number; averageSoldDailyRateCents: number | null; missionsWithoutRate: number } | null,
): AccountBuyingProfile | null {
  if (missions.length === 0) return null

  const durations: number[] = []
  let missionsWithoutDuration = 0
  for (const mission of missions) {
    const days = spanInDays(mission.started_on, mission.ends_on)
    if (days === null) missionsWithoutDuration += 1
    else durations.push(days)
  }

  const byRole = new Map<string, number>()
  let missionsWithoutRoleTitle = 0
  for (const mission of missions) {
    const role = (mission.role_title ?? '').trim()
    // Une mission sans rôle n'est PAS un rôle « Non renseigné » : elle sort du
    // décompte, et le nombre le dit à côté.
    if (!role) missionsWithoutRoleTitle += 1
    else byRole.set(role, (byRole.get(role) ?? 0) + 1)
  }

  return {
    averageSoldDailyRateCents: propagationRow?.averageSoldDailyRateCents ?? null,
    // Le « sur N missions » de la propagation quand elle en a un, sinon ce que
    // cette lecture a vu. Les deux comptent la même chose.
    missions: propagationRow?.missions ?? missions.length,
    missionsWithoutRate: propagationRow?.missionsWithoutRate ?? missions.filter(m => m.daily_rate === null).length,
    // ⚠️ `null` et jamais 0 : « ce client achète des missions de 0 jour » n'est
    // pas une mesure, c'est l'absence de mesure.
    averageDurationDays:
      durations.length === 0 ? null : Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
    missionsWithoutDuration,
    roleTitles: [...byRole.entries()]
      .map(([roleTitle, count]) => ({ roleTitle, missions: count }))
      .sort((a, b) => b.missions - a.missions || a.roleTitle.localeCompare(b.roleTitle)),
    missionsWithoutRoleTitle,
  }
}

/** La durée d'une mission en jours — `null` dès qu'une des deux dates manque.
 *  Supposer une durée moyenne inventerait le chiffre que ce bloc sert à dire. */
function missionPhase(startedOn: string | null, now: Date): 'upcoming' | 'running' | null {
  if (!startedOn) return null
  const start = new Date(startedOn).getTime()
  if (Number.isNaN(start)) return null
  return start > now.getTime() ? 'upcoming' : 'running'
}

function spanInDays(startedOn: string | null, endsOn: string | null): number | null {
  if (!startedOn || !endsOn) return null
  const start = new Date(startedOn).getTime()
  const end = new Date(endsOn).getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  const days = Math.round((end - start) / 86_400_000)
  // Une durée nulle ou négative est une saisie abîmée, pas une mission d'un
  // jour : elle sort du calcul plutôt que de tirer la moyenne vers le bas.
  return days > 0 ? days : null
}

/* ── Bloc 5 ───────────────────────────────────────────────────────────────── */

/**
 * « Ce qu'il ne renouvelle pas » — les missions terminées sans suite.
 *
 * ⚠️ La suite se lit sur le RÔLE, pas sur le compte. Chez un client où quatre
 * missions tournent, une reprise « au niveau du compte » viderait ce bloc — donc
 * précisément chez les clients pour qui la question se pose. Ce qui n'a pas
 * repris, c'est ce PROFIL-là.
 *
 * `sameRoleResumed: null` quand la question est indécidable — rôle non
 * renseigné, ou mission sans date de fin. « On ne sait pas » n'est pas « non »,
 * et l'écran le dit différemment.
 */
function notRenewedFrom(
  missions: MissionEntity[],
  assignments: Map<string, AssignmentRow[]>,
  endReasons: Map<string, string>,
  people: MissionPeople,
): NotRenewedMissionRow[] {
  const candidates = missions.filter(mission =>
    (NOT_RENEWED_MISSION_STATUSES as readonly string[]).includes(mission.status),
  )
  return candidates
    .map(mission => {
      const role = (mission.role_title ?? '').trim()
      const endsOn = mission.ends_on
      const resumed =
        !role || !endsOn
          ? null
          : missions.some(
              other =>
                other.id !== mission.id &&
                (other.role_title ?? '').trim() === role &&
                other.started_on !== null &&
                other.started_on >= endsOn,
            )
      return {
        ...identityOf(mission, assignments, people),
        endReason: endReasons.get(mission.id) ?? null,
        sameRoleResumed: resumed,
      }
    })
    .filter(row => row.sameRoleResumed !== true)
}

/**
 * Des centimes venus de `pg`, ou `null` — jamais 0.
 *
 * ⚠️ #2419.4 — `pg` rend un `bigint` en CHAÎNE, et `Number(null)` vaut `0`.
 * Un montant absent deviendrait donc « zéro euro encaissé », c'est-à-dire un
 * règlement à zéro : exactement le « non mesuré rendu 0 » que ce dépôt refuse
 * (GA-18 / GA-19). Une chaîne illisible rend `null` pour la même raison.
 */
function centsOrNull(value: string | number | null): number | null {
  if (value === null) return null
  const cents = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(cents) ? cents : null
}
