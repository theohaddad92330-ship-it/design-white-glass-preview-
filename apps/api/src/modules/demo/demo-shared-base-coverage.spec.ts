import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EntityManager } from 'typeorm'
import {
  actionOutcomeCells,
  caseOutcomeCells,
  marketPatternCells,
  messageLearningCells,
  signalDealCells,
} from '../shared-base/shared-base-cells'
import { upsertSharedCompanyPeople } from '../shared-base/shared-company-facts-writes'
import { DEMO_SHARED_BASE_COVERAGE } from './demo-coverage'
import {
  DEMO_DOSSIERS,
  DEMO_SHARED_BASE_ACTION_OUTCOMES,
  DEMO_SHARED_BASE_CASE_OUTCOMES,
  DEMO_SHARED_BASE_COMPANY_ROLES,
  DEMO_SHARED_BASE_MARKET_PATTERNS,
  DEMO_SHARED_BASE_MESSAGE_LEARNING,
  DEMO_SHARED_BASE_SIGNAL_DEALS,
} from './demo-dataset'
import { regionKeyOfAddress, sectorKeyOfNaf, sizeBandOfEmployees, toMarketPatternLine } from '@bellum/contracts'

/**
 * P05.a (#3246, lot 09/10) — la base anonyme commune EN DÉMONSTRATION (craft
 * rule 9). Le semis passe par la même mutualisation que le réel ; la réponse
 * scriptée de Laura ne cite que ce que le seuil laisse passer.
 */
const SCRIPT = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'web', 'src', 'features', 'demo', 'demo-chat-script.ts'),
  'utf8',
)

function demoCells() {
  return actionOutcomeCells(
    DEMO_SHARED_BASE_ACTION_OUTCOMES.flatMap(row => [
      {
        workspaceId: row.workspaceId,
        value: row.value,
        nafCode: null,
        employees: null,
        outcome: 'meeting_booked',
        count: row.positive,
      },
      {
        workspaceId: row.workspaceId,
        value: row.value,
        nafCode: null,
        employees: null,
        outcome: 'no_response',
        count: row.negative,
      },
    ]),
  )
}

