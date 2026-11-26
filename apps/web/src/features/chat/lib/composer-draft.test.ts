import { act, renderHook } from '@testing-library/react'
import { useLayoutEffect, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  chatDraftKey,
  clearAllChatDrafts,
  clearChatDraft,
  clearChatDraftAfterSend,
  readChatDraft,
  useChatComposerDraft,
  writeChatDraft,
} from './composer-draft'

/**
 * #1953.15-.18 — le brouillon de la saisie de Laura, en stockage navigateur.
 *
 * Ces tests couvrent les fonctions PURES de lecture/écriture ; le câblage
 * React (`useChatComposerDraft`) est prouvé par les scénarios d'écran dans
 * `Chat.draft.test.tsx`, qui exercent le VRAI composant plutôt qu'un hook
 * isolé — c'est là que « survit au rafraîchissement » se lit littéralement
 * (démontage puis remontage du même écran).
 */

beforeEach(() => {
  localStorage.clear()
})

describe('chatDraftKey', () => {
  it("porte l'utilisateur ET le fil — jamais un seul des deux", () => {
    expect(chatDraftKey('u1', 't1')).toBe('bellum:chat-draft:u1:t1')
    expect(chatDraftKey('u1', 't1')).not.toBe(chatDraftKey('u2', 't1'))
    expect(chatDraftKey('u1', 't1')).not.toBe(chatDraftKey('u1', 't2'))
  })
})

describe('readChatDraft / writeChatDraft', () => {
  it('rend vide quand rien n’a été écrit', () => {
    expect(readChatDraft('u1', 't1')).toBe('')
  })

  it('fait l’aller-retour', () => {
    writeChatDraft('u1', 't1', 'Analyse Airbus')
    expect(readChatDraft('u1', 't1')).toBe('Analyse Airbus')
  })

  it('isole par UTILISATEUR — jamais un brouillon visible par un autre compte', () => {
    writeChatDraft('u1', 't1', 'Texte de u1')
    expect(readChatDraft('u2', 't1')).toBe('')
  })

  it('isole par FIL — changer de conversation ne récupère pas le brouillon voisin', () => {
    writeChatDraft('u1', 't1', 'Texte du fil 1')
    expect(readChatDraft('u1', 't2')).toBe('')
  })

  it('écrire une chaîne vide EFFACE le brouillon existant', () => {
    writeChatDraft('u1', 't1', 'Un brouillon')
    writeChatDraft('u1', 't1', '')
    expect(readChatDraft('u1', 't1')).toBe('')
    expect(localStorage.getItem(chatDraftKey('u1', 't1'))).toBeNull()
  })

  it('un brouillon de plus de 7 jours est ignoré ET retiré du stockage', () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000
    localStorage.setItem(chatDraftKey('u1', 't1'), JSON.stringify({ text: 'Périmé', savedAt: eightDaysAgo }))

    expect(readChatDraft('u1', 't1')).toBe('')
    expect(localStorage.getItem(chatDraftKey('u1', 't1'))).toBeNull()
  })

  it('un brouillon de moins de 7 jours reste lisible', () => {
    const sixDaysAgo = Date.now() - 6 * 24 * 60 * 60 * 1000
    localStorage.setItem(chatDraftKey('u1', 't1'), JSON.stringify({ text: 'Encore bon', savedAt: sixDaysAgo }))

    expect(readChatDraft('u1', 't1')).toBe('Encore bon')
  })

  it('un contenu illisible (JSON cassé) rend vide et nettoie la clé', () => {
    localStorage.setItem(chatDraftKey('u1', 't1'), '{not json')
    expect(readChatDraft('u1', 't1')).toBe('')
    expect(localStorage.getItem(chatDraftKey('u1', 't1'))).toBeNull()
  })

  it('une forme inattendue (pas {text, savedAt}) rend vide et nettoie la clé', () => {
    localStorage.setItem(chatDraftKey('u1', 't1'), JSON.stringify({ hello: 'world' }))
    expect(readChatDraft('u1', 't1')).toBe('')
    expect(localStorage.getItem(chatDraftKey('u1', 't1'))).toBeNull()
  })

  it('un stockage qui jette (navigation privée, quota) ne fait pas planter — lecture vide, écriture ignorée', () => {
    // ⚠️ DEUX environnements, deux porteurs des méthodes — et le test doit
    // jeter dans les deux. La polyfill (`src/test/localstorage-polyfill.ts`)
    // installe un objet LITTÉRAL quand jsdom rend un `localStorage` sans
    // méthodes (Node 25 sur les postes) : les méthodes sont alors propres à
    // l'instance. En CI (Node 22), jsdom rend un vrai `Storage` : les méthodes
    // vivent sur `Storage.prototype`, et poser `getItem` sur l'instance y range
    // une CLÉ au lieu de remplacer la méthode — le test passait en local et
    // tombait en CI (« expected 'Texte' to be '' »). On espionne donc l'objet
    // qui PORTE vraiment `getItem`.
    const prototype = Object.getPrototypeOf(localStorage) as Storage
    const carrier: Storage = typeof prototype?.getItem === 'function' ? prototype : localStorage
    const getItemSpy = vi.spyOn(carrier, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked')
    })
    const setItemSpy = vi.spyOn(carrier, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked')
    })

    expect(() => writeChatDraft('u1', 't1', 'Texte')).not.toThrow()
    expect(readChatDraft('u1', 't1')).toBe('')

    getItemSpy.mockRestore()
    setItemSpy.mockRestore()
  })
})

