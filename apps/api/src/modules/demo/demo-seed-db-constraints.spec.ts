import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { missingPartnerForEngagement } from '@bellum/contracts'
import { normalizeFullName } from '../contacts/contact-identity'
import { COMMERCIAL_BRIEF_BY_COMPANY, briefContactSeeds } from './commercial-brief-seed'
import { BPCE_SEED } from './bpce-seed'
import {
  DEMO_CONSULTANTS,
  DEMO_DELIVERY_CLIENT,
  DEMO_DOSSIERS,
  DEMO_EXTENSION_ACCOUNTS,
  DEMO_ICEBREAKER_INSUFFICIENT_CONTEXT_CONTACT,
  DEMO_UNQUALIFIED_CONTACTS,
} from './demo-dataset'

/**
 * I31 (05/10) — la salle démo ne se provisionnait plus : `consultants_subcontracting_partner_check`
 * (`engagement_kind = 'sous_traitance'` ⇒ `partner_account_id` posé) rejetait le consultant semé en sous-traitance,
 * dont le partenaire n'arrivait que par un UPDATE APRÈS l'INSERT. Le jeu miroite ici les contraintes de la base :
 * une ligne semée qui en viole une fait échouer la CI, pas la réunion.
 */
const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')

describe('démo — le jeu semé respecte les contraintes SQL', () => {
  it('tout consultant en sous-traitance du jeu nomme son partenaire', () => {
    const subcontractors = DEMO_CONSULTANTS.filter(c => c.engagement_kind_override === 'sous_traitance')
    expect(subcontractors.length).toBeGreaterThan(0)
    for (const c of subcontractors) {
      expect({ name: c.full_name, partner: c.partner_account ?? null }).toEqual({
        name: c.full_name,
        partner: expect.any(String),
      })
    }
  })

  it('le miroir de la contrainte sait dire NON', () => {
    expect(missingPartnerForEngagement({ engagement_kind: 'sous_traitance', partner_account_id: null })).toBe(true)
    expect(missingPartnerForEngagement({ engagement_kind: 'sous_traitance', partner_account_id: 'uuid' })).toBe(false)
    expect(missingPartnerForEngagement({ engagement_kind: 'salarie', partner_account_id: null })).toBe(false)
  })

  it('seedVivier pose partner_account_id DANS l’INSERT (jamais par un UPDATE tardif)', () => {
    const vivier = seed.slice(seed.indexOf('private async seedVivier('))
    const insert = vivier.slice(0, vivier.indexOf('this.consultants.save(') + 3000)
    expect(insert).toMatch(/ensurePartnerAnchor/)
    expect(insert).toMatch(/partner_account_id: consultant\.partner_account/)
  })

  it('aucun compte du jeu ne porte deux contacts au même nom normalisé (idx_contacts_account_normalized_name)', () => {
    const duplicates: string[] = []
    const check = (account: string, names: readonly (string | null | undefined)[]): void => {
      const seen = new Set<string>()
      for (const name of names) {
        const key = normalizeFullName(name)
        if (!key) continue
        if (seen.has(key)) duplicates.push(`${account} : « ${name} »`)
        seen.add(key)
      }
    }
    for (const dossier of DEMO_DOSSIERS)
      check(
        dossier.account.company_name,
        dossier.contacts.map(c => c.full_name),
      )
    for (const account of DEMO_EXTENSION_ACCOUNTS)
      check(
        account.company_name,
        account.contacts.map(c => c.full_name),
      )
    expect(duplicates).toEqual([])
  })
})

/**
 * I32 (05/10) — la salle ne s'ouvrait TOUJOURS pas : un siège « DSI » du jeu étendu portait `decision_role:
 * 'decision_maker'` (un rôle de PERSONNE, hors de l'énumération des contacts) et `contacts_decision_role_check`
 * rejetait l'INSERT. I31 n'avait gardé qu'une contrainte, celle du consultant. Cette garde lit TOUS les CHECK
 * `col IN (…)` / `col = ANY (ARRAY[…])` des migrations sur les tables semées, et confronte chaque ligne semée.
 */
type Row = Record<string, unknown>
const MIGRATIONS = join(__dirname, '..', '..', 'migrations')
// `projects` ne porte aucun CHECK énuméré dans les migrations : rien à confronter.
const ENUMERATED_TABLES = ['contacts', 'consultants', 'missions', 'accounts'] as const

const quotedValues = (list: string): string[] => [...list.matchAll(/'([^']*)'/g)].map(match => match[1] ?? '')

