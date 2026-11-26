import { fireEvent, screen } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import type { PersonalCockpitResponse } from '@bellum/contracts'
import { resetLauraIntro, useLauraOpenRequest } from '@/features/laura/bubble/laura-intro-store'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { PersonalCockpit } from './PersonalCockpit'

/**
 * #2114.64 — « Préparer une revue », même patron que le cockpit manager
 * (`manager.json` `askLaura.label` = « Préparer ma revue d'équipe »,
 * `ManagerDashboardPage.tsx:188`) : un second point d'entrée Laura, tourné
 * vers la revue personnelle plutôt que celle de l'équipe.
 *
 * ⚠️ RECETTE ÉCRAN DU 25/09/2026 — CE FICHIER MASQUAIT LE DÉFAUT QU'IL DEVAIT
 * PROUVER.
 * ─────────────────────────────────────────────────────────────────────────
 * La version précédente moquait `useAskLauraIntro` à `false` pour les DEUX
 * CTA — « sans dépendre de qui gagne la course », disait le commentaire.
 * C'est exactement ce qui a caché la régression mesurée en prod : ce CTA
 * PERDAIT la course (#1812, « le dernier monté gagne la bulle, son propre
 * lien s'efface ») et disparaissait purement et simplement du DOM, la
 * question ne survivant qu'en suggestion de la bulle flottante. Aucun test
 * moquant la course ne pouvait le voir.
 *
 * Ce fichier n'importe donc PLUS ce mock : il laisse le magasin réel de
 * `laura-intro-store` trancher, comme un navigateur le ferait, et remet le
 * magasin à zéro entre les tests (même patron que
 * `RenewalDecisionPanel.laura-intro.test.tsx`) — un état de module qui
 * survit à `cleanup()`.
 */
const { mockUse } = vi.hoisted(() => ({ mockUse: vi.fn() }))
vi.mock('../../hooks/usePersonalCockpit', () => ({ usePersonalCockpit: () => mockUse() }))

afterEach(() => {
  resetLauraIntro()
})

const EMPTY: PersonalCockpitResponse = {
  kpis: { my_accounts: 0, relances_open: 0, relances_overdue: 0, messages_this_week: 0 },
  priorities: [],
  relances: [],
  accounts: [],
  messages: [],
}

describe('PersonalCockpit — « Préparer une revue »', () => {
  it('reste un bouton réel dans le DOM même quand il gagne la course de la bulle (#2114.64)', async () => {
    mockUse.mockReturnValue({ loading: false, data: EMPTY })
    renderWithRouter(<PersonalCockpit />)

    // Les DEUX CTA d'en-tête cohabitent — ni l'un ni l'autre ne s'efface au
    // profit de la bulle, contrairement à une liste où perdre la course est
    // sans perte (`DormantOpportunitiesCard.ctas.test.tsx`).
    expect(await screen.findByText('Analyser mon activité')).toBeInTheDocument()
    expect(await screen.findByText('Préparer une revue')).toBeInTheDocument()
  })

  it('ouvre Laura avec la demande de revue pré-remplie — même mécanique que les CTA existants', async () => {
    mockUse.mockReturnValue({ loading: false, data: EMPTY })
    // #4309.1 (lot LAURA, 19/10/2026) — sur bureau, le CTA ouvre la bulle SUR PLACE : un bouton qui dépose
    // la question dans le magasin de Laura, lue ici comme la bulle la lit.
    function OpenRequestProbe() {
      return <output data-testid="laura-open-request">{useLauraOpenRequest()?.question ?? ''}</output>
    }
    renderWithRouter(
      <>
        <PersonalCockpit />
        <OpenRequestProbe />
      </>,
    )

    const cta = (await screen.findByText('Préparer une revue')).closest('button')
    expect(cta).not.toBeNull()
    // Cible tactile ≥ 44 px (pointer grossier) — héritée du composant
    // partagé, pas réécrite ici.
    expect(cta?.className).toContain('pointer-coarse:min-h-11')
    // Icône NOMMÉE : l'icône se tait (`aria-hidden`), le libellé lisible
    // porte l'accessibilité — jamais une icône seule.
    expect(cta?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')

    fireEvent.click(cta!)
    expect(screen.getByTestId('laura-open-request').textContent).toContain('Prépare ma revue')
  })
})
