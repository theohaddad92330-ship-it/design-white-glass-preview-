import type { AnalysisContext, AnalysisContextPreset } from '@bellum/contracts'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Input,
  SelectField,
  Textarea,
} from '@bellum/ui'
import { ChevronDown, FileText } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { angleKeyOf, angleOf, withAngle } from '../lib/angleField'
import { IntentPicker } from './IntentPicker'
import { StepTitle } from './AnalyzeChrome'
import { getPresetDef, getPresets, emptyContext } from './searchComposerPresets'

const FREE_ANGLE_MAX = 3000

/**
 * Étape 2 — « Ce que tu veux obtenir » (refonte Théo R1) : les objectifs (plusieurs possibles),
 * l'angle en une phrase, et — seulement si on choisit « Partir d'un modèle » — les champs du modèle
 * (ESN en place, fin de contrat…). Les champs structurés d'un modèle ne s'affichent JAMAIS sans ce
 * geste (#4085) : le modèle est un choix, pas un formulaire imposé.
 */
export function PurposeStep({
  context,
  onContextChange,
  onIntentsChange,
}: {
  context: AnalysisContext
  onContextChange: (next: AnalysisContext) => void
  /** Les libellés d'objectifs cochés — la vérification les rappelle, un par un. */
  onIntentsChange: (labelKeys: string[]) => void
}) {
  const { t } = useTranslation('search')
  const angleId = useId()
  const [templateChosen, setTemplateChosen] = useState(false)
  const presets = getPresets(t)
  const current = getPresetDef(t, context.preset)
  const angleKey = angleKeyOf(context.preset)
  const templateFields = templateChosen ? current.fields.filter(field => field.key !== angleKey) : []

  const pickTemplate = (preset: AnalysisContextPreset) => {
    setTemplateChosen(preset !== 'free')
    // Changer de modèle ne perd pas la phrase déjà écrite.
    onContextChange(withAngle(emptyContext(preset), angleOf(context)))
  }

  return (
    <section aria-labelledby="analyze-purpose-title" className="min-w-0">
      <StepTitle
        step={2}
        id="analyze-purpose-title"
        title={t('analyze.purpose.title')}
        hint={t('analyze.purpose.hint')}
      />
      <IntentPicker
        preset={context.preset}
        onSelectedChange={onIntentsChange}
        onPick={preset => {
          const reason = (context as Record<string, unknown>).prioritizationReason
          const next = withAngle(emptyContext(preset), angleOf(context))
          // #4085/#3910 — changer d'objectif ne perd pas la raison posée par Découvrir.
          if (preset === 'strategic' && typeof reason === 'string' && reason !== '' && angleOf(next) === '') {
            onContextChange({ ...next, prioritizationReason: reason } as AnalysisContext)
            return
          }
          onContextChange(next)
        }}
      />

      <div className="mt-3 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={angleId} className="text-xs font-semibold text-[var(--bellum-text-primary)]">
            {t('analyze.purpose.angleLabel')}
            <span className="ml-2 text-xs font-normal text-[var(--bellum-text-secondary)]">
              {t('analyze.purpose.optional')}
            </span>
          </label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-1.5 text-xs text-[var(--bellum-text-secondary)] transition-colors duration-immediate hover:text-[var(--bellum-text-accent)] md:min-h-8"
              >
                <FileText className="size-3.5" aria-hidden="true" />
                {templateChosen ? current.label : t('analyze.purpose.template')}
                <ChevronDown className="size-3.5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>{t('analyze.purpose.templatesLabel')}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={templateChosen ? context.preset : ''}
                onValueChange={value => pickTemplate(value as AnalysisContextPreset)}
              >
                {presets.map(preset => (
                  <DropdownMenuRadioItem key={preset.key} value={preset.key}>
                    <span className="flex flex-col">
                      <span>{preset.label}</span>
                      <span className="text-xs text-[var(--bellum-text-muted)]">{preset.description}</span>
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Textarea
          id={angleId}
          rows={2}
          maxLength={FREE_ANGLE_MAX}
          value={angleOf(context)}
          onChange={event => onContextChange(withAngle(context, event.target.value))}
          placeholder={t('analyze.purpose.anglePlaceholder')}
          className="min-h-16 resize-y rounded-lg bg-[var(--bellum-bg)] text-sm"
        />
        {templateFields.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {templateFields.map(field => {
              const value = (context as Record<string, unknown>)[field.key]
              const text = typeof value === 'string' ? value : ''
              const onChange = (next: string) => onContextChange({ ...context, [field.key]: next } as AnalysisContext)
              return (
                <label
                  key={field.key}
                  className="flex flex-col gap-1 text-xs font-medium text-[var(--bellum-text-secondary)]"
                >
                  {field.label}
                  {field.type === 'textarea' ? (
                    <Textarea rows={2} value={text} onChange={event => onChange(event.target.value)} />
                  ) : field.type === 'select' ? (
                    <SelectField
                      value={text}
                      onChange={onChange}
                      options={field.options ?? []}
                      ariaLabel={field.label}
                      placeholder={t('composer.selectPlaceholder')}
                    />
                  ) : (
                    <Input
                      value={text}
                      placeholder={field.placeholder}
                      onChange={event => onChange(event.target.value)}
                    />
                  )}
                </label>
              )
            })}
          </div>
        ) : null}
      </div>
    </section>
  )
}
