import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Between, In, Repository } from 'typeorm'
import {
  ADV_BLOCKERS,
  ADV_RENEWALS_SOURCE_CAP,
  ADV_RESERVED_BLOCKERS,
  advRenewalOpenedOn,
  assessAdvDossier,
  type AdvBlocker,
  type AdvDossier,
  type AdvDossiersPage,
  type AdvDossiersQuery,
  type AdvSummary,
  type MissionStatus,
  type UpdateAdvDossierInput,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountEntityRow } from '../../database/entities/account-entity.entity'
import { AdvRecordEntity } from '../../database/entities/adv-record.entity'
import { InvoiceReadinessEntity } from '../../database/entities/invoice-readiness.entity'
import { MissionCommercialTermsEntity } from '../../database/entities/mission-commercial-terms.entity'
import { MissionEntity } from '../../database/entities/mission.entity'

/**
 * Ce que l'ADV lit d'une mission — jamais l'entité complète, et jamais un type
 * importé d'un autre module.
 *
 * Une forme STRUCTURELLE, parce que les deux sources ne sont pas du même type :
 * les démarrages viennent du dépôt `missions`, les renouvellements de la liste
 * que `GET /delivery/renewals` a déjà calculée. Les deux portent ces champs-là,
 * et ce service n'a besoin de rien d'autre.
 */
export type AdvMissionSource = {
  id: string
  account_id?: string | null
  label?: string | null
  status?: string | null
  started_on?: string | null
  ends_on?: string | null
  billing_contact_id?: string | null
}

/**
 * ADMINISTRATION DES VENTES — la file de ce qui empêche un dossier de démarrer
 * ou d'être reconduit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE RECODE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois calculs existaient et sont BRANCHÉS, jamais réécrits :
 *
 *  - les renouvellements à traiter viennent de {@link DeliveryService.renewalsToAct}
 *    (`GET /delivery/renewals`), qui portait déjà la fenêtre J-60 / J-30 et
 *    n'avait aucun appelant côté produit ;
 *  - le bon de commande vient de `mission_commercial_terms` (`requires_po` /
 *    `po_number`), avec la même règle qu'`assessInvoiceReadiness` ;
 *  - « prêt à facturer » est LU dans `invoice_readiness`, jamais recalculé —
 *    deux écrans ne doivent pas rendre deux verdicts pour le même mois.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE RÉSUMÉ NE DIT PAS, ET POURQUOI IL LE DIT
 * ─────────────────────────────────────────────────────────────────────────────
 *  - `startsDelta` : MESURÉ depuis le 31/08/2026 — voir `previousStarts`. Un
 *    démarrage est un flux DATÉ (`missions.started_on`), donc recomptable à
 *    l'identique pour un mois passé ; il n'a pas besoin d'être photographié.
 *    `null` reste la réponse du PREMIER mois d'un espace, et ce n'est pas une
 *    panne.
 *  - `renewalsDelta` : `null`, et la raison n'a PAS bougé. `renewals` arrive de
 *    `DeliveryService.renewalsToAct`, dont la fenêtre J-60/J-30 est relative à
 *    MAINTENANT : « les renouvellements à traiter en juillet » n'est pas
 *    recomposable en août, parce que la question elle-même a bougé avec le
 *    calendrier. « +0 » se lirait « stable », ce qu'on ne peut pas soutenir.
 *  - `inNegotiation` : `null`. `MISSION_STATUSES` n'a pas cet état, et la
 *    négociation vit sur les projets — une autre population.
 *  - le compteur du motif `kyc_not_validated` : `null`. Le motif est RÉSERVÉ
 *    (un autre lot le branche) ; `0` se lirait « aucun KYC à valider » sur un
 *    espace où personne n'a jamais regardé.
 */
