import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { offerPortfolioSchema, type EsnAnswers, type ResolvedPortfolio } from '@bellum/contracts'
import { OfferPortfolioSection } from '@/features/profile/components/OfferPortfolioSection'
import { useEsnProfileWorkspaceMeta } from '@/features/profile/hooks/useEsnProfileWorkspaceMeta'
import { useOfferPortfolio, useUpdateOfferPortfolio } from '@/features/profile/hooks/useOfferPortfolio'
import { useSaveEsnField } from '@/features/profile/hooks/useSaveEsnField'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

vi.mock('@/features/profile/hooks/useEsnProfileWorkspaceMeta', () => ({ useEsnProfileWorkspaceMeta: vi.fn() }))
vi.mock('@/features/profile/hooks/useOfferPortfolio', () => ({
  useOfferPortfolio: vi.fn(),
  useUpdateOfferPortfolio: vi.fn(),
}))

vi.mock('@/features/profile/hooks/useSaveEsnField', () => ({ useSaveEsnField: vi.fn() }))

const ANSWERS = {
  offer_domains: ['MECHANICAL_ENGINEERING', 'INDUSTRIALIZATION_METHODS'],
} as unknown as EsnAnswers

function setup(portfolio: Partial<ResolvedPortfolio> = {}, canEdit = true) {
  const mutate = vi.fn()
  vi.mocked(useEsnProfileWorkspaceMeta).mockReturnValue({
    data: { shared: true, canEditCompany: canEdit, role: canEdit ? 'owner' : 'member' },
  } as unknown as ReturnType<typeof useEsnProfileWorkspaceMeta>)
  vi.mocked(useOfferPortfolio).mockReturnValue({
    data: { ...offerPortfolioSchema.parse({}), source: 'portfolio', ...portfolio },
    isLoading: false,
  } as unknown as ReturnType<typeof useOfferPortfolio>)
  vi.mocked(useUpdateOfferPortfolio).mockReturnValue({ mutate } as unknown as ReturnType<
    typeof useUpdateOfferPortfolio
  >)
  const saveField = vi.fn().mockResolvedValue(undefined)
  vi.mocked(useSaveEsnField).mockReturnValue(saveField)
  return { mutate, saveField }
}

