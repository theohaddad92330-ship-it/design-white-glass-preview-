import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAnalysisStore } from '@/stores/analysisStore'
import { useBackgroundTasksStore } from '@/stores/backgroundTasksStore'
import { useDeclaredBusyStore } from '@/stores/lauraDeclaredBusyStore'
import { useDeclareLauraBusy, useLauraBusy } from './useLauraBusy'

/**
 * #1937.7 — AUCUNE INTERRUPTION PENDANT UNE MODALE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE TROU QUE CE FICHIER FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * `useLauraBusy` couvrait déjà la saisie, l'import, l'analyse et la
 * validation — mais pas une modale ouverte : ni `<Dialog>`, ni `<AlertDialog>`,
 * ni `<Sheet>` (qui partage le même primitif Radix) ne faisaient partie du
 * signal. Une carte `LauraCard` pouvait donc s'afficher PENDANT qu'une boîte de
 * confirmation ou un tiroir occupait l'écran.
 *
 * Aucun état global du dépôt ne couvre les TROIS formes (`useAnySheetOpen` ne
 * compte que les `<Sheet>`) : le signal retenu observe donc le DOM, mais de
 * façon BORNÉE — seuls les enfants DIRECTS de `<body>` sont surveillés
 * (`childList`, jamais `subtree`), parce que c'est exactement là qu'un Portal
 * Radix ajoute ou retire son conteneur à l'ouverture et à la fermeture. Un
 * `subtree: true` coûterait sur CHAQUE mutation de l'application entière.
 */

function openDialog(role: 'dialog' | 'alertdialog' = 'dialog'): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute('role', role)
  document.body.appendChild(el)
  return el
}

beforeEach(() => {
  useAnalysisStore.setState({ runs: {} })
  useBackgroundTasksStore.setState({ tasks: {} })
  useDeclaredBusyStore.setState({ activeIds: new Set() })
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('#1937.7 — une modale ouverte rend Laura occupée', () => {
  it('modale FERMÉE : Laura reste libre (retour normal)', () => {
    const { result } = renderHook(() => useLauraBusy())
    expect(result.current).toBe(false)
  })

  it('modale OUVERTE (`role="dialog"`) : Laura ne peut plus intervenir', async () => {
    const { result } = renderHook(() => useLauraBusy())
    expect(result.current).toBe(false)

    act(() => {
      openDialog('dialog')
    })

    await waitFor(() => expect(result.current).toBe(true))
  })

  it('une alerte (`role="alertdialog"`) compte aussi comme une modale', async () => {
    const { result } = renderHook(() => useLauraBusy())

    act(() => {
      openDialog('alertdialog')
    })

    await waitFor(() => expect(result.current).toBe(true))
  })

  it('la modale se ferme : Laura redevient libre SANS rechargement', async () => {
    const { result } = renderHook(() => useLauraBusy())
    let dialog: HTMLElement = document.createElement('div')
    act(() => {
      dialog = openDialog('dialog')
    })

    await waitFor(() => expect(result.current).toBe(true))

    act(() => {
      dialog.remove()
    })

    await waitFor(() => expect(result.current).toBe(false))
  })

  it('une modale DÉJÀ ouverte au montage du hook est vue dès le premier rendu', () => {
    openDialog('dialog')
    const { result } = renderHook(() => useLauraBusy())
    expect(result.current).toBe(true)
  })

  it('un élément qui ne PORTE pas le rôle dialogue ne déclenche rien', () => {
    const { result } = renderHook(() => useLauraBusy())
    act(() => {
      const el = document.createElement('div')
      el.className = 'not-a-dialog'
      document.body.appendChild(el)
    })
    expect(result.current).toBe(false)
  })
})

describe('#2403.15 / #2403.16 — une action déclarée occupée rend Laura occupée', () => {
  it('rien de déclaré : Laura reste libre', () => {
    const { result } = renderHook(() => useLauraBusy())
    expect(result.current).toBe(false)
  })

  it('une déclaration ACTIVE occupe Laura', () => {
    const busy = renderHook(() => useLauraBusy())
    renderHook(() => useDeclareLauraBusy(true, 'voice-mode'))
    expect(busy.result.current).toBe(true)
  })

  it('la déclaration retombe à `false` : Laura redevient libre', () => {
    const busy = renderHook(() => useLauraBusy())
    const declared = renderHook(({ active }) => useDeclareLauraBusy(active, 'voice-mode'), {
      initialProps: { active: true },
    })
    expect(busy.result.current).toBe(true)

    act(() => {
      declared.rerender({ active: false })
    })
    expect(busy.result.current).toBe(false)
  })

  it('le démontage retire la déclaration — un écran qui disparaît ne bâillonne pas Laura', () => {
    const busy = renderHook(() => useLauraBusy())
    const declared = renderHook(() => useDeclareLauraBusy(true, 'invoice-critical-action'))
    expect(busy.result.current).toBe(true)

    act(() => {
      declared.unmount()
    })
    expect(busy.result.current).toBe(false)
  })

  it('deux déclarations concurrentes se composent : la première qui se retire laisse Laura occupée', () => {
    const busy = renderHook(() => useLauraBusy())
    const voice = renderHook(() => useDeclareLauraBusy(true, 'voice-mode'))
    renderHook(() => useDeclareLauraBusy(true, 'invoice-critical-action'))
    expect(busy.result.current).toBe(true)

    act(() => {
      voice.unmount()
    })
    expect(busy.result.current).toBe(true)
  })
})
