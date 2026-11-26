import { describe, expect, it } from 'vitest'
import { deriveContactProfile } from './contact-derived-profile'

describe('#4016 L2 — profil enrichi avec les sources déjà branchées', () => {
  it('la séniorité de l’enrichissement prime sur le titre', () => {
    const p = deriveContactProfile({ seniority: 'c_suite', title: 'Responsable paie' }, null)
    expect(p.seniority).toEqual({ available: true, value: { kind: 'stored', raw: 'c_suite' }, origin: 'enrichment' })
  })

  it('sans séniorité stockée, le titre la déduit', () => {
    const p = deriveContactProfile({ seniority: null, title: 'Directeur des systèmes d’information' }, null)
    expect(p.seniority).toMatchObject({ available: true, origin: 'title', value: { kind: 'level' } })
  })

  it('un titre absent ou illisible ne déduit RIEN — « non disponible », jamais un rang inventé', () => {
    expect(deriveContactProfile({ seniority: null, title: null }, null).seniority).toEqual({ available: false })
    expect(deriveContactProfile({ seniority: '  ', title: '—' }, null).seniority).toEqual({ available: false })
  })

  it('le secteur vient du compte ; absent ou vide = non disponible', () => {
    expect(deriveContactProfile({ seniority: null, title: null }, 'Banque').sector).toEqual({
      available: true,
      value: 'Banque',
      origin: 'account',
    })
    expect(deriveContactProfile({ seniority: null, title: null }, '  ').sector).toEqual({ available: false })
    expect(deriveContactProfile({ seniority: null, title: null }).sector).toEqual({ available: false })
  })
})
