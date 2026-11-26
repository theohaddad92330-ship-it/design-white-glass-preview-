import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ExternalLink, SendHorizonal, Trash2, X } from 'lucide-react'
import {
  CHAT_RESEARCH_MODES,
  type ChatResearchMode,
  type LauraContextFacet,
  type NotificationItem,
} from '@bellum/contracts'
import { Box, Button, LauraFace, SelectField, Text, cn } from '@bellum/ui'
import { SendQueueBlock } from '@/features/chat/queue/SendQueueBlock'
import type { SendQueue } from '@/features/chat/queue/useSendQueue'
import { AiDisclosure } from '@/features/laura/AiDisclosure'
import { PendingActions } from '@/features/chat/view/PendingActions'
import { ReplyFooter } from '@/features/chat/view/ReplyFooter'
import { PlanFeatureLocked } from '@/features/plan-features/PlanFeatureLocked'
import { renderMarkdown } from '@/features/chat/view/markdown'
import { replyPlainText } from '@/features/chat/view/reply-blocks/plain-text'
import { useCurrentLauraContext } from './page-context-store'
import {
  declaredEntityLabel,
  declaredRecommendedAction,
  declaredScreenTitle,
  latestChanges,
  productSuggestions,
  sectionOfRoute,
  type ProductSuggestion,
} from './product-index'
import type { EphemeralMessage } from './ephemeral-thread'

/**
 * LE PANNEAU DE LA BULLE — la MÊME Laura, une autre porte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce n'est pas un second assistant. Il ne connaît ni le modèle, ni le prompt, ni
 * le budget : il compose un texte, le remet à `askLaura`
 * (`features/chat/api/laura-turn.ts`, la porte unique) et affiche ce qui
 * revient. Le plafond quotidien, le budget du tour et la trace s'appliquent
 * exactement comme sur l'écran `/chat` — parce que c'est le même appel.
 *
 * Il ne tient pas non plus un second registre de notifications. La liste et
 * l'état « lu » viennent de `useNotifications`, le propriétaire existant ; ce
 * panneau les MONTRE et permet d'agir. Deux registres divergent, et le dépôt l'a
 * déjà payé (« deux files séparées garantissent qu'une des deux sera oubliée »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS CHOSES QU'IL REFUSE DE FAIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Parler d'un écran qu'il n'a pas.** Quand l'écran déclare `loading`, il le
 *    DIT et n'avance rien. Quand aucun écran ne déclare rien, il le dit aussi —
 *    « je réponds sans savoir où tu es » vaut mieux qu'une réponse qui a l'air
 *    située et ne l'est pas.
 * 2. **Deviner une intention.** Les « réponses directes » sous la saisie sont
 *    des CANDIDATS mesurés (recouvrement de mots sur la navigation déclarée),
 *    proposés à côté de la question. Entrée envoie toujours à Laura.
 * 3. **Envoyer quoi que ce soit à l'extérieur.** Aucun chemin d'écriture : ni
 *    e-mail, ni CRM. Le copilote prépare, le commercial envoie — et ici ce n'est
 *    pas une convention, c'est l'absence de code.
 */

type LauraBubblePanelProps = {
  messages: readonly EphemeralMessage[]
  sending: boolean
  input: string
  onInputChange: (value: string) => void
  onSend: () => void
  /** #4066.6 — la file d'attente partagée avec /chat. */
  sendQueue: SendQueue
  onClose: () => void
  onClear: () => void
  onKeep: () => void
  keeping: boolean
  /**
   * #1901.15 — l'offre n'inclut pas Laura (`usePlanFeature('chat_ai')`, le verrou
   * de l'écran `/chat`). La saisie laisse alors place au MÊME message que la
   * page, en format compact ; notifications et réponses directes restent.
   */
  chatLocked: boolean
  /**
   * #2450.1 (reste partiel, épopée #2882) — le MODE DE RECHERCHE de CE tour.
   * `'auto'` (défaut) laisse l'heuristique habituelle décider ; les trois
   * autres forcent le PALIER DE MODÈLE côté service IA.
   */
  mode: ChatResearchMode
  onModeChange: (mode: ChatResearchMode) => void
  /** Les notifications NON LUES, telles que leur propriétaire les rend. */
  notifications: readonly NotificationItem[]
  notificationsLoading: boolean
  onMarkRead: (id: string) => void
  onOpenNotification: (item: NotificationItem) => void
  onFollowRoute: (route: string) => void
  /** Le chemin courant — sert au seul tuto « où tu es ». */
  pathname: string
}

