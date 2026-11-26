import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { normalizeDiscoverResponse } from '../lib/discover-normalize'
import {
  SkillEvidenceLine,
  SkillEvidenceOffers,
  SkillOffersReadLine,
  SkillSearchEmptyCause,
  SkillSearchNotices,
} from './SkillSearch'

/**
 * COMPETENCE-TROUVE (Louis 20/10/2026) — une compétence posée TROUVE les comptes par leurs offres :
 * chaque carte dit « N offres <compétence> » et la plus récente (sans jamais nommer la source), les
 * cabinets et ESN vont dans une section repliée à part, et un zéro dit sa cause en mots simples.
 */
const evidence = {
  skill: 'SAP',
  offerCount: 2,
  latestOffer: {
    title: 'Business Analyst SAP SD H/F',
    city: 'Bartenheim',
    date: '2026-10-16',
    url: 'https://offres.example.org/1',
    source: 'france_travail',
  },
}

const raw = {
  candidates: [{ name: 'BIHR', siren: '433091839', nafCode: '46.69B', skillEvidence: evidence }],
  query: { skillSearch: { skills: ['SAP'], emptyCause: null } },
  degraded: [],
  skillIntermediaries: [
    { siren: '512345678', name: 'SIGNE +', kind: 'recruiter', city: 'PARIS', skillEvidence: evidence },
    {
      siren: '326820065',
      name: 'SOPRA STERIA GROUP',
      kind: 'esn',
      city: 'PARIS',
      skillEvidence: { ...evidence, offerCount: 1 },
    },
    { siren: 'x', name: '', kind: 'client', skillEvidence: evidence },
  ],
}