describe('clearChatDraft', () => {
  it("efface le brouillon d'UN fil, sans toucher les autres", () => {
    writeChatDraft('u1', 't1', 'Fil 1')
    writeChatDraft('u1', 't2', 'Fil 2')

    clearChatDraft('u1', 't1')

    expect(readChatDraft('u1', 't1')).toBe('')
    expect(readChatDraft('u1', 't2')).toBe('Fil 2')
  })
})

describe('#3769 — clearChatDraftAfterSend', () => {
  it('purge le fil courant ET le panier new, sans toucher un autre fil ni un autre compte', () => {
    writeChatDraft('u1', 'acct', 'envoyé')
    writeChatDraft('u1', 'new', 'Recette 10-10 frappe 1')
    writeChatDraft('u1', 'autre', 'garde-moi')
    writeChatDraft('u2', 'new', 'autre compte')

    clearChatDraftAfterSend('u1', 'acct')

    expect(readChatDraft('u1', 'acct')).toBe('')
    expect(readChatDraft('u1', 'new')).toBe('')
    expect(readChatDraft('u1', 'autre')).toBe('garde-moi')
    expect(readChatDraft('u2', 'new')).toBe('autre compte')
  })

  it('une restauration ne remplace pas un texte déjà tapé sur le même fil', () => {
    writeChatDraft('u1', 'new', 'vieux brouillon')
    const { result, rerender } = renderHook(
      ({ userId }) => {
        const [input, setInput] = useState('')
        useChatComposerDraft(userId, 'new', input, setInput)
        return { input, setInput }
      },
      { initialProps: { userId: null as string | null } },
    )
    act(() => result.current.setInput('nouvelle frappe'))
    rerender({ userId: 'u1' })
    expect(result.current.input).toBe('nouvelle frappe')
  })
})

describe('clearAllChatDrafts', () => {
  it('retire tous les brouillons — la purge de déconnexion', () => {
    writeChatDraft('u1', 't1', 'Fil 1')
    writeChatDraft('u1', 't2', 'Fil 2')
    writeChatDraft('u2', 't1', 'Autre compte')

    clearAllChatDrafts()

    expect(readChatDraft('u1', 't1')).toBe('')
    expect(readChatDraft('u1', 't2')).toBe('')
    expect(readChatDraft('u2', 't1')).toBe('')
  })

  it("ne touche PAS les autres clés localStorage — la garde sait dire non à ce qu'elle ne vise pas", () => {
    localStorage.setItem('bellum:some-other-preference', 'kept')
    writeChatDraft('u1', 't1', 'Fil 1')

    clearAllChatDrafts()

    expect(localStorage.getItem('bellum:some-other-preference')).toBe('kept')
  })
})

describe('#3469 — la première saisie d’un chargement à froid n’est pas écrasée', () => {
  function useComposer(userId: string | null, threadId: string) {
    const [input, setInput] = useState('')
    useChatComposerDraft(userId, threadId, input, setInput)
    return { input, setInput }
  }

  it('la session arrive APRÈS la frappe : le texte tapé reste, le brouillon stocké ne l’écrase pas', () => {
    const { result, rerender } = renderHook(({ userId }) => useComposer(userId, 't1'), {
      initialProps: { userId: null as string | null },
    })
    // Chargement à froid : pas encore de session, la personne tape déjà.
    result.current.setInput('Ma première question')
    rerender({ userId: 'u1' })
    expect(result.current.input).toBe('Ma première question')
  })

  it('témoin : sans frappe, le brouillon stocké du fil est bien restauré', () => {
    writeChatDraft('u1', 't1', 'Brouillon gardé')
    const { result } = renderHook(() => useComposer('u1', 't1'))
    expect(result.current.input).toBe('Brouillon gardé')
  })

  it('témoin : changer de FIL charge le brouillon du nouveau fil, même avec une saisie en cours', () => {
    writeChatDraft('u1', 't2', 'Brouillon de t2')
    const { result, rerender } = renderHook(({ threadId }) => useComposer('u1', threadId), {
      initialProps: { threadId: 't1' },
    })
    result.current.setInput('Saisie sur t1')
    rerender({ threadId: 't2' })
    expect(result.current.input).toBe('Brouillon de t2')
  })
})

