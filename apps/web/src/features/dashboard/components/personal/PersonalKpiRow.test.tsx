/**
 * #2108.37 — mesuré à l'écran le 18/09/2026 sur `/dashboard` : la tuile
 * « Messages (7j) » porte un bouton dont l'aria-label promet « voir le détail »
 * mais qui, quand `perspective` est absent de la réponse (déploiement en
 * décalage, ou simplement pas encore calculé), n'amenait RIEN à l'écran —
 * `revealTarget('cockpit-messages')` cherchait un id qui n'existe pas tant que
 * la section « opportunités » n'est pas montée. Un bouton qui SONNE comme une
 * lecture n'en est pas une (règle du chantier).
 *
 * La messagerie existe déjà comme écran (`/mailbox`, « Ta messagerie ») : la
 * tuile y navigue désormais, comme les tuiles de relances naviguent déjà vers
 * `/actions` (#1409 rouvert).
 */
import { fireEvent, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { PersonalCockpitKpis } from '@bellum/contracts'
import { render } from '@testing-library/react'
import { PersonalKpiRow } from './PersonalKpiRow'

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))

// Le paramètre est TYPÉ ici : `vi.fn(() => true)` s'infère à zéro argument,
// et l'appel plus bas devient alors une erreur de compilation — verte en
// vitest, rouge au `tsc` de la CI, donc trouvée une heure plus tard.
const revealTarget = vi.fn((_id: string) => true)
vi.mock('@/lib/reveal-target', () => ({ revealTarget: (id: string) => revealTarget(id) }))

const KPIS: PersonalCockpitKpis = { my_accounts: 3, relances_open: 2, relances_overdue: 1, messages_this_week: 5 }

beforeEach(() => {
  navigate.mockClear()
  revealTarget.mockClear()
})

describe('PersonalKpiRow — la tuile « Messages (7j) » (#2108.37)', () => {
  it('navigue vers /mailbox au clic, sans passer par revealTarget', () => {
    render(<PersonalKpiRow kpis={KPIS} />)

    fireEvent.click(screen.getByRole('button', { name: /Messages envoyés/ }))

    expect(navigate).toHaveBeenCalledWith({ to: '/mailbox' })
    expect(revealTarget).not.toHaveBeenCalled()
  })

  it('garde le repli sur revealTarget pour la tuile « Mon portefeuille », qui elle reste dans la page', () => {
    render(<PersonalKpiRow kpis={KPIS} />)

    fireEvent.click(screen.getByRole('button', { name: /Mon portefeuille/ }))

    expect(navigate).not.toHaveBeenCalled()
    expect(revealTarget).toHaveBeenCalledWith('cockpit-accounts')
  })
})

/**
 * #2717 — la tuile « En retard » atterrissait sur `/actions` SANS paramètre :
 * onglet figé sur « À valider », deuxième clic manuel requis pour « Mes
 * relances », et la liste qui s'y affichait ensuite n'était jamais filtrée
 * sur le retard — le chiffre rouge et le contenu ne correspondaient pas.
 */
describe('PersonalKpiRow — #2717, la tuile « En retard » atterrit en un clic', () => {
  it('« En retard » navigue vers /actions avec `tab=mine` ET `overdue=true`', () => {
    render(<PersonalKpiRow kpis={KPIS} />)

    fireEvent.click(screen.getByRole('button', { name: /En retard/ }))

    expect(navigate).toHaveBeenCalledWith({ to: '/actions', search: { tab: 'mine', overdue: true } })
  })

  it('« Relances à faire » navigue vers /actions avec `tab=mine` — même défaut, même correctif', () => {
    render(<PersonalKpiRow kpis={KPIS} />)

    fireEvent.click(screen.getByRole('button', { name: /Relances à faire/ }))

    expect(navigate).toHaveBeenCalledWith({ to: '/actions', search: { tab: 'mine' } })
  })
})

/**
 * #4298.2 — chaque chiffre dit sa PÉRIODE et sa SOURCE : un compteur d'état
 * (« Aujourd'hui ») ne se confond pas avec une fenêtre (« 7 derniers jours »).
 */
describe('PersonalKpiRow — #4298.2, période et source sous chaque chiffre', () => {
  it('les quatre tuiles portent leur ligne de portée', () => {
    render(<PersonalKpiRow kpis={KPIS} />)

    expect(screen.getByText("Aujourd'hui · ton portefeuille")).toBeInTheDocument()
    expect(screen.getAllByText("Aujourd'hui · tes actions Bellum")).toHaveLength(2)
    expect(screen.getByText('7 derniers jours · tes actions Bellum')).toBeInTheDocument()
  })
})

/**
 * #4298.1 / #4296.2 — la grammaire Cockpit (PR #4211, « ce qui a bougé ») :
 * une rangée DENSE de compteurs, pas quatre grosses cartes d'ouverture
 * (pastille d'icône de 44 px, chiffre en `text-2xl`, `py-4`). Le CONTENU est
 * gardé : quatre chiffres, leur libellé, leur destination, leur portée.
 */
describe('PersonalKpiRow — #4298.1, une rangée dense au lieu de grosses cartes', () => {
  it('rend une liste de quatre compteurs compacts', () => {
    const { container } = render(<PersonalKpiRow kpis={KPIS} />)

    const list = screen.getByRole('list', { name: 'Mes chiffres' })
    expect(list.querySelectorAll('li')).toHaveLength(4)
    expect(container.innerHTML).not.toMatch(/text-2xl|py-4|h-11 w-11/)
    for (const value of ['3', '2', '1', '5']) expect(screen.getByText(value)).toBeInTheDocument()
  })
})
