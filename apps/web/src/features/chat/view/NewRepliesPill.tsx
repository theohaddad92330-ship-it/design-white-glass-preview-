import { useEffect, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown } from 'lucide-react'
import { Button } from '@bellum/ui'
import { followBottom } from './follow-bottom'
import { arrivedWhileReadingAbove, tailKey } from './new-replies-pill'
import { shouldAutoScroll } from './should-auto-scroll'

/**
 * #3776.5 — L'ACCÈS DISCRET AUX NOUVEAUX ÉLÉMENTS, quand on lit plus haut.
 *
 * Posé À LA FIN du contenu défilant : `sticky bottom-0` sur une boîte de hauteur 0, le bouton
 * lui-même en `absolute` au-dessus — il flotte au bas de la zone visible sans déplacer une
 * seule ligne du fil (« les contrôles apparaissent à un moment stable, sans se déplacer sous
 * le clic »). Absent tant que rien n'est arrivé ; absent dès que la personne est redescendue.
 */
export function NewRepliesPill({
  boxRef,
  messages,
}: {
  boxRef: RefObject<HTMLDivElement | null>
  messages: readonly { role: 'user' | 'assistant'; content: string }[]
}) {
  const { t } = useTranslation('chat')
  const [visible, setVisible] = useState(false)
  const previousTail = useRef(tailKey(messages))

  useEffect(() => {
    const next = tailKey(messages)
    const box = boxRef.current
    if (box && arrivedWhileReadingAbove(previousTail.current, next, box)) setVisible(true)
    previousTail.current = next
  }, [messages, boxRef])

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const onScroll = () => {
      if (shouldAutoScroll(box)) setVisible(false)
    }
    box.addEventListener('scroll', onScroll, { passive: true })
    return () => box.removeEventListener('scroll', onScroll)
  }, [boxRef])

  if (!visible) return null
  return (
    <div className="sticky bottom-0 h-0">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          const box = boxRef.current
          if (box) followBottom(box)
          setVisible(false)
        }}
        className="absolute bottom-3 left-1/2 min-h-11 -translate-x-1/2 gap-1.5 rounded-full bg-[var(--bellum-surface-2)] text-xs shadow-sm"
      >
        <ArrowDown aria-hidden className="size-3.5 shrink-0" />
        {t('newReplies.pill')}
      </Button>
    </div>
  )
}
