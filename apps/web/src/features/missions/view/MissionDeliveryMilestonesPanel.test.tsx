import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MissionDeliveryMilestoneStatus } from '@bellum/contracts'

const milestones = vi.fn()
const mutate = vi.fn()
vi.mock('../api', () => ({
  useMissionDeliveryMilestones: () => milestones(),
  useDeclareMissionDeliveryMilestone: () => ({ mutate, isPending: false }),
}))

const { MissionDeliveryMilestonesPanel } = await import('./MissionDeliveryMilestonesPanel')

const ID = '11111111-1111-4111-8111-111111111111'

function declared(overrides: Partial<MissionDeliveryMilestoneStatus> = {}): MissionDeliveryMilestoneStatus {
  return {
    key: 'brief_consultant',
    mode: 'declared',
    labelFr: 'Brief consultant',
    labelEn: 'Consultant brief',
    state: 'not_started',
    groundedIn: null,
    note: null,
    confirmedAt: null,
    confirmedBy: null,
    ...overrides,
  }
}

function projected(overrides: Partial<MissionDeliveryMilestoneStatus> = {}): MissionDeliveryMilestoneStatus {
  return {
    key: 'cra',
    mode: 'projected',
    labelFr: 'CRA',
    labelEn: 'Timesheet',
    state: 'not_evaluable',
    groundedIn: 'mission-timesheet-review.ts',
    note: 'Aucune lecture croisée disponible pour ce mois.',
    confirmedAt: null,
    confirmedBy: null,
    ...overrides,
  }
}

beforeEach(() => {
  cleanup()
  milestones.mockReset()
  mutate.mockReset()
})

