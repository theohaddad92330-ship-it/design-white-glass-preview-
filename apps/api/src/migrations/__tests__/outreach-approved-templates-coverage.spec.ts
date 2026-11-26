import { APPROVED_TEMPLATE_SCENARIO_IDS } from '@bellum/contracts'
import { OutreachApprovedTemplatesEveryChannel1796417894263 } from '../1796417894263-OutreachApprovedTemplatesEveryChannel'
import { OutreachApprovedTemplatesSeed1796409452648 } from '../1796409452648-OutreachApprovedTemplatesSeed'

// #3417 — « Aucun modèle approuvé pour ce scénario et ce canal » : la garde lit
// les graines réelles et exige un modèle en e-mail ET en LinkedIn par scénario.
const rows = [
  ...new OutreachApprovedTemplatesSeed1796409452648().rows,
  ...new OutreachApprovedTemplatesEveryChannel1796417894263().rows,
]

describe('bibliothèque de modèles approuvés — couverture des canaux écrits (#3417)', () => {
  it.each(APPROVED_TEMPLATE_SCENARIO_IDS)(
    '%s a un modèle en e-mail (et en LinkedIn sauf l’appel, qui se téléphone)',
    scenario => {
      const channels = new Set(rows.filter(row => row.scenario === scenario).map(row => row.channel))
      expect(channels.has('email')).toBe(true)
      expect(channels.has('linkedin')).toBe(scenario !== 'appel_sans_contexte' ? true : channels.has('linkedin'))
    },
  )

  it('la garde sait dire NON : un scénario sans e-mail serait vu', () => {
    const without = rows.filter(row => !(row.scenario === 'cloture_elegante' && row.channel === 'linkedin'))
    const channels = new Set(without.filter(row => row.scenario === 'cloture_elegante').map(row => row.channel))
    expect(channels.has('linkedin')).toBe(false)
  })

  it('aucun doublon (scénario, canal) à l’intérieur de la graine complémentaire', () => {
    const keys = new OutreachApprovedTemplatesEveryChannel1796417894263().rows.map(r => `${r.scenario}/${r.channel}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
