import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReplyTransformMenu } from './ReplyTransformMenu'

const ID_A = '0b6f3d5e-1c1a-4a53-9a40-2f1f0e0c1a11'
const REPLY = [
  'Voici les comptes à traiter :',
  `1. [Alpha](/accounts/${ID_A}) — contrat en fin de cycle`,
  '2. Beta — nouveau DSI',
  'La cartographie est partielle : seuls les comptes déjà analysés sont couverts.',
].join('\n')

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: /ajuster cette réponse/i }))
}

describe('ReplyTransformMenu (#3768)', () => {
  const onTransform = vi.fn()
  beforeEach(() => vi.clearAllMocks())

  it('propose, sous UN déclencheur nommé, les gestes qui ont un sens pour cette réponse', async () => {
    render(<ReplyTransformMenu text={REPLY} onTransform={onTransform} disabled={false} />)
    await openMenu()
    expect(await screen.findByRole('menuitem', { name: 'Approfondir' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Voir plus de comptes' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Voir seulement les priorités' })).toBeInTheDocument()
    // La réponse est déjà une liste : pas de « liste exportable » à proposer.
    expect(screen.queryByRole('menuitem', { name: /liste exportable/i })).toBeNull()
  })

  it('envoie la réponse source, sa forme, ses comptes et sa réserve — pas une requête aveugle', async () => {
    render(<ReplyTransformMenu text={REPLY} onTransform={onTransform} disabled={false} />)
    await openMenu()
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Mieux justifier' }))
    expect(onTransform).toHaveBeenCalledTimes(1)
    const [request, label] = onTransform.mock.calls[0]!
    expect(label).toBe('Mieux justifier')
    expect(request).toMatchObject({
      id: 'justify',
      sourceText: REPLY,
      layout: 'list',
      accountIds: [ID_A],
      reserves: ['La cartographie est partielle : seuls les comptes déjà analysés sont couverts.'],
    })
  })

  it('propose encore les gestes de forme sur une réponse courte', () => {
    const { container } = render(<ReplyTransformMenu text="Ok." onTransform={onTransform} disabled={false} />)
    // « Ok. » : approfondir, justifier, plan et liste restent possibles — le menu existe.
    expect(container.firstChild).not.toBeNull()
  })

  it('est désactivé pendant qu’un tour est en vol', () => {
    render(<ReplyTransformMenu text={REPLY} onTransform={onTransform} disabled />)
    expect(screen.getByRole('button', { name: /ajuster cette réponse/i })).toBeDisabled()
  })
})
