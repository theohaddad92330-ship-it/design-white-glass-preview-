import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Consultant } from '@bellum/contracts'
import { ApiError } from '@/lib/api-error'
import { TalentEnrichAction } from './TalentEnrichAction'
import { useEnrichTalent, useSearchTalentByName } from '../../hooks'

vi.mock('../../hooks', () => ({ useEnrichTalent: vi.fn(), useSearchTalentByName: vi.fn() }))

const TALENT_ID = '11111111-1111-4111-8111-111111111111'

function baseTalent(overrides: Partial<Consultant> = {}): Consultant {
  return {
    ...overrides,
    id: TALENT_ID,
    full_name: 'Yanis Berthier',
    title: 'Ingénieur plateforme (CV 2023)',
    last_enrichment_at: null,
    last_enrichment_source: null,
    ...overrides,
  } as unknown as Consultant
}

function mockMutation(overrides: Partial<ReturnType<typeof useEnrichTalent>> = {}) {
  vi.mocked(useEnrichTalent).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: null,
    ...overrides,
  } as unknown as ReturnType<typeof useEnrichTalent>)
}

function mockSearch(overrides: Partial<ReturnType<typeof useSearchTalentByName>> = {}) {
  vi.mocked(useSearchTalentByName).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
    ...overrides,
  } as unknown as ReturnType<typeof useSearchTalentByName>)
}

/**
 * #2570 — le bouton reste un GESTE (jamais de chargement automatique), et le
 * résultat porte toujours sa source et sa date (`Provenance`) — « un fait
 * périmé redevient inconnu avec sa date, il ne disparaît pas ».
 */
