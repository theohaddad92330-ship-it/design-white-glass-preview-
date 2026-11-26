import { describe, expect, it } from 'vitest'
import type { AdminRightsMatrixEntry } from '@/lib/admin'
import { compterParPermission, courtPermission, trierParOutil } from './rights-matrix-panel.logic'

function entry(overrides: Partial<AdminRightsMatrixEntry> = {}): AdminRightsMatrixEntry {
  return { tool: 'get_account_briefing', permission: "lecture de l'espace, scopée à la personne", ...overrides }
}

describe('courtPermission — le mot court, pour le badge', () => {
  it('« lecture » pour une lecture', () => {
    expect(courtPermission("lecture de l'espace, scopée à la personne")).toBe('lecture')
  })

  it('« proposition » pour une proposition', () => {
    expect(courtPermission('proposition — seul le clic de la personne exécute')).toBe('proposition')
  })

  it('« dépense » pour une dépense', () => {
    expect(courtPermission('dépense de crédits, après confirmation')).toBe('dépense')
  })

  it('une valeur non reconnue reste ELLE-MÊME — jamais un mot inventé', () => {
    expect(courtPermission('une permission jamais vue')).toBe('une permission jamais vue')
  })
})

describe('compterParPermission — le résumé, jamais un total qui divergerait de la liste', () => {
  it('compte chaque outil dans SA permission réelle', () => {
    const tools = [
      entry({ tool: 'a', permission: "lecture de l'espace, scopée à la personne" }),
      entry({ tool: 'b', permission: "lecture de l'espace, scopée à la personne" }),
      entry({ tool: 'c', permission: 'proposition — seul le clic de la personne exécute' }),
      entry({ tool: 'd', permission: 'dépense de crédits, après confirmation' }),
    ]
    expect(compterParPermission(tools)).toEqual({ lecture: 2, proposition: 1, dépense: 1 })
  })

  it('un catalogue vide compte zéro partout — jamais une case absente', () => {
    expect(compterParPermission([])).toEqual({ lecture: 0, proposition: 0, dépense: 0 })
  })
})

describe('trierParOutil — ordre stable, alphabétique', () => {
  it('trie par nom d’outil', () => {
    const tools = [entry({ tool: 'zeta' }), entry({ tool: 'alpha' }), entry({ tool: 'mu' })]
    expect(trierParOutil(tools).map(t => t.tool)).toEqual(['alpha', 'mu', 'zeta'])
  })

  it('ne mute pas le tableau reçu', () => {
    const tools = [entry({ tool: 'zeta' }), entry({ tool: 'alpha' })]
    trierParOutil(tools)
    expect(tools.map(t => t.tool)).toEqual(['zeta', 'alpha'])
  })
})
