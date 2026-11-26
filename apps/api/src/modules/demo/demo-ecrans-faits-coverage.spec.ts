import { accountFactSchema, knownPersonKey, supplierNamesIn, weighAccountFacts } from '@bellum/contracts'
import { currentSignalFacts, exchangeFacts } from '../account-facts/account-facts.sources'
import { axisClientHistory, clientHistoryFactsFor } from '../consultants/matching/axes'
import { DEMO_ECRANS_FAITS_COVERAGE } from './demo-coverage'
import {
  DEMO_ACTIVITIES,
  DEMO_ORG_CRM_MARKED_CONTACTS,
  DEMO_DELIVERY_CLIENT,
  DEMO_DOSSIERS,
  DEMO_MISSION_CLIENT_MANAGER,
  DEMO_PLAN_TASKS,
  DEMO_TARGET_LIST,
} from './demo-dataset'

/**
 * #4072 — « et en démonstration, les écrans d'action nourris par les faits du compte rendent-ils quelque
 * chose ? » (craft rule n°9). Rejoue sur le VRAI jeu de données les mêmes fonctions que la lecture de
 * production, et sait dire NON : un jeu vidé de ses échanges, de ses tâches ou de ses signaux la ferait tomber.
 */
describe('#4072 — les écrans d’action nourris par les faits du compte, en démonstration', () => {
  const now = new Date('2026-10-12T08:00:00.000Z')
  const dayAgo = (n: number) => new Date(now.getTime() - n * 86_400_000)

  const exchangeRows = DEMO_ACTIVITIES.filter(
    a => (a.direction === 'outbound' || a.direction === 'inbound') && ['email', 'call', 'meeting'].includes(a.kind),
  )
  const exchangesOf = (company: string) =>
    exchangeFacts(
      exchangeRows
        .filter(a => a.company === company)
        .map(a => ({
          kind: a.kind,
          direction: a.direction,
          subject: a.subject ?? null,
          occurred_at: dayAgo(a.daysAgo),
          contact_name: a.contact ?? null,
        })),
    )

  it('est classé seedé, avec sa raison — et nomme ce qui reste vide à dessein', () => {
    expect(DEMO_ECRANS_FAITS_COVERAGE.state).toBe('seede')
    expect(DEMO_ECRANS_FAITS_COVERAGE.reason).toContain('#4072')
    expect(DEMO_ECRANS_FAITS_COVERAGE.reason).toMatch(/récurrence/)
  })

  it('.2 .3 — SNCF porte des échanges ET des tâches de relance : l’historique d’une relance n’est pas vide', () => {
    const facts = exchangesOf('SNCF')
    expect(facts.length).toBeGreaterThan(0)
    expect(DEMO_PLAN_TASKS.some(t => t.company === 'SNCF')).toBe(true)
    // Métadonnées seulement : aucun corps d'échange ne fuit dans un libellé.
    const bodies = exchangeRows.filter(a => a.company === 'SNCF').map(a => a.body)
    for (const fact of facts) for (const body of bodies) if (body) expect(fact.label).not.toContain(body)
    for (const fact of weighAccountFacts(facts, now)) {
      expect(accountFactSchema.safeParse(fact).success).toBe(true)
      expect(supplierNamesIn(fact.label)).toEqual([])
    }
  })

  it('.1 — des contacts connus du CRM et un interlocuteur de mission sont semés', () => {
    expect(DEMO_ORG_CRM_MARKED_CONTACTS.count).toBeGreaterThan(0)
    expect(DEMO_DOSSIERS.some(d => d.account.company_name === DEMO_ORG_CRM_MARKED_CONTACTS.account)).toBe(true)
    expect(Object.keys(DEMO_MISSION_CLIENT_MANAGER).length).toBeGreaterThan(0)
    expect(knownPersonKey(Object.values(DEMO_MISSION_CLIENT_MANAGER)[0] ?? '')).not.toBe('')
  })

  it('.5 — les premiers dossiers de la liste de cibles portent des signaux DATÉS', () => {
    expect(DEMO_TARGET_LIST.selectionReasons.length).toBeGreaterThan(0)
    const first = DEMO_DOSSIERS.slice(0, 3)
    expect(first.length).toBe(3)
    const withFacts = first.filter(d => currentSignalFacts(d.account.recent_signals).length > 0)
    expect(withFacts.length).toBeGreaterThan(0)
  })

  it('.6 — le client de livraison porte des missions passées : l’axe « historique chez ce client » est évaluable', () => {
    const missions = (DEMO_DELIVERY_CLIENT as unknown as { missions?: readonly unknown[] }).missions ?? []
    expect(missions.length).toBeGreaterThan(0)
    const need = {
      role: 'Architecte de plateforme',
      skills: [{ term: 'Kubernetes', label: 'Kubernetes', required: true, level: null }],
      clientHistory: clientHistoryFactsFor([
        { date: '2025-09-01', kind: 'mission', label: 'Fiabilisation plateforme', weight: 1, ageDays: 400 },
      ]),
    }
    expect(axisClientHistory(need as never, now).score).not.toBeNull()
  })
})
