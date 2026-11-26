import { Badge, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { capitalize } from '@bellum/utils'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { AccountDecisionCell } from './AccountDecisionCell'
import { AccountPeopleCell } from './AccountPeopleCell'
import { AccountIntermediaryFlag } from './AccountIntermediaryFlag'
import { useHasOfferObjective } from '@/features/profile/hooks/useEsnProfile'
import { getRecommendation, getStatusConfig, statusLabelKey, type AccountRow } from './types'

/** Même liste que `AccountTableRow.tsx` (GA-26) : une analyse en panne ou en
 *  cours ne doit pas se lire comme un dossier terminé, sur mobile non plus. */
const ANALYSIS_INCOMPLETE_STATUSES = new Set(['error', 'analyzing'])

/**
 * #2097.62 — `/accounts` SOUS 768PX : UNE CARTE PAR COMPTE.
 *
 * Recette iPhone du 25/09 : sous la borne mobile, `AccountsTable` rendait la
 * MÊME table qu'au bureau, juste plus étroite — noms tronqués sur une ligne
 * (« SOPRA STE… »), défilement horizontal pour lire une seule ligne. « Le
 * mobile est le produit, pas un repli » (§8 des règles de design) : la
 * réponse n'est pas de rétrécir encore la table, c'est de changer de forme,
 * exactement comme `VivierCardList.tsx` l'a déjà fait pour le vivier.
 *
 * La carte porte ce qu'un coup d'œil doit donner sans ouvrir le dossier : le
 * logo, le nom COMPLET (replié sur deux lignes au plus — `line-clamp-2`,
 * jamais `truncate` à une ligne, la table garde `truncate` pour sa colonne
 * étroite mais la carte a la largeur de l'écran), le score et son verdict
 * (GO / PRUDENT / NO-GO, `getRecommendation` — même dérivation que la table
 * et le dialogue de comparaison, GA-26), et le statut quand l'analyse n'est
 * pas terminée (même liste que `AccountTableRow`).
 *
 * Le reste — secteur, signal, prochaine action, menu « … » — reste sur la
 * fiche : ouvrir le dossier est un clic, exactement comme une colonne
 * masquée du tableau (#2117.67, la barre d'onglets du dossier).
 */
export function AccountsCardList({ rows }: { rows: AccountRow[] }) {
  const { t } = useTranslation('accounts')
  // #3818 — même lecture de l'objectif que la fiche compte.
  const hasObjective = useHasOfferObjective()
  return (
    <ul className="flex flex-col gap-2">
      {rows.map(row => {
        const statusConfig = getStatusConfig(row.status)
        const StatusIcon = statusConfig.icon
        const showStatusBadge = ANALYSIS_INCOMPLETE_STATUSES.has(row.status)
        const recommendation = getRecommendation(row.priority_score, { hasObjective })
        return (
          <li
            key={row.id}
            className="flex min-w-0 items-center gap-3 rounded-lg border border-[var(--bellum-surface-2)] p-3"
          >
            <CompanyAvatar name={row.company_name} size="md" logoUrl={row.logo_url} website={row.website} />
            <div className="min-w-0 flex-1">
              <Link to="/accounts/$id" params={{ id: row.id }} className="block min-w-0">
                <Text
                  element="span"
                  size="sm"
                  weight="semibold"
                  className="line-clamp-2 text-[var(--bellum-text-primary)] hover:underline underline-offset-2"
                >
                  {capitalize(row.company_name)}
                </Text>
              </Link>
              {showStatusBadge && (
                <Badge
                  data-testid="account-status-badge"
                  className={`mt-1 w-fit gap-1 whitespace-nowrap border-0 px-1.5 py-0 text-xs leading-4 ${statusConfig.bg} ${statusConfig.text}`}
                >
                  <StatusIcon className="size-2.5 shrink-0" aria-hidden />
                  {t(statusLabelKey(row.status))}
                </Badge>
              )}
              <AccountPeopleCell accountId={row.id} people={row.people} className="mt-1" />
              {/* #2265.14 (épopée #2851) — même badge que la table, étendu à
                  la carte mobile : « le mobile est le produit, pas un repli ». */}
              <AccountIntermediaryFlag
                nafCode={row.naf_code}
                companyName={row.company_name}
                isDeclaredPartner={row.is_declared_partner}
                className="mt-1 w-fit"
              />
            </div>
            <AccountDecisionCell row={row} recommendation={recommendation} className="shrink-0" />
          </li>
        )
      })}
    </ul>
  )
}
