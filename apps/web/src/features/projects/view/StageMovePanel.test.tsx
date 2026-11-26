import { cleanup, render, screen } from '@testing-library/react'
import type { ProjectRow } from '@bellum/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../hooks/useLossReasons', () => ({ useLossReasons: () => ({ data: { items: [] } }) }))
const submissions = vi.hoisted(() => ({ items: [] as Array<{ stage: string }> }))
vi.mock('@/features/submissions/api', () => ({
  useSubmissions: () => ({ data: { items: submissions.items } }),
}))

import { StageMovePanel } from './StageMovePanel'

afterEach(cleanup)

// #4195 — « gagné » n'est plus une case : c'est un effet annoncé, avec son nombre.
describe('StageMovePanel — la signature annonce ses missions (#4195)', () => {
  const project = { id: 'p-1', stage: 'negotiation', label: 'SNCF' } as ProjectRow
  const open = () =>
    render(<StageMovePanel project={project} target="won" hasMission={false} onCancel={vi.fn()} onConfirm={vi.fn()} />)

  it('2 positionnements retenus → « 2 missions seront créées », sans case « Créer la mission »', () => {
    submissions.items = [{ stage: 'accepted' }, { stage: 'accepted' }, { stage: 'rejected' }]
    open()
    expect(screen.getByText(/2 missions seront créées/)).toBeTruthy()
    expect(screen.queryByText('Créer la mission')).toBeNull()
    expect(screen.queryByRole('checkbox', { name: /mission/i })).toBeNull()
  })

  it('1 retenu → singulier ; aucun → la mission sans positionnement est annoncée', () => {
    submissions.items = [{ stage: 'accepted' }]
    open()
    expect(screen.getByText(/La mission sera créée : un positionnement retenu/)).toBeTruthy()
    cleanup()
    submissions.items = []
    open()
    expect(screen.getByText(/La mission sera créée à la signature/)).toBeTruthy()
  })

  it('vers une autre étape : rien d’annoncé', () => {
    submissions.items = [{ stage: 'accepted' }]
    render(
      <StageMovePanel
        project={project}
        target="negotiation"
        hasMission={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.queryByText(/seront créées|sera créée/)).toBeNull()
  })
})

// #4339.1 / #4339.3 — « Profil présenté » : les quatre propositions de Théo, chacune avec sa raison, sans jargon.
describe('StageMovePanel — « Profil présenté » (#4339.3)', () => {
  const project = { id: 'p-2', stage: 'confirmed', label: 'Socle data' } as ProjectRow
  const open = (onConfirm = vi.fn()) =>
    render(
      <StageMovePanel
        project={project}
        target="profiles_submitted"
        hasMission={false}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    )

  it('propose les quatre gestes de Théo, chacun avec sa raison en une ligne', () => {
    submissions.items = []
    open()
    for (const label of [
      'Vérifier que le profil est bien parti',
      'Caler le créneau d’entretien avec le client',
      'Préparer le mail de suite',
      'Chercher d’autres profils dans ton vivier',
    ]) {
      expect(screen.getByText(label)).toBeTruthy()
    }
    expect(screen.getByText(/rien ne part sans toi/)).toBeTruthy()
    expect(screen.getAllByText(/./).some(node => /btmmp|tjm|matching/i.test(node.textContent ?? ''))).toBe(false)
  })

  it('la règle des vérifications est écrite en clair', () => {
    submissions.items = []
    open()
    expect(screen.getByText('Cinq profils au maximum ?')).toBeTruthy()
    expect(screen.getByText('Aucun refusé chez ce client ?')).toBeTruthy()
  })

  it('le mail de suite n’est jamais pré-coché : il touche la boîte du commercial', () => {
    submissions.items = []
    open()
    const boxes = screen.getAllByRole('checkbox')
    const mail = boxes.find(box => box.closest('label,div')?.textContent?.includes('Préparer le mail de suite'))
    expect(mail?.getAttribute('aria-checked') ?? (mail as HTMLInputElement | undefined)?.checked?.toString()).toMatch(
      /false/,
    )
  })
})
