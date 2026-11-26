import { describe, expect, it } from 'vitest'
import type { AdminModelRoutingEntry } from '@/lib/admin'
import {
  destinationKeyFor,
  libelleEvaluations,
  libelleModele,
  libelleSource,
  nombreAEvaluer,
} from './model-routing-panel.logic'

function entry(overrides: Partial<AdminModelRoutingEntry> = {}): AdminModelRoutingEntry {
  return {
    task: 'strategy',
    provider: 'anthropic',
    model: null,
    overridden: false,
    inheritsFrom: null,
    evalStatus: 'reference',
    evalReplayCommand: null,
    ...overrides,
  }
}

describe('libelleSource', () => {
  it('« par défaut » quand rien n’est posé', () => {
    expect(libelleSource(entry())).toBe('par défaut')
  })

  it('« réglé » quand un réglage propre est posé', () => {
    expect(libelleSource(entry({ overridden: true }))).toBe('réglé')
  })

  it('« hérite de <tâche> » quand la destination vient d’une autre tâche, JAMAIS « réglé » en plus', () => {
    expect(libelleSource(entry({ overridden: true, inheritsFrom: 'classify' }))).toBe('hérite de classify')
  })
})

describe('libelleModele', () => {
  it('rend le nom du modèle quand il est posé', () => {
    expect(libelleModele('gpt-4o')).toBe('gpt-4o')
  })

  it('un modèle `null` (hérite du modèle de l’appelant) est un mot, jamais une cellule vide', () => {
    expect(libelleModele(null)).toBe('hérité de l’appel')
  })
})

describe('libelleEvaluations (#2440.82)', () => {
  it('une destination jamais évaluée se dit « à évaluer », jamais « ok »', () => {
    expect(libelleEvaluations(entry({ provider: 'openai', evalStatus: 'to_evaluate' }))).toBe('à évaluer')
  })

  it('référence et évaluée sont deux mots distincts', () => {
    expect(libelleEvaluations(entry())).toBe('référence')
    expect(libelleEvaluations(entry({ evalStatus: 'evaluated' }))).toBe('évaluée')
  })

  it('nombreAEvaluer ne compte que les « à évaluer »', () => {
    const routes = [entry(), entry({ evalStatus: 'evaluated' }), entry({ evalStatus: 'to_evaluate' })]
    expect(nombreAEvaluer(routes)).toBe(1)
    expect(nombreAEvaluer([entry()])).toBe(0)
  })
})

describe('destinationKeyFor (#2975 / #2440.82)', () => {
  it('fournisseur:modèle quand un modèle est posé — même format que l’IA', () => {
    expect(destinationKeyFor(entry({ provider: 'openai', model: 'gpt-4o' }))).toBe('openai:gpt-4o')
  })

  it('fournisseur seul quand aucun modèle n’est posé', () => {
    expect(destinationKeyFor(entry({ provider: 'openai', model: null }))).toBe('openai')
  })
})
