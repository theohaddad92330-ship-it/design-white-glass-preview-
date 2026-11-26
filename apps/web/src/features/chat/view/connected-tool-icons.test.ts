import { toolFamilyValues, type ConnectedClientTool } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { CONNECTOR_ICONS } from '@/features/integration-center/view/cards/connector-icons'
import { connectedToolIcon } from './connected-tool-icons'

const tool = (provider: string, family: ConnectedClientTool['family']): ConnectedClientTool => ({
  provider,
  family,
  name: provider,
})

/**
 * #2254 — « ils devraient avoir des logos ». La doctrine (D354, `tool-naming.ts`)
 * interdit un fichier de MARQUE ; Réglages › Intégrations a déjà une icône par
 * connecteur (`connector-icons.ts`, #1447) — on la RÉUTILISE plutôt que d'en
 * choisir une seconde, et on ne retombe sur une icône de CAPACITÉ générique que
 * pour un fournisseur que cet écran ne dessine pas.
 */
describe('connectedToolIcon', () => {
  it('réutilise l’icône déjà choisie par Réglages › Intégrations quand le connecteur y figure', () => {
    expect(connectedToolIcon(tool('hubspot', 'crm'))).toBe(CONNECTOR_ICONS.hubspot)
    expect(connectedToolIcon(tool('slack', 'communication'))).toBe(CONNECTOR_ICONS.slack)
  })

  it('normalise les identifiants Google groupés (gmail, agenda, drive) vers la même icône que la carte Google', () => {
    expect(connectedToolIcon(tool('gmail', 'email'))).toBe(CONNECTOR_ICONS.google)
    expect(connectedToolIcon(tool('google-calendar', 'calendar'))).toBe(CONNECTOR_ICONS.google)
    expect(connectedToolIcon(tool('google-drive', 'documents'))).toBe(CONNECTOR_ICONS.google)
  })

  it('retombe sur une icône de CAPACITÉ générique — jamais nue — pour un fournisseur sans carte dédiée', () => {
    const icon = connectedToolIcon(tool('boondmanager', 'ats'))
    expect(icon).toBeTruthy()
    expect(icon).not.toBe(CONNECTOR_ICONS.hubspot)
  })

  it('couvre TOUTES les familles du registre — une garde qui ne lit rien ne protège rien', () => {
    for (const family of toolFamilyValues) {
      const icon = connectedToolIcon(tool('un-fournisseur-jamais-liste', family))
      expect(icon, `famille sans icône générique : ${family}`).toBeTruthy()
    }
  })
})
