import { useEffect, useRef } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { buildOnboardingRestitution, type WelcomeSummary } from '@bellum/contracts'
import { motion } from 'framer-motion'
import { ArrowRight, MessageSquare, Search, Target, Users, type LucideIcon } from 'lucide-react'
import { Button, FieldText, LauraFace, Spinner, Text, EASE } from '@bellum/ui'
import { toast } from 'sonner'
import { useConnectedCapabilities } from '@/features/chat/hooks/useConnectedCapabilities'
import { useHasAccountsToAct } from '@/features/accounts/hooks/useHasAccountsToAct'
import { useProfile } from '@/features/profiles/hooks/useProfile'
import { useEsnProfile } from '@/features/profile/hooks/useEsnProfile'
import { useProfileContext } from '@/features/profile-context/hooks/useProfileContext'
import { useReconfigureOnboarding } from '@/features/profile/hooks/useReconfigureOnboarding'
import { firstAnalysisSuggestionId } from '@/features/profile-context/lib/firstAnalysisSuggestion'
import { FirstAnalysisSuggestionsGrid } from '@/features/profile-context/components/FirstAnalysisSuggestionsGrid'
import { OnboardingRestitutionCard } from '@/features/onboarding/components/OnboardingRestitutionCard'
import { deriveWelcomeCards } from '../lib/derive-welcome-cards'
import { toWelcomeProfileSummary } from '../lib/toWelcomeProfileSummary'
import { welcomeLauraContext } from '../lib/welcome-laura-context'
import { MarketAwarenessCard } from './MarketAwarenessCard'
import { SituationPicker } from './SituationPicker'
import { BrandMark } from '@/features/brand/BrandMark'
import { trackOnboardingFirstValueViewed } from '@/lib/product-tracker'

/** #2085.9 — le motif de route de CET écran (catalogue : `product-screens-catalog.ts`). */
const WELCOME_SCREEN = '/welcome'

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE.out } },
}

// Each tile reads its blurb from the Profiler's welcomeSummary when present,
// and degrades to a static description otherwise (the context can still be
// generating right after onboarding). Labels are i18n keys resolved at render.
const PERSONALIZATION_ITEMS: ReadonlyArray<{
  key: string
  icon: LucideIcon
  // #2062.1 — le CHEMIN que l'API nomme dans `withheld` quand elle a refusé de
  // servir ce texte. Porté ici plutôt que déduit de `key` : une dérivation
  // implicite casserait en silence le jour où l'un des deux est renommé.
  path: string
  pick: (summary: WelcomeSummary | undefined) => string
}> = [
  {
    key: 'searches',
    icon: Search,
    path: 'welcomeSummary.searchesPersonalization',
    pick: s => s?.searchesPersonalization ?? '',
  },
  {
    key: 'contacts',
    icon: Users,
    path: 'welcomeSummary.contactsPersonalization',
    pick: s => s?.contactsPersonalization ?? '',
  },
  {
    key: 'messages',
    icon: MessageSquare,
    path: 'welcomeSummary.messagesPersonalization',
    pick: s => s?.messagesPersonalization ?? '',
  },
  {
    key: 'scoring',
    icon: Target,
    path: 'welcomeSummary.scoringPersonalization',
    pick: s => s?.scoringPersonalization ?? '',
  },
]

/**
 * Écran cible post-questionnaire (Théo restitution p.8) — a personalized
 * welcome shown after onboarding and before the product shell. It proves
 * Bellum understood the ESN profile (greeting + summary + personalization)
 * and offers a double CTA where a suggestion never locks the free search.
 */
