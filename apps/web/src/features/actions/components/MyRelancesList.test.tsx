import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, vi } from 'vitest'
import type { MyPlanAction } from '@bellum/contracts'
import { renderWithRouter, resetTestQueryClient } from '@/test-utils/renderWithRouter'
import { MyRelancesList } from './MyRelancesList'

// Radix menus need these pointer APIs, which jsdom doesn't implement.
beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

/**
 * #1409 REVIENT SUR SON REFUS, DÉLIBÉRÉMENT — LA MIGRATION CHANGE CE QUE LE
 * REFUS PROTÉGEAIT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * À LIRE AVANT DE « RÉPARER » QUOI QUE CE SOIT ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * #1409 demandait de retirer « Mes relances » du cockpit personnel. Le refus
 * écrit disait : *« elle reste, parce qu'elle est le SEUL endroit du produit où
 * une relance se marque faite — retirer la carte aurait retiré la CAPACITÉ, pas
 * seulement l'affichage »*. Ce refus était JUSTE, et il n'a pas été contredit :
 * il a été rendu sans objet. Le geste a d'abord DÉMÉNAGÉ ici (Centre
 * d'actions), sur la même route et avec le même corps ; la carte est partie
 * dans le MÊME commit. Sans cette ligne, le prochain lecteur croit à une
 * régression et « répare » le renversement.
 *
 * Les trois assertions de `MyRelancesCard.test.tsx` survivent telles quelles —
 * nom accessible du bouton, corps exact du PATCH, aucun bouton imbriqué : ce
 * sont elles le CONTRAT du geste, pas le fichier qui les portait.
 */

