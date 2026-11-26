import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { PendingChatAction } from '@bellum/contracts'
import type { ChatScope } from '@/features/chat/scope/chat-scope'
import { Box, Button, Text, cn } from '@bellum/ui'

/**
 * #2376 (LAU-FINAL-091) — LA CARTE DE BRIEF D'APPEL.
 *
 * Elle LIT ce que `prepare_cold_call` a compilé et ne recompose rien : une
 * section absente (contexte non connu) ne fait AUCUNE ligne — on n'affiche
 * pas ce qu'on n'a pas. Les sept branches de traitement d'objection sont du
 * texte de RÉFÉRENCE (i18n), génériques par nature : elles ne dépendent
 * d'aucun champ de `action`, donc elles ne voyagent pas depuis l'IA.
 *
 * ⚠️ MODE LIVE (#2376 §MODE LIVE) — ce que cette carte a le droit de faire
 * pendant l'appel, et rien d'autre : la question suivante, une checklist
 * cochable (état LOCAL, comme `MeetingLiveView`), des notes, un minuteur, les
 * faits à vérifier. AUCUN micro ici : la garde
 * `apps/web/src/architecture/voice-never-records-a-meeting.test.ts` réserve
 * l'unique enregistreur de l'application à `useVoiceMode.ts` — en ouvrir un
 * second ici casserait cette garde. Le contenu du mode live est CALCULÉ UNE
 * FOIS à l'activation (jamais régénéré toutes les dix secondes), et rien n'y
 * parle tout seul.
 */

const BRANCH_KEYS = ['wrongRole', 'notNow', 'interest', 'refusal', 'noNeed', 'referral', 'voicemail'] as const

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
        {title}
      </Text>
      {children}
    </section>
  )
}

