import { Badge, Text, Tooltip, TooltipContent, TooltipTrigger } from '@bellum/ui'
import { Coins } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAccountCost } from '@/features/accounts/hooks/useAccountCost'

type AccountCostChipProps = {
  accountId: string
}

/**
 * Ce que ce compte a COÛTÉ AU COMMERCIAL : le nombre d'analyses consommées.
 *
 * L'en-tête affichait le coût fournisseur brut — « Coût : 0,25 € » — réservé aux
 * rôles qui gèrent la facturation. Deux problèmes : ce montant est le prix que
 * NOUS payons (Claude, Apollo, Pappers…), pas une information de vente ; et il
 * n'a jamais eu sa place sur la fiche d'un compte, sous les yeux d'un client
 * pendant une démo. La restitution TF1 (p9) tranche : « Le coût fournisseur brut
 * ne doit pas être visible au client. Afficher crédit consommé ; garder le coût
 * dans le Manager. »
 *
 * Le montant en euros reste donc consultable là où il sert — le cockpit Manager
 * (coûts, providers, erreurs). Ici on annonce ce que le commercial comprend et
 * peut arbitrer : le nombre d'analyses passées sur ce compte. Ce n'est plus une
 * donnée de facturation, donc plus de garde `billing:manage` : un commercial a
 * besoin de savoir ce qu'il a déjà dépensé sur son propre dossier.
 *
 * Present-only : aucune analyse comptée ⇒ rien ne s'affiche, jamais un « 0 ».
 */
export function AccountCostChip({ accountId }: AccountCostChipProps) {
  const { t } = useTranslation('accounts')
  const { data } = useAccountCost(accountId, true)

  if (!data || data.analyses_count <= 0) return null

  const label = t('cost.analyses', { count: data.analyses_count })

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex cursor-help outline-none">
          <Badge variant="outline" className="gap-1" aria-label={label}>
            <Coins className="h-3.5 w-3.5" aria-hidden />
            {label}
          </Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[240px]">
        <Text element="p" size="xs" weight="medium">
          {t('cost.tooltipTitle')}
        </Text>
        <Text element="p" size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
          {t('cost.tooltipHint')}
        </Text>
      </TooltipContent>
    </Tooltip>
  )
}
