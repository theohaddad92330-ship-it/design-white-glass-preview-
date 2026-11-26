import { Card, Text } from '@bellum/ui'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Provenance, type ProvenanceSource } from '@/components/primitives/Provenance'

/**
 * La coque commune des sections qui rendent un bloc de `raw_analysis`.
 *
 * Elle existe pour une raison précise : ces blocs viennent tous d'une ANALYSE,
 * donc ils portent tous la même obligation — leur source ET leur date. Écrite
 * carte par carte, la ligne de provenance dérive en trois formulations en trois
 * semaines, et la date finit par manquer sur celle qu'on a ajoutée en dernier.
 *
 * `source` distingue ce qui est CALCULÉ de ce qui est PROPOSÉ : un programme IT
 * nommé dans une source publique est un constat (`pipeline`), une stratégie
 * d'ouverture est une inférence (`model`). Les deux appellent une confiance
 * différente, et les rendre de la même phrase les confondrait.
 */
export function AnalysisSectionCard({
  icon: Icon,
  title,
  subtitle,
  source,
  analyzedAt,
  provenanceDetail,
  hideProvenance = false,
  hideHeader = false,
  children,
}: {
  icon: LucideIcon
  title: string
  subtitle?: string
  source: ProvenanceSource | null
  analyzedAt: string | null
  provenanceDetail?: string
  /**
   * #2116.10 — un fait NON mesuré n'a pas de provenance à afficher : la carte
   * garde son en-tête (icône, titre) et tait le pied « provenance non
   * renseignée », qui mentirait sur une valeur qu'on n'a jamais cherchée à
   * dater. Réservé au cas `UnknownValue` : un fait connu porte TOUJOURS sa
   * source et sa date.
   */
  hideProvenance?: boolean
  /** #4022.6 — la carte vit sous le titre d'une section qui la nomme déjà : pas de second en-tête. */
  hideHeader?: boolean
  children: ReactNode
}) {
  return (
    <Card className="gap-0 overflow-hidden p-0 [--card-spacing:0px]">
      {hideHeader ? null : (
        <div className="flex items-center gap-3 px-4 py-4">
          <Icon className="size-4 shrink-0 text-[var(--bellum-text-accent)]" />
          <div className="min-w-0">
            <Text element="h3" size="sm" weight="semibold">
              {title}
            </Text>
            {subtitle ? (
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {subtitle}
              </Text>
            ) : null}
          </div>
        </div>
      )}
      {children}
      {hideProvenance ? null : (
        <div className="border-t border-[var(--bellum-border)] px-4 py-2.5">
          <Provenance source={source} observedAt={analyzedAt} detail={provenanceDetail} />
        </div>
      )}
    </Card>
  )
}
