import { describe, expect, it } from 'vitest'
import {
  draftTalentMessageInputSchema,
  prepareTalentMessageInputSchema,
  talentMessageDraftSchema,
  talentPreparedMessageSchema,
} from './talent-prepared-message.js'

describe('prepareTalentMessageInputSchema — #2185.51', () => {
  it('accepte un brouillon minimal, sans objet', () => {
    const parsed = prepareTalentMessageInputSchema.parse({ channel: 'phone', body: 'À rappeler la semaine prochaine.' })
    expect(parsed.subject).toBeUndefined()
    expect(parsed.body).toBe('À rappeler la semaine prochaine.')
  })

  it('refuse un corps vide — jamais un message préparé sans contenu', () => {
    expect(() => prepareTalentMessageInputSchema.parse({ channel: 'email', body: '   ' })).toThrow()
  })

  // #2370 (V10-F) — `sms` est devenu un canal réel ; l'inconnu se teste sur `fax`.
  it('refuse un canal hors du vocabulaire outreach partagé (GA-26)', () => {
    expect(() => prepareTalentMessageInputSchema.parse({ channel: 'fax', body: 'test' })).toThrow()
  })

  it('refuse un champ inconnu (schéma strict)', () => {
    expect(() =>
      prepareTalentMessageInputSchema.parse({ channel: 'email', body: 'test', sentAt: '2026-09-26' }),
    ).toThrow()
  })
})

describe('talentPreparedMessageSchema — #2185.51', () => {
  it('nomme un préparateur disparu de l’espace plutôt que de le taire', () => {
    const parsed = talentPreparedMessageSchema.parse({
      id: '11111111-1111-1111-1111-111111111111',
      talentId: '22222222-2222-2222-2222-222222222222',
      channel: 'email',
      subject: 'Suite de notre échange',
      body: 'Bonjour, ...',
      preparedByName: null,
      createdAt: '2026-09-26T08:00:00.000Z',
    })
    expect(parsed.preparedByName).toBeNull()
  })
})

// #4347 — Laura rédige le message à l'ouverture : la demande et la réponse ont une forme fermée.
describe('draftTalentMessageInputSchema / talentMessageDraftSchema — #4347', () => {
  it('accepte un canal seul, et une variante avec le texte à réécrire', () => {
    expect(draftTalentMessageInputSchema.parse({ channel: 'email' })).toEqual({ channel: 'email' })
    expect(
      draftTalentMessageInputSchema.parse({ channel: 'linkedin', variant: 'shorter', previousBody: 'Bonjour' }),
    ).toMatchObject({ variant: 'shorter' })
  })

  it('refuse une variante inconnue et une clé en trop (aucun envoi, aucun critère protégé)', () => {
    expect(() => draftTalentMessageInputSchema.parse({ channel: 'email', variant: 'sarcastic' })).toThrow()
    expect(() => draftTalentMessageInputSchema.parse({ channel: 'email', age: 42 })).toThrow()
  })

  it('le brouillon rendu dit sur quoi il repose, et peut ne reposer sur aucun besoin', () => {
    const parsed = talentMessageDraftSchema.parse({
      subject: null,
      body: 'Bonjour',
      objective: 'revalidate_availability',
      basis: { consultant: 'Sophie', need: null, client: null },
    })
    expect(parsed.basis.need).toBeNull()
  })

  it('#4347.3 — l’objectif est l’un des deux, jamais autre chose', () => {
    expect(draftTalentMessageInputSchema.parse({ channel: 'email', objective: 'propose_mission' })).toMatchObject({
      objective: 'propose_mission',
    })
    expect(() => draftTalentMessageInputSchema.parse({ channel: 'email', objective: 'relancer' })).toThrow()
  })
})
