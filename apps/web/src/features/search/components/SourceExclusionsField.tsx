import { cn, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/**
 * #4142.6 — « Secteur public » et « Déjà travaillées », reliés à une SOURCE (ils étaient des boutons sans effet,
 * retirés par #4142) : le secteur public se lit sur le registre (catégorie juridique 7xxx ou section NAF O), « déjà
 * travaillées » dans le CRM de l'espace (affaire gagnée ou relation client). Une entreprise dont la source est
 * muette n'est ni retenue ni écartée — le texte le DIT, il ne promet pas plus que le serveur ne tient.
 */
export function SourceExclusionsField({
  publicSector,
  workedAccounts,
  onChange,
  disabled = false,
}: {
  publicSector: boolean
  workedAccounts: boolean
  onChange: (next: { exclude_public_sector?: boolean; exclude_worked_accounts?: boolean }) => void
  disabled?: boolean
}) {
  const { t } = useTranslation('search')
  const options = [
    { key: 'exclude_public_sector' as const, active: publicSector, label: t('confirm.sourceExclusions.publicSector') },
    {
      key: 'exclude_worked_accounts' as const,
      active: workedAccounts,
      label: t('confirm.sourceExclusions.workedAccounts'),
    },
  ]
  return (
    <div className="flex flex-col gap-1.5">
      {/* #4512 — pas de titre propre : ces deux exclusions vivent DANS le champ « Ce qu'on écarte ». */}
      <div role="group" aria-label={t('analyze.refine.exclude')} className="flex flex-wrap items-center gap-1.5">
        {options.map(option => (
          <button
            key={option.key}
            type="button"
            aria-pressed={option.active}
            disabled={disabled}
            // `undefined` quand on décoche : jamais un `false` qui se lirait comme un réglage posé.
            onClick={() => onChange({ [option.key]: option.active ? undefined : true })}
            className={cn(
              'inline-flex min-h-6 items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 pointer-coarse:min-h-11',
              option.active
                ? 'border-[var(--bellum-primary-500)] bg-[var(--bellum-primary-500)]/10 text-[var(--bellum-text-primary)]'
                : 'border-[var(--bellum-border)] text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)]',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('confirm.sourceExclusions.hint')}
      </Text>
    </div>
  )
}
