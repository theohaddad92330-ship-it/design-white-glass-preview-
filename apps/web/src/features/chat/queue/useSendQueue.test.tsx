import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { markQueuedSent, SEND_QUEUE_MAX, sendQueueStorageKey } from './send-queue'
import { useSendQueue } from './useSendQueue'

// #4066 — la file : ordre, retrait, modification, arrêt, échec qui suspend, persistance.
const setup = (initial: { busy: boolean; key?: string | null; dispatch?: (text: string) => boolean }) => {
  const dispatch = vi.fn(initial.dispatch ?? (() => true))
  const hook = renderHook(
    (props: { busy: boolean; key: string | null }) =>
      useSendQueue({ storageKey: props.key, busy: props.busy, dispatch }),
    { initialProps: { busy: initial.busy, key: initial.key === undefined ? 't1' : initial.key } },
  )
  return { ...hook, dispatch }
}

describe('useSendQueue (#4066)', () => {
  beforeEach(() => window.sessionStorage.clear())

  it('#4066.1 met en attente pendant une réponse, sans rien envoyer avant son tour', () => {
    const { result, dispatch } = setup({ busy: true })
    act(() => void result.current.enqueue('un'))
    act(() => void result.current.enqueue('deux'))
    expect(result.current.items.map(item => item.text)).toEqual(['un', 'deux'])
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('#4066.2 traite les messages dans l’ordre, un par fin de réponse', () => {
    const { result, rerender, dispatch } = setup({ busy: true })
    act(() => void result.current.enqueue('un'))
    act(() => void result.current.enqueue('deux'))
    rerender({ busy: false, key: 't1' })
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenLastCalledWith('un')
    rerender({ busy: true, key: 't1' })
    rerender({ busy: false, key: 't1' })
    expect(dispatch).toHaveBeenLastCalledWith('deux')
    expect(result.current.items).toHaveLength(0)
  })

  it('#4066.3 un message en attente se modifie ou se retire avant son tour', () => {
    const { result, rerender, dispatch } = setup({ busy: true })
    act(() => void result.current.enqueue('un'))
    act(() => void result.current.enqueue('deux'))
    const [first, second] = result.current.items
    act(() => result.current.edit(first!.id, 'un corrigé'))
    act(() => result.current.remove(second!.id))
    rerender({ busy: false, key: 't1' })
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith('un corrigé')
  })

  it('#4066.3 un texte vidé à la modification retire le message', () => {
    const { result } = setup({ busy: true })
    act(() => void result.current.enqueue('un'))
    act(() => result.current.edit(result.current.items[0]!.id, '   '))
    expect(result.current.items).toHaveLength(0)
  })

  it('#4066.4 un arrêt (busy retombe sans suspension) ne vide pas la file : elle continue', () => {
    const { result, rerender, dispatch } = setup({ busy: true })
    act(() => void result.current.enqueue('un'))
    rerender({ busy: false, key: 't1' })
    expect(dispatch).toHaveBeenCalledWith('un')
    expect(result.current.items).toHaveLength(0)
  })

  it('#4066.4 un échec suspend la file : rien ne part, l’échec est nommé, « Reprendre » relance', () => {
    const { result, rerender, dispatch } = setup({ busy: true })
    act(() => void result.current.enqueue('un'))
    act(() => result.current.suspend('Connexion perdue'))
    rerender({ busy: false, key: 't1' })
    expect(dispatch).not.toHaveBeenCalled()
    expect(result.current.suspension).toEqual({ kind: 'failure', reason: 'Connexion perdue' })
    expect(result.current.items).toHaveLength(1)
    act(() => result.current.resume())
    expect(dispatch).toHaveBeenCalledWith('un')
  })

  it('#4066.4 un échec sans message en attente ne suspend rien', () => {
    const { result } = setup({ busy: true })
    act(() => result.current.suspend('Panne'))
    expect(result.current.suspension).toBeNull()
  })

  it('#4066.1 la file est plafonnée à 5 messages', () => {
    const { result } = setup({ busy: true })
    for (let index = 0; index < SEND_QUEUE_MAX; index += 1) {
      act(() => void result.current.enqueue(`m${index}`))
    }
    let accepted = true
    act(() => {
      accepted = result.current.enqueue('de trop')
    })
    expect(accepted).toBe(false)
    expect(result.current.items).toHaveLength(SEND_QUEUE_MAX)
    expect(result.current.isFull).toBe(true)
  })

  it('#4066.1 un envoi refusé (hors-ligne) remet le message en tête et suspend, jamais perdu', () => {
    const { result, rerender } = setup({ busy: true, dispatch: () => false })
    act(() => void result.current.enqueue('un'))
    rerender({ busy: false, key: 't1' })
    expect(result.current.items.map(item => item.text)).toEqual(['un'])
    expect(result.current.suspension?.kind).toBe('refused')
  })

  it('#4066.5 la file survit à un rechargement, mais attend un geste avant de repartir', () => {
    const first = setup({ busy: true })
    act(() => void first.result.current.enqueue('un'))
    expect(JSON.parse(window.sessionStorage.getItem(sendQueueStorageKey('t1'))!)).toHaveLength(1)
    first.unmount()
    const reloaded = setup({ busy: false })
    expect(reloaded.result.current.items.map(item => item.text)).toEqual(['un'])
    expect(reloaded.result.current.suspension).toEqual({ kind: 'restored' })
    expect(reloaded.dispatch).not.toHaveBeenCalled()
    act(() => reloaded.result.current.resume())
    expect(reloaded.dispatch).toHaveBeenCalledWith('un')
  })

  it('#4066.5 chaque fil a sa file ; changer de fil ne mélange rien', () => {
    const { result, rerender } = setup({ busy: true })
    act(() => void result.current.enqueue('fil un'))
    rerender({ busy: true, key: 't2' })
    expect(result.current.items).toHaveLength(0)
    act(() => void result.current.enqueue('fil deux'))
    rerender({ busy: true, key: 't1' })
    expect(result.current.items.map(item => item.text)).toEqual(['fil un'])
  })

  it('#4066.5 un contenu persisté illisible vaut file vide', () => {
    window.sessionStorage.setItem(sendQueueStorageKey('t1'), '{pas du json')
    const { result } = setup({ busy: false })
    expect(result.current.items).toHaveLength(0)
  })

  it('#4066.6 la clé « nouvelle conversation » migre vers l’id du fil : les messages 2 et 3 partent, rien ne reste sous :new', () => {
    const { result, rerender, dispatch } = setup({ busy: false, key: 'chat:u1:new' })
    // Le message 1 part (hors file), la réponse tourne, deux autres attendent.
    rerender({ busy: true, key: 'chat:u1:new' })
    act(() => void result.current.enqueue('deux'))
    act(() => void result.current.enqueue('trois'))
    expect(window.sessionStorage.getItem(sendQueueStorageKey('chat:u1:new'))).not.toBeNull()
    // La conversation reçoit son id : la clé change.
    rerender({ busy: true, key: 'chat:u1:conv-9' })
    expect(result.current.items.map(item => item.text)).toEqual(['deux', 'trois'])
    expect(window.sessionStorage.getItem(sendQueueStorageKey('chat:u1:new'))).toBeNull()
    expect(window.sessionStorage.getItem(sendQueueStorageKey('chat:u1:conv-9'))).not.toBeNull()
    rerender({ busy: false, key: 'chat:u1:conv-9' })
    expect(dispatch).toHaveBeenLastCalledWith('deux')
    rerender({ busy: true, key: 'chat:u1:conv-9' })
    rerender({ busy: false, key: 'chat:u1:conv-9' })
    expect(dispatch).toHaveBeenLastCalledWith('trois')
    expect(result.current.items).toHaveLength(0)
    expect(window.sessionStorage.getItem(sendQueueStorageKey('chat:u1:conv-9'))).toBeNull()
  })

  it('#4066.6 sans réponse en cours, aller d’un brouillon vers un autre fil ne transporte pas la file', () => {
    const { result, rerender } = setup({ busy: false, key: 'chat:u1:new' })
    act(() => void result.current.enqueue('un'))
    rerender({ busy: false, key: 'chat:u1:conv-2' })
    expect(result.current.items).toHaveLength(0)
  })

  it('#4066.2 si `busy` ne bouge jamais après un envoi, le verrou se lève et le message suivant part', () => {
    vi.useFakeTimers()
    try {
      const { result, rerender, dispatch } = setup({ busy: true })
      act(() => void result.current.enqueue('un'))
      act(() => void result.current.enqueue('deux'))
      rerender({ busy: false, key: 't1' })
      expect(dispatch).toHaveBeenCalledTimes(1)
      act(() => void vi.advanceTimersByTime(2000))
      expect(dispatch).toHaveBeenLastCalledWith('deux')
    } finally {
      vi.useRealTimers()
    }
  })

  // #4097 (recette prod 13/10) — le bandeau « File retrouvée… Reprendre » re-proposait un message DÉJÀ
  // traité : un rechargement pendant l'envoi relisait la file persistée avant que son retrait soit écrit.
  it('#4097 un message sort de la file persistée AU MOMENT où il part, avant même l’envoi', () => {
    const snapshots: (string | null)[] = []
    const { result, rerender } = setup({
      busy: true,
      dispatch: () => {
        snapshots.push(window.sessionStorage.getItem(sendQueueStorageKey('t1')))
        return true
      },
    })
    act(() => void result.current.enqueue('traité'))
    act(() => void result.current.enqueue('encore là'))
    rerender({ busy: false, key: 't1' })
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]).not.toContain('traité')
    expect(snapshots[0]).toContain('encore là')
  })

  it('#4097 un message déjà parti, resté dans le stockage, n’est jamais restauré', () => {
    const key = sendQueueStorageKey('t1')
    window.sessionStorage.setItem(
      key,
      JSON.stringify([
        { id: 'sent-1', text: 'déjà traité' },
        { id: 'new-1', text: 'jamais envoyé' },
      ]),
    )
    markQueuedSent(key, 'sent-1')
    const { result } = setup({ busy: false })
    expect(result.current.items.map(item => item.text)).toEqual(['jamais envoyé'])
  })

  it('#4097 un envoi refusé remet le message dans la file persistée et le rend restaurable', () => {
    const { result, rerender } = setup({ busy: true, dispatch: () => false })
    act(() => void result.current.enqueue('refusé'))
    rerender({ busy: false, key: 't1' })
    expect(window.sessionStorage.getItem(sendQueueStorageKey('t1'))).toContain('refusé')
    const reloaded = setup({ busy: false })
    expect(reloaded.result.current.items.map(item => item.text)).toEqual(['refusé'])
  })
})
