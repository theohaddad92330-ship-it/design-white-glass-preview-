/**
 * Rapports de pipeline — le calcul, séparé de la lecture.
 *
 * Les méta-analyses réclament des chiffres que le produit ne savait pas produire :
 * « analyse mon pipeline Q3 et propose les priorités Q4 » (§8 conseil n°22),
 * « liste les deals gagnés vs perdus du trimestre précédent » (§7 requête n°45),
 * « analyse le taux de conversion RDV → deals » (§8 conseil n°8), « génère un
 * rapport mensuel complet pipeline » (§5.3 HubSpot n°23).
 *
 * Arbitrage Louis du 03/08 : lecture PROFONDE de l'historique des deals, puis
 * cache. Ce fichier est la moitié « calcul » de cette décision — une fonction
 * pure sur un tableau de faits, sans réseau, sans horloge implicite (`now` est
 * un paramètre). C'est ce qui rend le chiffre testable : un taux de conversion
 * faux ne se voit pas à l'œil, il se voit dans un test.
 *
 * Règle d'honnêteté qui traverse tout le fichier : **ce qui n'est pas mesurable
 * est compté à part, jamais absorbé dans le total**. Un deal sans date de
 * création n'a pas un cycle de zéro jour ; il n'a pas de cycle. Un deal sans
 * montant ne vaut pas 0 € ; il n'a pas de montant. C'est la même règle que le
 * registre des coûts fournisseurs (D19), où une ligne non tarifée porte `null`
 * plutôt qu'un zéro qui mentirait sur le total.
 */

import { measuredRate, type PipelinePeriod, type PipelineReport } from '@bellum/contracts'

/** Un deal, tel que le cache le conserve après lecture du CRM. */
export type DealFact = {
  id: string
  name: string | null
  /** Identifiant technique de l'étape chez le fournisseur. */
  stage: string | null
  /** Libellé lisible de l'étape, quand le pipeline a pu être lu. */
  stageLabel: string | null
  pipeline: string | null
  /** `null` = montant absent, ce qui n'est PAS zéro. */
  amount: number | null
  ownerId: string | null
  ownerName: string | null
  createdAt: string | null
  closedAt: string | null
  /** #3918 — dernière modification connue chez le fournisseur. `null` quand il
   *  ne l'expose pas, ou que le deal n'a jamais été modifié depuis sa création. */
  lastActivityAt: string | null
  isClosed: boolean
  /** `true` gagné, `false` perdu, `null` quand le deal est encore ouvert. */
  isWon: boolean | null
  /** #3918.a — la société associée CHEZ LE FOURNISSEUR (id, SIREN, domaine) :
   *  les seules clés de jointure deal → compte. Absentes = aucune jointure. */
  companyExternalId?: string | null
  companySiren?: string | null
  companyDomain?: string | null
  /** Lot 762 P5 — la raison sociale de la société associée, quand le fournisseur la rend. */
  companyName?: string | null
}

/**
 * La forme du rapport vit dans `@bellum/contracts` : c'est un contrat de
 * frontière, lu par la SPA autant qu'écrit ici. La dupliquer localement
 * garantirait qu'un jour les deux divergent sans que rien ne le dise.
 */
type StageBucket = PipelineReport['open']['byStage'][number]
type OwnerBucket = PipelineReport['byOwner'][number]

const DAY_MS = 86_400_000

/** Parse une date ISO en millisecondes, ou `null` si elle est illisible. */
function parseTime(value: string | null): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * Début de la fenêtre demandée, calculé sur `now`.
 *
 * Le trimestre est ancré sur les trimestres CIVILS (janvier, avril, juillet,
 * octobre) et non sur « il y a 90 jours » : quand un commercial dit « Q3 », il
 * parle du trimestre de son entreprise, pas d'une fenêtre glissante. Un rapport
 * qui décale de trois semaines ne se compare à rien.
 */
export function periodStart(now: Date, period: PipelinePeriod): Date {
  const year = now.getUTCFullYear()
  if (period === 'year') return new Date(Date.UTC(year, 0, 1))
  if (period === 'quarter') {
    const quarter = Math.floor(now.getUTCMonth() / 3)
    return new Date(Date.UTC(year, quarter * 3, 1))
  }
  return new Date(Date.UTC(year, now.getUTCMonth(), 1))
}

function bucketByStage(deals: DealFact[]): StageBucket[] {
  const buckets = new Map<string, StageBucket>()
  for (const deal of deals) {
    const stage = deal.stage ?? 'unknown'
    const existing = buckets.get(stage) ?? {
      stage,
      label: deal.stageLabel,
      deals: 0,
      amount: 0,
      amountUnknown: 0,
    }
    existing.deals += 1
    if (deal.amount == null) existing.amountUnknown += 1
    else existing.amount += deal.amount
    // Le libellé peut n'être connu que sur certaines lignes (pipeline lu après
    // coup) : la première valeur non nulle gagne, aucune n'est inventée.
    if (!existing.label && deal.stageLabel) existing.label = deal.stageLabel
    buckets.set(stage, existing)
  }
  return [...buckets.values()].sort((a, b) => b.deals - a.deals || a.stage.localeCompare(b.stage))
}

