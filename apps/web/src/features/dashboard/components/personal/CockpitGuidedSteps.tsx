import { Button, TYPE_SCALE, cn } from '@bellum/ui'
import { ArrowRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CollapsedSection } from '@/components/disclosure/CollapsedSection'
import { revealTarget, revealTargetProps } from '@/lib/reveal-target'

interface CockpitStep {
  key: string
  title: string
  /** L'ancre qu'une tuile de `PersonalKpiRow` vise (`COCKPIT_ANCHORS`) — sinon une ancre propre à l'étape. */
  anchor?: string
  content: ReactNode
}

/**
 * #4356.1 — LE RECUL EN PARCOURS GUIDÉ, au lieu de blocs « voir plus ».
 *
 * Les sections du cockpit étaient des disclosures muets, de même poids, sans
 * ordre ni suite : on en ouvrait un au hasard, on ne savait pas qu'il y en
 * avait un après. Elles deviennent une SUITE d'étapes numérotées (« Étape 2
 * sur 4 »), dont chacune se termine par « Étape suivante : … » — le geste
 * referme l'étape lue, ouvre la suivante et l'amène à l'écran.
 *
 * Rien n'est retiré, et rien n'est imposé : chaque étape reste ouvrable
 * directement (plusieurs à la fois si on veut), et garde l'ancre que les
 * tuiles de chiffres visent (#1095/#1096 — un chiffre mène quelque part).
 *
 * Périmètre (brief PLATEFORME-B, 19/10) : le Tableau de bord SEULEMENT. Les
 * autres écrans à blocs « voir plus » sont listés dans le rapport du lot.
 */
export function CockpitGuidedSteps({ steps }: { steps: CockpitStep[] }) {
  const { t } = useTranslation('dashboard')
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  const anchorOf = (step: CockpitStep) => step.anchor ?? `cockpit-step-${step.key}`

  const setStep = (key: string, next: boolean) =>
    setOpen(current => {
      const copy = new Set(current)
      if (next) copy.add(key)
      else copy.delete(key)
      return copy
    })

  const goNext = (from: CockpitStep, to: CockpitStep) => {
    setOpen(current => {
      const copy = new Set(current)
      copy.delete(from.key)
      copy.add(to.key)
      return copy
    })
    // Après le rendu : l'étape suivante existe déjà (son en-tête est toujours monté).
    requestAnimationFrame(() => revealTarget(anchorOf(to)))
  }

  return (
    <ol aria-label={t('guided.label')} className="flex flex-col gap-2">
      {steps.map((step, index) => {
        const next = steps[index + 1]
        return (
          <li key={step.key}>
            <CollapsedSection
              title={step.title}
              open={open.has(step.key)}
              onOpenChange={value => setStep(step.key, value)}
              badge={
                <span className={cn(TYPE_SCALE.label, 'text-[var(--bellum-text-muted)]')}>
                  {t('guided.step', { index: index + 1, total: steps.length })}
                </span>
              }
              {...revealTargetProps(anchorOf(step))}
            >
              {step.content}
              {next ? (
                <div className="mt-4 flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="pointer-coarse:min-h-11"
                    onClick={() => goNext(step, next)}
                  >
                    {t('guided.next', { title: next.title })}
                    <ArrowRight className="size-4" aria-hidden />
                  </Button>
                </div>
              ) : null}
            </CollapsedSection>
          </li>
        )
      })}
    </ol>
  )
}
