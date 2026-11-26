import { isAwaitingAdmin } from '@/features/onboarding/lib/awaiting-admin'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Info, PenLine, Send, Sparkles, Wand2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { BrailleLoader, Button, Card, CardContent, Text } from '@bellum/ui'
import {
  AccueilBienvenue,
  AccueilComprendre,
  AccueilLaura,
  AccueilLauraLigne,
} from '@/features/onboarding/components/OnboardingAccueilTemps'
import { FramingHeading, FramingPage } from '@/features/onboarding/components/FramingLayout'
import { useCredits } from '@/features/credits/hooks/useCredits'
import { AwaitingAdminBanner } from '@/features/onboarding/components/AwaitingAdminBanner'
import { ExistingWorkspaceNotice } from '@/features/onboarding/components/ExistingWorkspaceNotice'
import { OnboardingPrivacyStep } from '@/features/onboarding/components/OnboardingPrivacyStep'
import { useOnboardingState, useSkipOnboarding } from '@/features/onboarding/hooks/useOnboarding'
import { useWorkspaceJoinGesture, useWorkspaceJoinOverview } from '@/features/onboarding/hooks/useWorkspaceJoin'
import {
  ONBOARDING_ESTIMATED_MINUTES,
  reconfigurationPlan,
  resolveOnboardingEntry,
  resolveOnboardingOrigin,
} from '@/features/onboarding/lib/onboarding-gate'
import { firstPendingQuestion, firstPendingSubStep } from '@/features/onboarding/lib/pending-steps'
import { firstSlugOfStage, TEMPS1_STAGE_CODES, TEMPS1_SUBSTEPS } from '@/features/onboarding/lib/questions'
import {
  ONBOARDING_QUESTIONNAIRE_ACTION,
  ONBOARDING_RESUME_ACTION,
  ONBOARDING_WELCOME_SCREEN,
} from '@/features/onboarding/lib/tracking'
import { visibleJoinCandidates } from '@/features/onboarding/lib/workspace-join'
import { trackActionAbandoned, trackActionStarted } from '@/lib/product-tracker'
import { landingRouteNow } from '@/features/preferences/preferences-provider'

const WEBSITE_URL: string = import.meta.env.VITE_MARKETING_URL || 'https://bellum-ai.com'

/** Ce qu'on explique AVANT de demander quoi que ce soit (#2013.4 → .7). */
const REASSURANCES = [
  { key: 'editable', Icon: PenLine },
  { key: 'prefill', Icon: Wand2 },
  { key: 'noSend', Icon: Send },
  { key: 'later', Icon: Sparkles },
] as const

/**
 * #2013 — LA PAGE 0 : ce que le produit promet, avant la première question.
 *
 * « Créer une page avant toute question. » La promesse vivait dans
 * `OnboardingIntroCard`, rendue DANS la première sous-étape : elle arrivait donc
 * à côté d'un formulaire déjà commencé, ce qui en fait un encart, pas un
 * accueil. Cet écran est le premier de `/onboarding`, et le questionnaire ne
 * démarre qu'au clic.
 *
 * #2022 — LE MÊME ÉCRAN SERT LA RECONFIGURATION GUIDÉE, et ce n'est pas une
 * économie de fichiers : un espace existant à qui l'on redemande quelque chose
 * a besoin exactement des mêmes réponses (combien de temps, ce que ça change,
 * est-ce que je peux reporter) — les séparer garantissait que l'un des deux
 * écrans finisse par ne plus dire l'une des quatre.
 *
 * Ce que cet écran NE fait pas : lister les fonctionnalités (#2013.12). Un
 * catalogue à l'entrée déplace la conversation sur « qu'est-ce que ça fait »
 * alors que la page suivante demande « qui es-tu ».
 */
