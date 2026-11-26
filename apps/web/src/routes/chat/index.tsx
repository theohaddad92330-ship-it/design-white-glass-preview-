import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { chatScopeObjectFromParam, chatScopeObjectParam, type LauraPageContext } from '@bellum/contracts'
import { entryPageContext } from '@/features/chat/view/entry-page-context'
import { CustomerPage } from '@/components/page/CustomerPage'
import { FULL_BLEED_CONTENT } from '@/components/page/page-gutter'
import { Chat } from '@/features/chat/view/Chat'
import { ChatTopSlotProvider } from '@/features/chat/view/chat-top-slot'
import { usePlanFeature } from '@/features/plan-features/usePlanFeature'
import { PlanFeatureLocked } from '@/features/plan-features/PlanFeatureLocked'
import { DisabledProductRoute } from '@/features/product-gating/DisabledProductRoute'
import { LauncherProvider } from '@/features/launcher/LauncherProvider'
import { ActivationChecklist } from '@/features/onboarding/components/ActivationChecklist'
import { isProductRouteDisabled } from '@/features/product-gating/disabledRoutes'
import { WorkContextBanner } from '@/features/work-contexts/view/WorkContextBanner'
import { useIsMobile } from '@/features/mobile/useIsMobile'
import { useLauraReturn } from '@/features/chat/view/use-laura-return'
import { ScreenState } from '@/components/primitives/ScreenState'

/** Optional deep-link params: `/chat?accountId=…` pre-scopes the copilot to an
 *  account (« Demander au Copilote » sur la liste des comptes) et `?prompt=…`
 *  PRÉ-REMPLIT la zone de saisie sans envoyer (« Demander au Copilote » sur la
 *  liste des contacts) — le commercial relit avant d'envoyer. `?ask=` en
 *  revanche ENVOIE : il vient de la bibliothèque de commandes, qui affiche la
 *  phrase exacte sous le libellé, donc la relecture a déjà eu lieu. Chat lit les
 *  valeurs brutes lui-même ; les déclarer ici rend la navigation typée légale. */
type ChatSearch = {
  accountId?: string
  prompt?: string
  ask?: string
  /** Un fil PRÉCIS — ce que colle « Partager » et ce que pose la barre latérale. */
  conversationId?: string
  /**
   * Demande d'OUVRIR une conversation : `Chat` affiche la modale de portée, puis
   * retire aussitôt le paramètre de l'URL.
   *
   * ⚠️ Ce retrait n'est pas cosmétique, c'est ce qui rend le bouton REJOUABLE.
   * « Nouvelle conversation » pointait sur `/chat` : depuis l'écran `/chat` nu,
   * l'URL ne changeait pas, donc rien ne se passait — le bouton avait l'air
   * cassé. Et depuis un fil ouvert, il ramenait sur `general`, qui est un fil
   * DÉJÀ écrit et non une conversation vierge.
   */
  new?: string
  /**
   * #1947 — « Demander à Laura » ouvre une NOUVELLE discussion, sans détour par
   * la modale de portée : `Chat` tire un fil vierge, puis retire le paramètre.
   *
   * ⚠️ Même raison d'être que `new` : sans paramètre consommé, le clic depuis
   * `/chat` nu écrirait la même URL et ne ferait RIEN — y compris sur un fil
   * déjà entamé, qui n'a pas sa clé dans l'adresse.
   */
  fresh?: string
  /** #2430.4 — un lien « version figée » : le fil, borné par le serveur à cette version. */
  version?: string
  from?: 'welcome'
  /**
   * #2123.56 — le contexte du dossier qui a ouvert Laura (section d'origine,
   * périmètre, sources). Ne survit que s'il parle du compte en portée
   * (`entryPageContext`) ; `Chat` le joint au tour.
   */
  context?: LauraPageContext
  /**
   * Théo L1 — sélecteur avancé — le dossier précis choisi (`<nature>:<id>` : un
   * consultant, un besoin, une mission, une personne, une affaire, une offre
   * d'emploi). Lien partageable ; relu par le schéma du contrat, jamais deviné.
   */
  scope?: string
}

