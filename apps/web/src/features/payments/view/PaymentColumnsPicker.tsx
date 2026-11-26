import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@bellum/ui'
import { SlidersHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PAYMENT_COLUMN_KEYS, PINNED_PAYMENT_COLUMN, type PaymentColumnKey } from '../columns'

/**
 * Le sélecteur de colonnes de l'écran des paiements.
 *
 * Il ne DÉCIDE rien : la règle « l'épinglée ne se décoche pas » vit dans
 * `usePaymentColumns`, et ce composant se contente de la MONTRER (case
 * désactivée, raison en infobulle). Une garde qui vivrait dans le rendu d'un
 * bouton disparaîtrait au premier autre appelant.
 *
 * `onSelect={event => event.preventDefault()}` : sans lui, le menu se referme à
 * chaque case cochée, et régler cinq colonnes demande cinq allers-retours.
 */
export function PaymentColumnsPicker({
  visible,
  onToggle,
  onReset,
}: {
  visible: readonly PaymentColumnKey[]
  onToggle: (key: PaymentColumnKey, visible: boolean) => void
  onReset: () => void
}) {
  const { t } = useTranslation('payments')
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {/* Un bouton à icône seule porte un nom (GA-32). */}
        <Button variant="outline" size="sm" aria-label={t('columnsMenu')}>
          <SlidersHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[60dvh] overflow-y-auto">
        <DropdownMenuLabel>{t('columnsMenu')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {PAYMENT_COLUMN_KEYS.map(key => {
          const pinned = key === PINNED_PAYMENT_COLUMN
          return (
            <DropdownMenuCheckboxItem
              key={key}
              checked={visible.includes(key)}
              disabled={pinned}
              title={pinned ? t('columnsPinned') : undefined}
              onSelect={event => event.preventDefault()}
              onCheckedChange={checked => onToggle(key, checked === true)}
            >
              {t(`columns.${key}`)}
            </DropdownMenuCheckboxItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onReset()}>{t('columnsReset')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
