import type { AutomationSwitchPreviewView } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const previewQuery = vi.fn()
vi.mock('../api', () => ({
  useAutomationSwitchPreview: (id: string, enabled: boolean) => previewQuery(id, enabled),
}))

const { AutomationSwitchPreview } = await import('./AutomationSwitchPreview')

const phrase = {
  name: 'Une fin de mission approche',
  signal: 'mission_end' as const,
  action_kind: 'prepare_action' as const,
  playbook_key: null,
  prepared_action: 'call_to_make' as const,
  inactive_days: null,
  credit_cap: null,
}

const preview = (over: Partial<AutomationSwitchPreviewView> = {}): AutomationSwitchPreviewView => ({
  rule_id: 'r1',
  from_version: 1,
  to_version: 2,
  current: phrase,
  next: { ...phrase, name: 'Fin de mission (e-mail)', prepared_action: 'email_to_review' },
  differences: [
    { field: 'name', before: 'Une fin de mission approche', after: 'Fin de mission (e-mail)' },
    { field: 'prepared_action', before: 'call_to_make', after: 'email_to_review' },
  ],
  migration: { engaged_firings: 4, signal_changes: false },
  impact: { measured: true, situations_read: 2, would_act: 2 },
  ...over,
})

const loaded = (data: AutomationSwitchPreviewView) =>
  previewQuery.mockReturnValue({ data, isLoading: false, isError: false })

beforeEach(() => {
  previewQuery.mockReset()
})

describe('AutomationSwitchPreview — #2399.7, ce que la bascule montre AVANT', () => {
  it('nomme l’ancienne et la nouvelle version par leur numéro', () => {
    loaded(preview({ from_version: 3, to_version: 4 }))
    render(<AutomationSwitchPreview ruleId="r1" />)
    expect(screen.getByText('Version 3 · celle qui tourne')).toBeInTheDocument()
    expect(screen.getByText('Version 4 · la suivante')).toBeInTheDocument()
  })

  it('montre les différences champ par champ, et SEULEMENT ce qui change', () => {
    loaded(preview())
    render(<AutomationSwitchPreview ruleId="r1" />)
    expect(screen.getByText('Nom')).toBeInTheDocument()
    expect(screen.getByText('Action préparée')).toBeInTheDocument()
    expect(screen.getByText('Un appel à passer → Un e-mail à relire')).toBeInTheDocument()
    expect(screen.queryByText('Signal')).not.toBeInTheDocument()
    expect(screen.queryByText('Plafond de crédits (30 jours)')).not.toBeInTheDocument()
  })

  // #2843.19/.21 — Louis 31/10/2026 (c132, crédits implicites) : le plafond d'usage est BACK-OFFICE seul.
  it('ne montre jamais le plafond d’usage au client, même quand il change', () => {
    loaded(preview({ differences: [{ field: 'credit_cap', before: null, after: 40 }] }))
    render(<AutomationSwitchPreview ruleId="r1" />)
    expect(screen.queryByText(/Plafond d’usage/)).not.toBeInTheDocument()
    expect(screen.queryByText(/credit_cap/)).not.toBeInTheDocument()
    expect(screen.getByText('Aucun réglage ne change entre les deux versions.')).toBeInTheDocument()
  })

  it('dit explicitement quand rien ne change', () => {
    loaded(preview({ differences: [] }))
    render(<AutomationSwitchPreview ruleId="r1" />)
    expect(screen.getByText('Aucun réglage ne change entre les deux versions.')).toBeInTheDocument()
  })

  it('dit la migration : les déclenchements déjà consignés restent tels quels', () => {
    loaded(preview())
    render(<AutomationSwitchPreview ruleId="r1" />)
    expect(screen.getByText(/4 déclenchements déjà consignés restent tels quels/)).toBeInTheDocument()
  })

  it('un changement de signal est dit dans la migration', () => {
    loaded(preview({ migration: { engaged_firings: 1, signal_changes: true } }))
    render(<AutomationSwitchPreview ruleId="r1" />)
    expect(screen.getByText(/écoute un autre signal/)).toBeInTheDocument()
  })

  it('l’impact mesuré dit ce que la nouvelle version ferait', () => {
    loaded(preview())
    render(<AutomationSwitchPreview ruleId="r1" />)
    expect(screen.getByText(/agirait ce matin sur 2 situations sur 2 lues/)).toBeInTheDocument()
  })

  it('NON : un impact non mesurable se DIT, il n’affiche jamais « 0 » (GA-18 / GA-19)', () => {
    loaded(preview({ impact: { measured: false, reason: 'source illisible' } }))
    render(<AutomationSwitchPreview ruleId="r1" />)
    expect(screen.getByText(/Impact non mesuré/)).toBeInTheDocument()
    expect(screen.getByText(/Tu peux basculer quand même/)).toBeInTheDocument()
    expect(screen.queryByText(/situations? sur/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\b0\b/)).not.toBeInTheDocument()
  })

  it('une comparaison qui échoue le DIT (on ne bascule pas sans l’avoir vue)', () => {
    previewQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    render(<AutomationSwitchPreview ruleId="r1" />)
    expect(screen.getByRole('alert')).toHaveTextContent('La comparaison n’a pas pu être chargée')
  })
})
