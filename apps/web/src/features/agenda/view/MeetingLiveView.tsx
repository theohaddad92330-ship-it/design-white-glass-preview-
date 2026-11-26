import type { MeetingBriefBlock } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MeetingNotesCard } from '@/features/meeting-notes/view/MeetingNotesCard'
import { trackQuestionUsed } from '@/lib/product-tracker'

/** #2985 — ce panneau ne vit que sous `/briefing/` (`MeetingPrepDialog`, mode
 *  live) : un MOTIF de route, jamais un identifiant de rendez-vous. */
const MEETING_LIVE_SCREEN = '/briefing/'

/**
 * #2319.52-.56 — PENDANT le rendez-vous.
 *
 * La spécification borne ce que l'écran a le droit de faire sans
 * enregistrement autorisé : afficher le brief, les questions, la prise de
 * notes, une checklist et les objectifs. C'est exactement ce composant, et rien
 * d'autre :
 *
 *  · **le brief en bref** — la première ligne de chaque rubrique, pas le brief
 *    entier (on le lit avant, on le survole pendant) ;
 *  · **les objectifs** — la posture et les résultats à obtenir ;
 *  · **les questions, en checklist cochable** — l'état est LOCAL à l'écran :
 *    une case cochée ne part nulle part, elle aide à ne rien oublier ;
 *  · **la prise de notes** — le module de compte rendu EXISTANT, pas un second
 *    éditeur. Il reste un geste de l'utilisateur : rien n'est structuré tant
 *    qu'il ne l'a pas demandé.
 *
 * ⚠️ Aucun micro ici (#2319.57 / .58). Le dépôt d'un enregistrement vit dans la
 * carte de notes, derrière une case de consentement explicite ; ce mode ne
 * démarre jamais d'enregistrement, et le dit.
 *
 * Mobile : une colonne sous 768 px, deux au-dessus (GA-28) — la prise de notes
 * passe sous la checklist, elle n'est jamais masquée.
 */
export function MeetingLiveView({
  brief,
  stance,
  outcomes,
  questions,
  account,
  eventId,
  isInternalMeeting,
}: {
  brief: readonly MeetingBriefBlock[]
  stance: string | null
  outcomes: readonly string[]
  questions: readonly string[]
  account: { id: string; companyName: string | null; website: string | null } | null
  /** #2103.37 — rattache le compte rendu qui naît ici à CE rendez-vous. */
  eventId?: string
  /**
   * #2103.31 — relayé TEL QUEL jusqu'à `MeetingNotesCard` (lu sur les
   * invités par l'appelant, `deriveMeetingType`, `meeting-brief.ts`).
   */
  isInternalMeeting?: boolean
}) {
  const { t } = useTranslation('briefing')
  const [asked, setAsked] = useState<ReadonlySet<number>>(new Set())

  const toggle = (index: number) =>
    setAsked(previous => {
      const next = new Set(previous)
      if (next.has(index)) {
        // Décocher n'est pas un second usage — seulement une correction de case.
        next.delete(index)
      } else {
        next.add(index)
        // #2985.2 — le RANG rendu (1-based), jamais le texte de la question.
        trackQuestionUsed(MEETING_LIVE_SCREEN, index + 1)
      }
      return next
    })

  const glance = brief.filter(block => block.key !== 'outcome' && block.lines.length > 0)

  return (
    <Box className="mt-3 grid grid-cols-1 items-start gap-4 px-1 md:grid-cols-2" data-testid="meeting-live">
      <Box className="flex min-w-0 flex-col gap-3">
        <Box className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-4">
          <Text element="h3" size="sm" weight="semibold">
            {t('agenda.brief.live.objectives')}
          </Text>
          {stance ? (
            <Text element="p" size="base" weight="semibold" className="mt-2">
              {t(`agenda.brief.stance.${stance}`)}
            </Text>
          ) : null}
          <Box className="mt-1 flex flex-col gap-1">
            {outcomes.map(line => (
              <Text key={line} element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
                {line}
              </Text>
            ))}
          </Box>
        </Box>

        {questions.length > 0 ? (
          <Box className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4">
            <Box className="flex flex-wrap items-baseline justify-between gap-2">
              <Text element="h3" size="sm" weight="semibold">
                {t('agenda.brief.live.checklist')}
              </Text>
              <Text size="xs" className="text-[var(--bellum-text-secondary)]" aria-live="polite">
                {t('agenda.brief.live.progress', { done: asked.size, total: questions.length })}
              </Text>
            </Box>
            <ul className="mt-2 flex flex-col gap-1">
              {questions.map((question, index) => (
                <li key={question}>
                  <label className="flex min-h-11 cursor-pointer items-start gap-2 py-1">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0"
                      checked={asked.has(index)}
                      onChange={() => toggle(index)}
                    />
                    <Text
                      element="span"
                      size="sm"
                      className={
                        asked.has(index)
                          ? 'text-[var(--bellum-text-muted)] line-through'
                          : 'text-[var(--bellum-text-primary)]'
                      }
                    >
                      {question}
                    </Text>
                  </label>
                </li>
              ))}
            </ul>
          </Box>
        ) : null}

        {glance.length > 0 ? (
          <Box className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4">
            <Text element="h3" size="sm" weight="semibold">
              {t('agenda.brief.live.brief')}
            </Text>
            <dl className="mt-2 flex flex-col gap-2">
              {glance.map(block => (
                <Box key={block.key} className="min-w-0">
                  <dt>
                    <Text size="xs" weight="semibold" className="text-[var(--bellum-text-accent)]">
                      {t(`agenda.brief.block.${block.key}`)}
                    </Text>
                  </dt>
                  <dd className="min-w-0">
                    <Text size="sm" className="block truncate text-[var(--bellum-text-secondary)]">
                      {block.lines[0]}
                    </Text>
                  </dd>
                </Box>
              ))}
            </dl>
          </Box>
        ) : null}
      </Box>

      <Box className="flex min-w-0 flex-col gap-3">
        <Text element="h3" size="sm" weight="semibold">
          {t('agenda.brief.live.notes')}
        </Text>
        <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('agenda.brief.live.noRecording')}
        </Text>
        {account ? (
          <MeetingNotesCard
            accountId={account.id}
            companyName={account.companyName}
            website={account.website}
            eventId={eventId}
            screen={MEETING_LIVE_SCREEN}
            {...(isInternalMeeting ? { isInternalMeeting } : {})}
          />
        ) : (
          <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('agenda.brief.live.noAccount')}
          </Text>
        )}
      </Box>
    </Box>
  )
}
