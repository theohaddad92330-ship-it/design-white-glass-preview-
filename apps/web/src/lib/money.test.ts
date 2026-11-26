import { describe, expect, it, afterEach } from 'vitest'

import { i18n } from '@/i18n'

import { formatCents } from './money'

const initial = i18n.language

afterEach(async () => {
  await i18n.changeLanguage(initial)
})

describe('formatCents — la langue de l’APP, jamais celle de la machine', () => {
  it('rend le format français quand l’app est en français', async () => {
    await i18n.changeLanguage('fr')
    // ICU rend U+202F (insécable étroit) ou U+00A0 selon sa version : on normalise.
    // ⚠️ Les écrire en ÉCHAPPEMENT, pas en littéral — un espace insécable dans le
    // source déclenche `no-irregular-whitespace`, et il est invisible à la relecture.
    expect(formatCents(1_250_000).replace(/[\u202F\u00A0\s]/g, ' ')).toBe('12 500 €')
  })

  it('rend le format anglais quand l’app est en anglais', async () => {
    await i18n.changeLanguage('en')
    expect(formatCents(1_250_000).replace(/[\u202F\u00A0\s]/g, ' ')).toBe('€12,500')
  })

  it('ne rend jamais de décimales — elles volent la place du chiffre', async () => {
    await i18n.changeLanguage('fr')
    expect(formatCents(1_250_049)).not.toMatch(/[.,]\d\d\b/)
  })

  it('formate un vrai zéro mesuré — c’est à l’appelant de décider si zéro est VRAI', async () => {
    await i18n.changeLanguage('fr')
    expect(formatCents(0).replace(/[\u202F\u00A0\s]/g, ' ')).toBe('0 €')
  })
})