@Injectable()
export class AdvService {
  constructor(
    @InjectRepository(MissionEntity) private readonly missions: Repository<MissionEntity>,
    @InjectRepository(AdvRecordEntity) private readonly records: Repository<AdvRecordEntity>,
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(AccountEntityRow) private readonly accountEntities: Repository<AccountEntityRow>,
    @InjectRepository(MissionCommercialTermsEntity) private readonly terms: Repository<MissionCommercialTermsEntity>,
    @InjectRepository(InvoiceReadinessEntity) private readonly readiness: Repository<InvoiceReadinessEntity>,
  ) {}

  /**
   * La file de travail ET son résumé, en un seul appel.
   *
   * ⚠️ Le RÉSUMÉ est calculé sur la population ENTIÈRE, la liste seule est
   * filtrée. L'inverse remettrait toutes les pastilles à zéro dès qu'on en
   * clique une — et un zéro qui vient d'un filtre se lit exactement comme un
   * zéro qui vient du réel.
   *
   * ⚠️ `renewals` ARRIVE d'en haut : c'est le contrôleur qui appelle
   * `DeliveryService.renewalsToAct`. Ce n'est pas une coquetterie — GA-07
   * refuse qu'un service aille chercher le service d'un autre module, et sa
   * consigne est exactement celle-ci : « fais l'orchestration dans le
   * contrôleur, c'est là que vit un geste utilisateur ». Le calcul reste celui
   * de la livraison, il n'est pas refait ici.
   *
   * ⚠️ `renewalsTruncated` : `DeliveryService.list` plafonne sa source à
   * {@link ADV_RENEWALS_SOURCE_CAP} missions, SANS pagination — sur un espace
   * plus grand, la file mentirait par omission sans qu'aucun signal ne le
   * dise. Le drapeau compare la taille REÇUE au plafond ; voir le docblock du
   * contrat pour ce qu'il ne peut PAS prouver.
   */
  async dossiers(
    workspaceId: string,
    renewals: readonly AdvMissionSource[],
    query: AdvDossiersQuery,
    now: Date = new Date(),
  ): Promise<AdvDossiersPage> {
    const month = query.month ?? monthOf(now)
    const [{ items, ready }, previousStarts] = await Promise.all([
      this.build(workspaceId, renewals, month),
      this.startsIn(workspaceId, previousMonthOf(month)),
    ])
    return {
      month,
      items: filter(items, ready, query),
      summary: summarise(month, items, ready, previousStarts),
      // Les deux lots ont touché ce retour la même nuit : l'un y a ajouté la
      // comparaison au mois précédent, l'autre le drapeau de troncature. Les
      // deux sont des faits distincts sur la même réponse.
      renewalsTruncated: renewals.length >= ADV_RENEWALS_SOURCE_CAP,
    }
  }

  /**
   * Les démarrages d'un mois — un COMPTE, jamais des lignes.
   *
   * ⚠️ Elle réutilise le prédicat EXACT de `build` (`started_on` entre le 1er et
   * le dernier jour du mois). Deux définitions de « démarrage » — l'une pour la
   * file, l'autre pour sa variation — divergeraient au premier correctif appliqué
   * d'un seul côté, et l'écran comparerait alors deux populations différentes
   * sans que rien ne rougisse.
   *
   * Rend `null` quand la lecture ÉCHOUE : un mois de référence illisible n'est
   * pas un mois à zéro, et « −36 » serait la pire des réponses possibles.
   */
  private async startsIn(workspaceId: string, month: string): Promise<number | null> {
    try {
      return await this.missions.count({
        where: { workspace_id: workspaceId, started_on: Between(`${month}-01`, lastDayOf(month)) },
      })
    } catch {
      return null
    }
  }

