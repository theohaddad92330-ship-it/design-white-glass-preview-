import { Box, Checkbox, Input, Label, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/**
 * #4431 — ce que la carte Salesforce demande AVANT « Connecter » : le domaine de l'organisation (facultatif)
 * et la case sandbox. Une organisation à domaine personnalisé refuse `login.salesforce.com`.
 *
 * Contrôlé par la carte (qui le lit au moment de connecter) : ce composant ne valide rien lui-même, il
 * montre la raison du refus (`error`) et, plus bas, la réponse du fournisseur au retour OAuth (`refusal`).
 */
export function SalesforceDomainField({
  domain,
  onDomainChange,
  sandbox,
  onSandboxChange,
  error,
  refusal,
}: {
  domain: string
  onDomainChange: (value: string) => void
  sandbox: boolean
  onSandboxChange: (value: boolean) => void
  /** Pourquoi le domaine saisi est refusé, ou `null`. */
  error: 'invalid' | 'host_not_allowed' | null
  /** Le texte rendu par Salesforce au retour OAuth, ou `null`. */
  refusal: string | null
}) {
  const { t } = useTranslation('settings', { keyPrefix: 'integrations' })
  return (
    <Box className="space-y-2">
      <Box display="flex" className="flex-col gap-1">
        <Label htmlFor="salesforce-domain" className="text-xs">
          {t('salesforceDomainLabel')}
        </Label>
        <Input
          id="salesforce-domain"
          className="h-11"
          inputMode="url"
          autoComplete="off"
          placeholder="societe.my.salesforce.com"
          value={domain}
          aria-invalid={error ? true : undefined}
          onChange={event => onDomainChange(event.target.value)}
        />
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('salesforceDomainHint')}
        </Text>
      </Box>
      <Box display="flex" className="min-h-11 items-center gap-2">
        <Checkbox
          id="salesforce-sandbox"
          checked={sandbox}
          onCheckedChange={value => onSandboxChange(value === true)}
        />
        <Text element="label" size="sm" htmlFor="salesforce-sandbox">
          {t('salesforceSandboxLabel')}
        </Text>
      </Box>
      {error ? (
        <Text element="p" size="xs" role="alert" className="text-[var(--danger-soft-text)]">
          {t(error === 'invalid' ? 'salesforceDomainInvalid' : 'salesforceDomainHostNotAllowed')}
        </Text>
      ) : null}
      {refusal ? (
        <Text element="p" size="xs" role="alert" className="text-[var(--danger-soft-text)]">
          {t('salesforceRefusal', { reason: refusal })}
        </Text>
      ) : null}
    </Box>
  )
}
