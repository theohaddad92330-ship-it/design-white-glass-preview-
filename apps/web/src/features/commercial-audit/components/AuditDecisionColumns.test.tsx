import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AuditDecisionColumns } from './AuditDecisionColumns'
import type { AuditColumn } from '../lib/build-audit'

/**
 * #2090.19 — PAS PLUS DE CINQ ÉLÉMENTS PAR COLONNE AVANT UN « VOIR TOUT ».
 *
 * Avant ce lot, une colonne rendait TOUS ses éléments — un profil qui nomme
 * dix points d'évitement aurait produit une colonne aussi longue que le
 * questionnaire qui l'a écrite. Même patron que `InterventionsBlock.tsx`
 * (`INTERVENTION_VISIBLE_COUNT`) : cinq cartes, le reste ANNONCÉ, jamais
 * coupé en silence.
 *
 * `renderWithRouter` monte une vraie route TanStack (le composant contient un
 * `<Link>`) : elle résout de façon asynchrone, d'où les `find*` — même patron
 * que `AuditStrategyOptions.test.tsx`.
 */
function itemsColumn(items: string[]): AuditColumn[] {
  return [{ key: 'stop', origin: 'messagingStyle', items }]
}

describe('AuditDecisionColumns — #2090.19', () => {
  it('rend tout sous cinq éléments, sans « Voir tout »', async () => {
    renderWithRouter(<AuditDecisionColumns columns={itemsColumn(['a', 'b', 'c'])} />)
    expect(await screen.findByText('a')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Voir/ })).not.toBeInTheDocument()
  })

  it('coupe à cinq et ANNONCE le reste — jamais un silence', async () => {
    const items = ['1', '2', '3', '4', '5', '6', '7']
    renderWithRouter(<AuditDecisionColumns columns={itemsColumn(items)} />)
    expect(await screen.findByText('5')).toBeInTheDocument()
    expect(screen.queryByText('6')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Voir les 2 autres/ })).toBeInTheDocument()
  })

  it('« Voir tout » révèle le reste au clic', async () => {
    const user = userEvent.setup()
    const items = ['1', '2', '3', '4', '5', '6', '7']
    renderWithRouter(<AuditDecisionColumns columns={itemsColumn(items)} />)
    await user.click(await screen.findByRole('button', { name: /Voir les 2 autres/ }))
    expect(screen.getByText('6')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })
})

describe('AuditDecisionColumns — #2011.7 (libellé version/date par recommandation)', () => {
  it('n’affiche AUCUN libellé de version quand elle n’est pas connue', async () => {
    renderWithRouter(<AuditDecisionColumns columns={itemsColumn(['a'])} />)
    expect(await screen.findByText('a')).toBeInTheDocument()
    expect(screen.queryByTestId('audit-columns-produced-with')).not.toBeInTheDocument()
  })

  it('dit « produite avec ton audit du … » quand la version et la date sont connues', async () => {
    renderWithRouter(
      <AuditDecisionColumns columns={itemsColumn(['a'])} version={3} updatedAt="2026-09-12T10:00:00.000Z" />,
    )
    expect(await screen.findByText('a')).toBeInTheDocument()
    const label = screen.getByTestId('audit-columns-produced-with')
    expect(label).toHaveTextContent('12 septembre 2026')
  })
})

describe('AuditDecisionColumns — #2011.9 (résultats pas encore validés)', () => {
  it('n’affiche AUCUN marqueur quand pendingReview est absent', async () => {
    renderWithRouter(<AuditDecisionColumns columns={itemsColumn(['a'])} />)
    expect(await screen.findByText('a')).toBeInTheDocument()
    expect(screen.queryByTestId('audit-columns-pending-review')).not.toBeInTheDocument()
  })

  it('marque que les trois colonnes reposent sur une version pas encore validée', async () => {
    renderWithRouter(<AuditDecisionColumns columns={itemsColumn(['a'])} pendingReview />)
    expect(await screen.findByText('a')).toBeInTheDocument()
    expect(screen.getByTestId('audit-columns-pending-review')).toHaveTextContent("n'a pas encore été validée")
  })
})
