import type { Account } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'
import { AccountHeroFacts } from './AccountHeroFacts'

/**
 * #4507 — LA LIGNE D'IDENTITÉ de l'en-tête (maquette V22 `.a4-identity-meta`) : ville · effectif · statut
 * commercial (pastille) · responsable (avatar + prénom, lecture seule).
 *
 * Chaque fait absent est OMIS (doctrine « on n'affiche pas ce qu'on n'a pas ») : sans responsable, aucun
 * élément — ni « Propriétaire non renseigné », ni avatar vide. Attribuer se fait depuis « … » (même porte
 * serveur que l'ancien bandeau, `PATCH /accounts/:id/assign`). Les co-équipiers ne s'affichent pas ici :
 * « Ajouter un co-équipier » ouvre leur carte depuis « … ».
 *
 * #2117.3 — le statut COMMERCIAL (« Client », « En observation ») et jamais celui de l'analyse, qui vit dans
 * « Périmètre & données ». Une ligne antérieure à la colonne retombe sur `inbox` (« À trier »), ce que le
 * serveur renvoie lui-même pour ces lignes.
 */
export function AccountIdentityLine({ account }: { account: Account }) {
  const { t } = useTranslation('accounts')
  const owner = account.owner ?? null
  const firstName = owner?.name.trim().split(/\s+/)[0] ?? ''
  return (
    <div
      data-testid="hero-identity-line"
      className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--bellum-text-secondary)] [&>*]:min-w-0"
    >
      <AccountHeroFacts account={account} />
      <span
        data-testid="hero-commercial-status"
        className="inline-flex items-center rounded-full border border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] px-2.5 py-0.5 text-xs font-medium text-[var(--bellum-text-accent)]"
      >
        {t(`commercialStatus.${account.commercial_status ?? 'inbox'}`)}
      </span>
      {owner && firstName ? (
        <span
          data-testid="hero-owner"
          title={t('header.ownerAria', { name: owner.name })}
          className="inline-flex items-center gap-1.5 text-[var(--bellum-text-primary)]"
        >
          <span
            aria-hidden="true"
            className="inline-flex size-6 items-center justify-center rounded-full bg-[var(--bellum-surface-2)] text-xs font-semibold text-[var(--bellum-text-secondary)]"
          >
            {firstName.charAt(0).toUpperCase()}
          </span>
          <span className="sr-only">{t('header.ownerAria', { name: owner.name })}</span>
          <span aria-hidden="true">{firstName}</span>
        </span>
      ) : null}
    </div>
  )
}
