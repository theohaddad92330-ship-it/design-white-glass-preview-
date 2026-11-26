import { Box, cn } from '@bellum/ui'
import { ChevronDown, ListChecks } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useCurrentUserStore } from '@/stores/currentUserStore'
import { AlertsContext, type AlertsContextValue, type RegisteredCard } from './alertsContext'
import { isIgnored, isUnseen, readAlertMemory, writeAlertMemory, type AlertMemory } from './contactAlertMemory'

/**
 * #4596 — le bandeau « Avant d'agir sur ce contact », REPLIÉ par défaut, et le pli DIT ce qu'il cache
 * (« 3 points à vérifier avant d'agir »), jamais un chevron muet.
 *
 * - Une carte JAMAIS VUE (ou dont le contenu a changé) ouvre le pli : replier n'enterre pas une alerte neuve.
 *   Une carte déjà lue, ignorée ou résolue le laisse fermé.
 * - Chaque carte s'enregistre ici (`ContactAlertSlot`) : le bandeau compte ce qui existe sans connaître les
 *   sept cartes, et les cartes restent MONTÉES pendant le pli (leurs données se chargent, le compte est vrai).
 * - Aucune carte = aucun pli, aucun bandeau (`hidden` : l'espace `space-y` du parent disparaît aussi).
 * - Position inchangée (au-dessus, pleine largeur — Théo B c5, `ContactDetail.layout.test.ts`) : seul l'ÉTAT
 *   INITIAL change. Rien ne bloque : le bandeau avertit, il n'a jamais empêché d'agir.
 */
export function ContactAlertsBand({ contactId, children }: { contactId: string; children: ReactNode }) {
  const { t } = useTranslation('contacts')
  const userId = useCurrentUserStore(state => state.currentUser?.id ?? null)
  const [memory, setMemory] = useState<AlertMemory>(() => readAlertMemory(userId, contactId))
  const [cards, setCards] = useState<Readonly<Record<string, RegisteredCard>>>({})
  const [open, setOpen] = useState(false)

  const register = useCallback((id: string, card: RegisteredCard) => {
    setCards(prev =>
      prev[id]?.signature === card.signature && prev[id]?.title === card.title ? prev : { ...prev, [id]: card },
    )
    return () =>
      setCards(prev => {
        const { [id]: _removed, ...rest } = prev
        return rest
      })
  }, [])

  const patch = useCallback(
    (id: string, change: (previous: AlertMemory[string] | undefined) => AlertMemory[string]) =>
      setMemory(prev => ({ ...prev, [id]: change(prev[id]) })),
    [],
  )
  const ignore = useCallback(
    (id: string, signature: string) =>
      patch(id, previous => ({ ...previous, ignoredAt: new Date().toISOString(), ignoredSignature: signature })),
    [patch],
  )
  const restore = useCallback(
    (id: string, signature: string) =>
      patch(id, previous => ({ ...previous, ignoredAt: undefined, ignoredSignature: undefined, seen: signature })),
    [patch],
  )
  const markRechecked = useCallback(
    (id: string) => patch(id, previous => ({ ...previous, recheckedAt: new Date().toISOString() })),
    [patch],
  )

  const entries = Object.entries(cards)
  const ignoredCount = entries.filter(([id, card]) => isIgnored(memory[id], card.signature)).length
  const activeCount = entries.length - ignoredCount
  const hasNew = entries.some(([id, card]) => isUnseen(memory[id], card.signature))

  // #4596.2 — une carte neuve ouvre le pli ; ouvert, tout ce qui est dessous est « vu ».
  useEffect(() => {
    if (hasNew) setOpen(true)
  }, [hasNew])
  useEffect(() => {
    if (!open) return
    const stale = entries.filter(
      ([id, card]) => !isIgnored(memory[id], card.signature) && memory[id]?.seen !== card.signature,
    )
    if (stale.length === 0) return
    setMemory(prev => {
      const next = { ...prev }
      for (const [id, card] of stale) next[id] = { ...next[id], seen: card.signature }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `entries` dérive de `cards`
  }, [open, cards, memory])
  useEffect(() => {
    if (Object.keys(memory).length > 0) writeAlertMemory(userId, contactId, memory)
  }, [memory, userId, contactId])

  const value = useMemo<AlertsContextValue>(
    () => ({ memory, register, ignore, restore, markRechecked }),
    [memory, register, ignore, restore, markRechecked],
  )

  const summary = activeCount > 0 ? t('avantDagir.summary', { count: activeCount }) : t('avantDagir.allIgnored')

  return (
    <AlertsContext.Provider value={value}>
      <Box
        as="section"
        aria-label={t('zones.alerts')}
        data-testid="contact-alerts"
        className={cn('space-y-3', entries.length === 0 && 'hidden')}
      >
        {entries.length > 0 ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls="contact-alerts-panel"
            onClick={() => setOpen(previous => !previous)}
            className="flex min-h-11 w-full items-center gap-2 rounded-2xl border border-[var(--bellum-warning)] px-4 py-2 text-left text-sm font-medium text-[var(--warning-soft-text)]"
          >
            <ListChecks className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              {summary}
              {ignoredCount > 0 ? (
                <span className="font-normal"> · {t('avantDagir.ignoredCount', { count: ignoredCount })}</span>
              ) : null}
            </span>
            <ChevronDown aria-hidden className={cn('size-4 shrink-0 transition-transform', open && 'rotate-180')} />
          </button>
        ) : null}
        <div id="contact-alerts-panel" hidden={!open} className="space-y-3 empty:hidden">
          {children}
        </div>
      </Box>
    </AlertsContext.Provider>
  )
}
