import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  assignmentStatusSchema,
  can,
  computeMissionMargin,
  deriveStaffing,
  missionCostBreakdownSchema,
  simulateMissionMarginScenario,
  missionElapsedDays,
  missionMargin,
  missionMarginWithExpenses,
  poConsumption,
  redactFinance,
  type AssignmentInput,
  type AssignmentWindow,
  type BillingCadence,
  type MissionAssignment,
  type MissionCommercialTerms,
  type MissionCostSource,
  type MissionMarginComputation,
  type MissionMarginEngineInput,
  type MissionMarginScenario,
  type MissionMarginScenarioResult,
  type MissionDeliveryContact,
  type PaymentTermsBasis,
  type StaffingState,
  type UpsertCommercialTermsInput,
} from '@bellum/contracts'
import { unconfirmedInterruptionMissionIds } from '../../common/mission-interruptions'
import { MissionAssignmentEntity } from '../../database/entities/mission-assignment.entity'
import { MissionCommercialTermsEntity } from '../../database/entities/mission-commercial-terms.entity'
import { MissionEntity } from '../../database/entities/mission.entity'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { MissionExpensesService } from './mission-expenses.service'
import { SupplierInvoicesService } from './supplier-invoices.service'
import { asDay } from '../../common/day'

type AssignmentRow = MissionAssignmentEntity & {
  mission_label: string | null
  account_name: string | null
  consultant_name: string | null
}

/** L'identité PROPRE du compte client — raison sociale, adresse, SIREN. Pas
 *  `account_entities` (BU/filiale) : voir {@link StaffingService.readContacts}.
 *  Non exportée : consommée uniquement ici, à travers {@link MissionContactsPanel}. */
type MissionEntitySummary = { name: string; address: string | null; siren: string | null }

/**
 * #2561 — le deal CRM rattaché à une mission (`missions.crm_deal_id` →
 * `crm_deal_facts`), champ par champ. La correspondance elle-même (« ce que
 * ton outil appelle *deal* est ici une *mission* ») se montre à l'écran :
 * `provider` en est le seul ingrédient, résolu en nom d'affichage par
 * `clientToolName` (`@bellum/contracts`) — jamais écrit en dur côté panneau.
 */
type LinkedCrmDeal = {
  provider: string
  dealId: string
  name: string | null
  stage: string | null
  stageLabel: string | null
  amount: string | null
  isClosed: boolean
  isWon: boolean | null
}

/** Ce que le panneau latéral de planification affiche — voir
 *  {@link StaffingService.readContacts}. */
export type MissionContactsPanel = {
  entity: MissionEntitySummary | null
  consultant: MissionDeliveryContact | null
  businessManager: MissionDeliveryContact | null
  craValidator: MissionDeliveryContact | null
  /** #2836 — le manager client (contact du compte qui encadre le consultant). */
  clientManager: MissionDeliveryContact | null
  /** #2836 — l'identifiant désigné, pour que le sélecteur parte du choix
   *  courant. `null` = non désigné, ou contact sorti du compte. */
  clientManagerContactId: string | null
  billingRecipientEmail: string | null
  crmDeal: LinkedCrmDeal | null
}

/**
 * Le STAFFING — affectations, disponibilité dérivée, conditions commerciales.
 *
 * Trois décisions :
 *
 * 1. **La disponibilité se DÉDUIT des affectations** (`deriveStaffing`, pur et
 *    testé). Le champ saisi à la main reste le repli quand aucune affectation
 *    n'existe : une ESN qui ne renseigne pas ses missions ne doit pas voir tout
 *    son vivier basculer en « disponible » du jour au lendemain.
 * 2. **Le coût chargé et la marge sont VIDÉS** sans `finance:read` — mis à
 *    `null` par `redactFinance`, jamais retirés de la réponse (D45) et jamais
 *    mis à zéro. Un zéro se lit comme une marge nulle ; une clé absente change
 *    la forme de la réponse selon le rôle du lecteur.
 * 3. **Une affectation qui chevauche à plus de 100 % est ACCEPTÉE**, et le
 *    sur-staffing s'affiche. Le refuser obligerait à mentir sur la charge réelle
 *    pour pouvoir enregistrer une mission qui, elle, existe bel et bien.
 */
/** Ce que `GET /delivery/missions/:id/terms` lit, avant l'ajout du droit. */
type MissionTermsRead = {
  terms: MissionCommercialTerms | null
  margin: { amountCents: number; percent: number } | null
  expensesTotalCents: number | null
  supplierInvoicesTotalCents: number | null
  marginWithExpenses: { amountCents: number; percent: number } | null
  /** #2420 — le calcul complet du moteur de marge. `null` sans `finance:read`. */
  marginEngine: MissionMarginComputation | null
}

@Injectable()
export class StaffingService {
  constructor(
    @InjectRepository(MissionAssignmentEntity)
    private readonly assignments: Repository<MissionAssignmentEntity>,
    @InjectRepository(MissionCommercialTermsEntity)
    private readonly terms: Repository<MissionCommercialTermsEntity>,
    @InjectRepository(MissionEntity) private readonly missions: Repository<MissionEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    // Les frais (30/08/2026) : `readTerms` leur somme et la marge nette qui en
    // tient compte dans la MÊME réponse que le coût chargé, plutôt que de
    // laisser l'écran assembler deux appels et deux vérités.
    private readonly expensesService: MissionExpensesService,
    // Les factures fournisseur (30/08/2026) : même raison — leur somme entre
    // dans la MÊME marge nette que les frais, avec le même soin (amortie sur
    // la durée écoulée, jamais devinée).
    private readonly supplierInvoicesService: SupplierInvoicesService,
  ) {}

  async listForMission(userId: string, missionId: string): Promise<MissionAssignment[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.assertMission(missionId, workspaceId)
    return this.read('a.mission_id = $1 AND a.workspace_id = $2', [missionId, workspaceId], {
      canReadFinance: await this.canReadFinance(userId),
    })
  }

  async listForConsultant(userId: string, consultantId: string): Promise<MissionAssignment[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return this.read('a.consultant_id = $1 AND a.workspace_id = $2', [consultantId, workspaceId])
  }

