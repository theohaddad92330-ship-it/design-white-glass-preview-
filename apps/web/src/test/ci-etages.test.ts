import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { declaredJobs } from '../../../../tools/ci/jobs-sans-succes.mjs'
import { FAST_JOB_PREFIXES, redFastJob } from '../../../../tools/ci/stage-gate.mjs'

// Lot ci/1-etages : les ÉTAGES remplacent la coupure globale au premier rouge (un rouge reste `failure`).
const ci = readFileSync(resolve(__dirname, '../../../../.github/workflows/ci.yml'), 'utf8')

/** Texte d'un job, de sa déclaration à la suivante. */
function jobBlock(id: string): string {
  const start = ci.search(new RegExp(`^ {2}${id}:\\s*$`, 'm'))
  expect(start, `job ${id} introuvable`).toBeGreaterThan(-1)
  const rest = ci.slice(start + 1)
  const next = rest.search(/^ {2}[A-Za-z0-9_-]+:\s*$/m)
  return next === -1 ? rest : rest.slice(0, next)
}

describe('redFastJob', () => {
  it('nomme un job rapide en failure', () => {
    expect(redFastJob([{ name: "Contrats d'architecture", conclusion: 'failure' }])).toBe("Contrats d'architecture")
  })
  it('nomme l’étape de types du Build, job encore en cours', () => {
    const jobs = [{ name: 'Build', conclusion: null, steps: [{ name: 'Check types', conclusion: 'failure' }] }]
    expect(redFastJob(jobs)).toBe('Build › Check types')
  })
  it('ne dit pas non pour un job lourd rouge, un rapide vert ou cancelled', () => {
    expect(redFastJob([{ name: 'Test (API) (1)', conclusion: 'failure' }])).toBeNull()
    expect(redFastJob([{ name: "Contrats d'architecture", conclusion: 'success' }])).toBeNull()
    expect(redFastJob([{ name: 'La doc suit le code (agent_docs ↔ sources)', conclusion: 'cancelled' }])).toBeNull()
    expect(redFastJob(undefined)).toBeNull()
  })
})

describe('ci.yml — étages', () => {
  it('chaque préfixe de l’étage rapide désigne un vrai job de ci.yml (la porte ne peut pas être borgne)', () => {
    const names = declaredJobs(ci).map((j: { name: string }) => j.name)
    for (const prefix of FAST_JOB_PREFIXES)
      expect(
        names.some((n: string) => n.startsWith(prefix)),
        prefix,
      ).toBe(true)
  })

  it('plus aucune coupure globale du run (jamais d’appel /cancel)', () => {
    expect(ci).not.toMatch(/actions\/runs\/\$\{\{ github\.run_id \}\}\/cancel/)
    expect(ci).not.toContain('Couper le run au premier rouge')
  })

  it.each(['test', 'test-web', 'test-ia', 'test-demo-db'])(
    'le job lourd %s vérifie l’étage rapide au démarrage',
    id => {
      const block = jobBlock(id)
      expect(block).toContain('node tools/ci/stage-gate.mjs')
      expect(block).toContain("vars.CI_STAGE_GATE != 'false'")
      expect(block).toMatch(/permissions:\s*\n\s+contents: read\s*\n\s+actions: read/)
    },
  )

  it('concurrence : une PR a son groupe par numéro, main un groupe unique ; les deux annulent (03/11/2026)', () => {
    expect(ci).toContain("format('pr-{0}', github.event.pull_request.number)")
    expect(ci).toContain("github.event_name == 'push' && 'main-push'")
    expect(ci).toMatch(
      /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \|\| github\.event_name == 'push' \}\}/,
    )
  })

  it('brouillon : tout job qui tourne sur une PR dépend de `changes` (donc est sauté), sauf CI Status qui le dit en rouge', () => {
    for (const id of ['build', 'test', 'test-web', 'test-ia', 'quick', 'test-demo-db', 'arch', 'doc-suit-le-code']) {
      expect(jobBlock(id), id).toMatch(/^ {4}needs:.*\bchanges\b/m)
    }
    expect(jobBlock('ci-status')).toContain('Brouillon')
  })

  it('dette-formatage : nuit et déclenchement manuel seulement, plus sur chaque push main', () => {
    expect(jobBlock('dette-formatage')).toMatch(
      /if: github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'/,
    )
  })

  it('suite-complete-rouge voit aussi un job lourd annulé dont une étape est en failure', () => {
    const block = jobBlock('suite-complete-rouge')
    expect(block).toContain('cancelled')
    expect(block).toContain('listJobsForWorkflowRun')
  })
})
