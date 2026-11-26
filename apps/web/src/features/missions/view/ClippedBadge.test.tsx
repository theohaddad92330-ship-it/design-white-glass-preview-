import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ClippedBadge } from './ClippedBadge'

describe('ClippedBadge — jamais de césure dans un badge (#3494)', () => {
  it('un statut d’un seul mot ne se coupe pas : nowrap, aucune césure', () => {
    render(<ClippedBadge variant="secondary">Démarrage</ClippedBadge>)
    const badge = screen.getByTitle('Démarrage')
    expect(badge.className).toContain('whitespace-nowrap')
    expect(badge.className).not.toContain('whitespace-normal')
    expect(badge.className).not.toContain('break-words')
    expect(badge.querySelector('span')?.className).not.toContain('break-words')
  })

  it('un mot seul prend la largeur de son contenu : badge w-max, span non écrasable (#3494)', () => {
    render(<ClippedBadge variant="secondary">Démarrage</ClippedBadge>)
    const badge = screen.getByTitle('Démarrage')
    expect(badge.className).toContain('w-max')
    expect(badge.className).not.toContain('max-w-full')
    const span = badge.querySelector('span')
    expect(span?.className).toContain('shrink-0')
    expect(span?.className).toContain('min-w-fit')
    expect(span?.className).not.toMatch(/(^|\s)min-w-0/)
  })

  it('un libellé de plusieurs mots passe à la ligne aux espaces, jamais au milieu d’un mot', () => {
    render(<ClippedBadge variant="secondary">Renouvellement non engagé</ClippedBadge>)
    const badge = screen.getByTitle('Renouvellement non engagé')
    expect(badge.className).toContain('whitespace-normal')
    expect(badge.className).toContain('break-normal')
    expect(badge.className).not.toContain('break-words')
  })
})
