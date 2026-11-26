import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useAccountCrmProvenance } from '@/features/crm/hooks/useAccountCrmProvenance'
import { formatDate } from '@/lib/locale'

/**
 * #4680 — « Périmètre & données » dit quand le compte vient d'un import : « importé le JJ/MM/AAAA depuis un
 * fichier » (ou « depuis un outil branché »). La trace est celle du client (`record_import_marks`) ; sans trace,
 * aucune ligne — ce tiroir dit alors EXACTEMENT ce qu'il disait. Date inconnue → on le dit, jamais une date devinée.
 */
export function AccountImportLine() {
  const { t } = useTranslation('accounts')
  const accountImport = useAccountCrmProvenance()?.accountImport
  if (!accountImport) return null
  const date = formatDate(accountImport.importedAt)
  return (
    <Text element="p" size="sm" data-testid="scope-account-import" className="text-[var(--bellum-text-secondary)]">
      {date
        ? t(`header.scope.importedOn.${accountImport.kind}`, { date })
        : t(`header.scope.importedUnknownDate.${accountImport.kind}`)}
    </Text>
  )
}
