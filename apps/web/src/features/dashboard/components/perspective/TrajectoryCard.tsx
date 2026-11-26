import type { CockpitTrajectory } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { CockpitSources } from './CockpitSources'

/**
 * « Ma trajectoire » (#1407) — où j'en suis, pas ce que je dois faire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA FRONTIÈRE QUE CE BLOC TIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * #1404 la pose : « Aujourd'hui » porte les décisions immédiates, ce cockpit
 * porte le recul. Ce bloc ne montre donc AUCUN objet à traiter — quatre
 * mesures, et chacune mène à la page qui les détaille. « Ne pas recopier les
 * pages Projets/Finance/Missions en détail », dit le retour ; c'est pourquoi il
 * y a quatre lignes et pas quinze.
 *
 * ⚠️ CHAQUE MESURE PEUT ÊTRE INCONNUE, ET ALORS ELLE LE DIT. `UnknownValue`
 * plutôt que `{value ?? 0}` : « 0 € de pipe » envoie un commercial chercher ce
 * qu'il a perdu, alors que la phrase vraie est « on n'a pas pu lire ». Zéro
 * reste affiché quand il est MESURÉ — c'est une information, et elle se garde.
 *
 * ⚠️ Deux des quatre « CA » du retour ne sont pas ici : « signé » et
 * « produit » n'ont aucun objet porteur dans le produit. Le retour dit lui-même
 * « si mesurable » ; il est pris au mot, et l'absence est nommée dans le
 * contrat plutôt que comblée par une approximation.
 */
export function TrajectoryCard({ trajectory }: { trajectory: CockpitTrajectory }) {
  const { t, i18n } = useTranslation('dashboard')
  const euros = (value: number | null) =>
    value === null
      ? null
      : new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(
          value,
        )

  return (
    <section
      aria-label={t('perspective.trajectory.title')}
      className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4"
    >
      <Text element="h2" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {t('perspective.trajectory.title')}
      </Text>

      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label={t('perspective.trajectory.pipeline')}
          value={euros(trajectory.pipeline?.amount_euros ?? null)}
          // « Un score n'est jamais nu », appliqué à une somme : sans le
          // dénominateur, « 120 k€ sur 30 affaires » laisse croire que les
          // trente sont chiffrées.
          note={
            trajectory.pipeline
              ? t('perspective.trajectory.pipelineScope', {
                  valued: trajectory.pipeline.valued_count,
                  open: trajectory.pipeline.open_count,
                })
              : null
          }
          reason={t('perspective.trajectory.pipelineUnknown')}
          to="/projects"
        />
        <Metric
          label={t('perspective.trajectory.missions')}
          value={trajectory.missions_active === null ? null : String(trajectory.missions_active)}
          reason={t('perspective.trajectory.missionsUnknown')}
          to="/missions"
        />
        <Metric
          label={t('perspective.trajectory.invoiced')}
          value={euros(trajectory.invoiced_euros)}
          note={
            trajectory.collected_euros === null
              ? null
              : t('perspective.trajectory.collected', { amount: euros(trajectory.collected_euros) })
          }
          // ⚠️ DEUX ABSENCES, DEUX PHRASES. `null` sans le droit financier veut
          // dire « ce n'est pas ton périmètre » ; `null` avec le droit veut dire
          // « on n'a pas pu lire ». Les rendre du même gris ferait chercher une
          // panne à quelqu'un qui n'a simplement pas la permission — et ferait
          // croire à une permission manquante devant une vraie panne.
          reason={
            trajectory.finance_readable
              ? t('perspective.trajectory.invoicedUnknown')
              : t('perspective.trajectory.invoicedForbidden')
          }
          to="/missions"
        />
      </div>

      <CockpitSources provenance={trajectory.provenance} />
    </section>
  )
}

function Metric({
  label,
  value,
  note,
  reason,
  to,
}: {
  label: string
  /** Déjà formatée. `null` = non mesurée, et ça s'écrit. */
  value: string | null
  note?: string | null
  reason: string
  to: '/projects' | '/missions'
}) {
  const { t } = useTranslation('dashboard')
  return (
    <div className="min-w-0">
      <Text size="xs" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
        {label}
      </Text>
      <div className="mt-1">
        {value === null ? (
          <UnknownValue reason={reason} />
        ) : (
          <Text size="xl" weight="semibold" className="tabular-nums text-[var(--bellum-text-primary)]">
            {value}
          </Text>
        )}
      </div>
      {note ? (
        <Text size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
          {note}
        </Text>
      ) : null}
      {/* Chaque métrique mène à SA page source — c'est la demande du retour, et
          c'est aussi le défaut nommé « une réponse juste sans chemin ». */}
      <Link
        to={to}
        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[var(--bellum-text-accent)] hover:underline pointer-coarse:min-h-11 pointer-coarse:items-center"
      >
        {t('perspective.open')}
        <ArrowRight className="size-3" aria-hidden />
      </Link>
    </div>
  )
}
