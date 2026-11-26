import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AuditMilestone, AuditProductAreaConfiguration, AuditWeek } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AuditPlanAndMilestones } from './AuditPlanAndMilestones'

/**
 * #2068 — LE CHAÎNON MANQUANT : que le plan à 4 semaines, les paliers et la
 * configuration produit ARRIVENT à l'écran quand une source les mesure, et
 * que l'écran NOMME leur absence sinon — jamais une case vide, jamais un
 * plan à 3 slots inventé pour remplir l'espace.
 */

const PLAN: AuditWeek[] = [
  {
    weekNumber: 1,
    priorities: [
      {
        expectedResult: 'Deux comptes prioritaires qualifiés',
        action: 'Ouvrir deux analyses sur les comptes visés',
        owner: 'Le commercial',
        slot: null,
        // #2068.7-.10 — les 4 derniers champs du contrat n'avaient aucun
        // rendu : ce fixture les porte pour que le test sache dire NON tant
        // qu'ils ne s'affichent pas.
        dependency: 'Le profil de compte doit être validé',
        completionProof: 'Deux analyses ouvertes et partagées',
        surfaceLink: '/settings/profile/audit',
        replacementCondition: 'Si aucun compte visé ne répond sous 5 jours',
        // #2068.24-.31 — le domaine que cette priorité fait avancer, quand
        // Actions le sait : sans rendu jusqu'à ce lot.
        domain: 'contacts',
      },
    ],
  },
  { weekNumber: 2, priorities: [] },
  { weekNumber: 3, priorities: [] },
  { weekNumber: 4, priorities: [] },
]

const MILESTONES: AuditMilestone[] = [
  {
    horizon: '60d',
    systemObjective: 'Un rythme de prospection tenu sans y penser',
    // #2068.15/.17/.18 — idem : trois champs du palier sans aucun rendu.
    expectedProof: 'Trois semaines de suite avec le volume recommandé',
    passageCondition: 'Trois semaines de suite au rythme recommandé',
    decisionToMake: 'Ajuster la cadence ou le périmètre visé',
    correctionIfNotReached: 'Revoir la charge ou les créneaux disponibles',
  },
]

const PRODUCT_CONFIGURATION: AuditProductAreaConfiguration[] = [
  {
    area: 'contacts',
    parameters: [
      {
        key: 'niveau de contacts',
        value: 'Manager',
        trace: { statement: 'Réponse validée du questionnaire', provenance: null },
      },
    ],
  },
]

describe('AuditPlanAndMilestones', () => {
  it('rend le plan, les paliers et la configuration quand une source les mesure', async () => {
    renderWithRouter(
      <AuditPlanAndMilestones
        thirtyDayPlan={PLAN}
        milestones={MILESTONES}
        productConfiguration={PRODUCT_CONFIGURATION}
      />,
    )
    expect(await screen.findByText('Ouvrir deux analyses sur les comptes visés')).toBeInTheDocument()
    expect(screen.getByText('Un rythme de prospection tenu sans y penser')).toBeInTheDocument()
    expect(screen.getByText('niveau de contacts : Manager')).toBeInTheDocument()
    // #2068.7-.10 — dépendance, preuve de réalisation, lien de surface et
    // condition de remplacement : les 4 champs sans rendu jusqu'à ce lot.
    expect(screen.getByText('Dépendance : Le profil de compte doit être validé')).toBeInTheDocument()
    expect(screen.getByText('Preuve de réalisation : Deux analyses ouvertes et partagées')).toBeInTheDocument()
    expect(screen.getByText('Surface : /settings/profile/audit')).toBeInTheDocument()
    expect(
      screen.getByText('Condition de remplacement : Si aucun compte visé ne répond sous 5 jours'),
    ).toBeInTheDocument()
    // #2068.15/.17/.18 — preuve attendue, décision à prendre, correction.
    expect(screen.getByText('Preuve attendue : Trois semaines de suite avec le volume recommandé')).toBeInTheDocument()
    expect(screen.getByText('Décision à prendre : Ajuster la cadence ou le périmètre visé')).toBeInTheDocument()
    expect(
      screen.getByText('Si le palier n’est pas atteint : Revoir la charge ou les créneaux disponibles'),
    ).toBeInTheDocument()
    // #2068.33 — chaque paramètre remonte à une réponse ou conclusion
    // VALIDÉE : la trace était dans le contrat, jamais montrée à l'écran.
    expect(screen.getByText('D’après : Réponse validée du questionnaire')).toBeInTheDocument()
    // #2068.24-.31 — le domaine porté par la priorité, nommé via l'i18n
    // partagé de `productConfiguration.area.*` (GA-26, un seul libellé par
    // aire produit).
    expect(screen.getByText('Domaine : Contacts')).toBeInTheDocument()
    // #2068.1 — un plan LU depuis Actions renvoie vers Actions, il ne se
    // réplique jamais ici.
    expect(screen.getByRole('link', { name: 'Ouvrir dans Actions' })).toHaveAttribute('href', '/actions')
  })

  it('nomme « non mesuré » le plan, les paliers et la configuration quand aucune source ne les produit', async () => {
    const { container } = renderWithRouter(
      <AuditPlanAndMilestones thirtyDayPlan={null} milestones={null} productConfiguration={null} />,
    )
    // Les trois blocs sont NOMMÉS, pas seulement absents.
    expect((await screen.findAllByText('non mesuré')).length).toBe(3)
    const rendered = container.textContent ?? ''
    expect(rendered).not.toMatch(/\d+\s?%/)
    expect(rendered).not.toMatch(/\/\s?100\b/)
    // #2068.1 — « aucune action ouverte » NOMME sa raison ET renvoie vers
    // Actions pour en créer une, jamais un plan inventé pour remplir l'espace.
    expect(screen.getByText('Aucune action ouverte ne permet encore de produire ce plan.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Créer une action dans Actions' })).toHaveAttribute('href', '/actions')
  })

  it('#2068.1 — une semaine SANS priorité dit « rien de planifié », jamais un 0 muet ni un lien absent', async () => {
    renderWithRouter(<AuditPlanAndMilestones thirtyDayPlan={PLAN} milestones={null} productConfiguration={null} />)
    expect(await screen.findAllByText('Aucune priorité nommée cette semaine.')).toHaveLength(3)
  })
})
