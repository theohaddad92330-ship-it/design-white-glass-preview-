import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { StructuredReply } from '../StructuredReply'

const apiFetch = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', async importOriginal => ({ ...(await importOriginal<object>()), apiFetch }))
vi.mock('sonner', async importOriginal => ({
  ...(await importOriginal<object>()),
  toast: { success: vi.fn(), error: vi.fn() },
}))

const fence = (block: unknown) => ['```bellum-block', JSON.stringify(block), '```'].join('\n')
const TALENT = '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d'
const TITLE = 'Comptes où placer Camille Fournier'

const placement = {
  type: 'account_ranking',
  title: TITLE,
  axes: ['Compétences de la fiche demandées sur la zone', "Offres publiées par l'entreprise sur la zone"],
  talent_context: { talent_id: TALENT, skills: ['Java', 'Kafka'], zone: 'Rhône' },
  items: [
    {
      name: 'JEMS',
      why: ['JEMS publie 6 offres citant Java.'],
      offers: [{ title: 'Dev Java Kafka', date: '2026-10-20' }],
    },
    { name: 'Alten', why: ['Alten publie 2 offres.'] },
  ],
}

const batchCall = () => apiFetch.mock.calls.find(([arg]) => arg.path === '/analysis-batches')

async function openFraming(block: unknown = placement) {
  const user = userEvent.setup()
  renderWithRouter(<StructuredReply text={fence(block)} />)
  const card = await screen.findByRole('group', { name: TITLE })
  await user.click(within(card).getByRole('checkbox', { name: 'Sélectionner JEMS' }))
  await user.click(await within(card).findByRole('button', { name: 'Analyser la sélection' }))
  return { user, card }
}

// #4642 — « Analyser la sélection » depuis une carte « placer un talent » ouvre un cadrage prérempli,
// VISIBLE et MODIFIABLE : le lancement n'est jamais muet, et le cadrage priorise sans rien écarter.
describe('#4642 — cadrage de l’analyse lancée depuis la carte « placer un talent »', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockImplementation(async ({ path }: { path: string }) =>
      path.startsWith('/analysis/launch-plan') ? { scenario: 'fresh', credits: 8 } : { id: 'batch-1' },
    )
  })

  it('le clic ouvre le cadrage prérempli et NE lance RIEN tant qu’on n’a pas confirmé', async () => {
    const { card } = await openFraming()
    const framing = within(card).getByRole('group', { name: "Cadrage de l'analyse" })
    expect(within(framing).getByText('Java')).toBeInTheDocument()
    expect(within(framing).getByText('Kafka')).toBeInTheDocument()
    expect(within(framing).getByText('Rhône')).toBeInTheDocument()
    expect(within(framing).getByText(/rien n.est écarté/i)).toBeInTheDocument()
    expect(batchCall()).toBeUndefined()
  })

  it('confirmer envoie la fiche, les compétences, la zone et les offres du compte coché', async () => {
    const { user, card } = await openFraming()
    await user.click(within(card).getByRole('button', { name: "Lancer l'analyse" }))
    expect(batchCall()?.[0].body).toEqual({
      source: 'laura',
      items: [
        {
          name: 'JEMS',
          suggestion_id: 'laura:JEMS',
          suggestion_criteria: {
            framed_by: 'laura',
            talent_id: TALENT,
            skills: ['Java', 'Kafka'],
            zone: 'Rhône',
            offers: [{ title: 'Dev Java Kafka', date: '2026-10-20' }],
          },
        },
      ],
    })
  })

  it('une compétence se retire, une autre s’ajoute, la zone et les offres se retirent', async () => {
    const { user, card } = await openFraming()
    await user.click(within(card).getByRole('button', { name: 'Retirer Kafka' }))
    await user.type(within(card).getByRole('textbox', { name: 'Ajouter une compétence' }), 'Spring{Enter}')
    await user.click(within(card).getByRole('button', { name: 'Retirer la zone Rhône' }))
    await user.click(within(card).getByRole('checkbox', { name: /offre relevée/ }))
    await user.click(within(card).getByRole('button', { name: "Lancer l'analyse" }))
    expect(batchCall()?.[0].body.items[0].suggestion_criteria).toEqual({
      framed_by: 'laura',
      talent_id: TALENT,
      skills: ['Java', 'Spring'],
    })
  })

  it('dit NON : tout retirer lance l’analyse comme avant (le nom seul), sans cadrage ni fiche', async () => {
    const { user, card } = await openFraming()
    await user.click(within(card).getByRole('button', { name: 'Retirer Java' }))
    await user.click(within(card).getByRole('button', { name: 'Retirer Kafka' }))
    await user.click(within(card).getByRole('button', { name: 'Retirer la zone Rhône' }))
    await user.click(within(card).getByRole('checkbox', { name: /offre relevée/ }))
    await user.click(within(card).getByRole('button', { name: "Lancer l'analyse" }))
    expect(batchCall()?.[0].body).toEqual({ source: 'laura', items: [{ name: 'JEMS' }] })
  })

  it('dit NON : annuler ne lance rien', async () => {
    const { user, card } = await openFraming()
    await user.click(within(card).getByRole('button', { name: 'Annuler' }))
    expect(batchCall()).toBeUndefined()
    expect(within(card).queryByRole('group', { name: "Cadrage de l'analyse" })).not.toBeInTheDocument()
  })

  it('dit NON : une carte SANS contexte de demande lance directement, sans cadrage (inchangé)', async () => {
    const { talent_context: _unused, ...plain } = placement
    const { card } = await openFraming(plain)
    expect(within(card).queryByRole('group', { name: "Cadrage de l'analyse" })).not.toBeInTheDocument()
    expect(batchCall()?.[0].body).toEqual({ source: 'laura', items: [{ name: 'JEMS' }] })
  })
})
