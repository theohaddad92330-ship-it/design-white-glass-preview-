import type { Account } from '@bellum/contracts'
import { cn } from '@bellum/ui'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, CalendarClock, ClipboardList, Eye, MessageCircle, PlayCircle } from 'lucide-react'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccountRelaunch } from '@/features/accounts/hooks/useAccountRelaunch'
import { DossierCtaButton } from '../cta/DossierCta'
import { useHeroPrimaryAction } from './useHeroPrimaryAction'
import { guideAnchorProps } from '@/features/guide/guide-anchors'
import { trackActionStarted } from '@/lib/product-tracker'
import { askLauraSearch } from '../helpers/ask-laura-search'
import { useOpenLauraInPlace } from '@/features/laura/bubble/use-open-laura-in-place'

/** #2130.55 / #2130.56 — même convention que `TabPartners.tsx` : le motif de
 *  route littéral, jamais dérivé d'un `account.id` (GA-276). */
const ACCOUNT_DETAIL_SCREEN = '/accounts/$id'

/**
 * #2117.6, .25-30 — L'ACTION PRINCIPALE DU DOSSIER, ET LA SECONDAIRE.
 *
 * Le hero ne rend qu'UN geste principal (#2116.42) — mais lequel dépend de
 * l'état du compte. Les cinq boutons ci-dessous sont mutuellement exclusifs :
 * `heroPrimaryAction` en choisit exactement un, et c'est le test de cette
 * fonction qui prouve que les cinq sont atteignables.
 *
 * ⚠ Les cinq identifiants de contrat sont écrits en LITTÉRAL, un par branche,
 * et pas `cta={choice.cta}` : la garde `dossier-cta-contract.test.ts` lit la
 * SOURCE, pas le rendu. Un identifiant calculé lui serait invisible — elle
 * verrait un bouton sans contrat et cinq contrats sans appelant. Ce fichier
 * est nommé dans `DOSSIER_CTA_SCOPE_FILES` pour cette raison.
 *
 * L'action SECONDAIRE (« Demander à Laura ») est rendue à côté, en clair,
 * jamais sous « … » (#2117.30). Elle ouvre le copilote déjà cadré sur le
 * compte par le chemin qui existait déjà pour la liste
 * (`AccountTableRow` → `/chat?accountId=…`) — aucune entrée inventée.
 *
 * ⚠ CE COMPOSANT NE REND QUE DES BOUTONS, et c'est une contrainte, pas un
 * hasard. Il vit dans la rangée d'actions du hero, qui porte `shrink-0` : tout
 * ce qui est rendu ici fixe une largeur PLANCHER pour cette rangée. La phrase
 * qui nomme la prochaine action était rendue juste en dessous du bouton — elle
 * poussait la rangée à 1 628 px pour un parent de 1 174 px, et écrasait la
 * colonne d'identité à 0 px (14/09/2026, 5 comptes sur 5, 7 sections sur 7).
 * Elle vit maintenant dans `AccountDetailHeroNextAction`, sur sa propre ligne.
 * Un libellé de bouton est une constante de traduction, donc de largeur connue ;
 * un texte venu de l'analyse ne l'est pas. Garde GA-333.
 */
