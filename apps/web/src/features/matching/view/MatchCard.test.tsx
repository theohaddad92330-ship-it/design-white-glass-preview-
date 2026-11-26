import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { MatchResult } from '@bellum/contracts'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params }: { children: React.ReactNode; to: string; params?: Record<string, string> }) => (
    <a href={Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace('$' + key, value), to)}>
      {children}
    </a>
  ),
}))

// #2176.48 — capture ce qui est déclaré à Laura, même patron que
// `ProjectDetailSheet.test.tsx` (#2170.29) et `CandidateCard.test.tsx`.
const askLauraProps: { question: string; label: string; accountId?: string }[] = []
vi.mock('@/components/primitives/AskLaura', () => ({
  AskLaura: (props: { question: string; label: string; accountId?: string }) => {
    askLauraProps.push({ question: props.question, label: props.label, accountId: props.accountId })
    return <span data-testid="ask-laura">{props.label}</span>
  },
}))

const { MatchCard } = await import('./MatchCard')

function result(over: Partial<MatchResult> & Pick<MatchResult, 'consultantId'>): MatchResult {
  return {
    axes: [{ axis: 'must_have', score: 90, weight: 25, detail: 'Spark prouvé', evidence: [] }],
    correspondenceScore: 84,
    pushableScore: 71,
    bucket: 'recommended',
    exclusions: [],
    skills: [],
    gaps: [],
    adjacency: [],
    questionsToValidate: [],
    flags: [],
    ...over,
  }
}

const noop = () => {}

type CardOverrides = Partial<React.ComponentProps<typeof MatchCard>>

function renderCard(over: CardOverrides = {}) {
  return render(
    <MatchCard
      result={result({ consultantId: 'c-1' })}
      name="Alice Martin"
      title="Data engineer"
      selected={false}
      onToggle={noop}
      onExplain={noop}
      onPosition={noop}
      onDismiss={noop}
      onValidateAvailability={noop}
      validatingAvailability={false}
      onPrepareCv={noop}
      onRelaunch={noop}
      {...over}
    />,
  )
}

describe('MatchCard — demander à Laura, par profil (#2176.48)', () => {
  it('déclare une question qui nomme le profil', () => {
    askLauraProps.length = 0
    renderCard({ name: 'Alice Martin' })
    expect(screen.getByTestId('ask-laura')).toBeInTheDocument()
    expect(askLauraProps[0]?.question).toContain('Alice Martin')
  })
})

describe('MatchCard — valider la disponibilité (#2176.44)', () => {
  it('déclenche le geste, sans changer la valeur déclarée', () => {
    const onValidateAvailability = vi.fn()
    renderCard({ onValidateAvailability })
    fireEvent.click(screen.getByRole('button', { name: 'Valider la disponibilité' }))
    expect(onValidateAvailability).toHaveBeenCalledTimes(1)
  })

  it('se désactive pendant la revalidation, pour éviter un double geste', () => {
    renderCard({ validatingAvailability: true })
    expect(screen.getByRole('button', { name: 'Valider la disponibilité' })).toBeDisabled()
  })
})

describe('MatchCard — préparer le CV (#2176.45, #2176.62)', () => {
  it('ouvre le studio de dossier de compétences de ce profil', () => {
    const onPrepareCv = vi.fn()
    renderCard({ onPrepareCv })
    fireEvent.click(screen.getByRole('button', { name: 'Préparer le CV' }))
    expect(onPrepareCv).toHaveBeenCalledTimes(1)
  })
})

describe('MatchCard — relancer le consultant (#2176.49)', () => {
  it('déclenche le geste, un profil à la fois', () => {
    const onRelaunch = vi.fn()
    renderCard({ onRelaunch })
    fireEvent.click(screen.getByRole('button', { name: 'Relancer le consultant' }))
    expect(onRelaunch).toHaveBeenCalledTimes(1)
  })
})

describe('MatchCard — compétence must-have extraite, jamais validée (#2328.24)', () => {
  it('affiche « à vérifier », jamais confondue avec une compétence prouvée', () => {
    renderCard({
      result: result({
        consultantId: 'c-1',
        skills: [
          {
            term: 'spark',
            label: 'Spark',
            required: true,
            status: 'unverified',
            coverage: 0,
            level: 'inconnu',
            source: 'derived',
            proof: null,
            levelUnknown: true,
          },
        ],
      }),
    })
    expect(screen.getByText('Spark — obligatoire, extrait automatiquement, à vérifier')).toBeInTheDocument()
  })
})

describe('MatchCard — source « versions ciblées » (#2176.3)', () => {
  it('montre qu’un CV est déjà préparé pour ce besoin', () => {
    renderCard({
      result: result({
        consultantId: 'c-1',
        targetedCvVersion: {
          versionId: '11111111-1111-4111-8111-111111111111',
          generatedAt: '2026-09-20T10:00:00Z',
          highlightedSkills: ['Spark'],
        },
      }),
    })
    expect(screen.getByText(/CV déjà préparé pour ce besoin/)).toBeInTheDocument()
  })

  it('n’affiche rien quand aucune version ciblée n’existe', () => {
    renderCard({ result: result({ consultantId: 'c-1', targetedCvVersion: null }) })
    expect(screen.queryByText(/CV déjà préparé pour ce besoin/)).not.toBeInTheDocument()
  })
})

describe('MatchCard — critères étayés / à confirmer (Théo C projects-rapprochement.R1/N3)', () => {
  it('dit « N critères étayés · N à confirmer » — un axe non évaluable est à confirmer, jamais un échec', () => {
    renderCard({
      result: result({
        consultantId: 'c-1',
        axes: [
          { axis: 'must_have', score: 90, weight: 25, detail: '', evidence: [] },
          { axis: 'availability', score: null, weight: 20, detail: '', evidence: [] },
        ],
      }),
    })
    expect(screen.getByTestId('match-criteria-counts')).toHaveTextContent('1 critère étayé · 1 à confirmer')
  })

  it('tout étayé → « aucun à confirmer »', () => {
    renderCard()
    expect(screen.getByTestId('match-criteria-counts')).toHaveTextContent('1 critère étayé · aucun à confirmer')
  })
})

// Décision Louis, refonte Théo C (`projects-rapprochement`) — la correspondance s'écrit EN CLAIR, jamais en points.
describe('MatchCard — correspondance en clair, jamais en points', () => {
  const skill = (term: string, status: 'matched' | 'missing') => ({
    term,
    label: term.toUpperCase(),
    required: true,
    status,
    coverage: status === 'matched' ? 1 : 0,
    level: 'inconnu',
    source: null,
    proof: status === 'matched' ? 'mission 2025' : null,
    levelUnknown: true,
  })

  it('écrit « Correspond : … · Manque : … »', () => {
    renderCard({
      result: result({
        consultantId: 'c-1',
        skills: [skill('sap', 'matched'), skill('data', 'matched'), skill('migration', 'missing')],
      }),
    })
    expect(screen.getByTestId('match-in-clear')).toHaveTextContent('Correspond : SAP, DATA · Manque : migration')
  })

  it('SAIT DIRE NON : aucun score affiché, ni 84 ni 71, ni « Correspondance »', () => {
    renderCard()
    expect(screen.queryByText('84')).toBeNull()
    expect(screen.queryByText('71')).toBeNull()
    expect(screen.queryByText('Correspondance')).toBeNull()
    // Rien de lu = aucune ligne inventée.
    expect(screen.queryByTestId('match-in-clear')).toBeNull()
  })
})
