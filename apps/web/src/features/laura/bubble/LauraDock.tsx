import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, type NavigateOptions } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { DEFAULT_CHAT_RESEARCH_MODE, type ChatResearchMode, type NotificationItem } from '@bellum/contracts'
import { LauraFace, cn, useAnyModalOpen, useAnySelectionBarOpen, useAnySheetOpen } from '@bellum/ui'
import { LauraCard } from '@/features/laura/LauraCard'
import { askLaura } from '@/features/chat/api/laura-turn'
import { demoTurn } from '@/features/chat/api/demo-turn'
import { chatErrorMessage } from '@/features/chat/chat-error'
import { SEND_QUEUE_MAX } from '@/features/chat/queue/send-queue'
import { useSendQueue } from '@/features/chat/queue/useSendQueue'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { chatQuotaReachedText } from '@/features/chat/lib/chat-quota-text'
import { useIsMobile } from '@/features/mobile/useIsMobile'
import { useNotifications } from '@/features/notifications/hooks/useNotifications'
import { notificationDestination } from '@/features/notifications/notification-link'
import { usePlanFeature } from '@/features/plan-features/usePlanFeature'
import { TOAST_PROBLEM_MS, TOAST_SUCCESS_MS } from '@/lib/toast-duration'
import { LauraBubblePanel } from './LauraBubblePanel'
import { newBubbleConversationId, promoteEphemeralThread, type EphemeralMessage } from './ephemeral-thread'
import { useCurrentLauraContext } from './page-context-store'
import { useCurrentLauraIntro, useLauraOpenRequest } from './laura-intro-store'
import { LauraIntroBar } from './LauraIntroBar'
import { useIntroBarReserve } from './intro-bar-reserve'

