import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(join(__dirname, name), 'utf8')

// #4333 — « Générer les messages » : illisible même en plein écran (call refonte UX 19/10). Garde de
// STRUCTURE : elle dit NON si le corps du message perd sa largeur de lecture, si le panneau
// ré-imbrique deux défilements, ou si le fil retombe à un fragment sous le composer.
describe('panneau Approche contact — mise en page lisible (#4333)', () => {
  it('le texte d’un message a une largeur de lecture de 70 caractères (D81, GA-34)', () => {
    const message = read('EngagementMessage.tsx')
    // La borne vit dans `Text` (GA-34 interdit de recopier `max-w-[70ch]`) : le corps y passe, sans échappatoire `full`.
    const bodyText = message.match(/<Text\b([^>]*)>\s*\{body\}/)
    expect(bodyText).not.toBeNull()
    expect(bodyText?.[1]).not.toMatch(/\sfull\b/)
    expect(message).not.toMatch(/max-w-\[70ch\]/)
  })

  it('le corps du panneau ne défile pas deux fois : le fil défile, le composer est borné', () => {
    const panel = read('EngagementPanel.tsx')
    const body = panel.slice(panel.indexOf('function panelBodyClassName'))
    expect(body.slice(0, 400)).not.toMatch(/overflow-y-auto/)
    expect(panel).toMatch(/max-h-\[45dvh\]/)
    expect(panel).not.toMatch(/\bvh\b(?!-)/)
  })

  it('le fil garde une hauteur plancher lisible sous le composer (12 rem)', () => {
    expect(read('EngagementConversation.tsx')).toMatch(/min-h-\[12rem\]/)
  })

  it('le panneau ouvre le fil déjà rédigé (autoDraft)', () => {
    expect(read('EngagementPanel.tsx')).toMatch(/autoDraft:\s*true/)
  })
})
