import { describe, expect, it } from 'vitest'
import { executionIdDuMessage, outilsDuMessage } from './chat-turn'

/** #3391 — les outils d'un message de Laura : détail s'il existe, noms sinon, rien d'inventé. */
describe('outilsDuMessage', () => {
  it('rend mode et clés quand tools_detail est persisté', () => {
    const out = outilsDuMessage({
      reasoning_trace: {
        tools_called: ['get_pipeline'],
        tools_detail: [{ tool: 'get_pipeline', mode: 'read', input_keys: ['limit'], silent: false }],
      },
    })
    expect(out).toEqual([{ tool: 'get_pipeline', mode: 'read', inputKeys: ['limit'] }])
  })

  it('un ancien message rend les noms seuls, mode et clés à null (jamais devinés)', () => {
    expect(outilsDuMessage({ reasoning_trace: { tools_called: ['find_accounts'] } })).toEqual([
      { tool: 'find_accounts', mode: null, inputKeys: null },
    ])
  })

  it('SAIT DIRE NON : pas de contexte ni de trace → aucun outil', () => {
    expect(outilsDuMessage(null)).toEqual([])
    expect(outilsDuMessage(undefined)).toEqual([])
    expect(outilsDuMessage({})).toEqual([])
  })
})

/** #3777 / #3717.7 — l'identifiant d'exécution du dossier consulté ce tour, jamais deviné. */
describe('executionIdDuMessage', () => {
  it("relaie l'identifiant quand un dossier a été consulté ce tour", () => {
    expect(executionIdDuMessage({ reasoning_trace: { execution_id: 'cid-123' } })).toBe('cid-123')
  })

  it('SAIT DIRE NON : pas de contexte, pas de trace, pas d’identifiant → null', () => {
    expect(executionIdDuMessage(null)).toBeNull()
    expect(executionIdDuMessage(undefined)).toBeNull()
    expect(executionIdDuMessage({})).toBeNull()
    expect(executionIdDuMessage({ reasoning_trace: { tools_called: ['get_pipeline'] } })).toBeNull()
  })
})
