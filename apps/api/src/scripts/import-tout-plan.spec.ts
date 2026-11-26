import { parseImportToutArgs, planImportTout, runImportTout, type ImportToutStep } from './import-tout-plan'

const ORION_FILES: Record<string, string> = {
  '10_COMPTES_MASTER': '/orion/10_COMPTES_MASTER.csv',
  '24_MISSIONS_BESOINS': '/orion/24_MISSIONS_BESOINS.csv',
  '25_PIPELINE_CRM': '/orion/sous/25_PIPELINE_CRM_CREME_DE_LA_CREME.csv',
  '50_CHUNKS_INDEXABLES': '/orion/50_CHUNKS_INDEXABLES.csv',
  '05_freelances': '/v1/data/05_freelances.csv',
}
const findAll = (_dir: string, prefix: string): string | null => ORION_FILES[prefix] ?? null
const quiet = () => undefined

function plan(dryRun = false): ImportToutStep[] {
  const result = planImportTout({ v2: '/v2', v1: '/v1', orion: '/orion', dryRun }, findAll)
  if ('error' in result) throw new Error(result.error)
  return result.steps
}

describe('import-tout — arguments', () => {
  it('trois chemins dans l’ordre (v2, v1, ORION) et --dry-run', () => {
    expect(parseImportToutArgs(['/v2', '/v1', '/orion', '--dry-run'])).toEqual({
      v2: '/v2',
      v1: '/v1',
      orion: '/orion',
      dryRun: true,
    })
    expect(parseImportToutArgs(['/v2', '/v1'])).toEqual({ error: expect.stringContaining('Usage') })
  })
})

describe('import-tout — le plan', () => {
  it('enchaîne v2, parcours v2 (positions), référentiel pivot (lot 793), v1, comptes ORION, besoins 24 puis 25, chunks 50, puis la couverture', () => {
    expect(plan().map(s => [s.name, s.kind === 'script' ? [s.script, ...s.args] : []])).toEqual([
      ['market-v2', ['ingest:market-v2', '/v2']],
      ['market-paths-v2', ['ingest:market-paths-v2']],
      ['common-account-links', ['ingest:common-account-links']],
      ['market-memory (v1)', ['ingest:market-memory', '/v1']],
      ['orion-accounts', ['ingest:orion-accounts', '/orion/10_COMPTES_MASTER.csv']],
      ['orion-needs 24', ['ingest:orion-needs', '24_MISSIONS_BESOINS', '/orion/24_MISSIONS_BESOINS.csv']],
      [
        'orion-needs 25',
        ['ingest:orion-needs', '25_PIPELINE_CRM', '/orion/sous/25_PIPELINE_CRM_CREME_DE_LA_CREME.csv'],
      ],
      ['orion-rag-chunks', ['ingest:orion-rag-chunks', '/orion/50_CHUNKS_INDEXABLES.csv']],
      ['couverture', []],
    ])
  })

  it('--dry-run descend aux importeurs qui le savent', () => {
    const steps = plan(true)
    const v2 = steps[0]
    expect(v2?.kind === 'script' && v2.args).toEqual(['/v2', '--dry-run'])
    const paths = steps[1]
    expect(paths?.name).toBe('market-paths-v2')
    expect(paths?.kind === 'script' && paths.args).toEqual([]) // lit la base : pas lancée à blanc par la chaîne
    const links = steps[2]
    expect(links?.name).toBe('common-account-links')
    expect(links?.kind === 'script' && links.args).toEqual([]) // lit la base, comme la dérivation des parcours
    const v1 = steps[3]
    expect(v1?.kind === 'script' && v1.args).toEqual(['/v1', '--dry-run'])
  })

  it('pack v1 sans 05_freelances.csv : étape v1 SAUTÉE et dite, la chaîne continue', () => {
    const result = planImportTout({ v2: '/v2', v1: '/v1', orion: '/orion', dryRun: false }, (_d, prefix) =>
      prefix === '05_freelances' ? null : (ORION_FILES[prefix] ?? null),
    )
    if ('error' in result) throw new Error(result.error)
    expect(result.steps.map(s => s.name)).toEqual([
      'market-v2',
      'market-paths-v2',
      'common-account-links',
      'orion-accounts',
      'orion-needs 24',
      'orion-needs 25',
      'orion-rag-chunks',
      'couverture',
    ])
    expect(result.notes).toEqual([expect.stringContaining('05_freelances.csv absent')])
  })

  it('un fichier ORION introuvable arrête AVANT la première étape, en le nommant', () => {
    const result = planImportTout({ v2: '/v2', v1: '/v1', orion: '/orion', dryRun: false }, (_d, prefix) =>
      prefix === '24_MISSIONS_BESOINS' ? null : (ORION_FILES[prefix] ?? null),
    )
    expect(result).toEqual({ error: expect.stringContaining('24_MISSIONS_BESOINS') })
  })
})

describe('import-tout — l’exécution', () => {
  it('lance tout dans l’ordre et rend un rapport de volumes par étape', async () => {
    const ran: string[] = []
    const result = await runImportTout(
      plan(),
      false,
      async step => {
        ran.push(step.name)
        return { ok: true, summary: [`${step.name} lues 3`] }
      },
      quiet,
    )
    expect(result.ok).toBe(true)
    expect(ran).toEqual(plan().map(s => s.name))
    expect(result.report.map(r => r.status)).toEqual(plan().map(() => 'ok'))
    expect(result.report[0]?.summary).toEqual(['market-v2 lues 3'])
  })

  it('s’arrête à la PREMIÈRE étape en échec : rien après elle ne part', async () => {
    const ran: string[] = []
    const logs: string[] = []
    const result = await runImportTout(
      plan(),
      false,
      async step => {
        ran.push(step.name)
        return { ok: step.name !== 'orion-accounts', summary: [] }
      },
      line => logs.push(line),
    )
    expect(result.ok).toBe(false)
    expect(ran).toEqual([
      'market-v2',
      'market-paths-v2',
      'common-account-links',
      'market-memory (v1)',
      'orion-accounts',
    ])
    expect(result.report.map(r => r.status)).toEqual([
      'ok',
      'ok',
      'ok',
      'ok',
      'failed',
      'not-run',
      'not-run',
      'not-run',
      'not-run',
    ])
    expect(logs.join('\n')).toContain('ARRÊT à l’étape « orion-accounts »')
  })

  it('à blanc : la dérivation v2, les importeurs ORION (sans mode à blanc) et la couverture ne partent PAS', async () => {
    const ran: string[] = []
    const result = await runImportTout(
      plan(true),
      true,
      async step => {
        ran.push(step.name)
        return { ok: true, summary: [] }
      },
      quiet,
    )
    expect(result.ok).toBe(true)
    expect(ran).toEqual(['market-v2', 'market-memory (v1)'])
    expect(result.report[2]?.status).toBe('dry-run-skipped')
    expect(result.report.slice(4).every(r => r.status === 'dry-run-skipped')).toBe(true)
  })
})
