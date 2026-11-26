import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { useMessageLearningSummary } from '@/features/message-style/hooks/useMessageStyle'

/**
 * #2877 (recette prod 02/10) — l'écran agrégat d'apprentissage des messages.
 * Des COMPTES lus sur l'espace : jamais un taux, jamais un message lu. Un bloc
 * sans échantillon ne fait AUCUNE ligne (on n'affiche pas ce qu'on n'a pas) ;
 * le délai médian absent se DIT « non mesuré », jamais « 0 h ». La règle
 * proposée l'est seulement : rien ne s'applique sans accord (#2385.11).
 * Section de l'onglet « Mémoire de style », même carte que ses voisines.
 */
export function MessageLearningSummary() {
  const { t } = useTranslation('knowledge')
  const query = useMessageLearningSummary()
  const summary = query.data

  const blocks: { key: string; title: string; lines: string[] }[] = []
  if (summary?.express) {
    const e = summary.express
    blocks.push({
      key: 'express',
      title: t('style.learning.express.title'),
      lines: [
        t('style.learning.express.approvedWithoutEdit', { count: e.approvedWithoutEdit }),
        t('style.learning.express.approvedAfterEdit', { count: e.approvedAfterEdit }),
        t('style.learning.express.rejected', { count: e.rejected }),
      ],
    })
  }
  if (summary?.behavioral) {
    const b = summary.behavioral
    blocks.push({
      key: 'behavioral',
      title: t('style.learning.behavioral.title'),
      lines: [
        t('style.learning.behavioral.sent', { count: b.sent }),
        t('style.learning.behavioral.replied', { count: b.replied }),
        t('style.learning.behavioral.meetingBooked', { count: b.meetingBooked }),
        t('style.learning.behavioral.optOut', { count: b.optOut }),
        t('style.learning.behavioral.bounced', { count: b.bounced }),
        b.medianReplyDelayHours === null
          ? t('style.learning.behavioral.medianDelayUnmeasured')
          : t('style.learning.behavioral.medianDelay', { hours: Math.round(b.medianReplyDelayHours) }),
      ],
    })
  }
  if (summary?.quality) {
    const q = summary.quality
    blocks.push({
      key: 'quality',
      title: t('style.learning.quality.title'),
      lines: [
        ...(q.wrongFact > 0 ? [t('style.learning.quality.wrongFact', { count: q.wrongFact })] : []),
        ...(q.wrongCta > 0 ? [t('style.learning.quality.wrongCta', { count: q.wrongCta })] : []),
        ...(q.wrongPersona > 0 ? [t('style.learning.quality.wrongPersona', { count: q.wrongPersona })] : []),
      ],
    })
  }
  const history = summary?.history ?? []
  const isEmpty =
    !!summary && blocks.length === 0 && !summary.proposedRule && !summary.globalRule && history.length === 0

  return (
    <section data-testid="message-learning-summary">
      <h3 className="text-sm font-semibold text-[color:var(--text-primary)] mb-1">{t('style.learning.title')}</h3>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        {t('style.learning.subtitle')}
      </p>
      {query.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--text-ghost)' }} />
        </div>
      ) : query.isError ? (
        <p className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          {t('style.learning.errorState')}
        </p>
      ) : isEmpty ? (
        <p className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          {t('style.learning.empty')}
        </p>
      ) : (
        <div className="space-y-3">
          {blocks.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {blocks.map(block => (
                <div
                  key={block.key}
                  className="rounded-xl p-4 flex flex-col gap-1"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
                >
                  <p className="text-sm font-medium text-[color:var(--text-primary)]">{block.title}</p>
                  {block.lines.map(line => (
                    <p key={line} className="text-xs" style={{ color: 'var(--text-ghost)' }}>
                      {line}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )}
          <div
            className="rounded-xl p-4 flex flex-col gap-1"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
          >
            <p className="text-sm font-medium text-[color:var(--text-primary)]">{t('style.learning.rule.title')}</p>
            {summary?.proposedRule ? (
              <>
                <p className="text-sm text-[color:var(--text-primary)]">{summary.proposedRule.summary}</p>
                <p className="text-xs" style={{ color: 'var(--text-ghost)' }}>
                  {t('style.learning.rule.basedOn', { count: summary.proposedRule.basedOnSample })}
                </p>
              </>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-ghost)' }}>
                {t('style.learning.rule.none')}
              </p>
            )}
            {history.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1" aria-label={t('style.learning.history.title')}>
                {history.map(snapshot => (
                  <li key={snapshot.version} className="text-xs" style={{ color: 'var(--text-ghost)' }}>
                    {t('style.learning.history.version', { version: snapshot.version })} ·{' '}
                    {t(`style.learning.status.${snapshot.status}`)} · {snapshot.summary}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {summary?.globalRule && (
            // #2877.1 — le niveau GLOBAL (Louis 11/10/2026) : base commune anonymisée, une absence ne fait aucune ligne.
            <div
              data-testid="message-learning-global-rule"
              className="rounded-xl p-4 flex flex-col gap-1"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
            >
              <p className="text-sm font-medium text-[color:var(--text-primary)]">
                {t('style.learning.globalRule.title')}
              </p>
              <p className="text-sm text-[color:var(--text-primary)]">{summary.globalRule.summary}</p>
              <p className="text-xs" style={{ color: 'var(--text-ghost)' }}>
                {t('style.learning.globalRule.basedOn', { count: summary.globalRule.basedOnSample })}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
