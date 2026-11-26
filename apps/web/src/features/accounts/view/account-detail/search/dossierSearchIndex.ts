import type { AccountMissions, ActionPlanItem, Activity, Contact, ProjectReadRow, Proof } from '@bellum/contracts'
import type { WatchSignal } from '@/features/accounts/model/watch'
import type { GraphEntity } from '../components/entities/entityTypes'
import { isConfirmedNeedRow } from '../tabs/accountNeedRows'
import type { DossierSearchItem } from './dossierSearch'

/** Ce que le dossier a DÉJÀ lu, tel qu'il le lit. `undefined` = lecture pas
 *  encore arrivée (ou en échec) : rien n'est indexé, rien n'est inventé. */
interface DossierSources {
  contacts: readonly Contact[]
  entities: readonly GraphEntity[]
  signals: readonly WatchSignal[]
  /** Le libellé que l'écran des sources affiche (`signalSourceLabel`) — le même,
   *  jamais recopié : `null` = l'écran ne sait pas la nommer, l'index non plus. */
  sourceLabel: (source: string | null | undefined) => string | null
  projects: readonly ProjectReadRow[] | undefined
  missions: AccountMissions | undefined
  planItems: readonly ActionPlanItem[] | undefined
  proofs: readonly Proof[] | undefined
  history: readonly Activity[] | undefined
}

const joined = (...parts: (string | null | undefined)[]): string | null =>
  parts.filter((part): part is string => Boolean(part?.trim())).join(' · ') || null

/**
 * #2128.34-43 — les dix types, depuis les lectures existantes du dossier.
 */
export function buildDossierSearchItems(sources: DossierSources): DossierSearchItem[] {
  const items: DossierSearchItem[] = []
  const push = (item: DossierSearchItem) => {
    if (item.label.trim()) items.push(item)
  }

  for (const contact of sources.contacts) {
    push({
      kind: 'contact',
      id: contact.id,
      label: contact.full_name ?? '',
      context: joined(contact.title, contact.entity),
      date: contact.updated_at ?? contact.created_at ?? null,
    })
  }
  for (const entity of sources.entities) {
    push({ kind: 'entity', id: entity.id, label: entity.name, context: entity.region, date: null })
  }

  const latestBySource = new Map<string, string | null>()
  for (const signal of sources.signals) {
    push({ kind: 'signal', id: signal.id, label: signal.signal, context: null, date: signal.date || null })
    const label = sources.sourceLabel(signal.source)
    if (!label) continue
    const known = latestBySource.get(label)
    const date = signal.date || null
    if (known === undefined || (date && (!known || date > known))) latestBySource.set(label, date)
  }
  for (const [label, date] of latestBySource) {
    push({ kind: 'source', id: label, label, context: null, date })
  }

  for (const row of sources.projects ?? []) {
    push({
      kind: isConfirmedNeedRow(row) ? 'need' : 'project',
      id: row.id,
      label: row.label,
      context: row.company_name ?? null,
      date: row.updated_at ?? null,
    })
  }
  for (const mission of [...(sources.missions?.active ?? []), ...(sources.missions?.past ?? [])]) {
    push({
      kind: 'mission',
      id: mission.missionId,
      label: mission.label,
      context: mission.roleTitle,
      date: mission.startedOn,
    })
  }
  for (const action of sources.planItems ?? []) {
    push({ kind: 'action', id: action.id, label: action.label, context: action.reason, date: action.due_date })
  }
  for (const proof of sources.proofs ?? []) {
    push({ kind: 'proof', id: proof.id, label: proof.claim, context: proof.detail, date: proof.created_at })
  }
  for (const activity of sources.history ?? []) {
    push({ kind: 'history', id: activity.id, label: activity.subject ?? '', context: null, date: activity.occurredAt })
  }
  return items
}
