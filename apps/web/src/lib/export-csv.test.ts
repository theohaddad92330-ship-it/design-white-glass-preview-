import { describe, expect, it, vi } from 'vitest'

// The global test setup (src/test/setup.ts) mocks @/lib/export-csv to a stub so
// views don't trigger real CSV work. Here we want the REAL implementation.
const { generateCSV } = await vi.importActual<typeof import('./export-csv')>('./export-csv')

describe('generateCSV', () => {
  it('quotes and escapes normal values', () => {
    const csv = generateCSV([{ full_name: 'Jean Dupont', company_name: 'Acme, Inc "official"' }])
    expect(csv).toContain('"Jean Dupont"')
    expect(csv).toContain('"Acme, Inc ""official"""')
  })

  it('neutralises spreadsheet formula injection (=, +, -, @)', () => {
    const csv = generateCSV([
      {
        full_name: '=HYPERLINK("http://evil","x")',
        title: '+1+1',
        company_name: '-2+3',
        email: '@SUM(A1:A9)',
      },
    ])
    expect(csv).toContain('"\'=HYPERLINK(""http://evil"",""x"")"')
    expect(csv).toContain('"\'+1+1"')
    expect(csv).toContain('"\'-2+3"')
    expect(csv).toContain('"\'@SUM(A1:A9)"')
  })

  // #2297.52 — l'export enrichi CITE la source de chaque colonne enrichie et
  // n'emporte jamais un champ du catalogue interdit (#2297.54).
  it('#2297.52 — chaque colonne enrichie est suivie de sa source, jamais du nom d’un fournisseur', async () => {
    const { i18n } = await import('@/i18n')
    await i18n.changeLanguage('fr')
    const csv = generateCSV([
      { full_name: 'Jean', email: 'j@acme.fr', phone: null, linkedin_url: 'https://l.in/j', source: 'apollo' },
    ])
    const [header = '', row = ''] = csv.split(/\r?\n/)
    expect(header).toContain('"Source — Email"')
    expect(header).toContain('"Source — Telephone"')
    expect(header).toContain('"Source — LinkedIn"')
    // Une valeur présente cite sa famille de source ; une cellule vide n'en cite aucune.
    expect(row).toContain('"j@acme.fr","lu dans un outil connecté","","","https://l.in/j","lu dans un outil connecté"')
    expect(csv.toLowerCase()).not.toContain('apollo')
  })

  it('#2297.52 — n’exporte jamais un champ du catalogue interdit', () => {
    const csv = generateCSV([
      { full_name: 'Jean', gender: 'female', birth_date: '1980-01-01', address: '1 rue du Domicile' },
    ])
    expect(csv).not.toMatch(/female|1980-01-01|Domicile/)
  })

  it('leaves safe values without a leading quote', () => {
    const csv = generateCSV([{ full_name: 'Normale', email: 'a@b.co' }])
    expect(csv).toContain('"Normale"')
    expect(csv).toContain('"a@b.co"')
  })
})
