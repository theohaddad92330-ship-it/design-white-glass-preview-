import { describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { ORG_VIEW_MODES } from './orgViewModes'

/**
 * #2121.2 et #2121.12 — ce que le sélecteur de vue DIT.
 *
 * « Carte système » ne disait rien à un commercial : la vue montre QUI PÈSE sur
 * quoi dans le groupe. Et la demande nomme trois lectures — Influence,
 * Hiérarchie, Entités — qui existaient sous d'autres noms (« Carte système »,
 * « Groupe »). Les libellés sont lus dans les VRAIES ressources, dans les deux
 * langues, et le corpus est compté : un `t()` qui rendrait sa clé passerait
 * sinon le « ne contient pas » sans rien lire.
 */
describe('le sélecteur de vue de l’organigramme (#2121.2, #2121.12)', () => {
  it.each(['fr', 'en'])('en %s, aucun libellé ne parle plus de « carte système »', lng => {
    const labels = [
      ...ORG_VIEW_MODES.flatMap(mode => [
        i18n.t(`accountOrg:orgViews.${mode}`, { lng }),
        i18n.t(`accountOrg:orgViews.${mode}Hint`, { lng }),
      ]),
      i18n.t('accountOrg:focal.systemView', { lng }),
    ]
    expect(labels).toHaveLength(ORG_VIEW_MODES.length * 2 + 1)
    for (const label of labels) {
      expect(label).not.toMatch(/orgViews\.|focal\./)
      expect(label).not.toMatch(/syst[eè]me|system/i)
    }
  })

  it.each([
    ['fr', ['Influence', 'Hiérarchie', 'Entités']],
    ['en', ['Influence', 'Hierarchy', 'Entities']],
  ])('en %s, les trois lectures demandées sont nommées', (lng, expected) => {
    const labels = ORG_VIEW_MODES.map(mode => i18n.t(`accountOrg:orgViews.${mode}`, { lng }))
    expect(labels).toEqual(expect.arrayContaining(expected))
  })
})
