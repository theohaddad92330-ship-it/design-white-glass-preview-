import { describe, expect, it } from 'vitest'
import {
  CONTENT_LIBRARY_ENTRIES,
  CONTENT_LIBRARY_KINDS,
  contentLibraryEntrySchema,
  extractContentLibraryVariables,
  searchContentLibrary,
} from './content-library.js'

describe('CONTENT_LIBRARY_ENTRIES', () => {
  it('porte 26 entrées : 3 emails, 2 scripts d’appel, 15 objections, 6 pitchs', () => {
    expect(CONTENT_LIBRARY_ENTRIES).toHaveLength(26)
    const byKind = Object.fromEntries(CONTENT_LIBRARY_KINDS.map(kind => [kind, 0])) as Record<string, number>
    for (const entry of CONTENT_LIBRARY_ENTRIES) byKind[entry.kind] += 1
    expect(byKind.email_template).toBe(3)
    expect(byKind.call_script).toBe(2)
    expect(byKind.objection_response).toBe(15)
    expect(byKind.pitch).toBe(6)
  })

  it('chaque entrée est valide contre le schéma (id, corps, conditions non vides)', () => {
    for (const entry of CONTENT_LIBRARY_ENTRIES) {
      expect(contentLibraryEntrySchema.safeParse(entry).success, entry.id).toBe(true)
      expect(entry.conditions.length, `${entry.id} sans condition d'usage`).toBeGreaterThan(0)
    }
  })

  it('aucun identifiant n’est dupliqué', () => {
    const ids = CONTENT_LIBRARY_ENTRIES.map(entry => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('les trois emails portent un objet, les scripts et le reste n’en portent pas', () => {
    for (const entry of CONTENT_LIBRARY_ENTRIES) {
      if (entry.kind === 'email_template') {
        expect(entry.subject, entry.id).toBeTruthy()
      } else {
        expect(entry.subject, entry.id).toBeUndefined()
      }
    }
  })
})

describe('extractContentLibraryVariables', () => {
  it('extrait les placeholders dans l’ordre, sans doublon', () => {
    const body = 'Bonjour {{Prénom}}, je vous recontacte au sujet de {{Projet}} — {{Prénom}}, êtes-vous dispo ?'
    expect(extractContentLibraryVariables(body)).toEqual(['Prénom', 'Projet'])
  })

  it('rend un tableau vide sans placeholder', () => {
    expect(extractContentLibraryVariables('Aucun placeholder ici.')).toEqual([])
  })

  it('le modèle 1 (#3441) expose ses cinq placeholders déclarés', () => {
    const entry = CONTENT_LIBRARY_ENTRIES.find(item => item.id === 'email-approche-initiale')
    expect(entry).toBeDefined()
    expect(extractContentLibraryVariables(entry!.body)).toEqual([
      'Prénom',
      'métier',
      'X',
      'technologie ou projet',
      'Signature',
    ])
  })
})

describe('searchContentLibrary', () => {
  it('sans filtre, rend la bibliothèque entière (même règle que search_proofs)', () => {
    expect(searchContentLibrary(CONTENT_LIBRARY_ENTRIES)).toHaveLength(26)
  })

  it('filtre par kind', () => {
    const pitches = searchContentLibrary(CONTENT_LIBRARY_ENTRIES, { kind: 'pitch' })
    expect(pitches).toHaveLength(6)
    expect(pitches.every(entry => entry.kind === 'pitch')).toBe(true)
  })

  it('filtre par mot-clé, insensible à la casse, sur le titre ET le corps', () => {
    const tjm = searchContentLibrary(CONTENT_LIBRARY_ENTRIES, { query: 'tjm' })
    expect(tjm.length).toBeGreaterThanOrEqual(1)
    expect(
      tjm.every(entry => entry.title.toLowerCase().includes('tjm') || entry.body.toLowerCase().includes('tjm')),
    ).toBe(true)
  })

  it('combine kind et query', () => {
    const result = searchContentLibrary(CONTENT_LIBRARY_ENTRIES, { kind: 'objection_response', query: 'budget' })
    expect(result.every(entry => entry.kind === 'objection_response')).toBe(true)
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  it('un mot-clé absent de tout rend un résultat vide, jamais une liste devinée', () => {
    expect(searchContentLibrary(CONTENT_LIBRARY_ENTRIES, { query: 'zzzz-inexistant' })).toHaveLength(0)
  })

  it('#3442 — une requête naturelle multi-mots retrouve la variante B malgré la ponctuation du titre', () => {
    // Recette prod (30/09) : le titre porte une virgule (« pure chasse, sans
    // contexte ») qu'une requête naturelle sans virgule ne peut jamais
    // matcher en sous-chaîne littérale. Chaque mot doit être cherché
    // séparément (ordre et ponctuation libres), jamais la phrase entière.
    const result = searchContentLibrary(CONTENT_LIBRARY_ENTRIES, {
      kind: 'call_script',
      query: 'pure chasse sans contexte',
    })
    expect(result.some(entry => entry.id === 'script-appel-variante-b-pure-chasse')).toBe(true)
  })
})
