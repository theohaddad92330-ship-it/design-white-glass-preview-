import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { ComposerDock } from './ComposerDock'

vi.mock('./ApprovedTemplatePicker', () => ({ ApprovedTemplatePicker: () => null }))
vi.mock('./ComposerParameters', () => ({ ComposerParameters: () => null }))
vi.mock('./MessageBriefSummary', () => ({ MessageBriefSummary: () => null }))

const base = {
  channel: 'phone' as const,
  channels: ['phone' as const],
  contactId: 'c1',
  context: '',
  hasObjections: false,
  objections: [],
  showObjections: false,
  onChannelChange: vi.fn(),
  onContextChange: vi.fn(),
  onGenerate: vi.fn(),
  parameters: {},
  onParametersChange: vi.fn(),
  onToggleObjections: vi.fn(),
  styleOptions: [],
  styleTemplateId: null,
  onStyleTemplateIdChange: vi.fn(),
  onUseApprovedTemplate: vi.fn(),
}

// #3637 (R2 07/10) — « Préparer mon appel » promet les objections : sans dossier qui en porte, l'absence se NOMME.
describe('ComposerDock — objections d’un appel préparé (#3637)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('appel préparé sans objection au dossier → l’absence est nommée', () => {
    render(<ComposerDock {...base} objectionsGap />)
    expect(screen.getByText(/Objections à anticiper : aucune relevée/)).toBeInTheDocument()
  })

  it('SAIT DIRE NON — hors préparation d’appel, aucune mention', () => {
    render(<ComposerDock {...base} />)
    expect(screen.queryByText(/Objections à anticiper/)).not.toBeInTheDocument()
  })

  it('des objections au dossier → le bouton les liste, pas la mention d’absence', () => {
    render(
      <ComposerDock
        {...base}
        hasObjections
        objections={[{ objection: 'Déjà un prestataire', response: 'Compléter' }]}
        objectionsGap={false}
      />,
    )
    expect(screen.queryByText(/aucune relevée/)).not.toBeInTheDocument()
  })
})
