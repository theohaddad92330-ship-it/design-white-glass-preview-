import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ParcoursInfo, ParcoursPanel, ParcoursShell } from './ParcoursShell'

describe('ParcoursShell — la barre du haut et la colonne de travail `page-ob23`', () => {
  it('pose la barre du haut (marque · contexte · gestes) AVANT la colonne de travail', () => {
    const { container } = render(
      <ParcoursShell actions={<button type="button">Quitter</button>}>
        <h1>Titre</h1>
      </ParcoursShell>,
    )
    const shell = container.querySelector('[data-parcours-shell]')
    const [header, main] = [...(shell?.children ?? [])]
    expect(header?.tagName).toBe('HEADER')
    expect(main?.tagName).toBe('MAIN')
    expect(header?.textContent).toContain('Ton contexte de travail')
    expect(screen.getByRole('button', { name: 'Quitter' }).closest('header')).toBe(header)
  })

  it('sait dire NON : sans geste fourni, aucune zone d’actions vide dans la barre', () => {
    const { container } = render(<ParcoursShell>x</ParcoursShell>)
    expect(container.querySelector('header .ml-auto')).toBeNull()
  })

  it('la largeur suit le contenu : un champ seul = colonne étroite', () => {
    const { container } = render(<ParcoursShell width="narrow">x</ParcoursShell>)
    expect(container.querySelector('main')?.className).toContain('max-w-3xl')
    expect(container.querySelector('main')?.className).not.toContain('max-w-6xl')
  })
})

describe('ParcoursPanel / ParcoursInfo', () => {
  it('le panneau est une section nommée par son titre, sa mention à droite', () => {
    render(
      <ParcoursPanel title="Les étapes" meta="Version 1" labelledBy="p1">
        <p>corps</p>
      </ParcoursPanel>,
    )
    expect(screen.getByRole('region', { name: 'Les étapes' })).toBeTruthy()
    expect(screen.getByText('Version 1')).toBeTruthy()
  })

  it('la note d’alerte garde sa teinte d’alerte, la note neutre l’accent', () => {
    const { container } = render(
      <>
        <ParcoursInfo tone="warning">a</ParcoursInfo>
        <ParcoursInfo>b</ParcoursInfo>
      </>,
    )
    const [warn, info] = [...container.querySelectorAll('[role="status"]')]
    expect(warn?.className).toContain('--bellum-warning')
    expect(info?.className).not.toContain('--bellum-warning')
  })
})