export function OnboardingWelcomePage() {
  const { t } = useTranslation('onboarding')
  const navigate = useNavigate()
  // Théo O onboarding-accueil.R2 — trois temps sur une même route : Bienvenue · Comprendre · Laura.
  const [temps, setTemps] = useState<'welcome' | 'understand' | 'laura'>('welcome')
  const { data: state, isLoading } = useOnboardingState()
  // #2014 — l'origine du compte se lit sur les crédits, jamais devinée : une
  // lecture en échec (`data` absent) retombe sur `self_service` dans
  // `resolveOnboardingOrigin`, pas sur un écran bloqué en plus de celui-ci.
  const { data: credits } = useCredits()
  const skip = useSkipOnboarding()
  // #2016 — un espace d'entreprise existe peut-être déjà pour ce domaine. Une
  // lecture en échec ou en cours ne bloque rien : le parcours d'avant reste.
  const { data: joinOverview } = useWorkspaceJoinOverview()
  const joinGesture = useWorkspaceJoinGesture()

  if (isLoading || !state) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <BrailleLoader variant="grid-searching" />
      </div>
    )
  }

  const entry = resolveOnboardingEntry({
    status: state.status,
    answers: state.answers,
    awaitingAdmin: isAwaitingAdmin(state),
  })
  // 16/09 : status=completed avec current_stage_code=transition_summary, étapes
  // 6-7 jamais atteintes. Cet espace-là a besoin des MÊMES quatre réponses que
  // la reconfiguration (combien de temps, ce que ça change, est-ce que mes
  // réponses sont gardées, est-ce que je peux reporter) — donc le même écran.
  // Mais pas la même RAISON : rien n'a été « entièrement repensé » chez lui, des
  // sous-étapes n'ont simplement jamais été posées. Lui servir le texte de la
  // reconfiguration serait une donnée fictive, alors seuls le titre et la
  // description changent.
  const isResume = entry === 'resume'
  const isRefresh = entry === 'reconfiguration' || isResume
  const plan = isRefresh ? reconfigurationPlan(state.answers) : null
  // #2014 — l'origine du compte NEUF (bêta provisionné, retour après
  // paiement…) ne compte que sur la page d'accueil elle-même : la
  // reconfiguration et la reprise ont déjà leur propre message, ils ne se
  // demandent jamais « d'où vient ce compte ».
  // #2014.3/.7 — l'espace REJOINT (invitation acceptée ou transfert, même
  // événement) vient de l'état d'onboarding lui-même : `getState` l'a déjà
  // résolu côté API (`OnboardingService.findJoinedWorkspace`), jamais deviné
  // ici.
  const origin = isRefresh ? 'self_service' : resolveOnboardingOrigin(credits, state.joined_workspace)
  // #2004.24 — la question exacte par laquelle on reprend. La MÊME dérivation
  // que celle que `start()` suit plus bas (`firstPendingSubStep` et
  // `firstPendingQuestion` partagent leur prédicat) : annoncer une étape et en
  // ouvrir une autre serait pire que de se taire.
  const nextQuestion = isRefresh ? firstPendingQuestion(state.answers, state.inherited_answer_keys) : null
  const refreshDescription =
    plan && plan.keys.length > 0
      ? isResume
        ? t('welcome.resume.description')
        : t('welcome.refresh.description')
      : t('welcome.refresh.descriptionUpToDate')

  // #2016 — sur un compte NEUF seulement : la reconfiguration et la reprise
  // concernent un espace déjà installé, elles ne se demandent jamais s'il en
  // existe un autre.
  const joinCandidates = isRefresh ? [] : visibleJoinCandidates(joinOverview)
  const joinFirst = joinCandidates.length > 0 && joinOverview !== undefined
  const sendJoinGesture = (gesture: 'request' | 'dismiss', workspaceId: string): void => {
    joinGesture.mutate({ gesture, workspaceId }, { onError: () => toast.error(t('workspaceJoin.error')) })
  }

  /** Le questionnaire démarre ICI, et nulle part avant. */
  const start = (): void => {
    // #2022.8 — « taux de reprise » : le geste de REVENIR sur un questionnaire
    // déjà commencé, mesuré sous son propre nom d'action. Le numérateur est ce
    // clic ; le dénominateur est le `screen_viewed` que le routeur émet déjà
    // sur cet écran. Rien ici ne porte de réponse ni d'identité, et la lecture
    // reste soumise au plancher des 5 sessions distinctes.
    if (isRefresh) trackActionStarted(ONBOARDING_RESUME_ACTION, ONBOARDING_WELCOME_SCREEN)
    if (!isRefresh) {
      // Le chemin historique d'un compte neuf, à la destination près : le garde
      // de route y expédiait directement, il attend maintenant le clic.
      void navigate({ to: '/onboarding/plan' })
      return
    }
    // Reconfiguration : on reprend à la première question encore sans réponse,
    // jamais au début — « ne pas effacer les anciennes réponses » se lit aussi
    // comme « ne pas les reposer ».
    const pending = firstPendingSubStep(state.answers, state.inherited_answer_keys)
    const stage = pending?.stageCode ?? TEMPS1_STAGE_CODES[0]
    const slug = pending?.slug ?? firstSlugOfStage(stage) ?? ''
    void navigate({ to: '/onboarding/$id/$stage/$slug', params: { id: state.id, stage, slug } })
  }

  /** #2013.7 / #2022.6 — « plus tard » est une DÉCISION, elle s'écrit. */
  const later = async (): Promise<void> => {
    // #2022.8 — l'abandon qui se CLIQUE, sur l'écran où il se clique. `atStep`
    // est le nom de l'ÉTAPE (`welcome`), pas une question et pas une réponse :
    // personne n'a encore rien saisi à ce stade.
    trackActionAbandoned(ONBOARDING_QUESTIONNAIRE_ACTION, ONBOARDING_WELCOME_SCREEN, 'welcome')
    // L'écriture d'abord : sans elle, le garde de route ramènerait ici à la
    // navigation suivante — c'est ce que « plus tard » faisait jusqu'ici, faute
    // d'appelant à `POST /onboarding/skip`.
    await skip.mutateAsync().catch(() => undefined)
    void navigate({ to: landingRouteNow() })
  }

  // Théo O onboarding-accueil.R1 — le compte NEUF (ou invité, bêta, retour de paiement) voit la V23 ;
  // la reconfiguration et la reprise gardent leur écran, plus bas.
  if (!isRefresh) {
    // Théo O onboarding-accueil.A1 — les variantes d'accès tiennent dans UN bandeau sous le titre.
    const accessBanner =
      origin === 'invited'
        ? {
            title: state.joined_workspace?.invited_by_name
              ? t('welcome.invited.titleWithInviter', {
                  workspaceName: state.joined_workspace.workspace_name,
                  invitedByName: state.joined_workspace.invited_by_name,
                })
              : t('welcome.invited.title', { workspaceName: state.joined_workspace?.workspace_name ?? '' }),
            description: t('welcome.invited.description'),
          }
        : origin === 'beta_provisioned'
          ? { title: t('welcome.beta.title'), description: t('welcome.beta.description') }
          : origin === 'paid_return'
            ? { title: t('welcome.paidReturn.title'), description: t('welcome.paidReturn.description') }
            : null
    const heading =
      temps === 'understand'
        ? {
            eyebrow: t('welcome.v23.understandPanel.eyebrow'),
            title: t('welcome.v23.understandPanel.title'),
            lead: t('welcome.v23.understandPanel.intro'),
          }
        : temps === 'laura'
          ? {
              eyebrow: t('welcome.v23.lauraPanel.eyebrow'),
              title: t('welcome.v23.lauraPanel.title'),
              lead: t('welcome.v23.lauraPanel.intro'),
            }
          : { eyebrow: t('welcome.v23.eyebrow'), title: t('welcome.v23.title'), lead: t('welcome.v23.lead') }
    const toTemps = (next: typeof temps): void => {
      setTemps(next)
      document.getElementById('framing-scroll')?.scrollTo({ top: 0 })
    }
    return (
      // Théo O onboarding-accueil.N2 — « Reprendre plus tard » dans la barre haute ; ici il S'ÉCRIT (#2013.7).
      <FramingPage onLater={() => void later()} laterBusy={skip.isPending}>
        <div className="space-y-8">
          <FramingHeading eyebrow={heading.eyebrow} title={heading.title} lead={heading.lead} />

          {temps === 'understand' ? (
            <AccueilComprendre onBack={() => toTemps('welcome')} onNext={() => toTemps('laura')} />
          ) : temps === 'laura' ? (
            <AccueilLaura onBack={() => toTemps('understand')} onNext={start} />
          ) : (
            <>
              {/* Théo O onboarding-accueil.A1 — « Ton accès attend la validation d'un administrateur » : dit AVANT la première question. */}
              {state.awaiting_company_admin && (
                <AwaitingAdminBanner adminName={state.awaiting_company_admin.admin_name} />
              )}

              {/* Théo O onboarding-accueil.A1 — les variantes d'accès tiennent dans UN bandeau « info » sous le titre. */}
              {accessBanner && (
                <div
                  role="status"
                  className="flex items-start gap-3 rounded-control border-l-2 border-[var(--bellum-primary)] bg-[var(--bellum-surface-1)] px-4 py-3"
                >
                  <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--bellum-text-accent)]" />
                  <div className="space-y-1">
                    <Text size="sm" weight="semibold">
                      {accessBanner.title}
                    </Text>
                    <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                      {accessBanner.description}
                    </Text>
                  </div>
                </div>
              )}

              {/* #2016 — « Un espace existe déjà pour <nom> » : le parcours propre attend que l'espace soit tranché. */}
              {joinFirst && joinOverview && (
                <ExistingWorkspaceNotice
                  overview={joinOverview}
                  busyWorkspaceId={joinGesture.isPending ? (joinGesture.variables?.workspaceId ?? null) : null}
                  onRequest={workspaceId => sendJoinGesture('request', workspaceId)}
                  onDismiss={workspaceId => sendJoinGesture('dismiss', workspaceId)}
                  onCreateOwn={start}
                />
              )}

              {/* Théo O onboarding-accueil — « Commencer » ouvre « Comprendre Bellum », puis Laura, puis le cadrage. */}
              <AccueilBienvenue
                onStart={joinFirst ? undefined : () => toTemps('understand')}
                meta={
                  // #2013.3 / #2013.10 — la durée ET la progression, annoncées avant la première question.
                  <Text size="xs" className="text-[var(--bellum-text-muted)]">
                    {t('welcome.meta', {
                      min: ONBOARDING_ESTIMATED_MINUTES.min,
                      max: ONBOARDING_ESTIMATED_MINUTES.max,
                      steps: TEMPS1_SUBSTEPS.length,
                    })}
                  </Text>
                }
                privacy={<OnboardingPrivacyStep detailHref={`${WEBSITE_URL}/privacy`} />}
              />

              <AccueilLauraLigne />

              {/* #2602.1 — le chemin démo reste une SESSION, dite avant le clic (notre maquette validée, MAQ-SHELL-E66). */}
              <div className="flex flex-wrap items-center gap-3">
                <Text size="xs" color="text-[var(--bellum-text-muted)]">
                  {t('welcome.demoHint')}
                </Text>
                <Button asChild variant="plain" size="sm" className="ml-auto shrink-0">
                  <a href="/demo">{t('welcome.demoCta')}</a>
                </Button>
              </div>
            </>
          )}
        </div>
      </FramingPage>
    )
  }

  return (
    // #2639.1 — `#app-shell` (index.css) est une coque de hauteur FIXE
    // (`100dvh; overflow: hidden`) : tout descendant qui la dépasse est
    // ROGNÉ, sans barre de défilement, à moins de porter lui-même un
    // `overflow-y-auto`. Cette page n'en avait aucun — sur Windows à
    // 125/150 % (barre des tâches qui réduit le viewport réel) ou un
    // portable 13″, le contenu dépasse `100dvh` et le bouton de reprise, tout
    // en bas, devient inatteignable : rien ne défile, il est juste rogné.
    // Théo O (contrôle 23/10) — la reprise et la reconfiguration prennent la grammaire V23 des écrans
    // d'onboarding : barre haute (avec « Reprendre plus tard », qui ÉCRIT le report), colonne de 1140 px.
    <FramingPage onLater={() => void later()} laterBusy={skip.isPending}>
      <div className="flex flex-col gap-10">
        {/* #2086.17 (retouche 21/09) — composition éditoriale : la promesse
          (texte) et sa preuve (le diagramme des trois étapes, ou le rappel
          de ce qui est gardé en reconfiguration) cessent de s'empiler pour se
          lire côte à côte à partir de 1024 px — une colonne de lecture et un
          panneau graphique, comme un article et son encadré, plutôt qu'un
          couloir vertical unique. Sous `lg:` (donc tout le mobile, GA-28) le
          comportement d'avant reste inchangé : un seul couloir empilé.
          `min-w-0` sur la colonne de texte : le titre « invité » porte un nom
          d'espace et d'inviteur de longueur libre (#2014.3/.7), et une piste
          de grille sans ce plancher ne rétrécit pas sous son contenu
          (GA-333). */}
        <div className="grid gap-8 lg:grid-cols-[3fr_2fr] lg:items-center lg:gap-16">
          <div className="min-w-0 space-y-3">
            <Text
              element="p"
              size="xs"
              weight="semibold"
              className="uppercase tracking-[0.12em] text-[var(--bellum-text-accent)]"
            >
              {t('welcome.v23.eyebrow')}
            </Text>
            <Text element="h1" size="3xl" weight="semibold" className="tracking-tight md:text-4xl">
              {isResume ? t('welcome.resume.title') : t('welcome.refresh.title')}
            </Text>
            {/* #2086.17 — GA-34 : la borne des 70 caractères vit DANS `Text`
            (`element="p"`, `index.css`), jamais redéclarée ici (la garde
            « la borne vit dans le composant partagé » le refuse) — le
            conteneur élargi ne l'a donc pas mise à mal lire : elle vient
            gratuitement. */}
            <Text element="p" size="lg" color="text-[var(--bellum-text-secondary)]">
              {/* R15N-9 — « il nous manque quelques éléments » ne s'affiche QUE
              quand `plan` porte vraiment quelque chose à redemander : la même
              mesure que celle qui commande la durée juste en dessous. Un plan
              vide (rien à redemander) ne peut pas annoncer un manque. */}
              {refreshDescription}
            </Text>
            {/* #2013.3 / #2013.10 — la durée ET la progression, annoncées avant la
            première question. En reconfiguration la fourchette est celle des
            SEULES questions restantes, et elle disparaît quand il n'y en a
            aucune : « 0 minute » ne serait pas une durée.
            ⚠️ Relevé en production le 15/09 comme « fourchette absente » : sur
            un espace dont les questions sont toutes remplies, l'absence EST la
            bonne réponse. Ce qui manquait n'était pas la durée, c'était de
            l'écrire — les deux chemins sont tenus côte à côte dans le test. */}
            {plan?.estimatedMinutes && (
              <Text size="sm" weight="medium" className="text-[var(--bellum-text-accent)]">
                {t('welcome.refresh.duration', {
                  min: plan.estimatedMinutes.min,
                  max: plan.estimatedMinutes.max,
                  count: plan.keys.length,
                })}
              </Text>
            )}
            {/* #2004.24 — la PROCHAINE ÉTAPE, nommée par la question sur laquelle
            le bouton va réellement ouvrir. Et quand il n'y en a AUCUNE, la
            RAISON : sans elle, « Compléter mon profil » renvoie au début du
            questionnaire et ça se lit comme une panne. Les deux ne peuvent
            jamais s'afficher ensemble — elles se contrediraient. */}
            {nextQuestion ? (
              <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                {t('welcome.nextStep', { label: t(nextQuestion.label) })}
              </Text>
            ) : (
              <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                {t('welcome.noNextStep')}
              </Text>
            )}
          </div>

          <Card className="border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]">
            <CardContent className="space-y-2 p-5">
              {/* #2022.2 — dit à l'écran, parce que c'est la première inquiétude :
              « est-ce que je vais devoir tout retaper ». */}
              <Text size="sm">{t('welcome.refresh.kept')}</Text>
              {/* #2022.5 — l'impact sur les résultats, pas une promesse de score. */}
              <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                {t('welcome.refresh.impact')}
              </Text>
            </CardContent>
          </Card>
        </div>

        <ul className="space-y-2">
          {REASSURANCES.map(({ key, Icon }) => (
            <li key={key} className="flex items-start gap-2">
              <Icon className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />
              <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                {t(`welcome.reassure.${key}`)}
              </Text>
            </li>
          ))}
        </ul>

        {/* #2013.8 — ce qu'on obtient à l'arrivée, nommé : un audit et les premiers
          comptes. Pas une promesse de résultat commercial, un livrable. */}
        <Text size="sm" weight="medium">
          {t('welcome.outcome')}
        </Text>

        <div className="flex flex-wrap items-center gap-3">
          {/* #2013.11 — UN seul bouton primaire. Tout le reste est secondaire.
            ⚠️ Son LIBELLÉ diffère selon le chemin, et ce n'est pas un écart :
            « Commencer mon audit » promet un DÉBUT, ce qui serait faux pour
            quelqu'un qui a déjà répondu — on lui dit « Compléter mon profil »,
            qui est exactement ce que le clic fait. Les deux chemins sont tenus
            côte à côte par `OnboardingWelcomePage.test.tsx` (#2013.3/.11) :
            c'est ce test qui empêche la prochaine relecture de re-signaler le
            second libellé comme un défaut. */}
          <Button onClick={start}>
            <ArrowRight aria-hidden="true" className="mr-2 h-4 w-4" />
            {t('welcome.refresh.cta')}
          </Button>
        </div>

        {/* Le chemin secondaire de l'issue : « Découvrir le produit en démo ».
          #2602.1 (lot H5, 18/09/2026) — ce lien pointait vers `${WEBSITE_URL}/demo`,
          la page MARKETING (`apps/website`, un formulaire « Demander une démo »
          de capture de prospect), jamais vers la vraie entrée en démonstration
          de l'application (`/demo`, route publique de CE dépôt — voir
          `routes/demo.tsx` → `DemoEntryPage` → `demoApi.redeem()`). Deux
          recetteurs successifs n'ont trouvé AUCUN chemin d'entrée en
          démonstration depuis le produit connecté : c'était le seul bouton
          censé y mener, et il menait ailleurs.
          Le lien est RELATIF, pas une variable d'environnement de plus : cette
          app EST `app.bellum-ai.com`, elle n'a pas besoin de se nommer sa
          propre origine pour naviguer chez elle (GA-26 — un réglage vit à un
          seul endroit ; `OnboardingPlanPage.tsx`, #2002.4, tranche déjà pareil
          avec `DEMO_PATH = '/demo'`).
          Entrer en démo REMPLACE la session en cours — les cookies sont posés
          côté serveur (`DemoEntryPage`, `demoApi.redeem()`) et l'espace de
          démo est loué à un pool, ce n'est pas une bascule d'onglet. Décision
          Louis du 18/09/2026 (#2602.2) : la démonstration reste une SESSION,
          elle n'est PAS limitée à l'onglet — donc pas de `target="_blank"` qui
          ferait croire à une session préservée à côté. `welcome.demoHint` dit
          cette conséquence AVANT le clic : un bouton qui sonne comme une
          visite et qui remplace la session n'est pas une visite. */}
        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--bellum-border)] pt-6">
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('welcome.demoHint')}
          </Text>
          <Button asChild variant="plain" size="sm" className="ml-auto shrink-0">
            <a href="/demo">{t('welcome.demoCta')}</a>
          </Button>
        </div>

        {/* #2086.12 — le lien RGPD, dès ce premier écran : la première question
          arrive avant qu'on ait rien enregistré, la question « comment c'est
          utilisé » se pose ici, pas seulement dans les réglages.
          #2019 — il vit désormais DANS l'étape de confidentialité, qui dit en
          six lignes ce que la page légale détaille : une seule porte vers la
          même page, pas deux liens côte à côte.
          // #2086.34 — l'espace existant se dit avant qu'un doublon naisse :
          ce composant rend TOUJOURS ici, y compris quand `ExistingWorkspaceNotice`
          s'affiche au-dessus — c'est ce qui dit « ce qui est partagé / ce qui
          reste personnel » sur le MÊME écran que « qui approuve » (administrateurs
          nommés) et « un espace existe déjà ». Aucun retour anticipé ne l'exclut. */}
        <OnboardingPrivacyStep detailHref={`${WEBSITE_URL}/privacy`} />
      </div>
    </FramingPage>
  )
}
