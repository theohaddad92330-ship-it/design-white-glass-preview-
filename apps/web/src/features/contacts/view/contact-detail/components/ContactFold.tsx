import { Card, Text } from '@bellum/ui'
import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * #3687 — une section SECONDAIRE repliée : preuves, corrections, journal.
 *
 * Les enfants ne sont montés qu'à l'ouverture. Une vue cachée qui chargerait
 * ses données en parallèle ferait payer à chaque fiche ce que presque personne
 * n'ouvre — c'est la pile de modules dépliés que la recomposition retire.
 */
export function ContactFold({
  id,
  title,
  open,
  onOpenChange,
  children,
}: {
  id: string
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  return (
    <Card id={id} className="rounded-2xl">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => onOpenChange(!open)}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl px-5 py-3 text-left"
      >
        <Text element="h2" size="base" weight="semibold" color="text-foreground">
          {title}
        </Text>
        <ChevronDown
          aria-hidden
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? (
        <div id={`${id}-panel`} className="space-y-4 px-5 pb-5">
          {children}
        </div>
      ) : null}
    </Card>
  )
}
