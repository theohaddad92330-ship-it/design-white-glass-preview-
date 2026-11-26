import { describe, expect, it } from 'vitest'
import { tidyReplyText } from './reply-text-tidy'

/**
 * R10B-FIX.5 — recette prod du 14/10, réponse Thales : « 2026-10-13T21:21:04Z » affiché tel quel,
 * puis des puces isolées « THALES » / « RÉSERVE » qui répétaient le titre.
 */
describe('tidyReplyText — horodatages', () => {
  it('formate un horodatage ISO avec le formatter de date de l’app', () => {
    const out = tidyReplyText('Dernière mise à jour : 2026-10-13T21:21:04Z')
    expect(out).not.toContain('2026-10-13T21:21:04Z')
    expect(out).toMatch(/13/)
    expect(out).toMatch(/2026/)
  })

  it('SAIT DIRE NON — une date seule ou un code technique n’est pas touché', () => {
    expect(tidyReplyText('Échéance 2026-10-13, réf. T2026-10')).toBe('Échéance 2026-10-13, réf. T2026-10')
  })

  it('ne touche pas un bloc de code', () => {
    const text = '```\n2026-10-13T21:21:04Z\n```'
    expect(tidyReplyText(text)).toBe(text)
  })
})

describe('tidyReplyText — puces isolées', () => {
  it('retire les puces qui répètent le titre', () => {
    const out = tidyReplyText('## THALES — Réserve\n\n- THALES\n- RÉSERVE\n\nCompte à qualifier avant d’investir.')
    expect(out).not.toMatch(/^- /m)
    expect(out).toContain('Compte à qualifier')
  })

  it('rattache les puces à leur libellé quand la ligne au-dessus finit par « : »', () => {
    expect(tidyReplyText('Verdict :\n- RÉSERVE\n- THALES')).toBe('Verdict : RÉSERVE · THALES')
  })

  it('SAIT DIRE NON — de vraies listes de phrases restent des listes', () => {
    const text = '## Signaux\n\n- Appel d’offres publié en septembre\n- Nouveau DSI nommé'
    expect(tidyReplyText(text)).toBe(text)
  })

  it('SAIT DIRE NON — une liste de mots qui ne répète rien reste intacte', () => {
    const text = 'Axes :\n\n- Fit\n- Timing\n- Accès\n- Concurrence'
    expect(tidyReplyText(text)).toBe(text)
  })
})
