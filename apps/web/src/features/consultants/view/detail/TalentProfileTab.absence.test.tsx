import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Consultant } from '@bellum/contracts'
import { TalentProfileTab } from './TalentProfileTab'
import { useEnrichTalent } from '../../hooks'

vi.mock('@/features/profiles/hooks/useProfile', () => ({ useProfile: () => ({ data: null }) }))

// #3935.2b — la ligne « Expériences » lit `consultant_experiences`.
const experiencesData = vi.hoisted(() => ({ current: [] as unknown[] }))
vi.mock('../../talent-api', () => ({
  useTalentExperiences: () => ({ data: experiencesData.current }),
}))

vi.mock('../../hooks', () => ({
  useEnrichTalent: vi.fn(),
  useSearchTalentByName: () => ({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
  }),
  useConfirmTalentAvailability: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useConfirmTjmValidated: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isSuccess: false }),
  useConfirmCvValidated: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isSuccess: false }),
  useRecordInterviewTrait: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useRecordRampUp: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  // #3406 — `TalentProfileTab` monte aussi le renseignement terrain.
  useRecordFieldReport: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  }),
}))
vi.mocked(useEnrichTalent).mockReturnValue({
  mutate: vi.fn(),
  isPending: false,
  isSuccess: false,
  isError: false,
  data: undefined,
  error: null,
} as unknown as ReturnType<typeof useEnrichTalent>)

const TALENT_ID = '11111111-1111-4111-8111-111111111111'

function baseTalent(overrides: Partial<Consultant> = {}): Consultant {
  return {
    id: TALENT_ID,
    kind: 'candidate',
    full_name: 'Alix Martin',
    title: 'Ingénieure plateforme',
    seniority: 'senior',
    contract_type: 'freelance',
    engagement_kind: 'mission',
    contact_visible: true,
    finance_visible: true,
    email: null,
    phone: null,
    location: null,
    education: [],
    public_profile_url: null,
    availability: 'inconnu',
    ...overrides,
  } as unknown as Consultant
}

// SIMON-FIX S.4 — recette Simon 20/10 : la fiche d'un consultant sans nom
// affichait ~40 « Non renseigné ». Une rubrique absente ne fait AUCUNE ligne
// (doctrine 20/09, c113) ; un groupe sans aucune ligne ne s'affiche pas.
describe('TalentProfileTab — une rubrique absente ne s’affiche pas (SIMON-FIX S.4)', () => {
  it('ne rend aucun « Non renseigné » pour une fiche presque vide', () => {
    render(<TalentProfileTab talent={baseTalent({ location: null, email: null, phone: null })} />)
    expect(screen.queryAllByText('Non renseigné')).toHaveLength(0)
  })

  it('garde la ligne dès qu’elle a une valeur', () => {
    render(<TalentProfileTab talent={baseTalent({ location: 'Paris (75)', email: 'a@b.fr' })} />)
    expect(screen.getByText('Paris (75)')).toBeInTheDocument()
    // #4405.2 (GA-26) — l'e-mail ne se redit pas ici : il vit dans le groupe inline « Coordonnées ».
    expect(screen.queryByText('a@b.fr')).not.toBeInTheDocument()
  })

  it('dit « pas ton périmètre » quand les coordonnées sont retirées (ce n’est pas une absence)', () => {
    render(<TalentProfileTab talent={baseTalent({ contact_visible: false })} />)
    expect(screen.getAllByText('Masqué par le réglage de ton espace').length).toBeGreaterThan(0)
  })
})
