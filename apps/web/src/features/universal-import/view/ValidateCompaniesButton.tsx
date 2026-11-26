import { Button, Text } from '@bellum/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { validateImportCompanies } from '../api'

/**
 * #AM.9 (#4053) — « Valider les sociétés proposées » : un clic crée les sociétés que le bilan proposait, sans
 * refaire l'import avec un fichier comptes. Un homonyme ou une référence inconnue reste proposé (jamais fusionné).
 */
export function ValidateCompaniesButton({ jobId }: { jobId: string }) {
  const { t } = useTranslation('importWizard')
  const queryClient = useQueryClient()
  const validate = useMutation({
    mutationFn: () => validateImportCompanies(jobId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['universal-import'] }),
  })
  return (
    <div className="space-y-1" data-testid="validate-companies">
      <Button
        variant="secondary"
        size="sm"
        disabled={validate.isPending || validate.isSuccess}
        onClick={() => validate.mutate()}
      >
        {validate.isPending ? t('universal.validateCompanies.running') : t('universal.validateCompanies.action')}
      </Button>
      {validate.isSuccess ? (
        <Text size="sm" role="status">
          {validate.data.created > 0
            ? t('universal.validateCompanies.done', { count: validate.data.created })
            : t('universal.validateCompanies.nothing')}
        </Text>
      ) : null}
      {validate.isError ? (
        <Text size="sm" role="alert" className="text-[var(--danger-soft-text)]">
          {t('universal.validateCompanies.error')}
        </Text>
      ) : null}
    </div>
  )
}
