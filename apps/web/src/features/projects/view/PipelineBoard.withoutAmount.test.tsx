import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { PipelineSummary, ProjectRow } from '@bellum/contracts'

// ⚠️ #1394 — l'entête de colonne du pipe porte maintenant un `Link` vers la
// liste filtrée (`?stage=`) : ce fichier a besoin d'un routeur. Le faux recopie
// le `search` DANS le `href` — un faux qui jetterait le paramètre laisserait
// passer le défaut du 28/08 : un lien juste, une recherche perdue.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, search }: { children: React.ReactNode; to?: string; search?: Record<string, unknown> }) => {
    const query = new URLSearchParams(
      Object.entries(search ?? {})
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .map(([key, value]) => [key, value]),
    ).toString()
    return <a href={query ? `${to ?? '#'}?${query}` : (to ?? '#')}>{children}</a>
  },
}))

const { PipelineBoard } = await import('./PipelineBoard')

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
})

/**
 * Trois compteurs du pipe disaient un chiffre juste et ne menaient nulle part.
 *
 * « 3 projets sans montant saisi » est la bonne façon de dire qu'un total est un
 * PLANCHER — mais celui qui le lit veut aller les saisir, et rien ne l'y menait :
 * il fallait ouvrir les cartes une par une pour retrouver lesquelles. Le geste
 * est LOCAL et non une route : `/projects` n'a aucun `validateSearch`, donc
 * émettre `?without_amount=1` ouvrirait la liste NON filtrée — un lien qui ment.
 *
 * Le troisième, « N signaux », vivait à côté d'un bouton (« N projets détectés à
 * reprendre ») qui ouvre la lentille Portefeuille. Deux compteurs jumeaux, un
 * cliquable, l'autre non.
 */

const project = (over: Partial<ProjectRow> = {}): ProjectRow =>
  ({
    id: 'p-1',
    account_id: 'a-1',
    company_name: 'ACME',
    sector: null,
    kind: 'pain',
    label: 'Migration data lake',
    detail: null,
    offer: null,
    source: 'pain',
    confidence: 'high',
    urgency: null,
    stage: 'qualified',
    stage_entered_at: new Date().toISOString(),
    owner_id: null,
    expected_close_on: null,
    closed_at: null,
    outcome: null,
    loss_reason: null,
    first_detected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    amount_cents: 4_500_000,
    access_mode: null,
    ...over,
  }) as ProjectRow

/**
 * Trois colonnes, choisies pour que chaque cas soit distinct :
 *  - `qualified` et `confirmed` mélangent chiffré et non chiffré — leur compteur
 *    a donc quelque chose à cacher, et devient un bouton ;
 *  - `negotiation` n'a que du chiffré — c'est elle qui prouve qu'une colonne vidée par
 *    le filtre le DIT, au lieu de retomber sur « Personne ici pour l'instant ».
 */
const summary: PipelineSummary = {
  columns: [
    {
      stage: 'qualified',
      label: 'Qualifié',
      count: 2,
      amount_cents: 4_500_000,
      without_amount: 1,
      without_next_action: 0,
    },
    {
      stage: 'confirmed',
      label: 'Besoin exprimé',
      count: 3,
      amount_cents: 2_000_000,
      without_amount: 2,
      without_next_action: 0,
    },
    {
      stage: 'negotiation',
      label: 'Proposition',
      count: 1,
      amount_cents: 100_000,
      without_amount: 0,
      without_next_action: 0,
    },
  ],
  total_amount_cents: 6_600_000,
  total_count: 6,
  total_without_amount: 3,
  intake: 0,
  signals: 0,
} as PipelineSummary

const PROJECTS: ProjectRow[] = [
  project({ id: 'p-1', label: 'Migration data lake', stage: 'qualified', amount_cents: 4_500_000 }),
  project({ id: 'p-2', label: 'Refonte SI', stage: 'qualified', amount_cents: null }),
  project({ id: 'p-3', label: 'Portail client', stage: 'confirmed', amount_cents: null }),
  project({ id: 'p-4', label: 'Socle data', stage: 'confirmed', amount_cents: null }),
  project({ id: 'p-6', label: 'Poste client', stage: 'confirmed', amount_cents: 2_000_000 }),
  project({ id: 'p-5', label: 'Poste de travail', stage: 'negotiation', amount_cents: 100_000 }),
]

function draw(over: Partial<PipelineSummary> = {}) {
  render(<PipelineBoard summary={{ ...summary, ...over }} projects={PROJECTS} onSelect={() => {}} />)
  return { user: userEvent.setup({ pointerEventsCheck: 0 }) }
}

