import { Text } from '@bellum/ui'
import { Receipt } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatCents } from '@/lib/money'
import { PropagatedBlock } from '@/features/propagation/PropagatedBlock'
import { useAccountRate, useAccountRevenue } from '@/features/propagation/hooks'

/**
 * « CE CLIENT T'A RAPPORTÉ X € SUR N MISSIONS » — le bandeau du §4.2, et le
 * tarif vendu moyen du §4.3, dans le même bloc.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL CORRIGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un commercial entrait en rendez-vous chez un client sans savoir ce que ce
 * client lui avait rapporté, ni à quel prix il achetait. Les deux chiffres
 * existaient — mois facturés, TJM des missions — et ne vivaient que sur l'écran
 * des Missions. §4.1 : « une donnée du back-office apparaît partout où elle
 * change une décision. »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ IL NE S'AFFICHE PAS SUR UN CLIENT SANS MISSION — ET CE N'EST PAS UN VIDE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le bandeau existe si et seulement si ce compte porte au moins une mission
 * (`rate`, l'agrégat OUVERT, n'a de ligne que dans ce cas). Sur un prospect qui
 * n'a jamais rien signé, un bandeau « 0 € sur 0 mission » ne dirait rien de
 * vrai : il n'y a pas d'historique commercial à montrer, et l'écran se tait —
 * comme `AccountCostChip` juste au-dessus, qui disparaît plutôt que d'écrire
 * zéro analyse.
 *
 * ⚠️ La condition d'existence est l'agrégat OUVERT et jamais le financier : le
 * gater sur le CA ferait disparaître le tarif vendu moyen — qui n'est pas un
 * montant gardé — pour tout un rôle sans droit financier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ « PAS TON PÉRIMÈTRE » ET « PAS MESURÉ » SONT DEUX PHRASES
 * ─────────────────────────────────────────────────────────────────────────────
 * Quatre états pour la ligne d'argent, et les confondre est le défaut que D45 a
 * corrigé côté serveur :
 *
 *  · **403** — aucun droit financier. Ce n'est pas une donnée manquante, c'est
 *    un droit que le rôle n'a pas, et la phrase le dit mot pour mot.
 *  · **échec de lecture** — « cassé » et « ce client n'a jamais rien payé » se
 *    ressemblent trop pour partager une phrase.
 *  · **aucun mois facturé** — vrai, et ce n'est pas un montant.
 *  · **des mois facturés, aucun montant** — le total ne se calcule pas ; il ne
 *    vaut pas zéro.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ §4.4 — LE CHIFFRE SE CLIQUE, IL NE SE CORRIGE PAS ICI
 * ─────────────────────────────────────────────────────────────────────────────
 *     « Le CA cumulé d'un compte se lit sur la fiche compte. Il se calcule dans
 *      les missions. On ne le corrige pas depuis le compte. »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1816 — LE CONTENU SE SÉPARE DE SON CONTENANT
 * ─────────────────────────────────────────────────────────────────────────────
 * `useAccountRevenueBand` porte tout le calcul et tout le texte ; il ne pose
 * plus lui-même la bordure, le fond ni le padding. `AccountRevenueBanner`
 * (ce composant) reste le point d'entrée AUTONOME — il pose le même cadre
 * qu'avant, à l'identique, pour qui l'utilise seul (voir son test dédié).
 *
 * #3161 (retour bêta, 28/09/2026) — Louis : « supprimer » sur `AccountContextBand`,
 * qui appelait ce hook pour fusionner ce contenu dans la bande de contexte du
 * dossier. Retiré de LÀ : le CA cumulé et le tarif vendu moyen ont déjà leur
 * place sur l'onglet Missions du même dossier (`TabMissions.tsx`,
 * `useAccountRate`) — rien à déplacer, la donnée n'était dupliquée que sur
 * cette bande. Le hook et ce composant restent inchangés, sans appelant dans
 * le dossier compte aujourd'hui, prêts pour qui en aura besoin ailleurs.
 */
export function useAccountRevenueBand(accountId: string): React.ReactNode | null {
  const { t } = useTranslation('accounts')
  const rate = useAccountRate(accountId)
  const { revenue, denied, failed, canReadFinance } = useAccountRevenue(accountId)

  // Aucune mission : aucun historique commercial. Le silence est la vérité.
  if (!rate) return null

  return (
    <div className="flex items-start gap-3">
      <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
      <div className="min-w-0 flex-1">
        <RevenueLine
          revenue={revenue}
          denied={denied}
          failed={failed}
          canReadFinance={canReadFinance}
          missions={rate.missions}
        />
        <Text size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
          {/* Le tarif vendu moyen n'est PAS sous droit financier : le prix de
              VENTE est visible par design, ce sont les entrées de la MARGE qui
              se gardent. Deux fausses alertes ont déjà été levées là-dessus. */}
          {rate.averageSoldDailyRateCents === null
            ? t('propagation.rateUnknown')
            : t('propagation.rate', { amount: formatCents(rate.averageSoldDailyRateCents) })}
          {rate.missionsWithoutRate > 0
            ? ` · ${t('propagation.rateMissing', { count: rate.missionsWithoutRate })}`
            : ''}
        </Text>
      </div>
    </div>
  )
}

export function AccountRevenueBanner({ accountId }: { accountId: string }) {
  const content = useAccountRevenueBand(accountId)
  if (!content) return null

  return (
    <div className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-4 py-3">
      {content}
    </div>
  )
}

function RevenueLine({
  revenue,
  denied,
  failed,
  canReadFinance,
  missions,
}: {
  revenue: ReturnType<typeof useAccountRevenue>['revenue']
  denied: boolean
  failed: boolean
  canReadFinance: boolean
  missions: number
}) {
  const { t } = useTranslation('accounts')

  if (denied) return <Muted>{t('propagation.bannerDenied')}</Muted>
  if (failed) return <Muted>{t('propagation.bannerFailed')}</Muted>
  if (!revenue) {
    // ⚠️ Sous portée restreinte, l'absence est AMBIGUË (rien de facturé, ou
    // compte hors du portefeuille de l'appelant) : la même phrase que la
    // colonne du portefeuille, pour la même raison.
    return <Muted>{canReadFinance ? t('propagation.bannerNoInvoice') : t('propagation.cellNoInvoiceOwnScope')}</Muted>
  }
  if (revenue.invoicedCents === null) return <Muted>{t('propagation.bannerNoAmount')}</Muted>

  return (
    <>
      <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
        <PropagatedBlock source={revenue.source}>
          {/* `missions` vient de l'agrégat OUVERT et non du financier : celui-ci
              ne compte que les missions qui portent un mois FACTURÉ, et « sur 3
              missions » sous un bandeau de sept en ferait disparaître quatre. */}
          {t('propagation.bannerRevenue', { amount: formatCents(revenue.invoicedCents), count: missions })}
        </PropagatedBlock>
      </Text>
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('propagation.bannerMonths', { count: revenue.invoicedMonths })}
        {revenue.monthsWithoutAmount > 0
          ? ` · ${t('propagation.bannerFloor', { count: revenue.monthsWithoutAmount })}`
          : ''}
      </Text>
    </>
  )
}

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <Text size="sm" className="text-[var(--bellum-text-secondary)]">
      {children}
    </Text>
  )
}
