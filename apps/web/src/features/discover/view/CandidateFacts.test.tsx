import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import type { CardFact } from '@/features/discover/lib/discover-card-facts'
import { CandidateFacts, CandidateWeighed } from './CandidateFacts'

function fact(over: Partial<CardFact> = {}): CardFact {
  return {
    key: over.label ?? 'k',
    type: 'hiring',
    nature: 'hiring',
    label: 'Ingénieur DevOps',
    date: '2026-09-01',
    ...over,
  }
}

// #4068 (lot DECOUVRIR-CARTE) — une ligne par fait : date · NATURE · fait court · lien.
describe('#4068 — une liste de faits de carte', () => {
  it('rend les faits dans l’ordre reçu (le contrat a déjà trié), un <li> par fait', () => {
    render(
      <CandidateFacts
        label="Signaux forts"
        facts={[fact({ label: 'Récent', date: '2026-09-30' }), fact({ label: 'Ancien', date: '2026-01-02' })]}
      />,
    )
    const rows = within(screen.getByTestId('candidate-facts')).getAllByRole('listitem')
    expect(rows.map(r => r.textContent)).toEqual([expect.stringContaining('Récent'), expect.stringContaining('Ancien')])
  })

  it('chaque ligne porte sa date, sa NATURE lisible et son fait, et le fait ne se tronque jamais (R17 : « Mise à jou »)', () => {
    render(
      <CandidateFacts
        label="Signaux forts"
        facts={[fact({ type: 'tender', nature: 'need', label: 'Infogérance poste de travail', date: '2026-09-30' })]}
      />,
    )
    const row = screen.getByRole('listitem')
    expect(row).toHaveTextContent('30/09/2026')
    expect(row).toHaveTextContent('Besoin')
    const text = screen.getByText('Infogérance poste de travail')
    expect(text).not.toHaveClass('truncate')
    expect(row).toHaveClass('flex-wrap')
    expect(text).toHaveAttribute('title', 'Infogérance poste de travail')
  })

  it.each([
    ['project', 'Projet'],
    ['leader', 'Décideur'],
    ['deal', 'Contrat'],
    ['space', 'Déjà connu'],
    ['financial', 'Résultat financier'],
    ['event', 'Événement'],
    ['economy', 'Actualité'],
  ] as const)('nomme la nature %s « %s », jamais une source', (nature, label) => {
    render(<CandidateFacts label="Faits" facts={[fact({ type: 'business', nature, label: 'Un fait' })]} />)
    expect(screen.getByRole('listitem')).toHaveTextContent(label)
  })

  it('un besoin daté par l’analyse dit « vu le », jamais une date de publication', () => {
    render(
      <CandidateFacts label="Faits" facts={[fact({ nature: 'need', dateIsDetection: true, date: '2026-09-15' })]} />,
    )
    expect(screen.getByRole('listitem')).toHaveTextContent('vu le 15/09/2026')
  })

  it('aucun fait : aucune ligne, aucun « 0 »', () => {
    const { container } = render(<CandidateFacts label="Faits" facts={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

// Théo A decouvrir.R5 — le lien est visible sur la ligne ; refonte 23/10 : il dit sa nature, JAMAIS le site (une source ne se nomme pas).
describe('#4068.4 — le lien source', () => {
  it('une offre avec URL → « Voir l’annonce », cible ≥ 44 px au doigt', () => {
    render(<CandidateFacts label="Faits" facts={[fact({ url: 'https://example.test/offre' })]} />)
    const link = screen.getByRole('link', { name: "Voir l'annonce (nouvel onglet)" })
    expect(link).toHaveAttribute('href', 'https://example.test/offre')
    expect(link).toHaveTextContent("Voir l'annonce")
    expect(screen.getByRole('listitem')).not.toHaveTextContent('example.test')
    expect(link.className).toContain('pointer-coarse:min-h-11')
  })

  // #5010.3 (Louis 02/11) — le SITE de publication d'une offre s'affiche (liste blanche) ; ce n'est pas un fournisseur.
  it('une offre publiée sur un site d’emploi reconnu → « Voir l’annonce · LinkedIn »', () => {
    render(<CandidateFacts label="Faits" facts={[fact({ url: 'https://www.linkedin.com/jobs/view/123' })]} />)
    const link = screen.getByRole('link', { name: /Voir l'annonce/ })
    expect(link).toHaveTextContent("Voir l'annonce")
    expect(screen.getByTestId('candidate-fact')).toHaveTextContent('LinkedIn')
  })

  it('une offre sur un hôte inconnu ou un agrégateur → aucun site nommé', () => {
    render(
      <CandidateFacts
        label="Faits"
        facts={[fact({ url: 'https://jobs.theirstack.com/o/1' }), fact({ label: 'b', url: 'https://example.test/x' })]}
      />,
    )
    for (const row of screen.getAllByTestId('candidate-fact')) {
      expect(row).not.toHaveTextContent(/theirstack|example\.test/i)
      expect(row).not.toHaveTextContent('·  ')
    }
  })

  it('un fait non-offre avec un lien LinkedIn → pas de site nommé', () => {
    render(
      <CandidateFacts
        label="Faits"
        facts={[fact({ type: 'business', nature: 'economy', url: 'https://www.linkedin.com/pulse/a' })]}
      />,
    )
    expect(screen.getByTestId('candidate-fact')).not.toHaveTextContent('LinkedIn')
  })

  it('un fait non-annonce avec URL → « Voir la source »', () => {
    render(
      <CandidateFacts
        label="Faits"
        facts={[fact({ type: 'business', nature: 'economy', url: 'https://example.test/a' })]}
      />,
    )
    const link = screen.getByRole('link', { name: 'Voir la source (nouvel onglet)' })
    expect(link).toHaveTextContent('Voir la source')
    expect(link).not.toHaveTextContent('example.test')
  })

  it('une URL illisible (pas http) ne fait aucun lien', () => {
    render(<CandidateFacts label="Faits" facts={[fact({ url: 'javascript:alert(1)' })]} />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('sans URL : aucun lien, aucun « Sans lien vérifiable »', () => {
    render(<CandidateFacts label="Faits" facts={[fact()]} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByText(/sans lien/i)).toBeNull()
  })

  it('SAIT DIRE NON — aucun nom de source injecté ne sort dans le rendu', () => {
    const names = [
      'BODACC',
      'France Travail',
      'BOAMP',
      'APEC',
      'WTTJ',
      'DECP',
      'Pappers',
      'registre',
      'CRM',
      'DataForge',
    ]
    const { container } = render(
      <CandidateFacts
        label="Faits"
        facts={[
          // La donnée porte le nom (comme `source` côté API) : l'écran ne doit pas le répéter.
          {
            ...fact({ type: 'legal', nature: 'economy', url: 'https://example.test/a' }),
            source: 'BODACC',
          } as CardFact,
          { ...fact({ url: 'https://example.test/b' }), source: 'France Travail' } as CardFact,
          { ...fact({ type: 'business', nature: 'space', label: 'affaire gagnée' }), source: 'CRM' } as CardFact,
        ]}
      />,
    )
    const text = `${container.textContent} ${[...container.querySelectorAll('[title],[aria-label]')]
      .map(n => `${n.getAttribute('title')} ${n.getAttribute('aria-label')}`)
      .join(' ')}`
    for (const name of names) expect(text.toLowerCase()).not.toContain(name.toLowerCase())
  })
})

describe('#4067 — « Ce qui a pesé » nomme les familles de faits, jamais un fournisseur', () => {
  it('liste chaque nature une fois', () => {
    render(
      <CandidateWeighed
        facts={[
          fact({ nature: 'hiring' }),
          fact({ nature: 'hiring', label: 'b' }),
          fact({ nature: 'need', label: 'c' }),
        ]}
      />,
    )
    expect(screen.getByTestId('candidate-weighed')).toHaveTextContent('Ce qui a pesé : recrutement, besoin')
  })
  it('aucun fait ⇒ aucune ligne', () => {
    render(<CandidateWeighed facts={[]} />)
    expect(screen.queryByTestId('candidate-weighed')).toBeNull()
  })
})

// #4182 (R25) — l'équipe demandeuse n'était rendue que sur la vue « besoins » : jamais sur la carte.
describe('#4182 — l’équipe demandeuse sous le fait de recrutement', () => {
  const requester = (status: 'etaye' | 'a_identifier'): NonNullable<CardFact['requester']> => ({
    status,
    author: 'rh',
    possibleManagerFunction: null,
    team: 'Équipe Data',
    city: null,
    method: ['lire_offre'],
  })

  it('un demandeur étayé s’affiche sous le fait', () => {
    render(<CandidateFacts label="Signaux forts" facts={[fact({ requester: requester('etaye') })]} />)
    expect(screen.getByTestId('candidate-fact-requester')).toHaveTextContent('Équipe Data')
  })

  it('à identifier : la ligne le dit, avec sa méthode (Louis 23/10, #4286.11)', () => {
    render(<CandidateFacts label="Signaux forts" facts={[fact({ requester: requester('a_identifier') })]} />)
    expect(screen.getByTestId('candidate-fact-requester')).toHaveTextContent('à identifier')
  })

  it('SAIT DIRE NON — pas de demandeur composé : aucune ligne', () => {
    render(<CandidateFacts label="Signaux forts" facts={[fact({ label: 'B' })]} />)
    expect(screen.queryByTestId('candidate-fact-requester')).toBeNull()
  })
})

// #4437.5 (recette prod 23/10) — un intitulé libre (« React JS-Python ») montre sa compétence et sa famille.
describe('#4437.5 — compétence et famille d’une offre à intitulé libre', () => {
  it('puces compétence + famille sous le fait ; sans les deux, aucune ligne', () => {
    render(
      <CandidateFacts
        label="Signaux forts"
        facts={[
          fact({ label: 'React JS-Python', technologies: ['React', 'Python'], jobFamily: 'developpement' }),
          fact({ label: 'Rejoignez-nous' }),
        ]}
      />,
    )
    const readings = screen.getAllByTestId('candidate-fact-reading')
    expect(readings).toHaveLength(1)
    expect(within(readings[0]!).getByText('React')).toBeInTheDocument()
    expect(within(readings[0]!).getByText('Python')).toBeInTheDocument()
    expect(within(readings[0]!).getByText('Développement')).toBeInTheDocument()
  })

  it('une famille hors liste fermée ne fait pas de puce', () => {
    render(<CandidateFacts label="Signaux forts" facts={[fact({ jobFamily: 'inconnue' })]} />)
    expect(screen.queryByTestId('candidate-fact-reading')).toBeNull()
  })
})

// #4285.1 — « Augmentation de capital » : daté, avec son lien, dans les DEUX langues ; absent, aucune ligne.
describe('#4285.1 — le fait « Augmentation de capital »', () => {
  const capital = fact({
    type: 'business',
    nature: 'economy',
    label: 'Augmentation de capital',
    date: '2026-10-05',
    url: 'https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:B1',
  })

  afterEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('fr : date, libellé « Augmentation de capital » (jamais « Levée »), lien « Voir la source »', () => {
    render(<CandidateFacts label="Contexte" facts={[capital]} />)
    const row = screen.getByRole('listitem')
    expect(row).toHaveTextContent('05/10/2026')
    expect(row).toHaveTextContent('Augmentation de capital')
    expect(row).not.toHaveTextContent(/levée/i)
    expect(screen.getByRole('link', { name: /Voir la source/ })).toHaveAttribute('href', capital.url)
  })

  it('en : le libellé et le lien sont traduits, le français n’apparaît nulle part', async () => {
    await i18n.changeLanguage('en')
    render(<CandidateFacts label="Context" facts={[capital]} />)
    const row = screen.getByRole('listitem')
    expect(row).toHaveTextContent('Capital increase')
    expect(row).not.toHaveTextContent('Augmentation de capital')
    expect(screen.getByRole('link', { name: /\(new tab\)/ })).toHaveAttribute('href', capital.url)
  })

  it('SAIT DIRE NON : une actualité dont le titre en parle garde son titre, et sans fait aucune ligne', () => {
    render(
      <CandidateFacts
        label="Contexte"
        facts={[fact({ type: 'business', nature: 'economy', label: 'Augmentation de capital de Latécoère' })]}
      />,
    )
    expect(screen.getByRole('listitem')).toHaveTextContent('Augmentation de capital de Latécoère')
    cleanup()
    const { container } = render(<CandidateFacts label="Contexte" facts={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

// #4285.1 (recette 23/10) — une levée affichée porte un lien vers son annonce ; sans URL connue, aucun lien (rien d'inventé).
describe('#4285.1 — le lien d’une levée de fonds', () => {
  it('une levée avec URL porte un lien vers sa source, ouvert hors de la carte', () => {
    render(
      <CandidateFacts
        label="Signaux forts"
        facts={[
          fact({
            type: 'funding',
            nature: 'economy',
            label: 'Levée de fonds : 12 M€ · série B',
            url: 'https://askelia.example/actualites/levee',
          }),
        ]}
      />,
    )
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://askelia.example/actualites/levee')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('sait dire NON : une levée sans URL connue n’a AUCUN lien factice', () => {
    render(
      <CandidateFacts
        label="Signaux forts"
        facts={[fact({ type: 'funding', nature: 'economy', label: 'Levée de fonds : 12 M€ · série B' })]}
      />,
    )
    expect(screen.queryByRole('link')).toBeNull()
  })
})

// #4284.1 / #4284.26 (Louis 23/10) — une OFFRE hors du métier de l'ESN se DIT sur la carte (même règle que les signaux).
describe('#4284.1 — « hors de ton métier » sur le fait d’une offre', () => {
  it('OUI : un poste que nulle ESN ne place porte la marque', () => {
    render(<CandidateFacts label="Signaux forts" facts={[fact({ label: 'Facteur / Factrice' })]} />)
    expect(screen.getByTestId('offer-out-of-trade')).toHaveTextContent('hors de ton métier')
  })

  it('NON : une offre IT ou un signal qui n’est pas une offre n’est pas marqué', () => {
    render(
      <CandidateFacts
        label="Signaux forts"
        facts={[
          fact({ label: 'Ingénieur DevOps' }),
          fact({ label: 'Facteur / Factrice', type: 'tender', nature: 'project' }),
        ]}
      />,
    )
    expect(screen.queryByTestId('offer-out-of-trade')).toBeNull()
  })
})

// #5000.2 — le type de contrat de l'offre se lit SUR la carte Découvrir, comme sur la fiche ; absent ⇒ « non précisé ».
describe('#5000.2 — le type de contrat sur la ligne d’une offre', () => {
  afterEach(cleanup)

  it.each([
    ['CDI', 'CDI'],
    ['FREELANCE', 'Freelance'],
    ['INTERIM', 'Intérim'],
    ['CDD', 'CDD'],
  ])('une offre %s dit « %s »', (contractType, label) => {
    render(<CandidateFacts label="Faits" facts={[fact({ contractType })]} />)
    expect(screen.getByTestId('candidate-fact-contract')).toHaveTextContent(label)
  })

  it('une offre sans contrat déclaré dit « Contrat non précisé », jamais une ligne vide ni « 0 »', () => {
    render(<CandidateFacts label="Faits" facts={[fact({ contractType: undefined })]} />)
    expect(screen.getByTestId('candidate-fact-contract')).toHaveTextContent('Contrat non précisé')
  })

  it('un fait qui n’est pas une offre ne porte aucune ligne de contrat', () => {
    render(<CandidateFacts label="Faits" facts={[fact({ type: 'tender', nature: 'need' })]} />)
    expect(screen.queryByTestId('candidate-fact-contract')).toBeNull()
  })
})
