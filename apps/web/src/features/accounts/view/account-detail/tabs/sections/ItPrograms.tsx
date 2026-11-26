import type { ProgramName } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { Target } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { GlassCard } from '../../components/GlassCard'

/**
 * ⚠️ GARDÉ INTENTIONNELLEMENT malgré zéro appelant (audit code-mort du
 * 31/08/2026 — lot hygiène). NE PAS supprimer sans re-vérifier.
 *
 * `account.raw_analysis.program_names[].{name,entity,budget,description}`
 * reste PRODUIT par la phase 3, TYPE RICHE (`programNameSchema`,
 * account-analysis.ts:116) — mais c'est le cas le PLUS sévère du lot : ni
 * l'écran ni l'export PDF ne montrent plus `entity`/`budget`/`description`.
 * `account-pdf/normalize.ts:292` lit la MÊME clé `program_names` mais
 * l'aplatit en simple liste de noms (`parseStringList`). Ce composant-ci
 * était donc le SEUL endroit du produit à jamais montrer le détail complet
 * d'un programme IT (budget, entité porteuse, description) — cette
 * information est aujourd'hui invisible NULLE PART, alors qu'elle est
 * toujours calculée. Décision produit à prendre.
 */

type ItProgramsProps = {
  programs: ProgramName[]
}

export function ItPrograms({ programs }: ItProgramsProps) {
  const { t } = useTranslation('accountDetail')
  const renderable = programs.filter(p => typeof p.name === 'string' && p.name.length > 0)
  if (renderable.length === 0) return null

  return (
    <GlassCard>
      <Text
        element="h3"
        size="sm"
        weight="semibold"
        className="mb-3 flex items-center gap-2 text-[var(--bellum-text-primary)]"
      >
        <Target className="h-4 w-4 text-[var(--bellum-text-muted)]" />
        {t('programs.title')}
      </Text>
      <div className="space-y-0">
        {renderable.map((program, i) => (
          <div
            key={`${program.name}-${i}`}
            className="flex items-start gap-3 border-b border-[var(--bellum-border)] py-2.5 last:border-0"
          >
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--bellum-primary-500)]" />
            <div className="flex-1 min-w-0">
              <Text element="span" size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                {program.name}
              </Text>
              {program.entity && (
                <Text element="span" size="xs" className="ml-2 text-[var(--bellum-text-muted)]">
                  — {program.entity}
                </Text>
              )}
              {program.budget && (
                <Text element="span" size="xs" className="ml-2 text-[var(--success-soft-text)]">
                  {program.budget}
                </Text>
              )}
              {program.description && (
                <Text element="p" size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
                  {program.description}
                </Text>
              )}
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}