function bucketByOwner(open: DealFact[], closedInWindow: DealFact[]): OwnerBucket[] {
  const buckets = new Map<string, OwnerBucket>()
  const ensure = (deal: DealFact): OwnerBucket => {
    const ownerId = deal.ownerId ?? 'unassigned'
    const existing = buckets.get(ownerId) ?? {
      ownerId,
      ownerName: deal.ownerName,
      open: 0,
      won: 0,
      lost: 0,
      wonAmount: 0,
    }
    if (!existing.ownerName && deal.ownerName) existing.ownerName = deal.ownerName
    buckets.set(ownerId, existing)
    return existing
  }
  for (const deal of open) ensure(deal).open += 1
  for (const deal of closedInWindow) {
    const bucket = ensure(deal)
    if (deal.isWon === true) {
      bucket.won += 1
      if (deal.amount != null) bucket.wonAmount += deal.amount
    } else if (deal.isWon === false) {
      bucket.lost += 1
    }
  }
  return [...buckets.values()].sort((a, b) => b.won - a.won || b.open - a.open || a.ownerId.localeCompare(b.ownerId))
}

/**
 * Construit le rapport à partir des faits en cache.
 *
 * `now` est passé explicitement : un rapport qui lit l'horloge ne se teste pas,
 * et le premier bug d'un rapport trimestriel est toujours une histoire de bord
 * de fenêtre.
 */
export function buildPipelineReport(
  deals: readonly DealFact[],
  options: {
    now: Date
    period: PipelinePeriod
    truncated: boolean
    syncedAt: string | null
  },
): PipelineReport {
  const from = periodStart(options.now, options.period)
  const fromMs = from.getTime()
  const toMs = options.now.getTime()

  const open: DealFact[] = []
  const closedInWindow: DealFact[] = []
  for (const deal of deals) {
    if (!deal.isClosed) {
      open.push(deal)
      continue
    }
    const closedAt = parseTime(deal.closedAt)
    // Un deal clos sans date de clôture lisible n'appartient à AUCUNE fenêtre.
    // Le compter dans la période courante gonflerait le trimestre en cours de
    // tout l'historique mal daté — précisément le chiffre qu'on ne veut pas.
    if (closedAt != null && closedAt >= fromMs && closedAt <= toMs) closedInWindow.push(deal)
  }

  let won = 0
  let lost = 0
  let outcomeUnknown = 0
  let wonAmount = 0
  let lostAmount = 0
  let cycleTotal = 0
  let cycleCount = 0
  let cycleUnmeasured = 0

  for (const deal of closedInWindow) {
    if (deal.isWon === true) {
      won += 1
      if (deal.amount != null) wonAmount += deal.amount
    } else if (deal.isWon === false) {
      lost += 1
      if (deal.amount != null) lostAmount += deal.amount
    } else {
      outcomeUnknown += 1
    }

    const createdAt = parseTime(deal.createdAt)
    const closedAt = parseTime(deal.closedAt)
    if (createdAt != null && closedAt != null && closedAt >= createdAt) {
      cycleTotal += closedAt - createdAt
      cycleCount += 1
    } else {
      cycleUnmeasured += 1
    }
  }

  const decided = won + lost
  const openAmount = open.reduce((sum, deal) => sum + (deal.amount ?? 0), 0)
  const openAmountUnknown = open.filter(deal => deal.amount == null).length

  return {
    from: from.toISOString(),
    to: options.now.toISOString(),
    period: options.period,
    open: {
      deals: open.length,
      amount: openAmount,
      amountUnknown: openAmountUnknown,
      byStage: bucketByStage(open),
    },
    closed: { won, lost, wonAmount, lostAmount, outcomeUnknown },
    // La MÊME division que la chaîne commerciale, qui s'affiche sur le MÊME
    // écran : `measuredRate` la tient pour tout le produit. Écrite à la main
    // ici, elle avait déjà une règle de bord de moins que sa voisine.
    winRate: measuredRate(won, decided),
    averageCycleDays: cycleCount > 0 ? Math.round(cycleTotal / cycleCount / DAY_MS) : null,
    cycleUnmeasured,
    byOwner: bucketByOwner(open, closedInWindow),
    coverage: {
      dealsRead: deals.length,
      truncated: options.truncated,
      syncedAt: options.syncedAt,
    },
  }
}

/**
 * Le taux de conversion « rendez-vous → deal » (§8 conseil n°8).
 *
 * Il ne se lit nulle part : c'est un rapprochement entre deux objets que le CRM
 * ne relie pas. On le calcule sur les CONTACTS qui ont eu au moins une réunion
 * tenue, puis on regarde combien d'entre eux portent un deal. Le dénominateur
 * est donc « des personnes rencontrées », jamais « des réunions » — un même
 * prospect vu trois fois ne compte qu'une fois, sinon le taux s'effondre pour
 * les cycles longs, qui sont justement ceux d'une ESN.
 *
 * `null` quand personne n'a été rencontré : mieux vaut ne pas afficher de taux
 * qu'en afficher un calculé sur trois personnes.
 */
export function meetingToDealRate(input: { contactsWithMeeting: number; contactsWithMeetingAndDeal: number }): {
  rate: number | null
  base: number
} {
  const base = Math.max(0, Math.trunc(input.contactsWithMeeting))
  if (base === 0) return { rate: null, base: 0 }
  const converted = Math.min(Math.max(0, Math.trunc(input.contactsWithMeetingAndDeal)), base)
  return { rate: converted / base, base }
}
