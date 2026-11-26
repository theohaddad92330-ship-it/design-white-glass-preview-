import type { OutreachEnrollmentExclusion } from '@bellum/contracts'
import { planRuleRun, type SignalCandidate } from './automation-engine'

/**
 * Lot L-D1 (#4167) — le cœur de la préparation du matin, PUR : quels signaux
 * deviennent une action, lesquels sont écartés, et pourquoi. Aucune base, aucun réseau.
 */

const candidate = (id: string, overrides: Partial<SignalCandidate> = {}): SignalCandidate => ({
  signalRef: `trigger:${id}`,
  accountId: `account-${id}`,
  contactId: `contact-${id}`,
  evidence: `Signal ${id}`,
  occurredAt: new Date(`2026-10-1${id}T08:00:00Z`),
  ...overrides,
})

const free = (...ids: string[]): Map<string, OutreachEnrollmentExclusion[]> =>
  new Map(ids.map(id => [`contact-${id}`, []]))

const base = { knownRefs: new Set<string>(), creditCap: null, creditsSpent: 0, cost: 0, maxPerRun: 20 }

describe('planRuleRun', () => {
  it('lit un corpus réel : un signal libre devient UNE action, avec son « pourquoi maintenant »', () => {
    const plan = planRuleRun({ ...base, candidates: [candidate('1')], exclusionsByContact: free('1') })
    expect(plan).toHaveLength(1)
    expect(plan[0]).toMatchObject({ type: 'act', candidate: { contactId: 'contact-1', evidence: 'Signal 1' } })
  })

  it('un signal déjà traité par cette règle ne déclenche pas deux fois', () => {
    const plan = planRuleRun({
      ...base,
      candidates: [candidate('1')],
      knownRefs: new Set(['trigger:1']),
      exclusionsByContact: free('1'),
    })
    expect(plan).toEqual([])
  })

  it('SAIT DIRE NON — déjà en séquence active : exclu, nommé, jamais forcé', () => {
    const plan = planRuleRun({
      ...base,
      candidates: [candidate('1')],
      exclusionsByContact: new Map([['contact-1', [{ code: 'active_sequence', forceable: true }]]]),
    })
    expect(plan[0]).toMatchObject({ type: 'record', outcome: 'excluded', reason: 'active_sequence' })
  })

  it('contacté il y a moins de 30 jours, compte client, opposition RGPD : exclus', () => {
    const exclusions: OutreachEnrollmentExclusion[] = [
      { code: 'recently_contacted', forceable: true },
      { code: 'already_client', forceable: true },
      { code: 'rgpd_opposition', forceable: false },
    ]
    const plan = planRuleRun({
      ...base,
      candidates: [candidate('1')],
      exclusionsByContact: new Map([['contact-1', exclusions]]),
    })
    expect(plan[0]).toMatchObject({
      type: 'record',
      outcome: 'excluded',
      reason: 'recently_contacted, already_client, rgpd_opposition',
    })
  })

  it('un contact qui n’est pas à la personne (absent de l’éligibilité) : « contact introuvable », rien n’est deviné', () => {
    const plan = planRuleRun({ ...base, candidates: [candidate('1')], exclusionsByContact: new Map() })
    expect(plan[0]).toMatchObject({ type: 'record', outcome: 'no_contact' })
  })

  it('un signal sans contact résolu : « contact introuvable »', () => {
    const plan = planRuleRun({
      ...base,
      candidates: [candidate('1', { contactId: null })],
      exclusionsByContact: new Map(),
    })
    expect(plan[0]).toMatchObject({ type: 'record', outcome: 'no_contact' })
  })

  it('mono-contact (c74) : deux signaux sur le même contact dans le même passage → une seule action', () => {
    const plan = planRuleRun({
      ...base,
      candidates: [candidate('1'), candidate('2', { contactId: 'contact-1' })],
      exclusionsByContact: free('1', '2'),
    })
    expect(plan.map(step => step.type)).toEqual(['act', 'record'])
    expect(plan[1]).toMatchObject({ outcome: 'excluded', reason: 'active_sequence' })
  })

  it('le plafond de crédits arrête les actions payantes, signal par signal', () => {
    const plan = planRuleRun({
      ...base,
      cost: 2,
      creditCap: 5,
      creditsSpent: 1,
      candidates: [candidate('1'), candidate('2'), candidate('3')],
      exclusionsByContact: free('1', '2', '3'),
    })
    expect(plan.map(step => (step.type === 'act' ? 'act' : step.outcome))).toEqual(['act', 'act', 'cap_reached'])
  })

  it('un plafond ne bloque jamais une préparation gratuite', () => {
    const plan = planRuleRun({
      ...base,
      cost: 0,
      creditCap: 0,
      candidates: [candidate('1')],
      exclusionsByContact: free('1'),
    })
    expect(plan[0].type).toBe('act')
  })

  it('au plus `maxPerRun` actions par passage ; le reste attend le lendemain (non consigné)', () => {
    const ids = ['1', '2', '3', '4']
    const plan = planRuleRun({
      ...base,
      maxPerRun: 2,
      candidates: ids.map(id => candidate(id)),
      exclusionsByContact: free(...ids),
    })
    expect(plan.filter(step => step.type === 'act')).toHaveLength(2)
    expect(plan).toHaveLength(2)
  })

  it('traite le plus ancien signal d’abord : rien ne meurt de faim', () => {
    const plan = planRuleRun({
      ...base,
      maxPerRun: 1,
      candidates: [candidate('3'), candidate('1')],
      exclusionsByContact: free('1', '3'),
    })
    expect(plan[0]).toMatchObject({ candidate: { signalRef: 'trigger:1' } })
  })
})
