import { useTranslation } from 'react-i18next'
import type { AuditNamedNote, CommercialAuditContext } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { AuditCard } from './AuditCard'
import { ConfidenceBadge } from './ConfidenceBadge'

type Props = {
  assets: CommercialAuditContext['assets']
  constraints: CommercialAuditContext['constraints']
}

/**
 * #2061.7 / #2061.8 — ATOUTS ET CONTRAINTES (#2072.1/#2072.2, retour beta
 * « AUDIT — CE QUI EXISTE, CE QUI MANQUE, CE QUE CELA PRODUIT »).
 *
 * Réouverture du 24/09/2026 (#2061) : les deux champs étaient écrits `null`
 * EN DUR et rendus par aucun composant.
 *
 * ⚠️ CE QUE CE BLOC REFUSE — `buildAssets`/`buildConstraints`
 * (`lib/build-audit.ts`) ne relisent JAMAIS `messaging.avoid` ni
 * `messaging.differentiationPoints` : #2072.1-.3 a EXPLICITEMENT refusé de
 * redire les mêmes phrases sous un autre titre pour Arrêter/Garder/Renforcer
 * (« les différenciateurs en actifs » — voir le docblock de tête
 * d'`AuditDecisionColumns.tsx`, GA-26 : rien n'apparaît deux fois sous la
 * même forme avec le même contenu). Les atouts viennent du vivier de
 * consultants et du copilote personnalisé ; les contraintes, de la cadence
 * recommandée (le plafond d'activité) et du niveau de décision visé (l'accès
 * à atteindre) — des champs qu'aucune autre section de cet écran ne rend
 * sous cette FORME.
 */
export function AuditPositioning({ assets, constraints }: Props) {
  const { t } = useTranslation('commercialAudit')

  return (
    <section className="space-y-3">
      <Text element="h2" size="lg" weight="semibold">
        {t('positioning.title')}
      </Text>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <NamedNoteCard
          testId="audit-assets"
          titleKey="positioning.assets"
          unmeasuredKey="positioning.assetsUnmeasured"
          notes={assets}
        />
        <NamedNoteCard
          testId="audit-constraints"
          titleKey="positioning.constraints"
          unmeasuredKey="positioning.constraintsUnmeasured"
          notes={constraints}
        />
      </div>
    </section>
  )
}

function NamedNoteCard({
  testId,
  titleKey,
  unmeasuredKey,
  notes,
}: {
  testId: string
  titleKey: string
  unmeasuredKey: string
  notes: readonly AuditNamedNote[] | null
}) {
  const { t } = useTranslation('commercialAudit')

  return (
    <AuditCard className="space-y-2">
      <Text element="h3" size="sm" weight="semibold">
        {t(titleKey)}
      </Text>
      {notes === null || notes.length === 0 ? (
        <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
          {t(unmeasuredKey)}
        </Text>
      ) : (
        <ul className="space-y-2" data-testid={testId}>
          {notes.map(note => (
            <li key={note.label} className="space-y-0.5">
              <div className="flex items-start justify-between gap-2">
                <Text element="p" size="sm" weight="medium">
                  {note.label}
                </Text>
                <ConfidenceBadge confidence={note.confidence} />
              </div>
              {note.detail === null ? null : (
                <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                  {note.detail}
                </Text>
              )}
            </li>
          ))}
        </ul>
      )}
    </AuditCard>
  )
}
