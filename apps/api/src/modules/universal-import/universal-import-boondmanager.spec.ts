import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { proposeUniversalMapping } from '@bellum/contracts'
import { readUniversalRecords, type UniversalRecordEvent } from './universal-import-parser'
import { planUniversalChunk, type UniversalPlanContext, type UniversalValidatedRow } from './universal-import-planner'

// MEYER-IMPORT M.1 — un export BoondManager (contacts, `;`, UTF-8 avec BOM), fixture SYNTHÉTIQUE de même forme :
// 20 lignes inventées. La cause mesurée : les en-têtes « Société - Nom », « Email 1 », « Référence interne »…
// ne tombaient dans aucun alias, la société restait non mappée et chaque ligne partait en `unknown_company`.
const FIXTURE = join(__dirname, '__fixtures__', 'boondmanager-contacts-synthetic.csv')

async function load(): Promise<{ headers: string[]; rows: UniversalValidatedRow[] }> {
  const bytes = readFileSync(FIXTURE)
  // Trois parts : la frontière tombe au milieu d'un caractère accentué et du BOM.
  async function* parts() {
    yield bytes.subarray(0, 2)
    yield bytes.subarray(2, 700)
    yield bytes.subarray(700)
  }
  let headers: string[] = []
  const rows: UniversalValidatedRow[] = []
  for await (const event of readUniversalRecords(parts(), 'csv') as AsyncIterable<UniversalRecordEvent>) {
    if (event.kind === 'headers') headers = event.headers
    else if (event.kind === 'row') rows.push({ line: event.line, record: event.record })
  }
  return { headers, rows }
}

function context(mapping: UniversalPlanContext['mapping'], carry?: UniversalPlanContext): UniversalPlanContext {
  return {
    type: 'contact',
    workspaceId: 'ws-1',
    userId: 'user-1',
    mapping,
    accountId: null,
    accountByName: carry?.accountByName ?? new Map(),
    known: carry?.known ?? new Map(),
    source: { provider: 'csv', namespace: 'boondmanager' },
    writesRefs: true,
    canCreateAccounts: true,
    accountByRef: carry?.accountByRef ?? new Map(),
    refByAccount: carry?.refByAccount ?? new Map(),
    contactByRef: carry?.contactByRef ?? new Map(),
    createdIds: new Set(),
  }
}

describe('MEYER-IMPORT M.1 — export BoondManager de contacts', () => {
  it('le BOM ne casse pas la 1re colonne', async () => {
    const { headers } = await load()
    expect(headers[0]).toBe('Référence interne')
    expect(headers).toHaveLength(36)
  })

  it('les en-têtes BoondManager sont reconnus (société, e-mail, téléphone, références, prénom/nom)', async () => {
    const { headers } = await load()
    const mapping = proposeUniversalMapping(headers, 'contact')
    expect(mapping).toMatchObject({
      'Référence interne': 'source_ref',
      Nom: 'last_name',
      Prénom: 'first_name',
      Fonction: 'title',
      'Société - Nom': 'company',
      'Société - Secteur': 'company_sector',
      'Société - Ville': 'company_city',
      'Société - État': 'company_status',
      'Société - Effectif': 'company_employees',
      'Société - Référence interne': 'company_ref',
      'Email 1': 'email',
      'Téléphone 1': 'phone',
    })
    // La ville du CONTACT n'est pas la ville de la société.
    expect(mapping['Ville']).toBeNull()
  })

  it('18 contacts avec nom + société sont créés — avec ou sans e-mail/téléphone — et 2 rejets nommés', async () => {
    const { headers, rows } = await load()
    const plan = planUniversalChunk(context(proposeUniversalMapping(headers, 'contact')), rows)
    expect(plan.creates).toHaveLength(18)
    expect(plan.accountCreates).toHaveLength(9)
    const rejected = plan.issues.filter(issue => issue.kind === 'rejected')
    expect(rejected).toHaveLength(2)
    expect(new Set(rejected.map(issue => issue.reason))).toEqual(new Set(['missing_required_field']))
    // Un contact sans e-mail ni téléphone s'importe, prêt à compléter.
    const sans = plan.creates.find(create => create.values['full_name'] === 'Prenom04 Fictif04')
    expect(sans?.values).toMatchObject({ email: null, source: 'import' })
  })

  it('« Société - Effectif » = 0 est NON MESURÉ : jamais « 0 salarié »', async () => {
    const { headers, rows } = await load()
    const plan = planUniversalChunk(context(proposeUniversalMapping(headers, 'contact')), rows)
    const employees = plan.accountCreates.map(account => account.values['employees'])
    expect(employees).not.toContain('0')
    expect(employees).toContain('120')
    expect(employees).toContain(null)
  })

  // M.3 — réimporter le MÊME fichier : rien de nouveau, tout rapproché.
  it('M.3 — deux imports successifs = même nombre de comptes et de contacts, le 2ᵉ rapproche', async () => {
    const { headers, rows } = await load()
    const mapping = proposeUniversalMapping(headers, 'contact')
    const first = context(mapping)
    const one = planUniversalChunk(first, rows)
    const second = planUniversalChunk(context(mapping, first), rows)
    expect(one.creates).toHaveLength(18)
    expect(second.creates).toHaveLength(0)
    expect(second.accountCreates).toHaveLength(0)
    expect(second.matched['contact']).toBe(18)
    expect(second.issues.filter(issue => issue.reason === 'duplicate')).toEqual([])
  })
})
