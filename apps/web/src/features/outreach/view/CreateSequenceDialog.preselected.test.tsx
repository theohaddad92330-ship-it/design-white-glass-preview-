import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { CreateSequenceDialog } from './CreateSequenceDialog'

// #3700 / #3695 — recette démo 10/10 : « Ajouter à une séquence » depuis une fiche contact
// ouvrait « Créer une séquence » avec 3 cases, TOUTES décochées. Le contact courant était bien
// dans la sélection, mais le sélecteur ne liste que les 40 premiers contacts de l'espace :
// le contact de la fiche n'y figurait pas, donc aucune case ne le montrait coché.
const OTHERS = ['Alice Martin', 'Bruno Petit', 'Chloé Weber'].map((full_name, i) => ({
  id: `other-${i}`,
  full_name,
  title: null,
  email: `o${i}@x.example`,
  excluded_at: null,
  assigned_to: null,
}))

vi.mock('@/features/contacts/hooks/useContacts', () => ({
  useContacts: () => ({ data: { pages: [{ data: OTHERS }] } }),
}))
vi.mock('@/features/outreach/hooks/useOutreachMutations', () => ({
  useCreateOutreachSequence: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/outreach/hooks/useOutreachSequences', () => ({
  useEnrollmentEligibility: () => ({ data: undefined }),
  useOutreachSequences: () => ({ data: [] }),
}))
vi.mock('@/features/crm/api', () => ({ useCrmWriteRequests: () => ({ data: { status: 'not_connected' } }) }))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: [] }) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const CURRENT = {
  id: 'contact-1',
  full_name: 'Laurent Trévisani',
  title: null,
  email: 'laurent.trevisani@sncf.example',
  excluded_at: null,
  assigned_to: null,
}

describe('CreateSequenceDialog — le contact de la fiche est pré-coché (#3700, #3695)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('le contact venu de la fiche figure dans la liste ET est coché, même hors des 40 premiers', () => {
    render(<CreateSequenceDialog open onOpenChange={() => {}} initialContacts={[CURRENT]} />)
    expect(screen.getByRole('checkbox', { name: 'Laurent Trévisani' })).toBeChecked()
  })

  it('sait dire NON : les autres contacts listés restent décochés', () => {
    render(<CreateSequenceDialog open onOpenChange={() => {}} initialContacts={[CURRENT]} />)
    expect(screen.getByRole('checkbox', { name: 'Alice Martin' })).not.toBeChecked()
  })

  it('sans contact de départ : rien n’est coché', () => {
    render(<CreateSequenceDialog open onOpenChange={() => {}} />)
    expect(screen.getByRole('checkbox', { name: 'Alice Martin' })).not.toBeChecked()
    expect(screen.queryByRole('checkbox', { name: 'Laurent Trévisani' })).toBeNull()
  })
})
