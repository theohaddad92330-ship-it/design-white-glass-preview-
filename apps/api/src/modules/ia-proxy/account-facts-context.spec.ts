import { supplierNamesIn, type AccountFact } from '@bellum/contracts'
import { accountFactAgePhrase } from '@bellum/contracts'
import { accountFactsContextFor } from './account-facts-context'
import { AccountFactsService } from '../account-facts/account-facts.service'

const f = (over: Partial<AccountFact>): AccountFact => ({
  date: '2025-08-12',
  kind: 'need',
  label: 'Migration paie cloud',
  weight: 0.5,
  ageDays: 426,
  ...over,
})

describe('#4071.1/.2 — les faits du compte dans le contexte de Laura', () => {
  it('dit l’âge en mots : jours, mois (« il y a 14 mois »), puis années', () => {
    expect(accountFactAgePhrase(0)).toBe("aujourd'hui")
    expect(accountFactAgePhrase(1)).toBe('il y a 1 jour')
    expect(accountFactAgePhrase(12)).toBe('il y a 12 jours')
    expect(accountFactAgePhrase(45)).toBe('il y a 1 mois')
    expect(accountFactAgePhrase(426)).toBe('il y a 14 mois')
    expect(accountFactAgePhrase(800)).toBe('il y a 2 ans')
    expect(accountFactAgePhrase(3700)).toBe('il y a 10 ans')
  })

  it('rend chaque fait daté, par sa nature, dans l’ordre reçu (les plus pertinents d’abord)', () => {
    const text = accountFactsContextFor([
      f({ kind: 'deal_lost', label: 'TMA SI RH', date: '2024-06-01', ageDays: 863 }),
      f({}),
    ])
    expect(text).not.toBeNull()
    const lines = (text ?? '').split('\n').filter(l => l.startsWith('- '))
    expect(lines).toEqual([
      '- [2024-06-01 · il y a 2 ans] Affaire perdue : TMA SI RH',
      '- [2025-08-12 · il y a 14 mois] Besoin : Migration paie cloud',
    ])
  })

  it('NON — n’annonce ni poids, ni probabilité, ni provenance', () => {
    const text =
      accountFactsContextFor([
        f({ weight: 0.73 }),
        f({ kind: 'market_observation', label: 'prestataires observés : Alpha' }),
      ]) ?? ''
    expect(text).not.toContain('0.73')
    expect(text).not.toMatch(/%|probabilit/i)
    expect(text).not.toMatch(/mémoire marché|market memory|dataforge|source\s*:/i)
    expect(supplierNamesIn(text)).toEqual([])
  })

  it('est BORNÉ : au plus 30 faits, et le reste se dit sans se compter en zéro', () => {
    const many = Array.from({ length: 45 }, (_, i) => f({ label: `Fait ${i}`, date: '2026-01-01', ageDays: 284 }))
    const text = accountFactsContextFor(many) ?? ''
    expect(text.split('\n').filter(l => l.startsWith('- '))).toHaveLength(30)
    expect(text).toContain('15 faits plus anciens ou moins pertinents')
  })

  it('le même fait lu deux fois le même jour ne fait qu’une ligne', () => {
    const text = accountFactsContextFor([f({}), f({ weight: 0.4 })]) ?? ''
    expect(text.split('\n').filter(l => l.startsWith('- '))).toHaveLength(1)
  })

  it('aucun fait → null : aucun bloc, prompt inchangé', () => {
    expect(accountFactsContextFor([])).toBeNull()
  })
})

describe('W-G (13/10) — une affaire perdue NATIVE et un signal récent arrivent dans le contexte, avec leur âge', () => {
  const ACCOUNT = '33333333-3333-4333-8333-333333333333'
  const AS_OF = new Date('2026-10-13T08:00:00.000Z')
  const repoWith = (opportunities: unknown[], signals: unknown[]) => {
    const query = jest.fn(async (sql: string) => {
      if (/FROM opportunities\b/.test(sql)) return opportunities
      if (/FROM accounts\b/.test(sql)) return [{ company_name: 'SNCF RESEAU', recent_signals: signals }]
      return []
    })
    return { manager: { query, getRepository: () => ({ find: jest.fn(async () => []) }) } } as never
  }
  const textFor = async (opportunities: unknown[], signals: unknown[]) => {
    const read = await new AccountFactsService(repoWith(opportunities, signals)).forAccount({
      workspaceId: 'w',
      userId: 'u',
      accountId: ACCOUNT,
      asOf: AS_OF,
    })
    return accountFactsContextFor(read?.facts ?? [])
  }

  it('affaire perdue de 4 mois + signal de 2 mois : les DEUX, datés, sans nom de source', async () => {
    const text = await textFor(
      [{ label: 'Refonte SI RH', outcome: 'lost', closed_at: '2026-06-13T00:00:00Z', stage_entered_at: null }],
      [{ signal: 'Nouveau DSI nommé', type: 'nomination', date: '2026-08-13' }],
    )
    expect(text).toContain('Affaire perdue : Refonte SI RH')
    expect(text).toContain('il y a 4 mois')
    expect(text).toContain('Signal : Nouveau DSI nommé')
    expect(text).toContain('il y a 2 mois')
    expect(text).not.toMatch(/opportunities|crm_deal_facts|signal_history/i)
  })

  it('NON — un compte sans aucun fait ne produit AUCUN bloc (jamais un bloc vide)', async () => {
    expect(await textFor([], [])).toBeNull()
  })
  // #4068.7 (18/10) — « Que sais-tu de l'historique de Renault ? » ne citait que des faits < 7 jours : les 30
  // places allaient toutes aux faits récents, l'historique > 90 j était coupé.
  it('garde une place à l’historique de plus de 90 jours quand les faits récents saturent le bloc', () => {
    const recent = Array.from({ length: 40 }, (_, i) =>
      f({ kind: 'signal', label: `Signal récent ${i}`, date: '2026-10-15', ageDays: 3, weight: 0.9 }),
    )
    const old = [
      f({ kind: 'deal_lost', label: 'TMA SI RH', date: '2024-06-01', ageDays: 863, weight: 0.2 }),
      f({ kind: 'mission', label: 'Mission data 2023', date: '2023-03-01', ageDays: 1300, weight: 0.1 }),
    ]
    const text = accountFactsContextFor([...recent, ...old]) ?? ''
    expect(text).toContain('Affaire perdue : TMA SI RH')
    expect(text).toContain('Mission : Mission data 2023')
    expect(text.split('\n').filter(l => l.startsWith('- ')).length).toBeLessThanOrEqual(30)
  })
})
