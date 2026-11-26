import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountGateControl } from './AccountGateControl'

/**
 * #2688.1 — retour bêta : « utilise une autre expression, on comprend pas à
 * quoi sert ce bouton, personne comprend ce que ça veut dire "à trancher" ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LE BOUTON FAIT, AVANT DE LE NOMMER
 * ─────────────────────────────────────────────────────────────────────────
 * Ce déclencheur (`cta="dossier.gate.open"`) OUVRE un popover à trois issues
 * (prioriser / écarter / rouvrir la question) — il ne tranche rien lui-même.
 * AVANT ce correctif, son libellé ÉTAIT `t('gate.state.${gate}')` : le
 * STATUT courant du compte (« À trancher », « Priorisé », « Écarté »), pas
 * l'action que le clic déclenche.
 *
 * ⚠️ « À trancher » reste un STATUT ailleurs au contrat (`gate.state.pending`,
 * PRIORITY_GATES) : ce correctif ne touche QUE le libellé du bouton, jamais
 * les clés `gate.state.*` (gardées par `enum-keys.test.ts`, prefix
 * `gate.state`) — un changement de leur texte serait un changement de
 * doctrine, pas un correctif de libellé.
 */
const apiFetchMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function renderGate(gate: 'pending' | 'prioritised' | 'parked', iconOnly = false) {
  apiFetchMock.mockImplementation((args?: { path?: string }) => {
    const path = typeof args?.path === 'string' ? args.path : ''
    if (path.includes('park-reasons')) return Promise.resolve({ items: [] })
    return Promise.resolve({})
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AccountGateControl
        accountId="acc-1"
        gate={gate}
        reason={null}
        companyName="ACME Industries"
        iconOnly={iconOnly}
      />
    </QueryClientProvider>,
  )
}

beforeEach(() => apiFetchMock.mockReset())

describe('#2688.1 — le déclencheur nomme son action, pas le statut courant', () => {
  it('dit ce que le clic va faire (« Décider de la priorité »), quel que soit le statut courant', async () => {
    renderGate('pending')
    expect(await screen.findByRole('button', { name: 'Décider de la priorité' })).toBeInTheDocument()
  })

  it('sait dire NON : l’ancien libellé — le statut nu — n’est plus le nom du bouton', async () => {
    renderGate('pending')
    const trigger = await screen.findByRole('button', { name: 'Décider de la priorité' })
    // Témoin de l’AVANT : `À trancher` (gate.state.pending) n’est plus le nom
    // accessible du déclencheur — un test qui ne compare qu’à lui-même ne
    // prouverait rien.
    expect(trigger).not.toHaveAccessibleName('À trancher')
    expect(screen.queryByRole('button', { name: 'À trancher' })).not.toBeInTheDocument()
  })

  it('reste stable sur un compte déjà priorisé ou déjà écarté — le clic ouvre toujours la même décision', async () => {
    renderGate('prioritised')
    expect(await screen.findByRole('button', { name: 'Décider de la priorité' })).toBeInTheDocument()
  })
})

/**
 * #2117.84 — RECETTE IPHONE DU 25/09 : LA RANGÉE COMPACTE DU HERO MOBILE.
 *
 * `iconOnly` rend le MÊME déclencheur en icône seule — même contrat
 * (`dossier.gate.open`), même popover, même nom accessible (GA-32 : une
 * icône seule reste nommée) — jamais un second composant qui dupliquerait le
 * geste. `false` par défaut : aucun appelant bureau ne la passe, rendu
 * inchangé.
 */
describe('#2117.84 — iconOnly (rangée compacte du hero mobile)', () => {
  it('rend une icône seule, nommée par le MÊME libellé', async () => {
    renderGate('pending', true)
    const trigger = await screen.findByRole('button', { name: 'Décider de la priorité' })
    expect(trigger.textContent).toBe('')
    expect(trigger).toHaveAttribute('aria-label', 'Décider de la priorité')
  })

  it('sans iconOnly — garde le libellé visible, non-régression', async () => {
    renderGate('pending')
    const trigger = await screen.findByRole('button', { name: 'Décider de la priorité' })
    expect(trigger.textContent).toBe('Décider de la priorité')
  })
})
