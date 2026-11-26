import {
  contactSearchEntities,
  toggleContactEntity,
  type AnalysisScopeSelection,
  type GroupPerimeterEntity,
} from '@bellum/contracts'
import { cn, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useGroupPerimeter } from '../hooks/useGroupPerimeter'

/** Taille · siège · région, les parts absentes retirées — jamais un « 0 » pour une valeur non publiée (GA-18). */
function entityFacts(entity: GroupPerimeterEntity): string {
  return [entity.headcountLabel, entity.city, entity.region].filter(Boolean).join(' · ')
}

/**
 * Lot 757 — CONTACTS 3/6 (arbitrage Louis 31/10/2026) : « taper le groupe puis choisir la filiale ».
 *
 * Quand l'entité tapée est rattachée au registre à un groupe, l'analyse montre le groupe et ses filiales (taille,
 * siège, région) ; le commercial COCHE celles où chercher aussi des contacts. L'entité analysée est toujours
 * cherchée (cochée, non décochable). Le choix voyage dans `contact_entities` du cadrage et reste épinglé sur le
 * run (`analysis_runs.scope_selection`) : un coéquipier le relit. Cocher n'est jamais fusionner.
 *
 * Rien ne s'affiche sans SIREN, sans groupe connu, ou pour un groupe d'une seule entité : on n'affiche pas ce
 * qu'on n'a pas.
 */
export function GroupPerimeterPicker({
  siren,
  selection,
  onSelectionChange,
  disabled = false,
}: {
  siren: string | undefined
  selection: AnalysisScopeSelection
  onSelectionChange: (next: AnalysisScopeSelection) => void
  disabled?: boolean
}) {
  const { t } = useTranslation('search')
  const { data, isLoading } = useGroupPerimeter(siren)
  if (!siren) return null
  if (isLoading) {
    return (
      <Text size="xs" className="text-[var(--bellum-text-muted)]" role="status">
        {t('analyze.perimeter.loading')}
      </Text>
    )
  }
  if (!data || data.entities.length < 2) return null
  const checked = new Set((selection.contact_entities ?? []).map(e => e.siren))
  const root = data.entities.find(e => e.siren === data.rootSiren)
  const searched = contactSearchEntities(selection, root ? { siren: root.siren, name: root.name } : null).length

  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5" data-analyze-section="group-perimeter">
      <legend className="mb-1">
        <Text size="xs" className="font-semibold text-[var(--bellum-text-primary)]">
          {t('analyze.perimeter.title')}
        </Text>
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('analyze.perimeter.hint')}
        </Text>
      </legend>
      <ul className="flex flex-col gap-1">
        {data.entities.map(entity => {
          const isRoot = entity.siren === data.rootSiren
          const on = isRoot || checked.has(entity.siren)
          const facts = entityFacts(entity)
          return (
            <li key={entity.siren}>
              <label
                className={cn(
                  'flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border px-2 py-1.5',
                  on
                    ? 'border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)]'
                    : 'border-[var(--bellum-border)] bg-[var(--bellum-bg)] hover:bg-[var(--bellum-surface-2)]',
                  isRoot && 'cursor-default',
                )}
              >
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0 accent-[var(--bellum-text-accent)]"
                  checked={on}
                  disabled={disabled || isRoot}
                  onChange={() => onSelectionChange(toggleContactEntity(selection, entity))}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <Text size="sm" className="font-medium text-[var(--bellum-text-primary)]">
                      {entity.name}
                    </Text>
                    <Text size="xs" className="text-[var(--bellum-text-muted)]">
                      {[
                        t(`analyze.perimeter.role.${entity.role}`),
                        isRoot ? t('analyze.perimeter.analysed') : null,
                        entity.isActive === false ? t('analyze.perimeter.ceased') : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </span>
                  <Text size="xs" className="text-[var(--bellum-text-muted)]">
                    {facts || t('analyze.perimeter.factsUnpublished')}
                  </Text>
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      <Text size="xs" className="text-[var(--bellum-text-muted)]" aria-live="polite">
        {t('analyze.perimeter.searched', { count: searched })}
      </Text>
      {data.truncated ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('analyze.perimeter.truncated', { count: data.entities.length })}
        </Text>
      ) : null}
    </fieldset>
  )
}