describe('TalentEnrichAction — #2570', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("n'a rien recherché au montage — aucun appel réseau tant qu'on ne clique pas", () => {
    const mutate = vi.fn()
    mockMutation({ mutate })
    mockSearch()
    render(<TalentEnrichAction talent={baseTalent()} />)
    expect(mutate).not.toHaveBeenCalled()
  })

  it('déclenche la recherche au clic, une seule fois', () => {
    const mutate = vi.fn()
    mockMutation({ mutate })
    mockSearch()
    render(<TalentEnrichAction talent={baseTalent()} />)
    fireEvent.click(screen.getByRole('button'))
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it('montre le titre courant avec sa provenance après un résultat', () => {
    mockMutation({
      isSuccess: true,
      data: {
        consultant: { ...baseTalent(), title: 'Lead DevOps', last_enrichment_at: '2026-09-17T10:00:00.000Z' },
        written: [{ field: 'title', value: 'Lead DevOps', source: 'pipeline' }],
      },
    })
    mockSearch()
    render(<TalentEnrichAction talent={baseTalent()} />)
    expect(screen.getByText('Lead DevOps')).toBeTruthy()
  })

  it("dit explicitement qu'aucune recherche n'a encore eu lieu — jamais une date muette", () => {
    mockMutation()
    mockSearch()
    render(<TalentEnrichAction talent={baseTalent()} />)
    expect(screen.getByText(/pas encore recherché/i)).toBeTruthy()
  })

  // #2570 — « enrichir comme un contact » : la recherche exige un profil
  // LinkedIn ; le dire AVANT de dépenser un crédit, et nommer ce qui a été
  // retrouvé APRÈS (e-mail, téléphone…), pas seulement le poste.
  it('#2570 — dit avant le clic qu’il faut un profil LinkedIn quand la fiche n’en a pas', () => {
    mockMutation()
    render(<TalentEnrichAction talent={baseTalent({ contact_visible: true, public_profile_url: null })} />)
    expect(screen.getByText(/profil professionnel enregistré/i)).toBeTruthy()
  })

  it('#2570 — contrôle négatif : avec un profil enregistré, aucun avertissement', () => {
    mockMutation()
    render(
      <TalentEnrichAction
        talent={baseTalent({ contact_visible: true, public_profile_url: 'https://www.linkedin.com/in/x' })}
      />,
    )
    expect(screen.queryByText(/profil professionnel enregistré/i)).toBeNull()
  })

  it('#2570 — nomme les champs retrouvés (e-mail, téléphone), pas seulement le poste', () => {
    mockMutation({
      isSuccess: true,
      data: {
        consultant: { ...baseTalent(), last_enrichment_at: '2026-09-17T10:00:00.000Z' },
        written: [
          { field: 'email', value: 'a@b.fr', source: 'pipeline' },
          { field: 'phone', value: '0600000000', source: 'pipeline' },
        ],
      },
    })
    render(<TalentEnrichAction talent={baseTalent()} />)
    expect(screen.getByText(/Retrouvé : e-mail, téléphone/)).toBeTruthy()
  })

  it('affiche le message du serveur sur un échec — jamais une phrase inventée à sa place', () => {
    mockMutation({ isError: true, error: new Error('Cette fiche n’a pas de profil LinkedIn enregistré') })
    mockSearch()
    render(<TalentEnrichAction talent={baseTalent()} />)
    expect(screen.getByRole('alert').textContent).toContain('profil LinkedIn')
  })
})

/**
 * #3831.1 — retour bêta 07/10/2026 : « il faudrait pouvoir enrichir sans
 * forcément avoir le linkedin de la personne […] et si ça colle on met ». Le
 * blocage SANS profil LinkedIn (`code: 'no_match_key'`) ouvre la recherche
 * libre par nom déjà branchée côté API (`search-by-name`, #2727 côté
 * contacts) — jamais un rapprochement sur le seul nom : l'homonyme reste
 * CHOISI par l'utilisateur avant tout reveal payant.
 */
describe('TalentEnrichAction — #3831.1 (enrichir sans profil LinkedIn)', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('ne propose PAS la recherche par nom sur un échec SANS CODE (ex. panne réseau)', () => {
    mockMutation({ isError: true, error: new Error('Erreur 503') })
    mockSearch()
    render(<TalentEnrichAction talent={baseTalent()} />)
    expect(screen.queryByRole('button', { name: /chercher par nom/i })).toBeNull()
  })

  it('ne propose PAS la recherche par nom sur `no_identity` — chercher sans nom serait deviné', () => {
    mockMutation({ isError: true, error: new ApiError('Cette fiche n’a pas de nom', 400, 'no_identity') })
    mockSearch()
    render(<TalentEnrichAction talent={baseTalent()} />)
    expect(screen.queryByRole('button', { name: /chercher par nom/i })).toBeNull()
  })

  it('propose la recherche par nom sur `no_match_key` — sans profil LinkedIn', () => {
    mockMutation({
      isError: true,
      error: new ApiError('Cette fiche n’a pas de profil LinkedIn enregistré', 400, 'no_match_key'),
    })
    mockSearch()
    render(<TalentEnrichAction talent={baseTalent()} />)
    expect(screen.getByRole('button', { name: /chercher par nom/i })).toBeTruthy()
  })

  it('cherche par nom au clic, préremplie avec le nom de la fiche — jamais un nom tapé à la main', () => {
    const search = vi.fn()
    mockMutation({
      isError: true,
      error: new ApiError('Cette fiche n’a pas de profil LinkedIn enregistré', 400, 'no_match_key'),
    })
    mockSearch({ mutate: search })
    render(<TalentEnrichAction talent={baseTalent({ full_name: 'Yanis Berthier' })} />)
    fireEvent.click(screen.getByRole('button', { name: /chercher par nom/i }))
    fireEvent.click(screen.getByRole('button', { name: /^chercher$/i }))
    expect(search).toHaveBeenCalledWith({ fullName: 'Yanis Berthier', organizationName: undefined })
  })

  it("affiche les homonymes SANS coordonnée (poste/entreprise/ville) et enrichit l'homonyme CHOISI", () => {
    const enrich = vi.fn()
    mockMutation({
      isError: true,
      error: new ApiError('Cette fiche n’a pas de profil LinkedIn enregistré', 400, 'no_match_key'),
      mutate: enrich,
    })
    mockSearch({
      isSuccess: true,
      data: {
        status: 'ok',
        hits: [
          {
            id: 'apollo-42',
            firstName: 'Yanis',
            lastNameObfuscated: 'B***',
            title: 'Responsable Commercial',
            organizationName: 'Nordia',
            city: 'Paris',
            country: 'France',
            hasEmail: true,
            hasPhone: false,
          },
        ],
      },
    })
    render(<TalentEnrichAction talent={baseTalent()} />)
    fireEvent.click(screen.getByRole('button', { name: /chercher par nom/i }))
    expect(screen.getByText('Responsable Commercial')).toBeTruthy()
    expect(screen.getByText('Nordia')).toBeTruthy()
    expect(screen.queryByText(/@/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /choisir/i }))
    expect(enrich).toHaveBeenCalledWith({ apolloId: 'apollo-42' })
  })

  /**
   * #3831 — recette 07/10 : un homonyme sans ville affichait une ligne « , France »
   * (séparateur orphelin) ; un poste absent affichait une ligne vide. Une valeur
   * absente ne fait AUCUNE ligne (GA-18/GA-19), jamais une virgule résiduelle.
   */
  it('#3831 — ville/poste absents ne laissent ni ligne vide ni séparateur orphelin', () => {
    mockMutation({
      isError: true,
      error: new ApiError('Cette fiche n’a pas de profil LinkedIn enregistré', 400, 'no_match_key'),
    })
    mockSearch({
      isSuccess: true,
      data: {
        status: 'ok',
        hits: [
          {
            id: 'apollo-43',
            firstName: 'Sacha',
            lastNameObfuscated: 'D***',
            title: '',
            organizationName: 'Nordia',
            city: '',
            country: 'France',
            hasEmail: false,
            hasPhone: false,
          },
        ],
      },
    })
    render(<TalentEnrichAction talent={baseTalent()} />)
    fireEvent.click(screen.getByRole('button', { name: /chercher par nom/i }))
    expect(screen.getByText('Sacha D***')).toBeTruthy()
    expect(screen.queryByText(/^,/)).toBeNull()
    expect(screen.queryByText(/,\s*$/)).toBeNull()
    expect(screen.getByText('France')).toBeTruthy()
  })
})
