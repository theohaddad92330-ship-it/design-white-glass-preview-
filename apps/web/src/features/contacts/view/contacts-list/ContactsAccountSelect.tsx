import { SelectField } from '@bellum/ui'
import { capitalize } from '@bellum/utils'
import { useTranslation } from 'react-i18next'

/**
 * Théo B c1-repertoire.R7 / N4 — « Tous les comptes » : le filtre `company` (déjà dans l'URL et dans la
 * modale « Affiner le répertoire ») mis à portée de main, sans second réglage (GA-26). Les options sont
 * les entreprises RÉELLES de l'espace (`useAccountCompanies`), jamais une liste fabriquée.
 */
export function ContactsAccountSelect({
  companies,
  value,
  onChange,
}: {
  companies: readonly string[]
  value: string | undefined
  onChange: (next: string | null) => void
}) {
  const { t } = useTranslation('contacts')
  const options = companies.map(company => capitalize(company))
  const current = value ?? ''
  const all = current && !options.includes(current) ? [current, ...options] : options
  return (
    <SelectField
      size="sm"
      ariaLabel={t('accountSelect.aria', { value: current || t('accountSelect.all') })}
      value={current}
      onChange={next => onChange(next || null)}
      emptyOption={{ label: t('accountSelect.all') }}
      options={all.map(option => ({ value: option, label: option }))}
      className="w-48 max-w-60"
    />
  )
}
