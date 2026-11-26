import type { ManagerPipelineValue } from '@bellum/contracts'
import { PROJECT_STAGES } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { formatCount } from '@/lib/locale'

// Les étapes du pivot Projet. Les libellés viennent du catalogue `projects` :
// un SEUL vocabulaire d'étape dans le produit, sinon le cockpit et l'écran
// Projets finissent par nommer la même colonne différemment. Une valeur hors
// liste s'affiche telle quelle plutôt que de disparaître.
const KNOWN_STAGES: readonly string[] = PROJECT_STAGES

/** Montant EUR formaté sans décimales, dans la locale de l'interface. */
function formatEur(amount: number, language: string): string {
  return new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * « Pipeline partagé » valorisé en euros (cockpit manager §10).
 *
 * Ne montre QUE des montants réellement saisis : le total somme les
 * `estimated_amount` renseignés, et les opportunités sans montant sont annoncées
 * À PART (« N sans montant ») — jamais forcées à 0 dans le total comme si c'était
 * une valeur (règle « jamais de montant inventé »). Chaque étage indique combien
 * de ses opportunités portent un montant, pour ne pas laisser croire qu'un étage
 * peu chiffré vaut peu.
 *
 * ⚠️ Le PÉRIMÈTRE est nommé sous le titre, et ce n'est pas décoratif. Jusqu'au
 * 29/08/2026 le chiffre en gras additionnait le signé, le perdu et le dormant à
 * l'ouvert : il ne baissait jamais quand on gagnait et montait quand on perdait.
 * L'API ne rend plus que les stades encore en jeu, et l'écran le DIT — un
 * périmètre qui a changé sans que rien ne le dise se relit avec l'ancien sens.
 */
export function PipelineValueCard({ pipeline }: { pipeline: ManagerPipelineValue }) {
  const { t, i18n } = useTranslation('manager')
  const { t: tProjects } = useTranslation('projects')

  const stageLabel = (status: string) => (KNOWN_STAGES.includes(status) ? tProjects(`stage.states.${status}`) : status)

  return (
    <section className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {t('pipelineValue.title')}
        </Text>
        <Text size="lg" weight="bold" className="text-[var(--bellum-text-primary)]">
          {formatEur(pipeline.total_amount, i18n.language)}
        </Text>
      </div>

      <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
        {t('pipelineValue.scope')}
      </Text>

      <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
        {pipeline.valued_count > 0
          ? t('pipelineValue.valued', { count: pipeline.valued_count, formatted: formatCount(pipeline.valued_count) })
          : t('pipelineValue.noneValued')}
      </Text>

      {pipeline.by_stage.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {pipeline.by_stage.map(stage => (
            <li
              key={stage.stage}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--bellum-border)] pb-2 last:border-0 last:pb-0"
            >
              <div className="min-w-0">
                <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                  {stageLabel(stage.stage)}
                </Text>
                {/* Combien de l'étage sont chiffrées — un étage peu valorisé n'est
                    pas un étage sans valeur, il est sous-renseigné. */}
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('pipelineValue.stageValued', {
                    valued: formatCount(stage.valued_count),
                    total: formatCount(stage.total_count),
                  })}
                </Text>
              </div>
              <Text size="sm" weight="semibold" className="tabular-nums text-[var(--bellum-text-primary)]">
                {stage.valued_count > 0 ? formatEur(stage.amount, i18n.language) : '—'}
              </Text>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Le dénominateur honnête : ce que personne n'a chiffré, jamais compté à 0 €. */}
      {pipeline.without_amount > 0 ? (
        <Text size="xs" className="mt-3 text-[var(--bellum-text-secondary)]">
          {t('pipelineValue.withoutAmount', {
            count: pipeline.without_amount,
            formatted: formatCount(pipeline.without_amount),
          })}
        </Text>
      ) : null}
    </section>
  )
}
