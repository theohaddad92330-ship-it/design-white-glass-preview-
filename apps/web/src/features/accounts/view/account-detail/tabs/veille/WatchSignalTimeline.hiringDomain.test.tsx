import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import type { WatchSignal } from '@/features/accounts/model/watch'
import { WatchSignalTimeline } from './WatchSignalTimeline'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const noop = () => {}
const signal = (over: Partial<WatchSignal>): WatchSignal => ({
  id: 's1',
  category: 'recrutement',
  date: '2026-10-01',
  type: 'hiring',
  signal: 'Recrutement IT — Analyste cybersécurité',
  source: 'France Travail',
  sourceUrl: null,
  sourceKind: null,
  freshness: 'current',
  temporalStatus: null,
  angles: [],
  actionGate: { allowed: true },
  tags: [],
  perimeter: 'ACME',
  ...over,
})

function renderTimeline(signals: WatchSignal[], hiringProfile?: { placedRoles: string[]; noGoSectors: string[] }) {
  return render(
    <WatchSignalTimeline
      signals={signals}
      activeCategory="all"
      narrowed={false}
      isPersisting={false}
      scenario="full"
      onAddToPlan={noop}
      onCreateAngle={noop}
      hiringProfile={hiringProfile}
    />,
  )
}

// #3901.w — décision Louis 09/10/2026 : la veille du compte suit le profil déclaré (jumeau de Découvrir).
describe('WatchSignalTimeline — recrutements selon le profil déclaré (#3901.w)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  const hse = signal({ id: 'hse', signal: 'Recrutement — Ingénieur HSE' })
  const sec = signal({ id: 'sec', signal: 'Recrutement IT — Analyste cybersécurité' })

  it('ESN cyber : l’étiquette porte le domaine déclaré, l’offre HSE passe en fin et le dit', () => {
    renderTimeline([hse, sec], { placedRoles: ['cybersécurité'], noGoSectors: [] })
    const titles = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)
    expect(titles).toEqual(['Recrutement cybersécurité — Analyste cybersécurité', 'Recrutement — Ingénieur HSE'])
    expect(screen.getByTestId('hiring-domain-notice').textContent).toMatch(/hors de tes métiers placés/)
  })

  it('NON : l’offre HSE n’est ni retirée ni réétiquetée « IT » ou « cybersécurité »', () => {
    renderTimeline([hse], { placedRoles: ['cybersécurité'], noGoSectors: [] })
    expect(screen.getByText('Recrutement — Ingénieur HSE')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Recrutement (IT|cybersécurité) — Ingénieur HSE/)
  })

  it('ESN industrie : l’offre HSE reste en tête', () => {
    renderTimeline([hse, sec], { placedRoles: ['HSE'], noGoSectors: [] })
    const titles = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)
    expect(titles[0]).toBe('Recrutement HSE — Ingénieur HSE')
  })

  it('profil vide : libellé inchangé, la ligne dit qu’aucun métier n’est retenu et renvoie vers Mon profil', () => {
    renderTimeline([sec], { placedRoles: [], noGoSectors: [] })
    expect(screen.getByText('Recrutement IT — Analyste cybersécurité')).toBeInTheDocument()
    expect(screen.getByTestId('hiring-domain-notice').textContent).toMatch(/Aucun métier placé n’est déclaré ni déduit/)
    expect(screen.getByRole('link').getAttribute('href')).toBe('/settings/profile')
  })

  it('NON : sans profil chargé (ou sans recrutement), aucune ligne', () => {
    renderTimeline([sec])
    expect(screen.queryByTestId('hiring-domain-notice')).not.toBeInTheDocument()
    renderTimeline([signal({ id: 'x', type: 'projet', signal: 'Refonte SI' })], { placedRoles: [], noGoSectors: [] })
    expect(screen.queryByTestId('hiring-domain-notice')).not.toBeInTheDocument()
  })

  // #4284.10 (recette 21/10, L2c) — la marque est PAR LIGNE, pas seulement le bandeau.
  it('« hors de ton métier » est posé sur chaque ligne hors métier, jamais sur celle du métier', () => {
    const hse2 = signal({ id: 'hse2', signal: 'Recrutement — Chargé de sécurité incendie' })
    renderTimeline([hse, hse2, sec], { placedRoles: ['cybersécurité'], noGoSectors: [] })
    expect(screen.getAllByTestId('signal-out-of-trade')).toHaveLength(2)
  })

  it('NON : sans métier déclaré ni déduit, aucune ligne n’est marquée', () => {
    renderTimeline([hse, sec], { placedRoles: [], noGoSectors: [] })
    expect(screen.queryAllByTestId('signal-out-of-trade')).toHaveLength(0)
  })

  // #4284.10 (L2d) — profil en échec : la ligne le DIT, jamais un faux « dans ton métier » ni une marque devinée.
  it('profil illisible : la veille le dit et ne marque aucune ligne', () => {
    render(
      <WatchSignalTimeline
        signals={[hse]}
        activeCategory="all"
        narrowed={false}
        isPersisting={false}
        scenario="full"
        onAddToPlan={noop}
        onCreateAngle={noop}
        hiringProfileFailed
      />,
    )
    expect(screen.getByTestId('hiring-domain-notice').textContent).toMatch(/n’ont pas pu être lus/)
    expect(screen.queryAllByTestId('signal-out-of-trade')).toHaveLength(0)
  })
})

