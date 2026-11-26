import { Button, Card, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

type Refusal = {
  /** `null` : une fiche sans nom (D366) — l'écran le dit, il n'invente rien. */
  name: string | null
  reason: 'not_found' | 'on_mission'
  /** `AAAA-MM-JJ`, ou `null` quand l'affectation n'a pas de fin connue. */
  endsOn: string | null
}

/**
 * #4191 (G5) — LE COMPTE RENDU D'UN ARCHIVAGE EN LOT PARTIEL.
 *
 * Une ligne refusée ne fait plus échouer toute la sélection : les lignes valides
 * sont archivées (on archive, on ne supprime pas) et ce compte rendu NOMME
 * chacune de celles qui restent, avec sa raison. Un compte seul (« 2 laissés de
 * côté ») obligerait à deviner lesquels — le bouton d'archivage serait alors
 * cliqué à nouveau sur les mêmes fiches.
 *
 * Quand rien n'a été archivé, la ligne « 0 profil archivé » n'est PAS écrite :
 * ce serait un zéro de succès au-dessus d'un échec.
 */
export function BulkArchiveReport({
  archivedCount,
  refused,
  onDismiss,
}: {
  archivedCount: number
  refused: readonly Refusal[]
  onDismiss: () => void
}) {
  const { t, i18n } = useTranslation('consultants')

  const reasonOf = (refusal: Refusal): string => {
    if (refusal.reason === 'not_found') return t('selection.refused.not_found')
    if (refusal.endsOn === null) return t('selection.refused.on_mission_open')
    // UTC explicite : un jour calendaire reste un jour calendaire, quel que soit le fuseau du navigateur.
    const date = new Date(`${refusal.endsOn}T00:00:00Z`).toLocaleDateString(
      i18n.language === 'en' ? 'en-GB' : 'fr-FR',
      {
        timeZone: 'UTC',
      },
    )
    return t('selection.refused.on_mission', { date })
  }

  return (
    <Card className="mb-3 flex flex-wrap items-start justify-between gap-2 p-3" role="status">
      <div className="min-w-0 flex-1">
        {archivedCount > 0 ? (
          <Text size="sm" weight="medium">
            {t('selection.archived', { count: archivedCount })}
          </Text>
        ) : null}
        {refused.length > 0 ? (
          <>
            <Text size="sm" className="text-[var(--warning-soft-text)]">
              {t('selection.refusedTitle', { count: refused.length })}
            </Text>
            <ul className="mt-1 list-disc ps-5">
              {refused.map((refusal, index) => (
                <li key={`${refusal.name ?? 'unnamed'}-${index}`}>
                  <Text size="sm" element="span">
                    {`${refusal.name ?? t('selection.refused.unnamed')} — ${reasonOf(refusal)}`}
                  </Text>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
      <Button variant="ghost" size="sm" onClick={onDismiss}>
        {t('selection.refused.dismiss')}
      </Button>
    </Card>
  )
}
