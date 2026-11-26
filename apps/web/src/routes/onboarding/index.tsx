import { createFileRoute, redirect } from '@tanstack/react-router'
import { sessionManager } from '@/features/auth/session-manager'
import { creditsApi } from '@/features/credits/api'
import { onboardingApi } from '@/features/onboarding/api'
import { isAwaitingAdmin } from '@/features/onboarding/lib/awaiting-admin'
import { readOnboardingStateOrUnknown } from '@/features/onboarding/lib/guard-state'
import { canOfferResume, needsOnboarding, resolveOnboardingEntry } from '@/features/onboarding/lib/onboarding-gate'
import { firstPendingSubStep } from '@/features/onboarding/lib/pending-steps'
import { firstSlugOfStage, TEMPS1_STAGE_CODES } from '@/features/onboarding/lib/questions'
import { OnboardingWelcomePage } from '@/features/onboarding/view/OnboardingWelcomePage'
import { landingRouteNow } from '@/features/preferences/preferences-provider'

export const Route = createFileRoute('/onboarding/')({
  beforeLoad: async () => {
    const { user, sessionUnavailable } = await sessionManager.ensureLoaded()
    // #3243 — un serveur muet n'est pas une session absente : pas de /login.
    if (!user && !sessionUnavailable) throw redirect({ to: '/login' })

    // Une lecture en échec (429, 5xx, réseau) ne doit PAS remonter en erreur :
    // ce garde n'a pas d'écran à lui, son erreur devient donc l'écran « Oups »,
    // dont le rendu relance le garde — une boucle qui rendait toute
    // l'application inaccessible. Sans état, on n'invente rien : on envoie sur
    // le tableau de bord, l'écran normal de l'application. Un compte établi
    // rentre chez lui ; un vrai nouveau venu pourra relancer l'onboarding.
    const state = await readOnboardingStateOrUnknown(() => onboardingApi.getState())
    // #1786 — la route d'arrivée se DÉRIVE, elle ne se code pas en dur : ce
    // garde renvoyait `/dashboard` pendant que la connexion, elle, menait chez
    // Laura. Une règle appliquée à moitié ne tient pas.
    if (state === null) throw redirect({ to: landingRouteNow() })

    // Grandfather : un compte DÉJÀ établi n'a rien à faire dans le questionnaire
    // Temps-1, même si son `onboarding_state` n'est pas `completed` (il précède
    // le questionnaire, ou ne l'a jamais fini). Le signal fiable est le même que
    // pour l'écran de choix de plan (#746) : palier payant OU analyses déjà
    // consommées ⇒ « ce compte a déjà été servi » ⇒ direction dashboard. Sans ça,
    // un compte Growth avec des analyses au compteur était renvoyé en boucle vers
    // l'onboarding à chaque connexion. Lecture de crédits en échec = on n'assume
    // rien et on laisse le flux d'onboarding décider (comportement d'avant).
    const credits = await creditsApi.getMine().catch(() => null)
    // MÊME prédicat que la page client, sur les mêmes données : les deux gardes
    // ne peuvent plus se contredire, donc plus se renvoyer la balle.
    // `skipped_at` manquait ici : un utilisateur qui avait explicitement reporté
    // le questionnaire était quand même remis dedans à chaque passage par cette
    // route — le « Plus tard » ne tenait qu'un écran.
    // 16/09 : status=completed avec current_stage_code=transition_summary, étapes
    // 6-7 jamais atteintes. `needsOnboarding` ne lit que le STATUT, donc cette
    // ligne renvoyait chez Laura un espace à qui il restait des sous-étapes
    // JAMAIS posées — enfermé, sans aucune voie de reprise depuis cette URL.
    // La seule chose que cette exception autorise est d'AFFICHER la page 0 plus
    // bas : elle propose, elle ne relance rien (décision de Louis du 16/09).
    const resume = canOfferResume({
      status: state.status,
      answers: state.answers,
      credits,
      awaitingAdmin: isAwaitingAdmin(state),
    })
    // #2021 — `firstCompletedAt` est délibérément OMIS ici. Ce garde répond à
    // « y a-t-il une reconfiguration à faire sur /onboarding lui-même ? »,
    // pas à « faut-il rediriger une page cliente VERS /onboarding ? » (la
    // question que `CustomerPageContent`/`useOnboardingStatus` posent, elle,
    // avec `firstCompletedAt`). Le passer ici ferait que `needsOnboarding`
    // rende `false` pour un utilisateur déjà onboardé à `refresh_required` —
    // et cette ligne le renverrait alors hors de `/onboarding`, juste après
    // que le bandeau de reprise l'y ait amené. `resolveOnboardingEntry`
    // (plus bas) continue de montrer la page 0 de reconfiguration à
    // `refresh_required`, quel que soit `firstCompletedAt`.
    if (!resume && !needsOnboarding({ status: state.status, credits, skippedAt: state.skipped_at ?? null }))
      throw redirect({ to: landingRouteNow() }) // #1786 — dérivée, pas en dur

    // #2013 / #2022 — LA PAGE 0. Un questionnaire encore vierge, ou un espace à
    // qui l'on DEMANDE de reconfigurer, s'arrête ici : la promesse, la durée et
    // les quatre choses qu'il faut savoir avant de répondre. Le questionnaire
    // démarre au clic, pas à la redirection.
    //
    // Tout le reste — onboarding repris, profil partiellement répondu —
    // conserve le chemin d'avant à l'octet près : la page 0 ne doit pas devenir
    // un péage à chaque passage du tableau de bord vers `/onboarding`.
    //
    // La destination du bouton est celle que ce garde prenait lui-même
    // (`/onboarding/plan` pour un compte neuf), donc aucun compte ne change de
    // parcours — il gagne un écran devant.
    if (
      resolveOnboardingEntry({
        status: state.status,
        answers: state.answers,
        awaitingAdmin: isAwaitingAdmin(state),
      }) !== 'continue'
    )
      return

    // L'ASSOCIÉ QUI REJOINT UNE ESN DÉJÀ RENSEIGNÉE (#1671-ter).
    //
    // Retour de Louis, 07/09/2026 : « bedros est bien dans la team abricotlabs
    // mais l'onboarding est encore lancé quand il se connecte ». #1671-bis avait
    // réparé la RÉSOLUTION d'espace — les réponses de l'ESN arrivent bien jusqu'à
    // `state.answers`. Il restait que ce garde le repose au PREMIER slug de son
    // étape courante, donc sur des questions déjà répondues par l'entreprise :
    // onze des douze questions du premier temps sont des faits sur l'ESN.
    //
    // ⚠️ La condition porte sur `inherited_answer_keys` NON VIDE, et c'est
    // délibérément la lecture la plus étroite : un utilisateur seul dans son
    // espace n'hérite de rien, ne passe donc jamais par cette branche, et garde
    // le chemin d'avant à l'octet près. C'est aussi ce qui rend le lot inerte
    // pendant la fenêtre « front neuf sur API ancienne » (la clé est absente,
    // le contrat la rend `[]`).
    //
    // `null` = plus aucune question ne l'attend : on ne l'invente pas un chemin,
    // on retombe sur le comportement historique ci-dessous.
    if (state.inherited_answer_keys.length > 0) {
      const pending = firstPendingSubStep(state.answers, state.inherited_answer_keys)
      if (pending)
        throw redirect({
          to: '/onboarding/$id/$stage/$slug',
          params: { id: state.id, stage: pending.stageCode, slug: pending.slug },
        })
    }

    const stage =
      state.current_stage_code && TEMPS1_STAGE_CODES.includes(state.current_stage_code)
        ? state.current_stage_code
        : TEMPS1_STAGE_CODES[0]
    const slug = firstSlugOfStage(stage) ?? ''
    throw redirect({ to: '/onboarding/$id/$stage/$slug', params: { id: state.id, stage, slug } })
  },
  component: OnboardingWelcomePage,
})
