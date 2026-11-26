import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import { OUTREACH_PERSONAS } from '@bellum/contracts'
import { Button, Popover, PopoverContent, PopoverTrigger, SelectField } from '@bellum/ui'
import {
  MESSAGE_CTA_CODES,
  MESSAGE_OBJECTIVE_CODES,
  MESSAGE_RELATIONSHIP_CODES,
  MESSAGE_TEXT_PARAMETER_MAX,
  type MessageParameterKey,
  type MessageParameters,
} from './message-parameters'

type ComposerParametersProps = {
  parameters: MessageParameters
  onParametersChange: (parameters: MessageParameters) => void
  /** #3694.4 — « Corriger le brief » déplie ce panneau : un seul endroit pour corriger. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const FIELD_CLASS =
  'h-9 w-full min-w-0 rounded-md border border-[var(--bellum-border)] bg-transparent px-2 text-sm text-[var(--bellum-text-primary)]'

/**
 * #2123.61-.68 — les neuf paramètres du message, repliés par défaut : l'angle
 * libre reste le geste principal du composer. Choisir un paramètre ne génère
 * RIEN — il cadre le prochain « Générer », qui prépare un brouillon et n'envoie
 * jamais.
 *
 * #3694 — EN SUPERPOSITION (`Popover`), jamais poussé dans le flux : déplié
 * en ligne, les neuf champs faisaient passer le panneau au-delà de sa place
 * et écrasaient la hauteur du fil de conversation à 83 px sur 640 (recette
 * prod 09/10). Un `Popover` se pose AU-DESSUS, dans un portail — il ne
 * pousse jamais la mise en page qui l'entoure, et reste aussi repliable
 * qu'avant.
 */
export function ComposerParameters({
  parameters,
  onParametersChange,
  open: controlledOpen,
  onOpenChange,
}: ComposerParametersProps) {
  const { t } = useTranslation('engagement')
  const [localOpen, setLocalOpen] = useState(false)
  const open = controlledOpen ?? localOpen
  const handleOpenChange = (next: boolean) => {
    setLocalOpen(next)
    onOpenChange?.(next)
  }
  const panelId = useId()
  const chosenCount = Object.values(parameters).filter(value => Boolean(value?.trim())).length
  const set = (key: MessageParameterKey, value: string) =>
    onParametersChange({ ...parameters, [key]: value === '' ? undefined : value })

  const selects: { key: MessageParameterKey; options: { value: string; label: string }[] }[] = [
    {
      key: 'objective',
      options: MESSAGE_OBJECTIVE_CODES.map(code => ({
        value: code,
        label: t(`composer.parameters.objectives.${code}`),
      })),
    },
    {
      key: 'relationship',
      options: MESSAGE_RELATIONSHIP_CODES.map(code => ({
        value: code,
        label: t(`accountDetail:salesContext.states.${code}`),
      })),
    },
    {
      key: 'persona',
      options: OUTREACH_PERSONAS.map(code => ({ value: code, label: t(`composer.parameters.personas.${code}`) })),
    },
    {
      key: 'cta',
      options: MESSAGE_CTA_CODES.map(code => ({ value: code, label: t(`composer.parameters.ctas.${code}`) })),
    },
  ]
  const texts = ['signal', 'offer', 'proof', 'problem', 'constraints'] as const
  // #3892.6 (Louis 15/10) — champs FACULTATIFS, repliés : remplis = transmis à l'IA, vides = ignorés.
  const optionalTexts = ['scope', 'service', 'period', 'experience'] as const

  return (
    <div className="min-w-0">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button type="button" variant="light" size="sm" aria-controls={panelId} className="h-auto gap-1.5">
            {t('composer.parameters.toggle')}
            {chosenCount > 0 ? <span className="text-xs text-[var(--bellum-text-muted)]">{chosenCount}</span> : null}
            <ChevronDown aria-hidden="true" className={open ? 'size-3.5 rotate-180' : 'size-3.5'} />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          id={panelId}
          align="start"
          className="grid w-[min(92vw,28rem)] min-w-0 grid-cols-1 gap-2 sm:grid-cols-2"
        >
          <p className="text-xs text-[var(--bellum-text-muted)] sm:col-span-2">{t('composer.parameters.hint')}</p>
          {selects.map(({ key, options }) => (
            <div key={key} className="flex min-w-0 flex-col gap-1">
              <label htmlFor={`${panelId}-${key}`} className="text-xs text-[var(--bellum-text-muted)]">
                {t(`composer.parameters.${key}`)}
              </label>
              {/* GA-251 — le menu du produit, qui suit le thème ; jamais le menu natif peint par l'OS. */}
              <SelectField
                id={`${panelId}-${key}`}
                size="sm"
                value={parameters[key] ?? ''}
                onChange={next => set(key, next)}
                emptyOption={{ label: t('composer.parameters.derived') }}
                options={options}
              />
            </div>
          ))}
          {texts.map(key => (
            <label
              key={key}
              className="flex min-w-0 flex-col gap-1 text-xs text-[var(--bellum-text-muted)] sm:col-span-2"
            >
              {t(`composer.parameters.${key}`)}
              <input
                type="text"
                className={FIELD_CLASS}
                maxLength={MESSAGE_TEXT_PARAMETER_MAX[key]}
                value={parameters[key] ?? ''}
                placeholder={t(`composer.parameters.placeholders.${key}`)}
                onChange={event => set(key, event.target.value)}
              />
            </label>
          ))}
          <details className="min-w-0 sm:col-span-2" data-testid="composer-optional-fields">
            <summary className="cursor-pointer text-xs text-[var(--bellum-text-muted)]">
              {t('composer.parameters.optionalToggle')}
            </summary>
            <div className="mt-2 grid grid-cols-1 gap-2">
              {optionalTexts.map(key => (
                <label
                  key={key}
                  className="flex min-w-0 flex-col gap-1 text-xs text-[var(--bellum-text-muted)] sm:col-span-2"
                >
                  {t(`composer.parameters.${key}`)}
                  <input
                    type="text"
                    className={FIELD_CLASS}
                    maxLength={MESSAGE_TEXT_PARAMETER_MAX[key]}
                    value={parameters[key] ?? ''}
                    placeholder={t(`composer.parameters.placeholders.${key}`)}
                    onChange={event => set(key, event.target.value)}
                  />
                </label>
              ))}
            </div>
          </details>
        </PopoverContent>
      </Popover>
    </div>
  )
}
