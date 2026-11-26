import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #3920.k — `signalIdentityKeys` et `buildNewSignalBody` étaient testés mais SANS
 * APPELANT : la veille décidait « nouveau » avec une autre comparaison. Cette
 * garde prouve que l'appelant RÉEL (le worker de veille) les appelle, hors
 * commentaires — elle casse le jour où l'appel disparaît.
 */
const WORKER = join(__dirname, '..', 'modules', 'watchlist-refresh', 'watchlist-refresh.worker.ts')

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function callsOf(source: string, name: string): number {
  return (stripComments(source).match(new RegExp(`\\b${name}\\(`, 'g')) ?? []).length
}

describe('#3920.k — les signaux calculés ont un appelant réel', () => {
  const worker = readFileSync(WORKER, 'utf8')

  it.each(['signalIdentityKeys', 'buildNewSignalBody', 'selectNewSignals'])('le worker de veille appelle %s', name => {
    expect(worker.length).toBeGreaterThan(1000)
    expect(callsOf(worker, name)).toBeGreaterThan(0)
  })

  it('sait dire NON : un appel planqué dans un commentaire, ou absent, ne compte pas', () => {
    expect(callsOf('// signalIdentityKeys(x)\n/* buildNewSignalBody(y) */', 'signalIdentityKeys')).toBe(0)
    expect(callsOf('const a = 1', 'buildNewSignalBody')).toBe(0)
    expect(callsOf('const s = signalIdentityKeys(x)', 'signalIdentityKeys')).toBe(1)
  })
})
