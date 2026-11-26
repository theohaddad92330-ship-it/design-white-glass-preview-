import { Box } from '@bellum/ui'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { useTranslation } from 'react-i18next'

/** Distance (px de doigt, après amortissement) à franchir pour déclencher. */
const THRESHOLD = 64
const MAX_PULL = 96

/** Vrai tant qu'aucun conteneur défilant entre la cible et la coque n'est déjà descendu. */
function isAtTop(target: EventTarget, root: HTMLElement): boolean {
  let node = target instanceof HTMLElement ? target : null
  while (node) {
    if (node.scrollTop > 0) return false
    if (node === root) return true
    node = node.parentElement
  }
  return true
}

/**
 * #4136 — tirer pour rafraîchir, sur mobile.
 *
 * Le geste invalide les requêtes TanStack Query : les requêtes actives (celles
 * de la page affichée) se relisent, les autres sont marquées périmées. Il ne
 * recharge pas la page — on ne perd ni la saisie ni la position.
 *
 * Garde-fous : actif seulement quand `enabled` (les quatre onglets) et tout en
 * HAUT de la liste (aucun ancêtre défilant n'est descendu), un tirage vers le
 * haut ou trop court ne fait rien, et rien n'est rendu sur desktop puisque la
 * coque mobile est la seule à monter ce composant. L'actualisation s'annonce
 * dans une zone `role="status"` ; l'indicateur de tirage est décoratif.
 */
export function PullToRefresh({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const { t } = useTranslation('mobile')
  const queryClient = useQueryClient()
  const rootRef = useRef<HTMLDivElement>(null)
  const startY = useRef<number | null>(null)
  const pullRef = useRef(0)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  function reset() {
    startY.current = null
    pullRef.current = 0
    setPull(0)
  }

  function onTouchStart(event: TouchEvent<HTMLDivElement>) {
    const root = rootRef.current
    if (!enabled || refreshing || !root || event.touches.length !== 1) return
    startY.current = isAtTop(event.target, root) ? (event.touches[0]?.clientY ?? null) : null
  }

  function onTouchMove(event: TouchEvent<HTMLDivElement>) {
    const root = rootRef.current
    if (startY.current === null || !root) return
    const y = event.touches[0]?.clientY
    if (y === undefined) return
    const delta = y - startY.current
    if (delta <= 0 || !isAtTop(event.target, root)) {
      pullRef.current = 0
      setPull(0)
      return
    }
    // Amortissement : le doigt parcourt deux fois la distance affichée.
    pullRef.current = Math.min(delta / 2, MAX_PULL)
    setPull(pullRef.current)
  }

  async function onTouchEnd() {
    const reached = startY.current !== null && pullRef.current >= THRESHOLD
    reset()
    if (!reached) return
    setRefreshing(true)
    try {
      await queryClient.invalidateQueries()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div
      ref={rootRef}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={reset}
    >
      <Box
        role="status"
        aria-live="polite"
        className="flex shrink-0 items-center justify-center gap-2 overflow-hidden text-xs text-muted-foreground"
        style={{ height: refreshing ? 32 : pull > 0 ? pull : 0 }}
      >
        {refreshing ? (
          <>
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            {t('pullToRefresh.refreshing')}
          </>
        ) : null}
      </Box>
      {children}
    </div>
  )
}