// #3648 — recette prod 06/10 : « le texte tapé pendant l'écran de chargement est
// perdu (composeur vide ensuite) » — le fil se précise après la frappe.
describe('#3648 — la frappe pendant le chargement survit à la précision du fil', () => {
  function useComposer(threadId: string) {
    const [input, setInput] = useState('')
    useChatComposerDraft('u1', threadId, input, setInput, { carryFromThread: 'new' })
    return { input, setInput }
  }

  it('le fil change pendant le chargement, vers un fil sans brouillon : la saisie reste', () => {
    const { result, rerender } = renderHook(({ threadId }) => useComposer(threadId), {
      initialProps: { threadId: 'new' },
    })
    act(() => result.current.setInput('Quelles sont mes opportunités ?'))
    rerender({ threadId: 'compte-42' })
    expect(result.current.input).toBe('Quelles sont mes opportunités ?')
  })

  // #3769 (lot RAA 10/10) — une frappe gagne TOUJOURS sur une restauration asynchrone :
  // le fil d'arrivée a un brouillon NON vide, la saisie déjà tapée n'est pas écrasée.
  it('#3769 — le fil se précise vers un fil AVEC brouillon : la frappe déjà tapée gagne', () => {
    writeChatDraft('u1', 'compte-42', 'Vieux brouillon du compte')
    const { result, rerender } = renderHook(({ threadId }) => useComposer(threadId), {
      initialProps: { threadId: 'new' },
    })
    act(() => result.current.setInput('Ce que je tape tout de suite'))
    rerender({ threadId: 'compte-42' })
    expect(result.current.input).toBe('Ce que je tape tout de suite')
  })

  it('sait dire NON : un changement de fil explicite (hors panier commun) change de saisie', () => {
    const { result, rerender } = renderHook(({ threadId }) => useComposer(threadId), {
      initialProps: { threadId: 'c-un' },
    })
    act(() => result.current.setInput('Saisie sur c-un'))
    rerender({ threadId: 'c-deux' })
    expect(result.current.input).toBe('')
  })

  it('sait dire NON : passé le chargement, même depuis le panier commun, changer de fil change de saisie', () => {
    vi.useFakeTimers()
    try {
      const { result, rerender } = renderHook(({ threadId }) => useComposer(threadId), {
        initialProps: { threadId: 'new' },
      })
      act(() => result.current.setInput('Saisie sur new'))
      act(() => {
        vi.advanceTimersByTime(10_000)
      })
      rerender({ threadId: 't2' })
      expect(result.current.input).toBe('')
    } finally {
      vi.useRealTimers()
    }
  })
})

// V13.3 — recette prod 08/10 : « après navigation vers /chat, la frappe
// immédiate est polluée (« ééä » envoyé) ou perdue » — course entre la frappe
// et la résolution asynchrone de la session/du brouillon. `ready` est le
// signal que l'écran désactive la saisie tant qu'il ne vaut pas `true`.
describe('V13.3 — « ready » ferme la course au chargement du composeur', () => {
  function useComposer(userId: string | null, threadId: string) {
    const [input, setInput] = useState('')
    const { ready } = useChatComposerDraft(userId, threadId, input, setInput)
    return { input, setInput, ready }
  }

  it('pas prêt tant que la session (userId) est inconnue', () => {
    const { result } = renderHook(() => useComposer(null, 'new'))
    expect(result.current.ready).toBe(false)
  })

  it('#3864 (vu en passant, recette prod 09/10) — déjà prêt DÈS LE PREMIER RENDU quand `userId` est déjà connu (navigation SPA, pas de chargement à froid) — aucune frappe désactivée, donc aucune perdue', () => {
    const { result } = renderHook(() => useComposer('u1', 'new'))
    expect(result.current.ready).toBe(true)
  })

  it('devient prêt dès que la session est connue', () => {
    const { result, rerender } = renderHook(({ userId }) => useComposer(userId, 't1'), {
      initialProps: { userId: null as string | null },
    })
    expect(result.current.ready).toBe(false)
    rerender({ userId: 'u1' })
    expect(result.current.ready).toBe(true)
  })

  it('sait dire NON à un retour en arrière : un changement de fil ne redevient jamais « pas prêt »', () => {
    const { result, rerender } = renderHook(({ threadId }) => useComposer('u1', threadId), {
      initialProps: { threadId: 't1' },
    })
    expect(result.current.ready).toBe(true)
    rerender({ threadId: 't2' })
    expect(result.current.ready).toBe(true)
  })
})

