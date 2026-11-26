import { classifyAgendaObject, type AgendaEvent } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { Tag } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * #2390.1 — la NATURE de l'évènement (rendez-vous externe, absence, temps de
 * concentration…), calculée par `classifyAgendaObject` depuis les seuls champs
 * que le fournisseur rend. Une ligne, au même rang que `RoomLines` : source
 * unique pour la grille et la liste (GA-26).
 */
export function AgendaKindLine({ event }: { event: AgendaEvent }) {
  const { t } = useTranslation('briefing')
  return (
    <Text size="xs" className="flex items-center gap-1 text-[var(--bellum-text-secondary)]">
      <Tag className="size-3 shrink-0" />
      {t(`agenda.board.kind.${classifyAgendaObject(event)}`)}
    </Text>
  )
}
