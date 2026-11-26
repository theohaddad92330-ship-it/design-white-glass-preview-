import type { Contact } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { MousePointerClick, UserRoundPen, Scan, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { directApproach, needsApproachQuestion, type ApproachChoice } from './approach-quiz'
import { EngagementApproachQuiz } from './EngagementApproachQuiz'
import { channelIcon, composerLabel } from './channel'
import { contextPresetForChannel } from './conversation'
import { KeepApproachStyle } from './KeepApproachStyle'
import type { EngagementChannel } from './types'

type EngagementEmptyStateProps = {
  channel: EngagementChannel
  contact: Contact
  onContextPreset: (context: string) => void
  /**
   * #3633 / #3694.5 — présent : « Email suggéré » rédige à partir du dossier.
   * Rang connu : aucune question. Rang inconnu : la seule question de l'objectif.
   * Absent : la pastille pré-remplit le composer.
   */
  onApproachChosen?: (choice: ApproachChoice) => void
}

export function EngagementEmptyState({
  channel,
  contact,
  onContextPreset,
  onApproachChosen,
}: EngagementEmptyStateProps) {
  const { t } = useTranslation('engagement')
  const Icon = channelIcon(channel)
  const [quizOpen, setQuizOpen] = useState(false)
  // #3633 (Louis 05/10/2026) — l'e-mail suggéré seulement : la demande vise l'e-mail.
  const asksFirst = channel === 'email' && Boolean(onApproachChosen)

  const startApproach = () => {
    const direct = needsApproachQuestion(contact.decision_role) ? null : directApproach(contact.decision_role)
    if (direct && onApproachChosen) onApproachChosen(direct)
    else setQuizOpen(true)
  }

  if (quizOpen && onApproachChosen) {
    return (
      <div className="flex min-h-[300px] flex-col justify-center">
        <EngagementApproachQuiz contact={contact} onSubmit={onApproachChosen} onCancel={() => setQuizOpen(false)} />
      </div>
    )
  }

  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
      <div className="mb-5 rounded-full p-2 text-[var(--bellum-text-primary)] shadow-[0_0_20px_color-mix(in_srgb,var(--bellum-text-primary)_10%,transparent)]">
        <MousePointerClick className="size-6" />
      </div>
      <Text size="sm" weight="semibold">
        {t('emptyState.title')}
      </Text>
      <Text weight="normal" size="sm" className="mt-2 leading-6 text-[var(--bellum-text-secondary)]">
        {t('emptyState.description', { draft: composerLabel(channel).toLowerCase(), name: contact.full_name })}
      </Text>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <EmptyStatePill
          icon={Icon}
          label={composerLabel(channel)}
          onClick={() => (asksFirst ? startApproach() : onContextPreset(contextPresetForChannel(channel)))}
        />
        <EmptyStatePill
          icon={Scan}
          label={t('emptyState.customAngle')}
          onClick={() => onContextPreset(t('preset.customAngle'))}
        />
        <EmptyStatePill
          icon={UserRoundPen}
          label={t('emptyState.shortFollowUp')}
          onClick={() => onContextPreset(t('preset.shortFollowUp'))}
        />
      </div>
      {asksFirst ? <KeepApproachStyle /> : null}
    </div>
  )
}

function EmptyStatePill({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      onClick={onClick}
      size="xs"
      variant="outline"
      icon={<Icon className="size-3.5" />}
      className=" transition-[background-color,border-color,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98]"
    >
      {label}
    </Button>
  )
}
