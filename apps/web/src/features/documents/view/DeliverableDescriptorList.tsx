import { Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { Account } from '@bellum/contracts'
import type { DeliverableDescriptorEntry } from '../deliverableDescriptors'
import { computeFreshnessFact } from '@/features/accounts/view/account-detail/components/AccountFreshness'
import { formatTimeAgo } from '@/lib/relative-time'
import { UnknownValue } from '@/components/primitives/UnknownValue'

type DeliverableDescriptorListProps = {
  entries: DeliverableDescriptorEntry[]
  account: Account
}

/**
 * #2125.17 — le libellé de fraîcheur du livrable : LE MÊME fait, la même clé
 * i18n (`accounts:freshness.updatedAgo.*`) que `AccountFreshness` ailleurs
 * dans le dossier — GA-26, un réglage vit à un seul endroit.
 *
 * ⚠️ N'embarque PAS `<AccountFreshness>` tel quel : ce composant lit aussi la
 * synchronisation CRM (`useCrmPresence` → `useSession`), une question hors
 * sujet ici qui exigerait un `SessionProvider` + un client react-query rien
 * que pour afficher une fiche de livrable. On reprend donc le FAIT pur
 * (`computeFreshnessFact`, déjà exporté, déjà testé) sans son habillage CRM.
 */
function freshnessLabel(account: Account, t: (key: string, params?: Record<string, string>) => string): string | null {
  const fact = computeFreshnessFact(account)
  if (!fact) return null
  if (fact.nature === 'targetedRefresh' && fact.dimension) {
    return t('freshness.updatedAgo.targetedRefresh', {
      dimension: t(`refreshDimension.${fact.dimension}`),
      ago: formatTimeAgo(fact.at),
    })
  }
  return t(`freshness.updatedAgo.${fact.nature}`, { ago: formatTimeAgo(fact.at) })
}

/**
 * #2125.12-21 — LA table de descripteurs d'un livrable, réutilisée par CHAQUE
 * format (docx/pdf/pptx/xlsx). Huit champs qui décrivent le même objet
 * partagent donc UN seul rendu (GA-26) — jamais huit blocs copiés par format.
 */
export function DeliverableDescriptorList({ entries, account }: DeliverableDescriptorListProps) {
  const { t } = useTranslation('accounts')
  const freshness = freshnessLabel(account, t)

  return (
    <Box className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs" role="list">
      {entries.map(entry => (
        <Box key={entry.key} role="listitem" className="contents">
          <Text weight="medium" className="text-[var(--bellum-text-secondary)] whitespace-nowrap">
            {t(`deliverables.descriptors.${entry.key}.label`)}
          </Text>
          <Text className="text-[var(--bellum-text-primary)]">{t(entry.i18nKey, entry.params)}</Text>
          {/* #2125.17 — la fraîcheur suit immédiatement la source : c'est la
              fraîcheur DE cette source, pas une mesure indépendante. */}
          {entry.key === 'source' && (
            <>
              <Text weight="medium" className="text-[var(--bellum-text-secondary)] whitespace-nowrap">
                {t('deliverables.descriptors.freshness.label')}
              </Text>
              {freshness ? (
                <Text className="text-[var(--bellum-text-primary)]">{freshness}</Text>
              ) : (
                <UnknownValue reason={t('deliverables.descriptors.freshness.unknown')} />
              )}
            </>
          )}
        </Box>
      ))}
    </Box>
  )
}