/**
 * LA BULLE DE LAURA — une SURFACE de plus du même moteur, jamais un second.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PREUVE QU'AUCUN SECOND ASSISTANT N'EST NÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois chemins partagés, et aucun chemin propre :
 *
 *  · **le tour** part par `askLaura` (`features/chat/api/laura-turn.ts`), la
 *    même fonction que l'écran `/chat` — donc le même `POST /ia/chat`, donc le
 *    même plafond quotidien, le même budget de tour et la même trace ;
 *  · **l'intervention proactive** reste demandée par `LauraCard`, et par lui
 *    seul. Ce composant le MONTE, il ne rappelle pas `useLaura` : deux appels
 *    consommeraient deux interventions du plafond du jour sur le même écran ;
 *  · **les notifications** viennent de `useNotifications`, leur propriétaire, et
 *    leur destination de `notificationDestination`. La bulle ne tient aucun
 *    second registre de « lu / non lu ».
 *
 * GA-237 vérifie les deux premiers points sur le disque.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE BUDGET D'INTERRUPTION N'EST PAS CONTOURNÉ — ET C'EST UN CHOIX, PAS UN OUBLI
 * ─────────────────────────────────────────────────────────────────────────────
 * « Laura se tait quand tu travailles » et « Laura parle autant que tu
 * l'écoutes » sont des comportements LIVRÉS (`interruption-budget.ts` :
 * `MIN_GAP_MINUTES`, `THROTTLE_DAYS`, `adaptiveCapFor`, et trente-cinq
 * détecteurs). **Une bulle qui pastille à chaque page les défait** — sans jamais
 * passer par le serveur qui en tient le compte.
 *
 * Ce lanceur ne porte donc **aucune pastille automatique**. Il ne s'ouvre jamais
 * seul. C'est une PORTE, pas un signal : ouvrir Laura est toujours un geste. Les
 * notifications sont visibles À L'INTÉRIEUR — on peut y agir, ce que Louis
 * demandait — mais c'est la cloche qui reste l'endroit qui PRÉVIENT, avec son
 * compteur. Deux surfaces qui pastillent le même chiffre feraient deux
 * interrupteurs pour une seule information.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OÙ IL SE POSE, ET CE QU'IL NE CACHE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le coin bas-droite est le pixel le plus disputé du produit. Mesuré avant
 * d'écrire une ligne :
 *
 *  · le bouton de signalement — `right-4`, `bottom-4`, 44 px, `z-widget` ;
 *  · la carte de Laura — `right-6`, `bottom-6`, 384 px de large ;
 *  · les toasts (`sonner`, `position="bottom-right"`), présents partout ;
 *  · le lanceur « Approche » d'un dossier de compte — `bottom-6 right-5` ;
 *  · tout tiroir droit (`Sheet side="right"`), et le format `panel` de Laura.
 *
 * D'où trois décisions :
 *
 *  1. **Le lanceur se pose à GAUCHE du bouton de signalement**, sur la même
 *     ligne de base (`right-[4.5rem]`, `bottom-4`, 48 px) : la bande basse est
 *     la moins disputée, parce que les toasts s'empilent vers le HAUT.
 *  2. **La carte de Laura remonte de 64 px au-dessus de 768 px** (voir
 *     `presentation.ts`), pour que le lanceur ne la recouvre jamais dans l'état
 *     de repos. ⚠️ Quand le panneau est OUVERT, il passe devant la carte — c'est
 *     un recouvrement TEMPORAIRE et demandé par un geste, comme n'importe quel
 *     panneau ; il n'est pas confondu avec le fait de cacher en permanence.
 *  3. **Le lanceur s'efface pendant qu'un tiroir occupe le coin**
 *     (`useAnySheetOpen`) — exactement le mécanisme que GA-205 a posé pour le
 *     bouton de signalement, dont l'action primaire est au même endroit.
 *  4. **Le lanceur s'efface aussi pendant qu'une barre de sélection flottante
 *     occupe le bandeau bas** (`useAnySelectionBarOpen`, GA-386 — défaut
 *     mesuré en prod le 24/09/2026, #2157.10 : « Créer une cible » de
 *     `/accounts` recouvert). Une telle barre n'est pas un `Sheet` (pas de
 *     voile, pas de `Dialog.Root`), donc un second compteur plutôt qu'un
 *     détournement du premier — voir
 *     `packages/ui/src/hooks/use-selection-bar-open.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PAS DE BULLE SOUS 768 px — ET C'EST LA BONNE RÉPONSE
 * ─────────────────────────────────────────────────────────────────────────────
 * Laura est déjà le PREMIER onglet de la barre mobile **et** l'écran d'arrivée
 * (`MOBILE_TABS`, `MOBILE_HOME`). Un bouton flottant pour une destination qu'on
 * atteint d'un pouce n'ajoute rien, et il ajouterait un obstacle : sur un écran
 * étroit, aucun coin n'est libre, et il se poserait sur le quatrième onglet ou
 * sur le bouton de signalement (qui passe justement à GAUCHE en mobile pour
 * cette raison).
 *
 * ⚠️ La CARTE, elle, continue de se monter sur mobile — c'est ce composant qui la
 * porte, et la retirer sous 768 px serait une régression de Laura Produit.
 */
export function LauraDock() {
  return (
    <>
      {/* Laura Produit — l'intervention proactive. Montée inconditionnellement :
          `useLaura` doit être appelé une fois et une seule, et un démontage la
          ferait redemander un plan que le serveur refuserait (« écran déjà
          servi »), c'est-à-dire disparaître pour de bon. */}
      <LauraCard />
      <LauraBubble />
    </>
  )
}

