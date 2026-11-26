import { registryContractFor, type Account } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { AccountIntermediaryNotice } from './AccountIntermediaryNotice'
import { EditableField } from '@/features/crm-core/view/EditableField'
import { usePatchAccount } from '@/features/crm-core/hooks/useRecordEdit'
import { AccountMarketZoneChip } from '@/features/market-brief/view/AccountMarketZoneChip'

/**
 * #2117.11 — LE PAYS, dans le bloc identité du hero.
 *
 * `registry_country` n'était lu que par la carte des sites et des filiales.
 * Le pays se TAIT quand il est inconnu : écrire « pays non mesuré » sur tous
 * les dossiers français ajouterait une ligne de bruit sans geste à poser.
 * C'est une asymétrie ASSUMÉE — la règle est « ne jamais rendre 0 pour une
 * absence », pas « nommer toute absence ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * R15-1 (#2117.14, recette du 15/09/2026) — LE PROPRIÉTAIRE N'EST PLUS ICI
 * ─────────────────────────────────────────────────────────────────────────
 * Ce bloc affichait « Propriétaire : non mesuré — personne ne s'est encore
 * déclaré » en lisant `relationship_memory.owner`, pendant que le bandeau
 * Collaboration, sur le MÊME écran, affichait « Propriétaire : Louis
 * Schlegel » en lisant `account.owner`. Deux objets sous un seul libellé, et
 * deux affirmations contraires. Tranché sans arbitrage (loi 4 du tome 7,
 * défaut conservateur) : le bandeau porte le propriétaire, le hero ne le
 * répète plus. `relationship_memory.owner` (« qui, côté ESN, porte la
 * relation », saisi à la main) garde son libellé propre dans la carte Mémoire
 * de relation (`AccountDetailTabContent.tsx`), jamais sous « Propriétaire ».
 */
export function AccountDetailHeroIdentity({ account }: { account: Account }) {
  const { t, i18n } = useTranslation('accounts')
  const { t: tCrm } = useTranslation('crm')
  const patch = usePatchAccount(account.id)
  const country = countryLabel(account.registry_country, i18n.language)
  // #2117.9 — masqué SEULEMENT quand la saisie RÉPÈTE la raison sociale (aucune
  // information de plus, doctrine « on ne répète pas ce qu'on a déjà ») —
  // jamais quand elle est simplement absente : voir le champ éditable ci-dessous.
  // #3279 — « Nom commercial : Non renseigné » DISPARAÎT du hero : une absence
  // ne fait aucune ligne. La saisie reste possible dans la fiche (Synthèse).
  const hideTradeName = !account.trade_name?.trim() || tradeNameMatches(account.trade_name, account.company_name)

  return (
    <>
      {/* #2117.9 / #2813 (26/09/2026, recette écran répétée sur les fiches EID
          et CEGEE) — ÉDITABLE ICI, dans le hero, pas seulement au fond d'un
          accordéon replié par défaut (« Fiche », onglet Synthèse,
          `AccountRecordCard`, doctrine GA-26 « replié à l'arrivée, jamais
          restauré ouvert ») : une fiche sans nom commercial saisi n'avait
          alors AUCUN champ visible pour en poser un sans d'abord ouvrir ce
          panneau — exactement l'état mesuré en recette. Même porte
          d'écriture (`usePatchAccount`), donc la même provenance « saisi à la
          main » qui empêche l'analyse suivante de revenir dessus. */}
      {!hideTradeName && (
        <div className="max-w-xs">
          <EditableField
            label={tCrm('fields.tradeName')}
            value={account.trade_name ?? null}
            isSaving={patch.isPending}
            onSave={next => patch.mutate({ tradeName: next })}
          />
        </div>
      )}
      {country && (
        <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('hero.country', { country })}
        </Text>
      )}
      {/* #4016 L13a — l'identité lue sur un contrat DOCUMENTÉ (pas encore vérifié
          sur une instance réelle) le DIT ; un registre vérifié, ou l'absence de
          pays, ne dit rien. */}
      {registryContractFor(account.registry_country) === 'documented' && (
        <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('hero.registryContractDocumented')}
        </Text>
      )}
      {/* Marchés locaux (L4b, D7) : « Marché local : Lille → » quand le compte est lié à une zone. */}
      <AccountMarketZoneChip accountId={account.id} />
      {/* #2265.14 (épopée #2851) — le badge « intermédiaire », étendu à la
          fiche compte : `naf_code` est déjà sur `Account`, rien n'est deviné. */}
      <AccountIntermediaryNotice
        nafCode={account.naf_code}
        companyName={account.company_name}
        isDeclaredPartner={account.is_declared_partner}
      />
    </>
  )
}

function tradeNameMatches(tradeName: string | null | undefined, companyName: string): boolean {
  const trimmed = tradeName?.trim()
  if (!trimmed) return false
  return trimmed.localeCompare(companyName.trim(), undefined, { sensitivity: 'base' }) === 0
}

/**
 * Le nom du pays dans la langue de l'utilisateur, à partir du code registre
 * (`FR`, `CH`, `BE`…). Un code illisible retombe sur LUI-MÊME : afficher le
 * code brut reste vrai, inventer un nom ne l'est pas.
 */
function countryLabel(code: string | null | undefined, language: string): string | null {
  const raw = code?.trim()
  if (!raw) return null
  if (!/^[A-Za-z]{2}$/.test(raw)) return raw
  try {
    return new Intl.DisplayNames([language], { type: 'region' }).of(raw.toUpperCase()) ?? raw
  } catch {
    return raw
  }
}
