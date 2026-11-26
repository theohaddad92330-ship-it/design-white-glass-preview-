import { describe, expect, it } from 'vitest'
import { incidentLogRequestBody } from './incident-ops-row.logic'

// #2445.12 (épopée #2766) — le corps envoyé en journalisant une action ou une
// communication sur un incident.
describe('incidentLogRequestBody', () => {
  it('une action ne porte jamais de `workspaceId`, même saisi par erreur', () => {
    expect(incidentLogRequestBody('action', ' Reboot manuel du connecteur ', 'ws_1')).toEqual({
      note: 'Reboot manuel du connecteur',
    })
  })

  it('une communication SANS espace visé reste générale — pas de clé `workspaceId`', () => {
    expect(incidentLogRequestBody('communication', 'Statut publié sur la page publique', '')).toEqual({
      note: 'Statut publié sur la page publique',
    })
  })

  it('une communication AVEC un espace visé le porte, retaillé', () => {
    expect(incidentLogRequestBody('communication', 'Prévenu par email', '  ws_42  ')).toEqual({
      note: 'Prévenu par email',
      workspaceId: 'ws_42',
    })
  })

  it('un espace visé qui ne contient que des espaces vaut « aucun »', () => {
    expect(incidentLogRequestBody('communication', 'Prévenu par email', '   ')).toEqual({
      note: 'Prévenu par email',
    })
  })
})
