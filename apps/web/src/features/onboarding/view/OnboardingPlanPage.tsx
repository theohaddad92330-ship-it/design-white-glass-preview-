import { analysesAffordable, PUBLIC_PLAN_ORDER } from '@bellum/contracts'
import { Button, Card, Text } from '@bellum/ui'
import { useNavigate } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import { useEffect, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { creditsApi } from '@/features/credits/api'
import { useCredits } from '@/features/credits/hooks/useCredits'
import { usePlans } from '@/features/credits/hooks/usePlans'
import { deriveCommercialEntitlement } from '@/features/plan-features/commercial-entitlement'
import { ParcoursFooter, ParcoursHeading } from '@/features/onboarding/view/parcours/ParcoursHeading'
import { ParcoursShell } from '@/features/onboarding/view/parcours/ParcoursShell'
import { DEMONSTRATION_ENTRY_ID, getOnboardingPricingEntries } from '@/lib/plans'

/**
 * #2002.4 — la démonstration du produit vit ICI, pas sur le site.
 *
 * Le geste envoyait sur `${VITE_MARKETING_URL}/demo` : un aller simple hors de
 * l'app, en pleine inscription, vers une page qui PARLE du produit au lieu de
 * le montrer. La démonstration réelle est une route de cette application —
 * un espace semé, aucun compte à créer.
 *
 * Nouvel onglet, et c'est le mécanisme qui l'impose : les cookies de session
 * sont nommés par utilisateur et chaque onglet porte l'identité sous laquelle
 * il travaille (`features/auth/tab-identity.ts`, DEMO-01). Un onglet neuf prend
 * celle de la démonstration ; la même page dans CET onglet-ci remplacerait
 * l'inscription en cours.
 */
const DEMO_PATH = '/demo'

/**
 * Premier écran d'un compte neuf : voir le produit, prendre l'offre, ou
 * demander un devis.
 *
 * Il n'y a plus d'entrée gratuite ANNONCÉE (décision produit 24/07). L'essai
 * 7 jours a disparu de l'affichage — il ne se vendait pas, et présenter une
 * fenêtre gratuite à côté d'un abonnement poussait tout le monde vers la
 * fenêtre. Voir le produit n'est pas une fenêtre gratuite : c'est un espace de
 * démonstration semé, sans compte et sans crédit (#2002.4).
 *
 * Le palier `decouverte` continue d'exister CÔTÉ SERVEUR (il est posé au
 * signup) — le retirer casserait l'inscription self-service. Il n'est
 * simplement plus proposé ici.
 *
 * Les prix et les quotas viennent du catalogue LIVE (`GET /credits/plans`),
 * jamais d'une grille recopiée : un repricing en backoffice doit atteindre cet
 * écran, sinon il annonce un montant pendant que Stripe en facture un autre.
 */
export function OnboardingPlanPage() {
  const { t } = useTranslation('onboarding')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const { data: catalog } = usePlans()

  /**
   * #2002.1 — les TROIS entrées de la grille, pas seulement ce qui s'achète.
   *
   * « il n'y a qu'un seul forfait possible alors que je devrais pouvoir accéder
   * à la démo, ou payer 199 euros ou alors avoir sur devis le prix entreprise
   * workspace. » La grille du 27/08 (#1152) avait déjà tranché TROIS cartes dont
   * un seul palier achetable, et le site les montre toutes les trois — cet écran
   * lisait `getPublicPlans()`, qui répond « que peut-on ACHETER ici ». Liste
   * juste, question fausse.
   *
   * Ce que la grille du 16/08 puis du 27/08 a coûté reste vrai et reste gardé :
   * une carte affichée devenait une carte sélectionnée, puis un identifiant
   * envoyé à la caisse (259 € pour un palier hors catalogue). D'où `purchasable`
   * — la démonstration et le devis s'affichent, ne se sélectionnent pas, et ne
   * peuvent donc pas atteindre `startPaid`.
   */
  const entries = getOnboardingPricingEntries(catalog)
  const plans = entries.filter(entry => entry.purchasable)
  // Le repli ultime nomme le PREMIER palier public du contrat, jamais un code
  // écrit à la main : il pointait sur `starter`, retiré de la vente le 27/08
  // (#1152). Un repli figé sur un palier non vendable enverrait quelqu'un payer
  // une offre qui n'est plus au catalogue — le défaut exact déjà corrigé le
  // 16/08 avec Team / Enterprise.
  const [selected, setSelected] = useState<string>(
    () => plans.find(plan => plan.recommended)?.id ?? plans[0]?.id ?? PUBLIC_PLAN_ORDER[0],
  )

  /**
   * #2003.17 — « l'écran explique d'abord ce qu'il achète ».
   *
   * Trois listes de puces disent ce qui est INCLUS ; elles ne disent pas ce
   * qu'on achète. Ce qu'un commercial manipule, ce ne sont pas des crédits,
   * c'est un nombre de dossiers qu'il peut ouvrir — et cette traduction
   * existait déjà, calculée et testée dans les contrats, appelée par aucun
   * écran (`analysesAffordable`). Le barème aussi (`CREDIT_WEIGHTS`), pendant
   * que le sous-titre le recopiait à la main : deux chiffres à tenir à jour à
   * deux endroits, donc deux chiffres qui divergent (GA-26).
   *
   * Ce bloc ne parle que de l'entrée VENDUE — la démonstration ne se paie pas
   * et le devis se négocie.
   */
  const sold = plans.find(plan => plan.id === selected) ?? plans[0]

  // Une offre posée PENDANT que l'écran est ouvert (l'opérateur l'accorde en
  // backoffice, l'onglet du prospect est resté sur les tarifs) doit sortir cet
  // écran de l'écran. Le garde de route ne s'exécute qu'à l'entrée : sans ça, on
  // continue de demander de choisir une offre à quelqu'un qui en a une, jusqu'au
  // prochain rechargement. `useCredits` se rafraîchit au retour sur l'onglet.
  const navigate = useNavigate()
  const { data: credits } = useCredits()
  /**
   * #2003.1 — le droit d'accès commercial, NOMMÉ.
   *
   * L'écran ne demandait qu'un booléen (`hasExistingOffer`) : « servi ou non »,
   * sans jamais dire DE QUOI. `deriveCommercialEntitlement` ne change pas cette
   * réponse — il la délègue au même prédicat — mais il la QUALIFIE : offre,
   * essai, bêta, invitation, démonstration, crédits. C'est ce nom que lira le
   * message d'accueil de #2014, et c'est lui qui répond ici à #2003.2.
   */
  const entitlement = deriveCommercialEntitlement(credits)
  const served = entitlement.served
  useEffect(() => {
    if (served) void navigate({ to: '/onboarding/company', replace: true })
  }, [served, navigate])

  /** Stripe Checkout : la carte est demandée par Stripe, jamais par nous.
   *  L'onboarding reprend au retour, le questionnaire est intact. */
  const startPaid = async (planId: string) => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    try {
      const { url } = await creditsApi.checkout(planId)
      if (!url) throw new Error('no checkout url')
      window.location.href = url
    } catch {
      setFailed(true)
      setBusy(false)
    }
  }

  // #2003.2 — « un utilisateur bêta, invité ou déjà provisionné ne voit JAMAIS
  // une sélection d'abonnement inutile ». La redirection ci-dessus part après le
  // rendu : sans ce garde, un partenaire bêta lisait « Choisis ton offre » et
  // une grille de prix le temps d'un aller-retour de routeur.
  // ⚠️ `unknown` (la lecture de crédits n'a pas répondu) ne passe PAS ici : on ne
  // conclut pas « pas d'offre », mais laisser un compte neuf devant un écran
  // vide pendant que la requête vole serait pire. C'est `served` — mesuré — qui
  // ferme la porte, jamais une absence.
  if (served) return null

  return (
    <ParcoursShell>
      <div className="flex flex-col gap-8">
        <ParcoursHeading kicker={t('plan.kicker')} title={t('plan.title')} lead={t('plan.subtitle')} />

        {/* #2003.17 — ce qu'on achète, AVANT la grille : le volume traduit en
          dossiers ouvrables, le barème d'une action, et ce que l'offre
          n'ouvre pas. Les trois viennent d'une source unique. */}
        {sold && (
          <section
            aria-labelledby="plan-what-you-buy"
            className="rounded-card border-l-2 border-[var(--bellum-primary-500)] bg-[var(--bellum-surface-2)] p-5 sm:p-6"
          >
            <Text
              element="h2"
              id="plan-what-you-buy"
              size="xs"
              weight="semibold"
              className="uppercase tracking-widest text-[var(--bellum-text-accent)]"
            >
              {t('plan.buy.title')}
            </Text>
            <ul className="mt-3 grid gap-3 md:grid-cols-3">
              <li>
                {/* « Si cette valeur est absente, 0 est-il VRAI ? » Non : un
                  volume qu'on n'a pas lu n'est pas un volume nul, et
                  « 0 dossier complet » sur la carte qu'on vend serait faux. */}
                <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                  {sold.credits === null
                    ? t('plan.buy.volumeUnknown')
                    : t('plan.buy.volume', { analyses: analysesAffordable(sold.credits) })}
                </Text>
              </li>
              {/* Un nombre d'utilisateurs non lu ne s'invente pas : on se tait.
                `extraSeatPriceCents === 0` ne veut PAS dire « gratuit », il dit
                que ce palier n'en vend aucun — donc la suite est un devis. */}
              {sold.seats !== null && (
                <li>
                  <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                    {sold.extraSeatPriceCents === 0
                      ? t('plan.buy.seatsQuoteBeyond', { seats: sold.seats })
                      : t('plan.buy.seats', { seats: sold.seats })}
                  </Text>
                </li>
              )}
            </ul>
          </section>
        )}

        {/* Autant de colonnes que de cartes — jamais plus. Une colonne vide se lit
          comme une carte qui n'a pas chargé. Depuis #2002.1 la grille porte les
          TROIS entrées (démonstration, offre, devis), donc trois colonnes ;
          l'arithmétique reste celle d'avant, parce que le catalogue peut encore
          répondre moins que ce qu'on embarque. */}
        {/* Trois colonnes à partir de `md` (768 px), pas de `sm` : à 640 px trois
          cartes tarifaires font 190 px chacune et leurs puces se cassent en
          escalier. En dessous, elles s'empilent — le mobile est le produit. */}
        <div
          className={`grid items-stretch gap-4 ${
            entries.length >= 3 ? 'md:grid-cols-3' : entries.length === 2 ? 'sm:grid-cols-2' : 'mx-auto w-full max-w-md'
          }`}
        >
          {entries.map(entry => {
            const isSelected = entry.purchasable && selected === entry.id
            // ⚠️ Seule une entrée ACHETABLE se sélectionne. La démonstration et le
            // devis n'ont aucun identifiant à envoyer à la caisse : leur carte ne
            // porte donc ni `role="radio"`, ni gestionnaire de clic, ni tabulation
            // — rien à cliquer, rien à tabuler (GA-35 se lit dans les deux sens).
            const selectable = entry.purchasable
              ? {
                  role: 'radio' as const,
                  'aria-checked': isSelected,
                  tabIndex: 0,
                  onClick: () => setSelected(entry.id),
                  onKeyDown: (e: KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelected(entry.id)
                    }
                  },
                }
              : {}
            return (
              <Card
                key={entry.id}
                {...selectable}
                className={`flex h-full flex-col rounded-card p-5 transition-colors ${entry.purchasable ? 'cursor-pointer' : ''} ${
                  isSelected
                    ? 'border-[var(--bellum-primary-500)] bg-[color-mix(in_srgb,var(--bellum-primary-500)_8%,transparent)]'
                    : entry.purchasable
                      ? 'border-[var(--bellum-border)] hover:border-[var(--bellum-text-muted)]'
                      : 'border-[var(--bellum-border)]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <Text weight="semibold">{entry.name}</Text>
                  {entry.recommended && (
                    <span className="rounded-full bg-[var(--bellum-primary-500)]/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-[var(--bellum-text-accent)]">
                      {t('plan.recommended')}
                    </span>
                  )}
                </div>

                {/* Un montant s'affiche quand il y en a un. Sinon on écrit ce qui
                  EST vrai — « Sans compte », « Sur devis ». Jamais « 0 € » :
                  la question qui tranche est « si cette valeur est absente,
                  zéro est-il VRAI ? », et ici il ne l'est pas. */}
                <Text size="2xl" weight="semibold" className="mt-3">
                  {entry.priceEuros === null ? entry.priceLabel : t('plan.pricePerMonth', { price: entry.priceEuros })}
                </Text>

                {/* #4466 — le volume se dit en dossiers ouvrables, jamais en crédits :
                  c'est ce que le commercial manipule. `null` = non applicable
                  (démonstration) ou négocié (Entreprise), et une enveloppe qui se
                  négocie ne se publie pas. */}
                {entry.credits !== null && (
                  <Text size="sm" weight="medium" className="mt-3 text-[var(--bellum-text-accent)]">
                    {t('plan.usageHighlight', { count: analysesAffordable(entry.credits) })}
                  </Text>
                )}

                <ul className="mt-3 space-y-1.5">
                  {entry.features.map(feature => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />
                      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                        {feature}
                      </Text>
                    </li>
                  ))}
                </ul>

                {/* #2002.4 — l'action de la démonstration est SUR la carte de la
                  démonstration. Elle vivait en bas de page, en dehors de la
                  grille, et pointait le site : deux fois le même sujet à deux
                  endroits (loi 4), dont le second ne montrait pas le produit.
                  Le plancher tactile de 44 px reste porté par `Button`, jamais
                  recopié ici. */}
                {entry.id === DEMONSTRATION_ENTRY_ID && (
                  <div className="mt-auto pt-4">
                    <Button asChild variant="outline" className="w-full">
                      <a href={DEMO_PATH} target="_blank" rel="noopener noreferrer">
                        {t('plan.demoCta')}
                      </a>
                    </Button>
                    <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-2">
                      {t('plan.demoHint')}
                    </Text>
                  </div>
                )}
              </Card>
            )
          })}
        </div>

        {failed && (
          <Text role="status" size="sm" color="text-[var(--danger-soft-text)]">
            {t('plan.failed')}
          </Text>
        )}

        <ParcoursFooter
          start={
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('plan.billingHint')}
            </Text>
          }
          end={
            <Button variant="violet" onClick={() => void startPaid(selected)} isLoading={busy}>
              {t('plan.cta')}
            </Button>
          }
        />
      </div>
    </ParcoursShell>
  )
}
