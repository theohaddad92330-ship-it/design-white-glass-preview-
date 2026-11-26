import { createPlanActionSchema, createProjectSchema, userAttackAngleSchema } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import type { WatchSignal } from '@/features/accounts/model/watch'
import { watchSignalToAttackAngle, watchSignalToOpportunityDraft, watchSignalToPlanAction } from './watchActions'

const signal = (over: Partial<WatchSignal> = {}): WatchSignal => ({
  id: 's-1',
  category: 'historique',
  date: '2026-09-10',
  freshness: 'current',
  temporalStatus: 'RECENT',
  type: 'levée de fonds',
  signal: 'Levée de 40 M€',
  source: 'Les Échos',
  sales_implication: 'Budget IT en hausse : proposer un cadrage',
  score: 80,
  angles: [],
  actionGate: { allowed: true },
  tags: [],
  perimeter: 'ACME',
  ...over,
})

const ACCOUNT_ID = '22222222-0000-4000-8000-000000000001'

/**
 * #2123.46 — « Ajouter au plan » depuis la veille écrit la ligne CANONIQUE.
 *
 * Elle écrivait `raw_analysis.user_plan_actions` avec un résultat attendu, un
 * outil (la source du signal) et une échéance en prose (« Cette semaine ») :
 * rien de tout ça ne doit se perdre à la bascule.
 */
describe('#2123.46 — watchSignalToPlanAction', () => {
  it('produit un corps que la porte `POST /plan-items` accepte', () => {
    const body = { account_id: ACCOUNT_ID, ...watchSignalToPlanAction(signal(), new Date('2026-09-17T09:00:00Z')) }
    expect(createPlanActionSchema.safeParse(body).success).toBe(true)
  })

  it('garde le résultat attendu du signal, dans SON champ', () => {
    const action = watchSignalToPlanAction(signal(), new Date('2026-09-17T09:00:00Z'))
    expect(action.label).toBe('Qualifier le signal : Levée de 40 M€')
    expect(action.expected_outcome).toBe('Budget IT en hausse : proposer un cadrage')
  })

  it('« cette semaine » devient une VRAIE échéance, à une semaine du geste', () => {
    expect(watchSignalToPlanAction(signal(), new Date('2026-09-17T09:00:00Z')).due_date).toBe('2026-09-24')
  })

  it('la source du signal devient la raison de l’action — elle ne disparaît pas', () => {
    expect(watchSignalToPlanAction(signal(), new Date('2026-09-17T09:00:00Z')).reason).toContain('Les Échos')
  })

  it('n’invente aucun objet : un signal n’est pas l’un des huit référentiels', () => {
    expect(watchSignalToPlanAction(signal(), new Date('2026-09-17T09:00:00Z')).target).toBeNull()
  })

  // #2395.8 — revient sur le témoin « reste null » : la création EXIGE désormais un résultat attendu ; sans
  // implication commerciale lue, le gabarit nomme ce qu'on cherche (jamais vide, jamais l'implication inventée).
  it('#2395.8 — sans implication commerciale, le résultat attendu est le gabarit, jamais vide', () => {
    const action = watchSignalToPlanAction(signal({ sales_implication: undefined }), new Date('2026-09-17T09:00:00Z'))
    expect(action.expected_outcome).toBe('Savoir si ce signal ouvre une opportunité à traiter.')
    const blank = watchSignalToPlanAction(signal({ sales_implication: '   ' }), new Date('2026-09-17T09:00:00Z'))
    expect(blank.expected_outcome).toBe('Savoir si ce signal ouvre une opportunité à traiter.')
  })

  // #2617.2 — « ne pas ressaisir type/source/date/impact » : la raison portait
  // déjà la SOURCE, mais ni le TYPE ni la DATE du signal — perdus à la bascule,
  // à retrouver à la main si besoin. Les quatre tiennent maintenant dans la
  // ligne canonique sans qu'aucun formulaire ne les redemande.
  it('garde le TYPE et la DATE du signal dans la raison, pas seulement la source', () => {
    const action = watchSignalToPlanAction(signal(), new Date('2026-09-17T09:00:00Z'))
    expect(action.reason).toContain('levée de fonds')
    expect(action.reason).toContain('10 sept. 2026')
    expect(action.reason).toContain('Les Échos')
  })
})

/**
 * #2617.2 — « Créer un angle » depuis la veille ne doit pas non plus perdre le
 * SOURCE et la DATE du signal : `entry_point` gardait déjà le type et
 * `description` l'impact, mais rien ne portait la provenance — le seul moyen
 * de la retrouver était de rouvrir l'onglet Signaux.
 */
describe('#2617.2 — watchSignalToAttackAngle garde la provenance du signal', () => {
  it('produit un corps que le contrat des angles accepte', () => {
    expect(userAttackAngleSchema.safeParse(watchSignalToAttackAngle(signal())).success).toBe(true)
  })

  it('garde le TYPE du signal dans son propre champ (entry_point)', () => {
    expect(watchSignalToAttackAngle(signal()).entry_point).toBe('levée de fonds')
  })

  it('garde la SOURCE et la DATE du signal dans la description, à côté de l’impact', () => {
    const angle = watchSignalToAttackAngle(signal())
    expect(angle.description).toContain('Budget IT en hausse : proposer un cadrage')
    expect(angle.description).toContain('Les Échos')
    expect(angle.description).toContain('10 sept. 2026')
  })

  it('témoin — sans impact commercial, la provenance (source + date) reste écrite', () => {
    const angle = watchSignalToAttackAngle(signal({ sales_implication: undefined }))
    expect(angle.description).toContain('Les Échos')
    expect(angle.description).toContain('10 sept. 2026')
  })
})

/**
 * #3683.2 — « Préparer une opportunité » : un BROUILLON renseigné du fait, jamais une création.
 */
describe('#3683.2 — watchSignalToOpportunityDraft', () => {
  it('reprend le fait, sa source, sa date et son type — tels qu’observés', () => {
    const draft = watchSignalToOpportunityDraft(signal())
    expect(draft.label).toBe('Levée de 40 M€')
    expect(draft.facts.map(fact => fact.key)).toEqual(['source', 'date', 'type'])
    expect(draft.detail).toContain('Source : Les Échos')
    expect(draft.objective).toBe('Budget IT en hausse : proposer un cadrage')
  })

  it('dit ce qui manque : montant, clôture, porteur, interlocuteur — jamais devinés', () => {
    expect(watchSignalToOpportunityDraft(signal()).missing).toEqual(['amount', 'closeOn', 'owner', 'contact'])
  })

  it('sans lecture commerciale, l’objectif reste null (aucune phrase de remplissage)', () => {
    expect(watchSignalToOpportunityDraft(signal({ sales_implication: undefined })).objective).toBeNull()
  })

  it('le corps envoyé à la création est accepté par `POST /projects`, et le libellé est borné à 200', () => {
    const draft = watchSignalToOpportunityDraft(signal({ signal: 'x'.repeat(500) }))
    expect(draft.label).toHaveLength(200)
    const body = { account_id: ACCOUNT_ID, label: draft.label, detail: draft.detail, objective: draft.objective }
    expect(createProjectSchema.safeParse(body).success).toBe(true)
  })
})
