import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ComposerSendHint } from './ComposerSendHint'

// #3399.6 (recette prod 12/10) — « aucun indice visible du raccourci » : Entrée envoie et
// Maj+Entrée saute une ligne, mais rien à l'écran ne le disait.
describe('ComposerSendHint', () => {
  it('réglage `enter` : dit Entrée envoie, Maj+Entrée saute une ligne', () => {
    render(<ComposerSendHint sendOn="enter" id="hint" />)
    const hint = screen.getByTestId('composer-send-hint')
    expect(hint).toHaveTextContent('Entrée')
    expect(hint).toHaveTextContent('Maj')
    expect(hint).toHaveAttribute('id', 'hint')
  })

  it('réglage `mod-enter` : dit Ctrl/Cmd+Entrée envoie — jamais Entrée seule', () => {
    render(<ComposerSendHint sendOn="mod-enter" id="hint" />)
    const hint = screen.getByTestId('composer-send-hint')
    expect(hint).toHaveTextContent(/Ctrl|Cmd/)
    expect(hint.textContent).not.toMatch(/^Entrée envoie/)
  })

  it('se tait au doigt : un clavier tactile a son bouton Envoyer', () => {
    render(<ComposerSendHint sendOn="enter" id="hint" />)
    expect(screen.getByTestId('composer-send-hint').className).toMatch(/pointer-coarse:hidden/)
    expect(screen.getByTestId('composer-send-hint').className).toMatch(/max-md:hidden/)
  })
})
