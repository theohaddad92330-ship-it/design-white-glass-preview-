import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenNeedRow } from '@bellum/contracts'

/**
 * L'onglet HISTORIQUE — ce qui est RÉELLEMENT journalisé sur un besoin, et ce
 * qui ne l'est pas.
 *
 * Les trois lectures sont MOQUÉES : ce qui se teste ici n'est aucune d'elles,
 * c'est le FIL qu'elles composent — l'ordre, ce qui y entre, ce qui n'y entre
 * pas, et la phrase qui dit ce que la base ne sait pas.
 */

const history = vi.fn()
const steps = vi.fn()
const documents = vi.fn()
vi.mock('../hooks/useNeedHistory', () => ({ useNeedHistory: () => history() }))
vi.mock('../hooks/useNeedSteps', () => ({ useNeedSteps: () => steps() }))
vi.mock('../hooks/useNeedDocuments', () => ({ useNeedDocuments: () => documents() }))
const statusHistory = vi.fn()
vi.mock('../hooks/useNeedStatusHistory', () => ({ useNeedStatusHistory: () => statusHistory() }))

const { NeedHistoryTab } = await import('./NeedHistoryTab')

function need(over: Partial<OpenNeedRow> = {}): OpenNeedRow {
  return { id: 'n-1', title: 'Ingénieur données', status: 'matching', ...over } as unknown as OpenNeedRow
}

beforeEach(() => {
  history.mockReturnValue({ crossings: [], isLoading: false, isError: false })
  steps.mockReturnValue({ items: [], isLoading: false, isError: false })
  documents.mockReturnValue({ items: [], isLoading: false, isError: false })
  statusHistory.mockReturnValue({ items: [], isError: false })
})