describe('PipelineBoard — le compteur de tête « sans montant » mène aux projets qu’il compte', () => {
  it('est un BOUTON, pas un simple texte', () => {
    draw()
    expect(screen.getByRole('button', { name: '3 affaires sans montant, hors total' })).toBeInTheDocument()
  })

  it('filtre le pipe ENTIER sur les projets sans montant', async () => {
    const { user } = draw()
    // Avant : tout le pipe est là.
    expect(screen.getByText('Migration data lake')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '3 affaires sans montant, hors total' }))

    // Ne restent que les projets qu'il faut aller chiffrer — dans toutes les colonnes.
    expect(screen.queryByText('Migration data lake')).not.toBeInTheDocument()
    expect(screen.queryByText('Poste de travail')).not.toBeInTheDocument()
    expect(screen.getByText('Refonte SI')).toBeInTheDocument()
    expect(screen.getByText('Portail client')).toBeInTheDocument()
    expect(screen.getByText('Socle data')).toBeInTheDocument()
  })

  it('ANNONCE qu’il est enfoncé — un filtre invisible fait chercher une panne', async () => {
    const { user } = draw()
    const button = screen.getByRole('button', { name: '3 affaires sans montant, hors total' })
    expect(button).toHaveAttribute('aria-pressed', 'false')

    await user.click(button)
    expect(screen.getByRole('button', { name: '3 affaires sans montant, hors total' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('se RELÂCHE au second clic — un filtre qu’on ne peut pas retirer est un piège', async () => {
    const { user } = draw()
    const button = screen.getByRole('button', { name: '3 affaires sans montant, hors total' })
    await user.click(button)
    await user.click(screen.getByRole('button', { name: '3 affaires sans montant, hors total' }))
    expect(screen.getByText('Migration data lake')).toBeInTheDocument()
  })

  it('DIT pourquoi une colonne est vide sous le filtre, au lieu de « Personne ici »', async () => {
    const { user } = draw()
    await user.click(screen.getByRole('button', { name: '3 affaires sans montant, hors total' }))
    // `negotiation` n'a que des projets chiffrés : sous ce filtre elle est vide, et
    // « Personne ici pour l'instant » serait faux — il y a quelqu'un.
    expect(screen.getByText('Tous les projets de cette étape ont un montant saisi.')).toBeInTheDocument()
    expect(screen.queryByText('Personne ici pour l’instant')).not.toBeInTheDocument()
  })
})

describe('PipelineBoard — le compteur de colonne filtre SA colonne', () => {
  it('est un bouton par colonne concernée', () => {
    draw()
    expect(screen.getByRole('button', { name: '1 sans montant' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2 sans montant' })).toBeInTheDocument()
  })

  it('ne touche QUE sa colonne — les autres gardent tout leur contenu', async () => {
    const { user } = draw()
    await user.click(screen.getByRole('button', { name: '1 sans montant' }))

    // La colonne « Qualifié » est filtrée…
    expect(screen.queryByText('Migration data lake')).not.toBeInTheDocument()
    expect(screen.getByText('Refonte SI')).toBeInTheDocument()
    // …et les deux autres sont INTACTES, chiffrées comprises.
    expect(screen.getByText('Portail client')).toBeInTheDocument()
    expect(screen.getByText('Socle data')).toBeInTheDocument()
    expect(screen.getByText('Poste client')).toBeInTheDocument()
    expect(screen.getByText('Poste de travail')).toBeInTheDocument()
  })

  it('un second compteur de colonne remplace le premier — un seul foyer à la fois', async () => {
    const { user } = draw()
    await user.click(screen.getByRole('button', { name: '1 sans montant' }))
    await user.click(screen.getByRole('button', { name: '2 sans montant' }))

    // « Qualifié » a retrouvé son projet chiffré, « Besoin exprimé » a perdu le sien.
    expect(screen.getByText('Migration data lake')).toBeInTheDocument()
    expect(screen.queryByText('Poste client')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1 sans montant' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '2 sans montant' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('reste un TEXTE quand la colonne est entièrement non chiffrée — le filtre n’y cacherait rien', () => {
    // Un bouton qui ne fait rien est pire qu'un chiffre nu : si tous les projets
    // de l'étape sont sans montant, les filtrer laisse la colonne identique.
    render(
      <PipelineBoard
        summary={{
          ...summary,
          columns: [
            {
              stage: 'confirmed',
              label: 'Besoin exprimé',
              count: 2,
              amount_cents: 0,
              without_amount: 2,
              without_next_action: 0,
            },
          ],
        }}
        projects={PROJECTS}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText('2 sans montant')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '2 sans montant' })).not.toBeInTheDocument()
  })
})

describe('PipelineBoard — la file de qualification a quitté le Pipeline (#4499)', () => {
  /*
   * #4499 (Louis 23/10) — la carte « Affaires à qualifier → Ouvrir la file de qualification » a quitté la page avec
   * les trois autres : la file est atteignable depuis l'onglet Besoins (`IntakeQueueLink`, testé à part), et les
   * signaux depuis « Les signaux restent dans Signaux ». Le Kanban ne rend donc plus cette porte, même quand il y a
   * des signaux et des affaires à qualifier — c'est ce que ce test tient.
   */
  it('NON : aucune porte « Ouvrir la file de qualification » sur le Kanban, même avec 12 signaux et 4 à qualifier', () => {
    draw({ signals: 12, intake: 4 })
    expect(screen.queryByRole('button', { name: /Ouvrir la file de qualification/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Affaires à qualifier/)).not.toBeInTheDocument()
  })
})

describe('PipelineBoard — le filtre ne fabrique jamais un zéro', () => {
  it('n’affiche aucun « 0 € » quand le filtre ne laisse que du non chiffré', async () => {
    const { user } = draw()
    await user.click(screen.getByRole('button', { name: '3 affaires sans montant, hors total' }))
    expect(screen.queryByText('0 €')).not.toBeInTheDocument()
    // Les cartes restées disent « Montant à saisir », jamais 0.
    expect(screen.getAllByText('Montant à saisir').length).toBeGreaterThan(0)
  })
})
