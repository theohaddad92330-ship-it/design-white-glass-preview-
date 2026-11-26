import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PLAN_NAMES, planLabel } from './plan-labels'

describe('plan-labels (#4423.2 / #4422.2)', () => {
  it('le BO nomme chaque palier comme l’app (billing.planNames FR), jamais « Essai Pro »', () => {
    const app = JSON.parse(
      readFileSync(resolve(__dirname, '../../../../../web/src/i18n/locales/fr/billing.json'), 'utf8'),
    ) as { planNames: Record<string, string> }
    for (const [key, name] of Object.entries(PLAN_NAMES)) expect(name).toBe(app.planNames[key])
    expect(Object.values(PLAN_NAMES)).not.toContain('Essai Pro')
  })

  it('la note suit le nom', () => {
    expect(planLabel('starter')).toBe('Starter-Solo (retiré de la vente)')
    expect(planLabel('growth')).toBe('Growth')
  })
})
