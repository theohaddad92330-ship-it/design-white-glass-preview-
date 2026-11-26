import type { ReactNode } from 'react'
/**
 * #1888 — « replier certaines parties comme sur la vue d'ensemble de compte et
 * tableau de bord pour gagner en visibilité sur la page, je veux PAR EXEMPLE
 * que les phases soient repliées par défaut ».
 *
 * Les phases sont traitées dans `ActionPlanBoard.phases.test.tsx` ; ce fichier
 * couvre l'autre moitié du retour — les blocs de LECTURE sous le tableau — et
 * surtout ce qui ne se replie pas : la fraîcheur du plan, le nudge, les
 * prochains mouvements et le tableau lui-même.
 *
 * ⚠️ Le badge de fraîcheur DATE tout ce qui suit (un plan est un objet vivant,
 * D78). Le replier ferait lire des angles et des échéances sans savoir de quand
 * ils datent : c'est précisément « un repli qui rend faux ce qui reste ».
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Account } from '@bellum/contracts'
import { TabPlan } from './TabPlan'

// #4116 (recette 13/10) — le bandeau de fraîcheur lit `useIsDemo` (hors démo seulement).
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
// #4088 (15/10) — le plan nomme le verdict comme la Synthèse (objectif d'offre lu sur le profil).
// #3235 — la révision du verdict se lit sous lui : ni session ni requête dans cette suite.
vi.mock('@/features/profile/hooks/useEsnProfile', () => ({ useHasOfferObjective: () => true }))
vi.mock('@/features/accounts/hooks/useAccountVerdictRevision', () => ({
  useAccountVerdictRevision: () => ({ data: null }),
}))

vi.mock('@/features/accounts/hooks/useAccountVerdictUnchanged', () => ({
  useAccountVerdictUnchanged: () => ({ data: null }),
}))

// #4415.1 — les étapes d'en-tête viennent d'un hook réseau : par défaut le plan n'en porte aucune.
const stepsMock = vi.hoisted(() => ({ steps: [] as unknown[] }))
vi.mock('./plan/usePlanSteps', () => ({ usePlanSteps: () => stepsMock.steps }))
vi.mock('./plan/PlanStepsList', () => ({
  PlanStepsList: ({ steps }: { steps: unknown[] }) => (steps.length > 0 ? <div>ETAPES-EN-TETE</div> : null),
}))

const motionComponents = new Map<string, unknown>()
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        if (typeof prop === 'string') {
          const cached = motionComponents.get(prop)
          if (cached) return cached
          const Rendered = ({ children, ...props }: any) => {
            const Component = prop
            return <Component {...props}>{children}</Component>
          }
          motionComponents.set(prop, Rendered)
          return Rendered
        }
      },
    },
  ),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

// ── Ce qui reste OUVERT ───────────────────────────────────────────────────────
vi.mock('@tanstack/react-router', async () => ({
  ...(await vi.importActual<object>('@tanstack/react-router')),
  Link: ({ to, children, className }: { to: string; children: ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}))
vi.mock('@/features/tasks/view/TaskList', () => ({ TaskList: () => <div>TACHES-DU-COMPTE</div> }))
vi.mock('./plan/PlanFreshnessBadge', () => ({ PlanFreshnessBadge: () => <div>FRAICHEUR-DU-PLAN</div> }))
vi.mock('./plan/ReplanNudge', () => ({ ReplanNudge: () => <div>REPLANIFIER</div> }))
vi.mock('./plan/PlanNextMoves', () => ({ PlanNextMoves: () => <div>PROCHAINS-MOUVEMENTS</div> }))
vi.mock('./plan/ActionPlanBoard', () => ({ ActionPlanBoard: () => <div>TABLEAU-DES-PHASES</div> }))
vi.mock('./plan/Rank2PathCard', () => ({ Rank2PathCard: () => <div>CHEMIN-RANG2</div> }))
vi.mock('./sections/AccountStrategy5PSection', () => ({ AccountStrategy5PSection: () => <div>STRATEGIE-5P</div> }))

// ── Ce qui se REPLIE ──────────────────────────────────────────────────────────
vi.mock('./plan/ReinforcedAnglesCard', () => ({ ReinforcedAnglesCard: () => <div>ANGLES-RENFORCES</div> }))
vi.mock('./plan/AttackAnglesSection', () => ({ AttackAnglesSection: () => <div>ANGLES-ATTAQUE</div> }))
vi.mock('./plan/MeetingPrepCard', () => ({ MeetingPrepCard: () => <div>PREPA-RDV</div> }))
vi.mock('./plan/MeetingR1R2Panel', () => ({ MeetingR1R2Panel: () => <div>PREPA-R1R2</div> }))
vi.mock('@/features/meeting-notes/view/MeetingNotesCard', () => ({ MeetingNotesCard: () => <div>NOTES-RDV</div> }))
// #2718.2 — `AccountTimelineCard` a quitté ce fichier pour l'onglet Historique
// (`AccountDetailTabContent.test.tsx`) : elle n'est plus montée ici, donc plus
// témoin ni attendue ci-dessous.

// ── Le rail de droite, hors sujet de ce retour ────────────────────────────────
vi.mock('./plan/PlanAttackSummary', () => ({ PlanAttackSummary: () => <div>RESUME</div> }))
vi.mock('./plan/QuestionLibraryCard', () => ({ QuestionLibraryCard: () => <div>BIBLIOTHEQUE</div> }))
vi.mock('./plan/ReverseProspectsSection', () => ({ ReverseProspectsSection: () => <div>EX-COLLABORATEURS</div> }))
vi.mock('./plan/AggregatedTrajectoriesSection', () => ({
  AggregatedTrajectoriesSection: () => <div>TRAJECTOIRES</div>,
}))
vi.mock('./plan/PlanSalesContext', () => ({ PlanSalesContext: () => <div>PROFIL-ESN</div> }))
vi.mock('@/features/linkedin/view/NetworkPlaybookCard', () => ({ NetworkPlaybookCard: () => <div>RESEAU</div> }))
vi.mock('@/features/documents/view/AccountDeliverables', () => ({ AccountDeliverables: () => <div>LIVRABLES</div> }))

const ACCOUNT = { id: 'acc-1', company_name: 'THALES', raw_analysis: {} } as unknown as Account

const ANGLES = "Les angles d'attaque et ce qui les renforce"
const PREPARER = 'Préparer le rendez-vous'

describe('TabPlan — la lecture se replie, le plan et sa date restent (#1888)', () => {
  it('rend DEUX disclosures repliés, chacun un vrai bouton qui dit son état', () => {
    render(<TabPlan account={ACCOUNT} />)

    for (const titre of [ANGLES, PREPARER]) {
      const toggle = screen.getByRole('button', { name: titre })
      expect(toggle).toHaveAttribute('type', 'button')
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
    }
  })

  it('au repos, les cinq blocs de lecture sont ABSENTS du DOM', () => {
    render(<TabPlan account={ACCOUNT} />)

    for (const absent of ['ANGLES-RENFORCES', 'ANGLES-ATTAQUE', 'PREPA-RDV', 'NOTES-RDV', 'CHRONOLOGIE']) {
      expect(screen.queryByText(absent)).not.toBeInTheDocument()
    }
  })

  // Refonte Théo (23/10) — `plan:tasks` : les actions du compte OUVRENT le plan, avant la fraîcheur et les étapes.
  it('Refonte Théo — les actions du compte ouvrent le plan, avec la note « terminée ≠ envoyée »', () => {
    render(<TabPlan account={ACCOUNT} />)
    const tasks = screen.getByTestId('plan-tasks')
    expect(tasks).toHaveTextContent('TACHES-DU-COMPTE')
    expect(
      tasks.compareDocumentPosition(screen.getByText('FRAICHEUR-DU-PLAN')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: /Toutes mes actions/ })).toHaveAttribute('href', '/actions')
  })

  it('⚠️ la fraîcheur du plan reste OUVERTE : sans sa date, les échéances du plan ne veulent rien dire', () => {
    render(<TabPlan account={ACCOUNT} />)

    expect(screen.getByText('FRAICHEUR-DU-PLAN')).toBeInTheDocument()
    expect(screen.getByText('REPLANIFIER')).toBeInTheDocument()
    expect(screen.getByText('PROCHAINS-MOUVEMENTS')).toBeInTheDocument()
    expect(screen.getByText('TABLEAU-DES-PHASES')).toBeInTheDocument()
  })

  it('#3777 — la carte « Cinq questions de terrain » est montée sur le Plan (déplacée depuis la Synthèse)', () => {
    render(<TabPlan account={ACCOUNT} />)

    expect(screen.getByText('STRATEGIE-5P')).toBeInTheDocument()
  })

  it('ouvrir « les angles » ne déplie pas la préparation du rendez-vous', async () => {
    const user = userEvent.setup()
    render(<TabPlan account={ACCOUNT} />)

    await user.click(screen.getByRole('button', { name: ANGLES }))

    expect(screen.getByText('ANGLES-ATTAQUE')).toBeInTheDocument()
    expect(screen.getByText('ANGLES-RENFORCES')).toBeInTheDocument()
    expect(screen.queryByText('NOTES-RDV')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: PREPARER })).toHaveAttribute('aria-expanded', 'false')
  })

  it('ouvrir « préparer » rend les deux blocs qu’il annonce', async () => {
    const user = userEvent.setup()
    render(<TabPlan account={ACCOUNT} />)

    await user.click(screen.getByRole('button', { name: PREPARER }))

    expect(screen.getByText('PREPA-RDV')).toBeInTheDocument()
    expect(screen.getByText('NOTES-RDV')).toBeInTheDocument()
  })
})

describe('TabPlan — méthode et réseau généraux hors de la colonne (#3717)', () => {
  const GENERAL = 'Questions et réseau — général'

  it('la colonne de droite ne porte plus ni la banque de questions ni le réseau', () => {
    render(<TabPlan account={ACCOUNT} />)

    expect(screen.queryByText('BIBLIOTHEQUE')).not.toBeInTheDocument()
    expect(screen.queryByText('RESEAU')).not.toBeInTheDocument()
  })

  it('ils restent accessibles : « préparer » puis « général », deux replis nommés', async () => {
    const user = userEvent.setup()
    render(<TabPlan account={ACCOUNT} />)

    await user.click(screen.getByRole('button', { name: PREPARER }))
    const general = screen.getByRole('button', { name: GENERAL })
    expect(general).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('RESEAU')).not.toBeInTheDocument()

    await user.click(general)
    expect(screen.getByText('BIBLIOTHEQUE')).toBeInTheDocument()
    expect(screen.getByText('RESEAU')).toBeInTheDocument()
  })
})

describe('TabPlan — trois étapes en tête, détail replié dessous (#4415.1)', () => {
  const DETAIL = 'Le détail du plan'

  it('plan sans étape → aucun bloc « étapes » et le détail reste à plat, comme avant', () => {
    stepsMock.steps = []
    render(<TabPlan account={ACCOUNT} />)

    expect(screen.queryByText('ETAPES-EN-TETE')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: DETAIL })).not.toBeInTheDocument()
    expect(screen.getByText('TABLEAU-DES-PHASES')).toBeInTheDocument()
  })

  it('plan avec étapes → étapes visibles, détail du plan REPLIÉ mais accessible', async () => {
    stepsMock.steps = [{ number: 1 }]
    const user = userEvent.setup()
    render(<TabPlan account={ACCOUNT} />)

    expect(screen.getByText('ETAPES-EN-TETE')).toBeInTheDocument()
    const fold = screen.getByRole('button', { name: DETAIL })
    expect(fold).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('TABLEAU-DES-PHASES')).not.toBeInTheDocument()

    await user.click(fold)
    expect(screen.getByText('TABLEAU-DES-PHASES')).toBeInTheDocument()
    expect(screen.getByText('PROCHAINS-MOUVEMENTS')).toBeInTheDocument()
    stepsMock.steps = []
  })

  it('un lien d’arrivée vers une ligne du tableau ouvre le détail d’office', () => {
    stepsMock.steps = [{ number: 1 }]
    render(<TabPlan account={ACCOUNT} highlightActionId="act-1" />)

    expect(screen.getByText('TABLEAU-DES-PHASES')).toBeInTheDocument()
    stepsMock.steps = []
  })
})
