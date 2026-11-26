import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #4710 — Les noms d'écran que la navigation AFFICHE en français ne rendent pas « Page introuvable » :
 * chaque alias redirige explicitement (`beforeLoad` + `redirect`, `replace: true`, jamais `<Navigate>` — GA-27)
 * vers la vraie route, qui doit exister.
 */
const ROUTES = join(import.meta.dirname, '..', 'routes')

const ALIASES: Record<string, string> = {
  vivier: '/consultants',
  affaires: '/projects',
  signaux: '/signals',
  decouvrir: '/discover',
  comptes: '/accounts',
  equipe: '/team',
}

const targetExists = (to: string): boolean =>
  existsSync(join(ROUTES, `${to}.tsx`)) || existsSync(join(ROUTES, to, 'index.tsx'))

describe('#4710 — les URL françaises des écrans redirigent', () => {
  for (const [alias, to] of Object.entries(ALIASES)) {
    it(`/${alias} redirige explicitement vers ${to}`, () => {
      const file = join(ROUTES, `${alias}.tsx`)
      expect(existsSync(file)).toBe(true)
      const src = readFileSync(file, 'utf8')
      expect(src).toContain(`createFileRoute('/${alias}')`)
      expect(src).toContain(`throw redirect({ to: '${to}', replace: true })`)
      expect(src.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/<Navigate/)
      expect(targetExists(to)).toBe(true)
    })
  }

  it("la garde sait dire NON : une cible qui n'existe pas est refusée", () => {
    expect(targetExists('/introuvable-4710')).toBe(false)
  })
})