function LauraBubble() {
  const { t } = useTranslation('lauraBubble')
  const { t: tChat } = useTranslation('chat')
  const isMobile = useIsMobile()
  const anySheetOpen = useAnySheetOpen()
  // GA-386 — une barre de sélection flottante (ex. `/accounts`) n'est pas un
  // `Sheet` ; les deux signaux se cumulent pour décider si le coin est pris.
  const anySelectionBarOpen = useAnySelectionBarOpen()
  // #4623 — un DIALOGUE ouvert (« Cadrer la recherche » de `/discover`, 3e surface de #3480) : `z-widget` (80) passe
  // au-dessus de `z-overlay` (60) et recouvrait « Appliquer et explorer ». Les primitives `Dialog`/`AlertDialog`
  // déclarent leur ouverture, le dock s'efface — pour toute modale présente ET future.
  const anyModalOpen = useAnyModalOpen()
  const cornerClaimedByFloatingBar = anySheetOpen || anySelectionBarOpen || anyModalOpen
  const location = useLocation()
  const navigate = useNavigate()
  const context = useCurrentLauraContext()
  // #1812 — l'amorce qu'un écran a déposée (`AskLaura`), tant que personne n'a
  // encore ouvert la conversation dessus.
  const intro = useCurrentLauraIntro()
  const { notifications, isLoading: notificationsLoading, markRead } = useNotifications()
  /**
   * #1901.15 — « même utilisateur, même contexte et mêmes permissions partout ».
   *
   * L'écran `/chat` lit ce verrou AVANT d'ouvrir la conversation
   * (`routes/chat/index.tsx`) ; la bulle laissait taper, puis rendait le refus
   * du serveur (`@RequireFeature('chat_ai')`). Même permission, deux conduites.
   * La même clé, lue par le même hook — et le doute n'interdit pas (offre encore
   * inconnue = saisie ouverte, c'est le serveur qui tranche).
   */
  const copilot = usePlanFeature('chat_ai')
  const chatLocked = !copilot.allowed
  /**
   * #1942.2 / #1942.12 — LA SALLE DE DÉMONSTRATION N'APPELLE AUCUN MODÈLE.
   *
   * Ce composant est monté à la RACINE du routeur (`routes/__root.tsx`) : la
   * bulle est donc ouverte dans la salle publique, dont le lien part à des
   * inconnus. L'écran `/chat` bascule depuis #1320 sur le moteur préparé —
   * « `isDemo` choisit le MOTEUR, plus l'écran » (Louis, 03/09/2026) ; la bulle,
   * elle, envoyait chaque message à `POST /ia/chat`, donc un vrai appel de
   * modèle facturé sur un espace que personne ne surveille. Même décision, même
   * source (`is_demo` de la charge crédits), même moteur : la SECONDE surface
   * conversationnelle ne pouvait pas avoir sa propre réponse à la question.
   *
   * Ce qui TIENT est la garde serveur (`ia-proxy.controller.ts`, `POST /ia/chat`) :
   * un navigateur se contourne. Celle-ci tient ce qu'un prospect VOIT.
   */
  const isDemo = useIsDemo()

  const [open, setOpen] = useState(false)
  const [conversationId, setConversationId] = useState(newBubbleConversationId)
  const [messages, setMessages] = useState<EphemeralMessage[]>([])
  /**
   * #1953.18 — « le brouillon survit à la fermeture du drawer », déjà vrai ICI
   * et à dessein : `input` vit dans CE composant, monté à la racine du routeur
   * (`__root.tsx`) et jamais démonté tant que l'onglet reste ouvert.
   * `LauraBubblePanel` — le panneau visuel — se démonte bien quand `open`
   * repasse à `false`, mais `input` n'est PAS son état : le fermer ne l'efface
   * donc pas. Voir `LauraDock.draft.test.tsx` pour le test qui tient cet
   * invariant.
   *
   * ⚠️ Ce qui n'est PAS fait ici, à dessein : une persistance `localStorage`
   * comme celle de `/chat` (`composer-draft.ts`), pour que le texte survive
   * aussi à un RECHARGEMENT de page. Le fil de cette bulle est délibérément
   * ÉPHÉMÈRE — « un rechargement efface » est une décision documentée dans
   * `ephemeral-thread.ts`, pas un oubli : ressusciter la SAISIE sans le fil
   * qui lui donnait son sens referait le « demi-état persistant » que ce
   * fichier refuse explicitement.
   */
  const [input, setInput] = useState('')
  // #2450.1 (reste partiel, épopée #2882) — le mode de recherche de CE tour.
  // Réinitialisé nulle part ailleurs qu'à l'ouverture : un choix explicite
  // tient pour toute la session de la bulle, pas seulement le tour suivant.
  const [mode, setMode] = useState<ChatResearchMode>(DEFAULT_CHAT_RESEARCH_MODE)
  const [sending, setSending] = useState(false)
  const [keeping, setKeeping] = useState(false)

  /**
   * Échap ferme.
   *
   * Le panneau n'est PAS modal — pas de voile, pas de piège au clavier, on
   * continue de travailler derrière (§5.5 : une modale bloquante est
   * explicitement interdite). Échap reste l'attente universelle, et sans lui la
   * seule sortie au clavier serait de tabuler jusqu'à la croix.
   */
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  /**
   * Les notifications NON LUES, dans l'ordre où leur propriétaire les rend.
   *
   * ⚠️ Le filtre est ici et non dans le hook : la cloche affiche les vingt
   * dernières, lues comprises, parce qu'elle est un HISTORIQUE. La bulle montre
   * ce qui ATTEND — deux lectures de la même source, pas deux sources.
   */
  const unread = useMemo(() => notifications.filter(item => item.read_at === null), [notifications])

  /**
   * Le compte que la conversation porte.
   *
   * Il vient du contexte DÉCLARÉ par l'écran, et seulement quand celui-ci
   * annonce un compte : c'est ce qui permet à « résume-moi ce dossier » de
   * marcher sans que la personne ait à nommer l'entreprise. Le serveur en résout
   * le contenu lui-même depuis le JWT — le navigateur n'envoie qu'un
   * identifiant, jamais des données de compte.
   *
   * #1812 — repli sur `intro?.accountId` : plusieurs `<AskLaura accountId=…>`
   * (ex. `ContactContent`, `DormantOpportunitiesCard`, `WatchlistSignalDetail`,
   * la colonne « prochaine action » de `MissionTrackingTable`) ne déclarent
   * AUCUN contexte de page — jusqu'ici, seule la navigation vers `/chat?
   * accountId=…` portait ce compte. Sans ce repli, ouvrir leur amorce depuis
   * la bulle perdrait silencieusement la portée que ces écrans avaient
   * construite pour cette question précise.
   */
  const accountId = (context?.kind === 'account' ? context.entityId : null) ?? intro?.accountId ?? null

  // #4066.6 — la MÊME file que /chat (un seul hook) : un message tapé pendant la réponse attend son tour.
  // Clé fixe : la bulle n'a qu'un fil à la fois ; la file retrouvée après rechargement se DIT (« restored »).
  const queueDispatchRef = useRef<(text: string) => boolean>(() => false)
  const sendQueue = useSendQueue({
    storageKey: 'dock',
    busy: sending,
    dispatch: text => queueDispatchRef.current(text),
  })
  const suspendQueue = sendQueue.suspend

  const handleSend = useCallback(
    async (override?: string) => {
      const trimmed = (override ?? input).trim()
      // #1901.15 — verrouillée, la bulle n'a pas de saisie ; la garde tient aussi
      // si un appelant passait outre.
      if (!trimmed || sending || chatLocked) return
      const askedFrom = context?.label.trim() || null
      const history = messages.map(message => ({ role: message.role, content: message.content }))
      setMessages(previous => [...previous, { role: 'user', content: trimmed, at: new Date(), askedFrom }])
      if (override === undefined) setInput('')
      setSending(true)
      try {
        // #1942.2 / #1942.12 — en salle de démonstration, la réponse est ÉCRITE
        // D'AVANCE (`demo-turn.ts`) et AUCUN appel ne part : c'est le moteur de
        // l'écran `/chat`, pas une seconde conversation. Une question qu'aucune
        // amorce ne couvre reçoit la phrase qui DIT ce qui se passe — jamais un
        // paragraphe inventé, jamais une bulle vide : le lien de démonstration
        // est ce qu'un prospect voit du produit.
        const turn = isDemo
          ? demoTurn(trimmed, t('demo.offScript'))
          : await askLaura({
              message: trimmed,
              accountId,
              conversationId,
              history,
              // Ce que l'écran DÉCLARE montrer. Absent = corps identique à celui
              // de l'écran `/chat`, donc prompt serveur byte-identique.
              pageContext: context,
              // #2450.1 — `'auto'` = clé omise, corps identique à celui d'avant.
              mode,
            })
        setMessages(previous => [
          ...previous,
          {
            role: 'assistant',
            content: turn.reply || tChat('messages.noReply'),
            at: new Date(),
            askedFrom,
            // #1901.10 — les propositions de CE tour, que la bulle jetait avec le
            // reste de `turn.context`. Rendues par la même carte que `/chat`.
            ...(turn.context?.pending_actions?.length ? { pendingActions: turn.context.pending_actions } : {}),
            // #2452.1 — le compte du tour, repli de « Aller plus loin » (`DeepenActions`).
            // Une réponse vide n'est pas une analyse : rien à approfondir.
            ...(accountId && turn.reply ? { accountId } : {}),
          },
        ])
      } catch (error) {
        // Un refus EXPLIQUÉ par le serveur (plafond quotidien, palier) est répété
        // tel quel ; une panne garde la phrase générique. La même règle et la même
        // fonction que l'écran `/chat` — un plafond atteint ne doit pas se lire
        // « erreur de connexion » selon la porte empruntée.
        const failure = chatErrorMessage(error, {
          fallback: tChat('messages.connectionError'),
          networkLost: tChat('messages.networkLost'),
          sessionExpired: tChat('messages.sessionExpired'),
          quotaNote: tChat('messages.quotaExplainer'),
          // #1957.8 → .10 — la même phrase que `/chat`, sans lien : la bulle ne rend pas le markdown.
          quotaReached: refusal => chatQuotaReachedText(tChat, refusal, { billingLink: false }),
        })
        // #4066.4 — l'échec suspend la file (jamais d'envoi silencieux de la suite) et reste nommé.
        suspendQueue(failure)
        setMessages(previous => [...previous, { role: 'assistant', content: failure, at: new Date(), askedFrom }])
      } finally {
        setSending(false)
      }
    },
    [accountId, chatLocked, context, conversationId, input, isDemo, messages, mode, sending, suspendQueue, t, tChat],
  )

  // #4066.2 — le tour d'un message en attente passe par la même porte ; hors-ligne il ne part pas.
  queueDispatchRef.current = text => {
    if (!window.navigator.onLine) return false
    void handleSend(text)
    return true
  }

  // #4066.1 — « Envoyer » pendant une réponse met en attente (5 au maximum, refus nommé).
  const handleComposerSend = useCallback(() => {
    if (!sending && sendQueue.items.length === 0) {
      void handleSend()
      return
    }
    if (chatLocked || !input.trim()) return
    if (!sendQueue.enqueue(input)) {
      toast.info(tChat('queue.full', { max: SEND_QUEUE_MAX }))
      return
    }
    setInput('')
  }, [chatLocked, handleSend, input, sendQueue, sending, tChat])

  const handleClear = useCallback(() => {
    setMessages([])
    sendQueue.clear()
    // Une clé de fil NEUVE : le résumé roulé côté serveur pour l'ancienne
    // décrivait la conversation qu'on vient d'effacer.
    setConversationId(newBubbleConversationId())
  }, [])

  const handleKeep = useCallback(async () => {
    if (messages.length === 0 || keeping) return
    setKeeping(true)
    try {
      const promoted = await promoteEphemeralThread({ messages, accountId })
      toast.success(t('ephemeral.kept'), { duration: TOAST_SUCCESS_MS })
      setOpen(false)
      handleClear()
      void navigate({
        to: '/chat',
        search: { conversationId: promoted.conversationId, ...(accountId ? { accountId } : {}) },
      } as NavigateOptions)
    } catch {
      // L'écriture EST le geste ici : une promotion à moitié écrite qu'on
      // annoncerait réussie serait pire qu'un échec dit.
      toast.error(t('ephemeral.keepFailed'), { duration: TOAST_PROBLEM_MS })
    } finally {
      setKeeping(false)
    }
  }, [accountId, handleClear, keeping, messages, navigate, t])

  const handleOpenNotification = useCallback(
    (item: NotificationItem) => {
      if (item.read_at === null) markRead.mutate(item.id)
      const destination = notificationDestination(item.link)
      if (!destination) return
      setOpen(false)
      void navigate(destination)
    },
    [markRead, navigate],
  )

  const handleFollowRoute = useCallback(
    (route: string) => {
      setOpen(false)
      void navigate({ to: route } as NavigateOptions)
    },
    [navigate],
  )

  /**
   * #1812 — LE BOUTON « ENVOYER » DE LA BULLE AGRANDIE OUVRE, IL N'ENVOIE PAS.
   *
   * Exactement la promesse d'`AskLaura` (« il ouvre la conversation existante
   * avec la question déjà écrite dans le composer ») transposée à la bulle :
   * on préremplit `input` et on ouvre le panneau. `handleSend` — le seul
   * chemin qui appelle `askLaura` — n'est appelé nulle part ici. La personne
   * relit, modifie si besoin, et clique le VRAI bouton d'envoi du panneau
   * elle-même.
   */
  // #4309.1 — un `<AskLaura>` resté visible demande l'ouverture sur place : question pré-remplie, jamais envoyée.
  const openRequest = useLauraOpenRequest()
  const handledOpenSeq = useRef(openRequest?.seq ?? 0)
  const openerRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!openRequest || openRequest.seq === handledOpenSeq.current) return
    handledOpenSeq.current = openRequest.seq
    setInput(openRequest.question)
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setOpen(true)
  }, [openRequest])

  // #4345.2 — focus rendu à l'élément d'origine à la fermeture (`dialog-restores-focus-on-close`).
  const closePanel = useCallback(() => {
    setOpen(false)
    const opener = openerRef.current
    openerRef.current = null
    if (opener?.isConnected) opener.focus()
  }, [])

  const handleIntroSend = useCallback(() => {
    if (!intro) return
    setInput(intro.question)
    setOpen(true)
  }, [intro])

  // E25 (recette démo 04/10) — la ligne d'amorce (fixe) ne recouvre plus la dernière ligne d'un tableau :
  // la page réserve sa place tant qu'elle est réellement montrée (mêmes conditions que le rendu plus bas).
  useIntroBarReserve(Boolean(!isMobile && intro && intro.scopeDepth === 0 && !open && !cornerClaimedByFloatingBar))

  // Sous 768 px, Laura est le premier onglet ET l'écran d'arrivée : la bulle n'y
  // apparaît pas. Voir le docblock du fichier.
  // #4345.2 / #4309.4 — sous 768 px, pas de rond ni de ligne d'amorce, mais le panneau s'ouvre sur DEMANDE
  // (« Demander à Laura » : question pré-remplie, page conservée). Le focus revient au déclencheur à la fermeture.
  if (isMobile && !open) return null

  // #3775.5 — « une seule Laura dans la page Laura » : sur `/chat`, l'espace plein écran EST Laura, et le rond
  // flottant se posait sur le coin du composeur. La carte proactive (`LauraCard`) n'est pas ce composant et
  // reste montée ; ailleurs le lanceur et ses préférences d'ouverture sont inchangés.
  if (location.pathname === '/chat' || location.pathname.startsWith('/chat/')) return null

  return (
    <>
      {open ? (
        <LauraBubblePanel
          messages={messages}
          sending={sending}
          input={input}
          onInputChange={setInput}
          onSend={handleComposerSend}
          sendQueue={sendQueue}
          onClose={closePanel}
          onClear={handleClear}
          onKeep={() => void handleKeep()}
          keeping={keeping}
          chatLocked={chatLocked}
          mode={mode}
          onModeChange={setMode}
          notifications={unread}
          notificationsLoading={notificationsLoading}
          onMarkRead={id => markRead.mutate(id)}
          onOpenNotification={handleOpenNotification}
          onFollowRoute={handleFollowRoute}
          pathname={location.pathname}
        />
      ) : null}
      {/* #1812 — la bulle S'AGRANDIT sur une amorce, elle ne s'ajoute pas à
          côté : le rond et la ligne agrandie ne rendent JAMAIS en même
          temps. Une fois le panneau ouvert (`open`), le rond revient — c'est
          lui qui referme, amorce ou pas.

          #1847 — et elle se TAIT tant qu'une surcouche tient la portée
          (`scopeDepth > 0`). Deux raisons, mesurées le 10/09/2026 :
          sous une modale, Radix pose `pointer-events: none` sur le corps du
          document, donc « Envoyer » ne répondrait pas — la ligne resterait
          peinte au-dessus du voile (`z-widget` 80 > `z-overlay` 60) en
          promettant un geste qui n'arrive pas ; et la surcouche affiche
          désormais SON propre `<AskLaura>`, donc la même question apparaîtrait
          deux fois sous deux formes. Le rond reprend sa place, et la ligne
          revient d'elle-même à l'amorce de la PAGE dès la fermeture — le
          registre de `laura-intro-store` la tenait pendant tout ce temps. */}
      {intro && intro.scopeDepth === 0 && !open ? (
        <LauraIntroBar
          intro={intro}
          onSend={handleIntroSend}
          className={cornerClaimedByFloatingBar ? 'hidden' : undefined}
        />
      ) : (
        <button
          type="button"
          data-bellum-capture-ignore=""
          aria-label={open ? t('launcher.close') : t('launcher.open')}
          title={open ? t('launcher.close') : t('launcher.open')}
          aria-expanded={open}
          onClick={() => setOpen(previous => !previous)}
          className={cn(
            // Le décalage vertical suit la barre d'onglets mobile comme les trois
            // autres flottants du produit — même si la bulle ne s'y affiche pas,
            // la classe reste cohérente avec le reste du coin.
            'fixed right-[4.5rem] bottom-[calc(1rem+var(--bellum-mobile-nav-height,0px))] z-widget',
            // MAQ-LAURA E135 (`.fab`) : la porte se NOMME — le visage et « Laura », pas un rond muet.
            'flex h-12 items-center justify-center gap-2 rounded-full pl-2 pr-4 text-sm font-semibold text-[var(--bellum-text-primary)]',
            'border border-[var(--bellum-border-strong)] bg-[var(--bellum-surface-1)] shadow-overlay',
            'transition-colors duration-immediate ease-bellum-out hover:bg-[var(--bellum-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]',
            // Le tiroir OU la barre de sélection gagne le coin pendant qu'il/elle
            // est ouvert(e) — le même mécanisme que le bouton de signalement
            // (GA-205), étendu aux barres de sélection flottantes (GA-386).
            cornerClaimedByFloatingBar && 'hidden',
          )}
        >
          {/* Le VISAGE de Laura, pas le glyphe du produit (D137). Ce bouton
              est sa porte : le logo Bellum y disait « le produit te répond ». */}
          <LauraFace size={28} decorative />
          <span aria-hidden="true">{t('title')}</span>
        </button>
      )}
    </>
  )
}
