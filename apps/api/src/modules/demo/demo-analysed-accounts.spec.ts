import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeFullName } from '../contacts/contact-identity'
import {
  ANALYSED_ACCOUNT_CONTACT_CAP,
  ANALYSED_ACCOUNT_FILES,
  analysedContactScore,
  analysedContactSeed,
} from './demo-analysed-accounts'
import { DEMO_ANALYSED_ACCOUNTS_CONTACT_CAP_COVERAGE } from './demo-coverage'
import { DEMO_ANALYSED_ACCOUNTS, DEMO_DOSSIERS, DEMO_EXTENSION_ACCOUNTS } from './demo-dataset'

/**
 * Louis 12/10/2026 — Airbus, EDF, Renault et Thales ne sont plus des comptes minces (un siège sans nom) : ce sont des
 * dossiers alimentés par de VRAIES analyses lancées en production, épurées puis embarquées. Ces gardes tiennent ce que
 * l'épuration promet, et que les fichiers générés sont bien ce que le semis écrit.
 */
const DATA_DIR = join(__dirname, 'data', 'analysed-accounts')
const NAMES = ['Airbus', 'EDF', 'Renault', 'Thales']

/** Les contenus qui nomment un FOURNISSEUR (doctrine : nos fournisseurs ne se nomment jamais). `brave_news` est une clé
 *  technique du contrat `signal_coverage`, traduite en « presse » par l'écran — pas un nom montré. */
const PROVIDER =
  /pappers|apollo|firecrawl|brave(?!_news)|adzuna|theirstack|zenprospect|lusha|dropcontact|kaspr|hunter\.io|mistral|anthropic|openai|serper|tavily|societe\.com/i
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const FORBIDDEN_KEYS = new Set([
  'user_id',
  'userId',
  'workspace_id',
  'workspaceId',
  'account_id',
  'accountId',
  'assigned_to',
  'assignedTo',
  'owner',
  'crm_record_id',
  'crm_synced_at',
  'anonymized_at',
  'deleted_at',
  'apollo_enrichment',
  '_api_metrics',
  'run_cost',
])

function keysOf(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) for (const item of value) keysOf(item, into)
  else if (value && typeof value === 'object')
    for (const [key, inner] of Object.entries(value)) {
      into.add(key)
      keysOf(inner, into)
    }
  return into
}

describe('comptes démo analysés — semés comme des dossiers, alimentés par les vraies analyses', () => {
  it('les quatre comptes sont semés, plus aucun ne figure parmi les comptes minces', () => {
    expect(DEMO_ANALYSED_ACCOUNTS.map(account => account.company_name)).toEqual(NAMES)
    const thin = DEMO_EXTENSION_ACCOUNTS.map(account => account.company_name)
    for (const name of NAMES) expect(thin).not.toContain(name)
    // Aucun nom en double avec un dossier ou un compte mince (un seul compte par société dans la salle).
    const all = [
      ...DEMO_DOSSIERS.map(dossier => dossier.account.company_name),
      ...DEMO_EXTENSION_ACCOUNTS.map(account => account.company_name),
      ...DEMO_ANALYSED_ACCOUNTS.map(account => account.company_name),
    ]
    expect(new Set(all).size).toBe(all.length)
  })

  it('chaque compte porte plusieurs contacts NOMMÉS, plus aucun siège sans nom', () => {
    for (const account of DEMO_ANALYSED_ACCOUNTS) {
      expect(account.contacts.length).toBeGreaterThan(50)
      for (const contact of account.contacts) expect(contact.full_name).not.toBe(contact.title)
      expect(account.commercial_status).toBe('watching')
    }
  })

  it('le plafond de contacts est respecté, tous les décideurs sont gardés, et sa raison est écrite', () => {
    expect(ANALYSED_ACCOUNT_CONTACT_CAP).toBe(DEMO_ANALYSED_ACCOUNTS_CONTACT_CAP_COVERAGE.cap)
    expect(DEMO_ANALYSED_ACCOUNTS_CONTACT_CAP_COVERAGE.reason.length).toBeGreaterThan(40)
    for (const { company_name, file } of ANALYSED_ACCOUNT_FILES) {
      expect({ company_name, count: file.contacts.length <= ANALYSED_ACCOUNT_CONTACT_CAP }).toEqual({
        company_name,
        count: true,
      })
      const deciders = file.contacts.filter(contact => contact.decision_role !== null).length
      expect({ company_name, deciders }).toEqual({ company_name, deciders: file.meta.deciders })
      expect(file.meta.exported_contacts).toBeGreaterThan(file.contacts.length)
    }
  })

  it('aucun nom en double dans un compte (idx_contacts_account_normalized_name)', () => {
    for (const account of DEMO_ANALYSED_ACCOUNTS) {
      const names = account.contacts.map(contact => normalizeFullName(contact.full_name))
      expect({ account: account.company_name, duplicates: names.length - new Set(names).size }).toEqual({
        account: account.company_name,
        duplicates: 0,
      })
    }
  })

  it('le score et le rang viennent de l’analyse : un rang absent reste null, le score dérivé n’est jamais 0', () => {
    const unranked = ANALYSED_ACCOUNT_FILES.flatMap(({ file }) => file.contacts).filter(c => c.priority === null)
    expect(unranked.length).toBeGreaterThan(0)
    for (const contact of unranked) expect(analysedContactSeed(contact).priority).toBeNull()
    expect(analysedContactScore(null)).toBeGreaterThan(0)
    expect(analysedContactScore(5)).toBeGreaterThan(0)
    expect(analysedContactScore(1)).toBeGreaterThan(analysedContactScore(4))
    for (const account of DEMO_ANALYSED_ACCOUNTS) {
      expect(account.priority_score).toBeGreaterThan(0)
      expect(account.raw_analysis['score_unarbitrated']).toBeUndefined()
    }
  })

  it('l’organigramme porte des liens hiérarchiques (contrat orgHasHierarchyEdges : vérifiés + probables > 0)', () => {
    for (const account of DEMO_ANALYSED_ACCOUNTS) {
      const org = account.raw_analysis['org'] as {
        orgGraph?: { people: unknown[]; hierarchyEdges: { verified?: boolean }[] }
      }
      const edges = org.orgGraph?.hierarchyEdges ?? []
      expect({ account: account.company_name, edges: edges.length > 0 }).toEqual({
        account: account.company_name,
        edges: true,
      })
      expect(org.orgGraph?.people.length).toBeGreaterThan(1)
    }
  })

  it('le semis porte aussi les angles d’attaque et le plan d’action réels', () => {
    for (const account of DEMO_ANALYSED_ACCOUNTS) {
      expect(account.attackAngles?.length).toBeGreaterThan(0)
      expect(account.actionPlan?.weeks.length).toBeGreaterThan(0)
      expect(account.nextAction.title).toContain(account.company_name)
    }
  })

  it('coordonnées professionnelles en clair, jamais une boîte personnelle', () => {
    const personal = /@(gmail|yahoo|hotmail|outlook|icloud|free|orange|wanadoo|sfr|laposte|proton)\./i
    const emails = DEMO_ANALYSED_ACCOUNTS.flatMap(account => account.contacts).filter(contact => contact.email)
    expect(emails.length).toBeGreaterThan(0)
    for (const contact of emails) expect(personal.test(contact.email ?? '')).toBe(false)
  })
})