/** `table.colonne` → valeurs permises ; le dernier CHECK posé gagne (ordre des migrations), `down()` ignoré. */
function parseCheckEnumerations(sources: ReadonlyArray<{ file: string; text: string }>): Map<string, Set<string>> {
  const allowed = new Map<string, Set<string>>()
  const patterns = [
    /CHECK\s*\(\s*(\w+)\s+IN\s*\(([^)]*)\)\s*\)/g,
    /CHECK\s*\(\s*(\w+)\s*=\s*ANY\s*\(\s*ARRAY\s*\[([^\]]*)\]/g,
  ]
  for (const { text } of sources) {
    const up = text.split(/public\s+async\s+down\b/)[0] ?? ''
    const found: Array<{ index: number; table: string; column: string; values: string[] }> = []
    for (const pattern of patterns)
      for (const match of up.matchAll(pattern)) {
        const index = match.index ?? 0
        const list = match[2] ?? ''
        if (list.includes('${')) continue // liste interpolée : une migration ultérieure la redéfinit en littéral
        const tables = [
          ...up.slice(0, index).matchAll(/(?:ALTER TABLE|CREATE TABLE)(?: IF (?:NOT )?EXISTS)?(?: ONLY)?\s+(\w+)/gi),
        ]
        const table = tables[tables.length - 1]?.[1]
        if (table) found.push({ index, table, column: match[1] ?? '', values: quotedValues(list) })
      }
    for (const f of found.sort((a, b) => a.index - b.index)) allowed.set(`${f.table}.${f.column}`, new Set(f.values))
  }
  return allowed
}

const migrationSources = readdirSync(MIGRATIONS)
  .filter(file => file.endsWith('.ts'))
  .sort()
  .map(file => ({ file, text: readFileSync(join(MIGRATIONS, file), 'utf8') }))
const ALLOWED = parseCheckEnumerations(migrationSources)

/** Les lignes qui violent une énumération : « table.colonne = valeur (permises) ». */
function violations(table: string, rows: readonly Row[], enumerations: Map<string, Set<string>> = ALLOWED): string[] {
  const out = new Set<string>()
  for (const [key, permitted] of enumerations) {
    const [t, column] = key.split('.')
    if (t !== table || !column) continue
    for (const row of rows) {
      const value = row[column]
      if (typeof value !== 'string') continue // NULL passe un CHECK ; seules les chaînes se comparent
      if (!permitted.has(value)) out.add(`${key} = « ${value} » (permis : ${[...permitted].join(', ')})`)
    }
  }
  return [...out]
}

const seededContacts = (): Row[] => [
  ...DEMO_DOSSIERS.flatMap(d => d.contacts),
  ...DEMO_EXTENSION_ACCOUNTS.flatMap(a => a.contacts),
  ...DEMO_UNQUALIFIED_CONTACTS,
  DEMO_ICEBREAKER_INSUFFICIENT_CONTEXT_CONTACT,
  ...BPCE_SEED.contacts,
  ...Object.values(COMMERCIAL_BRIEF_BY_COMPANY).flatMap(brief => briefContactSeeds(brief, new Set())),
]

describe('démo — CHECK des migrations contre le jeu semé (I32)', () => {
  it('le parseur lit réellement les CHECK des tables semées', () => {
    expect([...(ALLOWED.get('contacts.decision_role') ?? [])]).toEqual(
      expect.arrayContaining(['technical', 'economic', 'procurement', 'unknown']),
    )
    expect(ALLOWED.get('contacts.decision_role')?.has('decision_maker')).toBe(false)
    for (const key of [
      'consultants.seniority',
      'consultants.availability',
      'missions.status',
      'missions.contract_kind',
      'accounts.status',
    ])
      expect(ALLOWED.get(key)?.size ?? 0).toBeGreaterThan(0)
    expect(ENUMERATED_TABLES.every(table => [...ALLOWED.keys()].some(key => key.startsWith(`${table}.`)))).toBe(true)
  })

  it('sait dire NON : un coupable factice est attrapé, une valeur permise passe', () => {
    expect(violations('contacts', [{ decision_role: 'decision_maker' }])).toEqual([
      expect.stringContaining('contacts.decision_role = « decision_maker »'),
    ])
    expect(violations('contacts', [{ decision_role: 'economic' }, { decision_role: null }])).toEqual([])
    expect(violations('consultants', [{ seniority: 'guru' }])).toHaveLength(1)
    const fake = parseCheckEnumerations([
      { file: 'a', text: "ALTER TABLE contacts ADD CONSTRAINT c CHECK (decision_role IN ('x'))" },
      { file: 'b', text: "ALTER TABLE contacts ADD CONSTRAINT c CHECK (decision_role = ANY (ARRAY['y','z']))" },
    ])
    expect([...(fake.get('contacts.decision_role') ?? [])]).toEqual(['y', 'z'])
  })

  it('aucun contact semé (dossiers, extension, briefs clients, BPCE, à qualifier) ne viole un CHECK', () => {
    const rows = seededContacts()
    expect(rows.length).toBeGreaterThan(100)
    expect(violations('contacts', rows)).toEqual([])
  })

  it('aucun consultant semé ne viole un CHECK', () => {
    expect(violations('consultants', DEMO_CONSULTANTS as unknown as Row[])).toEqual([])
  })

  it('aucune mission semée ne viole un CHECK', () => {
    const missions = DEMO_DELIVERY_CLIENT.missions as unknown as Row[]
    expect(missions.length).toBeGreaterThan(0)
    expect(violations('missions', missions)).toEqual([])
  })

  it('aucun compte semé ne viole un CHECK', () => {
    const accounts = [...DEMO_DOSSIERS.map(d => d.account), ...DEMO_EXTENSION_ACCOUNTS] as unknown as Row[]
    expect(violations('accounts', accounts)).toEqual([])
    expect(violations('projects', [])).toEqual([])
  })
})
