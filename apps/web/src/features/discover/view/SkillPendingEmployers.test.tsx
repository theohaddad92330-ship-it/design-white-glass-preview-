import { fireEvent, render, screen, within } from '@testing-library/react'
import { vi } from 'vitest'
import { describe, expect, it } from 'vitest'
import { normalizeDiscoverResponse } from '../lib/discover-normalize'
import type { DiscoverSkillPendingEmployer } from '@bellum/contracts'
import { SkillPendingEmployersSection, SkillSearchFooter } from './SkillSearch'

/**
 * #4674 — un employeur prouvé par une offre sort dans la liste avec son identité « en cours » ; sans SIREN, il ne
 * porte aucune action, et l'écran DIT pourquoi.
 */
const evidence = {
  skill: 'Java',
  offerCount: 1,
  latestOffer: {
    title: 'Développeur Java',
    city: 'Lille',
    date: '2026-10-20',
    url: 'https://offres.example.org/9',
    source: null,
  },
}
const pending = [
  { id: 'offer:abc', name: 'Boulangerie Dupont', identity: 'pending', city: 'Lille', skillEvidence: evidence },
  { id: 'offer:def', name: 'Dupont Transports', identity: 'ambiguous', city: null, skillEvidence: evidence },
] as const

describe('#4674 — employeurs prouvés, identité en cours', () => {
  it('la normalisation garde les lignes valides et écarte celles hors contrat', () => {
    const response = normalizeDiscoverResponse({
      candidates: [],
      query: {},
      degraded: [],
      skillPendingEmployers: [...pending, { id: 'x', name: '', identity: 'resolved', skillEvidence: evidence }],
    })
    expect(response.skillPendingEmployers?.map(p => p.name)).toEqual(['Boulangerie Dupont', 'Dupont Transports'])
  })

  it('chaque ligne dit son état, sa preuve, et aucune action n’est offerte', () => {
    render(<SkillPendingEmployersSection pending={[...pending]} />)
    expect(screen.getByText(/2 employeurs prouvés par une offre/)).toBeInTheDocument()
    // #4419.10 — REPLIÉ par défaut avec son compte : le tableau n'est monté qu'à l'ouverture.
    expect(screen.queryByRole('table')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /2 employeurs prouvés/ }))
    expect(
      screen.getByText(/Sans SIREN, l'analyse, les contacts, l'enrichissement et l'ajout au CRM restent fermés/),
    ).toBeInTheDocument()
    expect(screen.getByText('Identité en cours de vérification')).toBeInTheDocument()
    expect(screen.getByText(/Plusieurs entreprises portent ce nom/)).toBeInTheDocument()
    expect(screen.getAllByTestId('skill-compact-row')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /Choisir l'entreprise/ })).toBeNull() // lecture seule sans onChoose
  })

  it('#4712 — un motif FINAL se nomme, et le titre ne promet plus une attente', () => {
    const final: DiscoverSkillPendingEmployer[] = [
      {
        id: 'offer:t',
        name: 'Thales',
        identity: 'ambiguous',
        identityReason: 'homonym_on_site',
        city: 'Bordeaux',
        skillEvidence: evidence,
      },
      {
        id: 'offer:m',
        name: 'Mantu Manager Program',
        identity: 'unmatched',
        identityReason: 'brand_or_program',
        skillEvidence: evidence,
      },
    ]
    render(<SkillPendingEmployersSection pending={final} />)
    fireEvent.click(screen.getByRole('button', { name: /2 employeurs prouvés/ }))
    expect(
      screen.getByText(/Plusieurs entités du groupe recrutent ici — aucune n’est choisie au hasard/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Marque ou programme — entité non nommée/)).toBeInTheDocument()
    expect(screen.queryByText(/identité en cours/i)).toBeNull()
  })

  it('sans employeur en cours : aucune section (jamais « 0 »)', () => {
    const { container } = render(<SkillPendingEmployersSection pending={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('le pied de la recherche par compétence porte la section', () => {
    render(<SkillSearchFooter query={{ skillSearch: { skills: ['Java'] } }} pending={[...pending]} />)
    expect(screen.getByTestId('skill-pending-employers')).toBeInTheDocument()
  })

  it('#4419.10 — un tableau trié par offres puis par date, une ligne d’aide au plus', () => {
    const more: DiscoverSkillPendingEmployer[] = [
      { id: 'a', name: 'Alpha', identity: 'pending', skillEvidence: { ...evidence, offerCount: 1 } },
      { id: 'b', name: 'Bravo', identity: 'pending', skillEvidence: { ...evidence, offerCount: 7 } },
    ]
    render(<SkillPendingEmployersSection pending={more} />)
    fireEvent.click(screen.getByRole('button', { name: /2 employeurs prouvés/ }))
    const names = () =>
      screen.getAllByTestId('skill-compact-row').map(row => within(row).getByRole('rowheader').textContent)
    expect(names()).toEqual(['Bravo', 'Alpha']) // plus d'offres d'abord
    fireEvent.click(screen.getByRole('button', { name: 'Offres' }))
    expect(names()).toEqual(['Alpha', 'Bravo'])
    expect(screen.getAllByRole('columnheader').length).toBeGreaterThanOrEqual(6)
  })

  it('#4419.8 — « Choisir l’entreprise » propose 2 à 5 candidats et envoie le choix', () => {
    const onChoose = vi.fn()
    const homonym: DiscoverSkillPendingEmployer[] = [
      {
        id: 'offer:c',
        name: 'Consort Group',
        identity: 'ambiguous',
        identityReason: 'homonym',
        skillEvidence: evidence,
        candidates: [
          {
            siren: '111111118',
            name: 'CONSORT GROUP',
            city: 'LILLE',
            sector: 'Conseil',
            headcountTranche: '200 à 249',
          },
          { siren: '222222226', name: 'CONSORT SERVICES', city: 'LYON' },
        ],
      },
      { id: 'offer:u', name: 'Inconnu', identity: 'unmatched', skillEvidence: evidence },
    ]
    render(<SkillPendingEmployersSection pending={homonym} onChoose={onChoose} />)
    fireEvent.click(screen.getByRole('button', { name: /2 employeurs prouvés/ }))
    // une seule ligne porte le geste : celle dont l'homonymie a des candidats
    expect(screen.getAllByRole('button', { name: "Choisir l'entreprise" })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: "Choisir l'entreprise" }))
    expect(screen.getByText(/CONSORT GROUP · LILLE · Conseil · 200 à 249/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /C'est CONSORT SERVICES/ }))
    expect(onChoose).toHaveBeenCalledWith('Consort Group', expect.objectContaining({ siren: '222222226' }))
  })

  // #4419.8 (lot P, recette 01/11) — « Choisir l'entreprise » passait à aria-expanded=true sans rien afficher.
  // De bout en bout côté web : la réponse telle que l'IA l'écrit (`discover_skill_offers._pending_employer`), le
  // contrat (normalisation), le pied de recherche, puis le clic — les 2 à 5 candidats DOIVENT être à l'écran.
  it('#4419.8 — réponse IA → contrat → écran : les candidats s’affichent après le clic (nom, ville, NAF, effectif)', () => {
    const response = normalizeDiscoverResponse({
      candidates: [],
      query: { skillSearch: { skills: ['Java'] } },
      degraded: [],
      skillPendingEmployers: [
        {
          id: 'offer:0123456789ab',
          name: 'Decathlon',
          identity: 'ambiguous',
          identityReason: 'homonym',
          city: 'Lille, Hauts-de-France',
          skillEvidence: evidence,
          candidates: [
            {
              siren: '306138900',
              name: 'DECATHLON',
              city: 'VILLENEUVE-D ASCQ',
              nafCode: '47.64Z',
              sector: 'Commerce',
              headcountTranche: '1000 à 1999',
            },
            {
              siren: '500569405',
              name: 'DECATHLON DIGITAL',
              city: 'LILLE',
              nafCode: '62.01Z',
              headcountTranche: '500 à 999',
            },
          ],
        },
      ],
    })
    expect(response.skillPendingEmployers?.[0]?.candidates).toHaveLength(2)
    const onChoose = vi.fn()
    render(
      <SkillSearchFooter
        query={response.query}
        pending={response.skillPendingEmployers}
        onChooseEmployer={onChoose}
        choosingId={null}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /1 employeur prouvé/ }))
    fireEvent.click(screen.getByRole('button', { name: "Choisir l'entreprise" }))
    const panel = screen.getByTestId('skill-employer-candidates')
    expect(within(panel).getByText(/DECATHLON · VILLENEUVE-D ASCQ · Commerce · 1000 à 1999/)).toBeInTheDocument()
    expect(within(panel).getByText(/DECATHLON DIGITAL · LILLE · 62\.01Z · 500 à 999/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: "Choisir l'entreprise" })).toHaveAttribute('aria-expanded', 'true')
    // le lieu de l'offre s'affiche en entier
    expect(screen.getAllByText('Lille, Hauts-de-France').length).toBeGreaterThan(0)
  })

  it('#4419.5 — un lieu coupé en route (« Lille, Hauts-de- ») s’affiche en entier dans le tableau', () => {
    render(
      <SkillPendingEmployersSection
        pending={[
          { id: 'offer:t', name: 'Acme', identity: 'pending', city: 'Lille, Hauts-de-', skillEvidence: evidence },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /1 employeur prouvé/ }))
    expect(screen.getByText('Lille, Hauts-de-France')).toBeInTheDocument()
    expect(screen.queryByText('Lille, Hauts-de-')).toBeNull()
  })
})
