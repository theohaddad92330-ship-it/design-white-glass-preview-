import { describe, expect, it } from 'vitest'
import { SIGNAL_DOMAIN_CODES } from './signal-domain.js'
import { OFFER_DOMAINS } from './onboarding.js'
import { itChallengeSchema, painPointSchema, recentSignalSchema } from './analysis/research.js'

describe('#3978 — le domaine d’offre d’un signal', () => {
  it('est un code de PACK, hors fourre-tout', () => {
    expect(SIGNAL_DOMAIN_CODES).not.toContain('generic')
    expect(SIGNAL_DOMAIN_CODES).toContain('esn_it')
    expect(SIGNAL_DOMAIN_CODES.length).toBe(OFFER_DOMAINS.length - 1)
  })

  it('survit à la lecture des trois formes (un schéma qui l’ignore le jetterait en silence)', () => {
    expect(recentSignalSchema.parse({ signal: 'x', domain_code: 'finance' }).domain_code).toBe('finance')
    expect(painPointSchema.parse({ pain: 'x', domain_code: 'cyber' }).domain_code).toBe('cyber')
    expect(itChallengeSchema.parse({ title: 'x', domain_code: 'pmo' }).domain_code).toBe('pmo')
  })

  it('reste optionnel : une analyse écrite avant la capacité reste valide', () => {
    expect(recentSignalSchema.parse({ signal: 'x' }).domain_code).toBeUndefined()
    expect(painPointSchema.parse({ pain: 'x' }).domain_code).toBeUndefined()
    expect(itChallengeSchema.parse({ title: 'x' }).domain_code).toBeUndefined()
  })
})
