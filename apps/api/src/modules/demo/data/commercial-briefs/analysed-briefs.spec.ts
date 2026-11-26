import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { checkCommercialBrief, commercialBriefSchema } from '@bellum/contracts'

import {
  COMMERCIAL_BRIEF_BY_COMPANY,
  COMMERCIAL_BRIEF_BY_EXTENSION_COMPANY,
  commercialBriefOf,
} from '../../commercial-brief-seed'
import { DEMO_ANALYSED_ACCOUNTS } from '../../demo-dataset'
import { DEMO_SEED_REVISION } from '../../demo-seed-fingerprint'

/**
 * Briefs « Ce que je sais » des quatre comptes analysés (décision Louis 13/10/2026) : Airbus, EDF, Renault, Thales.
 * Générés par `scripts/generate-demo-analysed-briefs.mjs` depuis le JSON analysé du MÊME compte — aucune donnée
 * inventée : toute personne citée est un contact semé du compte, sous son nom exact.
 */
const COMPANIES = [
  { company: 'Airbus', file: 'airbus' },
  { company: 'EDF', file: 'edf' },
  { company: 'Renault', file: 'renault' },
  { company: 'Thales', file: 'thales' },
] as const

const readJson = (path: string): unknown => JSON.parse(readFileSync(join(__dirname, path), 'utf8'))

describe.each(COMPANIES)('brief « Ce que je sais » — $company', ({ company, file }) => {
  const raw = readFileSync(join(__dirname, `${file}.json`), 'utf8')
  const parsed = commercialBriefSchema.safeParse(JSON.parse(raw))
  const analysed = readJson(`../analysed-accounts/${file}.json`) as {
    contacts: Array<{ full_name: string }>
  }
  const seeded = DEMO_ANALYSED_ACCOUNTS.find(account => account.company_name === company)

  it('passe le schéma du contrat et ne porte aucune violation métier', () => {
    expect(parsed.success ? [] : parsed.error.issues.slice(0, 5)).toEqual([])
    if (!parsed.success) return
    expect(parsed.data.account_name).toBe(company)
    expect(checkCommercialBrief(parsed.data)).toEqual([])
    expect(parsed.data.what_i_know.length).toBeGreaterThan(0)
  })

  it('chaque personne citée est un contact semé du compte, sous son nom exact', () => {
    if (!parsed.success) throw new Error('brief illisible')
    const names = new Set(analysed.contacts.map(contact => contact.full_name))
    expect(parsed.data.people.length).toBeGreaterThan(0)
    for (const person of parsed.data.people) expect(names.has(person.name)).toBe(true)
    expect(seeded?.contacts.length).toBeGreaterThan(0)
  })

  it('aucun fournisseur nommé, aucune probabilité, aucun « 0 » en valeur de KPI', () => {
    expect(raw).not.toMatch(/pappers|apollo|firecrawl|brave|adzuna|theirstack|lusha|dropcontact|mistral|anthropic/i)
    expect(raw).not.toMatch(/probabilit|chance de|taux de closing/i)
    if (!parsed.success) throw new Error('brief illisible')
    expect(parsed.data.kpis.some(kpi => kpi.value === 0 || kpi.value === '0')).toBe(false)
  })

  it('est enregistré et posé dans raw_analysis.commercial_brief du compte semé', () => {
    expect(commercialBriefOf(company)).toBe(COMMERCIAL_BRIEF_BY_EXTENSION_COMPANY[company])
    const posed = (seeded?.raw_analysis as Record<string, unknown> | undefined)?.['commercial_brief']
    expect(commercialBriefSchema.safeParse(posed).success).toBe(true)
  })
})

describe('semis des briefs des comptes analysés', () => {
  it('aucun item de graphique n’a une valeur ≤ 0 : une année sans CA ne s’affiche jamais « 0 »', () => {
    const all = [
      ...Object.entries(COMMERCIAL_BRIEF_BY_COMPANY),
      ...Object.entries(COMMERCIAL_BRIEF_BY_EXTENSION_COMPANY),
    ]
    expect(all.length).toBeGreaterThanOrEqual(4)
    const offenders = all.flatMap(([name, brief]) =>
      (brief.charts ?? []).flatMap(chart =>
        chart.items
          .filter(item => !(Number.isFinite(item.value) && item.value > 0))
          .map(item => `${name}/${item.label}`),
      ),
    )
    expect(offenders).toEqual([])
  })

  it('la révision du semis est montée à 7 au moins (les comptes déjà semés sont rejoués)', () => {
    expect(DEMO_SEED_REVISION).toBeGreaterThanOrEqual(7)
  })
})