export function AccountDetailHeroPrimaryAction({
  account,
  /**
   * #2117.84 — recette iPhone du 25/09 : sur mobile, le hero rend « Demander
   * à Laura » LUI-MÊME, en icône, dans sa rangée compacte — jamais ici en
   * plus, sinon le geste serait rendu deux fois (loi 4 du tome 7). `true`
   * par défaut : le bureau, qui n'appelle jamais cette prop, garde son rendu
   * d'avant.
   */
  showSecondary = true,
  /**
   * #2117.84 — le geste principal, seul, occupe toute la largeur sur mobile.
   * `false` par défaut : sans elle, le bureau serait inchangé de toute façon
   * (aucun appelant bureau ne la passe), mais l'expliciter évite qu'un futur
   * appelant la déduise d'un contexte qui n'existe pas.
   */
  fullWidth = false,
  /**
   * #2446.15 (recette golden-journey) — SANS cette prop, le clic posait bien
   * `?tab=` dans l'URL mais ne faisait JAMAIS bouger le panneau visible :
   * `AccountDetail.tsx` ne resynchronise son état local `activeTab` depuis
   * l'URL qu'une fois par compte (#2479, pour ne pas rejouer une course avec
   * `handleTabChange`), donc un `navigate()` posé ICI, à côté, n'était jamais
   * vu. Un réglage (l'onglet actif) doit avoir un seul écrivain (GA-26) :
   * quand l'appelant fournit `handleTabChange`, on l'utilise — il navigue ET
   * met à jour l'état local dans le même geste. Optionnelle pour ne pas
   * casser les tests qui montent ce bouton seul, sans `AccountDetail`.
   */
  onTabChange,
}: {
  account: Account
  showSecondary?: boolean
  fullWidth?: boolean
  onTabChange?: (tab: 'plan' | 'veille') => void
}) {
  const { t } = useTranslation('accounts')
  const navigate = useNavigate()
  const { relaunch } = useAccountRelaunch(account)
  const choice = useHeroPrimaryAction(account)

  // #2130.55 — les cinq gestes principaux sont mutuellement exclusifs (un seul
  // rendu à la fois) : UN nom d'action agrégé suffit, jamais lequel des cinq
  // états l'a produit — l'écran (`ACCOUNT_DETAIL_SCREEN`) suffit à le retrouver.
  const trackPrimaryClick = useCallback(() => {
    trackActionStarted('primary_action_clicked', ACCOUNT_DETAIL_SCREEN)
  }, [])

  const goToTab = useCallback(
    (tab: 'plan' | 'veille') => {
      trackPrimaryClick()
      if (onTabChange) {
        onTabChange(tab)
        return
      }
      void navigate({ to: '/accounts/$id', params: { id: account.id }, search: prev => ({ ...prev, tab }) })
    },
    [navigate, account.id, trackPrimaryClick, onTabChange],
  )
  const goToBrief = useCallback(() => {
    trackPrimaryClick()
    void navigate({ to: '/accounts/$id/brief', params: { id: account.id } })
  }, [navigate, account.id, trackPrimaryClick])
  const onFinishAnalysis = useCallback(() => {
    trackPrimaryClick()
    relaunch()
  }, [relaunch, trackPrimaryClick])
  // #2130.56 — un geste DISTINCT du principal (#2117.30, elle reste
  // secondaire) : jamais confondu avec `primary_action_clicked`.
  const openLauraInPlace = useOpenLauraInPlace()
  const askLaura = useCallback(() => {
    trackActionStarted('laura_opened_from_account', ACCOUNT_DETAIL_SCREEN)
    // F1-FIX #4345 — sur place d'abord ; le lien /chat reste le repli mobile / surcouche.
    if (openLauraInPlace) {
      openLauraInPlace(askLauraSearch(account).prompt ?? '')
      return
    }
    void navigate({ to: '/chat', search: askLauraSearch(account) })
  }, [navigate, account, openLauraInPlace])

  return (
    <div
      {...guideAnchorProps('compte.action-principale')}
      className={cn('flex flex-wrap items-center gap-2', fullWidth && 'w-full')}
    >
      {choice.state === 'analysis-incomplete' && (
        <DossierCtaButton
          cta="dossier.hero.finishAnalysis"
          variant="violet"
          size="sm"
          icon={PlayCircle}
          fullWidth={fullWidth}
          onClick={onFinishAnalysis}
        >
          {/* #4459.1 — jamais analysé : « Analyser le compte » (même destination, rien n'a commencé). */}
          {choice.neverAnalyzed ? t('hero.primary.analyzeAccount') : t('hero.primary.finishAnalysis')}
        </DossierCtaButton>
      )}
      {choice.state === 'meeting-booked' && (
        <DossierCtaButton
          cta="dossier.hero.prepareMeeting"
          variant="violet"
          size="sm"
          icon={CalendarClock}
          fullWidth={fullWidth}
          onClick={goToBrief}
        >
          {t('hero.primary.prepareMeeting')}
        </DossierCtaButton>
      )}
      {choice.state === 'watching' && (
        <DossierCtaButton
          cta="dossier.hero.seeChanges"
          variant="violet"
          size="sm"
          icon={Eye}
          fullWidth={fullWidth}
          onClick={() => goToTab('veille')}
        >
          {t('hero.primary.seeChanges')}
        </DossierCtaButton>
      )}
      {choice.state === 'plan-active' && (
        <DossierCtaButton
          cta="dossier.hero.continueNextAction"
          variant="violet"
          size="sm"
          icon={ArrowRight}
          fullWidth={fullWidth}
          onClick={() => goToTab('plan')}
        >
          {t('hero.primary.continueNextAction')}
        </DossierCtaButton>
      )}
      {choice.state === 'no-plan' && (
        <DossierCtaButton
          cta="dossier.hero.preparePlan"
          variant="violet"
          size="sm"
          icon={ClipboardList}
          fullWidth={fullWidth}
          onClick={() => goToTab('plan')}
        >
          {t('hero.primary.preparePlan')}
        </DossierCtaButton>
      )}
      {/* #2117.30 — l'action secondaire, visible sans ouvrir de menu.
          #2117.84 — sur mobile, `AccountDetailHero` la rend elle-même, en
          icône, dans sa rangée compacte : `showSecondary={false}` l'efface
          d'ICI pour ne jamais la rendre deux fois (loi 4 du tome 7). */}
      {showSecondary && (
        <DossierCtaButton cta="dossier.hero.askLaura" variant="light" size="sm" icon={MessageCircle} onClick={askLaura}>
          {t('hero.primary.askLaura')}
        </DossierCtaButton>
      )}
    </div>
  )
}