const { update, mineCount } = vi.hoisted(() => ({ update: vi.fn(), mineCount: vi.fn() }))
vi.mock('@/features/actions/planItems.api', () => ({
  planItemsApi: { list: vi.fn(), mine: vi.fn(), mineCount, update },
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

/** Le nom accessible du geste « fait » — il NOMME la relance qu'il ferme (GA-32). */
const DONE_BUTTON = { name: 'Marquer « Rappeler la DSI » comme faite' }

const ACTION = {
  id: 'r1',
  account_id: 'a1',
  company_name: 'ACME',
  label: 'Rappeler la DSI',
  due_date: '2026-07-01',
  done: false,
  execution_status: 'todo',
  week_index: 0,
  step_index: 0,
  completed_at: null,
  snoozed_until: null,
  assigned_to: null,
  created_at: '2026-06-01T09:00:00.000Z',
  updated_at: '2026-06-01T09:00:00.000Z',
} as unknown as MyPlanAction

describe('#1409 rouvert — le geste « relance faite » vit dans le Centre d’actions', () => {
  beforeEach(() => {
    update.mockReset()
    update.mockResolvedValue({ id: 'r1', done: true, execution_status: 'done' })
    mineCount.mockReset()
    mineCount.mockResolvedValue(null)
    resetTestQueryClient()
  })

  // #4418.1 — `/plan-items/mine` plafonne à 200 : une tâche créée au-delà disparaissait sans un mot.
  // L'écran DIT qu'il montre moins que le total, et de combien. Filtrer sans le dire était le défaut.
  it('#4418.1 — nomme ce que la liste écarte quand le total dépasse ce qu’elle montre', async () => {
    mineCount.mockResolvedValue({ open: 216 })
    renderWithRouter(<MyRelancesList actions={[ACTION]} loading={false} />)
    expect(await screen.findByRole('status')).toHaveTextContent(/1 actions affichées sur 216, 215 ne sont pas listées/)
  })

  it('#4418.1 — contrôle négatif : total égal, ou total illisible, ne dit rien (jamais un faux écart)', async () => {
    mineCount.mockResolvedValue({ open: 1 })
    const { unmount } = renderWithRouter(<MyRelancesList actions={[ACTION]} loading={false} />)
    await waitFor(() => expect(mineCount).toHaveBeenCalled())
    expect(screen.queryByRole('status')).toBeNull()
    unmount()
    resetTestQueryClient()
    mineCount.mockResolvedValue(null)
    renderWithRouter(<MyRelancesList actions={[ACTION]} loading={false} />)
    await waitFor(() => expect(mineCount).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('status')).toBeNull()
  })

  // #4072.2 — on relance en connaissance de cause : échanges (métadonnées) + faits récents.
  it('#4072.2 — montre les derniers échanges (date · destinataire · sujet) et les faits récents, datés, sans lien dans le lien', async () => {
    const withHistory = {
      ...ACTION,
      history: {
        exchanges: [{ date: '2026-09-02', kind: 'exchange', label: 'E-mail envoyé à Jeanne — « Point TMA »' }],
        recent_facts: [{ date: '2025-08-01', kind: 'signal', label: 'Nouveau DSI', url: 'https://example.org/x' }],
      },
    } as MyPlanAction
    renderWithRouter(<MyRelancesList actions={[withHistory]} loading={false} />)
    expect(await screen.findByText(/E-mail envoyé à Jeanne/)).toBeInTheDocument()
    expect(screen.getByText('Nouveau DSI')).toBeInTheDocument()
    // Un fait ancien reste daté ; la ligne vit dans un lien : aucun lien imbriqué.
    expect(document.body.textContent).toMatch(/2025/)
    expect(document.querySelectorAll('a a')).toHaveLength(0)
    expect(screen.queryByText(/Voir la source/)).toBeNull()
  })

  it('#4072.2 — sans historique, la ligne n’ajoute rien', async () => {
    renderWithRouter(<MyRelancesList actions={[ACTION]} loading={false} />)
    await screen.findByRole('button', DONE_BUTTON)
    expect(document.querySelector('time')).toBeNull()
  })

  it('porte un geste « fait » NOMMÉ sur chaque ligne', async () => {
    renderWithRouter(<MyRelancesList actions={[ACTION]} loading={false} />)
    expect(await screen.findByRole('button', DONE_BUTTON)).toBeInTheDocument()
  })

  // #2396.2/.5 — une complétion manuelle exige l'issue choisie ; le clic ouvre
  // désormais le sous-menu d'issues plutôt que de compléter directement.
  it('écrit le statut exécutable ET l’issue choisie — la trace est celle du serveur', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderWithRouter(<MyRelancesList actions={[ACTION]} loading={false} />)

    await user.click(await screen.findByRole('button', DONE_BUTTON))
    await screen.findByText('Positif')
    // fireEvent : la séquence pointeur de userEvent re-rend le sous-menu Radix,
    // détachant le nœud trouvé juste avant (même piège que ContactOutcomeSubmenu).
    fireEvent.click(screen.getByRole('menuitem', { name: 'Positif' }))

    await waitFor(() => expect(update).toHaveBeenCalledWith('r1', { execution_status: 'done', outcome: 'positive' }))
  })

  // #3416.2b — « À rappeler » demande la date (facultative) et l'envoie telle quelle.
  it('« À rappeler » envoie callback_date quand une date est choisie, et rien sinon', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderWithRouter(
      <MyRelancesList actions={[{ ...ACTION, target: { kind: 'contact' } } as MyPlanAction]} loading={false} />,
    )

    await user.click(await screen.findByRole('button', DONE_BUTTON))
    await screen.findByText('Positif')
    fireEvent.click(screen.getByRole('menuitem', { name: 'À rappeler' }))
    fireEvent.change(await screen.findByLabelText('Date du rappel (facultative)'), { target: { value: '2026-10-20' } })
    await user.click(screen.getByRole('button', { name: 'Marquer fait' }))

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('r1', {
        execution_status: 'done',
        outcome: 'callback_scheduled',
        callback_date: '2026-10-20',
      }),
    )
  })

  it('la ligne reste ouvrable — les deux gestes cohabitent sans bouton imbriqué', async () => {
    const { container } = renderWithRouter(<MyRelancesList actions={[ACTION]} loading={false} />)
    expect(await screen.findByText('Rappeler la DSI')).toBeInTheDocument()
    expect(container.querySelector('button button')).toBeNull()
  })

  // #3720.6 (retour bêta SKAIZen, Laura, 22/09) — « impossible d'ouvrir dans un
  // nouvel onglet depuis le tableau des contacts ou la création d'action » :
  // la ligne de relance ouvrait le plan du compte par `onClick` + `navigate()`
  // sur un `<button>`, sans `href` — clic droit, ctrl/cmd-clic et clic
  // molette ne proposaient rien. Même correctif que #2719 (ContactTableRow) :
  // un vrai `<a href>` rend ces gestes natifs au navigateur.
  it('un vrai lien <a href> ouvre le plan du compte — pas un onClick seul', async () => {
    const { container } = renderWithRouter(<MyRelancesList actions={[ACTION]} loading={false} />)
    await screen.findByText('Rappeler la DSI')
    const link = container.querySelector('a[href^="/accounts/a1"]')
    expect(link).not.toBeNull()
    expect(link?.tagName).toBe('A')
  })

  it('« en cours de lecture » n’est pas « aucune » — le vide n’est annoncé qu’une fois mesuré', async () => {
    // « Non mesuré » n'est jamais « 0 » : annoncer « aucune relance » pendant le
    // chargement ferait fermer l'écran à quelqu'un qui en a trois.
    const { unmount } = renderWithRouter(<MyRelancesList actions={[]} loading />)
    expect(await screen.findByText(/Lecture de tes relances/)).toBeInTheDocument()
    expect(screen.queryByText(/Aucune relance programmée/)).toBeNull()
    unmount()
    // Témoin de la ligne au-dessus : une fois la lecture FAITE, le vide se dit.
    renderWithRouter(<MyRelancesList actions={[]} loading={false} />)
    expect(await screen.findByText(/Aucune relance programmée/)).toBeInTheDocument()
  })

  // #2717 — un zéro FILTRÉ (« en retard ») ne doit pas se lire comme le zéro
  // ABSOLU (« aucune relance programmée ») : le second dit qu'il n'y a rien à
  // faire du tout, le premier qu'il n'y a rien À CE FILTRE — deux réponses
  // différentes à la même liste vide.
  it('#2717 — vide ET filtré sur le retard : un message distinct, pas « aucune relance programmée »', async () => {
    renderWithRouter(<MyRelancesList actions={[]} loading={false} overdueOnly />)
    expect(await screen.findByText(/Aucune relance en retard/)).toBeInTheDocument()
    expect(screen.queryByText(/Aucune relance programmée/)).toBeNull()
  })
})