export function LauraBubblePanel(props: LauraBubblePanelProps) {
  const { t, i18n } = useTranslation('lauraBubble')
  const { t: tNav } = useTranslation('nav')
  const context = useCurrentLauraContext()
  // #5032.2 — la dernière réponse de Laura : sa rangée de pied est visible sur mobile.
  let latestReplyIndex = -1
  for (let i = props.messages.length - 1; i >= 0; i -= 1) {
    const candidate = props.messages[i]
    if (candidate && candidate.role === 'assistant' && candidate.content) {
      latestReplyIndex = i
      break
    }
  }
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const suggestions = useMemo(
    () => productSuggestions({ question: props.input, language: i18n.language, label: tNav }),
    [props.input, i18n.language, tNav],
  )

  const here = useMemo(() => sectionOfRoute(props.pathname, tNav), [props.pathname, tNav])
  // Le titre DÉCLARÉ, jamais la route — une seule dérivation (GA-26), partagée
  // avec la fonction qui compose les suggestions produit ci-dessous.
  const screenTitle = declaredScreenTitle(context)

  return (
    <Box
      as="section"
      aria-label={t('title')}
      /* ⚠️ `dvh` et jamais `vh` : la barre d'URL d'un navigateur mobile se
         replie, et `vh` mesure alors faux. Un seul conteneur défilant à
         l'intérieur (le corps), jamais deux imbriqués. */
      className={cn(
        // Théo `drawer-v2` + MAQ-LAURA `#pan-laura-bulle` (ov-side) : un TIROIR de droite pleine hauteur,
        // plus une carte de 34 rem calée sur la bulle — la page reste lisible à gauche.
        'fixed right-3 top-3 bottom-[calc(0.75rem+var(--bellum-mobile-nav-height,0px))] z-widget flex flex-col',
        'w-[min(28.75rem,calc(100vw-1.5rem))]',
        'overflow-hidden rounded-overlay border border-[var(--bellum-border-strong)] bg-[var(--bellum-surface-1)] shadow-overlay',
      )}
    >
      <Box
        data-testid="laura-bubble-header"
        className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--bellum-border)] px-[1.125rem] py-4 md:px-5"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft-bg)]">
          {/* Le VISAGE de Laura (D137) — c'est elle qui parle dans ce panneau. */}
          <LauraFace size={20} decorative />
        </span>
        <Box className="min-w-[8rem] flex-1">
          <Text element="h2" size="lg" weight="semibold" className="tracking-tight">
            {t('title')}
          </Text>
          <Box className="flex flex-wrap items-center gap-x-2">
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('subtitle')}
            </Text>
            {/* « Assistante IA » — article 50 de l'EU AI Act, applicable depuis
                le 02/08/2026 : la personne doit le savoir SANS avoir à le
                demander. La bulle est la surface où ça compte le plus, parce
                que c'est la seule qui s'invite. Dans l'ENTÊTE, à côté du nom,
                jamais dans l'avatar (le patron de `ChatWidget` du site). */}
            <AiDisclosure />
          </Box>
        </Box>
        {props.messages.length > 0 ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0 whitespace-nowrap"
              onClick={props.onKeep}
              disabled={props.keeping}
            >
              {props.keeping ? t('ephemeral.keeping') : t('ephemeral.keep')}
            </Button>
            <button
              type="button"
              aria-label={t('ephemeral.clear')}
              title={t('ephemeral.clear')}
              onClick={props.onClear}
              className="flex size-11 items-center justify-center rounded-control text-[var(--bellum-text-secondary)] transition-colors duration-immediate ease-bellum-out hover:bg-[var(--bellum-surface-2)]"
            >
              <Trash2 className="size-4" />
            </button>
          </>
        ) : null}
        <button
          type="button"
          aria-label={t('close')}
          onClick={props.onClose}
          className="flex size-11 items-center justify-center rounded-control text-[var(--bellum-text-secondary)] transition-colors duration-immediate ease-bellum-out hover:bg-[var(--bellum-surface-2)]"
        >
          <X className="size-4" />
        </button>
      </Box>

      <Box ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-[1.125rem] py-4 md:px-5">
        {props.messages.length === 0 ? (
          <EmptyRail
            context={context}
            screenTitle={screenTitle}
            here={here}
            notifications={props.notifications}
            notificationsLoading={props.notificationsLoading}
            onMarkRead={props.onMarkRead}
            onOpenNotification={props.onOpenNotification}
            onStarter={props.onInputChange}
          />
        ) : (
          <Box className="flex flex-col gap-3">
            {props.messages.map((message, index) => (
              <Message
                key={`${message.role}-${index}`}
                message={message}
                currentScreen={screenTitle}
                isLatestReply={index === latestReplyIndex}
              />
            ))}
            {props.sending ? (
              <Text size="sm" color="text-[var(--bellum-text-muted)]" aria-live="polite">
                {t('composer.thinking')}
              </Text>
            ) : null}
          </Box>
        )}
      </Box>

      {suggestions.length > 0 ? (
        <Box className="border-t border-[var(--bellum-border)] px-[1.125rem] py-2 md:px-5">
          <Text size="xs" weight="semibold" color="text-[var(--bellum-text-muted)]" className={RAIL_LABEL}>
            {t('product.title')}
          </Text>
          <Box className="flex flex-col gap-1">
            {suggestions.map(suggestion => (
              <SuggestionRow
                key={suggestionKey(suggestion)}
                suggestion={suggestion}
                onFollowRoute={props.onFollowRoute}
              />
            ))}
          </Box>
        </Box>
      ) : null}

      {props.chatLocked ? (
        <Box className="border-t border-[var(--bellum-border)] px-[1.125rem] py-3.5 md:px-5">
          {/* #1901.15 — le même verrou que la page, AVANT la première question. */}
          <PlanFeatureLocked feature="chat_ai" compact />
        </Box>
      ) : (
        <Box className="border-t border-[var(--bellum-border)] px-[1.125rem] py-3.5 md:px-5">
          <SendQueueBlock queue={props.sendQueue} />
          <Box className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={props.input}
              onChange={event => props.onInputChange(event.target.value)}
              onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                if (event.key !== 'Enter' || event.shiftKey) return
                event.preventDefault()
                props.onSend()
              }}
              rows={2}
              placeholder={t('composer.placeholder')}
              aria-label={t('composer.placeholder')}
              className="min-h-11 flex-1 resize-none rounded-control border border-[var(--bellum-border-strong)] bg-[var(--bellum-bg)] px-3 py-2 text-sm text-[var(--bellum-text-primary)] outline-none focus-visible:border-[var(--bellum-text-accent)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]"
            />
            <button
              type="button"
              aria-label={t('composer.send')}
              title={t('composer.send')}
              onClick={props.onSend}
              disabled={props.input.trim().length === 0}
              className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-control bg-[var(--bellum-primary)] px-3.5 text-sm font-medium text-[var(--bellum-on-primary)] transition-colors duration-immediate ease-bellum-out hover:bg-[var(--bellum-primary-hover)] disabled:opacity-40"
            >
              {/* Théo `.btn.primary` « Envoyer » : le geste se NOMME, l'icône l'accompagne. */}
              <SendHorizonal className="size-4" aria-hidden />
              <span className="hidden sm:inline">{t('composer.send')}</span>
            </button>
          </Box>
          {/* #2450.1 (reste partiel, épopée #2882) — le mode de recherche. Un
              premier point d'appel réel pour `requested_mode`
              (`chat_model_routing.py`), déjà câblé et testé mais jamais
              atteint depuis aucune surface avant ce lot. */}
          <Box className="mt-2 flex items-center gap-2">
            <SelectField
              id="laura-bubble-mode"
              size="sm"
              value={props.mode}
              onChange={next => props.onModeChange(next as ChatResearchMode)}
              ariaLabel={t('composer.mode.label')}
              ariaDescribedBy="laura-bubble-mode-promise"
              options={CHAT_RESEARCH_MODES.map(mode => ({
                value: mode,
                label: t(`composer.mode.options.${mode}`),
              }))}
              className="min-h-11 text-xs"
            />
          </Box>
          {/* #2448.16 (épopée #2882) — la promesse du mode CHOISI, visible tout
              de suite : sans elle, les quatre options du sélecteur ne se
              distinguaient que par leur libellé, ce que le NO-GO de #2448
              interdit explicitement (« les quatre modes… modifient uniquement
              le nom affiché »). */}
          <Text id="laura-bubble-mode-promise" size="xs" color="text-[var(--bellum-text-muted)]" className="mt-2">
            {t(`composer.mode.promise.${props.mode}`)}
          </Text>
          <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-2">
            {t('ephemeral.explain')}
          </Text>
        </Box>
      )}
    </Box>
  )
}

