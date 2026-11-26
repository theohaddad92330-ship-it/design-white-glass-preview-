import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import type { SecondPassScope } from '@/features/discover/lib/discover-second-pass'

/**
 * #4305 — UNE ligne qui dit la PORTÉE de la recherche : ce qui est déjà cherché et affiché, ce qui reste à chercher
 * (`scope`). Le second passage se fait désormais dans le même chargement (#4517) : il n'y a plus de phase « arrive »
 * à annoncer, seulement ce que la liste finale ne couvre PAS encore. Rien quand il ne reste rien à dire.
 *
 * Jamais un compteur de crédits (implicites), jamais « 0 » : une absence ne fait aucune phrase.
 */
export function SecondPassNotice({ scope }: { scope?: SecondPassScope | null }) {
  const { t } = useTranslation('discover')
  if (!scope) return null
  const remaining = remainingParts(scope, t)
  if (remaining.length === 0) return null
  const done = scope.shown ? t('secondPass.done', { count: scope.shown }) : null
  return (
    <p role="status" data-testid="second-pass-notice" className="text-xs" style={{ color: 'var(--text-secondary)' }}>
      {done ? <span>{done} </span> : null}
      <span>{t('secondPass.remaining', { parts: remaining.join(' · ') })}</span>
    </p>
  )
}

function remainingParts(scope: SecondPassScope, t: TFunction<'discover'>): string[] {
  const parts: string[] = []
  if (scope.listRemains) parts.push(t('secondPass.listRemains'))
  if (scope.employersRemain) {
    parts.push(
      t(scope.completing ? 'secondPass.employersChecking' : 'secondPass.employersRemain', {
        count: scope.employersRemain,
      }),
    )
  }
  return parts
}
