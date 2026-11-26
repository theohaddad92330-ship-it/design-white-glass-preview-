import { roomAttendeesOf, roomCapacityShortfalls, type AgendaEvent } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { AlertTriangle, DoorOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * #2390.9 — les salles réservées d'un évènement, sur leurs propres lignes : une
 * salle n'est jamais un invité. Le nombre de places n'apparaît que s'il a été
 * LU chez le fournisseur ; une salle trop petite est signalée, pas « corrigée ».
 * Pas de salle, aucune ligne. Source unique pour la grille et la liste (GA-26).
 */
export function RoomLines({ event }: { event: AgendaEvent }) {
  const { t } = useTranslation('briefing')
  const rooms = roomAttendeesOf(event)
  const tooSmall = roomCapacityShortfalls(event)
  return (
    <>
      {rooms.map(room => {
        const name = room.displayName || room.email
        const shortfall = tooSmall.find(entry => entry.room.email === room.email)
        return (
          <Text key={room.email} size="xs" className="flex flex-col gap-0.5 text-[var(--bellum-text-secondary)]">
            <span className="flex items-center gap-1">
              <DoorOpen className="size-3 shrink-0" />
              {room.capacity !== undefined
                ? t('agenda.board.roomSeats', { name, count: room.capacity })
                : t('agenda.board.room', { name })}
            </span>
            {shortfall ? (
              <span className="flex items-center gap-1 text-[var(--danger-soft-text)]">
                <AlertTriangle className="size-3 shrink-0" />
                {t('agenda.board.roomTooSmall', { people: shortfall.people, count: shortfall.capacity })}
              </span>
            ) : null}
          </Text>
        )
      })}
    </>
  )
}
