import { useTranslation } from 'react-i18next'
import { BookOpen, X } from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  « Expliquer la méthode » (maquette p.20, carte de droite).          */
/*                                                                     */
/*  Trois étapes, et rien qui ne soit vrai du produit tel qu'il tourne :*/
/*  le profil ESN pondère bien le score côté serveur, les signaux       */
/*  portent bien leur date et leur source, le barème a bien cinq blocs  */
/*  dont un non mesurable sort du dénominateur. Une page « méthode »    */
/*  qui décrirait un moteur qu'on n'a pas serait pire que pas de page.  */
/* ------------------------------------------------------------------ */

const STEPS = ['profile', 'market', 'score'] as const

export function DiscoverMethod({ onClose }: { onClose?: () => void }) {
  const { t } = useTranslation('discover')

  return (
    <section
      className="rounded-xl p-4"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[color:var(--text-primary)]">
          <BookOpen className="h-[14px] w-[14px]" style={{ color: 'var(--accent-soft-text)' }} />
          {t('method.title')}
        </h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t('method.close')}
            className="rounded-sm p-1 transition-colors hover:bg-[color:var(--bg-surface-hover)]"
            style={{ color: 'var(--text-ghost)' }}
          >
            <X className="h-[13px] w-[13px]" />
          </button>
        )}
      </div>

      <ol className="space-y-3">
        {STEPS.map((step, index) => (
          <li key={step} className="flex gap-2.5">
            <span
              className="mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-xs font-semibold"
              style={{ background: 'var(--accent-soft-bg)', color: 'var(--accent-soft-text)' }}
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-[color:var(--text-primary)]">{t(`method.${step}.title`)}</p>
              <p className="mt-0.5 text-xs leading-snug" style={{ color: 'var(--text-muted)' }}>
                {t(`method.${step}.body`)}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <p
        className="mt-3 border-t pt-2.5 text-xs"
        style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-ghost)' }}
      >
        {t('method.footer')}
      </p>
    </section>
  )
}