  /**
   * #3182.2 (épopée #3248, retour bêta 28/09/2026) — l'historique de STAFFING
   * d'UN compte : quels consultants y ont déjà été positionnés. « Aucun outil
   * ne relie l'historique de staffing d'un compte à ses consultants passés » —
   * `search_talents` balaie le vivier ENTIER, jamais filtré par compte.
   *
   * MÊME lecture que `listForMission`/`listForConsultant` (GA-26) — `read()`
   * joint déjà `missions` → `accounts` → `consultants` ; seul le filtre change
   * (`m.account_id` au lieu de `a.mission_id`/`a.consultant_id`). Aucune
   * requête neuve, aucune table neuve : la jointure existait, elle n'était
   * simplement jamais appelée à ce grain.
   */
  async listForAccount(userId: string, accountId: string): Promise<MissionAssignment[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return this.read('m.account_id = $1 AND a.workspace_id = $2', [accountId, workspaceId], {
      canReadFinance: await this.canReadFinance(userId),
    })
  }

  /**
   * La disponibilité DÉDUITE d'un consultant.
   *
   * Sans affectation, l'état est `unknown` — et c'est l'appelant qui décide
   * alors de montrer le champ déclaré. Le service ne se substitue pas à la
   * fiche : il dit seulement ce que les affectations permettent d'affirmer.
   */
  async staffingFor(userId: string, consultantId: string, now: Date = new Date()): Promise<StaffingState> {
    const rows = await this.listForConsultant(userId, consultantId)
    // #3068 — même NO-GO que `staffingForMany` : une interruption déclarée et
    // pas encore confirmée (`mission_interruptions.availability_confirmed`) ne
    // doit pas laisser `deriveStaffing` annoncer « disponible ».
    const unconfirmed = await unconfirmedInterruptionMissionIds(
      this.assignments.manager,
      rows.map(row => row.missionId),
    )
    return deriveStaffing(
      rows.map(row => ({
        loadPercent: row.loadPercent,
        startsOn: row.startsOn,
        endsOn: row.endsOn,
        interruptionUnconfirmed: unconfirmed.has(row.missionId),
      })),
      now,
    )
  }

  /** La disponibilité dérivée de PLUSIEURS consultants, en une requête. */
  async staffingForMany(
    userId: string,
    consultantIds: readonly string[],
    now: Date = new Date(),
  ): Promise<Map<string, StaffingState>> {
    const out = new Map<string, StaffingState>()
    if (consultantIds.length === 0) return out
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)

    const rows = await this.assignments.manager.query<
      { consultant_id: string; load_percent: number; starts_on: string; ends_on: string | null; mission_id: string }[]
    >(
      `SELECT consultant_id, load_percent, starts_on, ends_on, mission_id
         FROM mission_assignments
        WHERE workspace_id = $1 AND consultant_id = ANY($2)`,
      [workspaceId, [...consultantIds]],
    )
    // #3068 — même NO-GO qu'ailleurs (`staffingFor`, `talent.service.ts`,
    // `matching.service.ts`) : une interruption non confirmée ne doit jamais
    // ressortir « disponible ».
    const unconfirmed = await unconfirmedInterruptionMissionIds(
      this.assignments.manager,
      rows.map(row => row.mission_id),
    )

