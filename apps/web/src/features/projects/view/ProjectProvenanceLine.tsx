import { Badge } from '@bellum/ui'
import type { ProjectConfidence, ProjectRow } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'
import { ComputedAt } from '@/components/primitives/ComputedAt'
import { describeOpportunityProvenance, hasProvenance } from '../model/project-provenance'

/** Ton du badge de confiance — l'échelle stockée, pas une note inventée. */
const CONFIDENCE_VARIANT: Record<ProjectConfidence, 'success' | 'default' | 'warning'> = {
  high: 'success',
  medium: 'default',
  low: 'warning',
}

/**
 * D'où vient ce besoin et à quel point on y croit (restitution V2 §6).
 *
 * `source` et `confidence` sont écrits par la matérialisation depuis la
 * migration `1787900000000` mais n'atteignaient jamais l'écran ; `updated_at`
 * non plus. Cette ligne les rend — et seulement eux : un champ vide n'affiche
 * rien plutôt qu'un « inconnu », une valeur hors nomenclature est rendue telle
 * quelle. Un dossier antérieur (colonnes nulles) reste donc lisible : la ligne
 * disparaît, la carte est celle d'avant.
 */
export function ProjectProvenanceLine({ opportunity }: { opportunity: ProjectRow }) {
  const { t } = useTranslation('projects')
  const provenance = describeOpportunityProvenance(opportunity)
  if (!hasProvenance(provenance)) return null

  const source = provenance.sourceKey ? t(`provenance.sources.${provenance.sourceKey}`) : provenance.sourceText
  const confidence = provenance.confidenceKey
    ? t(`provenance.confidence.${provenance.confidenceKey}`)
    : provenance.confidenceText

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-5 text-xs text-[var(--bellum-text-muted)]">
      {source ? <span>{t('provenance.source', { source })}</span> : null}
      {confidence ? (
        <Badge variant={provenance.confidenceKey ? CONFIDENCE_VARIANT[provenance.confidenceKey] : 'outline'}>
          {confidence}
        </Badge>
      ) : null}
      {/* La date de RECALCUL passe par la primitive partagée (tome 7, loi 2,
          élément n°10) : cette ligne avait son propre formateur, avec ses
          propres options de format, et c'était la deuxième des trois versions
          que le produit portait de la même idée.
          ⚠️ Elle est distincte de la SOURCE affichée à gauche : celle-ci dit
          d'où vient le besoin (`Provenance`), celle-là quand on l'a recalculé.
          Confondre les deux est le premier des trois pièges du sujet. */}
      {provenance.refreshedAt ? <ComputedAt at={provenance.refreshedAt} /> : null}
    </div>
  )
}
