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
import { MISSION_COLUMN_KEYS, PINNED_MISSION_COLUMN, type MissionColumnKey } from '../columns'

/**
 * Choisir les colonnes de la liste des missions.
 *
 * Il ne DÉCLARE rien : ni les colonnes (elles vivent dans `columns.ts`), ni le
 * choix (il vit dans `useMissionColumns`). Il ne fait que les rendre — c'est
 * ce qui empêche le sélecteur et le tableau de diverger (GA-26).
 *
 * ⚠️ La colonne qui NOMME la ligne est montrée cochée et DÉSACTIVÉE, jamais
 * omise : une case absente se lit comme un oubli, et l'utilisateur cherche
 * pourquoi il ne peut pas la décocher. La désactiver le DIT, avec sa raison en
 * infobulle. La règle elle-même est tenue dans le hook, pas ici — un garde-fou
 * qui vit dans le rendu d'un bouton disparaît au premier autre appelant.
 */
export function MissionColumnsPicker({
  visible,
  onToggle,
  onReset,
  /** #2195.20 — les colonnes que l'ÉCRAN déclare comme son sujet. Même
   *  traitement que l'épinglée : cochée, désactivée, avec son infobulle. Le
   *  verrou lui-même vit dans `useMissionColumns`, pas dans cette case. */
  locked = [],
}: {
  visible: readonly MissionColumnKey[]
  onToggle: (key: MissionColumnKey, visible: boolean) => void
  onReset: () => void
  locked?: readonly MissionColumnKey[]
}) {
  const { t } = useTranslation('missions')

  return (
    // `modal={false}` : le menu ne verrouille pas le reste de la page. Un
    // tableau se parcourt en même temps qu'on coche.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontal className="mr-2 size-4" aria-hidden="true" />
          {t('table.columnsCta')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[60dvh] overflow-y-auto">
        <DropdownMenuLabel>{t('table.columnsLabel')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {MISSION_COLUMN_KEYS.map(key => {
          const pinned = key === PINNED_MISSION_COLUMN
          const lockedHere = locked.includes(key)
          return (
            <DropdownMenuCheckboxItem
              key={key}
              checked={visible.includes(key)}
              disabled={pinned || lockedHere}
              title={pinned ? t('table.columnsPinned') : lockedHere ? t('table.columnsLocked') : undefined}
              // Le menu reste ouvert : cocher trois colonnes ne doit pas
              // demander trois ouvertures.
              onSelect={event => event.preventDefault()}
              onCheckedChange={checked => onToggle(key, checked === true)}
            >
              {t(`table.${key}`)}
            </DropdownMenuCheckboxItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onReset()}>{t('table.columnsReset')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