describe('P05.a — la base anonyme commune, seedée en salle', () => {
  it('est classée SEEDÉE', () => {
    expect(DEMO_SHARED_BASE_COVERAGE.state).toBe('seede')
  })

  it('les espaces de la salle sont FICTIFS — jamais un identifiant d’espace réel', () => {
    for (const row of DEMO_SHARED_BASE_ACTION_OUTCOMES) expect(row.workspaceId).toMatch(/^demo-esn-[a-z]$/)
  })

  it('ressortent relance (4 espaces, 10 sur 18) et preuve_sociale (3 espaces, 8 sur 12)', () => {
    expect(demoCells()).toEqual([
      { value: 'relance', sectorKey: 'all', sizeBand: 'all', positive: 10, judged: 18, contributingWorkspaces: 4 },
      {
        value: 'preuve_sociale',
        sectorKey: 'all',
        sizeBand: 'all',
        positive: 8,
        judged: 12,
        contributingWorkspaces: 3,
      },
    ])
  })

  it('sait dire NON — `initial`, porté par deux espaces, ne sort pas', () => {
    expect(demoCells().some(cell => cell.value === 'initial')).toBe(false)
  })

  it('la réponse scriptée de Laura cite EXACTEMENT ces comptes, et dit ce qui reste sous le seuil', () => {
    expect(SCRIPT).toContain("id: 'p-shared-base-elsewhere'")
    expect(SCRIPT).toContain('10 issues positives sur 18')
    expect(SCRIPT).toContain('8 sur 12')
    expect(SCRIPT).toContain('pas assez de données communes')
  })

  it('P05.b — les cas des espaces fictifs sortent au profil de Société Générale, et la réponse scriptée les cite', () => {
    const cells = caseOutcomeCells(
      DEMO_SHARED_BASE_CASE_OUTCOMES.flatMap(row => [
        { ...row, outcome: 'won' as const, count: row.won },
        { ...row, outcome: 'lost' as const, count: row.lost },
      ]),
    )
    expect(cells.filter(cell => ['naf_64', 'ge', 'groupe'].includes(cell.value))).toEqual([
      { dimension: 'sector', value: 'naf_64', won: 5, lost: 4, contributingWorkspaces: 4 },
      { dimension: 'size', value: 'ge', won: 4, lost: 3, contributingWorkspaces: 3 },
      { dimension: 'group_role', value: 'groupe', won: 4, lost: 3, contributingWorkspaces: 3 },
    ])
    // Le profil cité est bien celui du dossier seedé — jamais un profil supposé.
    const sg = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'Société Générale')?.account
    expect(sectorKeyOfNaf(sg?.naf_code)).toBe('naf_64')
    expect(sizeBandOfEmployees(sg?.employees)).toBe('ge')
    expect(sg?.group_role).toBe('groupe')
    expect(SCRIPT).toContain("id: 'p-shared-base-cases'")
    expect(SCRIPT).toContain('5 gagnés, 4 perdus, sur 4 espaces')
    expect(SCRIPT).toContain('4 gagnés, 3 perdus, sur 3 espaces')
  })

  it('P05.c — budget sort sur 4 espaces (4 sur 11), nomination reste sous le seuil, la réponse scriptée le dit', () => {
    expect(signalDealCells(DEMO_SHARED_BASE_SIGNAL_DEALS.map(row => ({ ...row, nafCode: null })))).toEqual([
      { signalType: 'budget', sectorKey: 'all', signals: 11, followedByDeal: 4, contributingWorkspaces: 4 },
    ])
    expect(SCRIPT).toContain("id: 'p-shared-base-signals'")
    expect(SCRIPT).toContain('4 signaux budget sur 11')
  })

  it('#3989 — les rôles apportés par un utilisateur fictif sortent ANONYMISÉS, et la réponse scriptée cite les rôles', async () => {
    const written: unknown[][] = []
    const manager = {
      query: jest.fn(async (_sql: string, params: unknown[] = []) => {
        written.push(params)
        return []
      }),
    } as unknown as Pick<EntityManager, 'query'>
    const count = await upsertSharedCompanyPeople(
      manager,
      'demo',
      'siren_552120222',
      DEMO_SHARED_BASE_COMPANY_ROLES.map(row => ({ ...row, linkedinUrl: null, apolloId: null })),
      new Set(),
    )
    expect(count).toBe(2)
    expect(written.map(params => [params[0], params[2], params[4], params[5]])).toEqual([
      ['demo', 'user', null, 'Responsable achats IT'],
      ['demo', 'user', null, 'Directeur de la transformation digitale'],
    ])
    // Le SIREN est bien celui du dossier seedé — jamais une société supposée.
    const sg = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'Société Générale')?.account
    expect(sg?.siren).toBe('552120222')
    // Les noms fictifs ne sortent JAMAIS de la frontière, et Laura ne les cite pas.
    for (const { fullName } of DEMO_SHARED_BASE_COMPANY_ROLES) {
      expect(JSON.stringify(written)).not.toContain(fullName)
      expect(SCRIPT).not.toContain(fullName)
    }
    expect(SCRIPT).toContain("id: 'p-shared-base-roles'")
    expect(SCRIPT).toContain('Responsable achats IT')
    expect(SCRIPT).toContain('Directeur de la transformation digitale')
  })

  it('#2877 GLOBAL — l’apprentissage des messages des espaces fictifs sort au seuil ; wrong_cta (2 espaces) non', () => {
    expect(messageLearningCells(DEMO_SHARED_BASE_MESSAGE_LEARNING)).toEqual([
      { signal: 'approved_after_edit', count: 10, contributingWorkspaces: 4 },
      { signal: 'approved_without_edit', count: 6, contributingWorkspaces: 3 },
      { signal: 'wrong_fact', count: 7, contributingWorkspaces: 3 },
    ])
  })

  // #4286.15.c (Louis 22/10/2026, craft rule 9) — `market_pattern` en salle : les MÊMES espaces fictifs,
  // la MÊME mutualisation que le réel, au profil de Société Générale ; la réponse scriptée cite le seuil.
  it('#4286.15.c — les tendances de marché sortent au profil de Société Générale ; securite (2 espaces) non', () => {
    const cells = marketPatternCells(DEMO_SHARED_BASE_MARKET_PATTERNS)
    const sg = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'Société Générale')?.account
    const segment = {
      sectorKey: sectorKeyOfNaf(sg?.naf_code),
      sizeBand: sizeBandOfEmployees(sg?.employees),
      regionKey: regionKeyOfAddress(sg?.headquarters),
    }
    expect(segment).toEqual({ sectorKey: 'naf_64', sizeBand: 'ge', regionKey: 'ile_de_france' })
    expect(cells).toContainEqual({ topic: 'data', ...segment, observations: 5, contributingWorkspaces: 4 })
    expect(cells).toContainEqual({
      topic: 'cloud',
      sectorKey: 'naf_64',
      sizeBand: 'ge',
      regionKey: 'all',
      observations: 3,
      contributingWorkspaces: 3,
    })
    expect(cells.some(cell => cell.topic === 'securite')).toBe(false)
    for (const cell of cells) expect(toMarketPatternLine(cell)).not.toBeNull()
    expect(DEMO_SHARED_BASE_MARKET_PATTERNS.every(row => row.workspaceId.startsWith('demo-esn-'))).toBe(true)
    expect(SCRIPT).toContain("id: 'p-shared-base-market-patterns'")
    expect(SCRIPT).toContain('observé dans 4 espaces')
    expect(SCRIPT).toContain('observé dans 3 espaces')
  })
})
