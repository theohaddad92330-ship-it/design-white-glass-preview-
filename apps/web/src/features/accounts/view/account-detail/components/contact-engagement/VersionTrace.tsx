import { Button, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

export type VersionTraceInfo = {
  /** Le style choisi a été vérifié par le serveur pour ce brouillon. */
  usedStyle?: boolean
  usedTemplate?: { source: string; version: number }
  /** Texte identique au brouillon précédent. */
  unchanged?: boolean
}

/**
 * #3695.4-.6 — ce qui a RÉELLEMENT produit cette version, rien de plus : l'objectif
 * lu par le moteur, le style ou le modèle approuvé (source + version) quand il y en
 * a eu un, et le constat « identique à la précédente » quand le texte n'a pas bougé.
 * Une version sans trace ne dit rien : on n'annonce jamais un modèle ou une
 * adaptation qui n'a pas eu lieu. « Revenir à la version générée » est non
 * destructif : la correction manuelle reste dans le fil et se reprend d'un clic.
 */
export function VersionTrace({
  objective,
  trace,
  hasEdits,
  showingGenerated,
  onToggleGenerated,
}: {
  objective?: string | null
  trace: VersionTraceInfo
  hasEdits: boolean
  showingGenerated: boolean
  onToggleGenerated: () => void
}) {
  const { t } = useTranslation('engagement')
  const facts = [
    objective ? t('versionTrace.objective', { objective: t(`composer.parameters.objectives.${objective}`) }) : null,
    trace.usedTemplate ? t('versionTrace.template', trace.usedTemplate) : null,
    trace.usedStyle ? t('versionTrace.style') : null,
  ].filter((fact): fact is string => fact !== null)

  if (facts.length === 0 && !trace.unchanged && !hasEdits) return null
  return (
    <div className="space-y-1">
      {facts.length > 0 ? (
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {facts.join(' · ')}
        </Text>
      ) : null}
      {trace.unchanged ? (
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('versionTrace.unchanged')}
        </Text>
      ) : null}
      {hasEdits ? (
        <Button type="button" variant="ghost" size="xs" className="h-auto px-0" onClick={onToggleGenerated}>
          {showingGenerated ? t('versionTrace.backToMine') : t('versionTrace.backToGenerated')}
        </Button>
      ) : null}
    </div>
  )
}
