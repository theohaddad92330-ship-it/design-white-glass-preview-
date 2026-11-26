import type { OrgLinkOrigin, OrgSource } from '@bellum/contracts'
import { Text, cn } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { OrgSourceChips } from './OrgSourceChips'

/**
 * LE TRAIT — plein quand quelqu'un l'a observé, pointillé quand on le suppose.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE COMPOSANT EXISTE, ET POURQUOI IL DIT SON ÉTAT EN TOUTES LETTRES
 * ─────────────────────────────────────────────────────────────────────────
 * C'est LE cœur de l'organigramme du produit : un rattachement deviné lu comme
 * un fait envoie le commercial au mauvais interlocuteur, en lui donnant
 * l'assurance du contraire. Les trois vues commutables du 31/08/2026 dessinent
 * toutes ce même rattachement — aucune des trois maquettes ne portait la
 * distinction, et c'est ici qu'elle est rendue impossible à perdre.
 *
 * ⚠️ **Un motif de bordure ne suffit pas** (GA-50, mesuré sur la carte
 * d'influence) : `border-dashed` contre `border-solid` sur un `<span
 * aria-hidden>` ne dit RIEN à un lecteur d'écran, et rien sur une impression en
 * niveaux de gris. Le trait est donc DOUBLÉ d'une phrase, toujours.
 *
 * ⚠️ **La règle n'est pas ici** : elle est au contrat (`orgLinkOrigin`), lue une
 * seule fois dans `focalOrgData` et transportée sur la carte. Ce composant ne
 * décide de rien, il RESTITUE — sans quoi trois écrans finiraient par avoir
 * trois seuils.
 *
 * Quatre états, ceux du contrat, et pas un de plus :
 *   · `sourced`   — le graphe le déclare vérifié ET la preuve est montrable ;
 *   · `declared`  — #2121.35 : un commercial l'a déclaré depuis le terrain
 *                   (`kind: 'workspace_user'`) — plein, mais une DÉCLARATION
 *                   plutôt qu'un document tiers, et son libellé le dit ;
 *   · `structure` — l'appartenance d'une entité à son groupe. Plein, mais il ne
 *                   dit PAS « quelqu'un a observé ce rattachement » : c'est la
 *                   forme du groupe. Son libellé le nomme autrement, exprès ;
 *   · `assumed`   — tout le reste, pointillé, avec ou sans appui.
 */
export function OrgLinkMarker({
  origin,
  sources = [],
  className,
}: {
  origin: OrgLinkOrigin
  /** Les preuves RÉSOLUES du lien, quand l'écran peut les montrer. */
  sources?: OrgSource[]
  className?: string
}) {
  const { t } = useTranslation('accountOrg')
  const dashed = origin === 'assumed'
  const key = origin === 'assumed' ? (sources.length > 0 ? 'assumedSupported' : 'assumedUnsourced') : origin
  return (
    <span className={cn('mt-1.5 flex flex-wrap items-center gap-1.5', className)}>
      <span
        aria-hidden
        className={cn(
          'inline-block w-6 shrink-0 border-t-2',
          dashed ? 'border-dashed border-[var(--bellum-text-muted)]' : 'border-solid',
          origin === 'sourced' && 'border-[var(--success-soft-text)]',
          origin === 'structure' && 'border-[var(--bellum-text-accent)]',
        )}
      />
      <Text size="xs" className={dashed ? 'text-[var(--bellum-text-muted)]' : 'text-[var(--bellum-text-secondary)]'}>
        {t(`orgMap.link.${key}`)}
      </Text>
      {/* « Appuyée sur » n'est pas une formule : les preuves suivent. Sans elles
          la phrase promettrait un appui que l'écran ne montre pas. */}
      {key === 'assumedSupported' ? <OrgSourceChips sources={sources} max={2} /> : null}
    </span>
  )
}
