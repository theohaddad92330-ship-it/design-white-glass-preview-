import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { accountKeys } from '@/features/accounts/api'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ContactsRulesCatchupNotice } from './ContactsRulesCatchupNotice'
import type * as ContactsApiModule from '@/features/contacts/api'

// LUDOVIC-C LC.1 (b) — STILL collecté le 12/10, avant le filtre d'homonymes du 19/10.
const demo = vi.hoisted(() => ({ current: false }))
const api = vi.hoisted(() => ({ applyCurrentRules: vi.fn() }))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => demo.current }))
vi.mock('@/features/contacts/api', async importOriginal => {
  const actual = await importOriginal<typeof ContactsApiModule>()
  return { ...actual, contactsApi: { ...actual.contactsApi, applyCurrentRules: api.applyCurrentRules } }
})

describe('ContactsRulesCatchupNotice (LC.1)', () => {
  // #4324.1 (recette 22/10) — après le rejeu, « Qui nous manque » et la carte Personnes se relisent : un
  // instantané calculé AVANT l'archivage des homonymes ne doit pas survivre au geste.
  it('#4324.1 — relit aussi la couverture et la stratégie du compte après le rejeu', async () => {
    demo.current = false
    api.applyCurrentRules.mockResolvedValue({ account_id: 'a', archived: 1, applied_at: '2026-10-22T07:00:00Z' })
    const spy = vi.spyOn(QueryClient.prototype, 'invalidateQueries')
    renderWithRouter(
      <ContactsRulesCatchupNotice accountId="a" collectedAt="2026-10-12T08:00:00Z" rulesAppliedAt={null} />,
    )
    fireEvent.click(
      await screen.findByRole('button', { name: /Remettre les contacts à jour avec les règles actuelles/ }),
    )
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
    const keys = spy.mock.calls.map(call => JSON.stringify(call[0]?.queryKey))
    expect(keys).toContain(JSON.stringify(accountKeys.coverageGaps('a')))
    expect(keys).toContain(JSON.stringify(accountKeys.strategy5P('a')))
    spy.mockRestore()
  })

  it('propose le geste sur une collecte antérieure, puis DIT combien d’homonymes sont archivés', async () => {
    demo.current = false
    api.applyCurrentRules.mockResolvedValue({ account_id: 'a', archived: 3, applied_at: '2026-10-20T07:00:00Z' })
    renderWithRouter(
      <ContactsRulesCatchupNotice accountId="a" collectedAt="2026-10-12T08:00:00Z" rulesAppliedAt={null} />,
    )
    fireEvent.click(
      await screen.findByRole('button', { name: /Remettre les contacts à jour avec les règles actuelles/ }),
    )
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/3 homonymes archivés/))
    expect(api.applyCurrentRules).toHaveBeenCalledWith('a')
  })

  it('dit NON après une remise aux règles, et en démo', async () => {
    demo.current = false
    const { container } = renderWithRouter(
      <ContactsRulesCatchupNotice
        accountId="a"
        collectedAt="2026-10-12T08:00:00Z"
        rulesAppliedAt="2026-10-20T07:00:00Z"
      />,
    )
    await waitFor(() => expect(container.textContent).not.toMatch(/Remettre les contacts/))
    demo.current = true
    const demoRender = renderWithRouter(
      <ContactsRulesCatchupNotice accountId="a" collectedAt={null} rulesAppliedAt={null} />,
    )
    await waitFor(() => expect(demoRender.container.textContent).not.toMatch(/Remettre les contacts/))
  })

  // LUDOVIC-E LC.1b — « Agrandir la recherche » rafraîchit la date de collecte (après la capacité) sans
  // retirer stillfront.com : la date seule cachait le bouton sur la fiche STILL.
  it('LC.1b — propose le geste malgré une collecte récente, tant qu’un homonyme certain reste au dossier', async () => {
    demo.current = false
    const contacts = [{ id: 'h', email: 'x@stillfront.com', source: 'apollo' }]
    renderWithRouter(
      <ContactsRulesCatchupNotice
        accountId="a"
        collectedAt="2026-10-19T18:00:00Z"
        rulesAppliedAt={null}
        contacts={contacts}
        accountWebsite="https://www.still.fr"
      />,
    )
    expect(
      await screen.findByRole('button', { name: /Remettre les contacts à jour avec les règles actuelles/ }),
    ).toBeTruthy()
  })

  it('LC.1b — une date absente vaut « antérieure » ; sans homonyme et collecte récente, rien', async () => {
    demo.current = false
    const absent = renderWithRouter(
      <ContactsRulesCatchupNotice accountId="a" collectedAt={undefined} rulesAppliedAt={undefined} contacts={[]} />,
    )
    expect(await absent.findByRole('button', { name: /Remettre les contacts/ })).toBeTruthy()
    absent.unmount()
    const clean = renderWithRouter(
      <ContactsRulesCatchupNotice
        accountId="a"
        collectedAt="2026-10-19T18:00:00Z"
        rulesAppliedAt={null}
        contacts={[{ id: 'k', email: 'y@still.fr', source: 'apollo' }]}
        accountWebsite="https://www.still.fr"
      />,
    )
    await waitFor(() => expect(clean.container.textContent).not.toMatch(/Remettre les contacts/))
  })
})
