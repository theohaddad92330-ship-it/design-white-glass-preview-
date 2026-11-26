import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { WatchlistItem } from '@/features/watchlist/model/watchlist'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { LibraryRow } from '../model/signal-library'
import { SignalCard } from './SignalCard'

// #4286.11 / #4286.12 (Louis 23/10) — la carte d'une offre dit qui la demande : « Demandeur probable » quand
// l'offre l'établit, « Demandeur à identifier » sinon ; un signal qui n'est pas une offre n'a pas de ligne.
function row(requester: WatchlistItem['requester'], over: Partial<WatchlistItem> = {}): LibraryRow {
  const item = {
    accountId: 'a1',
    companyName: 'Decathlon',
    id: 's1',
    sector: 'Distribution',
    signalDate: '2026-10-10',
    signalLabel: 'Ingénieur DevOps',
    signalSource: 'job',
    sourceKind: 'job',
    signalType: 'hiring',
    score: null,
    status: 'new',
    archived: false,
    requester,
    ...over,
  } as WatchlistItem
  return { item, state: null, nature: 'hiring', outOfTrade: false, key: 'k' }
}

function renderCard(r: LibraryRow) {
  const noop = vi.fn()
  return renderWithRouter(
    <SignalCard
      row={r}
      selected={false}
      followed={false}
      onToggleSelect={noop}
      onOpen={noop}
      onSetState={noop}
      onToggleFollow={noop}
      onMakeAction={noop}
      onRefresh={noop}
    />,
    '/signals',
  )
}

describe('#4286.11 — le demandeur sur la carte Signaux', () => {
  it('OUI : un demandeur étayé se lit « Demandeur probable »', async () => {
    renderCard(
      row({ status: 'etaye', author: 'rh', possibleManagerFunction: 'DSI', team: null, city: null, method: [] }),
    )
    expect(await screen.findByTestId('need-requester')).toHaveTextContent('Demandeur probable : DSI')
  })

  it('OUI : un demandeur non établi se dit « à identifier »', async () => {
    renderCard(
      row({
        status: 'a_identifier',
        author: 'non_precise',
        possibleManagerFunction: null,
        team: null,
        city: null,
        method: ['lire_offre'],
      }),
    )
    expect(await screen.findByTestId('need-requester-method')).toHaveTextContent('à identifier')
  })

  it('NON : pas de demandeur composé → aucune ligne', async () => {
    renderCard(row(null))
    await screen.findByTestId('signal-card')
    expect(screen.queryByTestId('need-requester')).toBeNull()
    expect(screen.queryByTestId('need-requester-method')).toBeNull()
  })
})

// #4403.1 (recette prod 26/10) — la carte d'un signal hors du métier du profil le DIT ; celle d'un signal de métier non.
describe('#4403.1 — la marque « hors de ton métier » sur la carte Signaux', () => {
  it('OUI : un signal hors métier porte la marque', async () => {
    renderCard({ ...row(null), outOfTrade: true })
    expect(await screen.findByTestId('signal-card-out-of-trade')).toHaveTextContent('hors de ton métier')
  })

  it('NON : un signal de métier n’en porte pas', async () => {
    renderCard(row(null))
    await screen.findByTestId('signal-card')
    expect(screen.queryByTestId('signal-card-out-of-trade')).toBeNull()
  })
})

// #4437.5 (recette prod 26/10) — /signals : l'intitulé d'une offre montre sa compétence et sa famille ;
// un intitulé qui ne nomme rien se dit « Non rattaché » ; rien de posé (collecte antérieure) = aucune ligne.
describe('#4437.5 — le rattachement de l’offre sur la carte Signaux', () => {
  it('OUI : compétence et famille se lisent sur la carte', async () => {
    renderCard(
      row(null, {
        offerAttachment: {
          status: 'attached',
          fact_type: 'hiring',
          skills: ['Java'],
          job_family: 'developpement',
          extract: null,
        },
      }),
    )
    const line = await screen.findByTestId('offer-attachment')
    expect(line).toHaveTextContent('Java')
    expect(line).not.toHaveTextContent('Non rattaché')
  })

  it('OUI : un intitulé qui ne nomme rien se dit « Non rattaché »', async () => {
    renderCard(
      row(null, {
        offerAttachment: { status: 'unclassified', fact_type: null, skills: [], job_family: null, extract: null },
      }),
    )
    expect(await screen.findByTestId('offer-attachment')).toHaveTextContent('Non rattaché')
  })

  it('NON : rien de posé → aucune ligne inventée', async () => {
    renderCard(row(null, { offerAttachment: null }))
    await screen.findByTestId('signal-card')
    expect(screen.queryByTestId('offer-attachment')).toBeNull()
  })
})
