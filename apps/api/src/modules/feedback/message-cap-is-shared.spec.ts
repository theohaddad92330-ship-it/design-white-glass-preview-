import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FEEDBACK_MESSAGE_MAX } from '@bellum/contracts'
import { createFeedbackSchema } from './dto/feedback.dto'

/**
 * Un réglage vit à UN seul endroit (loi 1 du tome 7, GA-26).
 *
 * Le plafond du message n'existait que dans le schéma Zod ; le `<textarea>` du
 * widget ne le connaissait pas. Un retour trop long partait, se faisait refuser
 * en 400 brut, et le texte était perdu — mesuré : le plus long des 21 retours
 * ouverts le 02/09 faisait 4 827 caractères, 96 % du plafond.
 */
describe('le plafond du signalement est le MÊME des deux côtés', () => {
  it('le schéma de l’API refuse exactement à FEEDBACK_MESSAGE_MAX + 1', () => {
    const base = { category: 'bug' as const }

    expect(createFeedbackSchema.safeParse({ ...base, message: 'a'.repeat(FEEDBACK_MESSAGE_MAX) }).success).toBe(true)
    expect(createFeedbackSchema.safeParse({ ...base, message: 'a'.repeat(FEEDBACK_MESSAGE_MAX + 1) }).success).toBe(
      false,
    )
  })

  it('l’écran borne son champ sur la même constante, jamais sur un nombre recopié', () => {
    const widget = join(__dirname, '..', '..', '..', '..', '..', 'apps', 'web', 'src', 'features', 'feedback')
    const source = readFileSync(join(widget, 'FeedbackWidget.tsx'), 'utf8')

    // LA GARDE LIT QUELQUE CHOSE : un chemin faux rendrait une chaîne vide.
    expect(source).toContain('<textarea')

    expect(source).toContain('FEEDBACK_MESSAGE_MAX')
    // Et surtout PAS le nombre en dur : deux copies divergent le jour où l'une
    // bouge, et c'est exactement le défaut qu'on répare.
    expect(source).not.toMatch(/maxLength=\{5000\}/)
  })
})
