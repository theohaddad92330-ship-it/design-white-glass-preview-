import { Box, Button, Text } from '@bellum/ui'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type MissionsSourceFilterNoticeProps = {
  /** Le compte sur lequel la liste est resserrée, si le lien en porte un. */
  accountId: string | undefined
  consultantId: string | undefined
  /**
   * Le nom du compte, LU sur les lignes rendues.
   *
   * `undefined` quand la liste filtrée est vide : on ne le connaît alors pas, et
   * l'écrire d'après une autre source — ou pire, afficher l'identifiant brut —
   * serait une donnée de remplissage.
   */
  accountName: string | undefined
  /** Refonte Théo — le nom de la personne, LU sur les lignes rendues ; `undefined` sans ligne. */
  consultantName?: string | undefined
  onRemove: () => void
}

/**
 * §4.4 — UN ÉCRAN FILTRÉ LE DIT.
 *
 * Le bandeau « ce client vous a rapporté X € sur N missions » porte un lien vers
 * l'écran où le chiffre se CALCULE : `/missions?accountId=…`. Une fois le filtre
 * appliqué, il reste un piège symétrique du premier — un écran resserré et
 * MUET fait croire que l'espace n'a que ces missions-là. « 3 missions » lu comme
 * un total est aussi faux que la liste entière lue comme le périmètre du compte.
 *
 * D'où trois choses, ensemble : ce qui est filtré est NOMMÉ, la restriction est
 * dite en toutes lettres, et elle se retire d'un bouton — tabulable, annoncé, et
 * agrandi au doigt (`pointer-coarse:min-h-11`).
 */
export function MissionsSourceFilterNotice({
  accountId,
  consultantId,
  accountName,
  consultantName,
  onRemove,
}: MissionsSourceFilterNoticeProps) {
  const { t } = useTranslation('missions')
  if (!accountId && !consultantId) return null

  const label = accountId
    ? accountName
      ? t('sourceFilter.account', { name: accountName })
      : t('sourceFilter.accountUnnamed')
    : consultantName
      ? t('sourceFilter.consultantNamed', { name: consultantName })
      : t('sourceFilter.consultant')

  // Théo `.m5-source` — un bandeau teinté : qui, d'où l'on vient, et le geste pour tout revoir.
  return (
    <Box
      display="flex"
      className="flex-wrap items-center gap-3 rounded-card border border-[var(--bellum-border)] bg-[var(--accent-soft-bg)] px-4 py-3"
      role="status"
      data-testid="missions-source-banner"
    >
      <Box className="min-w-0">
        <Text element="p" size="sm" weight="semibold" className="block text-[var(--bellum-text-primary)]">
          {label}
        </Text>
        <Text element="span" size="sm" className="block text-[var(--bellum-text-secondary)]">
          {t('sourceFilter.hint')}
        </Text>
      </Box>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onRemove}
        aria-label={t('sourceFilter.remove')}
        className="ml-auto gap-1.5 pointer-coarse:min-h-11"
      >
        <X className="size-4" aria-hidden="true" />
        <Text element="span" size="sm">
          {t('sourceFilter.removeShort')}
        </Text>
      </Button>
    </Box>
  )
}
