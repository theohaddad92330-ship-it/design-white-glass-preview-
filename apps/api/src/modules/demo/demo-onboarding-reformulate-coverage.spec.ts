import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_ONBOARDING_REFORMULATE_COVERAGE } from './demo-coverage'

/**
 * #2060.9 — la garde qui LIT la classification « vide à dessein » du bouton
 * « Reformuler avec Laura », plutôt que de croire son commentaire sur parole.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER
 * ─────────────────────────────────────────────────────────────────────────────
 * `DEMO_ONBOARDING_REFORMULATE_COVERAGE` (`demo-coverage.ts`) affirme, en
 * commentaire, qu'un visiteur de la salle de démonstration n'atteint jamais
 * `/onboarding/*` — donc jamais le champ de réponse libre ni le bouton — parce
 * que `needsOnboarding` (`apps/web/.../onboarding-gate.ts`) rend `false` dès
 * que `credits.is_demo === true`, **avant tout autre test**. Avant cette
 * garde, rien ne lisait cette constante nulle part : une classification
 * fausse (ou périmée par un futur refactor de `onboarding-gate.ts`) aurait
 * laissé la CI verte — exactement le piège nommé ailleurs dans ce fichier
 * (« preuve de couverture sur un bloc mort »), mais à l'envers : ici, un bloc
 * qu'on affirme mort sans jamais vérifier qu'il l'est encore.
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
 * `true` quand la source de `needsOnboarding` contient le contournement démo
 * (`credits?.is_demo === true`) et qu'il apparaît AVANT le premier autre
 * critère de décision (`status === 'completed'`) — l'ordre qui fait qu'aucun
 * autre test ne peut faire dévier un compte démo vers `/onboarding/*`.
 */
export function demoBypassPrecedesOtherChecks(source: string): boolean {
  const marker = 'export function needsOnboarding('
  const start = source.indexOf(marker)
  if (start === -1) return false
  const isDemoIdx = source.indexOf('credits?.is_demo === true', start)
  const completedIdx = source.indexOf("status === 'completed'", start)
  if (isDemoIdx === -1 || completedIdx === -1) return false
  return isDemoIdx < completedIdx
}

describe('#2060.9 — la démo ne voit jamais « Reformuler avec Laura » vide, sans dossier', () => {
  it('la classification est bien « vide à dessein », avec une raison écrite', () => {
    expect(DEMO_ONBOARDING_REFORMULATE_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_ONBOARDING_REFORMULATE_COVERAGE.reason.length).toBeGreaterThan(0)
  })

  it('la fonction pure dit NON quand le contournement démo est absent', () => {
    const sourceSansContournement = `
      export function needsOnboarding({ status, credits }: OnboardingGateInput): boolean {
        if (status === 'completed') return false
        return true
      }
    `
    expect(demoBypassPrecedesOtherChecks(sourceSansContournement)).toBe(false)
  })

  it('la fonction pure dit NON quand le contournement démo arrive APRÈS un autre critère', () => {
    const sourceMalOrdonnee = `
      export function needsOnboarding({ status, credits }: OnboardingGateInput): boolean {
        if (status === 'completed') return false
        if (credits?.is_demo === true) return false
        return true
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