// #3563.5 — recette prod 02/10 : « des caractères parasites se collent dans le
// champ après un envoi et partent dans le message suivant ». Le brouillon est la
// seule mécanique qui réécrit la saisie à l'insu de la personne : ce test prouve
// qu'un envoi accepté ne laisse RIEN à réinjecter — ni sur le fil, ni sur le
// suivant — même quand Entrée suit la frappe avant le débounce de 300 ms.
describe('#3563.5 — un envoi accepté ne laisse aucun texte à réinjecter', () => {
  function useSendingComposer(threadId: string) {
    const [input, setInput] = useState('')
    const [sending, setSending] = useState(false)
    useChatComposerDraft('u1', threadId, input, setInput, { keepStoredWhileEmpty: sending })
    return { input, setInput, setSending }
  }

  it('frappe, Entrée avant le débounce, acceptation : la saisie reste vide sur t1 comme sur t2', () => {
    vi.useFakeTimers()
    try {
      const { result, rerender } = renderHook(({ threadId }) => useSendingComposer(threadId), {
        initialProps: { threadId: 't1' },
      })
      act(() => result.current.setInput('Je cherche le décideur.'))
      // Entrée dans les 300 ms : saisie vidée, envoi en vol.
      act(() => {
        result.current.setSending(true)
        result.current.setInput('')
      })
      // Le serveur accepte : le brouillon du fil est effacé, l'envoi se termine.
      act(() => {
        clearChatDraft('u1', 't1')
        result.current.setSending(false)
      })
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(result.current.input).toBe('')
      expect(readChatDraft('u1', 't1')).toBe('')
      // Le fil suivant (nouvelle conversation) ne rapporte rien non plus.
      rerender({ threadId: 't2' })
      expect(result.current.input).toBe('')
      rerender({ threadId: 't1' })
      expect(result.current.input).toBe('')
    } finally {
      vi.useRealTimers()
    }
  })
})

// #4006 / #3769 (lot W1, 11/10 nuit) — « première saisie perdue », « 1er caractère
// manquant », « ancien brouillon resservi », « Generaleéééé » : le même défaut, vu au
// clavier réel. Un effet passif de restauration tourne APRÈS le premier affichage ; une
// frappe qui tombe entre le commit et cet effet est déjà dans la file de React mais pas
// encore dans `input` (donc pas dans `inputRef`). Le `setInput(stored)` de l'effet passait
// alors APRÈS elle dans la file et la remplaçait. Le test rejoue cet instant exact : la
// frappe est posée dans un `useLayoutEffect` (après le commit, avant les effets passifs).
describe('#4006 — une frappe déjà en file n’est jamais remplacée par la restauration', () => {
  function useTypedBeforeEffects(userId: string | null, threadId: string, typed: string) {
    const [input, setInput] = useState('')
    useChatComposerDraft(userId, threadId, input, setInput, { carryFromThread: 'new' })
    useLayoutEffect(() => {
      if (typed) setInput(typed)
    }, [typed])
    return input
  }

  it('1er caractère : « S » frappé entre le commit et l’effet passif reste « S » (brouillon vide)', () => {
    const { result } = renderHook(() => useTypedBeforeEffects('u1', 'new', 'S'))
    expect(result.current).toBe('S')
  })

  it('ancien brouillon : la frappe en file gagne, le vieux brouillon n’est pas resservi', () => {
    writeChatDraft('u1', 'new', 'Vieux brouillon')
    const { result } = renderHook(() => useTypedBeforeEffects('u1', 'new', 'Société'))
    expect(result.current).toBe('Société')
  })

  it('le fil se précise (panier new → compte) avec la frappe en file : elle reste', () => {
    writeChatDraft('u1', 'compte-42', 'Vieux brouillon du compte')
    const { result, rerender } = renderHook(({ threadId, typed }) => useTypedBeforeEffects('u1', threadId, typed), {
      initialProps: { threadId: 'new', typed: '' },
    })
    rerender({ threadId: 'compte-42', typed: 'é' })
    expect(result.current).toBe('é')
  })

  it('témoin : sans frappe, le brouillon stocké est bien restauré', () => {
    writeChatDraft('u1', 'new', 'Brouillon gardé')
    const { result } = renderHook(() => useTypedBeforeEffects('u1', 'new', ''))
    expect(result.current).toBe('Brouillon gardé')
  })

  it('sait dire NON : un changement de fil explicite change toujours de saisie', () => {
    writeChatDraft('u1', 'c-deux', 'Brouillon de c-deux')
    const { result, rerender } = renderHook(({ threadId }) => useTypedBeforeEffects('u1', threadId, ''), {
      initialProps: { threadId: 'c-un' },
    })
    act(() => undefined)
    rerender({ threadId: 'c-deux' })
    expect(result.current).toBe('Brouillon de c-deux')
  })
})

