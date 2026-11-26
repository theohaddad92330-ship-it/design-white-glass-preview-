/**
 * #3924 (chantier distinct de l'issue) — « coller le texte ou l'URL d'un post
 * LinkedIn » DANS DÉCOUVRIR. Le geste existait sur la fiche compte
 * (`DeclareLinkedInSignalDialog`, #2634.1) et nulle part ailleurs : un
 * commercial qui lit un post en parcourant Découvrir devait quitter l'écran.
 *
 * Le signal déclaré s'écrit sur un COMPTE (`accounts.declared_signals`) : le
 * geste n'apparaît donc que sur une ligne qui EST déjà un compte de l'espace.
 * Sur un candidat neuf, rien — on n'affiche pas un geste qui n'a nulle part où
 * écrire (doctrine « on n'affiche pas ce qu'on n'a pas »).
 */
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'

const dialogProps: Array<{ accountId: string }> = []

vi.mock('@/features/accounts/view/account-detail/tabs/veille/DeclareLinkedInSignalDialog', () => ({
  DeclareLinkedInSignalDialog: (props: { accountId: string }) => {
    dialogProps.push({ accountId: props.accountId })
    return <span data-testid="declare-linkedin-signal" />
  },
}))

vi.mock('./CandidateNotes', () => ({ CandidateNotes: () => null }))

import { CandidateRow } from './CandidateRow'

function candidate(over: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  return {
    name: 'ACME',
    siren: '552100554',
    nafCode: null,
    sector: null,
    city: null,
    department: null,
    headcountRange: null,
    creationDate: null,
    score: 70,
    scoreMax: 100,
    scoreUnmeasured: [],
    dataConfidence: null,
    scoreFactors: [],
    signals: [],
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new',
    accountId: null,
    sources: [],
    ...over,
  }
}

function renderRow(c: DiscoverCandidate) {
  return renderWithRouter(
    <CandidateRow
      defaultOpen
      candidate={c}
      isFollowed={false}
      onToggleFollow={() => {}}
      onDismiss={() => {}}
      onAnalyze={() => {}}
    />,
  )
}

describe('CandidateRow (détail) — coller un post LinkedIn (#3924)', () => {
  it('offre le geste sur une ligne qui est déjà un compte, câblé sur CE compte', async () => {
    dialogProps.length = 0
    renderRow(candidate({ name: 'TF1', accountId: 'acc-tf1', portfolioState: 'analyzed' }))
    await screen.findByText('TF1')
    expect(screen.getByTestId('declare-linkedin-signal')).toBeInTheDocument()
    expect(dialogProps.at(-1)).toEqual({ accountId: 'acc-tf1' })
  })

  it('ne rend RIEN sur un candidat neuf — aucun compte où écrire le signal', async () => {
    dialogProps.length = 0
    renderRow(candidate({ name: 'Nouvelle Cible' }))
    await screen.findByText('Nouvelle Cible')
    expect(screen.queryByTestId('declare-linkedin-signal')).not.toBeInTheDocument()
    expect(dialogProps).toEqual([])
  })
})
