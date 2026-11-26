import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { defaultGroundingIds, groundingFacts, type GroundingChoice } from './approach-grounding'
import { ApproachGroundingBlock } from './ApproachGrounding'

const FACTS = groundingFacts({
  rawAnalysis: {
    recent_signals: [
      { signal: 'Cession de la filiale Uptevia', date: '2026-10-01', source: 'Les Echos' },
      { signal: 'Recrutement de 12 ingénieurs data' },
      { signal: 'Nouveau directeur des achats' },
    ],
  },
  contact: {
    signals: [{ label: 'Prise de parole au salon Data Paris' }],
    key_points: ['Veut fiabiliser ses pipelines'],
  },
})

// La case de la bibliothèque est un bouton `role=checkbox` : son état est `aria-checked`.
const isChecked = (box: HTMLElement) => box.getAttribute('aria-checked') === 'true'

function renderBlock(choice: GroundingChoice | null, onChoice = vi.fn(), facts = FACTS) {
  render(<ApproachGroundingBlock facts={facts} choice={choice} onChoice={onChoice} />)
  return onChoice
}

describe('#4524.1 — « Sur quoi Laura s’appuie »', () => {
  it('liste les signaux du compte et ceux du contact, cochables, les deux premiers cochés par défaut', () => {
    renderBlock(null)
    const account = screen.getByRole('group', { name: 'Signaux du compte' })
    const boxes = within(account).getAllByRole('checkbox')
    expect(boxes).toHaveLength(3)
    expect(boxes.map(box => isChecked(box))).toEqual([true, true, false])
    const contact = screen.getByRole('group', { name: 'Signaux et besoins du contact' })
    expect(within(contact).getAllByRole('checkbox')).toHaveLength(2)
    expect(screen.getByText('Les Echos · 2026-10-01')).toBeTruthy()
  })

  it('cocher un fait envoie le choix complet, dans l’ordre d’affichage', async () => {
    const onChoice = renderBlock(null)
    await userEvent.click(screen.getByRole('checkbox', { name: /Nouveau directeur des achats/ }))
    const ids = [...defaultGroundingIds(FACTS), FACTS.account[2]!.id]
    expect(onChoice).toHaveBeenCalledWith({ mode: 'facts', ids })
  })

  it('« Angle libre » décoche tout ; cocher un fait quitte l’angle libre', async () => {
    const onChoice = renderBlock({ mode: 'facts', ids: defaultGroundingIds(FACTS) })
    await userEvent.click(screen.getByRole('checkbox', { name: /^Angle libre/ }))
    expect(onChoice).toHaveBeenCalledWith({ mode: 'free_angle' })
  })

  it('en angle libre, aucun fait n’est coché et « Angle libre » l’est', async () => {
    const onChoice = renderBlock({ mode: 'free_angle' })
    expect(isChecked(screen.getByRole('checkbox', { name: /^Angle libre/ }))).toBe(true)
    expect(screen.getAllByRole('checkbox').filter(box => isChecked(box))).toHaveLength(1)
    await userEvent.click(screen.getByRole('checkbox', { name: /Cession de la filiale Uptevia/ }))
    expect(onChoice).toHaveBeenCalledWith({ mode: 'facts', ids: [FACTS.account[0]!.id] })
  })

  it('#4524.5 — aucun signal : une ligne le dit, aucune liste, « Angle libre » seul', () => {
    renderBlock(null, vi.fn(), { account: [], contact: [] })
    expect(screen.getByText(/Aucun signal connu sur ce compte ni sur ce contact/)).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Signaux du compte' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Signaux et besoins du contact' })).toBeNull()
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
    expect(isChecked(screen.getByRole('checkbox', { name: /^Angle libre/ }))).toBe(true)
  })

  it('une absence ne fait aucune ligne : sans signal du contact, pas de groupe contact', () => {
    renderBlock(null, vi.fn(), { account: FACTS.account, contact: [] })
    expect(screen.queryByRole('group', { name: 'Signaux et besoins du contact' })).toBeNull()
  })
})

// #4524.9 — la liste cochable propose le signal d'homonyme : un fait du contact peut concerner quelqu'un d'autre.
describe('#4524.9 — le doute d’homonyme est dit sous le fait concerné', () => {
  const doubtful = groundingFacts({
    rawAnalysis: { recent_signals: [{ signal: 'Cession de la filiale Uptevia' }] },
    contact: {
      signals: [{ label: 'Prise de parole au salon Data Paris' }],
      key_points: ['Veut fiabiliser ses pipelines'],
    },
    homonymDoubt: true,
  })

  it('chaque fait du contact porte « peut concerner un homonyme » ; le fait du compte, non', () => {
    renderBlock(null, vi.fn(), doubtful)
    const contact = screen.getByRole('group', { name: 'Signaux et besoins du contact' })
    expect(within(contact).getAllByText(/Peut concerner un homonyme/)).toHaveLength(2)
    const account = screen.getByRole('group', { name: 'Signaux du compte' })
    expect(within(account).queryByText(/homonyme/)).toBeNull()
  })

  it('sans doute, aucune mention d’homonyme n’apparaît', () => {
    renderBlock(null)
    expect(screen.queryByText(/homonyme/)).toBeNull()
  })

  it('le fait douteux n’est pas coché d’emblée', () => {
    renderBlock(null, vi.fn(), doubtful)
    expect(isChecked(screen.getByRole('checkbox', { name: /Prise de parole au salon Data Paris/ }))).toBe(false)
    expect(isChecked(screen.getByRole('checkbox', { name: /Cession de la filiale Uptevia/ }))).toBe(true)
  })
})
