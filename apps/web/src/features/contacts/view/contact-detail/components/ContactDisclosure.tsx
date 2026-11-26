import { cn } from '@bellum/ui'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * #3716 — un détail qu'on DEMANDE : une ligne de titre sur la fiche, le contenu
 * dessous une fois ouverte. `<details>` natif : tabulable, ouvert au clavier
 * (Entrée / Espace), aucun état JavaScript à synchroniser — et un script
 * extérieur (« Vérifier la situation ») peut l'ouvrir en posant `open`.
 *
 * Fermé, le contenu RESTE dans le document : rien n'est démonté, rien n'est
 * rechargé, donc ouvrir ou fermer ne déclenche ni collecte ni débit.
 */
export function ContactDisclosure({
  id,
  title,
  hint,
  children,
}: {
  id?: string
  title: string
  /** Ce que le détail contient, en une ligne — jamais un compteur « 0 ». */
  hint?: string
  children: ReactNode
}) {
  return (
    <details id={id} className="group">
      <summary
        className={cn(
          'flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-2xl border border-[var(--bellum-border)] bg-card px-5 py-3 text-sm font-semibold',
          'text-foreground [&::-webkit-details-marker]:hidden',
        )}
      >
        <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
        <span>{title}</span>
        {hint ? <span className="min-w-0 truncate text-xs font-normal text-muted-foreground">{hint}</span> : null}
      </summary>
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  )
}
