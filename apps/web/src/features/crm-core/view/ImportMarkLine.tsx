import { Text } from '@bellum/ui'
import type { RecordImportMark } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'

/**
 * #4051 — « Importé le <date> depuis <fichier ou outil> » : la ligne d'origine d'une fiche arrivée par un import.
 * La source est le NOM du fichier déposé ou de l'outil branché du client — jamais un fournisseur à nous. Rien
 * quand la fiche n'a jamais été importée (jamais une date ou une source devinée).
 */
export function ImportMarkLine({ mark }: { mark: RecordImportMark | null | undefined }) {
  const { t, i18n } = useTranslation('crm')
  if (!mark) return null
  const date = new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'medium' }).format(
    new Date(mark.importedAt),
  )
  return (
    <Text data-testid="import-mark-line" size="sm" color="text-muted-foreground">
      {t('history.importedFrom', { date, source: mark.sourceLabel })}
    </Text>
  )
}
