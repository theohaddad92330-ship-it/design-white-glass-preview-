import { describe, expect, it } from 'vitest'
import { replyBlockLeaves, replyBlockSchema } from './reply-blocks.js'
import {
  OUTSIDE_PERSON_REVEAL_PERMISSIONS,
  outsidePersonRevealRequestSchema,
  outsidePersonRevealResponseSchema,
} from './outside-person-reveal.js'

// #4421.15 / #4421.16 — « Obtenir l'e-mail » sous une personne proposée par Laura hors de l'espace.
describe('#4421.15 — la carte porte de quoi révéler une personne hors espace', () => {
  const card = {
    type: 'account_ranking',
    axes: ['Compétences de la fiche demandées sur la zone'],
    items: [
      {
        name: 'SII',
        why: ['SII publie 10 offres sur le 69.'],
        reveal: {
          siren: '308491101',
          people: [
            { name: 'Inès D.', title: 'Responsable recrutement', person_ref: 'p-ines', mail_to: true },
            { name: 'Paul M.', person_ref: 'p-paul' },
          ],
        },
      },
    ],
  }

  it('la carte se lit, la référence voyage, jamais comme texte à lire', () => {
    const parsed = replyBlockSchema.safeParse(card)
    if (!parsed.success || parsed.data.type !== 'account_ranking') throw new Error('carte attendue')
    expect(parsed.data.items[0]?.reveal?.people.map(p => p.person_ref)).toEqual(['p-ines', 'p-paul'])
    expect(parsed.data.items[0]?.reveal?.people[0]?.mail_to).toBe(true)
    const leaves = replyBlockLeaves(card)
    expect(leaves).toContain('Inès D.')
    expect(leaves).not.toContain('p-ines')
    expect(leaves).not.toContain('308491101')
  })

  it('dit NON : plus de trois personnes, une référence vide, un SIREN qui n’en est pas un', () => {
    const person = { name: 'X Y.', person_ref: 'p' }
    const withReveal = (reveal: unknown) => ({ ...card, items: [{ ...card.items[0], reveal }] })
    expect(replyBlockSchema.safeParse(withReveal({ people: [person, person, person, person] })).success).toBe(false)
    expect(replyBlockSchema.safeParse(withReveal({ people: [{ name: 'X Y.', person_ref: ' ' }] })).success).toBe(false)
    expect(replyBlockSchema.safeParse(withReveal({ siren: 'SII', people: [person] })).success).toBe(false)
  })
})

describe('#4421.16 — le contrat du geste', () => {
  it('exige le compte et la personne ; le SIREN est optionnel', () => {
    const ok = outsidePersonRevealRequestSchema.safeParse({
      company_name: 'SII',
      person_ref: 'p-ines',
      name: 'Inès D.',
      title: 'Responsable recrutement',
    })
    expect(ok.success).toBe(true)
    expect(
      outsidePersonRevealRequestSchema.safeParse({
        company_name: 'SII',
        person_ref: 'p',
        name: 'I D.',
        account_id: 'x',
      }).success,
    ).toBe(false)
    expect(outsidePersonRevealRequestSchema.safeParse({ company_name: 'SII', name: 'Inès D.' }).success).toBe(false)
    expect(outsidePersonRevealRequestSchema.safeParse({ person_ref: 'p', name: 'Inès D.' }).success).toBe(false)
    expect(
      outsidePersonRevealRequestSchema.safeParse({ company_name: 'SII', person_ref: 'p', name: 'I D.', siren: '12' })
        .success,
    ).toBe(false)
  })

  it('rend le contact créé et le job d’enrichissement suivi par l’écran existant', () => {
    const parsed = outsidePersonRevealResponseSchema.parse({
      account_id: '11111111-1111-4111-8111-111111111111',
      contact_id: '22222222-2222-4222-8222-222222222222',
      job_id: 'enrich-22222222',
      state: 'queued',
    })
    expect(parsed.state).toBe('queued')
  })

  it('les deux droits exigés', () => {
    expect(OUTSIDE_PERSON_REVEAL_PERMISSIONS).toEqual(['contacts:enrich', 'records:write'])
  })
})