export function WelcomeScreen() {
  const { t, i18n } = useTranslation('welcome')
  const navigate = useNavigate()
  const { data: profile } = useProfile()
  const { data: esnAnswers, isLoading: esnLoading } = useEsnProfile()
  const { data: profileContextResponse } = useProfileContext()
  // R16-3 — décision Louis 13/09/2026 (batch 11, #1912.11, `tool-naming.ts`) :
  // l'outil que l'espace a BRANCHÉ se nomme, au présent, partout où c'est
  // utile. Ce bloc citait #1921.8, qui appliquait la règle du 02/08/2026
  // (« jamais de nom d'éditeur côté app ») — REMPLACÉE le 13/09. Même chemin
  // que la saisie de Laura (`ConnectedToolsStrip`) : deux chemins vers le même
  // registre finiraient par répondre autre chose. Un registre illisible ou une
  // erreur réseau retombe déjà sur `tools: []` DANS le hook — l'écran ne
  // distingue donc jamais « rien branché » de « je ne sais pas », ce qui est
  // le comportement voulu (jamais de liste inventée).
  const { tools: connectedTools } = useConnectedCapabilities()
  // #2091.31 — le signal de PORTEFEUILLE EXISTANT : absent (chargement, ou
  // portefeuille vraiment vide), la carte ne se propose jamais — jamais un
  // portefeuille inventé.
  const { data: accountsToAct } = useHasAccountsToAct()
  const crmTool = connectedTools.find(tool => tool.family === 'crm')
  const mailboxTool = connectedTools.find(tool => tool.family === 'email')
  const agendaTool = connectedTools.find(tool => tool.family === 'calendar')
  const hasConnectedTool = Boolean(crmTool || mailboxTool || agendaTool)

  const suggestionsRef = useRef<HTMLDivElement>(null)

  const firstName = profile?.first_name?.trim() ?? ''
  const summary = profileContextResponse?.profile_context?.welcomeSummary
  const suggestions = summary?.firstAnalysisSuggestions ?? []
  const summaryRows = toWelcomeProfileSummary(esnAnswers)
  const hasSuggestions = suggestions.length > 0
  // #2062.1 / #2069.1 — CE QUI A ÉTÉ RETENU SE NOMME, AVEC SA DATE.
  // L'API refuse de servir un texte stocké qui viole la doctrine (une
  // probabilité) ou un nom d'entreprise qu'aucune source n'a prouvé. Elle ne le
  // fait pas en silence : elle rend le CHEMIN de chaque texte retenu et la date
  // de l'instantané. Sans ce bloc, la tuile retomberait sur sa description
  // statique et l'utilisateur lirait « rien à dire » là où il faut lire
  // « ce texte est périmé » — c'est « non mesuré rendu 0 », un cran plus haut.
  const withheldFields = profileContextResponse?.withheld?.fields ?? []
  const withheldAt = profileContextResponse?.withheld?.storedAt ?? null
  const withheldDate = withheldAt ? new Date(withheldAt) : null
  const withheldLabel =
    withheldDate && !Number.isNaN(withheldDate.getTime()) ? withheldDate.toLocaleDateString(i18n.language) : null
  const suggestionsWithheld = withheldFields.includes('welcomeSummary.firstAnalysisSuggestions')
  const noticeFor = (path: string, block: 'personalization' | 'suggestions'): string | undefined => {
    if (!withheldFields.includes(path)) return undefined
    return withheldLabel ? t(`${block}.withheld`, { date: withheldLabel }) : t(`${block}.withheldUndated`)
  }
  // #1921.4 / #1921.5 — RETIRÉ D'ICI (tranché sans Louis, #3252, GA-26) :
  // `coachingInsights` alimente désormais `buildOnboardingRestitution`, qui
  // rend le même texte intégral dans le bloc « maillon faible » ci-dessous —
  // `hasCoaching` n'a donc plus de lecteur séparé sur cet écran.
  const profileContext = profileContextResponse?.profile_context
  const coachingInsights = profileContext?.coachingInsights
  // #1921.3 — « Tes forces » : les 3-5 points de différenciation CONCRETS que
  // le Profiler tire des réponses d'onboarding (expertise, positionnement,
  // secteurs ciblés — `apps/ia/app/models/profile_context.py:249-256`), pas
  // un jugement inventé ici. Même donnée que la colonne « Garder » de l'audit
  // commercial complet (`build-audit.ts:340`), jamais dupliquée : cet écran
  // se tait tant que le Profiler n'a rien écrit — aucune liste de remplissage.
  const strengths = profileContext?.messagingStyle?.differentiationPoints ?? []
  const hasStrengths = strengths.length > 0
  // #2071.1 — l'audit commercial complet (`/settings/profile/audit`) n'était
  // référencé nulle part : une vraie page existait depuis #2061, IMMÉDIATEMENT
  // après la génération, mais rien n'y menait. Même gate que
  // `CommercialAuditScreen` (`hasProfileContext`) : pas de lien avant qu'un
  // profil de contexte existe, sinon la page cible rendrait son état vide.
  const hasProfileContext = Boolean(profileContextResponse?.profile_context)

  const goToFreeSearch = () => navigate({ to: '/search' })
  // #1921.11 — « Analyser un compte » réutilise la recherche EXISTANTE : quand
  // des suggestions personnalisées sont déjà prêtes, on y défile plutôt que de
  // rouvrir une recherche vide juste en dessous.
  // #2075.28 — « Analyser un compte de mon audit » ouvre le parcours d'analyse PRÉREMPLI avec le premier compte de
  // l'audit (même cible et mêmes paramètres qu'un clic sur la grille de suggestions) — plus un simple défilement.
  const goToAnalyzeAccount = () => {
    const first = suggestions[0]
    if (!first) {
      goToFreeSearch()
      return
    }
    void navigate({
      to: '/search',
      search: {
        company: first.companyName,
        suggestionId: firstAnalysisSuggestionId(first),
        suggestionReason: first.reason,
      },
    })
  }
  // #1921.12 — « Partir d'un consultant » ouvre le vivier EXISTANT (même route
  // que la situation « J'ai un consultant à placer » de `SituationPicker`).
  const goToConsultants = () => navigate({ to: '/consultants' })
  // #2091.31 — « prioriser ma semaine » ouvre le portefeuille EXISTANT
  // (`/accounts`), déjà trié par `priority_score` et déjà porteur de la
  // raison par compte (`AccountHygieneNotices`) — aucune nouvelle destination.
  const goToPrioritizeWeek = () => navigate({ to: '/accounts' })
  // #2091.28 — « positionner un consultant » est ISSUE DE L'AUDIT plutôt que
  // fixe : elle ne se propose que si l'ESN a dit placer des CDI chez ses
  // clients (#1124). « Analyser un compte » reste le repli générique.
  // #2091.31 — « prioriser la semaine » ne se propose que si le portefeuille
  // porte déjà au moins un compte en attente d'action, et JAMAIS en plus de
  // « positionner un consultant » — trois cartes maximum (#2091.28).
  const welcomeCards = deriveWelcomeCards({
    recruitsForClients: esnAnswers?.recruits_for_clients,
    hasAccountsToAct: accountsToAct?.hasAccountsToAct,
    // #2091.28 — « analyser un compte » est celle de l'audit quand il a proposé des comptes.
    hasAuditSuggestions: hasSuggestions,
  })
  // #1921.10 — « Laisse Laura choisir » ouvre une conversation NEUVE avec
  // Laura, sans `prompt` ni `ask` : c'est elle qui parle en premier (son
  // amorce `justOnboarded`, posée ailleurs). `from=welcome` ne fait QUE
  // qualifier l'origine du fil — voir `routes/chat/index.tsx`.
  // #2091.34 — LE PÉRIMÈTRE ET LA STRATÉGIE voyagent désormais avec elle, par
  // le même canal `context` que les dossiers de compte (#2123.56) : Laura ne
  // recevait auparavant que l'ORIGINE du clic, aucune des pièces de contexte
  // de l'audit.
  const goToLauraHandoff = () =>
    navigate({
      to: '/chat',
      search: {
        from: 'welcome',
        context: welcomeLauraContext(t, {
          isLoading: esnLoading,
          recruitsForClients: esnAnswers?.recruits_for_clients,
          targetSectors: esnAnswers?.target_sectors ?? [],
          // #2091.34 — l'audit actif voyage avec la conversation.
          hasActiveAudit: hasProfileContext,
        }),
      },
    })

  // #3252 (BEL-SC-223) — la restitution de fin d'onboarding : ASSEMBLE
  // `frontsBudget` et `coachingInsights`, sans second calcul (GA-26).
  const restitution = buildOnboardingRestitution({
    answers: esnAnswers ?? null,
    coachingInsights: coachingInsights ?? null,
    hasAccountsToAct: accountsToAct?.hasAccountsToAct ?? false,
  })
  // #3252.8 — « Ce n'est pas mon contexte » réutilise le SEUL déclencheur de
  // reconfiguration existant (`useReconfigureOnboarding`, déjà posé par
  // #2021/#2022 dans Paramètres › Profil) — jamais un second chemin vers
  // `POST /onboarding/refresh`.
  const reconfigure = useReconfigureOnboarding()
  const onNotMyContext = async (): Promise<void> => {
    const ok = await reconfigure.trigger()
    if (!ok) toast.error(t('reconfigure.error', { ns: 'onboarding' }))
  }
  // #3252.10 — « Lancer mon premier chantier » suit la MÊME priorité que le
  // premier test affiché juste au-dessus : jamais une destination devinée.
  const FIRST_WORKSITE_ROUTE: Record<string, () => void> = {
    extendExistingAccounts: goToPrioritizeWeek,
    defineOffer: () => navigate({ to: '/onboarding' }),
    buildAccessPath: goToLauraHandoff,
    analyzeFirstAccount: goToAnalyzeAccount,
  }
  const onStartFirstWorksite = (): void => {
    const key = restitution.firstTest?.priority ?? restitution.priorities[0]
    const go = (key && FIRST_WORKSITE_ROUTE[key]) || goToAnalyzeAccount
    go()
  }

  // #2085.9 — « première valeur vue » : le premier rendu de CET écran une fois
  // les vraies réponses chargées (voir la définition complète au-dessus de
  // `trackOnboardingFirstValueViewed`). Posé en effet, pas dans le corps du
  // composant : `esnLoading` bascule UNE fois par montage, et l'émetteur
  // lui-même se protège d'un second appel dans le même onglet.
  useEffect(() => {
    if (esnLoading) return
    trackOnboardingFirstValueViewed(WELCOME_SCREEN)
  }, [esnLoading])

  // Wait for the ESN answers before painting the summary so we never flash the
  // "À compléter" fallbacks on a profile that is actually filled in.
  if (esnLoading) {
    return (
      <div className="grid h-full place-items-center bg-[var(--bellum-bg)]">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="relative h-full overflow-y-auto bg-[var(--bellum-bg)] text-[var(--bellum-text-primary)] [scrollbar-gutter:stable]">
      {/* Barre haute de `onboarding-accueil` : marque · sous-titre, sans fond ni filet. */}
      <div className="sticky top-0 z-10 flex h-16 items-center gap-4 bg-[var(--bellum-bg)] px-4 md:px-8">
        <BrandMark />
        <span className="hidden text-xs text-[var(--bellum-text-muted)] lg:inline">{t('header.topbar')}</span>
      </div>
      {/* Maquette validée `shell/ouverture.html#ouverture-premier-jour` dans la grammaire de Théo
          (`onboarding-accueil`) : en-tête de page, les gestes, Laura, le tableau des comptes
          proposés, ce que Bellum a compris ; puis les blocs existants, gardés dans le même ordre. */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="relative mx-auto flex w-full max-w-6xl flex-col gap-7 px-4 pb-32 pt-4 md:px-8 md:pt-6"
      >
        {/* `.ob23-heading` — surtitre d'accent, h1 au prénom, phrase. */}
        <motion.header variants={itemVariants} data-testid="welcome-heading" className="mt-2">
          <span className="block text-xs font-semibold uppercase tracking-widest text-[var(--bellum-text-accent)]">
            {t('header.kicker')}
          </span>
          <Text element="h1" size="3xl" weight="semibold" className="mt-3 tracking-tight md:text-4xl">
            {firstName ? t('header.greetingNamed', { name: firstName }) : t('header.greeting')}
          </Text>
          <Text element="p" size="sm" className="mt-3 max-w-[78ch] leading-relaxed text-[var(--bellum-text-secondary)]">
            {t('header.subtitle')}
          </Text>
        </motion.header>

        {/* #2091.40 — LE PREMIER ÉCRAN EST LAURA, OU UNE ACTION QU'ELLE A
            PRÉPARÉE : les gestes juste sous le titre (`.ob23-actions`), puis la
            parole de Laura signée de son portrait. Contenu inchangé (voir
            #1921.9 → #1921.12) — seul son RANG et sa forme suivent la maquette.
            #1921.10 → #1921.12 / #2091.28 — un CTA principal qui passe la
            main à Laura, et jusqu'à deux secondaires ISSUES DE L'AUDIT
            (`welcomeCards`) qui réutilisent des destinations EXISTANTES. */}
        <motion.div variants={itemVariants} className="space-y-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <Button type="button" variant="default" icon={ArrowRight} iconPosition="right" onClick={goToLauraHandoff}>
              {t('cta.chooseForMe')}
            </Button>
            <Button type="button" variant="outline" onClick={goToAnalyzeAccount}>
              {welcomeCards.includes('analyzeAccountFromAudit')
                ? t('cta.analyzeAccountFromAudit')
                : t('cta.analyzeAccount')}
            </Button>
            {welcomeCards.includes('positionConsultant') && (
              <Button type="button" variant="outline" onClick={goToConsultants}>
                {t('cta.startFromConsultant')}
              </Button>
            )}
            {welcomeCards.includes('prioritizeWeek') && (
              <Button type="button" variant="outline" onClick={goToPrioritizeWeek}>
                {t('cta.prioritizeWeek')}
              </Button>
            )}
          </div>
          <div
            data-testid="welcome-laura"
            className="flex items-start gap-3 rounded-r-control border-l-2 border-[var(--bellum-text-accent)] bg-[var(--bellum-surface-2)] px-4 py-3.5"
          >
            <LauraFace size={32} decorative className="shrink-0" />
            {/* #2091.26 — « j'ai MAINTENANT suffisamment de contexte » n'est vraie
                QUE si le profil de contexte est réellement chargé (GA-18/19
                appliqué à une phrase plutôt qu'à un chiffre). */}
            <Text element="p" size="sm" className="leading-relaxed text-[var(--bellum-text-primary)]">
              {hasProfileContext
                ? firstName
                  ? t('laura.messageNamed', { name: firstName })
                  : t('laura.message')
                : firstName
                  ? t('laura.messageNamedPending', { name: firstName })
                  : t('laura.messagePending')}
            </Text>
          </div>
        </motion.div>

        {/* `#premier-suggestions` — les comptes proposés, en TABLEAU commun
            (Compte · Secteur visé · Pourquoi · Analyser). Chaque ligne lance
            /search?company=<nom> ; une suggestion ne verrouille jamais la
            recherche libre (le geste au-dessus y mène). */}
        {(hasSuggestions || suggestionsWithheld) && (
          <motion.section
            ref={suggestionsRef}
            variants={itemVariants}
            className="scroll-mt-8 space-y-3"
            aria-labelledby="welcome-suggestions-title"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <Text id="welcome-suggestions-title" element="h2" size="base" weight="semibold">
                {t('suggestions.title')}
              </Text>
              <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
                {t('suggestions.subtitle')}
              </Text>
            </div>
            {/* #2069.1 — un état vide NOMMÉ, jamais une section qui disparaît.
                Les noms stockés qu'aucune source n'a prouvés ne sont plus
                servis : le dire, avec leur date, vaut mieux que quatre noms
                plausibles et cliquables — chaque clic lance une analyse. */}
            {suggestionsWithheld ? (
              <div className="space-y-3 rounded-card border border-[var(--bellum-border)] bg-card p-6">
                <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
                  {noticeFor('welcomeSummary.firstAnalysisSuggestions', 'suggestions')}
                </Text>
                <Button type="button" variant="secondary" onClick={goToFreeSearch}>
                  {t('suggestions.withheldCta')}
                </Button>
              </div>
            ) : (
              <div className="rounded-card border border-[var(--bellum-border)] bg-card px-4 py-2">
                <FirstAnalysisSuggestionsGrid suggestions={suggestions} variant="table" />
              </div>
            )}
          </motion.section>
        )}

        {/* Profile summary — proves Bellum understood the profile */}
        <motion.section variants={itemVariants} aria-labelledby="welcome-profile-title">
          <div className="space-y-4 rounded-card border border-[var(--bellum-border)] bg-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text id="welcome-profile-title" element="h2" size="base" weight="semibold">
                {t('summary.title')}
              </Text>
              {/* ONB-04 : la restitution est la meilleure preuve de valeur du
                  produit — et elle était en LECTURE SEULE. Une information fausse
                  qu'on ne peut pas corriger décrédibilise tout ce qui en découle
                  (recherches, contacts, messages, score), et l'utilisateur n'a
                  aucun moyen de savoir que le reste dépend d'elle. Le lien mène
                  au questionnaire lui-même : un second écran d'édition finirait
                  par diverger de celui qui a posé les questions. */}
              {/* #2002 (famille) — geste AUTONOME au bout d'une ligne d'entête,
                  pas un lien dans une phrase : il tient donc le plancher de
                  44 px (GA-30). `pointer-coarse:inline-flex` n'est pas un
                  ornement — `min-height` ne s'applique pas à une boîte inline,
                  et un `<Link>` rend une `<a>`. */}
              <Link
                to="/onboarding"
                className="text-xs font-medium text-[var(--bellum-text-accent)] underline underline-offset-4 dark:text-[var(--bellum-text-accent)] pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
              >
                {t('summary.edit')}
              </Link>
            </div>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
              {summaryRows.map(row => (
                <div key={row.label} className="space-y-1">
                  <dt className="text-xs font-medium uppercase tracking-wide text-[var(--bellum-text-muted)]">
                    {row.label}
                  </dt>
                  <dd className="text-sm font-medium text-[var(--bellum-text-primary)]">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </motion.section>

        <motion.section variants={itemVariants} aria-labelledby="restitution-understanding-title">
          <OnboardingRestitutionCard
            restitution={restitution}
            onNotMyContext={() => void onNotMyContext()}
            onRefineWithLaura={goToLauraHandoff}
            onStartFirstWorksite={onStartFirstWorksite}
            notMyContextPending={reconfigure.pending}
          />
        </motion.section>

        {/* #2071.1 — la porte vers l'audit commercial complet, IMMÉDIATEMENT
            après la génération : un teaser d'une ligne, jamais le contenu de
            l'audit lui-même (loi 4 — il vit sur SA page, `AuditHero` etc.). */}
        {hasProfileContext && (
          <motion.section variants={itemVariants} aria-labelledby="welcome-audit-title">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-[var(--bellum-border)] bg-card p-6">
              <div className="space-y-1">
                <Text id="welcome-audit-title" element="h2" size="base" weight="semibold">
                  {t('audit.title')}
                </Text>
                <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
                  {t('audit.teaser')}
                </Text>
              </div>
              {/* #2002 (famille) — geste autonome, plancher 44 px (GA-30). */}
              <Link
                to="/settings/profile/audit"
                className="shrink-0 text-xs font-medium text-[var(--bellum-text-accent)] underline underline-offset-4 pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
              >
                {t('audit.cta')}
              </Link>
            </div>
          </motion.section>
        )}

        {/* Personalization row — what Bellum tailors for this profile */}
        <motion.section variants={itemVariants} className="space-y-4" aria-labelledby="welcome-perso-title">
          <Text id="welcome-perso-title" element="h2" size="base" weight="semibold">
            {t('personalization.title')}
          </Text>
          {/* D'OÙ vient cette personnalisation (ONB-04). Les quatre tuiles
              affichaient le résultat sans dire ce qui l'avait produit : un
              utilisateur qui trouve la recommandation à côté de la plaque ne
              peut pas savoir QUELLE réponse corriger. Une phrase, pas un
              tableau — la correction se fait au questionnaire, pas ici. */}
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('personalization.provenance')}
          </Text>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* i18n keys: personalization.searches.* | personalization.contacts.* | personalization.messages.* | personalization.scoring.* */}
            {PERSONALIZATION_ITEMS.map(item => (
              <PersonalizationTile
                key={item.key}
                icon={item.icon}
                title={t(`personalization.${item.key}.title`)}
                body={item.pick(summary)}
                fallback={t(`personalization.${item.key}.fallback`)}
                notice={noticeFor(item.path, 'personalization')}
              />
            ))}
          </div>
        </motion.section>

        {/* #1921.3 — « Tes forces » : rendu direct, jamais un teaser+lien —
            contrairement à l'audit complet (#2071.1), il n'y a pas de second
            écran où ces points vivraient déjà avec plus de détail. */}
        {hasStrengths && (
          <motion.section variants={itemVariants} aria-labelledby="welcome-strengths-title">
            <div className="space-y-3 rounded-card border border-[var(--bellum-border)] bg-card p-6">
              <Text id="welcome-strengths-title" element="h2" size="base" weight="semibold">
                {t('strengths.sectionTitle')}
              </Text>
              <ul className="grid list-none gap-2 p-0 text-sm text-[var(--bellum-text-primary)] sm:grid-cols-2">
                {strengths.map(point => (
                  <li key={point} className="leading-relaxed">
                    <FieldText value={point} />
                  </li>
                ))}
              </ul>
            </div>
          </motion.section>
        )}

        {/* #1921.4 / #1921.5 — RETIRÉ, tranché sans Louis (#3252, doctrine
            GA-26 : « rien n'apparaît deux fois sous la même forme »). Le
            bloc « Ton principal maillon faible » de `OnboardingRestitutionCard`
            (juste au-dessus) rend désormais le MÊME texte intégral
            (`coachingInsights.mainWeakness` / `keyAdvice`), sans repli, avec
            en plus les faits cités et la confiance catégorielle — un second
            bloc ici aurait dupliqué exactement ce contenu sur le même écran.
            `CoachingFooter` a été supprimé (plus aucun appelant, ni ici ni
            sur `/settings/profile/context`, qui rend la MÊME
            `OnboardingRestitutionCard`). */}

        {/* R16-3 — un outil BRANCHÉ se nomme, au présent, et le geste proposé
            n'est plus « connecter » (#1921.8 appliquait la règle du 02/08/2026,
            remplacée le 13/09/2026 — voir `useConnectedCapabilities` ci-dessus).
            Un outil NON branché reste nommé par CAPACITÉ (« ton CRM », « ta
            messagerie », « ton agenda ») — cette moitié de la règle d'avant
            n'a pas changé. */}
        <motion.section variants={itemVariants} aria-labelledby="welcome-connectors-title">
          <div className="space-y-3 rounded-card border border-[var(--bellum-border)] bg-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text id="welcome-connectors-title" element="h2" size="base" weight="semibold">
                {t(hasConnectedTool ? 'connectors.titleConnected' : 'connectors.title')}
              </Text>
              {/* #2002 (famille) — même geste autonome, même plancher. Le lien
                  reste `/integrations` dans les deux cas : c'est là qu'on gère
                  ET qu'on connecte — un outil branché n'a pas besoin d'une
                  seconde destination. */}
              <Link
                to="/integrations"
                className="text-xs font-medium text-[var(--bellum-text-accent)] underline underline-offset-4 pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
              >
                {t(hasConnectedTool ? 'connectors.ctaConnected' : 'connectors.cta')}
              </Link>
            </div>
            <ul className="grid list-none gap-2 p-0 text-sm text-[var(--bellum-text-secondary)] sm:grid-cols-3">
              <li>{crmTool ? t('connectors.crmConnected', { name: crmTool.name }) : t('connectors.crm')}</li>
              <li>
                {mailboxTool ? t('connectors.mailboxConnected', { name: mailboxTool.name }) : t('connectors.mailbox')}
              </li>
              <li>
                {agendaTool ? t('connectors.agendaConnected', { name: agendaTool.name }) : t('connectors.agenda')}
              </li>
            </ul>
            {/* #2083 — « NE JAMAIS BLOQUER L’UTILISATEUR » : tant qu’aucun outil
                n’est branché, dire explicitement ce qui reste possible tout de
                suite (#2083.1-.5, .7) et ce qui change en attendant (#2083.8-.13)
                — jamais un silence que l’utilisateur doit interpréter lui-même.
                Une fois un outil branché, `connectors.titleConnected` porte déjà
                cette assurance : la doublure disparaît (loi 4 du design).
                #2083.15 — `MarketAwarenessCard` continue de rendre `null` sans
                zone ni expertise déclarée, une décision DÉLIBÉRÉE de #1627
                (« RIEN N’EST BLOQUANT », `MarketAwarenessCard.tsx:63-68`) qu’on
                ne renverse pas ici : la bulle « mémoire marché » ci-dessous porte
                la condition à sa place, pour que son absence éventuelle ne se
                lise jamais comme un vide anormal.
                #2083.16 — cette liste vit HORS de `market-memory/` : GA-259 ne la
                voit pas. Elle ne formule donc JAMAIS un taux ni un pourcentage de
                couverture — uniquement des capacités nommées. */}
            {!hasConnectedTool && (
              <div className="space-y-4 border-t border-[var(--bellum-border)] pt-3">
                <div className="space-y-2">
                  <Text
                    element="h3"
                    size="xs"
                    weight="semibold"
                    className="uppercase tracking-wide text-[var(--bellum-text-muted)]"
                  >
                    {t('withoutConnector.title')}
                  </Text>
                  <ul className="grid list-none gap-2 p-0 text-sm text-[var(--bellum-text-secondary)] sm:grid-cols-2">
                    <li>{t('withoutConnector.possible.marketMemory')}</li>
                    <li>{t('withoutConnector.possible.discover')}</li>
                    <li>{t('withoutConnector.possible.publicSearch')}</li>
                    <li>{t('withoutConnector.possible.manualAdd')}</li>
                    <li>{t('withoutConnector.possible.fileImport')}</li>
                    <li>{t('withoutConnector.possible.localPlanning')}</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <Text
                    element="h3"
                    size="xs"
                    weight="semibold"
                    className="uppercase tracking-wide text-[var(--bellum-text-muted)]"
                  >
                    {t('withoutConnector.lessPreciseTitle')}
                  </Text>
                  <ul className="grid list-none gap-2 p-0 text-sm text-[var(--bellum-text-secondary)] sm:grid-cols-2">
                    <li>{t('withoutConnector.lessPrecise.relations')}</li>
                    <li>{t('withoutConnector.lessPrecise.history')}</li>
                    <li>{t('withoutConnector.lessPrecise.meetings')}</li>
                    <li>{t('withoutConnector.lessPrecise.duplicates')}</li>
                    <li>{t('withoutConnector.lessPrecise.crmWrite')}</li>
                    <li>{t('withoutConnector.lessPrecise.mailDraft')}</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </motion.section>

        {/* #1627 — la première valeur marché, APRÈS le Profil ESN et AVANT le
            choix de situation (CRM/messagerie/analyse) : voir la doc de
            `MarketAwarenessCard` pour la raison de cet emplacement précis. Se
            tait entièrement (rend `null`) sans expertise ni zone déclarée, ou
            si le corpus n'a rien à montrer — jamais un état bloquant. */}
        <motion.section variants={itemVariants}>
          <MarketAwarenessCard />
        </motion.section>

        {/* décision Louis 19/10 — maillon faible : Cockpit seul (/pilotage) */}

        {/* Par où l'on commence, en SITUATIONS et non en fonctionnalités
            (tome 1 §13.6). Le bêta testeur n'a pas trouvé Découvrir : il ne
            savait pas que les signaux existaient, il cherchait la page
            d'accueil. */}
        <motion.section variants={itemVariants}>
          <SituationPicker />
        </motion.section>
      </motion.div>
    </div>
  )
}

function PersonalizationTile({
  icon: Icon,
  title,
  body,
  fallback,
  notice,
}: {
  icon: LucideIcon
  title: string
  body: string
  fallback: string
  /** #2062.1 — le texte stocké a été REFUSÉ à la lecture. On le dit, avec sa
   *  date : la description statique se lirait « rien à dire ». */
  notice?: string
}) {
  const text = notice ?? (body.trim() || fallback)
  return (
    <div className="flex gap-3 rounded-card border border-[var(--bellum-border)] bg-card p-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-[var(--bellum-accent-bg)]">
        <Icon className="h-4 w-4 text-[var(--bellum-text-accent)]" />
      </span>
      <div className="min-w-0 space-y-1">
        <Text element="p" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {title}
        </Text>
        <Text element="p" size="xs" className="leading-relaxed text-[var(--bellum-text-secondary)]">
          <FieldText value={text} />
        </Text>
      </div>
    </div>
  )
}
