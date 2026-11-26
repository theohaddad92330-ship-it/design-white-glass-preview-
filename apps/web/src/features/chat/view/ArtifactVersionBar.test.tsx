import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReplyBlock } from '@bellum/contracts'
import { ArtifactVersionBar } from './ArtifactVersionBar'
import { StructuredReply } from './StructuredReply'

const edit = vi.fn()
vi.mock('../api/chatArtifactApi', () => ({ chatArtifactApi: { edit: (...args: unknown[]) => edit(...args) } }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const PLAN = {
  type: 'action_plan',
  title: 'Cette semaine',
  steps: [
    { label: 'Appeler BlaBlaCar', detail: 'Demander le besoin data', when: 'Lundi' },
    { label: 'Préparer Thales' },
  ],
} as ReplyBlock
const VERDICT = { type: 'verdict' } as unknown as ReplyBlock

/**
 * #2429.9 (épopée #2852, lot P07) — la version d'un artefact et le geste pour la
 * modifier : rien sur une version d'origine non modifiable, « Version N » quand
 * il a été modifié, et une nouvelle version (jamais une réécriture) à l'envoi.
 */
describe('ArtifactVersionBar (#2429.9)', () => {
  beforeEach(() => edit.mockReset())

  it('ne montre RIEN sous une mesure en version 1 (un verdict ne se modifie pas)', () => {
    const { container } = render(<ArtifactVersionBar artifactId="m:0" block={VERDICT} version={1} onSaved={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('nomme la version quand l’artefact a été modifié', () => {
    render(<ArtifactVersionBar artifactId="m:0" block={PLAN} version={2} onSaved={vi.fn()} />)
    expect(screen.getByText('Version 2 — modifiée')).toBeInTheDocument()
  })

  it('n’affiche aucune étiquette de version sur la version d’origine, mais offre « Modifier le plan »', () => {
    render(<ArtifactVersionBar artifactId="m:0" block={PLAN} version={1} onSaved={vi.fn()} />)
    expect(screen.queryByText(/Version/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Modifier le plan' })).toBeInTheDocument()
  })

  it('enregistre une NOUVELLE version ; une étape gardée garde son détail, une neuve n’a que son libellé', async () => {
    edit.mockResolvedValueOnce({ artifactId: 'm:0', version: 2, block: PLAN })
    const onSaved = vi.fn()
    render(<ArtifactVersionBar artifactId="m:0" block={PLAN} version={1} onSaved={onSaved} />)
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le plan' }))
    fireEvent.change(screen.getByLabelText('Une étape par ligne'), {
      target: { value: 'Appeler BlaBlaCar\nRelancer Société générale\n\n' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer une nouvelle version' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ version: 2, block: PLAN }))
    expect(edit).toHaveBeenCalledWith('m:0', {
      ...(PLAN as object),
      steps: [
        { label: 'Appeler BlaBlaCar', detail: 'Demander le besoin data', when: 'Lundi' },
        { label: 'Relancer Société générale' },
      ],
    })
  })

  it('un envoi refusé le DIT et ne change rien à l’écran', async () => {
    edit.mockRejectedValueOnce(new Error('403'))
    const onSaved = vi.fn()
    render(<ArtifactVersionBar artifactId="m:0" block={PLAN} version={1} onSaved={onSaved} />)
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le plan' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer une nouvelle version' }))
    await waitFor(() => expect(edit).toHaveBeenCalled())
    expect(onSaved).not.toHaveBeenCalled()
  })
})

describe('StructuredReply — la version la plus récente remplace le bloc du texte (#2429.9)', () => {
  const text = 'Voici.\n\n```bellum-block\n' + JSON.stringify(PLAN) + '\n```'
  const edited = { ...(PLAN as object), title: 'Plan révisé' } as ReplyBlock

  it('montre la version 2 et son étiquette quand le serveur en sert une', () => {
    render(<StructuredReply text={text} messageId="m" artifactVersions={{ 'm:0': { version: 2, block: edited } }} />)
    expect(screen.getByText('Plan révisé')).toBeInTheDocument()
    expect(screen.getByText('Version 2 — modifiée')).toBeInTheDocument()
  })

  it('sans version servie, le texte du message reste la version 1', () => {
    render(<StructuredReply text={text} messageId="m" />)
    expect(screen.getByText('Cette semaine')).toBeInTheDocument()
    expect(screen.queryByText(/Version/)).not.toBeInTheDocument()
  })
})
