import { REPLY_BADGE_CODES, REPLY_LABEL_FAMILIES } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import en from '../../../i18n/locales/en/chat.json'
import fr from '../../../i18n/locales/fr/chat.json'
import type { ChatResponseContext } from './ContextDisclosure'
import { ReplyBadges } from './ReplyBadges'
import { replyBadgesFor } from './reply-badges'

const now = new Date('2026-10-06T10:00:00.000Z')

function context(extra: Partial<ChatResponseContext> = {}): ChatResponseContext {
  return {
    active: {
      profile: { present: false, name: null },
      account: { present: false, name: null },
      contacts_count: 0,
      plan: { present: false },
      portfolio: { present: false, count: 0 },
      memory: { pinned_facts: 0, has_summary: false },
    },
    sources: [],
    not_consulted: [],
    ...extra,
  }
}

describe('#3764 — libellés des badges', () => {
  it.each([
    ['fr', fr.replyBadges],
    ['en', en.replyBadges],
  ])('%s : chaque code et chaque valeur de famille a son libellé, court et sans jargon', (_lang, labels) => {
    const all: string[] = []
    for (const code of REPLY_BADGE_CODES) {
      expect(labels.status[code]).toBeTruthy()
      all.push(labels.status[code])
    }
    for (const [family, values] of Object.entries(REPLY_LABEL_FAMILIES)) {
      for (const value of values) {
        const label = (labels as unknown as Record<string, Record<string, string>>)[family]?.[value]
        expect(label, `${family}.${value}`).toBeTruthy()
        all.push(label as string)
      }
    }
    for (const label of all) {
      expect(label.length).toBeLessThanOrEqual(40)
      expect(label).not.toMatch(/non mesuré|not measured|pourquoi ce rend|dataforge|\bnull\b|\b0\b/i)
    }
  })
})

