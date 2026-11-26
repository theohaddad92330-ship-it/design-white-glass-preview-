import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ApolloContactProfile, Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { ContactApolloProfile } from './ContactApolloProfile'

function contactWith(profile: ApolloContactProfile | null, extra: Partial<Contact> = {}): Contact {
  return { id: 'c1', account_id: 'a1', full_name: 'Amina Benali', apollo_enrichment: profile, ...extra } as Contact
}

const FULL_PROFILE: ApolloContactProfile = {
  headline: 'CIO @ Veolia | Cloud & Cybersecurity',
  seniority: 'c_suite',
  city: 'Paris',
  country: 'France',
  linkedin_url: 'https://linkedin.com/in/aminabenali',
  twitter_url: 'https://twitter.com/aminabenali',
  github_url: 'https://github.com/aminabenali',
  departments: ['information_technology'],
  functions: ['engineering'],
  employment_history: [
    { organization_name: 'Veolia', title: 'Chief Information Officer', start_date: '2021-03-01', current: true },
    {
      organization_name: 'Capgemini',
      title: 'IT Director',
      start_date: '2015-06-01',
      end_date: '2021-02-01',
      current: false,
    },
  ],
  education: [
    {
      school: 'Télécom Paris',
      degree: 'Ingénieur',
      field_of_study: 'Informatique',
      start_date: '2005-09-01',
      end_date: '2010-06-01',
    },
  ],
}

