import { describe, expect, it } from 'vitest'
import { supplierNamesIn } from '@bellum/contracts'
import { resources } from '@/i18n/resources'
import { dataSourceLabel } from '@/lib/data-source-label'
import {
  DISCOVER_EXPORT_COLUMNS,
  discoverCsv,
  discoverExportFilename,
  type DiscoverExportLabels,
} from './discover-export'
import type { DiscoverCandidate } from './discover-types'

const labels: DiscoverExportLabels = {
  name: 'Nom',
  siren: 'SIREN',
  nafCode: 'NAF',
  sector: 'Secteur',
  city: 'Ville',
  department: 'Département',
  headcount: 'Effectif',
  created: 'Création',
  score: 'Score',
  scoreMax: 'Score max',
  confidence: 'Confiance',
  highPotential: 'Fort potentiel',
  signals: 'Signaux',
  lastSignal: 'Dernier signal',
  portfolio: 'Portefeuille',
  sources: 'Sources',
  yes: 'oui',
  no: 'non',
  portfolioState: { new: 'Nouveau', analyzed: 'Analysé', watched: 'Suivi', customer: 'Client', parked: 'Écarté' },
  // #1912.11 — la CAPACITÉ, jamais l'identifiant : le fichier quitte
  // l'application et se lit dans un tableur, hors de toute mise en forme.
  dataSourceLabel: (name: string) => dataSourceLabel(translate, name),
}

/** Un traducteur qui lit le VRAI catalogue FR, sans monter i18next. */
function translate(key: string): string {
  const [namespace = '', path = ''] = key.split(':')
  let node: unknown = (resources as unknown as Record<string, Record<string, unknown>>).fr?.[namespace]
  for (const part of path.split('.')) node = (node as Record<string, unknown> | undefined)?.[part]
  return typeof node === 'string' ? node : `MISSING:${key}`
}

function candidate(over: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  return {
    name: 'ACME',
    siren: '552100554',
    nafCode: '62.02A',
    sector: 'Informatique',
    city: 'Lyon',
    department: '69',
    headcountRange: '50-249',
    creationDate: '2011-04-01',
    score: 72,
    scoreMax: 100,
    scoreUnmeasured: [],
    dataConfidence: 60,
    scoreFactors: [],
    signals: [{ type: 'hiring', label: 'Recrutement', date: '2026-06-01' }],
    angle: null,
    suggestedRoles: [],
    portfolioState: 'watched',
    accountId: null,
    sources: [{ name: 'recherche-entreprises', fetchedAt: '2026-07-22' }],
    ...over,
  }
}

describe('discoverCsv', () => {
  it('écrit l’en-tête traduit puis une ligne par candidat, dans l’ordre affiché', () => {
    const lines = discoverCsv([candidate(), candidate({ name: 'Bêta', siren: '2' })], labels).split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('"Nom","SIREN"')
    expect(lines[1]).toContain('"ACME"')
    expect(lines[2]).toContain('"Bêta"')
  })

  it('exporte exactement les colonnes déclarées', () => {
    const header = discoverCsv([], labels).split('\n')[0]
    expect(header.split(',')).toHaveLength(DISCOVER_EXPORT_COLUMNS.length)
  })

  it('laisse VIDE un score non mesurable — jamais 0', () => {
    const line = discoverCsv([candidate({ score: null, scoreMax: null, dataConfidence: null })], labels).split('\n')[1]
    expect(line).toContain('"","",""')
    expect(line).not.toContain('"0"')
  })

  it('reporte le fort potentiel et le dernier signal daté', () => {
    const line = discoverCsv([candidate()], labels).split('\n')[1]
    expect(line).toContain('"oui"')
    expect(line).toContain('"2026-06-01"')
    expect(line).toContain('"Suivi"')
  })

  // #1912.11 — le CSV est une surface client comme l'écran : il portait
  // `pappers` dans sa dernière colonne. La garde JSX ne peut pas le voir (ce
  // fichier n'a pas de JSX), c'est donc ici que la règle est tenue.
  it('sait dire NON — la colonne Sources ne nomme jamais NOTRE fournisseur', () => {
    const line = discoverCsv([candidate({ sources: [{ name: 'pappers', fetchedAt: '2026-07-22' }] })], labels).split(
      '\n',
    )[1]
    expect(line).not.toContain('pappers')
    expect(supplierNamesIn(line ?? '')).toEqual([])
    expect(line).toContain('la source de données d’entreprises')
  })

  it('dédoublonne deux sources de même capacité, et nomme un registre PUBLIC', () => {
    const sources = [
      { name: 'hunter', fetchedAt: '2026-07-22' },
      { name: 'lusha', fetchedAt: '2026-07-22' },
      { name: 'boamp', fetchedAt: '2026-07-22' },
    ]
    const line = discoverCsv([candidate({ sources })], labels).split('\n')[1]
    expect(line).toContain('la source d’enrichissement · les avis de marchés publics')
  })

  it('neutralise une formule de tableur venue d’un nom d’entreprise', () => {
    const line = discoverCsv([candidate({ name: '=1+1' })], labels).split('\n')[1]
    expect(line.startsWith('"\'=1+1"')).toBe(true)
  })
})

describe('discoverExportFilename', () => {
  it('date le fichier', () => {
    expect(discoverExportFilename('decouvrir', Date.parse('2026-07-22T10:00:00Z'))).toBe('decouvrir-2026-07-22.csv')
  })
})
