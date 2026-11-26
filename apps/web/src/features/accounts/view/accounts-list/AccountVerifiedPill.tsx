import { accountIdentityProof, type AccountBillingProfile } from '@bellum/contracts'
import { Tooltip, TooltipContent, TooltipTrigger } from '@bellum/ui'
import { BadgeCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Provenance } from '@/components/primitives/Provenance'

/**
 * LA PASTILLE « VÉRIFIÉ », ET CE QU'ELLE A LE DROIT D'AFFIRMER (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN BADGE QUI NE DIT PAS CE QU'IL VÉRIFIE EST UN ORNEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * La maquette pose une pastille bleue à côté de chaque nom. Telle quelle, elle
 * ne dit rien : vérifié par qui, quand, et sur quoi ? Trois questions sans
 * réponse valent moins qu'un nom nu, parce qu'elles font croire à une garantie.
 *
 * Ce qu'elle affirme ici est précis et borné : **l'identité légale du payeur a
 * été confirmée, par cette source, à cette date.** Rien de plus — ni la
 * solvabilité, ni la qualité de la relation, ni l'exactitude du reste de la
 * fiche.
 *
 * La source ET la date passent par la primitive `Provenance`, celle-là même que
 * le dépôt impose partout ailleurs. Le couple incomplet ne s'affiche jamais :
 * `accountIdentityProof` (contrats, testé) rend `null` sur une source sans date
 * comme sur une date sans source.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QU'ELLE NE FAIT PAS : DIRE « NON VÉRIFIÉ »
 * ─────────────────────────────────────────────────────────────────────────────
 * Sans preuve, elle ne rend RIEN. Un badge gris ou rouge sur le nom d'un client
 * ferait porter à CE CLIENT un reproche qui nous revient : ce n'est pas lui qui
 * est douteux, c'est notre fiche qui est incomplète. Le geste manquant se
 * propose sur la fiche du compte, pas comme une accusation dans une liste.
 */
export function AccountVerifiedPill({ profile }: { profile: AccountBillingProfile | null }) {
  const { t } = useTranslation('accounts')
  const proof = accountIdentityProof(profile)
  if (!proof) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* `tabIndex={0}` : ce qui porte une information se atteint au clavier.
            Le nom accessible dit ce que l'icône seule ne dit pas (GA-32). */}
        <span
          tabIndex={0}
          aria-label={t('card.verified.aria', { date: proof.checkedOn })}
          className="inline-flex shrink-0 cursor-help text-[var(--bellum-text-accent)] outline-none"
        >
          <BadgeCheck className="size-4" aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <span className="block">{t('card.verified.title')}</span>
        {/* La SOURCE et la DATE, par la primitive du dépôt. `public` pour un
            registre — le nom d'un registre public EST la garantie ; `human`
            pour une saisie dont quelqu'un de l'espace répond. */}
        <Provenance
          source={proof.source === 'public_registry' ? 'public' : 'human'}
          observedAt={proof.checkedOn}
          detail={t(`card.verified.sources.${proof.source}`)}
        />
      </TooltipContent>
    </Tooltip>
  )
}