// #4396.1 / #4398.1 — « le rôle change l'ORDRE, jamais le CONTENU » : le métier de l'ESN en tête, les autres
// offres regroupées sous « Autres métiers » (comme #4399.2), jamais en tête, jamais retirées.
describe('WatchSignalTimeline — « Autres métiers » (#4396.1)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  const profile = { placedRoles: ['cybersécurité'], noGoSectors: [] }
  const sec = signal({ id: 'sec', signal: 'Recrutement IT — Analyste cybersécurité' })
  const structureur = signal({ id: 'str', signal: 'Structureur H/F' })
  const comm = signal({ id: 'com', signal: 'Assistant.e chargé.e de communication' })

  it('profil IT : l’offre du métier d’abord, puis le séparateur, puis les autres métiers', () => {
    renderTimeline([structureur, comm, sec], profile)
    const nodes = Array.from(document.querySelectorAll('h3, [data-testid="other-trades-heading"]')).map(
      n => n.textContent,
    )
    expect(nodes[0]).toMatch(/Analyste cybersécurité/)
    expect(nodes[1]).toMatch(/^Autres métiers/)
    expect(nodes.slice(2)).toEqual(['Structureur H/F', 'Assistant.e chargé.e de communication'])
  })

  it('aucune offre hors métier : pas de séparateur', () => {
    renderTimeline([sec], profile)
    expect(screen.queryByTestId('other-trades-heading')).toBeNull()
  })
})

// #4733.2 / #4733.6 — le recrutement d'un DIRIGEANT se voit comme un fait fort sur « Signaux & besoins » : l'IA pose
// `executive_role` sur l'intitulé réel, le contrat le porte, la ligne le dit (jamais deviné quand le drapeau manque).
describe('WatchSignalTimeline — recrutement de dirigeant (#4733.2 #4733.6)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('un signal flaggé executive_role porte la mention « Recrutement de dirigeant »', () => {
    renderTimeline([signal({ id: 'coo', signal: 'Directeur des opérations (COO) F/H', executiveRole: true })])
    expect(screen.getByTestId('executive-hiring-badge')).toHaveTextContent('Recrutement de dirigeant')
  })

  it('sans le drapeau : aucune mention, même si l’intitulé ressemble à un poste de direction (jamais deviné)', () => {
    renderTimeline([signal({ id: 'dir', signal: 'Directeur des opérations (COO) F/H' })])
    expect(screen.queryByTestId('executive-hiring-badge')).toBeNull()
  })

  // #4733.6 — un recrutement de dirigeant est un fait FORT : jamais « hors de ton métier », jamais replié sous « Autres métiers ».
  it('un dirigeant hors métier de l’ESN : en tête, sans « hors métier », hors du repli « Autres métiers »', () => {
    const profile = { placedRoles: ['cybersécurité'], noGoSectors: [] }
    const hse = signal({ id: 'hse', signal: 'Recrutement — Ingénieur HSE' })
    const coo = signal({
      id: 'coo',
      signal: 'Offre publiée sur la page carrières : Directeur Commercial Transport',
      executiveRole: true,
    })
    renderTimeline([hse, coo], profile)

    const nodes = Array.from(document.querySelectorAll('h3, [data-testid="other-trades-heading"]')).map(
      n => n.textContent,
    )
    expect(nodes[0]).toMatch(/Directeur Commercial Transport/)
    expect(nodes[1]).toMatch(/^Autres métiers · 1 offre$/)
    expect(nodes[2]).toMatch(/Ingénieur HSE/)
    // Un seul « hors de ton métier » : celui de l'offre HSE, pas celui du dirigeant.
    expect(screen.getAllByTestId('signal-out-of-trade')).toHaveLength(1)
  })

  it('TÉMOIN : le même intitulé SANS le drapeau reste hors métier et replié (le drapeau seul fait la différence)', () => {
    const profile = { placedRoles: ['cybersécurité'], noGoSectors: [] }
    const hse = signal({ id: 'hse', signal: 'Recrutement — Ingénieur HSE' })
    const plain = signal({ id: 'dc', signal: 'Offre publiée sur la page carrières : Directeur Commercial Transport' })
    renderTimeline([hse, plain], profile)
    expect(screen.getAllByTestId('signal-out-of-trade')).toHaveLength(2)
  })

  it('EN : la mention est traduite', async () => {
    await i18n.changeLanguage('en')
    renderTimeline([signal({ id: 'cfo', signal: 'Chief Financial Officer', executiveRole: true })])
    expect(screen.getByTestId('executive-hiring-badge')).toHaveTextContent('Executive hire')
  })
})