function chatAccountIdFrom(search: Record<string, unknown>): string | undefined {
  for (const key of ['accountId', 'account']) {
    const value = search[key]
    if (typeof value === 'string' && value) return value
  }
  return undefined
}

/** Théo L1 — une valeur de `?scope=` valide, ramenée à sa forme canonique ; sinon rien. */
function chatScopeParamFrom(value: unknown): string | undefined {
  const object = chatScopeObjectFromParam(value)
  return object ? chatScopeObjectParam(object) : undefined
}

export const Route = createFileRoute('/chat/')({
  validateSearch: (search: Record<string, unknown>): ChatSearch => ({
    // #3939.3 — `account` est l'alias d'`accountId` ; ramené à la clé canonique dès la validation.
    accountId: chatAccountIdFrom(search),
    prompt: typeof search.prompt === 'string' && search.prompt ? search.prompt : undefined,
    // `?ask=` ENVOIE la question : c'est le clic de la bibliothèque de commandes,
    // où la phrase envoyée est affichée sous le libellé avant le clic.
    ask: typeof search.ask === 'string' && search.ask ? search.ask : undefined,
    conversationId:
      typeof search.conversationId === 'string' && search.conversationId ? search.conversationId : undefined,
    new: typeof search.new === 'string' && search.new ? search.new : undefined,
    fresh: typeof search.fresh === 'string' && search.fresh ? search.fresh : undefined,
    version:
      typeof search.version === 'string' || typeof search.version === 'number' ? String(search.version) : undefined,
    from: search.from === 'welcome' ? 'welcome' : undefined,
    context: entryPageContext(search.context, chatAccountIdFrom(search) ?? null) ?? undefined,
    scope: chatScopeParamFrom(search.scope),
  }),
  component: ChatPage,
})

