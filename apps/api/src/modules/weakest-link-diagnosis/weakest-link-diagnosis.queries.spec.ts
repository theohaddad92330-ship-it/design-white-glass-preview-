import { FindOperator } from 'typeorm'
import type { AccountEntity } from '../../database/entities/account.entity'
import { createMockRepository } from '../../database/test-utils'
import { WeakestLinkDiagnosisService } from './weakest-link-diagnosis.service'

/**
 * GARDE PERF (29/09/2026, mesuré en prod : `GET /weakest-link-diagnosis` 3,9 s).
 *
 * Causes : `find` SANS `select` sur `accounts` (lignes portant `raw_analysis`),
 * `projects`, `consultants` ; lectures indépendantes en série ; une écriture
 * d'historique ATTENDUE sur chaque lecture. La garde compte les appels de
 * repository : le nombre ne dépend pas du nombre de comptes (pas de N+1), il a
 * un plafond chiffré, et chaque `find` est projeté.
 */
const WORKSPACE = 'ws-1'
/** 1 compte + 2 (actions, sponsors) + projets + consultants + historique + missions actives (#3294, marge —
 *  une lecture CONSTANTE : « 3 puis 30 comptes : le même nombre » ci-dessous garde la propriété qui compte). */
const MAX_FINDS = 7

function build(accountCount: number) {
  const accounts = createMockRepository<AccountEntity>()
  const contacts = createMockRepository<never>()
  const items = createMockRepository<never>()
  const projects = createMockRepository<never>()
  const consultants = createMockRepository<never>()
  const diagnoses = createMockRepository<never>()
  const missions = createMockRepository<never>()
  accounts.find.mockResolvedValue(
    Array.from({ length: accountCount }, (_, i) => ({ id: `acc-${i}`, company_name: `Compte ${i}` })),
  )
  for (const repo of [contacts, items, projects, consultants, diagnoses, missions]) repo.find.mockResolvedValue([])
  const service = new WeakestLinkDiagnosisService(
    accounts as never,
    contacts as never,
    items as never,
    projects as never,
    consultants as never,
    diagnoses as never,
    missions as never,
  )
  const repos = { accounts, contacts, items, projects, consultants, diagnoses, missions }
  const finds = () => Object.values(repos).reduce((sum, repo) => sum + repo.find.mock.calls.length, 0)
  return { service, repos, finds }
}

describe('WeakestLinkDiagnosisService — budget de requêtes', () => {
  it.each([3, 30])('%i comptes : plafond de requêtes respecté, jamais une par compte', async count => {
    const { service, finds } = build(count)
    await service.diagnoseFor(WORKSPACE)
    expect(finds()).toBeLessThanOrEqual(MAX_FINDS)
  })

  it('3 puis 30 comptes : le MÊME nombre de requêtes', async () => {
    const small = build(3)
    await small.service.diagnoseFor(WORKSPACE)
    const large = build(30)
    await large.service.diagnoseFor(WORKSPACE)
    expect(large.finds()).toBe(small.finds())
  })

  it('chaque lecture est PROJETÉE (aucune ligne entière, raw_analysis compris)', async () => {
    const { service, repos } = build(3)
    await service.diagnoseFor(WORKSPACE)
    for (const [name, repo] of Object.entries(repos)) {
      for (const [options] of repo.find.mock.calls as Array<[{ select?: unknown; take?: number }]>) {
        if (name === 'diagnoses') expect(options.take).toBe(1)
        else expect(options.select).toBeDefined()
      }
    }
  })

  it('une seconde lecture dans la minute ne relit rien (même espace) mais un autre espace relit', async () => {
    const { service, finds } = build(3)
    await service.diagnoseFor(WORKSPACE)
    const afterFirst = finds()
    await service.diagnoseFor(WORKSPACE)
    expect(finds()).toBe(afterFirst)
    await service.diagnoseFor('ws-2')
    expect(finds()).toBe(afterFirst * 2)
  })

  it("l'écriture d'historique ne retarde pas la réponse et son échec ne la fait pas échouer", async () => {
    const { service, repos } = build(3)
    repos.diagnoses.save.mockReturnValue(new Promise(() => undefined))
    await expect(service.diagnoseFor(WORKSPACE)).resolves.toBeDefined()
    const failing = build(3)
    failing.repos.diagnoses.save.mockRejectedValue(new Error('base indisponible'))
    await expect(failing.service.diagnoseFor(WORKSPACE)).resolves.toBeDefined()
  })

  // #4009.1 — recette prod 11/10 : « ALTRAN TECHNOLOGIES : aucune prochaine action, aucun sponsor » sortait
  // encore dans la carte « Le maillon faible » du brief, alors que la fiche est supprimée. #4010 n'avait
  // borné que `briefing.service.ts` ; ce service lit `accounts` lui-même. Le faux `find` APPLIQUE le `where`.
  it('ne cite jamais un compte supprimé ou archivé dans le diagnostic (#4009.1)', async () => {
    const { service, repos } = build(0)
    const table = [
      {
        id: 'a-live',
        company_name: 'ACME',
        status: 'completed',
        commercial_status: 'watching',
        workspace_id: WORKSPACE,
      },
      {
        id: 'a-del',
        company_name: 'ALTRAN TECHNOLOGIES',
        status: 'deleted',
        commercial_status: 'watching',
        workspace_id: WORKSPACE,
      },
      {
        id: 'a-arc',
        company_name: 'DOUBLON SA',
        status: 'archived',
        commercial_status: 'watching',
        workspace_id: WORKSPACE,
      },
    ]
    const inValues = (op: unknown): unknown[] => (op as { value: unknown[] }).value
    repos.accounts.find.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      table.filter(row =>
        Object.entries(where).every(([key, expected]) => {
          const actual = (row as Record<string, unknown>)[key]
          if (expected instanceof FindOperator) {
            if (expected.type === 'in') return inValues(expected).includes(actual)
            if (expected.type === 'not') {
              const value = expected.value
              return Array.isArray(value) ? !value.includes(actual) : actual !== value
            }
            throw new Error(`opérateur ${expected.type} non simulé`)
          }
          return actual === expected
        }),
      ),
    )

    const diagnosis = await service.diagnoseFor(WORKSPACE)

    expect(JSON.stringify(diagnosis)).toContain('ACME')
    expect(JSON.stringify(diagnosis)).not.toContain('ALTRAN')
    expect(JSON.stringify(diagnosis)).not.toContain('DOUBLON')
  })
})
