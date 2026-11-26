import type { AtsExportRow } from '@bellum/contracts'
import { consultantExportRowsToCsv } from './bulk-export-csv'

const ROW: AtsExportRow = {
  consultantId: 'c-1',
  firstName: 'Jean',
  lastName: 'Dupont',
  email: 'jean@example.com',
  phone: null,
  title: 'Développeur',
  seniority: 'senior',
  availability: 'immediate',
  availableFrom: null,
  tjm: null,
  engagementKind: 'freelance',
  source: null,
}

describe('consultantExportRowsToCsv', () => {
  it('sépare par point-virgule, jamais une virgule — un tableur français l’attend', () => {
    const csv = consultantExportRowsToCsv([ROW])
    const [, dataLine] = csv.replace('\uFEFF', '').split('\r\n')
    expect(dataLine?.split(';').length).toBe(12)
  })

  it('une valeur ABSENTE reste une cellule VIDE, jamais « 0 » ni « null »', () => {
    const csv = consultantExportRowsToCsv([ROW])
    const [, dataLine] = csv.replace('\uFEFF', '').split('\r\n')
    const cells = dataLine?.split(';') ?? []
    // phone (index 4), availableFrom (8), tjm (9), source (11) sont absents.
    expect(cells[4]).toBe('')
    expect(cells[9]).toBe('')
    expect(cells.join(';')).not.toContain('null')
  })

  it('cite une valeur contenant un guillemet, sans casser la ligne', () => {
    const csv = consultantExportRowsToCsv([{ ...ROW, title: 'Chef de "projet" sénior' }])
    const [, dataLine] = csv.replace('\uFEFF', '').split('\r\n')
    expect(dataLine).toContain('""projet""')
  })

  it('une valeur contenant un point-virgule reste À L’INTÉRIEUR de ses guillemets — la ligne garde ses douze cellules', () => {
    const csv = consultantExportRowsToCsv([{ ...ROW, title: 'Chef de projet; sénior' }])
    const [, dataLine] = csv.replace('\uFEFF', '').split('\r\n')
    expect(dataLine).toContain('"Chef de projet; sénior"')
  })

  it('porte le BOM UTF-8 en tête — Excel FR sinon range toute la ligne dans une colonne', () => {
    expect(consultantExportRowsToCsv([ROW]).startsWith('\uFEFF')).toBe(true)
  })
})
