import { describe, expect, it } from 'vitest'
import {
  hiringDisplayLabel,
  hiringNoticeForSignals,
  isHiringKind,
  rankOffDomainHiringLast,
} from './discover-hiring-domain'

// #3901.w — décision Louis 09/10/2026 : les JUMEAUX de Découvrir (veille du compte, /mes-cibles)
// suivent le même profil déclaré (`placed_roles`), par les MÊMES fonctions (GA-26).
const cyber = { placedRoles: ['cybersécurité'], noGoSectors: [] }
const industrie = { placedRoles: ['HSE'], noGoSectors: [] }
const vide = { placedRoles: [], noGoSectors: [] }

const s = (type: string, label: string) => ({ type, label })

describe('#3901.w — jumeaux : genre de recrutement', () => {
  it('reconnaît un recrutement, jamais autre chose', () => {
    expect(isHiringKind('hiring')).toBe(true)
    expect(isHiringKind('Recrutement IT')).toBe(true)
    expect(isHiringKind('tender')).toBe(false)
    expect(isHiringKind('Levée de fonds')).toBe(false)
  })
})

describe('#3901.w — jumeaux : étiquette', () => {
  it('ESN cyber : « Recrutement IT » devient « Recrutement cybersécurité »', () => {
    expect(hiringDisplayLabel(s('hiring', 'Recrutement IT — Analyste cybersécurité'), cyber)).toBe(
      'Recrutement cybersécurité — Analyste cybersécurité',
    )
  })

  it('NON : une offre HSE chez une ESN cyber garde son libellé, ni « IT » ni « cybersécurité » inventés', () => {
    expect(hiringDisplayLabel(s('hiring', 'Recrutement — Ingénieur HSE'), cyber)).toBe('Recrutement — Ingénieur HSE')
  })

  it('NON : un signal qui n’est pas un recrutement n’est jamais réétiqueté', () => {
    expect(hiringDisplayLabel(s('tender', 'Recrutement IT — cybersécurité'), cyber)).toBe(
      'Recrutement IT — cybersécurité',
    )
  })

  it('profil vide ou absent : libellé inchangé', () => {
    expect(hiringDisplayLabel(s('hiring', 'Recrutement IT — Dev'), vide)).toBe('Recrutement IT — Dev')
    expect(hiringDisplayLabel(s('hiring', 'Recrutement IT — Dev'), undefined)).toBe('Recrutement IT — Dev')
  })
})

describe('#3901.w — jumeaux : rang', () => {
  const rows = [
    { id: 'hse', signal: s('hiring', 'Recrutement — Ingénieur HSE') },
    { id: 'tender', signal: s('tender', 'Appel d’offres') },
    { id: 'sec', signal: s('hiring', 'Recrutement IT — Analyste cybersécurité') },
  ]
  const read = (row: (typeof rows)[number]) => row.signal

  it('ESN cyber : l’offre HSE passe en fin, rien n’est retiré', () => {
    const ranked = rankOffDomainHiringLast(rows, cyber, read).map(r => r.id)
    expect(ranked).toEqual(['tender', 'sec', 'hse'])
  })

  it('ESN industrie : l’offre HSE reste devant, c’est l’offre cyber qui passe en fin', () => {
    const ranked = rankOffDomainHiringLast(rows, industrie, read).map(r => r.id)
    expect(ranked).toEqual(['hse', 'tender', 'sec'])
  })

  it('profil pas encore chargé : ordre inchangé', () => {
    expect(rankOffDomainHiringLast(rows, undefined, read).map(r => r.id)).toEqual(['hse', 'tender', 'sec'])
  })

  it('#3901.p — profil muet (rien déclaré ni déduit) : aucune offre n’est un signal fort, elles passent en fin', () => {
    expect(rankOffDomainHiringLast(rows, vide, read).map(r => r.id)).toEqual(['tender', 'hse', 'sec'])
  })
})

describe('#3901.w — jumeaux : la ligne', () => {
  it('profil vide + au moins un recrutement : dit qu’aucun métier n’est déclaré ni déduit (lien Mon profil)', () => {
    expect(hiringNoticeForSignals([s('hiring', 'Recrutement — Dev')], vide)).toEqual({ kind: 'noRoles' })
  })

  it('NON : pas de recrutement = pas de ligne', () => {
    expect(hiringNoticeForSignals([s('tender', 'AO')], vide)).toBeNull()
  })

  it('NON : profil pas encore chargé = pas de ligne', () => {
    expect(hiringNoticeForSignals([s('hiring', 'Recrutement — Dev')], undefined)).toBeNull()
  })

  it('profil rempli : compte les offres hors domaine, rien si toutes dans le domaine', () => {
    const list = [s('hiring', 'Recrutement — Ingénieur HSE'), s('hiring', 'Recrutement — cybersécurité')]
    expect(hiringNoticeForSignals(list, cyber)).toEqual({ kind: 'offDomain', count: 1 })
    expect(hiringNoticeForSignals([list[1]!], cyber)).toBeNull()
  })
})
