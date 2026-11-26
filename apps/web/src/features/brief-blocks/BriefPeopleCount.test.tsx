import type { CommercialBrief } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BriefPeopleCount } from './BriefPeopleCount'
import type { BriefT } from './brief-t'

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts && 'count' in opts ? `${key}|${String(opts['role'] ?? '')}|${String(opts['count'])}` : key) as unknown as BriefT

const people = [
  { name: 'A', role: 'decision_maker' },
  { name: 'B', role: 'manager' },
  { name: 'C' },
] as unknown as CommercialBrief['people']

/**
 * LOIC-FIX O.2 — UNE SEULE SOURCE POUR « DÉCIDEURS ».
 *
 * Recette prod du 20/10 (OGF) : la Synthèse affichait « Décideurs : 1 » (le rôle
 * que le modèle avait mis dans le brief) quand l'onglet Contacts en comptait 5
 * (le rôle d'achat porté par les contacts). Le compte de décideurs vient des
 * CONTACTS du compte dès qu'il en a ; le brief ne répartit que le reste.
 */
describe('BriefPeopleCount — décideurs, une seule source', () => {
  it('compte les décideurs économiques depuis les contacts, pas depuis le rôle écrit par le brief', () => {
    render(<BriefPeopleCount people={people} economicDeciders={5} t={t} />)
    const card = screen.getByTestId('brief-people-count')
    expect(card.textContent).toContain('people.role.decision_maker|5')
    expect(card.textContent).not.toContain('people.role.decision_maker|1')
  })

  it('sait dire NON : sans contacts fournis, le compte du brief reste (aucun 0 inventé)', () => {
    render(<BriefPeopleCount people={people} t={t} />)
    expect(screen.getByTestId('brief-people-count').textContent).toContain('people.role.decision_maker|1')
  })

  it('un compte de contacts à zéro ne masque pas le brief : « non mesuré » n’est pas 0', () => {
    render(<BriefPeopleCount people={people} economicDeciders={0} t={t} />)
    expect(screen.getByTestId('brief-people-count').textContent).not.toContain('people.role.decision_maker|0')
  })
})