describe('la capacité a DÉMÉNAGÉ, elle n’a pas été supprimée', () => {
  const WEB_SRC = join(__dirname, '..', '..', '..')

  function read(...parts: string[]): string {
    return readFileSync(join(WEB_SRC, ...parts), 'utf8')
  }

  it('lit un corpus réel — le cockpit personnel et le Centre d’actions', () => {
    expect(read('features', 'dashboard', 'components', 'personal', 'PersonalCockpit.tsx').length).toBeGreaterThan(2000)
    expect(read('features', 'action-os', 'view', 'ActionCenter.tsx').length).toBeGreaterThan(10000)
  })

  it('le cockpit personnel ne porte plus la carte — et la raison du renversement y est écrite', () => {
    const cockpit = read('features', 'dashboard', 'components', 'personal', 'PersonalCockpit.tsx')
    expect(cockpit).not.toContain('MyRelancesCard')
    // Le refus levé est NOMMÉ sur place : sans lui, on relit une carte
    // « disparue » et on la remet.
    expect(cockpit).toContain('#1409')
  })

  it('sait dire NON : le Centre d’actions MONTE bien la liste qui porte le geste', () => {
    // Si quelqu'un retirait cet onglet, la capacité disparaîtrait à nouveau du
    // produit — exactement ce que le refus de #1409 protégeait.
    const center = read('features', 'action-os', 'view', 'ActionCenter.tsx')
    expect(center).toContain('MyRelancesList')
    expect(center).toContain('useMyActions')
  })

  it('témoin — « Mes priorités », elle, est RESTÉE dans le cockpit', () => {
    // Le refus de #1409 la concernant tient toujours (« la couverture nomme un
    // problème, la priorité nomme un geste ») : si ce témoin tombait, le test
    // ci-dessus ne prouverait plus qu'on a déplacé la bonne carte.
    expect(read('features', 'dashboard', 'components', 'personal', 'PersonalCockpit.tsx')).toContain('MyPrioritiesCard')
  })
})
