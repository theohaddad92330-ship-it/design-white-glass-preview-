import type { Contact, HierarchyLevel, MessageDraftVersionItem } from '@bellum/contracts'
import { toastCallTaskCreated, useOpenCallTasks } from '@/features/outreach/lib/openCallTasks'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { callTaskFields } from '@/features/accounts/view/account-detail/components/contact-engagement/EngagementCreateCallTask'
import { PreSendChecklist } from '@/features/accounts/view/account-detail/components/contact-engagement/PreSendChecklist'
import { outreachMessagesApi } from '@/features/outreach/api'
import type { MessageInsight } from '@/lib/message-insight'
import { effectiveContent } from './approach-api'
import { groupEvidence, sameDraftContent, type DraftContent } from './approach-model'

const SECTION = 'space-y-1.5'
const LABEL = 'text-xs font-medium uppercase tracking-wide text-[var(--bellum-text-muted)]'

/** Théo C6.N3 — « Voir la preuve » : ce que Laura a RÉELLEMENT cité, jamais une source reconstituée. */
export function ProofDialog({
  open,
  onOpenChange,
  insight,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  insight: MessageInsight
}) {
  const { t } = useTranslation('engagement')
  const groups = groupEvidence(insight)
  const sections = [
    { id: 'observed', label: t('approachPage.proof.observed'), items: groups.observed },
    { id: 'history', label: t('approachPage.proof.history'), items: groups.history },
    { id: 'esn', label: t('approachPage.proof.esn'), items: groups.esn },
  ].filter(section => section.items.length > 0)
  const empty = sections.length === 0 && !groups.interpretation

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('approachPage.proof.close')} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('approachPage.proof.title')}</DialogTitle>
          <DialogDescription>{t('approachPage.proof.description')}</DialogDescription>
        </DialogHeader>
        {empty ? (
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('approachPage.proof.empty')}
          </Text>
        ) : (
          <div className="space-y-4">
            {sections.map(section => (
              <section key={section.id} className={SECTION} aria-label={section.label}>
                <h3 className={LABEL}>{section.label}</h3>
                <ul className="space-y-1">
                  {section.items.map(item => (
                    <li key={`${item.kind}-${item.value}`} className="text-sm text-[var(--bellum-text-primary)]">
                      {item.value}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {groups.interpretation ? (
              <section className={SECTION} aria-label={t('approachPage.proof.interpretation')}>
                <h3 className={LABEL}>{t('approachPage.proof.interpretation')}</h3>
                <p className="text-sm text-[var(--bellum-text-primary)]">{groups.interpretation}</p>
              </section>
            ) : null}
          </div>
        )}
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('approachPage.proof.disclaimer')}
        </Text>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('approachPage.proof.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Théo C6.N2 — « Relire avant de valider ». Le contrôle avant envoi chiffré (C6.A9) vit ICI. Valider ne déclenche
 * aucun envoi et se lie à cette version : modifier le texte demande une nouvelle relecture.
 */
export function ValidateDialog({
  open,
  onOpenChange,
  to,
  from,
  draft,
  insight,
  checklist,
  pending,
  failed,
  onValidate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  to: string
  from: string | null
  draft: DraftContent
  insight: MessageInsight
  checklist: { hierarchyLevel: HierarchyLevel | null; step: number; daysSincePrevious: number | null }
  pending: boolean
  failed: boolean
  onValidate: () => void
}) {
  const { t } = useTranslation('engagement')
  const [checked, setChecked] = useState(false)

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (pending) return
        if (!next) setChecked(false)
        onOpenChange(next)
      }}
    >
      <DialogContent closeLabel={t('approachPage.proof.close')} className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('approachPage.validate.title')}</DialogTitle>
          <DialogDescription>{t('approachPage.validate.description')}</DialogDescription>
        </DialogHeader>
        <dl className="space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-[var(--bellum-text-muted)]">{t('approachPage.validate.to')}</dt>
            <dd className="min-w-0 break-words text-[var(--bellum-text-primary)]">{to}</dd>
          </div>
          {from ? (
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-[var(--bellum-text-muted)]">{t('approachPage.validate.from')}</dt>
              <dd className="min-w-0 break-words text-[var(--bellum-text-primary)]">{from}</dd>
            </div>
          ) : null}
        </dl>
        <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3">
          {draft.subject ? (
            <p className="text-sm font-medium text-[var(--bellum-text-primary)]">{draft.subject}</p>
          ) : null}
          <p className="whitespace-pre-line break-words text-sm leading-6 text-[var(--bellum-text-primary)]">
            {draft.body}
          </p>
        </div>
        <section aria-label={t('approachPage.validate.checklist')}>
          <PreSendChecklist
            body={draft.body}
            subject={draft.subject}
            hierarchyLevel={checklist.hierarchyLevel}
            step={checklist.step}
            daysSincePrevious={checklist.daysSincePrevious}
            realContext={insight.specificity?.elements?.map(element => element.value) ?? null}
          />
        </section>
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('approachPage.validate.scope')}
        </Text>
        <label className="flex min-h-11 cursor-pointer items-start gap-2 text-sm text-[var(--bellum-text-primary)]">
          <input
            type="checkbox"
            className="mt-1 size-4"
            checked={checked}
            onChange={event => setChecked(event.target.checked)}
          />
          <span>{t('approachPage.validate.confirm')}</span>
        </label>
        {failed ? (
          <p role="alert" className="text-sm text-[var(--danger-soft-text)]">
            {t('approachPage.validate.failed')}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            {t('approachPage.validate.back')}
          </Button>
          <Button disabled={!checked || pending} onClick={onValidate}>
            {pending ? t('approachPage.validate.submitting') : t('approachPage.validate.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Le texte tel que le moteur l'a généré (jamais la correction du commercial) — « Revenir à la version générée ». */
function effectiveGenerated(item: MessageDraftVersionItem): DraftContent {
  return { subject: item.subject ?? '', body: item.body }
}

/** Théo C6.A11 — les versions du brouillon, et la reprise de l'une d'elles. Aucune n'est effacée. */
export function VersionsDialog({
  open,
  onOpenChange,
  items,
  current,
  onResume,
  formatDate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: MessageDraftVersionItem[]
  current: DraftContent
  onResume: (content: DraftContent) => void
  formatDate: (iso: string) => string
}) {
  const { t } = useTranslation('engagement')
  const rows = [...items].reverse()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('approachPage.versions.close')} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('approachPage.versions.title')}</DialogTitle>
          <DialogDescription>{t('approachPage.versions.description')}</DialogDescription>
        </DialogHeader>
        {rows.length === 0 ? (
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('approachPage.versions.empty')}
          </Text>
        ) : (
          <ol className="max-h-80 space-y-2 overflow-y-auto">
            {rows.map((item, index) => {
              const content = effectiveContent(item)
              const number = rows.length - index
              const isCurrent = sameDraftContent(content, current)
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--bellum-border)] p-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--bellum-text-primary)]">
                      {t('approachPage.versions.version')} {number}
                      {isCurrent ? ` · ${t('approachPage.versions.current')}` : ''}
                      {item.validatedAt ? ` · ${t('approachPage.versions.validated')}` : ''}
                    </p>
                    <p className="text-xs text-[var(--bellum-text-muted)]">
                      {item.editedBody !== null ? t('approachPage.versions.you') : t('approachPage.versions.laura')} ·{' '}
                      {formatDate(item.createdAt)}
                    </p>
                  </div>
                  {isCurrent ? null : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        onResume(content)
                        onOpenChange(false)
                      }}
                    >
                      {t('approachPage.versions.resume')}
                    </Button>
                  )}
                </li>
              )
            })}
          </ol>
        )}
        <DialogFooter>
          {rows.length > 1 ? (
            <Button
              variant="ghost"
              onClick={() => {
                const generated = rows[rows.length - 1]
                if (generated) onResume(effectiveGenerated(generated))
                onOpenChange(false)
              }}
            >
              {t('approachPage.versions.backToGenerated')}
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('approachPage.versions.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Théo C7.A1 — « Planifier cet appel » : le support rejoint les « appels à passer » avec un jour et une heure. Le
 * copilote ne passe pas l'appel et n'envoie rien : il prépare, le commercial planifie.
 */
export function PlanCallDialog({
  open,
  onOpenChange,
  contact,
  script,
  rationale,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  contact: Contact
  script: string
  rationale?: string | null
}) {
  const { t } = useTranslation('engagement')
  const queryClient = useQueryClient()
  const openCallTasks = useOpenCallTasks()
  const [day, setDay] = useState('')
  const [hour, setHour] = useState('09:00')
  // #4962 — raison/objectif viennent du script s'il est rédigé ; sinon (ou en les retouchant) le commercial les saisit.
  const derived = callTaskFields(script, rationale)
  const [typedReason, setTypedReason] = useState<string | null>(null)
  const [typedObjective, setTypedObjective] = useState<string | null>(null)
  const reason = (typedReason ?? derived.reason ?? '').trim()
  const objective = (typedObjective ?? derived.objective ?? '').trim()
  const scheduledAt = day ? new Date(`${day}T${hour || '09:00'}`) : null
  const validDate = scheduledAt !== null && !Number.isNaN(scheduledAt.getTime())

  const create = useMutation({
    mutationFn: () =>
      outreachMessagesApi.createCall({
        contact_id: contact.id,
        source: 'contacts',
        reason,
        objective,
        pitch: script.trim().slice(0, 2000),
        expected_outcome: objective,
        ...(validDate && scheduledAt ? { scheduled_at: scheduledAt.toISOString() } : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['outreach', 'call-tasks'] })
      toastCallTaskCreated(openCallTasks)
      onOpenChange(false)
    },
    onError: () => toast.error(t('callTask.createError')),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('approachPage.call.plan.close')} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('approachPage.call.plan.title')}</DialogTitle>
          <DialogDescription>{t('approachPage.call.plan.description')}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className={LABEL}>{t('approachPage.call.plan.day')}</span>
            <input
              type="date"
              value={day}
              onChange={event => setDay(event.target.value)}
              className="min-h-11 w-full rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 text-sm text-[var(--bellum-text-primary)]"
            />
          </label>
          <label className="space-y-1">
            <span className={LABEL}>{t('approachPage.call.plan.hour')}</span>
            <input
              type="time"
              value={hour}
              onChange={event => setHour(event.target.value)}
              className="min-h-11 w-full rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 text-sm text-[var(--bellum-text-primary)]"
            />
          </label>
          <label className="col-span-2 space-y-1">
            <span className={LABEL}>{t('approachPage.call.plan.reason')}</span>
            <input
              type="text"
              value={typedReason ?? derived.reason ?? ''}
              onChange={event => setTypedReason(event.target.value)}
              className="min-h-11 w-full rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 text-sm text-[var(--bellum-text-primary)]"
            />
          </label>
          <label className="col-span-2 space-y-1">
            <span className={LABEL}>{t('approachPage.call.plan.objective')}</span>
            <input
              type="text"
              value={typedObjective ?? derived.objective ?? ''}
              onChange={event => setTypedObjective(event.target.value)}
              className="min-h-11 w-full rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 text-sm text-[var(--bellum-text-primary)]"
            />
          </label>
        </div>
        {!reason || !objective ? (
          <p className="text-sm text-[var(--bellum-text-muted)]">{t('approachPage.call.plan.needsScript')}</p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('approachPage.call.plan.cancel')}
          </Button>
          <Button disabled={!reason || !objective || create.isPending} onClick={() => create.mutate()}>
            {t('callTask.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