/** `.menu-label` des maquettes : l'intertitre d'une rubrique du panneau. */
const RAIL_LABEL = 'mb-1.5 block uppercase tracking-wider'

function suggestionKey(suggestion: ProductSuggestion): string {
  return suggestion.kind === 'destination' ? `d:${suggestion.destination.route}` : `c:${suggestion.entry.id}`
}

function SuggestionRow(props: { suggestion: ProductSuggestion; onFollowRoute: (route: string) => void }) {
  const { t } = useTranslation('lauraBubble')
  const { suggestion } = props
  if (suggestion.kind === 'changelog') {
    return (
      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
        {t('product.changelog', { date: suggestion.entry.date, title: suggestion.entry.title })}
      </Text>
    )
  }
  return (
    // ⚠️ Un `<button>` et non un `<div onClick>` : ce qui se clique se tabule
    // (GA-35). Cible ≥ 44 px en pointeur grossier (GA-30) via `min-h-11`.
    <button
      type="button"
      onClick={() => props.onFollowRoute(suggestion.destination.route)}
      className="flex min-h-11 items-center justify-between gap-2 rounded-control px-2 text-left transition-colors duration-immediate ease-bellum-out hover:bg-[var(--bellum-surface-2)]"
    >
      <Text size="xs" color="text-[var(--bellum-text-accent)]">
        {t('product.destination', {
          label: suggestion.destination.label,
          section: suggestion.destination.sectionLabel,
        })}
      </Text>
      <ExternalLink className="size-3 shrink-0 text-[var(--bellum-text-muted)]" />
    </button>
  )
}

