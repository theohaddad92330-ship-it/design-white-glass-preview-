import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// #4291.8 — l'APPELANT. Le suivi existait (`WonMissionTracking`) mais le clic ouvrait le contenu générique :
// on lit la page, parce que la monter exige tout l'espace de travail.
const page = readFileSync(join(__dirname, 'ProjectsPage.tsx'), 'utf8')

describe('ProjectsPage — le clic d’un projet gagné (#4291.8)', () => {
  it('un projet gagné ouvre WonMissionDetail', () => {
    expect(page).toMatch(/selected\.stage === 'won'[\s\S]{0,200}<WonMissionDetail/)
  })
  it('NON : une opportunité non gagnée garde ProjectPropertiesContent seul', () => {
    expect(page).toMatch(/<ProjectPropertiesContent project=\{selected\}/)
    expect(page).toMatch(/import \{ WonMissionDetail \}/)
  })
})
