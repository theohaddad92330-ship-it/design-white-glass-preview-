import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { CompanyStep } from './CompanyStep'

function renderStep(overrides: Partial<Parameters<typeof CompanyStep>[0]> = {}) {
  const props = {
    picked: null,
    onChange: vi.fn(),
    searchBox: <input aria-label="champ de recherche" />,
    nameGroup: null,
    groupWhole: true,
    onGroupWholeChange: vi.fn(),
    colleague: null,
    onFollowColleague: null,
    knownLines: [] as string[],
    onOpenKnown: vi.fn(),
    onPickDossier: vi.fn(),
    ...overrides,
  } satisfies Parameters<typeof CompanyStep>[0]
  render(<CompanyStep {...props} />)
  return props
}

const picked = { name: 'Groupe BPCE', meta: 'Paris · Banque / Finance · SIREN 493 455 042' }

describe('CompanyStep — étape 1 (refonte Théo R1)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('#4512 — sans entreprise retenue : la recherche, puis « Ou essaie un dossier » avec 3 dossiers qui REMPLISSENT le champ', () => {
    const props = renderStep({
      recentDossiers: [
        { id: 'a1', company_name: 'Airbus' },
        { id: 'a2', company_name: 'EDF' },
        { id: 'a3', company_name: 'Renault' },
        { id: 'a4', company_name: 'Thales' },
      ],
    })
    expect(screen.getByText('Commence par une entreprise')).toBeInTheDocument()
    expect(screen.getByLabelText('champ de recherche')).toBeInTheDocument()
    expect(screen.getByText('Ou essaie un dossier :')).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: /Thales/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /EDF/ }))
    expect(props.onPickDossier).toHaveBeenCalledWith('EDF')
  })

  it('#4512 — espace sans dossier : aucune ligne « Ou essaie », et plus aucun exemple de saisie', () => {
    renderStep()
    expect(screen.queryByText('Ou essaie un dossier :')).not.toBeInTheDocument()
    expect(screen.queryByText(/Essaie par exemple/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('entreprise retenue : son identité, « Compte sélectionné », et « Changer » revient à la recherche', () => {
    const props = renderStep({ picked })
    expect(screen.getByText('Ton entreprise')).toBeInTheDocument()
    expect(screen.getByText('Groupe BPCE')).toBeInTheDocument()
    expect(screen.getByText('Paris · Banque / Finance · SIREN 493 455 042')).toBeInTheDocument()
    expect(screen.getByText('Compte sélectionné')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Changer' }))
    expect(props.onChange).toHaveBeenCalledTimes(1)
  })

  it('#1111 — les homonymes se disent avant de payer, et se choisissent : groupe entier ou entité seule', () => {
    const props = renderStep({
      picked,
      nameGroup: { label: 'BPCE', count: 3, names: 'Groupe BPCE · BPCE SA · BPCE Services' },
    })
    expect(screen.getByText('Groupe BPCE · BPCE SA · BPCE Services')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Analyser le groupe entier' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Garder Groupe BPCE seule' }))
    expect(props.onGroupWholeChange).toHaveBeenCalledWith(false)
  })

  it('#2128.19 — un collègue déjà en route est nommé, avec le moyen de suivre son analyse', () => {
    const onFollowColleague = vi.fn()
    renderStep({
      picked,
      colleague: { colleague: { user_id: 'u-2', name: 'Inès Morel' }, started_at: new Date().toISOString() },
      onFollowColleague,
    })
    expect(screen.getByText('Analyse déjà en cours, lancée par Inès Morel')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Suivre son analyse' }))
    expect(onFollowColleague).toHaveBeenCalledTimes(1)
  })

  it('« ce que Bellum sait déjà » : absent sans donnée — un compte jamais analysé ne montre aucun bandeau', () => {
    renderStep({ picked })
    expect(screen.queryByText('Ce que Bellum sait déjà')).not.toBeInTheDocument()
  })

  it('« ce que Bellum sait déjà » : une phrase par donnée, et la fenêtre de détail s’ouvre', () => {
    const props = renderStep({ picked, knownLines: ['Analysé le 3 sept.', '14 contacts identifiés'] })
    expect(screen.getByText('Analysé le 3 sept. · 14 contacts identifiés')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Voir le détail' }))
    expect(props.onOpenKnown).toHaveBeenCalledTimes(1)
  })
})
