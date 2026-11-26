import { dayClosureCardsToValidate } from './day-closure-cards'

// #2392.3 — section 6 « données à valider » de la clôture de journée.
describe('dayClosureCardsToValidate (#2392)', () => {
  const card = (id: string, state: string, preview: { whatWillHappen: string; targetObject: string | null } | null) =>
    ({ id, state, preview }) as never

  it('ne garde que les cartes PRÊTES à valider, libellées par leur prévisualisation', () => {
    const out = dayClosureCardsToValidate([
      card('a', 'prepared', { whatWillHappen: 'Enrichir le contact.', targetObject: 'Camille Martin' }),
      card('b', 'executed', { whatWillHappen: 'Épingler un fait.', targetObject: null }),
      card('c', 'awaiting_review', { whatWillHappen: 'Modifier le réglage.', targetObject: null }),
      card('d', 'suggested', null),
    ])
    expect(out).toEqual({
      state: 'ready',
      reason: null,
      cards: [
        { id: 'a', label: 'Enrichir le contact. — Camille Martin' },
        { id: 'c', label: 'Modifier le réglage.' },
      ],
    })
  })

  it('une lecture impossible se DIT, elle ne rend pas « rien à valider »', () => {
    const out = dayClosureCardsToValidate(null)
    expect(out.state).toBe('unavailable')
    expect(out.reason).toBeTruthy()
  })
})
