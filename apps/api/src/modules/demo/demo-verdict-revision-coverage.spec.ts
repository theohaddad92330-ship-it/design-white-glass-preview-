import { DEMO_ANALYSED_ACCOUNTS, DEMO_ANALYSIS_RUNS, DEMO_DOSSIERS, DEMO_VERIFICATION_RUNS } from './demo-dataset'
import { DEMO_INTENTIONALLY_EMPTY, DEMO_SEEDED_TABLES } from './demo-coverage'

/**
 * #3235 (#3212.4/.6, recette démo 05/10) — « aucun libellé révision / Runs sur la fiche SG ».
 *
 * L'appelant écran existe (`AccountRunsContainer`, monté par `TabOverview` ; API
 * `GET /accounts/:id/verdict-revision`), mais `explainVerdictChange` rend `null`
 * sous deux runs TERMINÉS de verdicts différents : la salle n'en portait aucun.
 * Cette garde lit le jeu RÉEL et sait dire NON : deux runs de même verdict, ou
 * un compte absent des dossiers, la font rougir.
 */
describe('#3235 — une révision de verdict est jouable en démonstration (Société Générale)', () => {
  const sgRuns = DEMO_ANALYSIS_RUNS.filter(run => run.company === 'Société Générale')

  it('Société Générale porte deux runs terminés dont le verdict a changé', () => {
    expect(sgRuns.length).toBeGreaterThanOrEqual(2)
    const ordered = [...sgRuns].sort((a, b) => b.daysAgo - a.daysAgo)
    const [previous, latest] = [ordered[ordered.length - 2], ordered[ordered.length - 1]]
    expect(previous?.verdict_snapshot.verdict).not.toBe(latest?.verdict_snapshot.verdict)
  })

  it('le dernier verdict est celui que le dossier affiche (jamais un second jugement)', () => {
    const sg = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'Société Générale')
    const latest = [...sgRuns].sort((a, b) => a.daysAgo - b.daysAgo)[0]
    expect(sg).toBeDefined()
    expect(String(sg?.account.priority_justification)).toContain(latest?.verdict_snapshot.verdict ?? '§')
  })

  it('tous les runs portent un compte réel des dossiers', () => {
    const names = new Set([
      ...DEMO_DOSSIERS.map(dossier => dossier.account.company_name),
      ...DEMO_ANALYSED_ACCOUNTS.map(account => account.company_name),
    ])
    for (const run of DEMO_ANALYSIS_RUNS) expect(names.has(run.company)).toBe(true)
  })

  // G.7 (recette R4 18/10) — 4180.2 « Même verdict depuis » absent sur la fiche EDF : `compareLastRuns` rend
  // `unchanged` quand deux runs terminés portent le MÊME verdict.
  it('G.7 — EDF porte deux runs terminés de MÊME verdict : « Même verdict depuis » se lit en salle', () => {
    const edf = [...DEMO_ANALYSIS_RUNS.filter(run => run.company === 'EDF')].sort((a, b) => b.daysAgo - a.daysAgo)
    expect(edf.length).toBeGreaterThanOrEqual(2)
    expect(new Set(edf.map(run => run.verdict_snapshot.verdict)).size).toBe(1)
    // …et sait dire NON : Société Générale, elle, a CHANGÉ de verdict (les deux cas se voient en salle).
    const sg = DEMO_ANALYSIS_RUNS.filter(run => run.company === 'Société Générale')
    expect(new Set(sg.map(run => run.verdict_snapshot.verdict)).size).toBeGreaterThan(1)
  })

  it('analysis_runs est classée seedée, plus « vide à dessein »', () => {
    expect(DEMO_SEEDED_TABLES).toContain('analysis_runs')
    expect(DEMO_INTENTIONALLY_EMPTY).not.toHaveProperty('analysis_runs')
  })
})

// #3682 (recette démo 10/10) — « Dernière vérification » absent sur SNCF démo : la ligne lit le
// dernier `analysis_runs.completed_at` du compte. Les comptes des briefs démo portent un run
// terminé récent, SANS verdict inventé (`verdict_snapshot` NULL = jamais un verdict deviné).
describe('#3682 — « Dernière vérification » existe en démonstration', () => {
  it.each(['SNCF', 'Groupe BPCE'])('%s porte un run terminé récent, sans verdict inventé', company => {
    const runs = DEMO_VERIFICATION_RUNS.filter(run => run.company === company)
    expect(runs.length).toBeGreaterThanOrEqual(1)
    expect(Math.min(...runs.map(run => run.daysAgo))).toBeLessThanOrEqual(7)
    const names = new Set(DEMO_DOSSIERS.map(dossier => dossier.account.company_name))
    expect(names.has(company)).toBe(true)
  })
})
