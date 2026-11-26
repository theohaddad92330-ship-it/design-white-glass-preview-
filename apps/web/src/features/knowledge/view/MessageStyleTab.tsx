import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { BarChart3, Check, Loader2, X } from 'lucide-react'
import {
  checkMessageStyleTemplateTransition,
  hasPermission,
  MESSAGE_STYLE_TEMPLATE_STATUSES,
  type MessageStyleRuleProposalDecision,
  type MessageStyleTemplate,
  type MessageStyleTemplateStatus,
} from '@bellum/contracts'
import { useTeam } from '@/features/team/hooks/useTeam'
import {
  useDecideMessageStyleRuleProposal,
  useMessageStyleRuleProposals,
  useMessageStyleTemplates,
  useMessageStyleUsage,
  useTransitionMessageStyleTemplate,
} from '@/features/message-style/hooks/useMessageStyle'
import { MessageLearningSummary } from './MessageLearningSummary'
import { MessageStyleCreateForm } from './MessageStyleCreateForm'
import { MessageStylePreviewCompare } from './MessageStylePreviewCompare'

/** #2369.11 — seuls ces canaux génèrent un exemple réel (`message-style.service.ts`, même liste). */
const PREVIEW_SUPPORTED_CHANNELS: ReadonlySet<string> = new Set(['email', 'linkedin', 'phone'])

