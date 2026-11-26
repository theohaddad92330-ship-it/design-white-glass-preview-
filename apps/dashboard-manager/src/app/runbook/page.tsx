import { getLang, makeT } from '@/lib/i18n'
import { LangToggle } from '@/app/monitoring/_components/lang-toggle'
import { RUNBOOK_ENTRIES } from './runbook.logic'
import { TourTrigger } from './_components/tour-trigger'

/**
 * #1678.3 — LE RUNBOOK OPÉRATEUR : une page, un lien accessible depuis toute
 * page (rail → section « Technique »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE PAGE N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Pas un doublon de `agent_docs/` : ces fichiers documentent le PRODUIT pour
 * qui code dessus. Cette page documente la CONSOLE pour qui l'opère — les
 * gestes de support qu'on refait chaque semaine, avec le lien direct vers
 * l'écran. Aucune procédure n'invente un geste qui n'existe pas déjà ailleurs
 * dans le manager : chaque carte RENVOIE vers un écran réel.
 */
export const dynamic = 'force-dynamic'

export default async function RunbookPage() {
  const lang = await getLang()
  const t = makeT(lang)

  return (
    <main className="wrap">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1>{t('rbTitle')}</h1>
          <p className="subtitle">{t('rbSubtitle')}</p>
        </div>
        <LangToggle lang={lang} />
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {RUNBOOK_ENTRIES.map(entry => (
          <section key={entry.id} className="card" style={{ padding: 16, display: 'grid', gap: 8 }}>
            <h2 style={{ fontSize: '1.125rem', margin: 0 }}>{t(entry.titleKey)}</h2>
            <p className="muted" style={{ margin: 0 }}>
              {t(entry.bodyKey)}
            </p>
            {entry.href ? (
              <a className="link" href={entry.href}>
                {t('rbGoToScreen')}
              </a>
            ) : null}
          </section>
        ))}

        {/* La visite guidée n'a pas de lien : elle se lance depuis ICI, en
            restant sur cette page — `TourTrigger` dispatche le même
            événement DOM que le bouton du rail. */}
        <section className="card" style={{ padding: 16, display: 'grid', gap: 8 }}>
          <h2 style={{ fontSize: '1.125rem', margin: 0 }}>{t('rbTourTitle')}</h2>
          <p className="muted" style={{ margin: 0 }}>
            {t('rbTourBody')}
          </p>
          <TourTrigger label={t('rbTourButton')} />
        </section>
      </div>
    </main>
  )
}
