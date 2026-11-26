import type { Account } from '@bellum/contracts'
import { useAnyModalOpen } from '@bellum/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AccountDetailHeroPrimaryAction } from './AccountDetailHeroPrimaryAction'

/**
 * #2117.66 — L'ACTION PRINCIPALE DU DOSSIER, ATTEIGNABLE AU DÉFILEMENT MOBILE.
 *
 * Décision §12 (Louis, 22/09/2026 soir, `decisions-louis-22-09-soir.md`) :
 * « appliquer [la recommandation] si l'action principale existe » — tranché
 * sans repasser par un QCM produit. L'action principale existe toujours
 * (`AccountDetailHeroPrimaryAction` rend l'une de ses cinq branches, jamais
 * rien), donc ce composant est monté sans condition côté dossier.
 *
 * ⚠ MÊME COMPOSANT que le hero, jamais un second rendu du contrat CTA (GA-26,
 * risque nommé au registre #2117.66 : « dupliquer le CTA du hero créerait un
 * second rendu du même contrat »). Ce fichier ne porte aucun `cta=` littéral —
 * rien à ajouter à `DOSSIER_CTA_SCOPE_FILES` (`dossier-cta-contract.test.ts`).
 * Et n'apparaît QUE quand la rangée du hero (`#account-hero-primary-action`,
 * `AccountDetailHero.tsx`) est hors écran : jamais la même action visible
 * deux fois en même temps — c'est le « si pertinent » de la demande.
 *
 * `fixed` + `--bellum-mobile-nav-height` (`styles/tokens.css`) : le même
 * offset que `LauraDock`/`FeedbackWidget`/`ProductTourCompanion` pour ne
 * jamais se poser SUR la barre d'onglets mobile (`MobileTabBar.tsx`) — un
 * flottant qui l'ignore couvre le quatrième onglet, au pouce (doc de
 * `tokens.css`). C'est pour la MÊME raison que `CustomerPage` retire le pied
 * de page d'engagement contact sur mobile plutôt que de le superposer.
 */
export function AccountDetailStickyPrimaryAction({
  account,
  onTabChange,
}: {
  account: Account
  /** #2446.15 — même correctif que le hero : sans elle, « Préparer le plan » pose l'URL sans faire bouger le panneau. */
  onTabChange?: (tab: 'plan' | 'veille') => void
}) {
  const { t } = useTranslation('accounts')
  const [heroActionHidden, setHeroActionHidden] = useState(false)
  // #4623 — rien ne flotte au-dessus des actions d'un dialogue ouvert (z-widget 80 > z-overlay 60).
  const anyModalOpen = useAnyModalOpen()

  useEffect(() => {
    const sentinel = document.getElementById('account-hero-primary-action')
    if (!sentinel) return
    const observer = new IntersectionObserver(entries => {
      const entry = entries[0]
      if (entry) setHeroActionHidden(!entry.isIntersecting)
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [account.id])

  if (!heroActionHidden || anyModalOpen) return null

  return (
    <div
      role="region"
      aria-label={t('hero.stickyActionAria')}
      className="pointer-events-none fixed inset-x-0 bottom-[calc(0.75rem+var(--bellum-mobile-nav-height,0px))] z-widget flex justify-center px-4 md:hidden"
    >
      <div className="pointer-events-auto flex w-full max-w-sm justify-center rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-2 shadow-lg">
        <AccountDetailHeroPrimaryAction account={account} onTabChange={onTabChange} />
      </div>
    </div>
  )
}
