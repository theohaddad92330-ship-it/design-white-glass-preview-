import { describe, expect, it } from 'vitest'
import { MANUAL_ACTION_WEEK_INDEX, type ActionPlanItem, type Contact } from '@bellum/contracts'
import type { PlanWeek } from '../../helpers/plan'
import { selectContactPlanSteps, selectPlanSteps } from './planSteps'

const contact = (id: string, full_name: string, extra: Partial<Contact> = {}): Contact =>
  ({
    id,
    full_name,
    email: `${id}@acme.test`,
    linkedin_message: null,
    email_message: null,
    phone_script: null,
    ...extra,
  }) as Contact

const step = (text: string, responsable: string, outil: string) => ({ text, responsable, outil })

const week = (items: PlanWeek['items']): PlanWeek => ({ week: 1, title: 'Immédiat', items })

const raw = {
  plan: {
    contactMessages: [
      {
        contactName: 'Claire Martin',
        emailSubject: 'Objet',
        emailBody: 'Bonjour Claire',
        linkedinMessage: 'Salut Claire',
      },
    ],
  },
}

const claire = contact('c1', 'Claire Martin')
const paul = contact('c2', 'Paul Durand')

describe('#4399.6 — deux étapes ne répètent jamais le même texte', () => {
  it('deux étapes du même contact sur le même canal : le message ne s’affiche qu’une fois, la seconde le renvoie à la première', () => {
    const weeks = [week([step('A', 'Claire Martin', 'email'), step('B', 'Claire Martin', 'email')])]
    const steps = selectPlanSteps({ weeks, contacts: [claire], rawAnalysis: raw, isDone: () => false })
    expect(steps).toHaveLength(2)
    expect(steps[0]?.sameMessageAs).toBeUndefined()
    expect(steps[1]?.sameMessageAs).toBe(1)
    // le message prêt reste porté (le geste « Préparer » / « Copier » s'en sert), seul l'affichage se dédoublonne
    expect(steps[1]?.message).toBe(steps[0]?.message)
  })
  it('canal différent ou contact différent : aucun renvoi', () => {
    const weeks = [week([step('A', 'Claire Martin', 'email'), step('B', 'Claire Martin', 'linkedin')])]
    const steps = selectPlanSteps({ weeks, contacts: [claire], rawAnalysis: raw, isDone: () => false })
    expect(steps.map(s => s.sameMessageAs)).toEqual([undefined, undefined])
  })
  it('un message vide n’est jamais « le même » qu’un autre message vide', () => {
    const weeks = [week([step('A', 'Inconnu Un', 'email'), step('B', 'Inconnu Un', 'email')])]
    const steps = selectPlanSteps({ weeks, contacts: [], rawAnalysis: raw, isDone: () => false })
    expect(steps.map(s => s.sameMessageAs)).toEqual([undefined, undefined])
  })
})

