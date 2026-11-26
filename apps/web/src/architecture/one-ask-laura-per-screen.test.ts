import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #4194 (épopée #4191, lot L3) — UN seul bouton Laura par écran : celui du
 * panneau latéral (`RecordPanel`). Une carte ou une ligne de liste n'en porte
 * jamais : dix cartes, dix « Demander à Laura », c'est dix fois le même geste
 * qui ne dit pas sur quoi il porte.
 *
 * La garde lit les cinq fichiers de liste et refuse tout `<AskLaura` — dans un
 * `.map(` comme dans un composant de carte/ligne appelé depuis un `.map(`
 * (c'est le cas des cartes du pipe) : la règle est plus stricte que la lettre
 * du brief, parce qu'une carte extraite dans un composant la contournerait.
 */
const LIST_FILES = [
  'features/projects/view/PipelineBoard.tsx',
  'features/missions/view/MissionsTable.tsx',
  'features/projects/open-needs/view/OpenNeedsTable.tsx',
  'features/consultants/view/VivierTable.tsx',
  'features/consultants/view/VivierTableRow.tsx',
  'features/submissions/view/PresentationsPage.tsx',
]

const ASK_LAURA_JSX = /<AskLaura[\s>/]/

/** Les commentaires peuvent NOMMER le composant : seul le JSX compte. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('un seul bouton Laura par écran — le panneau, jamais la ligne (#4194)', () => {
  it.each(LIST_FILES)('%s ne monte aucun <AskLaura>', file => {
    const source = readFileSync(resolve(__dirname, '..', file), 'utf8')
    expect(source.length).toBeGreaterThan(500)
    expect(ASK_LAURA_JSX.test(withoutComments(source))).toBe(false)
  })

  it('SAIT DIRE NON : détecte un <AskLaura> dans un .map(', () => {
    const offending = 'rows.map(row => (\n  <AskLaura question="q" label="l" />\n))'
    expect(ASK_LAURA_JSX.test(withoutComments(offending))).toBe(true)
  })

  it('SAIT LIRE : le panneau, lui, en monte un (la garde ne regarde pas un fichier vide)', () => {
    const panel = readFileSync(resolve(__dirname, '../features/records/RecordPanel.tsx'), 'utf8')
    expect(withoutComments(panel).match(/<AskLaura[\s>/]/g)).toHaveLength(1)
  })
})
