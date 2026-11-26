import { useAccountVerdictUnchanged } from '@/features/accounts/hooks/useAccountVerdictUnchanged'
import { useHasOfferObjective } from '@/features/profile/hooks/useEsnProfile'
import { VerdictRevisionCard } from './VerdictRevisionCard'

/**
 * #4180 (recette prod R41, Thales › Vue d'ensemble) — « Même verdict depuis le … » : l'endpoint
 * (`GET /accounts/:id/verdict-unchanged`) rendait bien la date et la carte existait, mais elle n'était montée que
 * dans « Historique des analyses », un repli FERMÉ de la Vue d'ensemble — 0 occurrence à l'écran quand Laura, elle,
 * dit « n'a pas changé : RÉSERVE depuis le 12 octobre ». Ici la ligne se lit à l'ouverture, sous la même lecture
 * que le chat (`compareLastRuns`, GA-26). `null` (verdict changé, une seule analyse, illisible) ⇒ aucune ligne.
 */
export function VerdictUnchangedLine({ accountId }: { accountId: string }) {
  const { data: unchanged } = useAccountVerdictUnchanged(accountId)
  const hasObjective = useHasOfferObjective()
  return <VerdictRevisionCard revision={null} hasObjective={hasObjective} unchanged={unchanged} />
}
