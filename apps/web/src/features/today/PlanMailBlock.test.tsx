import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TodayItem } from './todayQueue'

const generatePlanMail = vi.fn()
vi.mock('./planMail', () => ({ generatePlanMail: (...args: unknown[]) => generatePlanMail(...args) }))
const permissions = vi.fn()
vi.mock('@/lib/permissions', async () => ({
  ...(await vi.importActual<object>('@/lib/permissions')),
  useUserPermissions: () => permissions(),
}))

const isDemo = vi.fn(() => false)
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => isDemo() }))

import { PlanMailBlock } from './PlanMailBlock'

const item = { id: 'plan_item:1', contactId: 'c1', title: 'Envoyer un email J1', signal: null } as unknown as TodayItem
const KNOWN = (list: string[]) => ({ status: 'known', role: 'member', extraPermissions: [], permissions: list })

describe('PlanMailBlock — « Générer le mail » carte par carte (#4521.3)', () => {
  beforeEach(() => {
    generatePlanMail.mockReset()
    permissions.mockReturnValue(KNOWN(['records:write']))
    isDemo.mockReturnValue(false)
  })

  // #4592 — la rédaction est éteinte à dessein en démonstration (aucun appel de modèle dans une salle de démo) :
  // l'écran le DIT, le bouton ne s'offre pas, et aucun appel ne part qui ne pourrait qu'échouer.
  it('#4592 — en démonstration, pas de bouton : l’écran dit que la rédaction n’y est pas disponible', () => {
    isDemo.mockReturnValue(true)
    render(<PlanMailBlock item={item} draft={null} onDraftChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /générer le mail/i })).toBeNull()
    expect(screen.getByText(/rédaction n’est pas disponible dans la démonstration/i)).toBeInTheDocument()
    expect(generatePlanMail).not.toHaveBeenCalled()
  })

  it('génère à la demande, montre objet + corps modifiables, et remonte le brouillon', async () => {
    generatePlanMail.mockResolvedValueOnce({ subject: 'Votre CA', body: 'Bonjour Muriel' })
    const onDraftChange = vi.fn()
    const { rerender } = render(<PlanMailBlock item={item} draft={null} onDraftChange={onDraftChange} />)
    expect(generatePlanMail).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /générer le mail/i }))
    await waitFor(() => expect(onDraftChange).toHaveBeenCalledWith({ subject: 'Votre CA', body: 'Bonjour Muriel' }))
    expect(generatePlanMail).toHaveBeenCalledTimes(1)

    rerender(
      <PlanMailBlock
        item={item}
        draft={{ subject: 'Votre CA', body: 'Bonjour Muriel' }}
        onDraftChange={onDraftChange}
      />,
    )
    const body = screen.getByLabelText(/corps/i)
    fireEvent.change(body, { target: { value: 'Bonjour Muriel, un mot.' } })
    expect(onDraftChange).toHaveBeenLastCalledWith({ subject: 'Votre CA', body: 'Bonjour Muriel, un mot.' })
    expect(screen.queryByRole('button', { name: /générer le mail/i })).toBeNull()
  })

  it('un échec se NOMME et laisse regénérer, sans brouillon inventé', async () => {
    generatePlanMail.mockRejectedValueOnce(new Error('plan_mail_generation_failed'))
    const onDraftChange = vi.fn()
    render(<PlanMailBlock item={item} draft={null} onDraftChange={onDraftChange} />)
    fireEvent.click(screen.getByRole('button', { name: /générer le mail/i }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onDraftChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /générer le mail/i })).toBeEnabled()
  })

  it('un rôle sans le droit de Préparer ne voit pas « Générer le mail »', () => {
    permissions.mockReturnValue(KNOWN([]))
    const { container } = render(<PlanMailBlock item={item} draft={null} onDraftChange={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('droit pas encore lu ou lecture en erreur : rien n’est offert (fail-closed)', () => {
    permissions.mockReturnValue({ status: 'unknown' })
    const { container } = render(<PlanMailBlock item={item} draft={null} onDraftChange={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