describe('comptes démo analysés — les fichiers générés sont épurés', () => {
  const files = readdirSync(DATA_DIR).filter(file => file.endsWith('.json'))

  it('quatre fichiers, chacun sous 1,5 Mo', () => {
    expect(files.sort()).toEqual(['airbus.json', 'edf.json', 'renault.json', 'thales.json'])
    for (const file of files) {
      const bytes = readFileSync(join(DATA_DIR, file)).byteLength
      expect({ file, ok: bytes < 1.5 * 1024 * 1024 }).toEqual({ file, ok: true })
    }
  })

  it('aucun identifiant ni état propre au compte de Louis ou à la production', () => {
    for (const file of files) {
      const text = readFileSync(join(DATA_DIR, file), 'utf8')
      expect({ file, uuid: UUID.test(text) }).toEqual({ file, uuid: false })
      const keys = keysOf(JSON.parse(text))
      expect({ file, forbidden: [...keys].filter(key => FORBIDDEN_KEYS.has(key)) }).toEqual({ file, forbidden: [] })
      // Horodatages internes (`*_at`, `*At`) : retirés ; les dates de signaux restent (`date`).
      expect({ file, timestamps: [...keys].filter(key => /(_at|At)$/.test(key)) }).toEqual({ file, timestamps: [] })
      expect(text).not.toMatch(/LouisESN|Schlegel/)
    }
  })

  it('aucun champ ni contenu ne nomme un fournisseur', () => {
    for (const file of files) {
      const text = readFileSync(join(DATA_DIR, file), 'utf8')
      const hit = PROVIDER.exec(text)
      expect({ file, provider: hit ? text.slice(Math.max(0, hit.index - 40), hit.index + 40) : null }).toEqual({
        file,
        provider: null,
      })
    }
  })

  it('sait dire NON : la garde attrape un identifiant et un fournisseur', () => {
    expect(UUID.test('{"id":"d4004684-570f-4730-bdb5-5061f799a6fd"}')).toBe(true)
    expect(PROVIDER.test('"source":"apollo"')).toBe(true)
    expect(PROVIDER.test('"consulted":["brave_news"]')).toBe(false)
    expect(keysOf({ a: [{ owner: 1 }] }).has('owner')).toBe(true)
  })
})

// #4760 (craft rule 9) — le dossier de démo NOMME des besoins de plus de 180 jours, avec leur date réelle ; EDF, dont la
// couche n'en porte aucun, ne fait aucune ligne (on n'affiche pas ce qu'on n'a pas).
describe('comptes démo analysés — besoins historiques nommés (#4760)', () => {
  const needsOf = (name: string) =>
    (
      DEMO_ANALYSED_ACCOUNTS.find(account => account.company_name === name)?.raw_analysis as {
        historical_needs?: { items: { label: string; date: string | null }[] }
      }
    ).historical_needs

  it('Thales, Airbus et Renault nomment leurs besoins historiques avec une date', () => {
    for (const name of ['Thales', 'Airbus', 'Renault']) {
      const items = needsOf(name)?.items ?? []
      expect({ name, named: items.length > 0 }).toEqual({ name, named: true })
      expect(items.some(item => item.date !== null)).toBe(true)
    }
  })

  it('EDF, sans besoin historique, ne porte pas la clé', () => {
    expect(needsOf('EDF')).toBeUndefined()
  })
})