describe('#4006 — touche morte : aucune restauration pendant une composition, même champ encore vide', () => {
  function useComposer(threadId: string) {
    const [input, setInput] = useState('')
    useChatComposerDraft('u1', threadId, input, setInput, { carryFromThread: 'new' })
    return { input, setInput }
  }

  it('compositionstart AVANT la première mise à jour d’état : le brouillon ne remplace pas la composition', () => {
    writeChatDraft('u1', 'compte-42', 'Vieux brouillon')
    const { result, rerender } = renderHook(({ threadId }) => useComposer(threadId), {
      initialProps: { threadId: 'new' },
    })
    // La touche morte démarre : `input` est encore '' (rien n’est remonté à React).
    act(() => {
      document.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    })
    rerender({ threadId: 'compte-42' })
    expect(result.current.input).toBe('')
    act(() => {
      document.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    })
  })

  it('sait dire NON : une fois la composition finie, la restauration redevient possible', () => {
    writeChatDraft('u1', 'compte-42', 'Vieux brouillon')
    const { result, rerender } = renderHook(({ threadId }) => useComposer(threadId), {
      initialProps: { threadId: 'new' },
    })
    act(() => {
      document.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      document.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    })
    rerender({ threadId: 'compte-42' })
    expect(result.current.input).toBe('Vieux brouillon')
  })
})

// #6 (recette prod 31/10) — deux onglets sur /chat mélangeaient leur saisie : le panier d'une conversation
// NEUVE (`new`) était UNE clé de `localStorage`, partagée par tous les onglets du navigateur.
describe('un brouillon par conversation — « new » est propre à l’onglet', () => {
  async function inTab(tabId: string) {
    sessionStorage.setItem('bellum:chat-tab-id', tabId)
    vi.resetModules()
    return import('./composer-draft')
  }

  it('deux onglets sur une conversation neuve ne se voient pas', async () => {
    const tabA = await inTab('tab-a')
    tabA.writeChatDraft('u1', 'new', 'saisie de l’onglet A')
    const tabB = await inTab('tab-b')
    expect(tabB.readChatDraft('u1', 'new')).toBe('')
    tabB.writeChatDraft('u1', 'new', 'saisie de l’onglet B')
    const tabAgain = await inTab('tab-a')
    expect(tabAgain.readChatDraft('u1', 'new')).toBe('saisie de l’onglet A')
  })

  it('un rechargement de l’onglet (même sessionStorage) retrouve sa saisie neuve', async () => {
    const first = await inTab('tab-a')
    first.writeChatDraft('u1', 'new', 'avant F5')
    const reloaded = await inTab('tab-a')
    expect(reloaded.readChatDraft('u1', 'new')).toBe('avant F5')
  })

  it('une conversation (id) garde son brouillon d’un onglet à l’autre, et un envoi n’efface que celle-là', async () => {
    const tabA = await inTab('tab-a')
    tabA.writeChatDraft('u1', 'conv-1', 'brouillon 1')
    tabA.writeChatDraft('u1', 'conv-2', 'brouillon 2')
    const tabB = await inTab('tab-b')
    expect(tabB.readChatDraft('u1', 'conv-1')).toBe('brouillon 1')
    tabB.clearChatDraftAfterSend('u1', 'conv-1')
    expect(tabB.readChatDraft('u1', 'conv-1')).toBe('')
    expect(tabB.readChatDraft('u1', 'conv-2')).toBe('brouillon 2')
  })

  it('l’envoi depuis une conversation n’efface PAS la saisie neuve d’un autre onglet', async () => {
    const tabA = await inTab('tab-a')
    tabA.writeChatDraft('u1', 'new', 'saisie neuve A')
    const tabB = await inTab('tab-b')
    tabB.writeChatDraft('u1', 'conv-1', 'x')
    tabB.clearChatDraftAfterSend('u1', 'conv-1')
    const tabAgain = await inTab('tab-a')
    expect(tabAgain.readChatDraft('u1', 'new')).toBe('saisie neuve A')
  })
})
