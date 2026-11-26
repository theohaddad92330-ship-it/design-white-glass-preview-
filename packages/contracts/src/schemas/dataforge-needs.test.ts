import { describe, expect, it } from 'vitest'
import {
  DATAFORGE_NEED_SOURCE_FILES,
  DATAFORGE_NEED_STATUSES,
  normalizeDataforgeNeedStatus,
  PRESCRIBER_REVALIDATE_AFTER_DAYS,
  prescriberFreshness,
} from './dataforge-needs.js'

describe('#4281.1 — statut d’un besoin historique DataForge', () => {
  it('liste fermée : gagné, perdu, abandonné, terminé, en cours, inconnu', () => {
    expect(DATAFORGE_NEED_STATUSES).toEqual(['GAGNE', 'PERDU', 'ABANDONNE', 'TERMINE', 'EN_COURS', 'INCONNU'])
    expect(DATAFORGE_NEED_SOURCE_FILES).toEqual(['24_MISSIONS_BESOINS', '25_PIPELINE_CRM'])
  })

  it.each([
    ['Gagné', 'GAGNE'],
    ['clos gagné', 'GAGNE'],
    ['WON', 'GAGNE'],
    ['Signé', 'GAGNE'],
    ['Perdu', 'PERDU'],
    ['closed lost', 'PERDU'],
    ['Abandonné', 'ABANDONNE'],
    ['annulé par le client', 'ABANDONNE'],
    ['Terminée', 'TERMINE'],
    ['mission achevée', 'TERMINE'],
    ['En cours', 'EN_COURS'],
    ['ouvert', 'EN_COURS'],
  ])('« %s » → %s', (raw, expected) => {
    expect(normalizeDataforgeNeedStatus(raw)).toBe(expected)
  })

  it('NON : un libellé inconnu ou vide ne se devine pas — INCONNU, jamais un statut au hasard', () => {
    expect(normalizeDataforgeNeedStatus('qualif')).toBe('INCONNU')
    expect(normalizeDataforgeNeedStatus('')).toBe('INCONNU')
    expect(normalizeDataforgeNeedStatus(null)).toBe('INCONNU')
    expect(normalizeDataforgeNeedStatus('[à compléter]')).toBe('INCONNU')
  })
})

describe('#4282.6 / #4281.3 — fraîcheur d’un prescripteur', () => {
  const today = new Date('2026-10-19T00:00:00Z')

  it('date récente → à jour, avec sa date', () => {
    expect(prescriberFreshness('2026-03-01', today)).toEqual({ kind: 'dated', date: '2026-03-01' })
  })

  it(`au-delà de ${PRESCRIBER_REVALIDATE_AFTER_DAYS} jours → « à revalider », la date reste nommée`, () => {
    expect(prescriberFreshness('2024-01-15', today)).toEqual({ kind: 'to_revalidate', date: '2024-01-15' })
  })

  it('NON : sans date lisible → « à revalider » sans date, jamais « à jour »', () => {
    expect(prescriberFreshness(null, today)).toEqual({ kind: 'to_revalidate', date: null })
    expect(prescriberFreshness('bientôt', today)).toEqual({ kind: 'to_revalidate', date: null })
  })
})
