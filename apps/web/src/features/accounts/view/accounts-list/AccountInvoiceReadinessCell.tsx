import { Badge, Text, Tooltip, TooltipContent, TooltipTrigger } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { InvoiceReadinessState } from '@bellum/contracts'
import type { AccountInvoiceReadinessColumn } from './useAccountInvoiceReadiness'

/**
 * LA COLONNE « PRÊT À FACTURER » DU PORTEFEUILLE (manque A du 30/08).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE VOCABULAIRE EST CELUI DE L'ÉCRAN FACTURATION, PAS UN SECOND
 * ─────────────────────────────────────────────────────────────────────────────
 * Les libellés d'état (« Bloqué », « Prêt », « Facturé ailleurs », « Pas dû ce
 * mois ») et de bloqueur (« Aucun relevé d'activité »…) sont lus dans le
 * namespace `missions` (`readiness.states.*`, `readiness.blockers.*`) — le même
 * que `InvoiceReadinessPanel.tsx`. Une seconde copie de ces phrases dans
 * `accounts.json` diplomatiquement identique aujourd'hui diverge dès que l'une
 * des deux est retouchée sans l'autre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUATRE RENDUS, ET LE PREMIER N'EST PAS UN DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 *  - `failed` — la lecture a échoué. Ne se lit jamais comme « rien à facturer ».
 *  - `none` — ce compte n'a AUCUNE mission. Un tiret neutre, jamais rouge,
 *    jamais un badge « bloqué » : il n'a rien à facturer, ce n'est pas un défaut
 *    (point 3 du lot).
 *  - `unmeasured` — ce compte a des missions, mais aucune n'a produit de ligne
 *    de facturation ce mois (plafond de lecture, ou hors période). « Non
 *    mesuré » n'est jamais « sans mission » — CE compte-là a un geste
 *    potentiel qui manque, l'autre n'en a aucun.
 *  - `measured` — un badge de couleur sémantique, ses bloqueurs NOMMÉS dans le
 *    titre quand il est bloqué.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * F2 du 30/08 — TROIS ABSENCES DISTINCTES À L'ŒIL, PAS SEULEMENT DANS LE TEXTE
 * CACHÉ (mesuré en production : un tiret identique pour les trois)
 * ─────────────────────────────────────────────────────────────────────────────
 * Le rapport initial comptait quatre phrases lues au survol. Recompte : cette
 * colonne n'en porte que TROIS qui rendaient un « – » identique — `failed`,
 * `none`, `unmeasured` (le rendu `measured`, ex. « Facturé ailleurs », est déjà
 * un badge coloré LISIBLE, pas un tiret — voir `GA-206`). Les deux autres
 * phrases citées (« Aucun mois facturé sur ce compte », « Des mois sont
 * facturés, aucun ne porte de montant saisi ») appartiennent à la colonne CA
 * VOISINE (`AccountRevenueCell.tsx`), pas à celle-ci.
 *
 * ⚠️ Le point qui décide de la qualité : « sans objet » (`none`, rien à
 * attendre) et « non mesuré » (`unmeasured`, on s'attendrait à quelque chose)
 * ne sont PAS la même situation, et ne se distinguaient qu'au `title` — un
 * lecteur d'écran recevait l'info, un œil ne voyait rien. D775 : `none` GARDE
 * le tiret nu, muet, sans forme — c'est la SEULE des trois absences qui n'a
 * rien d'anormal à signaler. D776 : `unmeasured` prend une FORME visible —
 * une pilule en creux (`Badge variant="outline"`) — jamais seulement un texte
 * caché. D777 : `failed` prend un texte court et lisible, même geste que
 * `list.accessClassFailedShort` deux colonnes plus loin pour la même
 * distinction (« la lecture a échoué » ≠ « rien à lire »).
 *
 * D778 : toute infobulle posée ici s'ouvre AUSSI au focus clavier — `Tooltip`
 * de `@bellum/ui` (Radix), jamais un `title` seul, qui n'existe pour personne
 * qui tabule. Même geste que `AccountCostChip.tsx`.
 */