  /**
   * Le geste de réparation — et il n'y en a qu'un.
   *
   * Il crée le dossier à la première correction : une table pré-remplie pour
   * toutes les missions serait pleine de lignes vides qu'aucun humain n'a
   * touchées, et « personne n'a saisi » se dit très bien par l'absence de ligne.
   *
   * ⚠️ Un champ ABSENT de la requête n'est pas effacé. Seul un `null` explicite
   * retire un terme — un champ financier se retire, il ne se met pas à zéro.
   */
  async update(
    workspaceId: string,
    userId: string,
    missionId: string,
    input: UpdateAdvDossierInput,
    renewals: readonly AdvMissionSource[],
    now: Date = new Date(),
  ): Promise<AdvDossier> {
    const mission = await this.missions.findOne({ where: { id: missionId, workspace_id: workspaceId } })
    if (!mission) throw new NotFoundException('Mission introuvable dans votre espace de travail.')

    const existing = await this.records.findOne({ where: { mission_id: missionId, workspace_id: workspaceId } })
    const row =
      existing ??
      this.records.create({
        mission_id: missionId,
        workspace_id: workspaceId,
        client_billing_reference: null,
        payment_terms_days: null,
        payment_details_transmitted_at: null,
        client_entity_id: null,
      })

    if (input.clientBillingReference !== undefined) row.client_billing_reference = input.clientBillingReference
    if (input.paymentTermsDays !== undefined) row.payment_terms_days = input.paymentTermsDays
    if (input.clientEntityId !== undefined) row.client_entity_id = input.clientEntityId
    // ⚠️ On enregistre un ÉTAT et sa DATE. Il n'y a pas de champ pour un numéro,
    // et il n'y en aura pas : Bellum ne stocke aucun moyen de paiement.
    if (input.paymentDetailsTransmitted !== undefined) {
      row.payment_details_transmitted_at = input.paymentDetailsTransmitted ? now : null
    }
    row.updated_by = userId
    await this.records.save(row)

    // La ligne rendue est RECALCULÉE par le MÊME chemin que la file, jamais
    // recomposée à la main : l'écran doit voir exactement ce qu'il verra au
    // prochain chargement.
    //
    // La NATURE du dossier vient de la seule source qui la connaît — la liste
    // des renouvellements à traiter, calculée par la livraison. La redéduire ici
    // en relisant `ends_on` ferait une seconde règle de sélection, et deux
    // règles qui disent « celle-ci est un renouvellement » divergent.
    const kind = renewals.some(candidate => candidate.id === missionId) ? ('renewal' as const) : ('start' as const)
    const single = (await this.compose(workspaceId, [{ mission, kind }])).items[0]
    if (!single) throw new NotFoundException('Dossier ADV introuvable.')
    return single
  }

  // ── Construction ───────────────────────────────────────────────────────────

  /**
   * Les dossiers de la période : les démarrages du mois, et les renouvellements
   * à traiter.
   *
   * ⚠️ Un DÉMARRAGE est une mission dont `started_on` tombe dans le mois — pas
   * une mission `onboarding` sans date de début. Cette dernière existe, et elle
   * est déjà nommée ailleurs : `missing_start_date` d'`INVOICE_BLOCKERS` la
   * signale sur l'écran de facturation. La compter ici la ferait apparaître dans
   * TOUS les mois, puisqu'elle n'appartient à aucun.
   *
   * ⚠️ Une même mission peut porter DEUX dossiers — un démarrage ce mois-ci et
   * un renouvellement dans quarante-cinq jours. Ce sont deux événements
   * distincts, avec deux gestes distincts ; les fusionner ferait disparaître le
   * second.
   */
  private async build(
    workspaceId: string,
    renewals: readonly AdvMissionSource[],
    month: string,
  ): Promise<{ items: AdvDossier[]; ready: ReadonlySet<string> }> {
    const starts = await this.missions.find({
      where: { workspace_id: workspaceId, started_on: Between(`${month}-01`, lastDayOf(month)) },
    })

    const pairs = [
      ...starts.map(mission => ({ mission: mission as AdvMissionSource, kind: 'start' as const })),
      ...renewals.map(mission => ({ mission, kind: 'renewal' as const })),
    ]
    return await this.compose(workspaceId, pairs, month)
  }

