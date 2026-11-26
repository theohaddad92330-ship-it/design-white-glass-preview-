import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// #4343 — Pilotage › Pipe compte des étapes d'AFFAIRE ; les étapes candidat
// (retenu, CV envoyé, entretien…) se lisent dans le Vivier, jamais ici.
describe('#4343 — Pilotage › Pipe sans étape candidat', () => {
  it('aucun fichier du Pipe ne lit SUBMISSION_STAGES ni ne monte l’entonnoir des positionnements', () => {
    const dir = __dirname
    const sources = readdirSync(dir).filter(f => /\.tsx?$/.test(f) && !/\.test\./.test(f))
    expect(sources.length).toBeGreaterThan(3)
    for (const file of sources) {
      const text = readFileSync(join(dir, file), 'utf8')
      expect(text, file).not.toMatch(/SUBMISSION_STAGES|PipeMatchingFunnel|SubmissionFunnelSummary\s*\}?\s*from/)
    }
  })
})