const STATE_VARIANT: Record<InvoiceReadinessState, 'warning' | 'success' | 'secondary' | 'outline'> = {
  blocked: 'warning',
  ready: 'success',
  invoiced: 'secondary',
  not_due: 'secondary',
  // #2197.41 — contour, jamais le badge PLEIN réservé à ce qui est PROUVÉ par
  // un connecteur : une déclaration humaine ne se lit pas comme une preuve.
  invoiced_declared: 'outline',
}

export function AccountInvoiceReadinessCell({
  accountId,
  column,
}: {
  accountId: string
  column: AccountInvoiceReadinessColumn
}) {
  const { t } = useTranslation('accounts')
  const badge = column.get(accountId)
  // Trois lignes courtes plutôt qu'un `t(...)` inline dans le JSX : GA-183 lit
  // SUR LA MÊME LIGNE que chaque `if`, et un retour à la ligne posé par
  // Prettier (`unmeasured` dépasse 120 colonnes en une seule expression) lui
  // ferait perdre `UnknownCell` de vue — un faux rouge sur un rendu juste.
  const failedReason = t('list.invoiceReadiness.failed')
  const noneReason = t('list.invoiceReadiness.none')
  const unmeasuredReason = t('list.invoiceReadiness.unmeasured')

  if (column.failed) return <UnknownCell variant="failed" reason={failedReason} />
  if (badge.kind === 'none') return <UnknownCell variant="none" reason={noneReason} />
  if (badge.kind === 'unmeasured') return <UnknownCell variant="unmeasured" reason={unmeasuredReason} />

  const stateLabel = t(`readiness.states.${badge.state}`, { ns: 'missions' })
  const title =
    badge.state === 'blocked' && badge.blockers.length > 0
      ? t('list.invoiceReadiness.blockedTooltip', {
          blockers: badge.blockers.map(blocker => t(`readiness.blockers.${blocker}`, { ns: 'missions' })).join(', '),
        })
      : stateLabel

  return (
    <Badge variant={STATE_VARIANT[badge.state]} title={title} aria-label={title}>
      {stateLabel}
    </Badge>
  )
}

/**
 * Les TROIS absences — GA-183 vérifie SUR CETTE LIGNE que `none` et
 * `unmeasured` n'appellent jamais `<Badge` directement dans
 * `AccountInvoiceReadinessCell` (jamais peints dans la couleur sémantique
 * d'un état mesuré) : la distinction visuelle vit donc ICI, dans un
 * composant nommé `UnknownCell` comme avant, jamais inline dans le `if`.
 *
 * D775/D776/D777 (voir le docblock au-dessus) : trois FORMES, pas trois
 * textes cachés sur le même tiret —
 *  · `none`      — tiret nu, muet, sans forme (rien d'anormal à montrer) ;
 *  · `unmeasured` — pilule EN CREUX (`Badge variant="outline"`, jamais une
 *    couleur sémantique — la seule différence avec un état mesuré tient à la
 *    FORME, pas à un rouge/orange qui laisserait croire à un blocage) ;
 *  · `failed`    — texte court et lisible, même geste que
 *    `list.accessClassFailedShort` sur la colonne Accessibilité.
 *
 * D778 : Radix `Tooltip` (`@bellum/ui`), pas un `title` seul — `TooltipTrigger
 * asChild` rend le `<span tabIndex={0}>` focusable, et le focus ouvre le même
 * `TooltipContent` que le survol (même idiome que `AccountCostChip.tsx`).
 * L'élément visible porte SON PROPRE `aria-label` : le texte doit rester
 * lisible même si `TooltipContent` n'est jamais ouvert (lecteur d'écran, ou
 * test qui ne simule pas le survol).
 */
function UnknownCell({ variant, reason }: { variant: 'failed' | 'none' | 'unmeasured'; reason: string }) {
  const { t } = useTranslation('accounts')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex cursor-help outline-none">
          {variant === 'none' && (
            <Text element="span" size="sm" className="text-[var(--bellum-text-muted)]" aria-label={reason}>
              –
            </Text>
          )}
          {variant === 'unmeasured' && (
            <Badge variant="outline" className="text-[var(--bellum-text-muted)]" aria-label={reason}>
              {t('list.invoiceReadiness.unmeasuredBadge')}
            </Badge>
          )}
          {variant === 'failed' && (
            <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]" aria-label={reason}>
              {t('list.invoiceReadiness.failedShort')}
            </Text>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  )
}
