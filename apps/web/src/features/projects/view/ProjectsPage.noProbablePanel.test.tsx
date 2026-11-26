import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #4197 (L6) — `/projects` N'AFFICHE PLUS LE CA PROBABLE.
 *
 * Le kanban doit monter à moins de 600 px du haut : le panneau du trimestre vit
 * désormais dans Pilotage › Pipe (`/pilotage/pipe`). Garde de source : le
 * composant ne doit ni l'importer ni le rendre — sinon le chiffre apparaîtrait
 * deux fois (GA-26).
 */
const source = readFileSync(join(__dirname, 'ProjectsPage.tsx'), 'utf8')

describe('ProjectsPage — plus de CA probable', () => {
  it('n’importe pas ProbableQuarterPanel', () => {
    expect(source).not.toMatch(/ProbableQuarterPanel/)
  })

  it('ne monte pas la lentille Pistes : elle a sa propre route', () => {
    expect(source).not.toMatch(/function PortfolioLens/)
  })

  it('renvoie vers Pilotage › Pipe pour le CA probable', () => {
    const pipe = readFileSync(join(__dirname, '..', '..', 'pilotage', 'pipe', 'PipeScreen.tsx'), 'utf8')
    expect(pipe).toMatch(/ProbableQuarterPanel/)
  })
})
