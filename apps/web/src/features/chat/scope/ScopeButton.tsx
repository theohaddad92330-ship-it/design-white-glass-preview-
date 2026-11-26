import { useTranslation } from 'react-i18next'
import {
  Briefcase,
  BriefcaseBusiness,
  ChevronDown,
  ContactRound,
  Globe2,
  Rocket,
  Sparkles,
  Target,
  UserRound,
} from 'lucide-react'
import { Text, cn } from '@bellum/ui'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { scopeAccount, type ChatScope, type ScopeAccount } from './chat-scope'

/**
 * Le bouton qui DIT la portée et permet d'en changer.
 *
 * Il apparaît dans l'en-tête du fil, et là seulement : décision de Louis du
 * 13/09/2026 (batch 13) — il était aussi rendu au bord de la saisie, même
 * libellé, et « rien n'apparaît deux fois » (loi 4 du tome 7). Un seul
 * composant tout de même, parce qu'une portée écrite à deux endroits finit par
 * en dire deux choses différentes (loi 1 du tome 7).
 *
 * ⚠️ Il AFFICHE toujours quelque chose. Une portée muette laisse croire que
 * Laura lit « tout », alors qu'elle lit peut-être un seul compte — c'est
 * exactement la méprise que la modale existe pour supprimer, et un bouton vide
 * la réintroduirait à l'endroit le plus visible de l'écran.
 */
export function ScopeButton({
  scope,
  accounts,
  portfolioCount,
  onOpen,
  size = 'md',
  className,
}: {
  scope: ChatScope
  accounts: readonly ScopeAccount[]
  /**
   * Combien de comptes le portefeuille contient — le TOTAL du serveur, pas la
   * longueur de la page chargée.
   *
   * ⚠️ `null` tant qu'on ne le sait pas, et le bouton n'affiche alors AUCUN
   * chiffre. Deux raisons, toutes deux vues en production le 26/08 :
   *
   * 1. **Le chargement.** Le bouton affichait « 0 compte » pendant la seconde
   *    où la liste arrivait. Un zéro transitoire est indiscernable d'un zéro
   *    vrai, et il dit exactement le contraire de la réalité — le fil s'ouvre
   *    en annonçant un portefeuille vide à quelqu'un qui en a vingt.
   * 2. **La pagination.** Compter les comptes CHARGÉS annoncerait « 20 » sur un
   *    portefeuille de cinquante, et le chiffre changerait en faisant défiler
   *    une liste ailleurs dans l'application. `totalItems` est la seule mesure
   *    qui décrive la portée.
   */
  portfolioCount: number | null
  onOpen: () => void
  /** `sm` pour l'en-tête du fil, où le bouton se range sous le titre. */
  size?: 'sm' | 'md'
  className?: string
}) {
  const { t } = useTranslation('chat')
  const account = scopeAccount(scope, accounts)

  return (
    <button
      type="button"
      onClick={onOpen}
      // #1910.9 — le libellé VISIBLE (nom du compte, « Tout mon portefeuille »,
      // « Sans compte ») était déjà du langage métier ; c'est le nom
      // ACCESSIBLE, entendu au lecteur d'écran et jamais lu à l'œil, qui disait
      // encore « Changer la portée » — un mot de CODE. La clé i18n `scope.change`
      // ne bouge pas, seule sa phrase change.
      aria-label={t('scope.change')}
      className={cn(
        'flex min-h-11 min-w-11 max-w-full items-center gap-1.5 max-md:shrink-0 rounded-lg px-2 py-1 text-left transition-colors hover:bg-[var(--bellum-surface-2)]',
        className,
      )}
    >
      <ScopeIcon scope={scope} account={account} />
      {/* #3769 — « Tout mon espace · 18 comptes a… » était coupé net (230 px dans 197) : le libellé passe à la
          ligne (deux lignes au plus) au lieu d'une ellipse sur une seule. */}
      {/* #4944 — sous 768 px (GA-28, 390 px) la rangée n'a pas la place du libellé : il s'efface au profit du nom accessible
          (`aria-label`) au lieu d'être écrasé à 0 px avec des icônes qui débordent ; le bouton garde ses 44 px (GA-35). */}
      <span className="min-w-0 max-md:sr-only">
        <Text size={size === 'sm' ? 'xs' : 'sm'} weight="medium" className="line-clamp-2 break-words leading-tight">
          {scopeLabel(scope, account, portfolioCount, t)}
        </Text>
      </span>
      <ChevronDown className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
    </button>
  )
}

