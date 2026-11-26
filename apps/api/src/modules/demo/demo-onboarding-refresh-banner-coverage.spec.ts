import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_ONBOARDING_REFRESH_BANNER_COVERAGE } from './demo-coverage'

/**
 * #2021 — la garde qui LIT la classification « vide à dessein » du bandeau
 * de reprise, plutôt que de croire son commentaire sur parole.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER
 * ─────────────────────────────────────────────────────────────────────────────
 * `DEMO_ONBOARDING_REFRESH_BANNER_COVERAGE` (`demo-coverage.ts`) affirme, en
 * commentaire, que `shouldShowOnboardingRefreshBanner`
 * (`apps/web/.../onboarding-gate.ts`) rend `false` dès que
 * `credits.is_demo === true`, **avant tout autre test** — même patron que
 * `demo-onboarding-reformulate-coverage.spec.ts` (#2060.9) pour
 * `needsOnboarding`. Sans cette garde, rien ne lisait cette constante nulle
 * part : une classification fausse (ou périmée par un futur refactor de
 * `onboarding-gate.ts`) aurait laissé la CI verte.
 *
 * CE QUE CETTE GARDE PROUVE (doctrine « une garde protège une règle, elle ne
 * l'invente pas », `CLAUDE.md`) :
 * 1. Qu'elle LIT quelque chose de réel : `demoBypassPrecedesOtherChecks` lit
 *    `onboarding-gate.ts` sur le disque, jamais une copie de son code collée
 *    ici (GA-26 — deux versions divergent).
 * 2. Qu'elle sait dire NON : la fonction est PURE, testée sur des sources
 *    SYNTHÉTIQUES où le contournement démo est absent, puis où il existe mais
 *    APRÈS un autre test — les deux doivent rougir, sans toucher au vrai
 *    fichier.
 */

/**
 * `true` quand la source de `shouldShowOnboardingRefreshBanner` contient le
 * contournement démo (`credits?.is_demo === true`) et qu'il apparaît AVANT le
 * premier autre critère de décision (`skippedAt`) — l'ordre qui fait qu'aucun
 * autre test ne peut faire apparaître le bandeau pour un compte démo.
 */
export function demoBypassPrecedesOtherChecks(source: string): boolean {
  const marker = 'export function shouldShowOnboardingRefreshBanner('
  const start = source.indexOf(marker)
  if (start === -1) return false
  const isDemoIdx = source.indexOf('credits?.is_demo === true', start)
  const skippedAtIdx = source.indexOf('if (skippedAt) return false', start)
  if (isDemoIdx === -1 || skippedAtIdx === -1) return false
  return isDemoIdx < skippedAtIdx
}

describe('#2021 — la démo ne voit jamais le bandeau « Questionnaire en cours — Reprendre »', () => {
  it('la classification est bien « vide à dessein », avec une raison écrite', () => {
    expect(DEMO_ONBOARDING_REFRESH_BANNER_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_ONBOARDING_REFRESH_BANNER_COVERAGE.reason.length).toBeGreaterThan(0)
  })

  it('la fonction pure dit NON quand le contournement démo est absent', () => {
    const sourceSansContournement = `
      export function shouldShowOnboardingRefreshBanner({ status, skippedAt }: OnboardingGateInput): boolean {
        if (skippedAt) return false
        return status === 'refresh_required'
      }
    `
    expect(demoBypassPrecedesOtherChecks(sourceSansContournement)).toBe(false)
  })

  it('la fonction pure dit NON quand le contournement démo arrive APRÈS un autre critère', () => {
    const sourceMalOrdonnee = `
      export function shouldShowOnboardingRefreshBanner({ status, credits, skippedAt }: OnboardingGateInput): boolean {
        if (skippedAt) return false
        if (credits?.is_demo === true) return false
        return status === 'refresh_required'
      }
    `
    expect(demoBypassPrecedesOtherChecks(sourceMalOrdonnee)).toBe(false)
  })

  it('le vrai `onboarding-gate.ts` tient la promesse : contournement démo AVANT tout autre critère', () => {
    const source = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'web', 'src', 'features', 'onboarding', 'lib', 'onboarding-gate.ts'),
      'utf8',
    )
    expect(demoBypassPrecedesOtherChecks(source)).toBe(true)
  })
})