function Message(props: { message: EphemeralMessage; currentScreen: string | null; isLatestReply: boolean }) {
  const { t } = useTranslation('lauraBubble')
  const { t: tChat } = useTranslation('chat')
  const { message } = props
  const isUser = message.role === 'user'
  // #5032.2 — mobile : la rangée du pied est visible sous la dernière réponse ; toucher une plus ancienne affiche la sienne.
  const [touched, setTouched] = useState(false)
  // « Posée depuis … » n'apparaît QUE si l'écran a changé depuis : le répéter à
  // chaque message sur l'écran courant serait du bruit, et le taire quand il a
  // changé ferait relire une réponse comme si elle parlait d'ici.
  const movedOn = Boolean(message.askedFrom) && message.askedFrom !== props.currentScreen
  // #2892 (27/09) — recette prod (`/chat`, même défaut ici) : « Pas de réponse. »
  // s'affichait, PARASITE, devant la carte d'action qui suivait. `content` reste
  // non vide (`promoteEphemeralThread` l'écrit tel quel, et le contrat de
  // persistance l'exige) — seul l'AFFICHAGE du repli s'efface quand une carte suit.
  const hasAFollowingCard = !isUser && Boolean(message.pendingActions?.length)
  const isBareNoReplyFallback = message.content === tChat('messages.noReply')
  const showsTextContent = Boolean(message.content) && !(isBareNoReplyFallback && hasAFollowingCard)
  return (
    <div
      // #5032.16 — `group/reply` : le survol ou le focus de la réponse montre la rangée de son pied (comme /chat).
      className={cn('group/reply flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}
      onPointerDown={isUser ? undefined : () => setTouched(true)}
    >
      {showsTextContent ? (
        <Box
          className={cn(
            'max-w-[85%] rounded-card px-3 py-2',
            isUser ? 'bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)]' : 'bg-[var(--bellum-surface-2)]',
          )}
        >
          {/* #1914 — la bulle rend du texte : une carte `bellum-block` y arrive lisible, jamais en JSON. */}
          {/* #4098 — le texte de Laura se rend en markdown, comme /chat (jamais « **réserve** » brut) ;
              le message de la personne reste du texte tel que saisi. */}
          {isUser ? (
            <Text size="sm" className="whitespace-pre-wrap">
              {replyPlainText(message.content)}
            </Text>
          ) : (
            <div className="text-sm">{renderMarkdown(replyPlainText(message.content))}</div>
          )}
        </Box>
      ) : null}
      {/* #1901.10 — ce que Laura propose se valide ICI, avec la carte de `/chat` :
          une seule liste d'actions, pas une seconde. Sans elle, « je te propose de
          le retenir » arrivait sans rien à valider. */}
      {!isUser && message.pendingActions?.length ? <PendingActions actions={message.pendingActions} /> : null}
      {/* #5032.16 — le MÊME pied de réponse que /chat : cinq contrôles, invisibles au repos.
          #5032.14 revient sur #2452.1 / #2907 : le repli « Aller plus loin sur cette réponse » est retiré ;
          l'approfondissement s'atteint par Ajuster › « Approfondir (avec devis) », sur le même moteur (#2452).
          Le compte cadré par le tour reste le repli (`accountId`) quand la réponse n'en cite aucun.
          Un échec ne porte pas de compte (`LauraDock`) : aucune réponse à ajuster. */}
      {!isUser && message.content.trim() ? (
        <ReplyFooter
          context={undefined}
          text={replyPlainText(message.content)}
          source={message.content}
          accountId={message.accountId ?? null}
          timestamp={message.at}
          revealed={props.isLatestReply || touched}
        />
      ) : null}
      {movedOn ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('context.askedFrom', { screen: message.askedFrom })}
        </Text>
      ) : null}
    </div>
  )
}

