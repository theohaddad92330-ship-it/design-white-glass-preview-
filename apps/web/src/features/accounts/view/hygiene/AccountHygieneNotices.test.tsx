import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { accountsApi, type AccountHygieneByAccount } from '@/features/accounts/api'

/**
 * Les contrôles de qualité, POSÉS À CÔTÉ DE L'OBJET.
 *
 * Ce que ces trois composants doivent prouver, dans l'ordre où c'est cher quand
 * c'est faux :
 *
 *  1. **un contrôle non évalué n'est pas « conforme »** — il se tait sur la
 *     ligne (cinquante « non mesuré » ne se lisent plus) et il se DIT une fois,
 *     en haut de l'écran ;
 *  2. **un avertissement porte son geste** — la pastille de ligne est un
 *     `<button type="button">` (GA-35) qui mène là où l'action se planifie ;
 *  3. **rien ne s'affiche quand tout va bien** — un écran couvert
 *     d'avertissements verts ne se lit plus ;
 *  4. **un compte est nommé avec son dénominateur** — « 3 » ne se lit pas,
 *     « 3 sur 7 » si.
 */

const hygiene = vi.fn()
const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }))

vi.mock('@/features/accounts/api', () => ({
  accountsApi: { hygiene: () => hygiene() },
  accountKeys: { hygiene: () => ['accounts', 'hygiene'] as const },
}))

vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigateMock,
}))

const { AccountNextActionFlag, AccountsNextActionScopeNotice } = await import('./AccountHygieneNotices')

function answer(over: Partial<AccountHygieneByAccount> = {}): AccountHygieneByAccount {
  return {
    withoutNextAction: { ids: [], truncated: false },
    contactsWithoutEmail: { byAccount: {}, truncated: false },
    ...over,
  }
}

/**
 * Un TÉMOIN branché sur la MÊME lecture que les composants testés.
 *
 * Sans lui, « le composant n'affiche rien » serait vrai avant même que la
 * réponse arrive : le test passerait au vert sur un rendu qui n'a encore rien
 * lu — un faux vert exactement du genre qu'on chasse. Le témoin ne s'affiche
 * qu'une fois la lecture aboutie, et le test l'attend avant de conclure.
 */
function Witness() {
  const { isSuccess } = useQuery({ queryKey: ['accounts', 'hygiene'], queryFn: () => accountsApi.hygiene() })
  return <span>{isSuccess ? 'lecture aboutie' : ''}</span>
}

function draw(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <div data-testid="zone">{node}</div>
      <Witness />
    </QueryClientProvider>,
  )
}

/** La lecture a abouti ; ce que la zone testée montre est donc définitif. */
async function settled(): Promise<HTMLElement> {
  await screen.findByText('lecture aboutie')
  return screen.getByTestId('zone')
}

describe('la pastille « prochaine action » d’une ligne de compte', () => {
  beforeEach(() => {
    cleanup()
    hygiene.mockReset()
    navigateMock.mockReset()
  })

  it('marque la ligne que le serveur désigne, et porte le geste', async () => {
    hygiene.mockResolvedValue(answer({ withoutNextAction: { ids: ['acc-1'], truncated: false } }))

    draw(<AccountNextActionFlag accountId="acc-1" />)

    const flag = await screen.findByRole('button', { name: /définir la prochaine action/i })
    await userEvent.click(flag)
    expect(navigateMock).toHaveBeenCalledWith(expect.objectContaining({ to: '/accounts/$id', params: { id: 'acc-1' } }))
  })

  it('se tait sur une ligne tenue', async () => {
    hygiene.mockResolvedValue(answer({ withoutNextAction: { ids: ['acc-9'], truncated: false } }))

    draw(<AccountNextActionFlag accountId="acc-1" />)

    expect((await settled()).querySelector('button')).toBeNull()
  })

  it('se tait AUSSI quand le contrôle n’a pas pu être lu — cinquante « non mesuré » ne se lisent plus', async () => {
    hygiene.mockResolvedValue(answer({ withoutNextAction: null }))

    draw(<AccountNextActionFlag accountId="acc-1" />)

    expect((await settled()).querySelector('button')).toBeNull()
  })
})

describe('ce que l’écran dit UNE fois, en haut', () => {
  beforeEach(() => {
    cleanup()
    hygiene.mockReset()
  })

  it('dit que le contrôle n’a pas pu être lu — et surtout pas que tout est propre', async () => {
    hygiene.mockResolvedValue(answer({ withoutNextAction: null }))

    draw(<AccountsNextActionScopeNotice />)

    expect(await screen.findByText(/non mesuré/i)).toBeInTheDocument()
  })

  it('dit quand la lecture s’est arrêtée avant la fin du portefeuille', async () => {
    hygiene.mockResolvedValue(answer({ withoutNextAction: { ids: ['acc-1'], truncated: true } }))

    draw(<AccountsNextActionScopeNotice />)

    expect(await screen.findByText(/arrêtée/i)).toBeInTheDocument()
  })

  it('ne dit rien quand la lecture est complète', async () => {
    hygiene.mockResolvedValue(answer({ withoutNextAction: { ids: ['acc-1'], truncated: false } }))

    draw(<AccountsNextActionScopeNotice />)

    expect((await settled()).textContent).toBe('')
  })
})

// #3631 (Louis 05/10) — `AccountContactsEmailNotice` est retirée de la fiche
// compte, délibérément ; ses tests partent avec elle. Son absence à l'écran est
// prouvée par `TabContacts.hygiene.test.tsx`.