/** #2369.12 — `null` (dénominateur vide) affiche « — », JAMAIS `0 %` (GA-18/19). Un vrai 0 % reste `0 %`. */
function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)} %`
}

/**
 * #2369.14 (épopée #2768) — LE NO-GO : « Laura affirme avoir appris le style
 * sans montrer les règles extraites ni permettre de les corriger ».
 *
 * Deux sections, lecture puis correction :
 *  - les templates (#2369.9/.10) — ce que Laura dit avoir appris, avec leur
 *    statut de cycle de vie, jamais un « 0 » quand une liste est vide
 *    (GA-18/19 : une absence ne fait aucune ligne) ;
 *  - les propositions de règle (#2369.7/.8/.13) — CHACUNE `pending` peut être
 *    adoptée ou refusée ici, le geste humain que le NO-GO exige. Une
 *    proposition déjà décidée reste visible, avec sa décision, jamais
 *    retirée (on archive, on ne supprime pas).
 *
 * Import (#2369.2/.3), analyse préalable (#2369.4) et restitution « je
 * conserve / je ne reproduis pas / je propose » (#2369.5) vivent dans
 * `MessageStyleImportTab`, rendu juste avant ce composant dans le même
 * onglet « Mémoire de style » (`Knowledge.tsx`) — les deux sont désormais
 * intégrés sur la même branche.
 *
 * #2369.1 — un style cohérent par workspace sans figer une seule personne
 * tient déjà dans le MODÈLE (`message-style.service.ts`) : une proposition
 * naît toujours `pending`, jamais adoptée par sa seule création (#2369.7), et
 * l'adopter demande `team:manage` — un geste d'ÉQUIPE, jamais l'auteur seul de
 * l'import qui l'a fait naître. Ce composant rend ce mécanisme VISIBLE en
 * masquant les deux boutons de décision à qui n'a pas ce droit.
 */
export function MessageStyleTab() {
  const { t } = useTranslation('knowledge')
  const { team } = useTeam()
  const canDecide = team ? hasPermission(team.workspace.role, 'team:manage') : false
  const templatesQuery = useMessageStyleTemplates()
  const proposalsQuery = useMessageStyleRuleProposals()
  const usageQuery = useMessageStyleUsage()
  const decide = useDecideMessageStyleRuleProposal()
  const transition = useTransitionMessageStyleTemplate()
  // #2204.77 — la route de transition demande `records:write` (message-style.controller.ts).
  const canTransition = team ? hasPermission(team.workspace.role, 'records:write') : false
  const [comparing, setComparing] = useState<MessageStyleTemplate | null>(null)

  const templates = templatesQuery.data ?? []
  const proposals = proposalsQuery.data ?? []
  const usage = usageQuery.data ?? []

  const handleDecide = useCallback(
    async (id: string, decision: MessageStyleRuleProposalDecision) => {
      try {
        await decide.mutateAsync({ id, decision })
        toast.success(decision === 'adopted' ? t('style.toast.adopted') : t('style.toast.rejected'))
      } catch (err) {
        console.error('[MessageStyleTab]', err)
        toast.error(t('style.toast.decideFailed'))
      }
    },
    [decide, t],
  )

  const handleTransition = useCallback(
    async (id: string, to: MessageStyleTemplateStatus) => {
      try {
        await transition.mutateAsync({ id, to })
        toast.success(t('style.toast.transitioned', { status: t(`style.status.${to}`) }))
      } catch (err) {
        console.error('[MessageStyleTab]', err)
        toast.error(t('style.toast.transitionFailed'))
      }
    },
    [transition, t],
  )

  return (
    <div className="space-y-8">
      <MessageLearningSummary />

      <section>
        <h3 className="text-sm font-semibold text-[color:var(--text-primary)] mb-1">{t('style.templates.title')}</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          {t('style.templates.subtitle')}
        </p>
        {/* #2204.59-.65 — créer un style sans import, même droit que la transition (`records:write`). */}
        {canTransition && (
          <div className="mb-4">
            <MessageStyleCreateForm />
          </div>
        )}
        {templatesQuery.isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--text-ghost)' }} />
          </div>
        ) : templatesQuery.isError ? (
          <p className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            {t('style.templates.errorState')}
          </p>
        ) : templates.length === 0 ? (
          <p className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            {t('style.templates.empty')}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {templates.map(template => (
              <div
                key={template.id}
                className="rounded-xl p-4 flex flex-col gap-2"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-[color:var(--text-primary)]">{template.objective}</p>
                  <span
                    className="shrink-0 text-xs px-2 py-0.5 rounded-full"
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {t(`style.status.${template.status}`)}
                  </span>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-ghost)' }}>
                  {t('style.templates.persona', { persona: template.persona })}
                </p>
                {template.forbidden.length > 0 && (
                  <p className="text-xs" style={{ color: 'var(--text-ghost)' }}>
                    {t('style.templates.forbidden', { list: template.forbidden.join(', ') })}
                  </p>
                )}
                {/* #2947 (#2204.60/.61/.63) — un champ non déclaré ne fait AUCUNE ligne. */}
                {(['pitch', 'tone', 'signature'] as const).map(key => {
                  const value = template[key]
                  return value ? (
                    <p key={key} className="text-xs" style={{ color: 'var(--text-ghost)' }}>
                      {t(`style.templates.${key}`, { [key]: value })}
                    </p>
                  ) : null
                })}
                <p className="text-xs" style={{ color: 'var(--text-ghost)' }}>
                  {t('style.templates.version', { version: template.version })}
                </p>
                {(() => {
                  const stats = usage.find(u => u.templateId === template.id && u.templateVersion === template.version)
                  return (
                    <p className="text-xs" style={{ color: 'var(--text-ghost)' }}>
                      {stats
                        ? t('style.templates.usage', {
                            modification: formatRate(stats.modificationRate),
                            validation: formatRate(stats.validationRate),
                            response: formatRate(stats.responseRate),
                            unsubscribe: formatRate(stats.unsubscribeRate),
                          })
                        : t('style.templates.usageUnmeasured')}
                    </p>
                  )
                })()}
                {canTransition && (
                  <div className="flex flex-wrap gap-2">
                    {/* #2204.77 — seules les transitions que la machine PURE (#2369.10) permet sont offertes. */}
                    {MESSAGE_STYLE_TEMPLATE_STATUSES.filter(
                      to => checkMessageStyleTemplateTransition(template.status, to).ok,
                    ).map(to => (
                      <button
                        key={to}
                        type="button"
                        onClick={() => handleTransition(template.id, to)}
                        disabled={transition.isPending}
                        className="flex h-11 items-center px-3 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
                        style={{
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {t(`style.transition.${template.status}.${to}`)}
                      </button>
                    ))}
                  </div>
                )}
                {PREVIEW_SUPPORTED_CHANNELS.has(template.channel) && (
                  <button
                    type="button"
                    onClick={() => setComparing(comparing?.id === template.id ? null : template)}
                    className="flex h-11 items-center gap-1.5 self-start px-2 -mx-2 rounded-md text-xs font-medium transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    {t('style.preview.compareButton')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {comparing && <MessageStylePreviewCompare template={comparing} onClose={() => setComparing(null)} />}
      </section>

      <section>
        <h3 className="text-sm font-semibold text-[color:var(--text-primary)] mb-1">{t('style.proposals.title')}</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          {t('style.proposals.subtitle')}
        </p>
        {proposalsQuery.isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--text-ghost)' }} />
          </div>
        ) : proposalsQuery.isError ? (
          <p className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            {t('style.proposals.errorState')}
          </p>
        ) : proposals.length === 0 ? (
          <p className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            {t('style.proposals.empty')}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {proposals.map(proposal => (
              <div
                key={proposal.id}
                className="rounded-xl p-4 flex items-center justify-between gap-3"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
              >
                <div className="min-w-0">
                  <p className="text-sm text-[color:var(--text-primary)]">{proposal.observation}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-ghost)' }}>
                    {t(`style.signal.${proposal.signal}`)} · {t(`style.status.${proposal.status}`)}
                  </p>
                </div>
                {proposal.status === 'pending' && canDecide && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleDecide(proposal.id, 'adopted')}
                      disabled={decide.isPending}
                      aria-label={t('style.proposals.adoptAria')}
                      className="flex h-11 items-center gap-1.5 px-3 rounded-md text-xs font-medium text-white transition-opacity disabled:opacity-50"
                      style={{ background: 'var(--violet-gradient)' }}
                    >
                      <Check className="h-3.5 w-3.5" />
                      {t('style.proposals.adopt')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDecide(proposal.id, 'rejected')}
                      disabled={decide.isPending}
                      aria-label={t('style.proposals.rejectAria')}
                      className="flex h-11 items-center gap-1.5 px-3 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
                      style={{
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                      {t('style.proposals.reject')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