describe('ContactApolloProfile', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('renders the rich profile: current post subtitle, location, badges, career, education', () => {
    render(<ContactApolloProfile contact={contactWith(FULL_PROFILE)} />)
    // #4465.1 — le sous-titre est la fonction du poste en cours, plus le titre libre de la source.
    expect(screen.getByTestId('contact-apollo-subtitle')).toHaveTextContent(/^Chief Information Officer$/)
    expect(screen.getByText('Paris, France')).toBeInTheDocument()
    // Seniority + departments + functions are closed Apollo vocabulary → translated.
    expect(screen.getByText('Direction générale')).toBeInTheDocument()
    expect(screen.getByText('Informatique')).toBeInTheDocument()
    expect(screen.getByText('Ingénierie')).toBeInTheDocument()
    // Career timeline (recent-first, current flagged, year range).
    // Le poste en cours se lit deux fois : en sous-titre, et dans le parcours.
    expect(screen.getAllByText('Chief Information Officer')).toHaveLength(2)
    expect(screen.getByText(/Veolia · 2021 – Actuel/)).toBeInTheDocument()
    expect(screen.getByText(/Capgemini · 2015 – 2021/)).toBeInTheDocument()
    // Education.
    expect(screen.getByText('Télécom Paris')).toBeInTheDocument()
    expect(screen.getByText(/Ingénieur · Informatique · 2005 – 2010/)).toBeInTheDocument()
  })

  it('renders social links in a new tab with rel=noopener', () => {
    render(<ContactApolloProfile contact={contactWith(FULL_PROFILE)} />)
    const github = screen.getByRole('link', { name: /GitHub/ })
    expect(github).toHaveAttribute('target', '_blank')
    expect(github.getAttribute('rel')).toContain('noopener')
    expect(screen.getByRole('link', { name: /Twitter/ })).toBeInTheDocument()
  })

  // #3716 — LinkedIn a son bouton dans l'en-tête de la fiche : le profil ne le
  // redit pas (un emplacement principal par propriété).
  it('#3716 — ne redit pas LinkedIn, déjà porté par l’en-tête', () => {
    render(<ContactApolloProfile contact={contactWith(FULL_PROFILE, { linkedin_url: 'https://linkedin.com/in/x' })} />)
    expect(screen.queryByRole('link', { name: /LinkedIn/ })).not.toBeInTheDocument()
  })

  // #3716 — la localisation vit dans « Informations clés » quand le contact en
  // porte une ; sinon le profil reste son SEUL emplacement (rien n'est perdu).
  it('#3716 — ne redit pas la localisation quand le contact en porte une', () => {
    render(<ContactApolloProfile contact={contactWith(FULL_PROFILE, { location: 'Paris, France' })} />)
    expect(screen.queryByText('Paris, France')).not.toBeInTheDocument()
  })

  it('renders nothing when there is no Apollo profile', () => {
    const { container } = render(<ContactApolloProfile contact={contactWith(null)} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the profile has no card-displayable field', () => {
    // personal_emails belong to Key info, not this card → nothing to show here.
    const { container } = render(<ContactApolloProfile contact={contactWith({ personal_emails: ['x@y.com'] })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('keeps an unknown Apollo tag visible verbatim (humanised only) — never blank, never guessed', () => {
    render(<ContactApolloProfile contact={contactWith({ departments: ['yak_shaving'] })} />)
    expect(screen.getByText('Yak shaving')).toBeInTheDocument()
  })

  it('renders in English too (i18n parity)', async () => {
    await i18n.changeLanguage('en')
    render(<ContactApolloProfile contact={contactWith(FULL_PROFILE)} />)
    expect(screen.getByText('Professional profile')).toBeInTheDocument()
    expect(screen.getByText('Career')).toBeInTheDocument()
    expect(screen.getByText('Education')).toBeInTheDocument()
    // Closed Apollo vocabulary follows the UI language, here EN.
    expect(screen.getByText('C-suite')).toBeInTheDocument()
    expect(screen.getByText('Information technology')).toBeInTheDocument()
    await i18n.changeLanguage('fr')
  })

  describe('#4465.1 — une seule fonction par écran : celle du poste en cours', () => {
    const TROIS = [
      { organization_name: 'Safran', title: 'Head of IT Transformation', start_date: '2024-02-01', current: true },
      {
        organization_name: 'Safran Aircraft Engines',
        title: 'IT Manager',
        start_date: '2022-01-01',
        end_date: '2024-01-31',
      },
      { organization_name: 'Capgemini', title: 'Consultant', start_date: '2018-01-01', end_date: '2021-12-31' },
    ]
    const STALE_HEADLINE = 'IT Manager - Safran Aircraft Engines'

    it('le sous-titre du bloc dit le MÊME intitulé que le champ Fonction (contact.title)', () => {
      const contact = contactWith(
        { headline: STALE_HEADLINE, employment_history: TROIS },
        { title: 'Head of IT Transformation' },
      )
      render(<ContactApolloProfile contact={contact} />)
      expect(screen.getByTestId('contact-apollo-subtitle')).toHaveTextContent(/^Head of IT Transformation$/)
      expect(screen.queryByText(STALE_HEADLINE)).not.toBeInTheDocument()
    })

    it("NON : aucun poste `current` ⇒ aucun sous-titre, et surtout pas l'ancien poste ni le plus récent", () => {
      const sansCurrent = TROIS.map(entry => ({ ...entry, current: false }))
      render(
        <ContactApolloProfile contact={contactWith({ headline: STALE_HEADLINE, employment_history: sansCurrent })} />,
      )
      expect(screen.queryByTestId('contact-apollo-subtitle')).not.toBeInTheDocument()
      expect(screen.queryByText(STALE_HEADLINE)).not.toBeInTheDocument()
    })
  })

  // #4889 — quatre postes `current` chez le même employeur : un seul « Actuel », sur le premier.
  it('marque UN seul « Actuel » par employeur dans la frise', () => {
    const history = [
      { organization_name: 'FORMIND', title: 'BU Director', start_date: '2026-01-01', current: true },
      { organization_name: 'FORMIND', title: 'Human Resources Director', start_date: '2023-01-01', current: true },
      { organization_name: 'FORMIND', title: 'Talent Recruiter', start_date: '2016-01-01', current: true },
      { organization_name: 'Autre SAS', title: 'Consultant', start_date: '2012-01-01', end_date: '2016-01-01' },
    ]
    render(<ContactApolloProfile contact={contactWith({ employment_history: history })} />)
    expect(screen.getAllByText('Actuel')).toHaveLength(1)
    expect(screen.getByText(/FORMIND · 2026 – Actuel/)).toBeInTheDocument()
    expect(screen.getByText(/FORMIND · 2023 – 2026/)).toBeInTheDocument()
    // Le poste le plus récent n'ayant pas de successeur connu : aucune date de fin devinée.
    expect(screen.getByText(/FORMIND · 2016 – 2023/)).toBeInTheDocument()
  })
})
