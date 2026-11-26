import { describe, expect, it } from 'vitest'
import { COHORT_MIN_SPACES } from '@/app/_components/charts.logic'
import type { CohorteRetention } from '@/lib/retention'
import { construireVueRetention, libelleCohorte, versLigneDeGrille } from './retention.logic'

/**
 * #1658.1 — ce qui se teste ici est la DÉRIVATION d'écran, pas le rendu :
 * l'environnement du back-office est `node`, rien n'y est mis en page.
 *
 * Le cas central est celui que l'issue écrit noir sur blanc — « cohorte de
 * 2 espaces → ligne masquée avec "trop peu d'espaces", pas une ligne vide » —
 * et il n'est PAS couvert par les tests de #1643 : `buildCohortGrid` y rend bien
 * `null`, mais `CohortGrid` filtre ces `null` et la ligne disparaît sans un mot.
 */

function cohorte(mois: string, espaces: number, retention: (number | null)[], moisEcoules?: number): CohorteRetention {
  return {
    cohorte: mois,
    espaces,
    moisEcoules: moisEcoules ?? retention.filter(v => v !== null).length - 1,
    retentionParMois: [...retention, ...Array(12 - retention.length).fill(null)],
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

describe('le passage à la grille de #1643', () => {
  it('renomme, et ne recalcule RIEN', () => {
    const row = versLigneDeGrille(cohorte('2026-06', 7, [1, 0.5, 0.25]))
    expect(row).toEqual({
      cohortLabel: 'juin 2026',
      spaceCount: 7,
      retentionByMonth: [1, 0.5, 0.25, ...Array(9).fill(null)],
    })
  })
})

describe('la vue de rétention (#1658.1)', () => {
  it('LIT quelque chose — une cohorte assez grande est bien affichée', () => {
    const vue = construireVueRetention([cohorte('2026-06', 8, [1, 0.75, 0.5])])
    expect(vue.rows).toHaveLength(1)
    expect(vue.lignes[0]?.etat).toBe('affichee')
    expect(vue.masquees).toBe(0)
  })

  it('LE TEST DE L’ISSUE — une cohorte de 2 espaces est MASQUÉE, pas absente', () => {
    const vue = construireVueRetention([cohorte('2026-06', 2, [1, 0.5])])

    // Elle ne va pas dans la grille…
    expect(vue.rows).toHaveLength(0)
    // …mais elle EXISTE dans les lignes, avec son étiquette et son compte, ce
    // qui est exactement ce qu'il faut pour écrire « trop peu d'espaces ».
    expect(vue.lignes).toHaveLength(1)
    expect(vue.lignes[0]).toMatchObject({ etat: 'masquee', libelle: 'juin 2026' })
    expect(vue.lignes[0]?.cohorte.espaces).toBe(2)
    expect(vue.masquees).toBe(1)
    expect(vue.espacesMasques).toBe(2)
  })

  it('le seuil est celui de #1643, pas une copie — 3 passe, 2 non', () => {
    expect(COHORT_MIN_SPACES).toBe(3)
    const juste = construireVueRetention([cohorte('2026-06', COHORT_MIN_SPACES, [1])])
    const trop = construireVueRetention([cohorte('2026-06', COHORT_MIN_SPACES - 1, [1])])
    expect(juste.masquees).toBe(0)
    expect(trop.masquees).toBe(1)
  })

  it('garde l’ORDRE, et n’attribue jamais le verdict d’une ligne à sa voisine', () => {
    // Le piège que ce test ferme : `buildCohortGrid` rend un tableau de MÊME
    // longueur, avec des `null` en place. Filtrer avant de rapprocher décalerait
    // tous les verdicts d'un cran — « mars » recevrait le verdict d'« avril ».
    const vue = construireVueRetention([
      cohorte('2026-03', 2, [1]),
      cohorte('2026-04', 9, [1, 0.8]),
      cohorte('2026-05', 1, [0]),
      cohorte('2026-06', 5, [1, 1, 0.6]),
    ])

    expect(vue.lignes.map(l => `${l.cohorte.cohorte}:${l.etat}`)).toEqual([
      '2026-03:masquee',
      '2026-04:affichee',
      '2026-05:masquee',
      '2026-06:affichee',
    ])
    expect(vue.rows.map(r => r.cohortLabel)).toEqual(['avril 2026', 'juin 2026'])
    expect(vue.masquees).toBe(2)
    expect(vue.espacesMasques).toBe(3)
  })

  it('n’invente aucune ligne quand il n’y a aucune cohorte', () => {
    const vue = construireVueRetention([])
    expect(vue).toEqual({ rows: [], lignes: [], masquees: 0, espacesMasques: 0 })
  })

  it('laisse les mois à venir tels quels — la grille les lira comme « à venir », pas comme 0', () => {
    const vue = construireVueRetention([cohorte('2026-08', 6, [1, 0.5])])
    const row = vue.rows[0]!
    expect(row.retentionByMonth.slice(0, 2)).toEqual([1, 0.5])
    expect(row.retentionByMonth.slice(2)).toEqual(Array(10).fill(null))
    expect(row.retentionByMonth.slice(2)).not.toContain(0)
  })

  it('un mois écoulé à 0 % reste un ZÉRO mesuré, il n’est pas confondu avec un mois à venir', () => {
    const vue = construireVueRetention([cohorte('2026-06', 4, [1, 0, 0], 2)])
    expect(vue.rows[0]?.retentionByMonth.slice(0, 3)).toEqual([1, 0, 0])
    expect(vue.lignes[0]?.cohorte.moisEcoules).toBe(2)
  })
})