describe('#3764 — badges rendus sous une réponse', () => {
  it('une réponse sans rien à dire ne montre aucun badge', () => {
    const { container } = render(<ReplyBadges labels={replyBadgesFor(context(), now)} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('une cartographie incomplète dit « Cartographie partielle », une seule fois', () => {
    const labels = replyBadgesFor(
      context({
        coverage_report: {
          detected: 12,
          resolved: null,
          verified: null,
          relevant: null,
          enriched: null,
          excluded: 0,
          unresolved: 3,
          sources_unavailable: [],
          estimated_coverage: null,
          coverage_basis: 'lecture',
        },
        not_consulted: ['agenda'],
      }),
      now,
    )
    render(<ReplyBadges labels={labels} />)
    expect(screen.getAllByText('Cartographie partielle')).toHaveLength(1)
    expect(screen.queryByText('Incomplet')).not.toBeInTheDocument()
  })

  it('aucun outil lu : « Aucune preuve actuelle », jamais « Signal actuel vérifié »', () => {
    const labels = replyBadgesFor(
      context({
        sources: [{ kind: 'account', label: 'Dossier', as_of: '2026-10-01' }],
        reasoning_trace: { tools_planned: [], tools_called: [] } as unknown as ChatResponseContext['reasoning_trace'],
      }),
      now,
    )
    render(<ReplyBadges labels={labels} />)
    expect(screen.getByText('Aucune preuve actuelle')).toBeInTheDocument()
    expect(screen.queryByText('Signal actuel vérifié')).not.toBeInTheDocument()
  })

  // #4771 (recette prod 28/10) — 39 offres datées et sourcées rendues par `search_job_offers`, et sous la
  // carte « Aucune preuve actuelle » : l'outil lu cite sa source (datée) côté IA, le pied ne nie plus la liste.
  it('une liste d’offres lue (outil + source datée) ne porte jamais « Aucune preuve actuelle »', () => {
    const labels = replyBadgesFor(
      context({
        sources: [{ kind: 'market_signal', label: 'Offres d’emploi publiées', as_of: '2026-10-28' }],
        reasoning_trace: {
          tools_planned: [],
          tools_called: ['search_job_offers'],
        } as unknown as ChatResponseContext['reasoning_trace'],
      }),
      now,
    )
    render(<ReplyBadges labels={labels} />)
    expect(screen.queryByText('Aucune preuve actuelle')).not.toBeInTheDocument()
  })

  // #4071.3 (recette R6 14/10) — SNCF RESEAU : Laura cite l'affaire perdue (faits du
  // compte) et la recherche enregistrée (mémoire de l'espace) sans qu'aucun outil
  // n'ait été appelé ce tour — le badge ne doit pas dire « Aucune preuve actuelle ».
  it('aucun outil lu MAIS des faits du compte lus : jamais « Aucune preuve actuelle »', () => {
    const labels = replyBadgesFor(
      context({
        active: {
          profile: { present: false, name: null },
          account: { present: true, name: 'SNCF RESEAU' },
          contacts_count: 0,
          plan: { present: false },
          portfolio: { present: false, count: 0 },
          memory: { pinned_facts: 0, has_summary: false },
          account_facts: { present: true, count: 1 },
        },
        reasoning_trace: { tools_planned: [], tools_called: [] } as unknown as ChatResponseContext['reasoning_trace'],
      }),
      now,
    )
    render(<ReplyBadges labels={labels} />)
    expect(screen.queryByText('Aucune preuve actuelle')).not.toBeInTheDocument()
  })

  // Même preuve, mais portée par la mémoire de l'espace (recherches enregistrées,
  // listes de cibles, résumés de fils) plutôt que par les faits du compte.
  it('aucun outil lu MAIS la mémoire de l’espace lue : jamais « Aucune preuve actuelle »', () => {
    const labels = replyBadgesFor(
      context({
        active: {
          profile: { present: false, name: null },
          account: { present: false, name: null },
          contacts_count: 0,
          plan: { present: false },
          portfolio: { present: false, count: 0 },
          memory: { pinned_facts: 0, has_summary: false },
          workspace_recall: { present: true, count: 2 },
        },
        reasoning_trace: { tools_planned: [], tools_called: [] } as unknown as ChatResponseContext['reasoning_trace'],
      }),
      now,
    )
    render(<ReplyBadges labels={labels} />)
    expect(screen.queryByText('Aucune preuve actuelle')).not.toBeInTheDocument()
  })

  it('une action en attente dit « Action à valider »', () => {
    const labels = replyBadgesFor(
      context({ pending_actions: [{ id: 'a' }] as unknown as ChatResponseContext['pending_actions'] }),
      now,
    )
    render(<ReplyBadges labels={labels} />)
    expect(screen.getByText('Action à valider')).toBeInTheDocument()
  })
})

describe('R10C-FIX — une réponse interrompue n’affiche aucun badge de preuve positive', () => {
  it.each([
    ['une panne', { reason: 'turn_error' }],
    ['le délai', { reason: 'turn_timeout' }],
    ['un motif inconnu', { reason: 'autre' }],
  ])('tour arrêté par %s : ni « Signal actuel vérifié » ni aucun badge', (_name, partial) => {
    const labels = replyBadgesFor(
      context({
        sources: [{ kind: 'account', label: 'Dossier', as_of: '2026-10-05' }],
        reasoning_trace: {
          tools_planned: [],
          tools_called: [{ name: 'x' }],
        } as unknown as ChatResponseContext['reasoning_trace'],
        partial,
      }),
      now,
    )
    render(<ReplyBadges labels={labels} />)
    expect(screen.queryByText('Signal actuel vérifié')).not.toBeInTheDocument()
    expect(labels.badges).toEqual([])
  })

  it('le même contexte sans `partial` garde son badge (la garde sait dire non)', () => {
    const labels = replyBadgesFor(
      context({
        sources: [{ kind: 'account', label: 'Dossier', as_of: '2026-10-05' }],
        reasoning_trace: {
          tools_planned: [],
          tools_called: [{ name: 'x' }],
        } as unknown as ChatResponseContext['reasoning_trace'],
      }),
      now,
    )
    render(<ReplyBadges labels={labels} />)
    expect(screen.getByText('Signal actuel vérifié')).toBeInTheDocument()
  })
})
