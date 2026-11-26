import { Text } from '@bellum/ui'
import type { ReactNode } from 'react'

/**
 * Une section ancrée de la page Pilotage (Cockpit · Pipe · Staffing · Finance). `scroll-mt` laisse la
 * barre d'ancres collante au-dessus du titre quand on arrive par `#section`.
 */
export function PilotageSection({
  id,
  title,
  intro,
  access,
  children,
}: {
  id: string
  title: string
  intro?: string
  /** La puce d'accès : qui ouvre cette section (Théo — « Direction · droit finance »). */
  access?: string
  children: ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-10 scroll-mt-14">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={`${id}-title`} className="text-xl font-semibold text-[var(--bellum-text-primary)]">
          {title}
        </h2>
        {access ? (
          <Text
            size="xs"
            className="rounded-full border border-[var(--bellum-border)] px-2 py-0.5 text-[var(--bellum-text-secondary)]"
          >
            {access}
          </Text>
        ) : null}
      </div>
      {intro ? (
        <Text element="p" size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
          {intro}
        </Text>
      ) : null}
      <div className="mt-3">{children}</div>
    </section>
  )
}
