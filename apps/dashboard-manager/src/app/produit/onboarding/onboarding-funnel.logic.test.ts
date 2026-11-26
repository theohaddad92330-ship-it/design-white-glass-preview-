import { describe, expect, it } from 'vitest'
import { COHORT_MIN_SPACES } from '@/app/_components/charts.logic'
import type { CohorteEntonnoir } from './onboarding-funnel.client'
import { construireVueEntonnoir, formaterDelai, formaterPart, libelleCohorte } from './onboarding-funnel.logic'

/**
 * #1686 — ce qui se teste ici est la DÉRIVATION d'écran, pas le rendu :
 * l'environnement du back-office est `node`, rien n'y est mis en page. Le
 * calcul lui-même (mesurée / non mesurée, la médiane) est testé sans écran
 * dans `apps/api/src/modules/analytics/onboarding-funnel.spec.ts`.
 */

function cohorte(mois: string, espaces: number, overrides: Partial<CohorteEntonnoir> = {}): CohorteEntonnoir {
  return {
    cohorte: mois,
    espaces,
    etapes: [
      { cle: 'onboarding_started', etat: 'mesuree', atteints: espaces, part: 1 },
      { cle: 'onboarding_completed', etat: 'mesuree', atteints: 0, part: 0 },
      { cle: 'integration_connected', etat: 'non_mesuree', atteints: 0, part: null },
      // #1686.5 — `analysis_started` remplace `analysis_completed` comme
      // colonne AFFICHÉE (voir `onboarding-funnel.client.ts` et le docblock de
      // tête d'`apps/api/src/modules/analytics/onboarding-funnel.ts`).
      { cle: 'analysis_started', etat: 'non_mesuree', atteints: 0, part: null },
    ],
    delaiPremiereValeur: { medianJours: null, echantillon: 0 },
    ...overrides,
  }
}

describe('l’étiquette d’une cohorte', () => {
  it('se lit en clair, et en UTC — un mois est un span, pas un instant', () => {
    expect(libelleCohorte('2026-03')).toBe('mars 2026')
    expect(libelleCohorte('2026-01')).toBe('janvier 2026')
  })

  it('rend l’entrée telle quelle quand elle n’est pas un mois — jamais une date inventée', () => {
    expect(libelleCohorte('pas-un-mois')).toBe('pas-un-mois')
    expect(libelleCohorte('')).toBe('')
  })
})

describe('le formatage d’une cellule d’étape', () => {
  it('une étape mesurée se rend en pourcentage, ZÉRO compris', () => {
    expect(formaterPart(0.5)).toBe('50 %')
    expect(formaterPart(0)).toBe('0 %')
    expect(formaterPart(1)).toBe('100 %')
  })

  it('une étape non mesurée ne rend JAMAIS un pourcentage — `null` reste `null`', () => {
    expect(formaterPart(null)).toBe(null)
  })
})

describe('le formatage du délai de première valeur', () => {
  it('rend une médiane en jours', () => {
    expect(formaterDelai(4)).toBe('4 j')
    expect(formaterDelai(4.5)).toBe('4,5 j')
  })

  it('`null` reste `null` — jamais « 0 j », qui dirait « immédiat »', () => {
    expect(formaterDelai(null)).toBe(null)
  })
})

describe('la vue de l’entonnoir (masquage des petites cohortes)', () => {
  it('une cohorte assez grande est AFFICHÉE', () => {
    const vue = construireVueEntonnoir([cohorte('2026-06', 8)])
    expect(vue.lignes[0]?.etat).toBe('affichee')
    expect(vue.masquees).toBe(0)
  })

  it('une cohorte de 2 espaces est MASQUÉE, pas absente — même règle que la rétention (#1658.1)', () => {
    const vue = construireVueEntonnoir([cohorte('2026-06', 2)])
    expect(vue.lignes).toHaveLength(1)
    expect(vue.lignes[0]).toMatchObject({ etat: 'masquee', libelle: 'juin 2026' })
    expect(vue.lignes[0]?.cohorte.espaces).toBe(2)
    expect(vue.masquees).toBe(1)
    expect(vue.espacesMasques).toBe(2)
  })

  it('le seuil est celui de #1643, pas une copie — 3 passe, 2 non', () => {
    expect(COHORT_MIN_SPACES).toBe(3)
    const juste = construireVueEntonnoir([cohorte('2026-06', COHORT_MIN_SPACES)])
    const trop = construireVueEntonnoir([cohorte('2026-06', COHORT_MIN_SPACES - 1)])
    expect(juste.masquees).toBe(0)
    expect(trop.masquees).toBe(1)
  })

  it('garde l’ORDRE et n’attribue jamais le verdict d’une ligne à sa voisine', () => {
    const vue = construireVueEntonnoir([
      cohorte('2026-03', 2),
      cohorte('2026-04', 9),
      cohorte('2026-05', 1),
      cohorte('2026-06', 5),
    ])
    expect(vue.lignes.map(l => `${l.cohorte.cohorte}:${l.etat}`)).toEqual([
      '2026-03:masquee',
      '2026-04:affichee',
      '2026-05:masquee',
      '2026-06:affichee',
    ])
    expect(vue.masquees).toBe(2)
    expect(vue.espacesMasques).toBe(3)
    expect(vue.affichees).toBe(2)
  })

  it('n’invente aucune ligne quand il n’y a aucune cohorte', () => {
    const vue = construireVueEntonnoir([])
    expect(vue).toEqual({ lignes: [], affichees: 0, masquees: 0, espacesMasques: 0 })
  })
})
