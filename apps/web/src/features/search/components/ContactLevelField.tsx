import { cn, Text } from '@bellum/ui'
import type { AnalysisHierarchyLevel } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'
import { FIELD_TITLE } from './AnalyzeChrome'

/**
 * Niveau de contact visé (#2163.25-30 — Terrain / Manager / Direction locale /
 * Achats / Direction groupe). `value` est un TABLEAU dont l'ORDRE porte la
 * priorité : un clic sur un niveau non choisi l'AJOUTE à la fin ; un clic sur
 * un niveau déjà choisi le RETIRE. Sélectionner plusieurs niveaux dans l'ordre
 * voulu EST « Tous, avec priorisation » (#2163.30) — pas une sixième valeur
 * qui redirait la même chose autrement (GA-26).
 */
const LEVEL_ORDER: AnalysisHierarchyLevel[] = ['operational', 'n2', 'n1', 'purchasing', 'c_level']

const LEVEL_LABEL_KEYS: Record<AnalysisHierarchyLevel, string> = {
  operational: 'confirm.contactLevel.levels.operational',
  n2: 'confirm.contactLevel.levels.n2',
  n1: 'confirm.contactLevel.levels.n1',
  purchasing: 'confirm.contactLevel.levels.purchasing',
  c_level: 'confirm.contactLevel.levels.cLevel',
}

export function ContactLevelField({
  value,
  onChange,
  disabled = false,
}: {
  value: AnalysisHierarchyLevel[]
  onChange: (next: AnalysisHierarchyLevel[]) => void
  disabled?: boolean
}) {
  const { t } = useTranslation('search')

  const toggle = (level: AnalysisHierarchyLevel) => {
    if (value.includes(level)) {
      onChange(value.filter(item => item !== level))
    } else {
      onChange([...value, level])
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Text size="xs" className={FIELD_TITLE}>
        {t('confirm.contactLevel.label')}
      </Text>
      <div className="flex flex-wrap items-center gap-1.5">
        {LEVEL_ORDER.map(level => {
          const priority = value.indexOf(level)
          const active = priority >= 0
          const label = t(LEVEL_LABEL_KEYS[level])
          return (
            <button
              key={level}
              type="button"
              onClick={() => toggle(level)}
              aria-pressed={active}
              disabled={disabled}
              className={cn(
                'inline-flex min-h-6 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 pointer-coarse:min-h-11',
                active
                  ? 'border-[var(--bellum-primary-500)] bg-[var(--bellum-primary-500)] text-white'
                  : 'border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-1)] hover:text-[var(--bellum-text-primary)]',
              )}
            >
              {label}
              {/* #2163.30 — le rang ne s'affiche qu'à partir de deux niveaux
                  choisis : un seul niveau n'a rien à prioriser. */}
              {active && value.length > 1 ? <span className="font-normal opacity-80">· {priority + 1}</span> : null}
            </button>
          )
        })}
      </div>
      {value.length > 1 ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('confirm.contactLevel.priorityHint')}
        </Text>
      ) : null}
    </div>
  )
}
