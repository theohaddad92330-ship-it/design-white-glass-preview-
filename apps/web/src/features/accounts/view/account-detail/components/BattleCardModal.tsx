import type { Account } from '@bellum/contracts'
import { Logo, Skeleton } from '@bellum/ui'
import { motion } from 'framer-motion'
import { AlertTriangle, FileText, Loader2, Swords, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ModalPortal } from '@/components/overlay/ModalPortal'
import { accountsApi } from '@/features/accounts/api'
import type { BattlecardData } from '@/features/accounts/battlecard-compare.types'

interface BattleCardModalProps {
  account: Account
  onClose: () => void
}

/**
 * On-demand COMPETITIVE battle card for a meeting. Calls the JWT-authenticated
 * `/ia/battlecard` proxy → IA `/battlecard/generate` (ESN profile resolved
 * server-side; account fetched scoped to the caller). Present-only: the
 * "nous vs concurrents" block is populated ONLY from the ESN already identified
 * on the account — never a fabricated competitor.
 */
export function BattleCardModal({ account, onClose }: BattleCardModalProps) {
  const { t } = useTranslation('accounts')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [data, setData] = useState<BattlecardData | null>(null)
  const elapsed = useElapsedSeconds(loading)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(false)
    accountsApi
      .battlecard(account.id)
      .then(res => {
        if (!alive) return
        if (!res?.success) throw new Error('generation failed')
        setData(res.data ?? {})
      })
      .catch(err => {
        if (!alive) return
        console.error('[Battlecard]', err)
        setError(true)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [account.id])

  const vsCompetitors = (data?.vs_competitors ?? []).filter(c => typeof c?.competitor === 'string' && c.competitor)

  const handleCopy = () => {
    if (!data) return
    const lines: string[] = [t('battleCard.copyTitle', { company: account.company_name })]
    if (data.company_activity) lines.push('', t('battleCard.copyActivity', { activity: data.company_activity }))
    if (vsCompetitors.length > 0) {
      lines.push('', `${t('battleCard.vsCompetitors')} :`)
      vsCompetitors.forEach(c => lines.push(`- ${c.competitor} → ${c.our_counter_angle ?? ''}`))
    }
    if (data.killer_question) lines.push('', t('battleCard.killerQuestion'), data.killer_question)
    navigator.clipboard.writeText(lines.join('\n')).catch(() => {})
  }

  // Portail : l'onglet qui ouvre la fiche porte un `transform`, sur lequel `fixed`
  // s'ancrerait — la carte tombait alors hors écran et il ne restait que le fond flou.
  return (
    <ModalPortal>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-busy={loading}
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ duration: 0.25, ease: 'easeOut' as const }}
          className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <Swords className="h-4 w-4 text-[var(--bellum-text-accent)]" />
              <h2 className="text-base font-semibold text-[color:var(--text-primary)]">
                {t('battleCard.title', { company: account.company_name })}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {data && !loading ? (
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {t('common:actions.copy')}
                </button>
              ) : null}
              <button
                onClick={onClose}
                aria-label={t('common:actions.close')}
                className="flex h-8 w-8 items-center justify-center rounded-sm border border-[var(--border-subtle)] text-[var(--text-ghost)] hover:bg-[var(--bg-surface-hover)] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="p-6 space-y-4">
            {/* Transparence coût : génération par IA, sur données collectées seulement. */}
            <div className="flex items-center gap-2 text-xs text-[var(--text-ghost)]">
              <Logo className="size-3.5 text-[var(--bellum-text-accent)]" />
              {t('battleCard.aiNote')}
            </div>

            {loading ? (
              <GeneratingState elapsed={elapsed} />
            ) : error ? (
              <div className="flex items-center gap-2 py-10 justify-center text-sm text-[var(--danger-soft-text)]">
                <AlertTriangle className="h-4 w-4" />
                {t('battleCard.error')}
              </div>
            ) : (
              <>
                {!!data?.company_activity && (
                  <Block title={t('battleCard.activity')}>
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{data.company_activity}</p>
                    {data.budget_it_estimated ? (
                      <p className="mt-1 text-xs text-[var(--text-ghost)]">
                        {t('battleCard.budgetEstimated', { value: data.budget_it_estimated })}
                      </p>
                    ) : null}
                  </Block>
                )}

                {/* Cœur concurrentiel : nous vs les ESN identifiées sur le compte. */}
                {vsCompetitors.length > 0 && (
                  <Block title={t('battleCard.vsCompetitors')} accent="violet">
                    <ul className="space-y-2">
                      {vsCompetitors.map((c, i) => (
                        <li
                          key={`${c.competitor}-${i}`}
                          className="rounded-md bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-3"
                        >
                          <p className="text-sm font-semibold text-[color:var(--text-primary)]">{c.competitor}</p>
                          {c.their_strengths ? (
                            <p className="mt-1 text-xs text-[var(--success-soft-text)]">
                              {t('battleCard.theirStrengths', { value: c.their_strengths })}
                            </p>
                          ) : null}
                          {c.their_weaknesses ? (
                            <p className="mt-0.5 text-xs text-[var(--danger-soft-text)]">
                              {t('battleCard.theirWeaknesses', { value: c.their_weaknesses })}
                            </p>
                          ) : null}
                          {c.our_counter_angle ? (
                            <p className="mt-1 text-xs text-[var(--bellum-text-accent)]">
                              {t('battleCard.counterAngle', { value: c.our_counter_angle })}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </Block>
                )}

                {(data?.what_to_say?.length ?? 0) > 0 && (
                  <Block title={t('battleCard.whatToSay')} accent="violet">
                    <BulletList items={data?.what_to_say ?? []} dot="bg-violet-500" />
                  </Block>
                )}

                {(data?.what_NOT_to_say?.length ?? 0) > 0 && (
                  <Block title={t('battleCard.whatNotToSay')} accent="amber">
                    <BulletList items={data?.what_NOT_to_say ?? []} dot="bg-amber-500" />
                  </Block>
                )}

                {data?.probable_objection?.objection ? (
                  <Block title={t('battleCard.probableObjection')}>
                    <p className="text-sm font-medium text-[color:var(--text-primary)]">
                      {data.probable_objection.objection}
                    </p>
                    {data.probable_objection.response ? (
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {t('battleCard.objectionResponse', { value: data.probable_objection.response })}
                      </p>
                    ) : null}
                    {data.probable_objection.mirror_question ? (
                      <p className="mt-1 text-xs text-[var(--bellum-text-accent)]">
                        {t('battleCard.mirrorQuestion', { value: data.probable_objection.mirror_question })}
                      </p>
                    ) : null}
                  </Block>
                ) : null}

                {data?.killer_question ? (
                  <div className="rounded-lg p-4 border border-violet-500/20 bg-violet-500/5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--bellum-text-accent)] mb-1">
                      {t('battleCard.killerQuestion')}
                    </p>
                    <p className="text-sm text-[color:var(--text-primary)]">{data.killer_question}</p>
                  </div>
                ) : null}

                {!data?.company_activity && vsCompetitors.length === 0 && !data?.killer_question ? (
                  <p className="py-8 text-center text-sm text-[var(--text-ghost)]">{t('battleCard.empty')}</p>
                ) : null}
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </ModalPortal>
  )
}

/**
 * Temps écoulé depuis l'ouverture, en secondes. Il n'existe AUCUN avancement réel
 * à afficher — la fiche est un seul appel modèle, sans étapes remontées — donc on
 * montre ce qu'on sait vraiment (le temps qui passe) plutôt qu'un pourcentage
 * inventé qui donnerait une fausse idée de la fin.
 */
function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (!active) return
    setSeconds(0)
    const startedAt = Date.now()
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [active])

  return seconds
}

/**
 * Attente LISIBLE : la structure de la fiche à venir est dessinée, la barre est
 * indéterminée (aucun pourcentage : on ne le connaît pas) et le temps écoulé
 * avance. Un simple rond qui tourne sur un fond flou se lit comme une panne.
 */
function GeneratingState({ elapsed }: { elapsed: number }) {
  const { t } = useTranslation('accounts')
  const sections = [
    { title: t('battleCard.activity'), lines: 2 },
    { title: t('battleCard.vsCompetitors'), lines: 3 },
    { title: t('battleCard.whatToSay'), lines: 2 },
    { title: t('battleCard.killerQuestion'), lines: 1 },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-[color:var(--text-primary)]">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--bellum-text-accent)]" />
          {t('battleCard.generating')}
        </div>
        <span className="shrink-0 text-xs tabular-nums text-[var(--text-ghost)]">
          {t('battleCard.elapsed', { seconds: elapsed })}
        </span>
      </div>

      {/* Barre INDÉTERMINÉE : pas de `aria-valuenow`, rien à promettre sur la fin. */}
      <div
        role="progressbar"
        aria-busy="true"
        aria-label={t('battleCard.generating')}
        className="h-1 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)]"
      >
        <motion.div
          className="h-full w-1/3 rounded-full bg-violet-500"
          animate={{ x: ['-100%', '300%'] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
        />
      </div>

      <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{t('battleCard.generatingHint')}</p>

      <div className="space-y-4 pt-1">
        {sections.map(section => (
          <div key={section.title}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-ghost)]">
              {section.title}
            </p>
            <div className="space-y-1.5">
              {Array.from({ length: section.lines }).map((_, i) => (
                <Skeleton key={i} className="h-3 w-full bg-[var(--bg-elevated)] last:w-2/3" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Block({
  title,
  accent = 'ghost',
  children,
}: {
  title: string
  accent?: 'ghost' | 'violet' | 'amber'
  children: React.ReactNode
}) {
  const color =
    accent === 'violet'
      ? 'text-[var(--bellum-text-accent)]'
      : accent === 'amber'
        ? 'text-[var(--warning-soft-text)]'
        : 'text-[var(--text-ghost)]'
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wider ${color} mb-2`}>{title}</p>
      {children}
    </div>
  )
}

function BulletList({ items, dot }: { items: string[]; dot: string }) {
  return (
    <ul className="space-y-1.5">
      {items.slice(0, 4).map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
          {item}
        </li>
      ))}
    </ul>
  )
}