  /**
   * Le seul chemin qui transforme une mission en dossier rendu.
   *
   * ⚠️ `ready` VOYAGE avec le résultat au lieu de vivre sur le service : deux
   * requêtes simultanées se marcheraient dessus sur un champ d'instance, et le
   * résumé de l'une compterait la population de l'autre. Un état de requête ne
   * se range pas sur un singleton.
   */
  private async compose(
    workspaceId: string,
    pairs: readonly { mission: AdvMissionSource; kind: 'start' | 'renewal' }[],
    month?: string,
  ): Promise<{ items: AdvDossier[]; ready: ReadonlySet<string> }> {
    if (pairs.length === 0) return { items: [], ready: new Set() }
    const missionIds = [...new Set(pairs.map(pair => pair.mission.id))]
    const accountIds = [...new Set(pairs.map(pair => pair.mission.account_id).filter((id): id is string => !!id))]

    const [records, terms, accounts, readyRows] = await Promise.all([
      this.records.find({ where: { mission_id: In(missionIds), workspace_id: workspaceId } }),
      this.terms.find({ where: { mission_id: In(missionIds) } }),
      accountIds.length > 0 ? this.accounts.find({ where: { id: In(accountIds) } }) : Promise.resolve([]),
      month
        ? this.readiness.find({
            where: { workspace_id: workspaceId, mission_id: In(missionIds), period_month: `${month}-01` },
          })
        : Promise.resolve([]),
    ])

    const recordByMission = new Map(records.map(row => [row.mission_id, row]))
    const termsByMission = new Map(terms.map(row => [row.mission_id, row]))
    const accountName = new Map(accounts.map(row => [row.id, row.company_name ?? null]))
    const ready = new Set(readyRows.filter(row => row.state === 'ready').map(row => row.mission_id))

    const entityIds = [...new Set(records.map(row => row.client_entity_id).filter((id): id is string => !!id))]
    const entities = entityIds.length > 0 ? await this.accountEntities.find({ where: { id: In(entityIds) } }) : []
    const entityById = new Map(entities.map(row => [row.id, row]))

    const items = pairs.map(({ mission, kind }) => {
      const record = recordByMission.get(mission.id) ?? null
      const term = termsByMission.get(mission.id) ?? null
      const entity = record?.client_entity_id ? (entityById.get(record.client_entity_id) ?? null) : null

      const { state, blockers } = assessAdvDossier({
        kind,
        billingContactId: mission.billing_contact_id ?? null,
        requiresPo: term?.requires_po ?? false,
        poNumber: term?.po_number ?? null,
        clientBillingReference: record?.client_billing_reference ?? null,
        paymentTermsDays: record?.payment_terms_days ?? null,
        paymentDetailsTransmittedAt: record?.payment_details_transmitted_at?.toISOString() ?? null,
        // ⚠️ Un identifiant qui ne résout plus (entité fusionnée, reprise par un
        // autre chantier) se traite comme une entité ABSENTE — un motif à
        // réparer, jamais une entité réputée désignée.
        clientEntityId: entity ? (record?.client_entity_id ?? null) : null,
      })

      return {
        missionId: mission.id,
        missionLabel: mission.label ?? null,
        accountId: mission.account_id ?? null,
        accountName: mission.account_id ? (accountName.get(mission.account_id) ?? null) : null,
        kind,
        missionStatus: (mission.status ?? 'active') as MissionStatus,
        state,
        blockers,
        openedOn: kind === 'start' ? (mission.started_on ?? null) : advRenewalOpenedOn(mission.ends_on ?? null),
        startedOn: mission.started_on ?? null,
        endsOn: mission.ends_on ?? null,
        clientBillingReference: record?.client_billing_reference ?? null,
        paymentTermsDays: record?.payment_terms_days ?? null,
        paymentDetailsTransmittedAt: record?.payment_details_transmitted_at?.toISOString() ?? null,
        clientEntityId: record?.client_entity_id ?? null,
        clientEntityName: entity?.name ?? null,
      }
    })
    return { items, ready }
  }
}

// ── Résumé et filtres ────────────────────────────────────────────────────────

