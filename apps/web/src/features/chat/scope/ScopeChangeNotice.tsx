import { useTranslation } from 'react-i18next'
import { ArrowLeft, Undo2, X } from 'lucide-react'
import { Text, cn } from '@bellum/ui'
import { scopeLabel } from './ScopeButton'
import { scopeAccount, type ChatScope, type ScopeAccount } from './chat-scope'
import type { ScopeChange } from './scope-trail'

/**
 * #1951.17 / #1951.18 / #1951.21 — L'ANNONCE D'UN CHANGEMENT DE PÉRIMÈTRE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE RÉPARE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le bouton de portée dit ce que Laura lit MAINTENANT — et il le dit bien. Ce
 * qu'il ne dit pas, c'est qu'on vient d'en changer, ni d'où l'on vient. C'est la
 * moitié manquante de l'incident #1779 : le correctif de septembre a corrigé le
 * LIBELLÉ du choix, pas le moment du basculement. Un libellé juste dans un coin
 * de l'en-tête ne se lit pas quand on tape déjà sa question.
 *
 * ⚠️ ELLE NE DÉCIDE RIEN. Elle annonce et elle propose ; c'est le clic qui
 * ramène. « Rien n'écrit tout seul » vaut aussi pour un périmètre : ramener
 * automatiquement quelqu'un qui vient de choisir serait exactement la méprise
 * inverse.
 *
 * ⚠️ Elle DISPARAÎT d'elle-même dès que le périmètre ne change plus
 * (`scopeChangeOf` rend `null`) : une bannière permanente s'arrête d'être lue,
 * et la prochaine — celle qui compte — passerait inaperçue.
 */
export function ScopeChangeNotice({
  change,
  previous,
  accounts,
  onReturn,
  onDismiss,
  className,
}: {
  /** `null` = rien n'a changé : le composant ne rend RIEN. */
  change: ScopeChange | null
  /** Le périmètre où revenir, ou `null` quand il n'y en a pas. */
  previous: ChatScope | null
  accounts: readonly ScopeAccount[]
  onReturn: () => void
  onDismiss: () => void
  className?: string
}) {
  const { t } = useTranslation('chat')
  if (!change) return null

  const name = (scope: ChatScope): string => scopeLabel(scope, scopeAccount(scope, accounts), null, t)

  return (
    <div
      // `status` et non `alert` : ce n'est pas une erreur, et un `alert`
      // interromprait la lecture d'écran en cours de frappe.
      role="status"
      className={cn(
        'mx-3 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 py-2',
        className,
      )}
    >
      <ArrowLeft className="size-4 shrink-0 rotate-180 text-[var(--bellum-text-accent)]" aria-hidden />
      <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="min-w-0">
        {t('scope.changed.label', { from: name(change.from), to: name(change.to) })}
      </Text>
      <div className="ml-auto flex items-center gap-1">
        {previous ? (
          <button
            type="button"
            onClick={onReturn}
            className="flex min-h-11 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-[var(--bellum-text-accent)] transition-colors hover:bg-[var(--bellum-bg-darker)] md:min-h-0 md:py-1.5 pointer-coarse:min-h-11"
          >
            <Undo2 className="size-3.5 shrink-0" aria-hidden />
            {t('scope.changed.back', { scope: name(previous) })}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDismiss}
          // Une icône seule porte un nom (GA-32) ; la cible reste à 44 px en
          // pointeur grossier (GA-30).
          aria-label={t('scope.changed.dismiss')}
          className="flex size-11 items-center justify-center rounded-lg text-[var(--bellum-text-muted)] transition-colors hover:bg-[var(--bellum-bg-darker)] md:size-8 pointer-coarse:size-11"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}
