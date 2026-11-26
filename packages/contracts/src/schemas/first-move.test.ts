import { describe, expect, it } from 'vitest'
import { ANTI_ADVICE_ENABLED, antiAdvice, firstMove, planFreshness, type FirstMoveInput } from './first-move.js'

const NOTHING: FirstMoveInput = {
  accountName: 'ACME',
  barrierScore: null,
  barrierClass: null,
  bestEntity: null,
  fallbackEntity: null,
  headquartersCity: null,
  headquartersDepartment: null,
  publicContracts: null,
  openProductRoles: null,
  modernStack: false,
  integratorPartnership: null,
  isScaleup: false,
  headcount: null,
  autonomousProductTeam: null,
  sector: null,
  angle: null,
  proof: null,
}

const NOW = new Date('2026-08-23T00:00:00Z')

describe('le premier mouvement (tome 5 §14.4)', () => {
  it('porte quatre points, dans l’ordre du document', () => {
    const move = firstMove({ ...NOTHING, angle: 'Angle produit' }, NOW)
    expect(Object.keys(move)).toEqual(['target', 'message', 'ifSilent', 'antiAdvice'])
  })

  it('cible l’entité la mieux classée, et dit d’où ça vient', () => {
    const move = firstMove({ ...NOTHING, bestEntity: { name: 'VINCI Autoroutes', score: 88, city: 'Rueil' } }, NOW)
    expect(move.target.label).toContain('VINCI Autoroutes')
    expect(move.target.source).toContain('88/100')
  })

  it('n’écrit pas d’angle à la place du plan', () => {
    const move = firstMove(NOTHING, NOW)
    expect(move.message.angle).toContain('Angle à écrire')
  })

  it('propose une seconde porte, et dit quoi faire quand il n’y en a pas', () => {
    const withFallback = firstMove({ ...NOTHING, fallbackEntity: { name: 'Axians' } }, NOW)
    expect(withFallback.ifSilent.label).toContain('Axians')
    expect(firstMove(NOTHING, NOW).ifSilent.label).toContain('compte suivant')
  })
})

describe('l’anti-conseil (§26.1) — six familles, six raisons chiffrées', () => {
  it('est SERVI — arbitrage de Louis du 23/08, chaque interdit portant sa raison', () => {
    expect(ANTI_ADVICE_ENABLED).toBe(true)
    const move = firstMove(
      { ...NOTHING, barrierScore: 8.2, bestEntity: { name: 'VINCI Autoroutes', score: 88, city: 'Rueil' } },
      NOW,
    )
    expect(move.antiAdvice).toHaveLength(1)
    // La raison est ce qui rend l'interdit contestable : un impératif nu ne
    // laisserait aucune prise à quelqu'un qui connaît mieux son compte.
    expect(move.antiAdvice[0]?.reason).toContain('8.2/10')
  })

  it('ne sert RIEN sur un compte dont on ne sait rien, même allumé', () => {
    expect(firstMove(NOTHING, NOW).antiAdvice).toEqual([])
  })

  it('ENTITÉ — le siège verrouillé quand une porte existe ailleurs', () => {
    const found = antiAdvice(
      {
        ...NOTHING,
        barrierScore: 8.2,
        headquartersCity: 'Nanterre',
        publicContracts: 47,
        bestEntity: { name: 'VINCI Autoroutes', score: 88, city: 'Rueil' },
      },
      NOW,
    )
    expect(found[0]?.kind).toBe('entite')
    expect(found[0]?.label).toContain('Nanterre')
    expect(found[0]?.reason).toContain('8.2/10')
    expect(found[0]?.reason).toContain('47 marchés publics')
  })

  it('VOCABULAIRE — trois postes produit ouverts et une stack moderne', () => {
    const found = antiAdvice({ ...NOTHING, openProductRoles: 3, modernStack: true }, NOW)
    expect(found[0]?.kind).toBe('vocabulaire')
    expect(found[0]?.label).toContain('validé')
  })

  it('POSITIONNEMENT — un partenariat annoncé récemment', () => {
    const found = antiAdvice(
      { ...NOTHING, integratorPartnership: { name: 'Accenture', announcedAt: '2026-02-01' } },
      NOW,
    )
    expect(found[0]?.kind).toBe('positionnement')
    expect(found[0]?.label).toContain('renfort')
  })

  it('POSITIONNEMENT — mais pas sur un partenariat de trois ans', () => {
    expect(
      antiAdvice({ ...NOTHING, integratorPartnership: { name: 'Accenture', announcedAt: '2023-02-01' } }, NOW),
    ).toEqual([])
  })

  it('CIRCUIT — une scale-up n’a pas de direction achats', () => {
    const found = antiAdvice({ ...NOTHING, isScaleup: true, headcount: 552 }, NOW)
    expect(found[0]?.kind).toBe('circuit')
    expect(found[0]?.reason).toContain('552 salariés')
  })

  it('REGISTRE — un siège hors Île-de-France', () => {
    const found = antiAdvice({ ...NOTHING, headquartersCity: 'Brest', headquartersDepartment: '29' }, NOW)
    expect(found[0]?.kind).toBe('registre')
    expect(found[0]?.reason).toContain('Brest')
  })

  it('REGISTRE — jamais sur un siège parisien', () => {
    expect(antiAdvice({ ...NOTHING, headquartersCity: 'Paris', headquartersDepartment: '75' }, NOW)).toEqual([])
  })

  it('CADRE DE LECTURE — une structure produit autonome', () => {
    const found = antiAdvice(
      { ...NOTHING, autonomousProductTeam: { name: 'Data & AI Factory', size: 50 }, sector: 'Retailer' },
      NOW,
    )
    expect(found[0]?.kind).toBe('cadre_de_lecture')
    expect(found[0]?.reason).toContain('50 personnes')
  })

  it('ne produit AUCUN interdit sur un compte dont on ne sait rien', () => {
    expect(antiAdvice(NOTHING, NOW)).toEqual([])
  })

  it('n’en garde que deux, même quand quatre s’appliquent', () => {
    const found = antiAdvice(
      {
        ...NOTHING,
        barrierScore: 8.5,
        headquartersCity: 'Lyon',
        headquartersDepartment: '69',
        bestEntity: { name: 'BU Data', score: 90, city: 'Lyon' },
        openProductRoles: 4,
        modernStack: true,
        isScaleup: true,
        headcount: 400,
      },
      NOW,
    )
    expect(found).toHaveLength(2)
  })

  it('chaque interdit porte une raison NON VIDE', () => {
    const found = antiAdvice({ ...NOTHING, isScaleup: true, headcount: 300 }, NOW)
    expect(found.every(item => item.reason.trim().length > 20)).toBe(true)
  })
})

describe('la fraîcheur d’un plan (§37)', () => {
  const now = new Date('2026-08-23T00:00:00Z')

  it('classe les trois âges', () => {
    expect(planFreshness('2026-08-20T00:00:00Z', now)).toBe('frais')
    expect(planFreshness('2026-07-10T00:00:00Z', now)).toBe('vieillissant')
    expect(planFreshness('2026-01-10T00:00:00Z', now)).toBe('perime')
  })

  it('dit « inconnu » plutôt que d’inventer un âge', () => {
    expect(planFreshness(null, now)).toBe('inconnu')
    expect(planFreshness('pas une date', now)).toBe('inconnu')
  })

  it('ne lit pas une date future comme un plan très frais', () => {
    // Une horloge déréglée ne doit pas produire un badge rassurant.
    expect(planFreshness('2027-01-01T00:00:00Z', now)).toBe('inconnu')
  })
})
