import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Lot ci/1-evals (31/10/2026) : sans clé = ROUGE dans `eval-nightly.yml`.
 *
 * promptfoo RETIRÉ de la CI le 31/10/2026 (décision Louis) : rejoué sur chaque PR touchant un
 * prompt, ~2 M de jetons Sonnet par passage, coût non mesuré par `promptfoo-cost.py` (le plafond
 * de 2 $ lisait 0 $), ~290 $ de recharges API en une matinée. Les configs restent dans
 * apps/ia/evals/promptfoo/ ; cette garde empêche le job de revenir sans décision explicite.
 */
const ROOT = join(__dirname, '..', '..', '..', '..')
const CI = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8')
const NIGHTLY = readFileSync(join(ROOT, '.github', 'workflows', 'eval-nightly.yml'), 'utf8')

describe('promptfoo retiré de la CI (Louis, 31/10/2026)', () => {
  it("ci.yml n'a plus de job promptfoo, ni dans CI Status", () => {
    expect(CI).not.toMatch(/\n {2}promptfoo:\n/)
    expect(CI).not.toContain('needs.promptfoo.result')
    expect(CI).not.toContain('promptfoo@')
  })

  it('le rejeu nocturne ne lance plus promptfoo', () => {
    expect(NIGHTLY).not.toContain('promptfoo@')
    expect(NIGHTLY).not.toContain('steps.promptfoo')
  })
})

describe('eval-nightly.yml', () => {
  it('sans clé : rouge explicite', () => {
    expect(NIGHTLY).toContain('secret ANTHROPIC_API_KEY absent : aucune eval rejouée')
    expect(NIGHTLY).toMatch(/-z "\$ANTHROPIC_API_KEY" \][\s\S]*?exit 1/)
  })

  it('banc live plafonné à 10 $', () => {
    expect(NIGHTLY).toContain("EVAL_NIGHTLY_MAX_COST_USD || '10'")
  })

  it('tout job garde un timeout-minutes', () => {
    expect(NIGHTLY).toMatch(/timeout-minutes: \d+/)
  })
})
