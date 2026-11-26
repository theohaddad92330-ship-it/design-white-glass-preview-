import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_VERIFICATION_PUBLIC_TENDERS_COVERAGE } from './demo-coverage'

/**
 * #2288.4 (c66) — « et en démonstration, le devis nomme-t-il BOAMP/DECP ? »
 *
 * `DEMO_VERIFICATION_PUBLIC_TENDERS_COVERAGE` répond VIDE À DESSEIN : la démo
 * ne lance aucune collecte. Ce fichier est l'appelant de cette classification,
 * et il LIT les deux endroits qui la rendent vraie, au lieu de la croire :
 *  - `planLaunch` rend `demo` AVANT d'appeler la prévision ;
 *  - le devis coupe la requête au lanceur en démonstration.
 *
 * ⚠️ LE FIL À RETORDRE : le jour où l'un des deux change (une démo qui
 * prévoirait, un devis qui interrogerait le lanceur en démo), ce test rougit
 * pour forcer la re-classification — jamais laisser « vide à dessein »
 * survivre à la raison qui l'a motivé.
 */

const ANALYSIS_SERVICE = join(__dirname, '..', 'analysis', 'analysis.service.ts')
const PLAN_DIALOG = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'web',
  'src',
  'features',
  'consultants',
  'view',
  'reverse-market',
  'VerificationPlanDialog.tsx',
)

function planLaunchBody(source: string): string {
  const start = source.indexOf('async planLaunch(')
  expect(start).toBeGreaterThan(-1)
  const end = source.indexOf('\n  }\n', start)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('couverture démo — BOAMP/DECP sur le devis de vérification (#2288.4)', () => {
  it('`planLaunch` rend « demo » AVANT toute prévision de marchés publics', () => {
    const body = planLaunchBody(readFileSync(ANALYSIS_SERVICE, 'utf8'))
    const demo = body.indexOf("scenario: 'demo'")
    // #2292.17/.18 — `forecastPublicTenders` a été renommée `forecastPublicTendersFor`
    // (elle reçoit désormais `known`, résolu une seule fois par `planLaunch`).
    const forecast = body.indexOf('forecastPublicTendersFor(')
    expect(demo).toBeGreaterThan(-1)
    expect(forecast).toBeGreaterThan(-1)
    expect(demo).toBeLessThan(forecast)
  })

  it('le devis n’interroge pas le lanceur en démonstration', () => {
    const source = readFileSync(PLAN_DIALOG, 'utf8')
    expect(source).toContain('launchPlanQueryOptions')
    expect(source).toContain('enabled: !isDemo')
  })

  it('classe la capacité « vide à dessein », et la raison nomme la cause STRUCTURELLE', () => {
    expect(DEMO_VERIFICATION_PUBLIC_TENDERS_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_VERIFICATION_PUBLIC_TENDERS_COVERAGE.reason).toContain('2288.4')
    expect(DEMO_VERIFICATION_PUBLIC_TENDERS_COVERAGE.reason).toContain("scenario: 'demo'")
    expect(DEMO_VERIFICATION_PUBLIC_TENDERS_COVERAGE.reason.length).toBeGreaterThan(200)
  })
})