function elapsedLabel(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function CallBriefCard({
  action,
  scope,
  onOpenScope,
}: {
  action: Extract<PendingChatAction, { action: 'prepare_cold_call' }>
  /** #4977.1 — le cadre du fil : une offre d'emploi au cadre est le point de départ du script. */
  scope?: ChatScope
  /** Ouvre le sélecteur du fil, où l'offre se lit et se change. */
  onOpenScope?: () => void
}) {
  const { t } = useTranslation('chat')
  const [live, setLive] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [asked, setAsked] = useState<ReadonlySet<number>>(new Set())
  const [notes, setNotes] = useState('')

  // Un minuteur VISUEL, jamais une écoute : il compte depuis l'activation du
  // mode live, sans rien lire ni enregistrer.
  useEffect(() => {
    if (!live) return
    const id = window.setInterval(() => setSeconds(s => s + 1), 1000)
    return () => window.clearInterval(id)
  }, [live])

  const toggleLive = () => {
    setLive(v => !v)
    setSeconds(0)
  }

  const toggleAsked = (index: number) =>
    setAsked(previous => {
      const next = new Set(previous)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })

  const checklist = [action.opening_question, ...action.next_questions]
  const factsToVerify = [action.objection, action.context].filter((value): value is string => Boolean(value))

  return (
    <Box className="space-y-3 rounded-xl border border-[var(--bellum-border)] p-4" data-testid="call-brief-card">
      <Box className="space-y-1">
        <Text element="h3" size="sm" weight="semibold">
          {action.contact_title
            ? t('callBrief.identityWithTitle', { name: action.contact_name, title: action.contact_title })
            : action.contact_name}
        </Text>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {action.organization_name}
        </Text>
      </Box>

      {/* #4977.1 — l'offre qui a déclenché l'approche ouvre le script et s'OUVRE depuis là. Pas d'offre au cadre = AUCUNE
          ligne : le script reste général, jamais une offre inventée. */}
      {scope?.kind === 'job_offer' ? (
        <Box data-testid="call-brief-offer" className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Text size="sm">
            <span className="text-[var(--bellum-text-muted)]">{t('callBrief.offerStart')} : </span>
            <span className="font-medium">{scope.label ?? t('callBrief.offerUnnamed')}</span>
          </Text>
          {onOpenScope ? (
            <Button type="button" variant="ghost" size="sm" onClick={onOpenScope}>
              {t('callBrief.openOffer')}
            </Button>
          ) : null}
        </Box>
      ) : null}

      {action.context ? (
        <Section title={t('callBrief.section.context')}>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {action.context}
          </Text>
        </Section>
      ) : null}

      <Section title={t('callBrief.section.reason')}>
        <Text size="sm">{action.reason}</Text>
      </Section>

      <Section title={t('callBrief.section.objective')}>
        <Text size="sm">{action.objective}</Text>
      </Section>

      <Section title={t('callBrief.section.opening')}>
        <Text size="sm" weight="medium">
          {action.opening_question}
        </Text>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('callBrief.openingFrameNotice')}
        </Text>
      </Section>

      <Section title={t('callBrief.section.nextQuestions')}>
        <ul className="list-disc space-y-1 pl-4">
          {action.next_questions.map(question => (
            <li key={question}>
              <Text size="sm">{question}</Text>
            </li>
          ))}
        </ul>
      </Section>

      <Box className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Section title={t('callBrief.section.objection')}>
          <Text size="sm">{action.objection}</Text>
        </Section>
        <Section title={t('callBrief.section.fallback')}>
          <Text size="sm">{action.fallback}</Text>
        </Section>
      </Box>

      <Section title={t('callBrief.section.expectedOutcome')}>
        <Text size="sm">{action.expected_outcome}</Text>
      </Section>

      <Section title={t('callBrief.section.branches')}>
        <Box className="space-y-2">
          {BRANCH_KEYS.map(key => (
            <Box key={key}>
              <Text size="xs" weight="semibold" className="text-[var(--bellum-text-accent)]">
                {t(`callBrief.branch.${key}.title`)}
              </Text>
              <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                {t(`callBrief.branch.${key}.guidance`)}
              </Text>
            </Box>
          ))}
        </Box>
      </Section>

      <Box className="flex items-center justify-between gap-2 border-t border-[var(--bellum-border)] pt-3">
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('callBrief.noRecordingNotice')}
        </Text>
        <Button size="sm" variant="outline" onClick={toggleLive} aria-pressed={live}>
          {live ? t('callBrief.liveModeOff') : t('callBrief.liveModeOn')}
        </Button>
      </Box>

      {live ? (
        <Box className="grid grid-cols-1 items-start gap-3 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3 md:grid-cols-2">
          <Box className="flex min-w-0 flex-col gap-3">
            <Box className="flex items-baseline justify-between">
              <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
                {t('callBrief.live.timer')}
              </Text>
              <Text size="sm" weight="semibold" aria-live="polite">
                {elapsedLabel(seconds)}
              </Text>
            </Box>

            <Box>
              <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
                {t('callBrief.live.checklist')}
              </Text>
              <ul className="mt-1 flex flex-col gap-1">
                {checklist.map((question, index) => (
                  <li key={question}>
                    <label className="flex min-h-11 cursor-pointer items-start gap-2 py-1">
                      <input
                        type="checkbox"
                        className="mt-1 size-4 shrink-0"
                        checked={asked.has(index)}
                        onChange={() => toggleAsked(index)}
                      />
                      <Text
                        element="span"
                        size="sm"
                        className={cn(
                          asked.has(index)
                            ? 'text-[var(--bellum-text-muted)] line-through'
                            : 'text-[var(--bellum-text-primary)]',
                        )}
                      >
                        {question}
                      </Text>
                    </label>
                  </li>
                ))}
              </ul>
            </Box>

            {factsToVerify.length > 0 ? (
              <Box>
                <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
                  {t('callBrief.live.factsToVerify')}
                </Text>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {factsToVerify.map(fact => (
                    <li key={fact}>
                      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                        {fact}
                      </Text>
                    </li>
                  ))}
                </ul>
              </Box>
            ) : null}
          </Box>

          <Box className="flex min-w-0 flex-col gap-1">
            <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
              {t('callBrief.live.notes')}
            </Text>
            <textarea
              value={notes}
              onChange={event => setNotes(event.target.value)}
              rows={6}
              className="w-full rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-2 text-sm text-[var(--bellum-text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]"
              placeholder={t('callBrief.live.notesPlaceholder')}
            />
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('callBrief.live.notesNotSaved')}
            </Text>
          </Box>
        </Box>
      ) : null}
    </Box>
  )
}
