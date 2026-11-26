import { describe, expect, it } from 'vitest'
import frPartners from './locales/fr/partners.json'
import frPipeline from './locales/fr/partnerPipeline.json'

// #4295.18 (recette 23/10) — une ESN « probable » est badgée « estimé » : son texte ne dit jamais « certitude ».
describe('libellés de présence ESN (#4295.18)', () => {
  it.each([
    ['partners', frPartners.certainty],
    ['partnerPipeline', frPipeline.onAccounts.certainty],
  ])('%s : aucun niveau ne se dit « certitude »', (_name, labels) => {
    for (const label of Object.values(labels)) expect(label.toLowerCase()).not.toContain('certitude')
    expect(labels.moyenne).toMatch(/probable/)
  })
})
