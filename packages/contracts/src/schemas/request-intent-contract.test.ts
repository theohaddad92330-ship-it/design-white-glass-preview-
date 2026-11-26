import { describe, expect, it } from 'vitest'

import {
  buildRequestIntentContract,
  REQUEST_INTENT_CONTRACT_FIELDS,
  requestIntentContractForLog,
  requestIntentContractSchema,
} from './request-intent-contract.js'

/**
 * #2257.1 — LE CONTRAT DE DEMANDE STRUCTURÉ n'existait nulle part : le ticket
 * (LAU-FINAL-002) en demande dix-huit champs nommés, produits UNE FOIS par
 * tour, et l'intention restait implicite au raisonnement du modèle. Ces tests
 * tiennent la forme du contrat (les dix-huit champs, y compris ceux encore
 * `null` faute de producteur) et sa règle la plus stricte : jamais de contenu
 * verbatim dans la vue journalisée.
 */
describe('contrat de demande structuré (#2257)', () => {
  it('déclare les dix-huit champs nommés par le ticket', () => {
    expect(REQUEST_INTENT_CONTRACT_FIELDS).toHaveLength(18)
    const contract = buildRequestIntentContract({ activeAccountCompanyName: null, clarificationAlreadyAsked: false })
    for (const field of REQUEST_INTENT_CONTRACT_FIELDS) {
      expect(Object.prototype.hasOwnProperty.call(contract, field)).toBe(true)
    }
  })

  it('peuple objet_depart depuis le compte ACTIF déjà résolu — jamais un second appel au modèle', () => {
    const contract = buildRequestIntentContract({
      activeAccountCompanyName: 'ACME',
      clarificationAlreadyAsked: false,
    })
    const parsed = requestIntentContractSchema.parse(contract)
    expect(parsed.objet_depart).toBe('ACME')
  })

  it('peuple ambiguite_deja_demandee depuis le drapeau client (§9.4) — jamais devinée du texte', () => {
    const contract = buildRequestIntentContract({ activeAccountCompanyName: null, clarificationAlreadyAsked: true })
    expect(contract.ambiguite_deja_demandee).toBe(true)
  })

  it('sait dire NON : sans compte actif et sans clarification, les deux champs connus restent faux/nuls — pas un booléen ni un texte inventés', () => {
    const contract = buildRequestIntentContract({ activeAccountCompanyName: null, clarificationAlreadyAsked: false })
    expect(contract.objet_depart).toBeNull()
    expect(contract.ambiguite_deja_demandee).toBe(false)
    // Les quinze autres champs n'ont AUCUN producteur déterministe aujourd'hui
    // (mesuré au registre #2257) — ils restent nommés et `null`, jamais devinés.
    expect(contract.intention_principale).toBeNull()
    expect(contract.perimetre_geographique).toBeNull()
    expect(contract.besoin_metier_sous_jacent).toBeNull()
  })

  it('la vue journalisée ne porte JAMAIS le nom du compte — seulement sa PRÉSENCE', () => {
    const contract = buildRequestIntentContract({
      activeAccountCompanyName: 'Client Confidentiel SAS',
      clarificationAlreadyAsked: true,
    })
    const forLog = requestIntentContractForLog(contract)
    const serialized = JSON.stringify(forLog)
    expect(serialized).not.toContain('Client Confidentiel SAS')
    expect(forLog['has_objet_depart']).toBe(true)
    expect(forLog['ambiguite_deja_demandee']).toBe(true)
    expect(forLog['has_intention_principale']).toBe(false)
  })
})
