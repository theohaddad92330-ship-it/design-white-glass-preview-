import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { AccountProvenancePanel } from './AccountProvenancePanel'
import type { AccountProvenance } from './accountProvenance'

/**
 * #2117.69 — SUR MOBILE, UN DRAWER OUVERT OCCUPE L'ÉCRAN PLEIN.
 *
 * `SheetContent` (packages/ui) pose `w-3/4 ... sm:max-w-sm` pour le côté
 * `right` : une bande latérale, jamais plein écran, à AUCUNE largeur. Ce
 * panneau surchargeait en `w-[min(440px,calc(100vw-1.5rem))]` — presque
 * pleine largeur sur un téléphone, mais en gardant 1,5rem de marge de
 * chaque côté (héritée du `inset-y-3`/`right-3` du Sheet) : jamais
 * edge-to-edge. Sous la borne mobile unique (768px, doctrine « le mobile
 * est le produit »), le panneau doit occuper tout l'écran ; le format
 * « bande à 440px avec marge » ne revient qu'à partir de `md:`.
 */

const withSources: AccountProvenance = {
  lastAnalyzedAt: '2026-07-13T09:00:00.000Z',
  ageDays: 3,
  reliability: 72,
  tier: 'high',
  sources: [{ key: 'apollo', providerKey: 'apollo', rawLabel: null, feeds: ['firmographics'], latestDate: null }],
}

async function openSheet() {
  const user = userEvent.setup()
  render(<AccountProvenancePanel provenance={withSources} />)
  await user.click(screen.getByRole('button', { name: 'Voir le détail' }))
  return await screen.findByRole('dialog')
}

describe('AccountProvenancePanel — le drawer « Sources et confiance » sur mobile', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('occupe tout l’écran sous 768px — jamais une bande avec marge', async () => {
    const panel = await openSheet()

    expect(panel.className).toMatch(/\bw-full\b/)
    expect(panel.className).toMatch(/\bh-full\b/)
    expect(panel.className).not.toMatch(/(?<!md:)\bw-3\/4\b/)
    expect(panel.className).not.toMatch(/(?<!md:)\bw-\[min\(440px/)
  })

  it('redevient une bande latérale de 440px à partir de `md:` (768px), jamais avant', async () => {
    const panel = await openSheet()

    expect(panel.className).toMatch(/md:w-\[min\(440px,calc\(100vw-1\.5rem\)\)\]/)
    expect(panel.className).toMatch(/md:rounded-lg/)
  })
})