function ChatPage() {
  const { t } = useTranslation('routes')
  const disabled = isProductRouteDisabled('chat')
  // #3050 (26/09/2026, iPhone prod) — sous 768 px, le fil de Laura n'avait plus
  // qu'une ligne visible : la checklist d'activation et le bandeau de contexte
  // mangeaient le haut de l'écran, en permanence, même un fil déjà commencé.
  // Le FIL est le contenu sur ce point d'entrée mobile (`MOBILE_HOME`,
  // `mobile-nav.ts`) — la checklist n'est pas retirée, elle se pose sur
  // `/briefing` (`BriefingPage`), l'autre écran d'arrivée. Bureau inchangé.
  const isMobile = useIsMobile()
  /*
   * ⚠️ PLUS D'ARBITRAGE DE DÉMONSTRATION ICI — #1320, tranché par Louis le
   * 03/09/2026.
   *
   * Cette ligne faisait `isDemo ? <DemoChat /> : <Chat />`, et le commentaire
   * qu'elle portait invoquait une bonne raison — « pour que le vrai copilote
   * reste inchangé ». Elle a coûté deux cent six lignes de coque parallèle et
   * une démonstration qui montrait une bulle et une saisie grisée là où le
   * produit a une colonne de conversations, une portée affichée, une mémoire,
   * des réponses structurées, de la transparence et des actions.
   *
   * Le drapeau est descendu dans `Chat`, où il ne commande plus qu'une chose :
   * d'où vient la réponse (`api/demo-turn.ts`). Zéro appel Claude reste vrai —
   * et c'est vrai par construction, pas par duplication.
   */
  // Gating par offre : le copilote peut ne pas être inclus. On l'apprend AVANT
  // d'ouvrir l'écran, plutôt que sur un 403 au premier message envoyé.
  const copilot = usePlanFeature('chat_ai')
  const fullBleed = !disabled && copilot.allowed
  // #4967 (L14) — entrée NUE : on retombe sur le fil attendu ; l'état de chargement évite l'accueil entrevu.
  const search = Route.useSearch()
  const returning = useLauraReturn(search, fullBleed)
  return (
    // The copilot manages its own scroll + full height, so render it full-bleed
    // (no page padding / outer scroll) when enabled.
    <CustomerPage
      pageTitle={t('chat.pageTitle')}
      // #1906.7 — la pleine page à TOUS les paliers (`h-full p-0` gardait 24 px au-delà de 768 px, mesuré
      // en production le 13/09/2026), et sans l'entête de page de 48 px qui répétait « Laura » juste
      // au-dessus de l'entête du fil (loi 4 du tome 7). Écran verrouillé ou coupé : la coque d'avant.
      contentClassName={fullBleed ? FULL_BLEED_CONTENT : undefined}
      skipHeader={fullBleed}
    >
      {disabled ? (
        <DisabledProductRoute route="chat" />
      ) : !copilot.allowed ? (
        <PlanFeatureLocked feature="chat_ai" />
      ) : returning ? (
        <ScreenState state="loading" />
      ) : (
        /*
          Les cinq travaux gouvernés, DANS la rangée d'exemples du copilote.

          Deux déplacements successifs, et il faut les deux pour comprendre où
          ils en sont. D'abord ils vivaient dans une bande AU-DESSUS du fil,
          avec SON champ de saisie : mesuré en recette le 27/08/2026, l'écran
          portait donc deux zones de saisie à 550 px l'une de l'autre, et
          déplier un chip poussait la conversation hors de vue. Ils sont
          descendus DANS le composer. Puis, le 29/08/2026, ils ont quitté leur
          rangée « ⚡ Lancer : » — une seconde barre de pastilles pour un même
          geste — pour rejoindre les exemples au-dessus du champ, nommés par le
          TRAVAIL et non par le type d'objet (`LauncherExamples`). Ce qui reste
          sous la saisie n'apparaît qu'une fois un run armé.

          ⚠️ Le FOURNISSEUR reste monté ici et pas dans `Chat`, pour la raison
          exacte qui y avait fait monter la bande : il lit le palier (donc
          react-query), et l'y descendre tirerait cette dépendance dans les
          tests unitaires du copilote, qui n'ont pas de `QueryClientProvider`.
          Ce qui descend dans `Chat`, c'est la CONSOMMATION du contexte — dont
          le défaut est `null`, c'est-à-dire « composer d'avant ».

          `min-h-0` sur le conteneur du fil : sans lui, un enfant de flex prend
          `min-height: auto` et le fil déborde au lieu de défiler dans SA boîte.
        */
        // #3192.2 — la checklist est posée EN TÊTE du fil (elle défile) et non plus au-dessus,
        // fixe : à 1512×805 elle ramenait la zone de messages à 49 % de la hauteur (cible ≥ 60 %).
        <ChatTopSlotProvider value={isMobile ? null : <ActivationChecklist />}>
          <LauncherProvider>
            <div className="flex h-full min-h-0 flex-col overflow-clip">
              {/* #2077.2 — LES ÉTAPES D'ACTIVATION, LÀ OÙ L'UTILISATEUR ARRIVE.
                Elles ne vivaient que sur le tableau de bord, l'écran que
                personne n'ouvre en premier depuis que Laura est l'arrivée — et
                le premier onglet en mobile. Du code juste, testé, qui ne
                croisait plus son lecteur.

                Ici et pas dans `Chat`, pour la raison écrite juste au-dessus
                pour `LauncherProvider` : la liste lit react-query, et la
                descendre tirerait cette dépendance dans les suites unitaires
                du copilote, qui n'ont pas de `QueryClientProvider`.

                Ce n'est pas la loi 4 (rien deux fois sous la même forme) : ce
                sont deux ÉCRANS distincts, et le repli comme le masquage
                (#1794.2) suivent l'utilisateur d'un écran à l'autre — ils
                vivent chacun à UNE clé, lue des deux côtés. Repliée, elle
                tient une ligne ; masquée, elle ne rend rien du tout. */}
              <WorkContextBanner />
              <div className="flex min-h-0 flex-1 flex-col">
                <Chat />
              </div>
            </div>
          </LauncherProvider>
        </ChatTopSlotProvider>
      )}
    </CustomerPage>
  )
}