    const byConsultant = new Map<string, AssignmentWindow[]>()
    for (const row of rows) {
      const list = byConsultant.get(row.consultant_id) ?? []
      // Une affectation sans date de début n'existe pas en base (colonne NOT
      // NULL) ; le repli protège seulement d'une ligne corrompue, et l'écarter
      // vaut mieux que la compter à une date inventée.
      const startsOn = asDay(row.starts_on)
      if (!startsOn) continue
      list.push({
        loadPercent: row.load_percent,
        startsOn,
        endsOn: asDay(row.ends_on),
        interruptionUnconfirmed: unconfirmed.has(row.mission_id),
      })
      byConsultant.set(row.consultant_id, list)
    }
    for (const id of consultantIds) out.set(id, deriveStaffing(byConsultant.get(id) ?? [], now))
    return out
  }

  async assign(userId: string, missionId: string, input: AssignmentInput): Promise<MissionAssignment> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.assertMission(missionId, workspaceId)
    await this.assertConsultant(input.consultantId, workspaceId)
    // #2407.4 — le taux d'une affectation est une donnée FINANCIÈRE : l'écrire
    // exige le droit de la lire.
    const canReadFinance = await this.canReadFinance(userId)
    if (input.dailyRateCents !== undefined && input.dailyRateCents !== null && !canReadFinance) {
      throw new ForbiddenException('Le taux d’une affectation est réservé à qui lit la finance')
    }

    const saved = await this.assignments.save(
      this.assignments.create({
        mission_id: missionId,
        workspace_id: workspaceId,
        consultant_id: input.consultantId,
        load_percent: input.loadPercent,
        starts_on: input.startsOn,
        ends_on: input.endsOn,
        // #2407.4 — absents = non saisis, jamais un défaut inventé.
        daily_rate_cents: input.dailyRateCents ?? null,
        work_location: input.workLocation ?? null,
        remote_mode: input.remoteMode ?? null,
        // #2407.4 (suite) — DÉCLARATIFS, jamais financiers : aucun droit
        // particulier requis pour les écrire (contrairement au taux ci-dessus).
        consent_given: input.consentGiven ?? null,
        consent_date: input.consentDate ?? null,
        documents_expected: input.documentsExpected ?? null,
        documents_received: input.documentsReceived ?? null,
        declared_risks: input.declaredRisks ?? null,
      }),
    )
    const [row] = await this.read('a.id = $1', [saved.id], { canReadFinance })
    if (!row) throw new NotFoundException('Affectation introuvable')
    return row
  }

  async unassign(userId: string, missionId: string, assignmentId: string): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.assertMission(missionId, workspaceId)
    const result = await this.assignments.delete({ id: assignmentId, mission_id: missionId })
    if (!result.affected) throw new NotFoundException('Affectation introuvable')
  }

  // ──────────────────────── conditions commerciales ────────────────────────

  /**
   * Le droit de voir le coût chargé et la marge de CETTE mission.
   *
   * `can()` — le rôle PUIS les permissions accordées au membre — et non
   * `hasPermission()`, qui ne lit que le rôle (D47 · 26/08/2026). Deux écrans
   * lisaient le même droit par deux mécanismes : la liste des missions passait
   * déjà par `can()`, la fiche non. Un membre à qui `finance:read` était accordé
   * en propre voyait donc la marge dans la liste et « hors périmètre » sur la
   * fiche de la MÊME mission — et, le guard de `PUT terms` étant lui aussi
   * additif, il pouvait SAISIR le coût chargé sans jamais pouvoir le relire.
   *
   * Le cas n'est pas théorique : il est nommé dans le RBAC lui-même
   * (`packages/contracts/src/schemas/workspace.ts`) — « le recruteur qui doit
   * voir la marge sur une mission précise ». Sans accord nominatif, la seule
   * réponse était de le monter en `admin`.
   *
   * ⚠️ Cela ÉLARGIT un droit, et exactement de ce qu'un accord nominatif porte :
   * aucun rôle ne gagne quoi que ce soit, seuls les membres à qui quelqu'un a
   * explicitement accordé `finance:read` voient la fiche s'aligner sur la liste.
   */
  async canReadFinance(userId: string): Promise<boolean> {
    const { role, workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, userId)
    return can(role, extra, 'finance:read')
  }

  /**
   * Les conditions commerciales, la marge — et depuis le 30/08/2026 les frais.
   *
   * Rend `null` sans `finance:read` — et non un objet vidé : l'appelant doit
   * pouvoir distinguer « pas le droit » de « pas renseigné », parce que les deux
   * s'affichent différemment. C'est `canReadFinance`, rendu par le contrôleur à
   * côté de la réponse, qui porte cette distinction ; le `null` seul ne le
   * pourrait pas.
   *
   * `margin` reste EXACTEMENT ce qu'elle a toujours été : la marge JOURNALIÈRE,
   * hors frais — le NOYAU `missionMargin`, inchangé. `marginWithExpenses` est
   * la vue COMPLÉMENTAIRE, qui n'apparaît que quand des frais existent ET sont
   * amortissables (mission avec une date de début). Les deux voyagent
   * ensemble : l'écran qui affiche `margin` doit pouvoir dire qu'elle est hors
   * frais, ce qu'il ne peut faire qu'en sachant si `marginWithExpenses` existe.
   */
  async readTerms(userId: string, missionId: string, canReadFinance: boolean): Promise<MissionTermsRead> {
    return (await this.readTermsWithEngineInput(userId, missionId, canReadFinance)).read
  }

  /**
   * #2420.14 — un SCÉNARIO de marge (tarif renouvelé, coût futur,
   * prolongation, jours attendus, volume différent). Il part EXACTEMENT de
   * l'entrée qui produit la marge de la fiche — un simulateur qui
   * reconstruirait la sienne finirait par ne plus partir du même chiffre
   * (GA-26). Il n'écrit rien. Réservé à `finance:read` par la route.
   */
  async simulateMargin(
    userId: string,
    missionId: string,
    scenario: MissionMarginScenario,
  ): Promise<MissionMarginScenarioResult> {
    const { engineInput } = await this.readTermsWithEngineInput(userId, missionId, true)
    return simulateMissionMarginScenario(engineInput, scenario)
  }

  private async readTermsWithEngineInput(
    userId: string,
    missionId: string,
    canReadFinance: boolean,
  ): Promise<{ read: MissionTermsRead; engineInput: MissionMarginEngineInput }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const mission = await this.assertMission(missionId, workspaceId)

    // Sans le droit, la ligne n'est même pas LUE : la rédaction dit ce qui
    // sort, elle n'est pas une raison d'aller chercher un coût qu'on va vider.
    const row = canReadFinance ? await this.terms.findOne({ where: { mission_id: missionId } }) : null
    const loaded =
      row?.loaded_daily_cost_cents === null || row?.loaded_daily_cost_cents === undefined
        ? null
        : Number(row.loaded_daily_cost_cents)
    const dailyRateCents = mission.daily_rate === null ? null : Math.round(mission.daily_rate * 100)

    // Les frais et les factures fournisseur, comme le coût : pas de raison
    // d'aller les chercher pour un lecteur à qui la réponse va de toute façon
    // les vider.
    const [expensesTotalCents, supplierInvoicesTotalCents] = canReadFinance
      ? await Promise.all([
          this.expensesService.totalCents(workspaceId, missionId),
          this.supplierInvoicesService.totalCents(workspaceId, missionId),
        ])
      : [0, 0]
    const elapsedDays = missionElapsedDays(mission.started_on, mission.ends_on)
    // `po_volume_days` porte déjà un transformer sur l'entité : `row.po_volume_days`
    // est un `number | null` direct, pas une chaîne à convertir.
    const poVolumeDays = row?.po_volume_days ?? null

    // Les jours CONSOMMÉS d'un bon de commande — DÉRIVÉS de `mission_timesheets`,
    // jamais stockés (GA-26 : une dérivation vit à un seul endroit). Même filtre
    // de statuts que `revenue.service.ts#produced` et
    // `propagation.service.ts#marginsOf` : un relevé ATTENDU ou MANQUANT ne
    // compte pas, ses zéro jours sont l'absence d'une information, pas une
    // journée consommée.
    //
    // Lus seulement quand un volume est connu : sans lui, la barre ne
    // s'affichera de toute façon pas (`poConsumption` rend `null`), et la
    // requête serait un aller-retour pour rien.
    //
    // `SUM(days)` rend une ligne UNIQUE à `null` sur un ensemble VIDE — jamais
    // aucune ligne. C'est exactement « non mesuré » : aucun relevé compté pour
    // cette mission n'est pas « zéro jour consommé ».
    let poConsumedDays: number | null = null
    if (row && poVolumeDays !== null) {
      const consumedRows = await this.terms.manager.query<{ days: string | number | null }[]>(
        // #2563 — les jours SAISIS sans CRA (`mission_month_preparations`) des
        // mois SANS relevé compté consomment aussi le bon de commande : une
        // seule définition de la consommation (même règle que
        // `InvoiceMonthPreparationService`), jamais deux jours comptés deux fois.
        `SELECT CASE WHEN c.days IS NULL AND p.days IS NULL THEN NULL
                     ELSE COALESCE(c.days, 0) + COALESCE(p.days, 0) END AS days
           FROM (SELECT SUM(days) AS days FROM mission_timesheets
                  WHERE mission_id = $1 AND status NOT IN ('expected', 'missing', 'not_required')) c,
                (SELECT SUM(mp.manual_days) AS days FROM mission_month_preparations mp
                  WHERE mp.mission_id = $1 AND mp.manual_days IS NOT NULL
                    AND NOT EXISTS (SELECT 1 FROM mission_timesheets ts
                                     WHERE ts.mission_id = mp.mission_id AND ts.period_month = mp.period_month
                                       AND ts.status NOT IN ('expected', 'missing', 'not_required'))) p`,
        [missionId],
      )
      const raw = consumedRows[0]?.days ?? null
      poConsumedDays = raw === null ? null : Number(raw)
    }

    // #2422.7 — les AUTRES missions de l'espace qui partagent le MÊME
    // `po_number` (un bon de commande-cadre couvre souvent plusieurs lots).
    // Scopée au `workspaceId` RÉSOLU, jamais à `row.workspace_id` — une ligne
    // écrite avant que la colonne existe le porterait `null`, et deux espaces
    // ne se comparent JAMAIS (GA-43).
    let poOtherMissions: { missionId: string; missionLabel: string; accountName: string }[] = []
    if (row?.po_number) {
      const otherRows = await this.terms.manager.query<
        { mission_id: string; mission_label: string; account_name: string | null }[]
      >(
        `SELECT mct.mission_id AS mission_id, m.label AS mission_label, acc.company_name AS account_name
           FROM mission_commercial_terms mct
           JOIN missions m ON m.id = mct.mission_id
           LEFT JOIN accounts acc ON acc.id = m.account_id
          WHERE mct.workspace_id = $1 AND mct.po_number = $2 AND mct.mission_id != $3`,
        [workspaceId, row.po_number, missionId],
      )
      poOtherMissions = otherRows.map(r => ({
        missionId: r.mission_id,
        missionLabel: r.mission_label,
        accountName: r.account_name ?? '',
      }))
    }

    // #2420 — le moteur de marge : les jours du MOIS, le seuil de l'espace, et
    // la décomposition relue par son schéma. Lus seulement avec le droit.
    const month = currentMonth()
    const [monthDays, thresholdPercent] = canReadFinance
      ? await Promise.all([this.monthDays(missionId, month), this.marginThreshold(workspaceId)])
      : [{ validatedDays: null, unvalidatedDays: null }, null]
    // Une décomposition illisible (écrite hors du schéma) vaut « rien de
    // déclaré » : la fiche ne casse pas, et aucun coût n'est deviné.
    const breakdown = missionCostBreakdownSchema.safeParse(row?.cost_breakdown ?? {})
    const costSource = (row?.cost_source as MissionCostSource | null | undefined) ?? null
    const costRecordedRateCents = cents(row?.cost_recorded_rate_cents)
    const engineInput: MissionMarginEngineInput = {
      channel: (row?.channel as MissionCommercialTerms['channel'] | undefined) ?? 'unknown',
      costSource,
      currency: row?.currency ?? null,
      costCurrency: row?.cost_currency ?? null,
      dailyRateCents,
      loadedDailyCostCents: loaded,
      partnerCommissionDailyCents: cents(row?.partner_commission_daily_cents),
      breakdown: breakdown.success ? breakdown.data : {},
      fixedPriceRevenueCents: cents(row?.po_amount_cents),
      expensesTotalCents,
      supplierInvoicesTotalCents,
      elapsedDays,
      period: month.slice(0, 7),
      validatedDays: monthDays.validatedDays,
      unvalidatedDays: monthDays.unvalidatedDays,
      thresholdPercent,
      costRecordedRateCents,
    }
    const marginEngine = canReadFinance ? computeMissionMargin(engineInput) : null

    // Une seule sortie, et c'est `redactFinance` qui décide (D45) : plus de
    // `return { terms: null, margin: null }` écrit à la main, qui avait divergé
    // de la rédaction de `delivery` sur la forme même de la réponse.
    const read = redactFinance(
      {
        terms: row
          ? {
              missionId,
              loadedDailyCostCents: loaded,
              // Une ligne écrite AVANT la migration n'a pas de canal : `unknown`,
              // et non « direct » — un défaut qui range les inconnues avec le cas
              // le plus fréquent fausse exactement la comparaison qu'on cherche.
              channel: (row.channel as MissionCommercialTerms['channel']) ?? 'unknown',
              // La colonne est `NOT NULL DEFAULT false` : `Boolean()` rend donc
              // la valeur de la base, pas un « on ne sait pas » déguisé.
              requiresPo: Boolean(row.requires_po),
              poNumber: row.po_number,
              // `date` revient parfois en `Date` selon le chemin — le même
              // problème que `starts_on` / `ends_on` sur les affectations, réglé
              // par le même utilitaire.
              poIssuedOn: asDay(row.po_issued_on),
              // #2566.2 — même transformation que `poIssuedOn` juste au-dessus.
              poValidUntil: asDay(row.po_valid_until),
              // `bigint` revient en CHAÎNE de Postgres, comme le coût chargé et
              // la commission juste en dessous.
              poAmountCents:
                row.po_amount_cents === null || row.po_amount_cents === undefined ? null : Number(row.po_amount_cents),
              poVolumeDays,
              poConsumedDays,
              // N'existe QUE si les deux termes sont connus — voir sa doc dans
              // `staffing.ts` : un volume manquant ou une consommation non
              // mesurable rendent tous les deux `null` ici, et c'est l'ÉCRAN,
              // qui a les deux champs séparés ci-dessus, qui distingue lequel.
              poConsumption: poConsumption(poVolumeDays, poConsumedDays),
              // #2422.7 — voir sa doc dans `staffing.ts` : `[]` si `poNumber` est
              // `null` ou si aucune autre mission ne le partage.
              poOtherMissions,
              billingCadence: row.billing_cadence as BillingCadence | null,
              // `bigint` revient en CHAÎNE de Postgres — la même conversion que
              // le coût chargé juste au-dessus, et pour la même raison : sans
              // elle, `'6000'` sortirait tel quel et toute arithmétique aval le
              // concaténerait. `null` reste `null` : jamais 0, qui se lirait
              // « le partenaire ne prend rien ».
              partnerCommissionDailyCents:
                row.partner_commission_daily_cents === null || row.partner_commission_daily_cents === undefined
                  ? null
                  : Number(row.partner_commission_daily_cents),
              noticeDays: row.notice_days,
              notes: row.notes,
              // Le délai de règlement (30/08/2026) — voir sa doc dans
              // `staffing.ts` : distinct de `dueOn`, l'échéance d'UNE facture,
              // celui-ci est la CONDITION qui la produira.
              paymentTermsDays: row.payment_terms_days ?? null,
              paymentTermsBasis: (row.payment_terms_basis as PaymentTermsBasis | null) ?? null,
              // #2420 — le moteur de marge.
              costSource,
              currency: row.currency ?? null,
              costCurrency: row.cost_currency ?? null,
              costBreakdown: breakdown.success ? breakdown.data : {},
              costRecordedRateCents,
              updatedAt: new Date(row.updated_at).toISOString(),
            }
          : null,
        margin: missionMargin({
          // Le TJM de la mission est en EUROS (colonne `numeric` historique) ; le
          // coût chargé est en centimes. Les additionner sans convertir donnerait
          // une marge de 99,9 % sur toutes les missions — le genre de chiffre
          // qu'on croit une fois avant de ne plus jamais croire l'écran.
          dailyRateCents,
          loadedDailyCostCents: loaded,
        }),
        expensesTotalCents,
        supplierInvoicesTotalCents,
        // Les deux sources de coût s'ADDITIONNENT avant d'être amorties — la
        // marge nette compte les frais ET les factures fournisseur, avec le
        // même soin (`missionMarginWithExpenses` est LE noyau, inchangé : il
        // ne sait pas d'où vient le total, seulement qu'il doit être amorti
        // avant de réduire la marge).
        marginWithExpenses: missionMarginWithExpenses({
          dailyRateCents,
          loadedDailyCostCents: loaded,
          expensesTotalCents: expensesTotalCents + supplierInvoicesTotalCents,
          elapsedDays,
        }),
        marginEngine,
      },
      canReadFinance,
    )
    return { read, engineInput }
  }

  /**
   * #2420 — les jours VALIDÉS et NON VALIDÉS d'une mission sur un mois.
   *
   * Aucun relevé ce mois-ci = `null` pour les deux, jamais zéro : « personne
   * n'a encore saisi » n'est pas « zéro jour travaillé ». Dès qu'un relevé
   * existe, un statut absent vaut un vrai zéro. `expected` / `missing` /
   * `not_required` / `rejected` ne comptent ni d'un côté ni de l'autre : leurs
   * jours ne sont pas une journée travaillée en attente de validation.
   */
  private async monthDays(
    missionId: string,
    month: string,
  ): Promise<{ validatedDays: number | null; unvalidatedDays: number | null }> {
    const rows = await this.terms.manager.query<
      { validated_days: string | number | null; unvalidated_days: string | number | null; rows: string | number }[]
    >(
      `SELECT SUM(days) FILTER (WHERE status = 'validated') AS validated_days,
              SUM(days) FILTER (WHERE status IN ('draft', 'submitted', 'disputed')) AS unvalidated_days,
              COUNT(*) AS rows
         FROM mission_timesheets
        WHERE mission_id = $1 AND period_month = $2::date`,
      [missionId, month],
    )
    const first = rows[0]
    if (!first || Number(first.rows) === 0) return { validatedDays: null, unvalidatedDays: null }
    return {
      validatedDays: Number(first.validated_days ?? 0),
      unvalidatedDays: Number(first.unvalidated_days ?? 0),
    }
  }

  /** #2420 — le seuil de marge de l'espace, celui des alertes du pilotage (GA-26). */
  private async marginThreshold(workspaceId: string | null): Promise<number | null> {
    if (!workspaceId) return null
    const rows = await this.terms.manager.query<{ margin_alert_threshold_percent: string | number | null }[]>(
      `SELECT margin_alert_threshold_percent FROM workspaces WHERE id = $1`,
      [workspaceId],
    )
    return cents(rows[0]?.margin_alert_threshold_percent)
  }

  async upsertTerms(
    userId: string,
    missionId: string,
    input: UpsertCommercialTermsInput,
  ): Promise<MissionCommercialTerms> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const mission = await this.assertMission(missionId, workspaceId)

    // ─────────────────────────────────────────────────────────────────────
    // CINQ CHAMPS QUI FUSIONNENT, SIX QUI REMPLACENT
    // ─────────────────────────────────────────────────────────────────────
    // `requires_po` et `partner_commission_daily_cents` existaient en base et
    // étaient LUES — le bloqueur « bon de commande exigé et absent » d'un côté,
    // `trueDailyCostCents` de l'autre — sans qu'aucun chemin ne les écrive. Le
    // bloqueur ne pouvait donc se déclencher sur AUCUN espace, et la marge des
    // canaux `partner` et `subcontracting` était structurellement muette.
    //
    // Elles sont branchées en FUSION et non en remplacement : un client écrit
    // avant elles ne sait pas les recopier, et un `PUT` complet venu de la fiche
    // mission les effacerait à chaque saisie de coût. Le drapeau de présence
    // porte la seule question qui compte — la charge utile PARLAIT-ELLE de ce
    // champ ? Sans lui, `null` « efface » et `undefined` « n'y touche pas »
    // deviennent le même paramètre.
    //
    // `po_issued_on`, `po_amount_cents` et `po_volume_days` (30/08/2026)
    // rejoignent le même régime pour la même raison, exactement : ils naissent
    // après les deux premiers, et un `PUT` écrit avant eux — la fiche mission
    // elle-même, hier — ne sait pas les recopier. `payment_terms_days` et
    // `payment_terms_basis` (30/08/2026) suivent EXACTEMENT le même motif.
    //
    // ⚠️ Les sept colonnes FUSIONNÉES sont AJOUTÉES EN FIN de liste. Insérées au
    // milieu, elles décaleraient chaque `$n` : les valeurs partiraient dans les
    // mauvaises colonnes sans qu'aucun type ne s'y oppose.
    const writesRequiresPo = input.requiresPo !== undefined
    const writesCommission = input.partnerCommissionDailyCents !== undefined
    const writesPoIssuedOn = input.poIssuedOn !== undefined
    const writesPoAmount = input.poAmountCents !== undefined
    const writesPoVolume = input.poVolumeDays !== undefined
    const writesPaymentTermsDays = input.paymentTermsDays !== undefined
    const writesPaymentTermsBasis = input.paymentTermsBasis !== undefined
    // #2420 — les quatre champs du moteur de marge, en FUSION eux aussi.
    const writesCostSource = input.costSource !== undefined
    const writesCurrency = input.currency !== undefined
    const writesCostCurrency = input.costCurrency !== undefined
    const writesCostBreakdown = input.costBreakdown !== undefined
    // #2566.2 — même régime, AJOUTÉ EN FIN (voir l'avertissement ci-dessus).
    const writesPoValidUntil = input.poValidUntil !== undefined
    // Le TJM en vigueur au moment de la saisie — posé par le SERVEUR, jamais
    // par le client : c'est la référence de l'alerte « tarif changé ».
    const rateNowCents = mission.daily_rate === null ? null : Math.round(Number(mission.daily_rate) * 100)
    await this.terms.manager.query(
      `INSERT INTO mission_commercial_terms (
         mission_id, workspace_id, loaded_daily_cost_cents, channel, po_number, billing_cadence, notice_days, notes,
         requires_po, partner_commission_daily_cents, po_issued_on, po_amount_cents, po_volume_days,
         payment_terms_days, payment_terms_basis, cost_source, currency, cost_currency, cost_breakdown,
         cost_recorded_rate_cents, po_valid_until, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::boolean,$10::bigint,$11::date,$12::bigint,$13::numeric,
         $19::integer,$20::text,$23::text,$24::text,$25::text,$26::jsonb,$31::bigint,$33::date, now())
       ON CONFLICT (mission_id) DO UPDATE SET
         loaded_daily_cost_cents = EXCLUDED.loaded_daily_cost_cents,
         channel = EXCLUDED.channel,
         po_number = EXCLUDED.po_number,
         billing_cadence = EXCLUDED.billing_cadence,
         notice_days = EXCLUDED.notice_days,
         notes = EXCLUDED.notes,
         requires_po = CASE WHEN $14::boolean THEN EXCLUDED.requires_po ELSE mission_commercial_terms.requires_po END,
         partner_commission_daily_cents = CASE WHEN $15::boolean
           THEN EXCLUDED.partner_commission_daily_cents
           ELSE mission_commercial_terms.partner_commission_daily_cents END,
         po_issued_on = CASE WHEN $16::boolean
           THEN EXCLUDED.po_issued_on ELSE mission_commercial_terms.po_issued_on END,
         po_amount_cents = CASE WHEN $17::boolean
           THEN EXCLUDED.po_amount_cents ELSE mission_commercial_terms.po_amount_cents END,
         po_volume_days = CASE WHEN $18::boolean
           THEN EXCLUDED.po_volume_days ELSE mission_commercial_terms.po_volume_days END,
         payment_terms_days = CASE WHEN $21::boolean
           THEN EXCLUDED.payment_terms_days ELSE mission_commercial_terms.payment_terms_days END,
         payment_terms_basis = CASE WHEN $22::boolean
           THEN EXCLUDED.payment_terms_basis ELSE mission_commercial_terms.payment_terms_basis END,
         cost_source = CASE WHEN $27::boolean
           THEN EXCLUDED.cost_source ELSE mission_commercial_terms.cost_source END,
         currency = CASE WHEN $28::boolean
           THEN EXCLUDED.currency ELSE mission_commercial_terms.currency END,
         cost_currency = CASE WHEN $29::boolean
           THEN EXCLUDED.cost_currency ELSE mission_commercial_terms.cost_currency END,
         cost_breakdown = CASE WHEN $30::boolean
           THEN EXCLUDED.cost_breakdown ELSE mission_commercial_terms.cost_breakdown END,
         cost_recorded_rate_cents = CASE
           WHEN EXCLUDED.loaded_daily_cost_cents IS DISTINCT FROM mission_commercial_terms.loaded_daily_cost_cents
             OR ($30::boolean AND EXCLUDED.cost_breakdown IS DISTINCT FROM mission_commercial_terms.cost_breakdown)
           THEN $32::bigint
           ELSE mission_commercial_terms.cost_recorded_rate_cents END,
         po_valid_until = CASE WHEN $34::boolean
           THEN EXCLUDED.po_valid_until ELSE mission_commercial_terms.po_valid_until END,
         updated_at = now()`,
      [
        missionId,
        workspaceId,
        input.loadedDailyCostCents,
        input.channel,
        input.poNumber,
        input.billingCadence,
        input.noticeDays,
        input.notes,
        // Sur une ligne NEUVE, un bon de commande dont personne n'a parlé vaut
        // « non exigé » : c'est la valeur de la colonne (`NOT NULL DEFAULT
        // false`), et un `null` s'y ferait refuser.
        input.requiresPo ?? false,
        input.partnerCommissionDailyCents ?? null,
        input.poIssuedOn ?? null,
        input.poAmountCents ?? null,
        input.poVolumeDays ?? null,
        writesRequiresPo,
        writesCommission,
        writesPoIssuedOn,
        writesPoAmount,
        writesPoVolume,
        input.paymentTermsDays ?? null,
        input.paymentTermsBasis ?? null,
        writesPaymentTermsDays,
        writesPaymentTermsBasis,
        // #2420 — AJOUTÉS EN FIN (voir l'avertissement au-dessus des drapeaux).
        input.costSource ?? null,
        input.currency ?? null,
        input.costCurrency ?? null,
        JSON.stringify(input.costBreakdown ?? {}),
        writesCostSource,
        writesCurrency,
        writesCostCurrency,
        writesCostBreakdown,
        // Une ligne NEUVE sans aucun coût n'a pas de TJM de référence : rien
        // n'a été pensé sur ce tarif-là.
        input.loadedDailyCostCents === null && input.costBreakdown === undefined ? null : rateNowCents,
        rateNowCents,
        // #2566.2 — AJOUTÉ EN FIN (voir l'avertissement au-dessus des drapeaux).
        input.poValidUntil ?? null,
        writesPoValidUntil,
      ],
    )

    const { terms } = await this.readTerms(userId, missionId, true)
    if (!terms) throw new NotFoundException('Conditions introuvables')
    return terms
  }

  // ──────────────────── panneau latéral (planification, PDF-22 §7) ─────────

  /**
   * LES TROIS CONTACTS d'une mission, et son ENTITÉ cliente — le point que la
   * fiche de lecture nomme « le plus manquant » de l'écran de planification.
   *
   * Aucun des trois n'est derrière `finance:read` : ce sont des personnes à
   * contacter, pas des montants — même politique d'accès que `assignments`,
   * ouverte à toute l'équipe qui voit la mission.
   *
   * ⚠️ `entity` reste l'identité PROPRE du compte (raison sociale, adresse,
   * SIREN) — pas `account_entities`, la subdivision client (BU/filiale/KYC)
   * que porte le lot ADV en parallèle. Les deux répondent à « qui est le
   * client », mais à deux granularités différentes ; les confondre créerait
   * deux vérités sur ce que « entité cliente » veut dire ici.
   *
   * ⚠️ Le consultant est la plus RÉCENTE affectation ACTIVE (sans fin, ou la
   * fin la plus tardive), pas la première affectation créée : c'est celui qui
   * est sur la mission AUJOURD'HUI que la fiche doit joindre.
   */
  async readContacts(userId: string, missionId: string): Promise<MissionContactsPanel> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const mission = await this.assertMission(missionId, workspaceId)

    const [entityRows, consultantRows, businessManagerRows, craRows, billingRows, crmDealRows, clientManagerRows] =
      await Promise.all([
        this.terms.manager.query<{ company_name: string; address: string | null; siren: string | null }[]>(
          `SELECT company_name, address, siren FROM accounts WHERE id = $1`,
          [mission.account_id],
        ),
        this.terms.manager.query<{ full_name: string | null; email: string | null; phone: string | null }[]>(
          `SELECT c.full_name, c.email, c.phone
           FROM mission_assignments a
           JOIN consultants c ON c.id = a.consultant_id
          WHERE a.mission_id = $1
          ORDER BY (a.ends_on IS NULL) DESC, a.ends_on DESC, a.starts_on DESC
          LIMIT 1`,
          [missionId],
        ),
        mission.owner_id
          ? this.terms.manager.query<{ first_name: string | null; last_name: string | null; email: string | null }[]>(
              `SELECT first_name, last_name, email FROM profiles WHERE user_id = $1`,
              [mission.owner_id],
            )
          : Promise.resolve([]),
        mission.cra_contact_id
          ? this.terms.manager.query<{ full_name: string | null; email: string | null; phone: string | null }[]>(
              `SELECT full_name, email, phone FROM contacts WHERE id = $1`,
              [mission.cra_contact_id],
            )
          : Promise.resolve([]),
        mission.billing_contact_id
          ? this.terms.manager.query<{ email: string | null }[]>(`SELECT email FROM contacts WHERE id = $1`, [
              mission.billing_contact_id,
            ])
          : Promise.resolve([]),
        // #2561 — le deal CRM rattaché. Sans `crm_deal_id`, aucune requête : la
        // quasi-totalité des missions n'ont pas de correspondance connue, et
        // c'est le cas ordinaire, pas une exception à chercher en base.
        mission.crm_deal_id
          ? this.terms.manager.query<
              {
                provider: string
                deal_id: string
                name: string | null
                stage: string | null
                stage_label: string | null
                amount: string | null
                is_closed: boolean
                is_won: boolean | null
              }[]
            >(
              `SELECT provider, deal_id, name, stage, stage_label, amount, is_closed, is_won
               FROM crm_deal_facts WHERE id = $1`,
              [mission.crm_deal_id],
            )
          : Promise.resolve([]),
        // #2836 — le MANAGER CLIENT, relu SCOPÉ au compte de la mission : un
        // contact déplacé vers un autre compte cesse d'être affiché plutôt que
        // de fuiter d'un compte à l'autre. Non désigné = aucune requête.
        mission.client_manager_contact_id
          ? this.terms.manager.query<{ full_name: string | null; email: string | null; phone: string | null }[]>(
              `SELECT full_name, email, phone FROM contacts WHERE account_id = $2 AND id = $1`,
              [mission.client_manager_contact_id, mission.account_id],
            )
          : Promise.resolve([]),
      ])

    const entityRow = entityRows[0] ?? null
    const consultantRow = consultantRows[0] ?? null
    const businessManagerRow = businessManagerRows[0] ?? null
    const craRow = craRows[0] ?? null
    // ⚠️ Le deal peut avoir été PURGÉ du cache (deal disparu du portail,
    // `CrmDepthService.syncPipeline`) sans que `missions.crm_deal_id` ait
    // suivi (`ON DELETE SET NULL` ne joue qu'à la prochaine purge). Une ligne
    // absente rend `null`, jamais une erreur : c'est la même différence que
    // « pas de correspondance connue » ailleurs dans ce panneau.
    const crmDealRow = crmDealRows[0] ?? null

    return {
      entity: entityRow ? { name: entityRow.company_name, address: entityRow.address, siren: entityRow.siren } : null,
      consultant: consultantRow
        ? { name: consultantRow.full_name, email: consultantRow.email, phone: consultantRow.phone }
        : null,
      // `profiles` ne porte pas de téléphone : `phone` reste `null`, jamais une
      // valeur inventée pour remplir la même forme que les deux autres rôles.
      businessManager: businessManagerRow
        ? {
            name: personName(businessManagerRow.first_name, businessManagerRow.last_name),
            email: businessManagerRow.email,
            phone: null,
          }
        : null,
      craValidator: craRow ? { name: craRow.full_name, email: craRow.email, phone: craRow.phone } : null,
      clientManager: clientManagerRows[0]
        ? { name: clientManagerRows[0].full_name, email: clientManagerRows[0].email, phone: clientManagerRows[0].phone }
        : null,
      clientManagerContactId: clientManagerRows[0] ? mission.client_manager_contact_id : null,
      billingRecipientEmail: billingRows[0]?.email ?? null,
      crmDeal: crmDealRow
        ? {
            provider: crmDealRow.provider,
            dealId: crmDealRow.deal_id,
            name: crmDealRow.name,
            stage: crmDealRow.stage,
            stageLabel: crmDealRow.stage_label,
            amount: crmDealRow.amount,
            isClosed: crmDealRow.is_closed,
            isWon: crmDealRow.is_won,
          }
        : null,
    }
  }

  /**
   * « Changer le contact CRA » — pose qui valide le relevé côté client.
   *
   * Le contact DOIT appartenir au MÊME compte que la mission : un contact d'un
   * autre compte n'a aucune raison de valider CE relevé, et l'accepter romprait
   * le lien mission → compte → contact que le reste de l'écran suppose déjà
   * (même garde que `assertConsultant` pour un consultant hors espace).
   *
   * `contactId: null` retire le contact CRA — redevient « non désigné », pas un
   * état à part.
   */
  async setCraContact(userId: string, missionId: string, contactId: string | null): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const mission = await this.assertMission(missionId, workspaceId)
    if (contactId) {
      const rows = await this.terms.manager.query<{ id: string }[]>(
        `SELECT id FROM contacts WHERE id = $1 AND account_id = $2 LIMIT 1`,
        [contactId, mission.account_id],
      )
      if (rows.length === 0) throw new BadRequestException('Ce contact n’appartient pas au compte de la mission')
    }
    await this.missions.update({ id: missionId, workspace_id: workspaceId }, { cra_contact_id: contactId })
  }

  /**
   * #2836 — « Désigner le manager client » : le contact, CHEZ LE CLIENT, qui
   * encadre le consultant. Même garde que le contact CRA : le contact DOIT
   * appartenir au compte de la mission, la mission à l'espace actif.
   * `contactId: null` retire le manager client (« non désigné »).
   */
  async setClientManager(userId: string, missionId: string, contactId: string | null): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const mission = await this.assertMission(missionId, workspaceId)
    if (contactId) {
      const rows = await this.terms.manager.query<{ id: string }[]>(
        `SELECT id FROM contacts WHERE id = $1 AND account_id = $2 LIMIT 1`,
        [contactId, mission.account_id],
      )
      if (rows.length === 0) throw new BadRequestException('Ce contact n’appartient pas au compte de la mission')
    }
    await this.missions.update({ id: missionId, workspace_id: workspaceId }, { client_manager_contact_id: contactId })
  }

  // ─────────────────────────────── socle ───────────────────────────────────

  private async read(
    clause: string,
    params: unknown[],
    /** #2407.4 — `false` par défaut : le taux ne sort que si l'appelant a vérifié le droit. */
    options: { canReadFinance: boolean } = { canReadFinance: false },
  ): Promise<MissionAssignment[]> {
    const rows = await this.assignments.manager.query<AssignmentRow[]>(
      `SELECT a.*, m.label AS mission_label, acc.company_name AS account_name, c.full_name AS consultant_name
         FROM mission_assignments a
         LEFT JOIN missions m ON m.id = a.mission_id
         LEFT JOIN accounts acc ON acc.id = m.account_id
         LEFT JOIN consultants c ON c.id = a.consultant_id
        WHERE ${clause}
        ORDER BY a.starts_on DESC`,
      params,
    )
    return rows.map(row => ({
      id: row.id,
      missionId: row.mission_id,
      missionLabel: row.mission_label,
      accountName: row.account_name,
      consultantId: row.consultant_id,
      consultantName: row.consultant_name,
      loadPercent: row.load_percent,
      startsOn: asDay(row.starts_on) ?? '',
      endsOn: asDay(row.ends_on),
      createdAt: new Date(row.created_at).toISOString(),
      // #2407.4 — la clé du taux est ABSENTE sans droit : jamais `null`, qui se
      // lirait « aucun taux saisi ».
      ...(options.canReadFinance ? { dailyRateCents: row.daily_rate_cents ?? null } : {}),
      workLocation: row.work_location ?? null,
      remoteMode: asRemoteMode(row.remote_mode),
      // #2407.4 (suite) — DÉCLARATIFS, toujours présents (jamais réservés à
      // `finance:read`) : `null` = non renseigné, lu et non deviné.
      consentGiven: row.consent_given ?? null,
      consentDate: asDay(row.consent_date),
      documentsExpected: row.documents_expected ?? null,
      documentsReceived: row.documents_received ?? null,
      declaredRisks: row.declared_risks ?? null,
      // #2407.6 — le statut propre de l'affectation ; hors vocabulaire = absent.
      ...(assignmentStatusSchema.safeParse(row.status).success
        ? { status: assignmentStatusSchema.parse(row.status) }
        : {}),
    }))
  }

  private async assertMission(missionId: string, workspaceId: string): Promise<MissionEntity> {
    const mission = await this.missions.findOne({ where: { id: missionId, workspace_id: workspaceId } })
    if (!mission) throw new NotFoundException('Mission introuvable')
    return mission
  }

  private async assertConsultant(consultantId: string, workspaceId: string): Promise<void> {
    const rows = await this.assignments.manager.query<{ id: string }[]>(
      `SELECT id FROM consultants WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [consultantId, workspaceId],
    )
    if (rows.length === 0) throw new BadRequestException('Ce talent n’appartient pas à ton espace')
  }
}

/** Un nom composé à partir de prénom/nom — `null` si les deux manquent, jamais
 *  une chaîne vide qui se lirait comme un nom renseigné. */
function personName(firstName: string | null, lastName: string | null): string | null {
  const full = [firstName, lastName].filter((part): part is string => Boolean(part?.trim())).join(' ')
  return full.length > 0 ? full : null
}

/** #2420 — un `bigint` / `numeric` Postgres (souvent une chaîne) en nombre ; `null` reste `null`, jamais 0. */
function cents(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** #2420 — le premier jour du mois courant (UTC), la forme de `mission_timesheets.period_month`. */
function currentMonth(today: Date = new Date()): string {
  return `${today.toISOString().slice(0, 7)}-01`
}

/** #2407.4 — une valeur hors de l'énumération (écrite à la main en base) ne se
 *  devine pas : `null`, comme une absence. */
function asRemoteMode(value: string | null | undefined): 'onsite' | 'hybrid' | 'remote' | null {
  return value === 'onsite' || value === 'hybrid' || value === 'remote' ? value : null
}
