import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ReportContext } from './reportContext'

type ReportPreviewProps = {
  report: ReportContext
  email: string | null
  /** La capture et l'élément pointé — ils ont leur propre rendu, posé en tête de l'aperçu. */
  children?: ReactNode
}

/**
 * #1960.7 — « CE QUI SERA ENVOYÉ », AVANT L'ENVOI.
 *
 * Chaque ligne dit une chose qui part avec le message ; quand il y a un contenu,
 * il se déplie et se LIT tel qu'il partira — pas une description rassurante.
 * Une ligne vide dit « aucun », jamais « 0 » : un tampon vide est vraiment vide,
 * mais « 0 appel » se lirait comme une mesure.
 *
 * Aucun conteneur défilant ici : c'est le dialogue qui défile (jamais deux
 * défilements imbriqués).
 */
export function ReportPreview({ report, email, children }: ReportPreviewProps) {
  const { t } = useTranslation('feedback')
  const { networkFailures, breadcrumbs, consoleLogs, errorLogs, appContext, userAgent, pageUrl } = report

  return (
    <section
      aria-label={t('preview.title')}
      className="space-y-2 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3 text-xs text-[var(--bellum-text-secondary)]"
    >
      <div>
        <p className="font-semibold text-[var(--bellum-text-primary)]">{t('preview.title')}</p>
        <p>{t('preview.intro')}</p>
      </div>
      {children}
      <ul className="space-y-1">
        <li className="break-all">{email ? t('preview.email', { email }) : t('preview.emailNone')}</li>
        <li className="break-all">{t('preview.page', { page: pageUrl })}</li>
        <PreviewItem
          label={
            networkFailures.length ? t('preview.network', { count: networkFailures.length }) : t('preview.networkNone')
          }
          detail={networkFailures
            .map(failure => {
              const outcome = failure.status ?? failure.error ?? '—'
              const correlation = failure.correlationId ? ` · ${failure.correlationId}` : ''
              return `${failure.method} ${failure.url} → ${outcome} (${failure.durationMs} ms)${correlation}`
            })
            .join('\n')}
        />
        <PreviewItem
          label={
            breadcrumbs.length ? t('preview.breadcrumbs', { count: breadcrumbs.length }) : t('preview.breadcrumbsNone')
          }
          detail={breadcrumbs.map(crumb => `${crumb.time} · ${crumb.label}`).join('\n')}
        />
        <PreviewItem label={consoleLogs ? t('preview.console') : t('preview.consoleNone')} detail={consoleLogs ?? ''} />
        <PreviewItem label={errorLogs ? t('preview.errors') : t('preview.errorsNone')} detail={errorLogs ?? ''} />
        <PreviewItem
          label={t('preview.environment')}
          detail={[
            userAgent,
            `${appContext.buildVersion} (${appContext.environment})`,
            [appContext.route, appContext.theme, appContext.language, appContext.timeZone, appContext.viewport].join(
              ' · ',
            ),
            appContext.online ? t('preview.online') : t('preview.offline'),
          ].join('\n')}
        />
      </ul>
    </section>
  )
}

function PreviewItem({ label, detail }: { label: string; detail: string }) {
  if (!detail) return <li>{label}</li>
  return (
    <li>
      <details>
        <summary className="cursor-pointer text-[var(--bellum-text-primary)]">{label}</summary>
        <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-xs">{detail}</pre>
      </details>
    </li>
  )
}