function summarise(
  month: string,
  all: readonly AdvDossier[],
  ready: ReadonlySet<string>,
  /** Les démarrages du mois PRÉCÉDENT, ou `null` si on n'a pas pu les compter. */
  previousStarts: number | null,
): AdvSummary {
  const counted = (blocker: AdvBlocker): number | null =>
    ADV_RESERVED_BLOCKERS.includes(blocker) ? null : all.filter(item => item.blockers.includes(blocker)).length
  const starts = all.filter(item => item.kind === 'start').length
  return {
    month,
    total: all.length,
    starts,
    renewals: all.filter(item => item.kind === 'renewal').length,
    active: all.filter(item => item.missionStatus === 'active').length,
    readyToInvoice: all.filter(item => ready.has(item.missionId)).length,
    inNegotiation: null,
    incomplete: all.filter(item => item.state === 'incomplete').length,
    // ⚠️ CHANGEMENT DU 31/08/2026, à lire en revue : le champ était `z.null()`
    // au contrat — « retirer le MOYEN d'écrire +0 » — et il devient un entier
    // signé. Ce qui l'autorise n'est pas un assouplissement : c'est qu'un
    // démarrage est un flux DATÉ, recomptable à l'identique pour un mois passé,
    // là où un STOCK aurait exigé la photo mensuelle (D2 · 31/08).
    //
    // `null` quand le mois de référence n'a pas pu être lu — ou n'existe pas,
    // au premier mois d'un espace. Jamais `0` : « autant qu'en juillet » et
    // « on ne sait pas ce qu'il y avait en juillet » sont deux phrases
    // différentes, et une seule des deux rassure.
    startsDelta: previousStarts === null ? null : starts - previousStarts,
    // Toujours `null`, et ce n'est pas la même absence — voir le docblock du
    // service : la fenêtre des renouvellements est relative à MAINTENANT.
    renewalsDelta: null,
    byBlocker: ADV_BLOCKERS.map(blocker => ({ blocker, count: counted(blocker) })),
  }
}

function filter(all: readonly AdvDossier[], ready: ReadonlySet<string>, query: AdvDossiersQuery): AdvDossier[] {
  const needle = (query.q ?? '').trim().toLowerCase()
  return all
    .filter(item => {
      if (query.tile === 'starts' && item.kind !== 'start') return false
      if (query.tile === 'renewals' && item.kind !== 'renewal') return false
      if (query.tile === 'active' && item.missionStatus !== 'active') return false
      if (query.tile === 'ready_to_invoice' && !ready.has(item.missionId)) return false
      if (query.blocker && !item.blockers.includes(query.blocker)) return false
      if (needle.length === 0) return true
      return `${item.missionLabel ?? ''} ${item.accountName ?? ''}`.toLowerCase().includes(needle)
    })
    .sort(byOldestFirst)
}

/**
 * Le plus ancien d'abord — c'est celui qui coûte.
 *
 * Une ouverture INCONNUE part en fin de liste plutôt que d'être traitée comme
 * « aujourd'hui » : sans date, on ne peut pas affirmer qu'un dossier est
 * urgent, et le placer en tête ferait passer devant ce qu'on ne sait pas dater.
 */
function byOldestFirst(a: AdvDossier, b: AdvDossier): number {
  if (a.openedOn === b.openedOn) return (a.missionLabel ?? '').localeCompare(b.missionLabel ?? '')
  if (a.openedOn === null) return 1
  if (b.openedOn === null) return -1
  return a.openedOn.localeCompare(b.openedOn)
}

function monthOf(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Le mois précédent, calculé — jamais un `- 1` sur le numéro de mois, qui rend
 * « 2026-00 » en janvier.
 */
function previousMonthOf(month: string): string {
  const [year, index] = month.split('-').map(Number)
  const start = new Date(Date.UTC(year ?? 1970, (index ?? 1) - 2, 1))
  return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Le dernier jour du mois, calculé — jamais une table de 28/30/31 recopiée. */
function lastDayOf(month: string): string {
  const [year, index] = month.split('-').map(Number)
  const end = new Date(Date.UTC(year ?? 1970, index ?? 1, 0))
  return end.toISOString().slice(0, 10)
}
