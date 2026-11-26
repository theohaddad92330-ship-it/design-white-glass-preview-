import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/**
 * Les « informations complémentaires importées » d'une fiche — les colonnes du
 * fichier qui n'avaient AUCUN champ d'accueil (`extra`, import universel du
 * 27/09/2026). On ne les a ni écrasées ni jetées : elles s'affichent ici, sous
 * leur en-tête d'origine, telles que le fichier les portait.
 *
 * Rien à montrer ⇒ rien de rendu : une absence ne fait aucune ligne, et jamais
 * un « 0 » (doctrine « on n'affiche pas ce qu'on n'a pas »).
 */
export function ImportedExtraCard({ extra }: { extra: Readonly<Record<string, string>> | null | undefined }) {
  const { t } = useTranslation('importWizard')
  const entries = Object.entries(extra ?? {}).filter(([, value]) => typeof value === 'string' && value.trim() !== '')
  if (entries.length === 0) return null
  return (
    <section
      aria-labelledby="imported-extra-title"
      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5"
    >
      <Text
        element="h3"
        id="imported-extra-title"
        size="sm"
        weight="semibold"
        className="mb-3 text-[var(--text-primary)]"
      >
        {t('universal.extra.title')}
      </Text>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {entries.map(([header, value]) => (
          <div key={header} className="min-w-0">
            <dt>
              <Text size="xs" className="text-[var(--text-muted)]">
                {header}
              </Text>
            </dt>
            <dd>
              <Text size="sm" className="break-words text-[var(--text-primary)]">
                {value}
              </Text>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
