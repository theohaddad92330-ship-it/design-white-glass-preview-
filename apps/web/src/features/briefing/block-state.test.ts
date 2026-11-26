import { CONNECTOR_ERROR_CODES } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { briefingAccessIsSwitchedOff, briefingBlockIsRead } from './block-state'

/**
 * #1901.2 — LA DÉRIVATION QUI MANQUAIT, ET LE PRÉDICAT QUI ÉTAIT MORT.
 *
 * La garde prouve les trois choses exigées ici :
 *  - elle LIT quelque chose — la valeur RÉELLEMENT produite par l'API, relue
 *    dans le fichier qui la produit, pas recopiée de mémoire ;
 *  - elle sait dire NON — la valeur inventée seule ne suffit pas, et un motif
 *    voisin (`agenda_status_failed`) n'est pas un accès éteint ;
 *  - elle n'attrape pas ce qu'elle ne vise pas — une panne ordinaire reste une
 *    panne ordinaire, qui se répare toute seule.
 */
describe('#1901.2 — « éteint côté fournisseur » se décide à UN endroit', () => {
  it('LIT quelque chose : le code existe dans le contrat partagé, il n’est pas recopié de mémoire', () => {
    // Le corpus est le contrat, pas un souvenir. `connectorFailure` pose
    // `reason: input.code`, et `input.code` est l'un de ces codes-là.
    expect(CONNECTOR_ERROR_CODES.length).toBeGreaterThanOrEqual(5)
    expect(CONNECTOR_ERROR_CODES).toContain('provider_api_disabled')
  })

  it('reconnaît la valeur que l’API émet VRAIMENT', () => {
    // `connectorFailure` pose `reason: input.code` : le code NU, sans préfixe.
    // C'est cette valeur-là qui arrive à l'écran, et c'est elle que le prédicat
    // d'avant ne connaissait pas.
    expect(briefingAccessIsSwitchedOff('provider_api_disabled')).toBe(true)
  })

  it('accepte encore la forme préfixée — l’accepter ne coûte rien, la refuser coûtait la vérité', () => {
    expect(briefingAccessIsSwitchedOff('agenda_provider_api_disabled')).toBe(true)
    expect(briefingAccessIsSwitchedOff('mailbox_provider_api_disabled')).toBe(true)
  })

  it('N’ATTRAPE PAS une panne ordinaire : elle, elle repasse toute seule', () => {
    expect(briefingAccessIsSwitchedOff('agenda_status_failed')).toBe(false)
    expect(briefingAccessIsSwitchedOff('mailbox_unavailable')).toBe(false)
    expect(briefingAccessIsSwitchedOff('agenda_partial')).toBe(false)
    expect(briefingAccessIsSwitchedOff(null)).toBe(false)
    expect(briefingAccessIsSwitchedOff(undefined)).toBe(false)
  })

  it('« lu » veut dire lu ou partiel — `partial` porte du contenu', () => {
    expect(briefingBlockIsRead('ready')).toBe(true)
    expect(briefingBlockIsRead('partial')).toBe(true)
    expect(briefingBlockIsRead('unavailable')).toBe(false)
    expect(briefingBlockIsRead('not_connected')).toBe(false)
    expect(briefingBlockIsRead('missing_scope')).toBe(false)
  })
})