describe('MissionDeliveryMilestonesPanel — #3269 (reste de #3291)', () => {
  it('rien à lire : aucune carte (jamais dix-sept lignes vides)', () => {
    milestones.mockReturnValue({ data: [] })
    const { container } = render(<MissionDeliveryMilestonesPanel missionId={ID} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('un jalon PROJETÉ non évaluable nomme sa raison — jamais un état muet', () => {
    milestones.mockReturnValue({ data: [projected()] })
    render(<MissionDeliveryMilestonesPanel missionId={ID} />)
    expect(screen.getByText('Non évaluable')).toBeInTheDocument()
    expect(screen.getByText('Aucune lecture croisée disponible pour ce mois.')).toBeInTheDocument()
    // Un jalon projeté n'a pas de bouton de déclaration — il se lit, ne se pose pas.
    expect(screen.queryByRole('button', { name: 'Déclarer' })).not.toBeInTheDocument()
  })

  it('un jalon DÉCLARÉ pas commencé propose de le déclarer, avec une note obligatoire', async () => {
    milestones.mockReturnValue({ data: [declared()] })
    render(<MissionDeliveryMilestonesPanel missionId={ID} />)
    const row = screen.getByTestId('delivery-milestone-brief_consultant')

    await userEvent.click(within(row).getByRole('button', { name: 'Déclarer' }))
    const save = within(row).getByRole('button', { name: 'Enregistrer' })
    expect(save).toBeDisabled()

    await userEvent.type(within(row).getByRole('textbox'), 'Envoyé le 20/09')
    await userEvent.click(save)

    expect(mutate).toHaveBeenCalledWith({ key: 'brief_consultant', note: 'Envoyé le 20/09' })
  })

  it('un jalon déjà confirmé montre sa note et sa date — sans bouton de déclaration', () => {
    milestones.mockReturnValue({
      data: [
        declared({
          state: 'done',
          note: 'Brief envoyé le 20/09',
          confirmedAt: '2026-09-20T10:00:00Z',
          confirmedBy: 'u1',
        }),
      ],
    })
    render(<MissionDeliveryMilestonesPanel missionId={ID} />)
    const row = screen.getByTestId('delivery-milestone-brief_consultant')
    expect(row).toHaveTextContent('Brief envoyé le 20/09')
    expect(within(row).queryByRole('button', { name: 'Déclarer' })).not.toBeInTheDocument()
  })

  // #3269.3/#3269.4 (suite #3291) — « tranché sans Louis » : la qualification
  // se propose automatiquement dès que le jalon est confirmé, jamais sur
  // demande explicite. Un jalon de CADRAGE (brief_consultant) qualifie une
  // ACTION (CRM → ACTION) ; jamais de bouton d'écriture — le texte nomme,
  // il ne promet pas un geste qui n'existe pas encore pour ce jalon.
  it('un jalon de cadrage confirmé nomme la boucle ACTION qu’il pourrait alimenter', () => {
    milestones.mockReturnValue({
      data: [declared({ key: 'brief_client', state: 'done', note: 'Le client veut un point hebdo.' })],
    })
    render(<MissionDeliveryMilestonesPanel missionId={ID} />)
    const row = screen.getByTestId('delivery-milestone-brief_client')
    expect(within(row).getByText('Pourrait alimenter une action.')).toBeInTheDocument()
  })

  it('un jalon de suivi confirmé nomme la boucle SIGNAL qu’il pourrait alimenter', () => {
    milestones.mockReturnValue({
      data: [
        declared({
          key: 'revue_debut',
          labelFr: 'Revue de début',
          labelEn: 'Early review',
          state: 'done',
          note: 'Projet de refonte SI côté client.',
        }),
      ],
    })
    render(<MissionDeliveryMilestonesPanel missionId={ID} />)
    const row = screen.getByTestId('delivery-milestone-revue_debut')
    expect(within(row).getByText('Pourrait alimenter un signal.')).toBeInTheDocument()
  })

  it('un jalon pas commencé, ou projeté, ne nomme aucune boucle — rien à qualifier', () => {
    milestones.mockReturnValue({ data: [declared(), projected()] })
    render(<MissionDeliveryMilestonesPanel missionId={ID} />)
    expect(screen.queryByText('Pourrait alimenter une action.')).not.toBeInTheDocument()
    expect(screen.queryByText('Pourrait alimenter un signal.')).not.toBeInTheDocument()
  })

  // #3291 (recette prod 01/10) — dix-sept pastilles empilées dont quatorze « Pas
  // commencé » : les jalons sans état se replient sous UN compte.
  it('les jalons pas commencés se replient sous un seul compte, ceux qui ont un état restent lisibles', () => {
    milestones.mockReturnValue({
      data: [
        declared({ key: 'brief_consultant', state: 'done', note: 'Envoyé' }),
        projected(),
        declared({ key: 'revue_debut', labelFr: 'Revue de début', state: 'not_started' }),
        declared({ key: 'suivi_periodique', labelFr: 'Suivi périodique', state: 'not_started' }),
      ],
    })
    render(<MissionDeliveryMilestonesPanel missionId={ID} />)
    const group = screen.getByTestId('delivery-milestones-not-started')
    expect(group.tagName).toBe('DETAILS')
    expect(group).not.toHaveAttribute('open')
    expect(within(group).getByText('2 jalons pas commencés')).toBeInTheDocument()
    expect(within(group).getByTestId('delivery-milestone-revue_debut')).toBeInTheDocument()
    // Le fait et le non-évaluable (nommé) restent HORS du repli.
    expect(group).not.toContainElement(screen.getByTestId('delivery-milestone-brief_consultant'))
    expect(group).not.toContainElement(screen.getByTestId('delivery-milestone-cra'))
  })

  it('NON — aucun jalon pas commencé : pas de repli vide', () => {
    milestones.mockReturnValue({ data: [declared({ state: 'done', note: 'Envoyé' })] })
    render(<MissionDeliveryMilestonesPanel missionId={ID} />)
    expect(screen.queryByTestId('delivery-milestones-not-started')).not.toBeInTheDocument()
  })

  it('chaque ligne partage la même grille pleine largeur (libellé | état | détail alignés)', () => {
    milestones.mockReturnValue({
      data: [declared({ state: 'done', note: 'Envoyé' }), projected(), declared({ key: 'revue_debut' })],
    })
    render(<MissionDeliveryMilestonesPanel missionId={ID} />)
    const classes = ['brief_consultant', 'cra', 'revue_debut'].map(
      key => screen.getByTestId(`delivery-milestone-${key}`).className,
    )
    expect(new Set(classes).size).toBe(1)
    expect(classes[0]).toContain('sm:grid-cols-[')
    expect(classes[0]).not.toContain('flex-wrap')
  })

  // #3413 (recette prod 02/10) — « Pas commencé » à côté d'une projection affichée.
  it('un jalon pas commencé qui affiche une projection sort du repli et ne dit PAS « Pas commencé »', () => {
    milestones.mockReturnValue({
      data: [
        projected({
          key: 'expansion',
          labelFr: 'Expansion',
          state: 'not_started',
          note: 'Entités connues du client : DSI, NOVA Supply Chain',
        }),
        declared({ key: 'revue_debut', labelFr: 'Revue de début', state: 'not_started' }),
      ],
    })
    render(<MissionDeliveryMilestonesPanel missionId={ID} />)
    const row = screen.getByTestId('delivery-milestone-expansion')
    expect(within(row).getByText(/Entités connues du client/)).toBeInTheDocument()
    expect(within(row).queryByText('Pas commencé')).not.toBeInTheDocument()
    expect(within(row).getByText('Piste connue')).toBeInTheDocument()
    const group = screen.getByTestId('delivery-milestones-not-started')
    expect(group).not.toContainElement(row)
    // TÉMOIN : le jalon sans rien à montrer reste replié, et dit bien « Pas commencé ».
    expect(within(group).getByText('Pas commencé')).toBeInTheDocument()
  })

  it('le repli et la liste prennent toute la largeur de la carte', () => {
    milestones.mockReturnValue({
      data: [declared({ state: 'done', note: 'Envoyé' }), declared({ key: 'revue_debut' })],
    })
    render(<MissionDeliveryMilestonesPanel missionId={ID} />)
    expect(screen.getByTestId('delivery-milestones-not-started').className).toContain('w-full')
    expect(screen.getAllByRole('list')[0].className).toContain('w-full')
  })
})

describe('MissionDeliveryMilestonesPanel — X37 / #3413 : « Piste connue »', () => {
  it('un jalon dont une piste est connue sort du repli « pas commencés » et se lit « Piste connue »', () => {
    milestones.mockReturnValue({
      data: [
        projected({
          key: 'expansion',
          labelFr: 'Expansion',
          state: 'lead_known',
          note: 'Entités connues du client : Direction des systèmes d’information, NOVA Supply Chain',
        }),
        declared(),
      ],
    })
    render(<MissionDeliveryMilestonesPanel missionId={ID} />)
    const folded = screen.getByTestId('delivery-milestones-not-started')
    expect(within(folded).queryByText('Expansion')).not.toBeInTheDocument()
    expect(screen.getByText('Piste connue')).toBeInTheDocument()
    expect(screen.getByText(/NOVA Supply Chain/)).toBeInTheDocument()
  })
})
