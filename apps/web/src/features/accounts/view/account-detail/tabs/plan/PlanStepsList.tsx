import { Badge, Button, Card, CardContent, Text } from '@bellum/ui'
import { Copy, Mail, Phone, Linkedin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useColleagueContactGuard } from '@/features/team-guardrails/components/ColleagueContactDialog'
import { useOptionalContactEngagement } from '../../components/contact-engagement/ContactEngagementContext'
import type { PlanStepChannel, PlanStepView } from './planSteps'

const CHANNEL_ICON = { email: Mail, linkedin: Linkedin, phone: Phone } as const satisfies Record<
  PlanStepChannel,
  unknown
>

/**
 * #4415.1/.2 (#4416.3) — UNE étape du plan : canal, destinataire en clair, message prêt (aperçu) et le geste.
 * Partagée par l'onglet Plan du compte et le bloc « Plan pour <prénom> » de la fiche contact : une seule
 * forme d'étape (GA-26). L'envoi reste le geste du commercial — « Préparer » ouvre le préparateur, jamais d'envoi.
 */
export function PlanStepCard({ step, rawAnalysis }: { step: PlanStepView; rawAnalysis: Record<string, unknown> }) {
  const { t } = useTranslation('accountDetail')
  const { t: tActions } = useTranslation('actions')
  const engagement = useOptionalContactEngagement()
  const guard = useColleagueContactGuard(step.contact?.id)
  const Icon = CHANNEL_ICON[step.channel]

  const prepareEmail = () => {
    if (!step.contact || !engagement) return
    const contact = step.contact
    // #4415.2 — le MÊME préparateur que Contacter › Préparer un email de la fiche contact, pré-rempli
    // par le message du dossier ; le panneau relit lui-même `rawAnalysis` pour le corps. Le libellé de
    // l'étape est son ANGLE : sans lui le champ s'ouvrait vide et rien n'était rédigé pour cette étape.
    guard.run(() => engagement.openEngagement([contact], 'email', { rawAnalysis, initialContext: step.label }))
  }

  const copyMessage = () =>
    guard.run(() => {
      // #4415.2 — sans message prêt dans le dossier, on copie le texte de l'étape (rien d'inventé).
      void navigator.clipboard.writeText(step.message.trim() || step.label).then(
        () => toast.success(tActions('toast.messageCopied')),
        () => toast.error(tActions('toast.messageCopyFailed')),
      )
    })

  const canPrepareEmail = step.channel === 'email' && !!step.contact && !!engagement
  // #4415.2 — jamais d'étape sans geste : e-mail sans destinataire résolu → copie du message.
  const canCopy = !canPrepareEmail
  const copyLabel = step.channel === 'phone' ? tActions('executeMenu.copyScript') : tActions('executeMenu.copyMessage')

  return (
    <li className="flex w-full min-w-0 gap-3 rounded-lg border border-[var(--bellum-border)] p-3">
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--bellum-surface-2)] text-sm font-semibold"
      >
        {step.number}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Icon className="size-3.5" aria-hidden />
            {t(`planSteps.channel.${step.channel}`)}
          </Badge>
          <Text className="font-medium">{step.recipient}</Text>
        </div>
        <Text size="sm" className="text-[var(--bellum-text-muted)]">
          {step.label}
        </Text>
        {step.sameMessageAs !== undefined ? (
          <Text size="sm" className="text-[var(--bellum-text-muted)]" data-testid="plan-step-same-message">
            {t('planSteps.sameMessage', { number: step.sameMessageAs })}
          </Text>
        ) : step.message ? (
          <Text size="sm" className="line-clamp-3 whitespace-pre-line" data-testid="plan-step-message">
            {step.message}
          </Text>
        ) : null}
        {canPrepareEmail ? (
          <Button type="button" size="sm" className="min-h-11 self-start" onClick={prepareEmail}>
            {t('planSteps.prepare')}
          </Button>
        ) : null}
        {canCopy ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            icon={Copy}
            iconPosition="left"
            className="min-h-11 self-start"
            onClick={copyMessage}
          >
            {copyLabel}
          </Button>
        ) : null}
      </div>
      {guard.dialog}
    </li>
  )
}

/**
 * #4415.1 — au plus trois étapes en tête. Aucune étape ⇒ RIEN (pas de bloc vide, pas de « 0 étape »).
 */
export function PlanStepsList({
  steps,
  rawAnalysis,
  title,
}: {
  steps: readonly PlanStepView[]
  rawAnalysis: Record<string, unknown>
  title: string
}) {
  if (steps.length === 0) return null
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <Text className="font-semibold">{title}</Text>
        <ol className="flex w-full min-w-0 flex-col gap-2">
          {steps.map(step => (
            <PlanStepCard key={`${step.weekIndex}-${step.stepIndex}`} step={step} rawAnalysis={rawAnalysis} />
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