describe('OfferPortfolioSection', () => {
  it('restitue le positionnement dans les mots du vendeur, sans « ESN »', async () => {
    // Le premier critère de viabilité du retour bêta : la restitution ne doit
    // employer aucun des termes que le vendeur récuse.
    setup({ company_type: 'industrial_engineering' })
    renderWithRouter(<OfferPortfolioSection answers={ANSWERS} />)

    expect(await screen.findByText(/société de conseil en ingénierie industrielle/i)).toBeInTheDocument()
    expect(screen.queryByText(/\bESN\b/)).not.toBeInTheDocument()
    expect(screen.queryByText(/régie/i)).not.toBeInTheDocument()
  })

  // LUDOVIC-C LC.7 — « Régie pure » choisi au profil ne se lisait nulle part dans la page (prod 19/10).
  it('LC.7 — le positionnement CHOISI se lit dans la restitution, dans les mots du vendeur', async () => {
    setup({ company_type: 'industrial_engineering' })
    renderWithRouter(
      <OfferPortfolioSection
        answers={{ ...ANSWERS, positioning: 'Régie pure - on place des profils sur demande' } as unknown as EsnAnswers}
      />,
    )
    expect((await screen.findByTestId('understood-positioning')).textContent).toMatch(/Régie pure/)
  })

  it('LC.7 — dit NON à une ligne vide : sans positionnement choisi, aucune ligne', async () => {
    setup({ company_type: 'industrial_engineering' })
    renderWithRouter(<OfferPortfolioSection answers={ANSWERS} />)
    await screen.findByText(/société de conseil en ingénierie industrielle/i)
    expect(screen.queryByTestId('understood-positioning')).not.toBeInTheDocument()
  })

  it('DIT que rien n’est configuré au lieu de faire passer des vides pour un choix', async () => {
    setup({ source: 'legacy', company_type: 'industrial_engineering' })
    renderWithRouter(<OfferPortfolioSection answers={ANSWERS} />)
    expect(await screen.findByText(/rien n'est encore configuré/i)).toBeInTheDocument()
  })

  it('sans domaine, n’invente aucun type de société', async () => {
    setup({ company_type: null })
    renderWithRouter(<OfferPortfolioSection answers={{} as EsnAnswers} />)
    expect(await screen.findByText(/ne peut pas encore dire ce que tu vends/i)).toBeInTheDocument()
  })

  it('un secteur coché envoie un patch PARTIEL — le reste n’est pas renvoyé', async () => {
    const { mutate } = setup({ target_application_sectors: ['rail'] })
    renderWithRouter(<OfferPortfolioSection answers={ANSWERS} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Nucléaire' }))
    expect(mutate).toHaveBeenCalledWith({ target_application_sectors: ['rail', 'nuclear'] })
  })

  it('un membre sans droit de gestion ne peut rien écrire', async () => {
    const { mutate } = setup({}, false)
    renderWithRouter(<OfferPortfolioSection answers={ANSWERS} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Nucléaire' }))
    expect(mutate).not.toHaveBeenCalled()
    expect(await screen.findByText(/seul un responsable d'équipe/i)).toBeInTheDocument()
  })

  it('le seuil d’effectif vide vaut « aucun seuil » et jamais zéro', async () => {
    const { mutate } = setup({ target_site: { types: [], min_headcount: 100 } })
    renderWithRouter(<OfferPortfolioSection answers={ANSWERS} />)

    const input = await screen.findByRole('spinbutton')
    await userEvent.clear(input)
    await userEvent.tab()

    expect(mutate).toHaveBeenCalledWith({ target_site: { types: [], min_headcount: null } })
  })
})

/**
 * #2076.13 — « ce retour enrichit le workspace ET la recette produit ». Le
 * réglage `privacy.feedback_reuse` existait au contrat sans aucun écran pour
 * l'ouvrir : aucun verdict ne pouvait jamais atteindre la recette produit.
 */
describe('#2076.13 — partager le MOTIF des verdicts avec la recette produit', () => {
  it('fermé par défaut ; cocher envoie un patch PARTIEL generalized_only', async () => {
    const { mutate } = setup()
    renderWithRouter(<OfferPortfolioSection answers={ANSWERS} />)
    const box = await screen.findByRole('checkbox', { name: /recette produit/i })
    expect(box).not.toBeChecked()
    await userEvent.click(box)
    expect(mutate).toHaveBeenCalledWith({ privacy: { feedback_reuse: 'generalized_only' } })
  })

  it('ouvert : décocher referme (tenant_private)', async () => {
    const { mutate } = setup({ privacy: { feedback_reuse: 'generalized_only' } })
    renderWithRouter(<OfferPortfolioSection answers={ANSWERS} />)
    const box = await screen.findByRole('checkbox', { name: /recette produit/i })
    expect(box).toBeChecked()
    await userEvent.click(box)
    expect(mutate).toHaveBeenCalledWith({ privacy: { feedback_reuse: 'tenant_private' } })
  })

  it('sait dire NON — un membre sans droit de gestion ne l’ouvre pas', async () => {
    const { mutate } = setup({}, false)
    renderWithRouter(<OfferPortfolioSection answers={ANSWERS} />)
    const box = await screen.findByRole('checkbox', { name: /recette produit/i })
    expect(box).toBeDisabled()
    expect(mutate).not.toHaveBeenCalled()
  })

  // #4425.3 — « Ce que Bellum a compris » se lisait sans pouvoir se corriger.
  it('#4425.3 — Modifier le mode d’intervention écrit la valeur de la liste fermée sur le profil', async () => {
    const { saveField } = setup({ company_type: 'industrial_engineering' })
    const user = userEvent.setup()
    renderWithRouter(
      <OfferPortfolioSection
        answers={{ ...ANSWERS, positioning: 'Régie pure - on place des profils sur demande' } as unknown as EsnAnswers}
      />,
    )
    await user.click(await screen.findByRole('button', { name: /Modifier — Mode d’intervention/ }))
    await user.click(screen.getByRole('button', { name: /Enregistrer/ }))
    expect(saveField).toHaveBeenCalledWith('positioning', 'Régie pure - on place des profils sur demande')
  })

  it('#4425.3 — sans positionnement, le geste existe quand même (on ajoute, on n’invente pas)', async () => {
    setup({ company_type: 'industrial_engineering' })
    renderWithRouter(<OfferPortfolioSection answers={ANSWERS} />)
    expect(await screen.findByRole('button', { name: /Modifier — Mode d’intervention/ })).toBeInTheDocument()
  })

  it('#4425.3 — le verrou de rôle reste : non admin d’un espace partagé, aucun Modifier (signaler seulement)', async () => {
    const { saveField } = setup({ company_type: 'industrial_engineering' }, false)
    renderWithRouter(
      <OfferPortfolioSection
        answers={{ ...ANSWERS, positioning: 'Régie pure - on place des profils sur demande' } as unknown as EsnAnswers}
      />,
    )
    await screen.findByTestId('understood-positioning')
    expect(screen.queryByRole('button', { name: /Modifier — Mode d’intervention/ })).not.toBeInTheDocument()
    expect(saveField).not.toHaveBeenCalled()
  })
})