function ScopeIcon({ scope, account }: { scope: ChatScope; account: ScopeAccount | null }) {
  if (scope.kind === 'account' && account) {
    return (
      <CompanyAvatar name={account.companyName ?? '?'} logoUrl={account.logoUrl} website={account.website} size="sm" />
    )
  }
  // #1951.2 / #1951.3 — une icône par nature d'objet : un fil cadré sur une
  // personne ne doit pas porter le globe du portefeuille.
  const Icon =
    scope.kind === 'none'
      ? Sparkles
      : scope.kind === 'consultant'
        ? UserRound
        : scope.kind === 'need'
          ? Briefcase
          : // #1910.6 — la mission a SON icône : elle n'est ni un besoin (qu'on
            // cherche encore à pourvoir) ni le portefeuille.
            scope.kind === 'mission'
            ? Rocket
            : // #1951.1 — la personne a SON icône : un fil cadré sur Sophie ne
              // doit pas porter le globe du portefeuille ni la silhouette du
              // vivier (un contact client n'est pas un consultant).
              scope.kind === 'contact'
              ? ContactRound
              : // #1951.4 — l'affaire du pipe a la sienne : elle n'est ni le
                // compte qui la porte, ni le besoin qu'elle contient.
                scope.kind === 'opportunity'
                ? Target
                : // Théo L1 — sélecteur avancé — l'offre d'emploi a la sienne.
                  scope.kind === 'job_offer'
                  ? BriefcaseBusiness
                  : Globe2
  return <Icon className="size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />
}

/**
 * Ce que le bouton dit, selon la portée.
 *
 * ⚠️ Le cas qui compte est le TROISIÈME : une portée sur un compte que la liste
 * chargée ne contient plus (page suivante non chargée, compte archivé). On écrit
 * alors « un compte » plutôt que son identifiant — un uuid à l'écran n'apprend
 * rien, et prétendre « tout le portefeuille » serait FAUX puisque Laura, elle,
 * lit bien ce compte-là.
 *
 * ⚠️ #1951.17 — EXPORTÉE, et c'est délibéré. L'annonce de changement de
 * périmètre (`ScopeChangeNotice`) nomme les deux périmètres ; si elle refaisait
 * ce calcul, « Sophie Martin · LATÉCOÈRE » dans le bouton et autre chose dans
 * l'annonce finiraient par désigner la même portée de deux façons (loi 1 du
 * tome 7 : un réglage vit à un seul endroit).
 */
export function scopeLabel(
  scope: ChatScope,
  account: ScopeAccount | null,
  portfolioCount: number | null,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (scope.kind === 'none') return scope.strict ? t('scope.strictNone') : t('scope.none')
  if (scope.kind === 'account') {
    return account?.companyName ?? t('scope.unknownAccount')
  }
  // #1951.2 / #1951.3 — le NOM de l'objet ; sans lui, sa nature (« Un
  // consultant »), jamais un identifiant ni « tout le portefeuille ».
  if (scope.kind === 'consultant') return scope.label ?? t('scope.unknownConsultant')
  if (scope.kind === 'need') return scope.label ?? t('scope.unknownNeed')
  if (scope.kind === 'mission') return scope.label ?? t('scope.unknownMission')
  // #1951.1 — le NOM de la personne (et sa société), jamais son identifiant.
  if (scope.kind === 'contact') return scope.label ?? t('scope.unknownContact')
  // #1951.4 — le NOM de l'affaire (et son compte), jamais son identifiant.
  if (scope.kind === 'opportunity') return scope.label ?? t('scope.unknownOpportunity')
  // Théo L1 — sélecteur avancé — le NOM de l'offre (et son compte), jamais son identifiant.
  if (scope.kind === 'job_offer') return scope.label ?? t('scope.unknownJobOffer')
  // Compte inconnu (chargement en cours) ⇒ le libellé SEUL. « Tout le
  // portefeuille » reste vrai sans son chiffre ; « 0 compte » ne l'est pas.
  return portfolioCount === null ? t('scope.portfolio') : t('scope.portfolioWithCount', { count: portfolioCount })
}
