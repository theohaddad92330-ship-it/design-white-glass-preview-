import type { ProgramName } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { Target } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AnalysisSectionCard } from './AnalysisSectionCard'

/**
 * « Projets et transformations » (ex-« Programmes IT nommés ») — `raw_analysis.program_names[]`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE CARTE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * La phase 3 produit, pour chaque programme, quatre champs : son nom, l'entité
 * qui le porte, son budget et sa description. Trois d'entre eux n'étaient
 * affichés NULLE PART — pas même dans l'export PDF, qui lit la clé avec
 * `parseStringList` et ne garde donc que les noms.
 *
 * C'est précisément la matière qui fait d'un nom un point d'entrée : « Plan
 * stratégique 2029 » ne se travaille pas, « Plan stratégique 2029, porté par la
 * filiale paiement, 400 M€ » se travaille.
 *
 * `source="pipeline"` et non `"model"` : un programme nommé est relevé dans une
 * source publique, pas inféré. Ce qui manque est NOMMÉ — un budget vide se
 * lirait « gratuit », et une entité vide « le siège ».
 */
export function ItProgramsCard({
  programs,
  analyzedAt,
  embedded = false,
}: {
  programs: ProgramName[]
  analyzedAt: string | null
  /** #4022.6 — sous « Vision / transformation » : le titre de la section suffit (rien deux fois, GA-26). */
  embedded?: boolean
}) {
  const { t } = useTranslation('accountDetail')
  const named = programs.filter(program => (program?.name ?? '').trim().length > 0)
  if (named.length === 0) return null

  return (
    <AnalysisSectionCard
      icon={Target}
      title={t('programs.title')}
      subtitle={t('programs.subtitle')}
      source="pipeline"
      hideHeader={embedded}
      analyzedAt={analyzedAt}
    >
      <ul className="border-t border-[var(--bellum-border)]">
        {named.map((program, index) => (
          <li
            key={`${program.name}-${index}`}
            className="border-b border-[var(--bellum-border)] px-4 py-3 last:border-b-0"
          >
            <Text size="sm" weight="medium">
              {program.name}
            </Text>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {program.entity?.trim()
                  ? t('programs.entity', { value: program.entity.trim() })
                  : t('programs.noEntity')}
              </Text>
              {/* #2613 — un budget non renseigné ne fait plus de ligne. */}
              {program.budget?.trim() ? (
                <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                  {t('programs.budget', { value: program.budget.trim() })}
                </Text>
              ) : null}
            </div>
            {/* #3677.7 — objectif, périmètre documenté, horizon : seulement ce que la source porte. */}
            {(['objective', 'scope', 'horizon'] as const).map(field =>
              program[field]?.trim() ? (
                <Text key={field} size="xs" className="mt-1 block text-[var(--bellum-text-secondary)]">
                  {t(`programs.${field}`, { value: program[field]?.trim() })}
                </Text>
              ) : null,
            )}
            {program.description?.trim() ? (
              <Text element="p" size="xs" className="mt-1 leading-relaxed text-[var(--bellum-text-muted)]">
                {program.description.trim()}
              </Text>
            ) : null}
          </li>
        ))}
      </ul>
    </AnalysisSectionCard>
  )
}
