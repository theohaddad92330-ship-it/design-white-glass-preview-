import type { TimesheetLine } from './api'

/**
 * #2415.8 — « Agréger plusieurs CRA consultants sur une même facture ».
 *
 * Bellum ne crée ni n'émet de facture (doctrine, `agent_docs/doctrine.md` —
 * « BellumAI SUIT le financier, il ne COMPTABILISE pas ») : il n'existe donc
 * aucun objet « facture » interne à agréger. Ce que ce module rend est la
 * maille qui existe déjà — `TimesheetsService.month`, une ligne par (mission,
 * consultant) — REGROUPÉE par mission : la préparation de facturation
 * mission (readiness), jamais un objet émis.
 *
 * `readyToInvoice` ne se moyenne JAMAIS : une seule ligne qui bloque suffit à
 * rendre tout le groupe non prêt — même garantie que `blocksInvoicing` au
 * niveau d'une ligne (GA-18/GA-19 : pas de synthèse qui efface une exception).
 */
type MissionTimesheetGroup = {
  missionId: string
  missionLabel: string | null
  accountName: string | null
  lines: TimesheetLine[]
  readyToInvoice: boolean
}

export function groupTimesheetLinesByMission(lines: readonly TimesheetLine[]): MissionTimesheetGroup[] {
  const order: string[] = []
  const groups = new Map<string, MissionTimesheetGroup>()
  for (const line of lines) {
    let group = groups.get(line.missionId)
    if (!group) {
      group = {
        missionId: line.missionId,
        missionLabel: line.missionLabel,
        accountName: line.accountName,
        lines: [],
        readyToInvoice: true,
      }
      groups.set(line.missionId, group)
      order.push(line.missionId)
    }
    group.lines.push(line)
    if (line.blocksInvoicing) group.readyToInvoice = false
  }
  return order.map(missionId => groups.get(missionId)!)
}
