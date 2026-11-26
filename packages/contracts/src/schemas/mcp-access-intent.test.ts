import { describe, expect, it } from 'vitest'
import {
  MCP_ACCESS_INTENT_PERIMETERS,
  MCP_ACCESS_INTENT_STATUSES,
  createMcpAccessIntentSchema,
  decideMcpAccessIntentSchema,
} from './mcp-access-intent.js'

describe('Théo D settings-outils.N1 — le cadre d’un accès futur', () => {
  it('deux périmètres (mes dossiers / dossiers partagés) et trois statuts', () => {
    expect(MCP_ACCESS_INTENT_PERIMETERS).toEqual(['mine', 'shared'])
    expect(MCP_ACCESS_INTENT_STATUSES).toEqual(['pending', 'approved', 'declined'])
  })

  it('un nom et un périmètre suffisent ; le nom est borné et rogné', () => {
    expect(createMcpAccessIntentSchema.parse({ name: '  Assistant de Théo  ', perimeter: 'mine' })).toEqual({
      name: 'Assistant de Théo',
      perimeter: 'mine',
    })
  })

  it('⚠️ SAIT DIRE NON — pas de nom vide, pas de périmètre inconnu', () => {
    expect(createMcpAccessIntentSchema.safeParse({ name: '   ', perimeter: 'mine' }).success).toBe(false)
    expect(createMcpAccessIntentSchema.safeParse({ name: 'x', perimeter: 'everything' }).success).toBe(false)
  })

  it('⚠️ SAIT DIRE NON — ce formulaire ne délivre jamais de droit d’écriture : un champ d’écriture est refusé', () => {
    expect(createMcpAccessIntentSchema.safeParse({ name: 'x', perimeter: 'mine', readOnly: false }).success).toBe(false)
    expect(createMcpAccessIntentSchema.safeParse({ name: 'x', perimeter: 'mine', scopes: ['write'] }).success).toBe(
      false,
    )
  })

  it('une décision est « approuvé » ou « refusé », jamais « en attente »', () => {
    expect(decideMcpAccessIntentSchema.safeParse({ decision: 'approved' }).success).toBe(true)
    expect(decideMcpAccessIntentSchema.safeParse({ decision: 'declined' }).success).toBe(true)
    expect(decideMcpAccessIntentSchema.safeParse({ decision: 'pending' }).success).toBe(false)
  })
})
