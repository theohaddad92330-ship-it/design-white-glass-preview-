import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CRM_PROVIDERS } from '@bellum/contracts'

/**
 * #4185 — Brancher un CRM de plus ne passe plus par une dizaine de switchs.
 *
 * Les consommateurs de l'adaptateur commun (le routeur d'actions, l'export de
 * besoin) lisent le REGISTRE (`CrmAdapterRegistry`), directement ou par la
 * porte commune (`CrmWriteService`, #4186). Un `case '<fournisseur>'`
 * qui réapparaît dans l'un d'eux est exactement le défaut fermé par #4185 :
 * le fournisseur suivant (Zoho, #4187) devrait encore y être ajouté à la main,
 * et oublié dans l'un des dix endroits.
 *
 * La garde sait dire NON (fixture ci-dessous) et prouve qu'elle LIT (chaque
 * fichier surveillé nomme le registre ou ses portes).
 */

const MODULES = join(__dirname, '..', 'modules')

/** Les consommateurs du registre — et ce qui prouve qu'on lit le bon fichier. */
const WATCHED: ReadonlyArray<{ file: string; proof: string }> = [
  { file: 'action-router/action-router.service.ts', proof: 'this.ports?.crmWrites' },
  { file: 'action-router/action-router.module.ts', proof: 'crmWritesPortFrom(crmWrites)' },
  { file: 'crm/crm-task.service.ts', proof: 'CrmAdapterRegistry' },
]

function providerSwitches(source: string): string[] {
  return CRM_PROVIDERS.filter(provider => new RegExp(`case\\s+['"]${provider}['"]\\s*:`).test(source))
}

describe('#4185 — les consommateurs CRM lisent le registre, jamais un switch par fournisseur', () => {
  it.each(WATCHED)('$file', ({ file, proof }) => {
    const source = readFileSync(join(MODULES, file), 'utf8')
    expect(source).toContain(proof)
    expect(providerSwitches(source)).toEqual([])
  })

  it('sait dire NON : un switch par fournisseur est repéré', () => {
    const fixture = `switch (provider) {\n  case 'pipedrive':\n    return a\n  case "odoo": return b\n}`
    expect(providerSwitches(fixture)).toEqual(['pipedrive', 'odoo'])
    expect(providerSwitches("if (provider === 'hubspot') return")).toEqual([])
  })
})
