import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ProjectionSearchFields } from './ProjectionSearchFields'
import { emptyContactFilters, type DiscoverContactFilters } from '@/features/discover/lib/discover-contact-rows'
import { emptyCallListFilters } from '@/features/discover/lib/discover-call-list'

/**
 * #4634 (décision Louis 26/10/2026) — les critères de Contacts, Besoins et Liste d'appels vivent dans le volet de
 * recherche, une fois, pour la seule projection affichée. Les tests des listes prouvent l'autre moitié : elles ne
 * rendent plus aucun contrôle (`ProjectionResults.test.tsx`, `CallListResults.test.tsx`).
 */

function renderFields(
  resultType: 'accounts' | 'contacts' | 'needs' | 'calls' | 'partners',
  overrides: { contacts?: Partial<DiscoverContactFilters>; searched?: boolean; country?: string | null } = {},
) {
  const onContacts = vi.fn()
  const onCalls = vi.fn()
  const onNeedCompany = vi.fn()
  renderWithRouter(
    <ProjectionSearchFields
      resultType={resultType}
      contacts={{
        filters: { ...emptyContactFilters(), ...overrides.contacts },
        onChange: onContacts,
        workspaceCountryName: overrides.country === undefined ? 'France' : overrides.country,
        searched: overrides.searched ?? true,
      }}
      calls={{ filters: emptyCallListFilters(), onChange: onCalls }}
      needs={{
        company: '',
        onCompanyChange: onNeedCompany,
        nature: 'any',
        onNatureChange: vi.fn(),
        directOnly: false,
        onDirectOnlyChange: vi.fn(),
        freelanceOnly: false,
        onFreelanceOnlyChange: vi.fn(),
      }}
    />,
  )
  return { onContacts, onCalls, onNeedCompany }
}

describe('#4634 — les critères par projection vivent dans le volet', () => {
  it('Contacts : les champs de personnes, la portée de l’espace et le pays se lisent DANS le volet', async () => {
    renderFields('contacts')
    expect(await screen.findByTestId('projection-search-fields-contacts')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Fonction' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Entreprise' })).toBeInTheDocument()
    expect(screen.getByText(/Ces personnes viennent de ton espace/i)).toBeInTheDocument()
    expect(screen.getByText(/Limité au pays de ton espace \(France\)/)).toBeInTheDocument()
  })

  it('Contacts cherchés : le volet dit ce qui cherche et ce qui affine — jamais un champ muet', async () => {
    renderFields('contacts', { searched: true })
    expect(await screen.findByText(/cherchent dans ton espace/i)).toBeInTheDocument()
  })

  it('SAIT DIRE NON — Contacts lus depuis les entreprises de la recherche : tout AFFINE, rien ne prétend chercher', async () => {
    renderFields('contacts', { searched: false })
    await screen.findByTestId('projection-search-fields-contacts')
    expect(screen.queryByText(/cherchent dans ton espace/i)).toBeNull()
    expect(screen.getByText(/affinent les personnes des entreprises trouvées/i)).toBeInTheDocument()
  })

  it('#2621.1 — la bascule « monde » est un geste explicite qui prévient l’écran appelant', async () => {
    const user = userEvent.setup()
    const { onContacts } = renderFields('contacts')
    await user.click(await screen.findByRole('button', { name: /monde/i }))
    expect(onContacts).toHaveBeenCalledWith(expect.objectContaining({ worldwide: true }))
  })

  it('#2621.1 — SAIT DIRE NON : sans pays d’espace, aucune bascule « monde » sans effet', async () => {
    renderFields('contacts', { country: null })
    await screen.findByTestId('projection-search-fields-contacts')
    expect(screen.queryByRole('button', { name: /monde/i })).toBeNull()
  })

  it('#2166.57 — chaque entreprise de la sélection est une puce RETIRABLE, individuellement', async () => {
    const user = userEvent.setup()
    const { onContacts } = renderFields('contacts', {
      contacts: { companies: ['D.HANTSCH', 'CBM CAR ET BUS MAINTENANCE'] },
    })
    expect(await screen.findByText('D.HANTSCH')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /D\.HANTSCH/i }))
    expect(onContacts).toHaveBeenCalledWith(expect.objectContaining({ companies: ['CBM CAR ET BUS MAINTENANCE'] }))
  })

  it('Besoins : « Entreprise » est un libellé visible, relié au champ, sans casser la barre (#3879.2)', async () => {
    renderFields('needs')
    const field = await screen.findByLabelText('Entreprise')
    const label = field.closest('label') as HTMLLabelElement
    expect(label).toHaveTextContent('Entreprise')
    expect(label.className).toContain('inline-flex')
    expect(screen.getByText(/affinent les besoins trouvés/i)).toBeInTheDocument()
  })

  it('#4999.1 — Besoins et signaux porte la puce « Uniquement freelance »', async () => {
    renderFields('needs')
    expect(await screen.findByRole('button', { name: 'Uniquement freelance' })).toBeInTheDocument()
  })

  it('Liste d’appels : Entreprise et Fonction ont la même largeur et un libellé visible (LC.9)', async () => {
    renderFields('calls')
    expect((await screen.findByTestId('call-list-filter-company')).className).toBe(
      screen.getByTestId('call-list-filter-title').className,
    )
    expect(screen.getByLabelText('Fonction').closest('label')).toHaveTextContent('Fonction')
  })

  it('GA-26 — un critère n’apparaît qu’une fois : la projection affichée seule rend ses champs', async () => {
    renderFields('calls')
    await screen.findByTestId('projection-search-fields-calls')
    expect(screen.getAllByLabelText('Entreprise')).toHaveLength(1)
    expect(screen.queryByTestId('projection-search-fields-contacts')).toBeNull()
    expect(screen.queryByTestId('projection-search-fields-needs')).toBeNull()
  })

  it('SAIT DIRE NON — Comptes et Partenaires n’ont aucun champ de projection en plus du rail', () => {
    renderFields('accounts')
    expect(screen.queryByRole('group')).toBeNull()
    renderFields('partners')
    expect(screen.queryByRole('group')).toBeNull()
  })
})
