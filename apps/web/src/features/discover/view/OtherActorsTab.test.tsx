import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { OTHER_ACTOR_KINDS, type OtherActorKind, type OtherActorRow } from '../lib/discover-other-actors'
import { OtherActorsTab } from './OtherActorsTab'

const rows: OtherActorRow[] = [
  {
    id: '1',
    name: 'EXTIA',
    kind: 'esn',
    city: 'Lille, Hauts-de-',
    offerCount: 3,
    latestTitle: 'Dev Java',
    latestUrl: 'https://o.example.org/1',
    latestDate: '2026-10-30',
  },
  {
    id: '2',
    name: 'FRANCE TRAVAIL',
    kind: 'adsite',
    city: null,
    offerCount: null,
    latestTitle: null,
    latestUrl: null,
    latestDate: null,
  },
  {
    id: '3',
    name: 'Cabinet X',
    kind: 'recruiter',
    city: 'Lyon',
    offerCount: 1,
    latestTitle: 'Dev',
    latestUrl: null,
    latestDate: null,
  },
]

function Harness({ initial = [...OTHER_ACTOR_KINDS] as OtherActorKind[] }) {
  const [kinds, setKinds] = useState<OtherActorKind[]>(initial)
  return <OtherActorsTab rows={rows} kinds={kinds} onKindsChange={setKinds} />
}

describe('#4746.2 — onglet « Autres acteurs »', () => {
  it('toutes les pastilles sont cochées par défaut ; tableau compact nom · type · ville · offres · offre · date', () => {
    render(<Harness />)
    for (const kind of OTHER_ACTOR_KINDS) {
      expect(screen.getAllByRole('button', { pressed: true }).length).toBe(OTHER_ACTOR_KINDS.length)
      expect(kind).toBeTruthy()
    }
    expect(screen.getAllByTestId('other-actor-row')).toHaveLength(3)
    expect(screen.getAllByRole('columnheader')).toHaveLength(6)
  })

  it('décocher « ESN » retire EXTIA, jamais les autres', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'ESN' }))
    const names = screen.getAllByTestId('other-actor-row').map(row => within(row).getByRole('rowheader').textContent)
    expect(names).toEqual(['FRANCE TRAVAIL', 'Cabinet X'])
  })

  it('#4419.5 — le lieu coupé s’affiche entier ; un nombre non mesuré reste vide, jamais « 0 »', () => {
    render(<Harness />)
    expect(screen.getByText('Lille, Hauts-de-France')).toBeInTheDocument()
    const franceTravail = screen.getAllByTestId('other-actor-row')[1] as HTMLElement
    expect(within(franceTravail).queryByText('0')).toBeNull()
  })

  it('tout décoché : le dit, sans prétendre qu’il n’y a aucun acteur', () => {
    render(<Harness initial={[]} />)
    expect(screen.getByTestId('other-actors-empty')).toHaveTextContent('Aucun acteur ne correspond')
  })
})

describe('lot T — le motif d’une ESN reconnue hors NAF se lit sur sa ligne', () => {
  const reasoned: OtherActorRow[] = [
    { ...rows[0], id: 'a', name: 'DAVIDSON CONSULTING', esnRecognition: 'referential' } as OtherActorRow,
    { ...rows[0], id: 'b', name: 'ACME INGENIERIE', esnRecognition: 'offers' } as OtherActorRow,
    { ...rows[0], id: 'c', name: 'ESN PAR SON NAF', esnRecognition: null } as OtherActorRow,
  ]
  it('« Référencée comme ESN » · « Reconnue ESN : ses offres le disent » ; aucun motif sans preuve', () => {
    render(<OtherActorsTab rows={reasoned} kinds={[...OTHER_ACTOR_KINDS]} onKindsChange={() => {}} />)
    const [a, b, c] = screen.getAllByTestId('other-actor-row')
    expect(a?.textContent).toContain('Référencée comme ESN')
    expect(b?.textContent).toContain('Reconnue ESN : ses offres le disent')
    expect(within(c as HTMLElement).queryByTestId('other-actor-reason')).toBeNull()
  })
})
