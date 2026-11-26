import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const startSpan = jest.fn((options: unknown, callback: () => unknown) => callback())
jest.mock('@sentry/nestjs', () => ({
  startSpan: (options: unknown, callback: () => unknown) => startSpan(options, callback),
}))

import { OBSERVED_SPAN_KINDS, observeSpan } from './observability-span'

/**
 * #2442.4 (épopée #2879, lot M10 09/10) — LE POINT DE PASSAGE UNIQUE DES SPANS
 * de l'API : auth, connecteur, artefact, notification. Les lots précédents
 * cherchaient « un chokepoint artefact » et n'en trouvaient pas ; il est ICI,
 * et chaque famille a son APPELANT (dernier test) — jamais du code juste que
 * personne n'appelle.
 */
describe('observeSpan', () => {
  beforeEach(() => startSpan.mockClear())

  it('ouvre UN span nommé par famille et opération, et rend le résultat tel quel', async () => {
    await expect(observeSpan('artifact', 'edit', async () => 42)).resolves.toBe(42)
    expect(startSpan).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'artifact.edit', op: 'bellum.artifact' }),
      expect.any(Function),
    )
  })

  it('une panne se PROPAGE telle quelle — mesurer ne la transforme jamais', async () => {
    const boom = new Error('db down')
    await expect(observeSpan('notification', 'create', async () => Promise.reject(boom))).rejects.toBe(boom)
  })

  it('sait dire NON — une opération qui n’est pas un identifiant ne nomme pas le span (aucun contenu ne sort)', async () => {
    await observeSpan('artifact', 'Relance jean.dupont@acme.fr', async () => null)
    expect(startSpan).toHaveBeenCalledWith(expect.objectContaining({ name: 'artifact.other' }), expect.any(Function))
  })

  it('un span qui casse côté outil de mesure ne casse JAMAIS le geste mesuré', async () => {
    startSpan.mockImplementationOnce(() => {
      throw new Error('sentry down')
    })
    await expect(observeSpan('auth', 'jwt', async () => 'ok')).resolves.toBe('ok')
  })

  it('chaque famille a son APPELANT dans le code de production', () => {
    const root = join(__dirname, '..')
    const sources: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry)
        if (statSync(path).isDirectory()) walk(path)
        else if (path.endsWith('.ts') && !path.endsWith('.spec.ts') && !path.endsWith('observability-span.ts'))
          sources.push(readFileSync(path, 'utf8'))
      }
    }
    walk(root)
    const corpus = sources.join('\n')
    expect(corpus.length).toBeGreaterThan(100_000)
    for (const kind of OBSERVED_SPAN_KINDS) {
      expect(`${kind} → ${new RegExp(`observeSpan\\(\\s*'${kind}'`).test(corpus)}`).toBe(`${kind} → true`)
    }
  })
})
