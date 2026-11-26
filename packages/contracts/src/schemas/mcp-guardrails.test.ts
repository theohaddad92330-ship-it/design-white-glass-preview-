import { describe, expect, it } from 'vitest'
import { GUARDRAIL_ARCHIVE_EXCEPTION, GUARDRAIL_INSTRUCTIONS, GUARDRAIL_ITEMS } from './mcp-guardrails.js'

// #3424 lot G03 (30/09) — la liste affichée sur /settings/mcp et celle injectée
// dans le serveur MCP viennent de CE fichier. Un item retiré ou ajouté ici doit
// casser ce test pour forcer la relecture des deux surfaces (GA-26).
describe('mcp-guardrails', () => {
  it('porte les dix-neuf pratiques refusées du retour bêta #3424', () => {
    expect(GUARDRAIL_ITEMS).toHaveLength(19)
    for (const item of GUARDRAIL_ITEMS) {
      expect(item.trim()).not.toBe('')
    }
  })

  it('les instructions MCP contiennent chaque pratique refusée', () => {
    for (const item of GUARDRAIL_ITEMS) {
      expect(GUARDRAIL_INSTRUCTIONS).toContain(item)
    }
  })

  it('nomme explicitement l’exception d’archive — jamais une levée générale', () => {
    expect(GUARDRAIL_INSTRUCTIONS).toContain(GUARDRAIL_ARCHIVE_EXCEPTION)
    expect(GUARDRAIL_ARCHIVE_EXCEPTION).toContain('source historique')
  })
})