describe('COMPETENCE-TROUVE — la preuve par offres à l’écran', () => {
  it('la normalisation garde la preuve et les intermédiaires valides (et seulement eux)', () => {
    const response = normalizeDiscoverResponse(raw)
    expect(response.candidates[0]?.skillEvidence?.offerCount).toBe(2)
    expect(response.skillIntermediaries?.map(i => i.siren)).toEqual(['512345678', '326820065'])
  })

  it('la carte dit « 2 offres SAP » et la plus récente, avec son lien, sans nommer la source', () => {
    render(<SkillEvidenceLine evidence={evidence} />)
    expect(screen.getByText(/2 offres SAP/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Business Analyst SAP SD H\/F/ })).toHaveAttribute(
      'href',
      'https://offres.example.org/1',
    )
    expect(screen.getByText(/Bartenheim/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/france.?travail|adzuna/i)
  })

  it('#4469 — l’intitulé qui ne porte pas le mot : la carte dit où il a été trouvé', () => {
    const inDescription = { ...evidence, latestOffer: { ...evidence.latestOffer, foundIn: 'description' as const } }
    render(<SkillEvidenceLine evidence={inDescription} />)
    expect(screen.getByText(/mot trouvé dans la description/i)).toBeInTheDocument()
  })

  it('#4469 — mot dans l’intitulé ou lieu non dit : rien de plus à lire', () => {
    render(<SkillEvidenceLine evidence={{ ...evidence, latestOffer: { ...evidence.latestOffer, foundIn: 'title' } }} />)
    expect(screen.queryByText(/mot trouvé/i)).toBeNull()
  })

  it('sans preuve, aucune ligne (on n’affiche pas ce qu’on n’a pas)', () => {
    const { container } = render(<SkillEvidenceLine evidence={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('un zéro dit sa cause en mots simples, et seulement quand une compétence a été cherchée', () => {
    const { rerender, container } = render(
      <SkillSearchEmptyCause query={{ skillSearch: { skills: ['SAP'], emptyCause: 'no_offers' } }} />,
    )
    expect(screen.getByText(/Aucune offre récente ne cite SAP dans cette zone/)).toBeInTheDocument()
    rerender(<SkillSearchEmptyCause query={{ skillSearch: { skills: ['SAP'], emptyCause: 'only_intermediaries' } }} />)
    expect(screen.getByText(/Seuls des cabinets et des ESN recrutent sur SAP/)).toBeInTheDocument()
    rerender(<SkillSearchEmptyCause query={{}} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('#4419.6 — chaque filtre qui retire des comptes LE DIT, avec un geste pour l’enlever', () => {
  const counted = {
    skills: ['Java', 'Vue'],
    offersSeen: 120,
    employersFound: 40,
    unresolvedEmployers: 12,
    intermediaries: 9,
    outsideHeadcount: 14,
    notAttempted: 30,
    deadlineCut: true,
    emptyCause: null,
  }

  it('nomme les cabinets et ESN, la taille, les non-identifiés et la coupure — chaque geste appelle son action', async () => {
    const calls: string[] = []
    render(
      <SkillSearchNotices
        query={{ skillSearch: counted }}
        onShowIntermediaries={() => calls.push('intermediaries')}
        onRemoveHeadcount={() => calls.push('headcount')}
        onRetry={() => calls.push('retry')}
      />,
    )
    expect(screen.getByText(/9 cabinets et ESN recrutent aussi sur Java, Vue/)).toBeInTheDocument()
    expect(screen.getByText(/14 entreprises hors de la taille choisie/)).toBeInTheDocument()
    expect(screen.getByText(/12 employeurs non identifiés au registre/)).toBeInTheDocument()
    expect(screen.getByText(/Recherche coupée par le délai/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Voir les cabinets et ESN/ }))
    await userEvent.click(screen.getByRole('button', { name: /Retirer la taille/ }))
    await userEvent.click(screen.getByRole('button', { name: /Relancer/ }))
    expect(calls).toEqual(['intermediaries', 'headcount', 'retry'])
    // Les sources ne se nomment jamais.
    expect(document.body.textContent).not.toMatch(/france.?travail|adzuna|registre gouv/i)
  })

  it('#4420.4 — nomme les entreprises écartées hors secteur ; absent ou 0 = aucune ligne', () => {
    const noop = () => undefined
    const quietBase = {
      ...counted,
      unresolvedEmployers: 0,
      intermediaries: 0,
      outsideHeadcount: 0,
      notAttempted: 0,
      deadlineCut: false,
    }
    const { rerender } = render(
      <SkillSearchNotices
        query={{ skillSearch: { ...quietBase, outsideSector: 7 } }}
        onShowIntermediaries={noop}
        onRemoveHeadcount={noop}
        onRetry={noop}
      />,
    )
    expect(screen.getByText(/7 entreprises écartées hors secteur/)).toBeInTheDocument()
    rerender(
      <SkillSearchNotices
        query={{ skillSearch: { ...quietBase, outsideSector: 0 } }}
        onShowIntermediaries={noop}
        onRemoveHeadcount={noop}
        onRetry={noop}
      />,
    )
    expect(screen.queryByText(/hors secteur/)).toBeNull()
    rerender(
      <SkillSearchNotices
        query={{ skillSearch: quietBase }}
        onShowIntermediaries={noop}
        onRemoveHeadcount={noop}
        onRetry={noop}
      />,
    )
    expect(screen.queryByText(/hors secteur/)).toBeNull()
  })

  it('sait dire NON : rien de retiré, rien d’affiché ; hors recherche par compétence, rien', () => {
    const quiet = {
      ...counted,
      unresolvedEmployers: 0,
      intermediaries: 0,
      outsideHeadcount: 0,
      notAttempted: 0,
      deadlineCut: false,
    }
    const noop = () => undefined
    const { container, rerender } = render(
      <SkillSearchNotices
        query={{ skillSearch: quiet }}
        onShowIntermediaries={noop}
        onRemoveHeadcount={noop}
        onRetry={noop}
      />,
    )
    expect(container).toBeEmptyDOMElement()
    rerender(<SkillSearchNotices query={{}} onShowIntermediaries={noop} onRemoveHeadcount={noop} onRetry={noop} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('une compétence collée « Java,Vue » se lit « Java, Vue »', () => {
    render(<SkillSearchEmptyCause query={{ skillSearch: { skills: ['Java,Vue'], emptyCause: 'no_offers' } }} />)
    expect(screen.getByText(/ne cite Java, Vue dans cette zone/)).toBeInTheDocument()
  })
})

// #4664 — le détail des offres qui ont fait sortir le compte (tiroir « Aperçu du compte »).
describe('#4664 — le détail des offres', () => {
  const offer = (n: number) => ({
    title: `Dev SAP ${n}`,
    city: 'Lille',
    date: '2026-10-12',
    url: `https://offres.example.org/${n}`,
  })

  it('une ligne par offre, chaque intitulé lié à son annonce dans un nouvel onglet', () => {
    render(<SkillEvidenceOffers evidence={{ ...evidence, offerCount: 2, offers: [offer(1), offer(2)] }} />)
    const links = screen.getAllByRole('link')
    expect(links.map(a => a.getAttribute('href'))).toEqual([
      'https://offres.example.org/1',
      'https://offres.example.org/2',
    ])
    for (const a of links) expect(a).toHaveAttribute('target', '_blank')
    expect(screen.getByText('Les offres qui citent SAP')).toBeInTheDocument()
    expect(screen.queryByText(/plus récentes sur/)).toBeNull()
    expect(document.body.textContent).not.toMatch(/france.?travail|adzuna/i)
  })

  it('au-delà de 10, le vrai total est dit et le détail ne prétend pas être exhaustif', () => {
    const offers = Array.from({ length: 10 }, (_, i) => offer(i + 1))
    render(<SkillEvidenceOffers evidence={{ ...evidence, offerCount: 14, offers }} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(10)
    expect(screen.getByText('Les 10 plus récentes sur 14 offres')).toBeInTheDocument()
  })

  it('sans ville, sans date ou sans lien : ni champ vide ni parenthèses vides', () => {
    render(
      <SkillEvidenceOffers
        evidence={{
          ...evidence,
          offerCount: 2,
          offers: [{ title: 'Sans rien', city: null, date: null, url: null }, offer(2)],
        }}
      />,
    )
    const items = screen.getAllByRole('listitem')
    expect(items[0]?.textContent).toBe('Sans rien')
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })

  it('sans détail (réponse d’avant) : aucune ligne', () => {
    const { container } = render(<SkillEvidenceOffers evidence={evidence} />)
    expect(container).toBeEmptyDOMElement()
  })
})

// #5009 — « 30 offres lues sur 192 trouvées » (sans le mot crédit) ; sans total : « 30 offres lues » seul.
describe('SkillOffersReadLine (#5009)', () => {
  const lineOf = (skillSearch: Record<string, unknown>) => {
    const { container } = render(<SkillOffersReadLine query={{ skillSearch: { skills: ['SAP'], ...skillSearch } }} />)
    return container.textContent
  }

  it('dit lues sur trouvées quand le total est connu', () => {
    expect(lineOf({ offersRead: 30, offersTotal: 192 })).toBe('30 offres lues sur 192 trouvées')
  })

  it('borne basse : « sur au moins M trouvées », jamais présentée comme complète', () => {
    expect(lineOf({ offersRead: 30, offersTotal: 192, offersTotalIsLowerBound: true })).toBe(
      '30 offres lues sur au moins 192 trouvées',
    )
    expect(lineOf({ offersRead: 30, offersTotal: 192, offersTotalIsLowerBound: false })).toBe(
      '30 offres lues sur 192 trouvées',
    )
  })

  it('borne basse sans total : « N offres lues » seul, jamais « sur 0 »', () => {
    expect(lineOf({ offersRead: 30, offersTotalIsLowerBound: true })).toBe('30 offres lues')
    expect(lineOf({ offersRead: 30, offersTotal: 0, offersTotalIsLowerBound: true })).toBe('30 offres lues')
  })

  it('total inconnu : « 30 offres lues » seul, aucune affirmation sur le reste', () => {
    expect(lineOf({ offersRead: 30 })).toBe('30 offres lues')
    expect(lineOf({ offersRead: 1 })).toBe('1 offre lue')
  })

  it('un total plus petit que le lu est incohérent : ignoré', () => {
    expect(lineOf({ offersRead: 30, offersTotal: 12 })).toBe('30 offres lues')
  })

  it('rien de lu ou non mesuré : aucune ligne (jamais « 0 » inventé)', () => {
    expect(lineOf({})).toBe('')
    expect(lineOf({ offersRead: 0 })).toBe('')
  })

  it('jamais le mot crédit', () => {
    expect(lineOf({ offersRead: 30, offersTotal: 192 })).not.toMatch(/cr[ée]dit/i)
  })
})
