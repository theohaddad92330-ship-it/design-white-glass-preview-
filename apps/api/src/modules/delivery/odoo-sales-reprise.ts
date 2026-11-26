import { createHash } from 'node:crypto'
import type { OdooSaleOrder, OdooSaleOrderLine } from '../odoo/odoo.client'

/**
 * #2561/#2562 — LA CORRESPONDANCE vente Odoo ↔ mission Bellum, en fonctions
 * PURES (aucune lecture, aucune écriture : le service les nourrit).
 *
 * Trois questions, chacune tranchée par la doctrine :
 *
 *  1. LE COMPTE — retrouvé par le NOM EXACT du client (casse, accents et
 *     espaces neutralisés, rien de plus). Aucun compte → `not_found` ; deux
 *     homonymes → `ambiguous`. Dans les deux cas AUCUN brouillon : on ne
 *     rattache pas une mission à un compte deviné (« le compte est choisi,
 *     jamais deviné », #2562).
 *
 *  2. « DÉJÀ UNE MISSION » — d'abord le LIEN posé par une reprise précédente
 *     (`missions.odoo_sale_order_id`), puis, sur le MÊME compte seulement :
 *     la référence Odoo dans le libellé, le libellé de la prestation, ou les
 *     DATES (même début ET même TJM quand les deux sont connus — deux
 *     consultants commencent souvent le même lundi chez le même client).
 *     Une mission ne répond qu'à UNE vente.
 *
 *  3. CE QUI SERAIT CRÉÉ — le brouillon (`draftFromSale`) : libellé, début,
 *     TJM. Le TJM n'est pris que s'il est UNIQUE sur les lignes ; deux prix
 *     différents → `null`, jamais une moyenne. La nature du contrat n'est pas
 *     devinée (`inconnu` à la création, comme toute mission).
 */

type OdooMissionDraft = {
  label: string
  startedOn: string | null
  dailyRate: number | null
}

type OdooSaleMissionMatch = {
  id: string
  label: string
  by: 'link' | 'reference' | 'label' | 'dates'
}

export type OdooSaleRow = {
  saleId: number
  reference: string
  clientName: string | null
  clientRef: string | null
  orderDate: string | null
  commitmentDate: string | null
  invoiceStatus: string | null
  amountUntaxed: number | null
  currency: string | null
  lines: OdooSaleOrderLine[]
  account: { id: string; name: string } | null
  accountIssue: 'not_found' | 'ambiguous' | null
  mission: OdooSaleMissionMatch | null
  /** `null` = rien à reprendre (déjà une mission, ou compte introuvable). */
  draft: OdooMissionDraft | null
}

/** Une ligne de la prévisualisation figée : EXACTEMENT ce qui sera créé. */
export type OdooReprisePreviewItem = {
  saleId: number
  reference: string
  accountId: string
  accountName: string
  label: string
  startedOn: string | null
  dailyRate: number | null
}

type AccountLike = { id: string; company_name: string }
type MissionLike = {
  id: string
  label: string
  account_id: string
  started_on: string | null
  daily_rate: number | null
  odoo_sale_order_id: number | null
}

const LABEL_MAX = 160

/** Casse, accents et espaces neutralisés — rien de plus : pas de ressemblance. */
function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function draftFromSale(sale: OdooSaleOrder): OdooMissionDraft {
  const firstLabel = sale.lines
    .find(line => line.label.trim() !== '')
    ?.label.trim()
    .slice(0, LABEL_MAX)
  const prices = new Set(
    sale.lines
      .filter(line => (line.quantity ?? 0) > 0 && line.unitPrice !== null && line.unitPrice > 0)
      .map(line => line.unitPrice as number),
  )
  return {
    label: firstLabel ? `${firstLabel} (${sale.reference})` : sale.reference,
    startedOn: sale.commitmentDate ?? sale.orderDate,
    dailyRate: prices.size === 1 ? ([...prices][0] ?? null) : null,
  }
}

export function classifyOdooSales(
  sales: readonly OdooSaleOrder[],
  accounts: readonly AccountLike[],
  missions: readonly MissionLike[],
): OdooSaleRow[] {
  const accountsByName = new Map<string, AccountLike[]>()
  for (const account of accounts) {
    const key = normalize(account.company_name ?? '')
    if (!key) continue
    accountsByName.set(key, [...(accountsByName.get(key) ?? []), account])
  }
  const used = new Set<string>()

  return sales.map(sale => {
    const base = {
      saleId: sale.id,
      reference: sale.reference,
      clientName: sale.partnerName,
      clientRef: sale.clientRef,
      orderDate: sale.orderDate,
      commitmentDate: sale.commitmentDate,
      invoiceStatus: sale.invoiceStatus,
      amountUntaxed: sale.amountUntaxed,
      currency: sale.currency,
      lines: sale.lines,
    }

    const candidates = sale.partnerName ? (accountsByName.get(normalize(sale.partnerName)) ?? []) : []
    const account = candidates.length === 1 ? (candidates[0] ?? null) : null
    const accountIssue = account ? null : candidates.length > 1 ? 'ambiguous' : 'not_found'
    const accountView = account ? { id: account.id, name: account.company_name } : null

    const linked = missions.find(m => m.odoo_sale_order_id === sale.id)
    if (linked) {
      used.add(linked.id)
      return {
        ...base,
        account: accountView,
        accountIssue,
        mission: { id: linked.id, label: linked.label, by: 'link' as const },
        draft: null,
      }
    }

    const draft = draftFromSale(sale)
    if (!account) return { ...base, account: null, accountIssue, mission: null, draft: null }

    const sameAccount = missions.filter(
      m => m.account_id === account.id && m.odoo_sale_order_id === null && !used.has(m.id),
    )
    const reference = normalize(sale.reference)
    const lineLabel = sale.lines[0]?.label ? normalize(sale.lines[0].label) : null
    const match =
      sameAccount.filter(m => normalize(m.label).includes(reference)).map(m => ({ m, by: 'reference' as const }))[0] ??
      sameAccount
        .filter(m => lineLabel && normalize(m.label) === lineLabel)
        .map(m => ({ m, by: 'label' as const }))[0] ??
      sameAccount
        .filter(
          m =>
            draft.startedOn !== null &&
            m.started_on === draft.startedOn &&
            (m.daily_rate === null || draft.dailyRate === null || Number(m.daily_rate) === draft.dailyRate),
        )
        .map(m => ({ m, by: 'dates' as const }))[0]

    if (match) {
      used.add(match.m.id)
      return {
        ...base,
        account: accountView,
        accountIssue,
        mission: { id: match.m.id, label: match.m.label, by: match.by },
        draft: null,
      }
    }
    return { ...base, account: accountView, accountIssue, mission: null, draft }
  })
}

/** L'empreinte de la prévisualisation : la création la recalcule et REFUSE
 *  si la vente a changé dans l'outil entre-temps (porte d'écriture figée). */
export function previewFingerprint(items: readonly OdooReprisePreviewItem[]): string {
  const stable = items.map(item => [
    item.saleId,
    item.reference,
    item.accountId,
    item.accountName,
    item.label,
    item.startedOn,
    item.dailyRate,
  ])
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex')
}
