import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import { readableColumns } from './consultant-wire-columns'

/** #4401.1 / #4402.2 — une fiche au CV importé PARTIEL : des colonnes JSON de forme inattendue. */
const row = (over: Record<string, unknown>): ConsultantEntity =>
  ({
    id: '34f4c624-19db-4a9b-9add-2d7642d08c1d',
    stack: ['java'],
    sectors: [],
    zones: [],
    references: [],
    clearances: [],
    languages: [],
    education: null,
    extra: {},
    ...over,
  }) as unknown as ConsultantEntity

describe('readableColumns — une valeur illisible ne casse jamais la fiche', () => {
  it('une fiche saine passe telle quelle, sans rien nommer', () => {
    const result = readableColumns(
      row({ stack: ['java', 'spring'], education: ['Master'], languages: [{ code: 'fr', level: null }] }),
    )
    expect(result.unreadable).toEqual([])
    expect(result.row.stack).toEqual(['java', 'spring'])
    expect(result.row.education).toEqual(['Master'])
  })

  it('un objet là où l’on attend une liste : liste vide, colonne NOMMÉE', () => {
    const result = readableColumns(row({ stack: { java: 3 }, sectors: 'banque' }))
    expect(result.row.stack).toEqual([])
    expect(result.row.sectors).toEqual([])
    expect(result.unreadable).toEqual(expect.arrayContaining(['stack', 'sectors']))
  })

  it('un élément nul ou numérique dans une liste est écarté, le reste est gardé', () => {
    const result = readableColumns(row({ stack: ['java', null, 42, 'sql'] }))
    expect(result.row.stack).toEqual(['java', 'sql'])
    expect(result.unreadable).toEqual(['stack'])
  })

  it('une colonne nullable illisible redevient `null` (« non lu »), jamais une liste vide inventée', () => {
    const result = readableColumns(row({ education: { degree: 'Master' }, tools: null }))
    expect(result.row.education).toBeNull()
    expect(result.row.tools).toBeNull()
    expect(result.unreadable).toEqual(['education'])
  })

  it('langues sans code, comptes rendus non liste, extra non texte : écartés et nommés', () => {
    const result = readableColumns(
      row({ languages: [{ level: 'B2' }, { code: 'en', level: 'C1' }], field_reports: 'x', extra: { a: 'b', c: 3 } }),
    )
    expect(result.row.languages).toEqual([{ code: 'en', level: 'C1' }])
    expect(result.row.field_reports).toEqual([])
    expect(result.row.extra).toEqual({ a: 'b' })
    expect(result.unreadable).toEqual(expect.arrayContaining(['languages', 'field_reports', 'extra']))
  })
})
