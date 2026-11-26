import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AccountProfileProvenance as AccountProfileProvenanceData } from '@bellum/contracts'
import { AccountProfileProvenance } from './AccountProfileProvenance'

const provenance = vi.hoisted(() => ({ current: null as AccountProfileProvenanceData | null }))
const refreshMutate = vi.fn()

vi.mock('@/features/accounts/hooks/useProfileProvenance', () => ({
  useProfileProvenance: () => ({ data: provenance.current }),
}))
// useFirstName lit le drapeau démo via useCredits (R21-FIX) : hors démo ici, sans session ni requête.
vi.mock('@/features/credits/hooks/useCredits', () => ({ useCredits: () => ({ data: undefined }) }))
vi.mock('@/features/profiles/hooks/useProfile', () => ({
  useProfile: () => ({ data: { first_name: 'Théo' } }),
}))
vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { email: 'theo@esn.fr' } }),
}))
vi.mock('@/features/accounts/hooks/useRefreshDimension', () => ({
  useRefreshDimension: () => ({ mutate: refreshMutate, isPending: false }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/profile">{children}</a>,
}))

function base(overrides: Partial<AccountProfileProvenanceData> = {}): AccountProfileProvenanceData {
  const { layerVersions = null, ...rest } = overrides
  return {
    mode: 'personalised',
    reason: null,
    esnProfileVersion: 3,
    profileContextVersion: 2,
    answered: 10,
    required: 10,
    esnName: 'Bellum',
    layerVersions,
    currentEsnProfileVersion: 3,
    contextMode: null,
    ...rest,
  }
}

describe('AccountProfileProvenance — §6 nommer l’utilisateur et son ESN', () => {
  it('nomme l’utilisateur ET son ESN quand le run était personnalisé', () => {
    provenance.current = base()
    render(<AccountProfileProvenance accountId="acc-1" />)
    expect(screen.getByText(/Théo, ce dossier a été construit avec le profil de Bellum/)).toBeInTheDocument()
  })

  it('#2351 rouvert le 17/09 — se tronque en ellipse plutôt que de pousser la recherche à la ligne suivante, texte entier accessible au survol', () => {
    // Mesuré en prod : c'est CETTE ligne (dossier Société Générale) qui
    // poussait la recherche à la ligne suivante à 1 512 px.
    provenance.current = base()
    render(<AccountProfileProvenance accountId="acc-1" />)
    const line = screen.getByText(/Théo, ce dossier a été construit avec le profil de Bellum/)
    expect(line.className).toMatch(/truncate|overflow-hidden/)
    expect(line.className).toMatch(/min-w-0/)
    expect(line.getAttribute('title')).toMatch(/^Théo, ce dossier a été construit avec le profil de Bellum/)
  })

  it('ne fabrique pas un nom d’ESN quand le run n’en porte pas', () => {
    provenance.current = base({ esnName: null })
    render(<AccountProfileProvenance accountId="acc-1" />)
    expect(screen.getByText(/avec le profil de ton ESN/)).toBeInTheDocument()
  })

  it('dit « générique » plutôt que de prétendre personnaliser (§13)', () => {
    provenance.current = base({ mode: 'generic', reason: 'incomplete_profile', answered: 7, esnName: null })
    render(<AccountProfileProvenance accountId="acc-1" />)
    // Le chiffre est donné : « incomplet » sans prise n'indique pas quoi faire.
    expect(screen.getByText(/générique.*7 sur 10/s)).toBeInTheDocument()
    expect(screen.getByText(/Complète ton profil/)).toBeInTheDocument()
  })

  it('distingue le report volontaire de l’absence de profil', () => {
    provenance.current = base({ mode: 'generic', reason: 'skipped_by_user', esnName: null })
    render(<AccountProfileProvenance accountId="acc-1" />)
    expect(screen.getByText(/remis à plus tard/)).toBeInTheDocument()
  })

  it('n’affiche RIEN quand la provenance est inconnue', () => {
    // Un dossier antérieur à la traçabilité ne peut pas prouver sa
    // personnalisation. L'annoncer quand même serait la faute exacte du rapport.
    provenance.current = null
    const { container } = render(<AccountProfileProvenance accountId="acc-1" />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('AccountProfileProvenance — #2306.25 décision Louis 19/09 : PROPOSER le recalcul, coût affiché', () => {
  it('dit que le profil a changé et affiche le coût, quand le dossier date d’avant', () => {
    provenance.current = base({ esnProfileVersion: 2, currentEsnProfileVersion: 3 })
    render(<AccountProfileProvenance accountId="acc-1" />)
    expect(screen.getByText(/tes secteurs ou tes offres ont changé depuis ce dossier/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Le recalculer$/ })).toBeInTheDocument()
  })

  it('ne dit rien quand le dossier a été calculé APRÈS le dernier changement', () => {
    provenance.current = base({ esnProfileVersion: 3, currentEsnProfileVersion: 3 })
    render(<AccountProfileProvenance accountId="acc-1" />)
    expect(screen.queryByRole('button', { name: /Le recalculer/ })).not.toBeInTheDocument()
  })

  it('⚠️ rien ne part sans geste — le recalcul ne se déclenche qu’au clic, jamais au rendu', async () => {
    provenance.current = base({ esnProfileVersion: 2, currentEsnProfileVersion: 3 })
    render(<AccountProfileProvenance accountId="acc-1" />)
    expect(refreshMutate).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /^Le recalculer$/ }))
    // La dimension « stratégie » (angles, plan) : c'est elle que le profil ESN
    // conditionne — pas les faits du compte, que rien n'a rendus périmés.
    expect(refreshMutate).toHaveBeenCalledWith('strategy')
  })
})

/**
 * #2453.7 / #2453.8 — le dossier est LIBELLÉ selon le mode qui l'a lancé
 * (activité / brief / critères), et un run dont le mode a écarté le profil ne
 * se dit jamais personnalisé — ni ne pousse à « compléter » un profil qui
 * peut l'être déjà.
 */
describe('AccountProfileProvenance — mode de contexte du lancement (#2453.7, #2453.8)', () => {
  it('« Mission ponctuelle » : libellé sur le BRIEF, aucun appel à compléter le profil', () => {
    provenance.current = base({
      mode: 'generic',
      reason: 'context_mode',
      contextMode: 'one_off_mission',
      esnName: null,
    })
    render(<AccountProfileProvenance accountId="acc-1" />)
    expect(screen.getByText(/Théo, ce dossier est calculé sur le brief de la mission/)).toBeInTheDocument()
    expect(screen.queryByText(/construit avec le profil/)).toBeNull()
    expect(screen.queryByText(/Complète ton profil/)).toBeNull()
  })

  it('« Neutre » : libellé sur des CRITÈRES NEUTRES, jamais une personnalisation', () => {
    provenance.current = base({ mode: 'generic', reason: 'context_mode', contextMode: 'neutral', esnName: null })
    render(<AccountProfileProvenance accountId="acc-1" />)
    expect(screen.getByText(/Théo, ce dossier est calculé sur des critères neutres/)).toBeInTheDocument()
    expect(screen.queryByText(/construit avec le profil/)).toBeNull()
    expect(screen.queryByText(/Complète ton profil/)).toBeNull()
  })

  it('« Mon activité » : le libellé historique, inchangé', () => {
    provenance.current = base({ contextMode: 'my_activity' })
    render(<AccountProfileProvenance accountId="acc-1" />)
    expect(screen.getByText(/Théo, ce dossier a été construit avec le profil de Bellum/)).toBeInTheDocument()
  })
})
