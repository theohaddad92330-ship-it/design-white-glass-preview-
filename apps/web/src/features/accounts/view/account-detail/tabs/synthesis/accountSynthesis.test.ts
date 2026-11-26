import type { RecentSignal } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import {
  accountSizeFact,
  buildTechPills,
  headquartersCity,
  rankSignals,
  visibleSynthesisSections,
  type SynthesisPresenceInput,
} from './accountSynthesis'

describe('#3499 — headquartersCity', () => {
  it('lit la ville d’une adresse complète ou d’une ville seule', () => {
    expect(headquartersCity('29 boulevard Haussmann, 75009 Paris')).toBe('Paris')
    expect(headquartersCity('Lyon')).toBe('Lyon')
    expect(headquartersCity('4 boulevard de Mons, 59650 Villeneuve-d’Ascq')).toBe('Villeneuve-d’Ascq')
    expect(headquartersCity('7 promenade Germaine Sablon, 75013 Paris, France')).toBe('Paris')
  })

  it('SAIT DIRE NON — siège absent ou vide : rien, jamais deviné', () => {
    expect(headquartersCity(null)).toBeNull()
    expect(headquartersCity('')).toBeNull()
    expect(headquartersCity('   ')).toBeNull()
  })
})

describe('#3499 — accountSizeFact', () => {
  it('effectif d’abord, puis chiffre d’affaires, sinon rien', () => {
    expect(accountSizeFact({ employees: '5 000', revenue: '1 Md€' })).toEqual({ kind: 'employees', value: '5 000' })
    expect(accountSizeFact({ employees: '', revenue: '1 Md€' })).toEqual({ kind: 'revenue', value: '1 Md€' })
    expect(accountSizeFact({ employees: null, revenue: ' ' })).toBeNull()
  })
})

describe('#3499 — rankSignals', () => {
  const signal = (over: Partial<RecentSignal>): RecentSignal => ({ signal: 'x', ...over }) as RecentSignal

  it('écarte les signaux sans texte et met en tête celui qui dit quoi faire, d’où et quand', () => {
    const ranked = rankSignals([
      signal({ signal: '' }),
      signal({ signal: 'nu' }),
      signal({ signal: 'complet', source: 'Presse', date: '2026-09-01', sales_implication: 'Appeler la DSI' }),
    ])
    expect(ranked.map(s => s.signal)).toEqual(['complet', 'nu'])
  })
})

describe('#3499 — buildTechPills', () => {
  it('huit au plus, triées par présence, avec un libellé humain relatif', () => {
    const pills = buildTechPills([
      { name: 'Java', usage: 'Pondération 90 sur les profils en poste' },
      { name: 'Angular', usage: 'Pondération 45 sur les profils en poste' },
      { name: 'COBOL', usage: 'Pondération 10 sur les profils en poste' },
      ...Array.from({ length: 10 }, (_, i) => ({ name: `T${i}`, usage: null })),
    ])
    expect(pills).toHaveLength(8)
    expect(pills.slice(0, 3).map(p => [p.name, p.presence])).toEqual([
      ['Java', 'high'],
      ['Angular', 'medium'],
      ['COBOL', 'low'],
    ])
    // Sans chiffre lisible, aucun niveau inventé.
    expect(pills[3]?.presence).toBeNull()
  })
})

describe('#3499 — visibleSynthesisSections', () => {
  const none: SynthesisPresenceInput = {
    planActions: 0,
    offers: 0,
    risk: false,
    contacts: 0,
    angles: 0,
    meetingMaterial: 0,
    strategyMaterial: 0,
    technologyMaterial: 0,
    sourcesMaterial: 0,
    analysed: false,
  }

  it('SAIT DIRE NON — un compte sans contenu ne rend AUCUNE section', () => {
    expect(visibleSynthesisSections(none)).toEqual([])
  })

  it('rend les sections présentes dans l’ordre d’utilité commerciale', () => {
    expect(
      visibleSynthesisSections({
        ...none,
        analysed: true,
        angles: 4,
        contacts: 12,
        planActions: 3,
        sourcesMaterial: 1,
        strategyMaterial: 1,
      }),
    ).toEqual(['strategy', 'plan', 'contacts', 'angles', 'meeting', 'sources', 'history'])
  })

  // #3673 (réfuté en prod le 07/10, Société Générale) — `WhyNowSection` (R8) nomme
  // désormais l'absence (« Non évalués ») au lieu de la taire, mais ce correctif
  // vivait DANS le composant : le repli « meeting » qui le PORTE restait masqué
  // tant que `pains + itChallenges + signals === 0`, quel que soit le compte — la
  // carte honnête de R8 n'avait donc jamais l'occasion de s'afficher. Un compte
  // analysé mais sans aucun de ces trois faits doit encore ouvrir le repli, pour
  // que l'absence puisse se nommer.
  it('#3673 — un compte ANALYSÉ sans pain/enjeu/signal garde le repli « meeting », pour que l’absence s’y nomme', () => {
    expect(visibleSynthesisSections({ ...none, analysed: true })).toContain('meeting')
  })

  it('#3673 — un compte JAMAIS analysé n’ouvre pas le repli « meeting » (rien à y préparer)', () => {
    expect(visibleSynthesisSections({ ...none, analysed: false })).not.toContain('meeting')
  })
})
