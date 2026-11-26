import { Server } from 'socket.io'
import { analysisPartialSchema } from '@bellum/contracts'
import { AnalysisGateway } from './analysis.gateway'

/**
 * #2630.2 — LE BACKEND ÉMET LE PARTIEL, sinon l'écran n'a rien à rendre.
 *
 * Mesuré le 21/09/2026 : le worker envoyait DÉJÀ la sortie de chaque phase sur
 * `phase:complete` (`emitPhaseComplete(…, payload)`), et le navigateur la jetait
 * — `analysis-subscription.ts` ne lisait que `{ phase, percent }`. La matière
 * était donc sur le fil, sous une forme que personne ne pouvait afficher : la
 * charge BRUTE d'une phase de recherche.
 *
 * Ce que ce fichier tient : la charge brute ne remplace pas le partiel, elle ne
 * s'affiche pas, et c'est le serveur qui produit la forme BORNÉE que l'écran
 * rendra — des décomptes et au plus trois libellés.
 */
function makeGateway() {
  const emit = jest.fn()
  const server = { to: jest.fn().mockReturnValue({ emit }) }
  const gateway = new AnalysisGateway({ resolveActiveWorkspace: jest.fn() } as never, { findOne: jest.fn() } as never)
  gateway.server = server as unknown as Server
  return { gateway, emit }
}

function partialOf(emit: jest.Mock): unknown {
  const [, payload] = emit.mock.calls[0] as [string, { partial?: unknown }]
  return payload.partial
}

describe('#2630.2 — le partiel voyage avec la complétion de phase', () => {
  it('une phase qui a ramené des contacts émet un partiel BORNÉ, pas la charge brute', () => {
    const { gateway, emit } = makeGateway()
    gateway.emitPhaseComplete('acc-1', 'job-1', 'contacts_complete', 70, {
      contacts: [
        { full_name: 'Claire Roggeman', title: 'DSI', email: 'claire@example.test' },
        { full_name: 'Marc Oberlé' },
      ],
    })

    const partial = partialOf(emit)
    expect(analysisPartialSchema.parse(partial)).toBeTruthy()
    expect(partial).toMatchObject({
      phase: 'contacts_complete',
      findings: [{ kind: 'contacts', count: 2, samples: ['Claire Roggeman', 'Marc Oberlé'] }],
    })
    // ⚠️ Le partiel ne transporte AUCUN champ de la charge brute — l'email
    // était là, il n'est pas dans ce qui traverse.
    expect(JSON.stringify(partial)).not.toContain('example.test')
  })

  it('une phase qui n’a RIEN ramené n’émet aucun partiel — une absence ne fait pas de ligne', () => {
    const { gateway, emit } = makeGateway()
    gateway.emitPhaseComplete('acc-1', 'job-1', 'contacts_complete', 70, { contacts: [] })
    expect(partialOf(emit)).toBeUndefined()
  })

  it('une complétion sans charge n’émet aucun partiel', () => {
    const { gateway, emit } = makeGateway()
    gateway.emitPhaseComplete('acc-1', 'job-1', 'plan_complete', 100, undefined)
    expect(partialOf(emit)).toBeUndefined()
  })

  it('la charge brute continue de voyager pour les consommateurs existants', () => {
    const { gateway, emit } = makeGateway()
    gateway.emitPhaseComplete('acc-1', 'job-1', 'research_complete', 40, { sector: 'Transport' })
    const [, payload] = emit.mock.calls[0] as [string, { data?: unknown }]
    expect(payload.data).toEqual({ sector: 'Transport' })
  })
})
