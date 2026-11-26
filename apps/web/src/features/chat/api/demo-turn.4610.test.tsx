import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { splitReplyBlocks, type ReplyBlock } from '@bellum/contracts'
import { DEMO_CHAT_PROMPTS } from '@/features/demo/demo-chat-script'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { StructuredReply } from '../view/StructuredReply'
import { demoTurn } from './demo-turn'

// #4610.5 (craft rule n°9) — en démonstration, la carte Contacts de Laura porte des noms CLIQUABLES vers les fiches
// fictives de la salle. Les identifiants viennent des contacts RÉELLEMENT chargés par l'écran (comme `accountHref`),
// jamais d'un UUID écrit dans le script.
const SNCF = '11111111-1111-4111-8111-111111111111'
const CASTEX = 'c1111111-1111-4111-8111-111111111111'
const TREVISANI = 'c2222222-2222-4222-8222-222222222222'
const accounts = new Map([['SNCF', SNCF]])
const contacts = new Map([
  ['Jean Castex', CASTEX],
  ['Laurent Trévisani', TREVISANI],
])

const prompt = DEMO_CHAT_PROMPTS.find(entry => entry.id === 'p-contacts-card')

function contactCard(reply: string) {
  const block = splitReplyBlocks(reply).find(
    (segment): segment is Extract<ReturnType<typeof splitReplyBlocks>[number], { kind: 'block' }> =>
      segment.kind === 'block' && segment.block.type === 'contact_list',
  )
  return (block?.block ?? null) as Extract<ReplyBlock, { type: 'contact_list' }> | null
}

describe('#4610.5 — la carte Contacts de la salle de démonstration', () => {
  it('LIT : la salle porte bien une réponse à carte contact_list', () => {
    expect(prompt, 'p-contacts-card doit exister dans la salle').toBeDefined()
    expect(contactCard(prompt!.answer)?.items.length).toBeGreaterThanOrEqual(2)
  })

  it('avec les tables de la salle, chaque contact mène à /contacts/:id et son compte à /accounts/:id', () => {
    const turn = demoTurn(prompt!.question, 'hors script', accounts, null, contacts)
    const card = contactCard(turn.reply)!
    const byName = Object.fromEntries(card.items.map(item => [item.name, item]))
    expect(byName['Jean Castex']?.href).toBe(`/contacts/${CASTEX}`)
    expect(byName['Laurent Trévisani']?.href).toBe(`/contacts/${TREVISANI}`)
    for (const item of card.items) expect(item.company_href).toBe(`/accounts/${SNCF}`)
    expect(turn.reply).not.toContain('{{')
  })

  it('SAIT DIRE NON : un contact absent de la table reste du texte — jamais un jeton, jamais un lien mort', () => {
    const partial = new Map([['Jean Castex', CASTEX]])
    const card = contactCard(demoTurn(prompt!.question, 'hors script', accounts, null, partial).reply)!
    const trevisani = card.items.find(item => item.name === 'Laurent Trévisani')!
    expect(trevisani.href).toBeUndefined()
    expect(card.items.find(item => item.name === 'Jean Castex')!.href).toBe(`/contacts/${CASTEX}`)
  })

  it('sans aucune table (hors écran réel), aucun jeton ne fuit et aucun lien n’est posé', () => {
    const turn = demoTurn(prompt!.question, 'hors script')
    const card = contactCard(turn.reply)!
    expect(turn.reply).not.toContain('{{')
    for (const item of card.items) {
      expect(item.href).toBeUndefined()
      expect(item.company_href).toBeUndefined()
    }
  })

  it('rendue par le vrai moteur : les noms sont des liens', async () => {
    const turn = demoTurn(prompt!.question, 'hors script', accounts, null, contacts)
    renderWithRouter(<StructuredReply text={turn.reply} />)
    const group = await screen.findByRole('group', { name: /Contacts nommés/ })
    expect(within(group).getByRole('link', { name: 'Jean Castex' })).toHaveAttribute('href', `/contacts/${CASTEX}`)
    expect(within(group).getAllByRole('link', { name: 'SNCF' })[0]).toHaveAttribute('href', `/accounts/${SNCF}`)
  })
})