describe('NeedHistoryTab', () => {
  it('rend une décision, son motif et ce qui manquait', () => {
    history.mockReturnValue({
      crossings: [
        {
          id: 'g-1',
          gate: 'need_staffable',
          decision: 'refuse',
          reason: 'Pas de compétence Airflow interne.',
          missing: [],
          created_at: '2026-05-20T09:00:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
    })
    render(<NeedHistoryTab need={need()} />)
    expect(screen.getByText(/Pas de compétence Airflow interne/)).toBeInTheDocument()
  })

  it('dit qu’aucune décision n’a encore été journalisée sur ce besoin', () => {
    render(<NeedHistoryTab need={need()} />)
    expect(screen.queryByText(/Pas de compétence/)).not.toBeInTheDocument()
  })

  it('distingue un échec de lecture d’un historique vide', () => {
    history.mockReturnValue({ crossings: [], isLoading: false, isError: true })
    render(<NeedHistoryTab need={need()} />)
    expect(screen.getByText(/pas pu être chargé/)).toBeInTheDocument()
  })
})

/**
 * CE QUE L'ONGLET MONTRE EN PLUS DES PORTES (31/08/2026).
 *
 * Il n'en montrait qu'une source sur quatre, ce qui le faisait lire comme un
 * audit complet alors qu'il en rendait un quart.
 */
describe('NeedHistoryTab — les quatre sources', () => {
  it('porte l’entrée dans l’état COURANT, avec son motif', () => {
    render(
      <NeedHistoryTab
        need={need({ status: 'on_hold', status_changed_at: '2026-08-10T08:00:00.000Z', status_reason: 'Budget gelé' })}
      />,
    )
    expect(screen.getByText(/Entré dans l’état/)).toBeInTheDocument()
    expect(screen.getByText('Budget gelé')).toBeInTheDocument()
  })

  it('n’invente PAS d’entrée d’état quand la date manque', () => {
    // `status_changed_at` à `null` = ce besoin n'a jamais franchi de
    // transition. Lui donner sa date de création inventerait un événement.
    render(<NeedHistoryTab need={need({ status_changed_at: null })} />)
    expect(screen.queryByText(/Entré dans l’état/)).not.toBeInTheDocument()
  })

  it('porte les étapes COCHÉES, et jamais celles qui restent à faire', () => {
    steps.mockReturnValue({
      items: [
        { id: 's-1', label: 'Envoyer la short list', status: 'done', doneAt: '2026-08-12T10:00:00.000Z' },
        { id: 's-2', label: 'Organiser les entretiens', status: 'todo', doneAt: null },
      ],
      isLoading: false,
      isError: false,
    })
    render(<NeedHistoryTab need={need()} />)
    expect(screen.getByText('Envoyer la short list')).toBeInTheDocument()
    // Une étape à faire n'est pas datée : elle n'a rien à faire dans un fil
    // chronologique, et l'y ranger obligerait à lui inventer une date.
    expect(screen.queryByText('Organiser les entretiens')).not.toBeInTheDocument()
  })

  it('porte les documents ouverts, et dit que leur statut est celui d’AUJOURD’HUI', () => {
    documents.mockReturnValue({
      items: [{ id: 'd-1', kind: 'quote', name: 'Devis.pdf', status: 'signed', createdAt: '2026-08-03T10:00:00.000Z' }],
      isLoading: false,
      isError: false,
    })
    render(<NeedHistoryTab need={need()} />)
    expect(screen.getByText(/Document ouvert/)).toBeInTheDocument()
    // Sans cette précision, « signé » à côté du 3 août se lirait « signé le 3 ».
    expect(screen.getByText(/Statut aujourd’hui/)).toBeInTheDocument()
  })

  it('range le fil du plus RÉCENT au plus ancien, toutes sources confondues', () => {
    history.mockReturnValue({
      crossings: [
        {
          id: 'g-1',
          gate: 'porte-ancienne',
          decision: 'accept',
          reason: null,
          missing: [],
          created_at: '2026-08-01T09:00:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
    })
    steps.mockReturnValue({
      items: [{ id: 's-1', label: 'étape-récente', status: 'done', doneAt: '2026-08-25T09:00:00.000Z' }],
      isLoading: false,
      isError: false,
    })
    render(<NeedHistoryTab need={need({ status_changed_at: '2026-08-15T09:00:00.000Z' })} />)
    const body = document.body.textContent ?? ''
    expect(body.indexOf('étape-récente')).toBeLessThan(body.indexOf('Entré dans l’état'))
    expect(body.indexOf('Entré dans l’état')).toBeLessThan(body.indexOf('porte-ancienne'))
  })

  it('une date ILLISIBLE ne se range pas au hasard — elle sort du fil', () => {
    steps.mockReturnValue({
      items: [{ id: 's-1', label: 'étape-cassée', status: 'done', doneAt: 'pas-une-date' }],
      isLoading: false,
      isError: false,
    })
    render(<NeedHistoryTab need={need({ status_changed_at: null })} />)
    expect(screen.queryByText('étape-cassée')).not.toBeInTheDocument()
  })
})

/**
 * ⚠️ CE QUE LE FIL NE SAIT PAS — et il le DIT.
 *
 * Un onglet nommé « Historique » se lit comme un audit complet. Trois manques
 * sont réels et structurels : les états précédents (la colonne est écrasée), les
 * modifications de champ (elles s'écrivent en place), et l'auteur de chaque
 * geste (aucune source ne le porte).
 */
describe('NeedHistoryTab — ce qui n’est PAS journalisé', () => {
  it('nomme les trois manques, même quand le fil est plein', () => {
    history.mockReturnValue({
      crossings: [
        {
          id: 'g-1',
          gate: 'need_staffable',
          decision: 'accept',
          reason: null,
          missing: [],
          created_at: '2026-05-20T09:00:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
    })
    render(<NeedHistoryTab need={need()} />)
    expect(screen.getByText(/Les modifications de champ/)).toBeInTheDocument()
    expect(screen.getByText(/elles n’existent pas/)).toBeInTheDocument()
  })

  it('les nomme AUSSI quand le fil est vide — c’est là que la confusion coûte le plus', () => {
    render(<NeedHistoryTab need={need({ status_changed_at: null })} />)
    expect(screen.getByText(/Rien n’a encore été journalisé/)).toBeInTheDocument()
    expect(screen.getByText(/elles n’existent pas/)).toBeInTheDocument()
  })
})

/**
 * #2967 (lot V39, #2320.23 / #2320.30) — LES ÉTATS SUCCESSIFS, lus dans le
 * journal des transitions, avec leur SOURCE : Laura propose, l'humain valide ;
 * une correction humaine prime.
 */
describe('NeedHistoryTab — le journal des changements d’état (#2967)', () => {
  const line = (over: Record<string, unknown>) => ({
    id: 't-1',
    fromState: 'matching',
    toState: 'shortlist_ready',
    actorId: 'u-1',
    proof: null,
    source: 'human',
    toStage: 'shortlist',
    occurredAt: '2026-09-26T10:00:00.000Z',
    ...over,
  })

  it('rend chaque changement d’état, de → vers', () => {
    statusHistory.mockReturnValue({ items: [line({})], isError: false })
    render(<NeedHistoryTab need={need()} />)
    expect(screen.getByText(/Statut : « .+ » → « .+ »/)).toBeInTheDocument()
  })

  it('nomme une proposition de Laura validée et une correction humaine, avec sa preuve', () => {
    statusHistory.mockReturnValue({
      items: [
        line({ id: 't-1', source: 'laura' }),
        line({
          id: 't-2',
          source: 'human_correction',
          proof: 'Le client a rouvert la fiche',
          occurredAt: '2026-09-27T10:00:00.000Z',
        }),
      ],
      isError: false,
    })
    render(<NeedHistoryTab need={need()} />)
    expect(screen.getByText('Proposé par Laura, validé par un humain')).toBeInTheDocument()
    expect(
      screen.getByText('Correction humaine — prime sur toute proposition — Le client a rouvert la fiche'),
    ).toBeInTheDocument()
  })

  it('ne répète pas l’entrée dans l’état courant quand le journal la porte déjà', () => {
    statusHistory.mockReturnValue({ items: [line({})], isError: false })
    render(<NeedHistoryTab need={need({ status_changed_at: '2026-09-26T10:00:00.000Z' })} />)
    expect(screen.queryByText(/Entré dans l’état/)).not.toBeInTheDocument()
  })
})