/**
 * Ce que la bulle montre AVANT le premier message : ce qu'elle voit, ce qui
 * attend, et par où commencer.
 *
 * L'ordre est délibéré — d'abord ce qui est VRAI de l'écran courant, puis ce que
 * quelqu'un d'autre a mis dans la file, puis des amorces. L'inverse ferait de la
 * bulle une boîte de réception de plus.
 */
function EmptyRail(props: {
  context: ReturnType<typeof useCurrentLauraContext>
  screenTitle: string | null
  here: ReturnType<typeof sectionOfRoute>
  notifications: readonly NotificationItem[]
  notificationsLoading: boolean
  onMarkRead: (id: string) => void
  onOpenNotification: (item: NotificationItem) => void
  onStarter: (prompt: string) => void
}) {
  const { t, i18n } = useTranslation('lauraBubble')
  const changes = latestChanges(i18n.language, 1)

  return (
    <Box className="flex flex-col gap-5">
      {/* MAQ-LAURA E138 — « Ce que je vois de ton écran », dans un creux : c'est un CONSTAT, pas une réponse. */}
      <Box className="rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3.5 py-3">
        <Text size="xs" weight="semibold" color="text-[var(--bellum-text-muted)]" className={RAIL_LABEL}>
          {t('context.title')}
        </Text>
        {props.context === null ? (
          <Text size="sm" color="text-[var(--bellum-text-secondary)]">
            {t('context.none')}
          </Text>
        ) : props.context.state === 'loading' ? (
          <Text size="sm" color="text-[var(--bellum-text-secondary)]">
            {t('context.loading', { screen: props.screenTitle })}
          </Text>
        ) : (
          <>
            <Text size="sm">{props.screenTitle}</Text>
            {/* #1904.3 — l'objet ouvert, distinct du titre de l'écran. */}
            {declaredEntityLabel(props.context) ? (
              <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                {t('context.entityLabel', { value: declaredEntityLabel(props.context) })}
              </Text>
            ) : null}
            {props.context.facets.map((facet: LauraContextFacet) => (
              <Text key={facet.label} size="xs" color="text-[var(--bellum-text-secondary)]">
                {facet.label} : {facet.value}
              </Text>
            ))}
            {/* #1904.9 — le geste le plus utile, quand l'écran en désigne un. */}
            {declaredRecommendedAction(props.context) ? (
              <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                {t('context.recommendedAction', { value: declaredRecommendedAction(props.context) })}
              </Text>
            ) : null}
          </>
        )}
        {/* Le « tuto » de la page : dérivé de la navigation déclarée, jamais
            écrit écran par écran. Une route qui change de section change cette
            phrase sans que personne n'y pense. */}
        <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-1">
          {props.here === null
            ? t('tutorial.unknown')
            : `${t('tutorial.section', { screen: props.screenTitle ?? props.here.section, section: props.here.section })}${
                props.here.siblings.length > 1
                  ? ` ${t('tutorial.siblings', { tabs: props.here.siblings.map(sibling => sibling.label).join(', ') })}`
                  : ''
              }`}
        </Text>
      </Box>

      <Box>
        <Text size="xs" weight="semibold" color="text-[var(--bellum-text-muted)]" className={RAIL_LABEL}>
          {t('notifications.title')}
        </Text>
        {props.notificationsLoading ? (
          <Text size="sm" color="text-[var(--bellum-text-secondary)]">
            {t('notifications.loading')}
          </Text>
        ) : props.notifications.length === 0 ? (
          <Text size="sm" color="text-[var(--bellum-text-secondary)]">
            {t('notifications.empty')}
          </Text>
        ) : (
          <Box className="flex flex-col gap-2">
            {props.notifications.map(item => (
              <Box key={item.id} className="rounded-card border border-[var(--bellum-border)] px-3 py-2.5">
                <Text size="sm" weight="medium">
                  {item.title}
                </Text>
                <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="line-clamp-2">
                  {item.body}
                </Text>
                <Box className="mt-1 flex items-center gap-1">
                  {item.link ? (
                    <Button size="sm" variant="ghost" onClick={() => props.onOpenNotification(item)}>
                      {t('notifications.open')}
                    </Button>
                  ) : null}
                  <button
                    type="button"
                    aria-label={t('notifications.markRead')}
                    title={t('notifications.markRead')}
                    onClick={() => props.onMarkRead(item.id)}
                    className="flex size-11 items-center justify-center rounded-control text-[var(--bellum-text-secondary)] transition-colors duration-immediate ease-bellum-out hover:bg-[var(--bellum-surface-2)]"
                  >
                    <Check className="size-4" />
                  </button>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <Box>
        <Text size="xs" weight="semibold" color="text-[var(--bellum-text-muted)]" className={RAIL_LABEL}>
          {t('starters.title')}
        </Text>
        {/* MAQ-LAURA E142 / `.choice` : des amorces pleine largeur, cadrées — elles se lisent comme des choix. */}
        <Box className="flex flex-col gap-2">
          {(['explainScreen', 'whatsNew', 'whereIs'] as const).map(key => (
            <button
              key={key}
              type="button"
              onClick={() => props.onStarter(t(`starters.${key}`))}
              className="flex min-h-11 w-full items-center rounded-control border border-[var(--bellum-border)] px-3 py-2 text-left transition-colors duration-immediate ease-bellum-out hover:border-[var(--bellum-border-strong)] hover:bg-[var(--bellum-surface-2)]"
            >
              <Text size="sm" color="text-[var(--bellum-text-primary)]">
                {t(`starters.${key}`)}
              </Text>
            </button>
          ))}
        </Box>
        {changes.length > 0 ? (
          <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-1">
            {t('product.changelog', { date: changes[0].date, title: changes[0].title })}
          </Text>
        ) : (
          <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-1">
            {t('answers.whatsNewEmpty')}
          </Text>
        )}
      </Box>
    </Box>
  )
}
