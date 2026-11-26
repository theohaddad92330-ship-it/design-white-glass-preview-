import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TabNav } from '@bellum/ui'

/**
 * #2112.8 — L'ONGLET ACTIF DE LA BARRE DE SECTION PORTE UN POIDS SEMIBOLD.
 *
 * `TabNav` (variante `underline`, celle de `SectionTabs` — Aujourd'hui /
 * Messagerie / Tableau de bord) rendait son onglet actif en `medium`, comme
 * son texte au repos, distingué du repos seulement par la couleur et le trait
 * sous l'onglet. Le retour demande un poids VISIBLEMENT plus fort.
 *
 * ⚠️ La variante `pill` (second niveau — Missions, Comptes…) garde `medium` :
 * son état actif se lit déjà par un remplissage plein (`chip-style.ts`), pas
 * par le poids du texte. Durcir sa graisse aussi n'était pas demandé, et
 * `TabNav` sert les DEUX variantes — d'où les deux tests.
 */
describe('#2112.8 — poids de l’onglet actif', () => {
  afterEach(cleanup)

  const tabs = [
    { key: 'today', label: 'Aujourd’hui' },
    { key: 'mailbox', label: 'Messagerie' },
  ]

  it('barre de SECTION (`underline`) : l’onglet actif est semibold', () => {
    render(<TabNav tabs={tabs} activeTab="today" />)
    expect(screen.getByText('Aujourd’hui')).toHaveClass('font-semibold')
  })

  it('barre de SECTION (`underline`) : l’onglet au repos reste normal', () => {
    render(<TabNav tabs={tabs} activeTab="today" />)
    expect(screen.getByText('Messagerie')).toHaveClass('font-normal')
  })

  it('second niveau (`pill`) : inchangé, l’onglet actif reste medium', () => {
    render(<TabNav variant="pill" tabs={tabs} activeTab="today" />)
    expect(screen.getByText('Aujourd’hui')).toHaveClass('font-medium')
  })
})
