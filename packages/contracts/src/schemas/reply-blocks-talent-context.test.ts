import { describe, expect, it } from 'vitest'
import { replyBlockLeaves, replyBlockSchema } from './reply-blocks.js'

const TALENT = '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d'

// #4642 — la carte « Comptes où placer X » porte la demande dont elle est la réponse.
describe('#4642 — account_ranking porte le contexte de la demande', () => {
  const block = {
    type: 'account_ranking',
    axes: ['Compétences de la fiche demandées sur la zone'],
    talent_context: { talent_id: TALENT, skills: ['Java', 'Kafka'], zone: 'Rhône' },
    items: [
      {
        name: 'JEMS',
        why: ['6 offres Java/Kafka'],
        offers: [{ title: 'Dev Java Kafka', date: '2026-10-20' }, { title: 'Architecte' }],
      },
    ],
  }

  it('garde le contexte et les offres (jamais retirés par la validation)', () => {
    expect(replyBlockSchema.parse(block)).toMatchObject({
      talent_context: { talent_id: TALENT, skills: ['Java', 'Kafka'], zone: 'Rhône' },
      items: [{ offers: [{ title: 'Dev Java Kafka', date: '2026-10-20' }, { title: 'Architecte' }] }],
    })
  })

  it('dit NON : un talent_id qui n’est pas un uuid refuse la carte', () => {
    expect(replyBlockSchema.safeParse({ ...block, talent_context: { talent_id: 'camille' } }).success).toBe(false)
  })

  it('le contexte et les offres ne sont pas des textes à relire (déjà écrits dans `why`)', () => {
    const leaves = replyBlockLeaves(block)
    expect(leaves).toContain('6 offres Java/Kafka')
    expect(leaves).not.toContain('Kafka')
    expect(leaves).not.toContain('Dev Java Kafka')
  })

  it('une carte sans contexte reste valide, sans clé ajoutée', () => {
    const parsed = replyBlockSchema.parse({ type: 'account_ranking', axes: ['x'], items: [{ name: 'A', why: ['b'] }] })
    expect(parsed).not.toHaveProperty('talent_context')
  })
})