describe('selectPlanSteps (#4415.1)', () => {
  it('plan à 5 actions → 3 étapes en tête, numérotées 1, 2, 3, dans l’ordre du plan', () => {
    const weeks = [
      week([
        step('A', 'Claire Martin', 'email'),
        step('B', 'Paul Durand', 'linkedin'),
        step('C', 'Claire Martin', 'phone'),
        step('D', 'Paul Durand', 'email'),
        step('E', 'Claire Martin', 'linkedin'),
      ]),
    ]
    const steps = selectPlanSteps({ weeks, contacts: [claire, paul], rawAnalysis: raw, isDone: () => false })
    expect(steps.map(s => s.number)).toEqual([1, 2, 3])
    expect(steps.map(s => s.label)).toEqual(['A', 'B', 'C'])
  })

  it('#4415.2 — le destinataire se résout malgré casse, accents, rôle entre parenthèses', () => {
    const weeks = [week([step('A', 'claire MARTIN (DSI)', 'email')])]
    const [first] = selectPlanSteps({ weeks, contacts: [claire], rawAnalysis: raw, isDone: () => false })
    expect(first?.contact?.id).toBe('c1')
  })

  it('plan vide → aucune étape', () => {
    expect(selectPlanSteps({ weeks: [], contacts: [], rawAnalysis: {}, isDone: () => false })).toEqual([])
  })

  it('saute les actions faites : « ouvertes » seulement', () => {
    const weeks = [week([step('A', 'Claire Martin', 'email'), step('B', 'Paul Durand', 'linkedin')])]
    const steps = selectPlanSteps({
      weeks,
      contacts: [claire, paul],
      rawAnalysis: raw,
      isDone: (w, s) => w === 0 && s === 0,
    })
    expect(steps.map(s => s.label)).toEqual(['B'])
    expect(steps[0]?.number).toBe(1)
  })

  it('canal, destinataire en clair et message prêt tirés de l’analyse', () => {
    const weeks = [week([step('A', 'Claire Martin', 'Email'), step('B', 'Claire Martin', 'LinkedIn')])]
    const [mail, li] = selectPlanSteps({ weeks, contacts: [claire], rawAnalysis: raw, isDone: () => false })
    expect(mail).toMatchObject({ channel: 'email', recipient: 'Claire Martin', message: 'Bonjour Claire' })
    expect(mail?.contact?.id).toBe('c1')
    expect(li).toMatchObject({ channel: 'linkedin', message: 'Salut Claire' })
  })

  it('pas de message → chaîne vide (rien d’inventé) ; canal inconnu ou sans destinataire → écartée', () => {
    const weeks = [week([step('A', 'Paul Durand', 'email'), step('B', 'Paul Durand', 'event'), step('C', '', 'email')])]
    const steps = selectPlanSteps({ weeks, contacts: [paul], rawAnalysis: raw, isDone: () => false })
    expect(steps).toHaveLength(1)
    expect(steps[0]?.message).toBe('')
  })

  it('filtre par contact : un contact visé par 2 étapes en a 2', () => {
    const weeks = [
      week([
        step('A', 'Claire Martin', 'email'),
        step('B', 'Paul Durand', 'linkedin'),
        step('C', 'Claire Martin', 'phone'),
      ]),
    ]
    const steps = selectPlanSteps({
      weeks,
      contacts: [claire, paul],
      rawAnalysis: raw,
      isDone: () => false,
      onlyContactId: 'c1',
    })
    expect(steps.map(s => s.label)).toEqual(['A', 'C'])
    expect(steps.map(s => s.number)).toEqual([1, 2])
  })

  it('contact sans étape → liste vide', () => {
    const weeks = [week([step('A', 'Claire Martin', 'email')])]
    expect(
      selectPlanSteps({ weeks, contacts: [claire, paul], rawAnalysis: raw, isDone: () => false, onlyContactId: 'c2' }),
    ).toEqual([])
  })
})

describe('selectContactPlanSteps (#4416)', () => {
  const item = (over: Partial<ActionPlanItem>): ActionPlanItem =>
    ({
      id: 'i1',
      label: 'Appeler Claire Martin',
      week_index: MANUAL_ACTION_WEEK_INDEX,
      step_index: 0,
      done: false,
      channel: 'phone',
      contact_id: 'c1',
      ...over,
    }) as ActionPlanItem

  it('réunit les étapes du plan généré ET les lignes rangées pour ce contact, renumérotées', () => {
    const weeks = [week([step('A', 'Claire Martin', 'email'), step('B', 'Paul Durand', 'linkedin')])]
    const steps = selectContactPlanSteps({
      weeks,
      contact: claire,
      rawAnalysis: raw,
      isDone: () => false,
      items: [item({}), item({ id: 'i2', step_index: 1, channel: 'linkedin', label: 'Écrire à Claire' })],
    })
    expect(steps.map(s => [s.number, s.label, s.channel])).toEqual([
      [1, 'A', 'email'],
      [2, 'Appeler Claire Martin', 'phone'],
      [3, 'Écrire à Claire', 'linkedin'],
    ])
  })

  it('ignore les lignes faites, d’un autre contact, ou d’un canal non préparable', () => {
    const steps = selectContactPlanSteps({
      weeks: [],
      contact: claire,
      rawAnalysis: raw,
      isDone: () => false,
      items: [
        item({ done: true }),
        item({ id: 'i2', contact_id: 'c2' }),
        item({ id: 'i3', channel: 'meeting' }),
        item({ id: 'i4', channel: null }),
      ],
    })
    expect(steps).toEqual([])
  })

  it('au plus trois, même si le plan et les lignes en portent davantage', () => {
    const weeks = [week(['A', 'B'].map(l => step(l, 'Claire Martin', 'email')))]
    const steps = selectContactPlanSteps({
      weeks,
      contact: claire,
      rawAnalysis: raw,
      isDone: () => false,
      items: [item({}), item({ id: 'i2', step_index: 1 })],
    })
    expect(steps).toHaveLength(3)
  })
})
