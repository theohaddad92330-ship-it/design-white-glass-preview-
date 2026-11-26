import { REPLY_BADGE_TONES, type ReplyBadgeCode, type ReplyBadgeLabels } from '@bellum/contracts'
import { Badge } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

const VARIANT = { neutral: 'outline', info: 'info', success: 'success', warning: 'warning' } as const

/**
 * #3764 — les badges de statut d'une réponse de Laura : au plus trois, un seul
 * libellé par situation (`replyBadges.status.*`), le même d'une réponse à
 * l'autre. Aucun badge quand la situation ne dit rien.
 */
export function ReplyBadges({
  labels,
  sourceNames = [],
}: {
  labels: ReplyBadgeLabels
  /** #3861 — les sources non consultées, portées par le badge « Qualification complémentaire nécessaire ». */
  sourceNames?: readonly string[]
}) {
  const { badges } = labels
  // #3764 gagne sur #3861.3 (Louis, 11/10) : aucune pastille « Incomplet » / « Complétude » — le fait « des
  // sources n'ont pas été consultées » se dit UNE fois, par « Qualification complémentaire nécessaire »
  // (qui nomme les sources) ou par « Cartographie partielle ».
  if (!badges.length) return null
  return (
    <>
      {badges.map(code => (
        <ReplyCodeBadge key={code} code={code} sourceNames={code === 'qualification_needed' ? sourceNames : []} />
      ))}
    </>
  )
}

/**
 * UN badge de statut PAR CODE, un seul rendu (GA-26) : le pied de réponse ET le niveau d'un compte classé
 * (#3764, lot L1 07/10 — « Prioritaire / À surveiller / À qualifier » sur `account_ranking`).
 */
export function ReplyCodeBadge({ code, sourceNames = [] }: { code: ReplyBadgeCode; sourceNames?: readonly string[] }) {
  const { t } = useTranslation('chat')
  const label = t(`replyBadges.status.${code}`)
  return (
    <Badge
      variant={VARIANT[REPLY_BADGE_TONES[code]]}
      data-reply-badge={code}
      // recette MZ 10/10 (#3861) — une pilule qui porte une LISTE de noms s'enroule (rayon moindre,
      // texte à gauche) au lieu de déborder en `nowrap` ; sans noms, la pilule reste mono-ligne.
      className={
        sourceNames.length > 0 ? 'h-auto max-w-full whitespace-normal rounded-xl text-left leading-snug' : undefined
      }
    >
      {sourceNames.length > 0 ? t('replyBadges.withSources', { label, names: sourceNames.join(' · ') }) : label}
    </Badge>
  )
}
