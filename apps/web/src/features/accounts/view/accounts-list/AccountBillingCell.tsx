import { ACCOUNT_BILLING_BLOCKER_ACTIONS, type AccountBillingBlocker } from '@bellum/contracts'
import { Badge, Box, Text, Tooltip, TooltipContent, TooltipTrigger } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { AccountBillingLens } from './useAccountBillingLens'

/**
 * LA CELLULE « FACTURABLE ? » — la lentille delivery, ligne par ligne.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ELLE NE DOUBLE PAS SA VOISINE
 * ─────────────────────────────────────────────────────────────────────────────
 * La colonne « Prêt à facturer » (`AccountInvoiceReadinessCell`) juge LE MOIS
 * des missions ; celle-ci juge LE CLIENT. Un compte sans mission rend « – » à
 * côté et un verdict ici, ce qui est exactement la différence que l'ops veut
 * voir : rien à facturer ce mois-ci ne veut pas dire que le client est prêt à
 * l'être.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CHAQUE BLOQUEUR MÈNE À L'ÉCRAN OÙ IL SE RÉPARE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Un indicateur de qualité qui ne mène nulle part ne sert à rien » : les
 * routes viennent de `ACCOUNT_BILLING_BLOCKER_ACTIONS`, jamais écrites à la
 * main ici — le même contrat que `BLOCKER_ACTIONS` côté mission. Les quatre
 * bloqueurs structurels mènent à la FICHE DU COMPTE (celle qui porte ses
 * entités), le bon de commande à la mission.
 *
 * ⚠️ Ce sont de vrais `<Link>` : ce qui se clique se tabule (GA-35). Un
 * `<div onClick>` n'a ni tabulation, ni Entrée, ni annonce.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS RENDUS, ET DEUX NE SONT PAS DES VERDICTS
 * ─────────────────────────────────────────────────────────────────────────────
 *  - `loading` — rien. Pas « prêt », pas « bloqué » : un badge vert affiché
 *    pendant un chargement est un mensonge qui dure une seconde et se croit.
 *  - `failed` — un texte court et lisible, même geste que la colonne voisine.
 *    « La lecture a échoué » ≠ « rien à réparer ».
 *  - un verdict — badge sémantique, bloqueurs NOMMÉS et cliquables.
 */
export function AccountBillingCell({ accountId, lens }: { accountId: string; lens: AccountBillingLens }) {
  const { t } = useTranslation('accounts')
  const badge = lens.get(accountId)

  // ⚠️ L'ordre compte : `failed` AVANT `loading`. Une lecture qui a échoué n'est
  // pas « encore en train de charger », et la ranger dans le silence ferait
  // attendre indéfiniment devant une colonne vide.
  if (lens.failed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex cursor-help outline-none">
            <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
              {t('list.billing.failedShort')}
            </Text>
          </span>
        </TooltipTrigger>
        <TooltipContent>{t('list.billing.failed')}</TooltipContent>
      </Tooltip>
    )
  }
  // Le silence du chargement : aucune forme, aucun mot. Le squelette du tableau
  // porte déjà l'attente.
  if (!badge) return null

  if (badge.state === 'ready') {
    return (
      <Badge variant="success" aria-label={t('list.billing.ready')}>
        {t('list.billing.ready')}
      </Badge>
    )
  }

  return (
    <Box className="flex flex-col items-start gap-1">
      <Badge variant="warning" aria-label={t('list.billing.blocked')}>
        {t('list.billing.blocked')}
      </Badge>
      {/* Les bloqueurs NOMMÉS, chacun vers son écran de réparation. Bornés à
          deux : au-delà, la ligne du tableau devient un paragraphe et plus
          personne ne lit le premier — le reste se compte, sans se taire. */}
      <Box className="flex flex-col items-start gap-0.5">
        {badge.blockers.slice(0, 2).map(blocker => (
          <BlockerLink key={blocker} accountId={accountId} blocker={blocker} />
        ))}
        {badge.blockers.length > 2 ? (
          <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
            {t('list.billing.more', { count: badge.blockers.length - 2 })}
          </Text>
        ) : null}
      </Box>
    </Box>
  )
}

/**
 * Un bloqueur, et le chemin qui le lève.
 *
 * ⚠️ La route STRUCTURELLE (`/accounts`) est complétée par l'identifiant du
 * compte : le geste se fait sur CETTE fiche, et renvoyer sur la liste ferait
 * recommencer la recherche. `ACCOUNT_BILLING_BLOCKER_ACTIONS` porte l'écran,
 * l'identifiant est la seule chose que le contrat ne peut pas connaître.
 */
function BlockerLink({ accountId, blocker }: { accountId: string; blocker: AccountBillingBlocker }) {
  const { t } = useTranslation('accounts')
  const label = t(`list.billing.blockers.${blocker}`)
  const { route } = ACCOUNT_BILLING_BLOCKER_ACTIONS[blocker]

  if (route === '/accounts') {
    return (
      <Link
        to="/accounts/$id"
        params={{ id: accountId }}
        className="text-xs text-[var(--bellum-text-accent)] underline-offset-2 hover:underline"
      >
        {label}
      </Link>
    )
  }
  return (
    <Link to="/missions" className="text-xs text-[var(--bellum-text-accent)] underline-offset-2 hover:underline">
      {label}
    </Link>
  )
}
