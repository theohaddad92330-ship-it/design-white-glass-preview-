import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ListChecks } from 'lucide-react'
import { Button, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger, Text } from '@bellum/ui'
import { buildAnswersRecap } from '@/features/onboarding/lib/onboarding-answers-recap'
import type { OnboardingAnswers } from '@/stores/onboardingStore'

type Props = {
  onboardingId: string
  answers: OnboardingAnswers
}

/**
 * #2087.30/.31/.32 — le drawer « Voir mes réponses » : groupé par ÉTAPE
 * (`buildAnswersRecap`, un axe différent des 8 blocs thématiques de la
 * relecture finale — sauter PENDANT le parcours, pas relire avant de générer
 * l'audit). Chaque ligne ramène à la sous-étape qui pose RÉELLEMENT la
 * question (#2087.31) et referme le tiroir au clic (#2087.32) — `open` est un
 * état LOCAL, jamais persisté : rien ne le laisse ouvert en permanence.
 */
export function AnswersRecapDrawer({ onboardingId, answers }: Props) {
  const { t } = useTranslation('onboarding')
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const groups = useMemo(() => buildAnswersRecap(answers, t).filter(g => g.rows.length > 0), [answers, t])

  const goToRow = (stageCode: string, slug: string): void => {
    // #2087.32 — fermer AVANT de naviguer : le tiroir ne doit jamais rester
    // ouvert au-dessus de l'écran vers lequel il vient d'envoyer.
    setOpen(false)
    navigate({ to: '/onboarding/$id/$stage/$slug', params: { id: onboardingId, stage: stageCode, slug } })
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" size="sm" icon={ListChecks} iconPosition="left">
          {t('answersRecap.trigger')}
        </Button>
      </SheetTrigger>
      <SheetContent closeLabel={t('common:actions.close')} side="right" className="flex flex-col gap-0 p-0">
        <SheetHeader className="border-b border-[var(--bellum-border)] p-4">
          <SheetTitle className="text-sm">{t('answersRecap.title')}</SheetTitle>
          <SheetDescription>{t('answersRecap.description')}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          {groups.length === 0 && (
            <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
              {t('answersRecap.empty')}
            </Text>
          )}
          {groups.map(group => (
            <div key={group.stageCode} className="space-y-1">
              <Text element="h3" size="sm" weight="medium" className="text-[var(--bellum-text-accent)]">
                {t(group.titleKey)}
              </Text>
              <div className="space-y-0.5">
                {group.rows.map(row => (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => goToRow(row.stageCode, row.slug)}
                    className="flex w-full flex-col items-start gap-0.5 rounded-md p-2 pointer-coarse:min-h-11 text-left hover:bg-[var(--bellum-surface-2)]"
                  >
                    <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
                      {t(row.labelKey)}
                    </Text>
                    <Text element="span" size="sm" className="text-[var(--bellum-text-primary)]">
                      {row.value}
                    </Text>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
