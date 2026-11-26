'use client'

import { Button, LauraFace } from '@bellum/ui'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { trackChat } from './lib/analytics'
import {
  applyOpenTiming,
  canFireNow,
  SCROLL_IDLE_MS,
  SCROLL_OPEN_DEPTH,
  shouldAutoOpen,
  type AutoOpenMessage,
  type Viewport,
} from './lib/auto-open'
import { MAX_TURNS_SENT, type ChatCta, type ChatErrorBody, type ChatResponseBody, type ChatTurn } from './lib/contract'
import { assignVariant, createVisitorId, FIRST_MESSAGE_VARIANTS, OPEN_TIMING_VARIANTS } from './lib/experiments'
import { MAX_MESSAGE_CHARS } from './lib/guardrails'
import { gapBefore, nextSilenceNudge, saysGoodbye } from './lib/multi-message'
import { PREFILL_FIELDS } from './lib/prefill'
import { PROACTIVE_DELAY_MS, proactiveTopicFor } from './lib/proactive'
import type { LeadState } from './lib/routing'
import { alreadySeen, openVisit, readVisit, rememberVisit, serializeVisit, VISIT_STORAGE_KEY } from './lib/visit-memory'

/**
 * Le widget de Laura — §4.3 et §4.4 du PDF 10 (ticket BEL-LAU-901).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI EST STRUCTUREL, ET NON DÉCORATIF
 * ─────────────────────────────────────────────────────────────────────────
 *  - **« Assistante IA » est écrit dans l'en-tête**, visible sans interaction et
 *    jamais masquée par l'avatar. Un visiteur qui découvre après coup qu'il
 *    parlait à une machine se sent trompé, et il a raison.
 *  - **Le lien de confidentialité est dans le widget** : c'est là qu'on demande
 *    une adresse e-mail.
 *  - **Le score de qualification n'existe pas ici.** Il vit côté serveur et n'en
 *    sort jamais ; le widget ne reçoit qu'un bouton à proposer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * OÙ VIVENT LES DÉCISIONS
 * ─────────────────────────────────────────────────────────────────────────
 * Nulle part ici. Quand s'ouvrir (`auto-open.ts`), quoi se rappeler
 * (`visit-memory.ts`), comment rythmer (`multi-message.ts`) sont des modules
 * PURS et testés — la configuration de test du site ne monte aucun composant
 * React, si bien qu'une règle écrite dans ce fichier serait une règle sans
 * filet. Le widget observe et exécute.
 *
 * Le fil de conversation vit dans cet état React et, sur trente jours, dans le
 * stockage local du visiteur (D47) — jamais côté serveur. Il n'y a donc rien à
 * conserver, à purger, ni à déclarer.
 */

type Message = ChatTurn & { id: number }
/** Ce que la conversation transmettrait à l'espace si le visiteur cliquait
 *  « créer mon compte » — chantier n°5, §11 P2. */
type Prefill = NonNullable<ChatResponseBody['prefill']>

const SESSION_KEY = 'bellum.chat.sid'
const SESSION_COUNTED_KEY = 'bellum.chat.counted'
/** Le tic d'horloge des relances de silence. Une seconde suffit : les seuils
 *  sont à 45 s et 3 min, et un intervalle plus court ne changerait rien qu'à la
 *  consommation de la page. */
const SILENCE_TICK_MS = 1_000

function readStorage(key: string): string | null {
  // Le stockage jette en navigation privée, dans un aperçu, et sur un navigateur
  // réglé pour bloquer les données de site. Un widget qui tombe là-dessus est un
  // widget absent sur des visiteurs parfaitement légitimes.
  try {
    return window.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage?.setItem(key, value)
  } catch {
    /* rien à faire, et rien à dire au visiteur : sa mémoire de visite n'est pas son problème */
  }
}

export function ChatWidget() {
  const t = useTranslations('chatbot')
  const locale = useLocale()
  const pathname = usePathname()

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [lead, setLead] = useState<LeadState>({})
  const [cta, setCta] = useState<ChatCta | null>(null)
  const [prefill, setPrefill] = useState<Prefill | null>(null)
  const [quickReplies, setQuickReplies] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<ChatErrorBody['error'] | null>(null)
  const [nudge, setNudge] = useState<string | null>(null)
  const [unread, setUnread] = useState(0)

  const sessionId = useRef<string>('')
  const scrollAnchor = useRef<HTMLDivElement>(null)
  const firstReplySeen = useRef(false)
  const converted = useRef(false)
  const dismissed = useRef(false)
  const autoOpened = useRef(false)
  const visitCount = useRef(1)
  const lastVisitorAt = useRef(0)
  const nudgesSent = useRef(0)
  const goodbye = useRef(false)
  const busy = useRef(false)
  /**
   * Les deux A/B du §11 (P1) — affectées une fois, à la mémoire de visite du
   * navigateur, et jamais recalculées : un visiteur qui verrait Laura s'ouvrir
   * à 8 s puis à 15 s compterait deux expositions pour une personne. Les refs
   * démarrent à la variante de RÉFÉRENCE (index 0) tant que la mémoire n'a pas
   * encore livré d'identifiant — c'est le même comportement que
   * `assignVariant('', ...)`.
   */
  const firstMessageVariant = useRef<(typeof FIRST_MESSAGE_VARIANTS)[number]>(FIRST_MESSAGE_VARIANTS[0])
  const openTimingVariant = useRef<(typeof OPEN_TIMING_VARIANTS)[number]>(OPEN_TIMING_VARIANTS[0])

  if (!sessionId.current && typeof window !== 'undefined') {
    const stored = window.sessionStorage?.getItem(SESSION_KEY)
    sessionId.current = stored ?? globalThis.crypto?.randomUUID?.() ?? String(Date.now())
    window.sessionStorage?.setItem(SESSION_KEY, sessionId.current)
  }

  /** La mémoire de visite, relue une fois — c'est elle qui décide entre
   *  « Qu'est-ce qui t'amène ? » et « Content de te revoir ». */
  useEffect(() => {
    const now = Date.now()
    let counted = false
    try {
      counted = window.sessionStorage?.getItem(SESSION_COUNTED_KEY) === '1'
      window.sessionStorage?.setItem(SESSION_COUNTED_KEY, '1')
    } catch {
      /* même raison que readStorage : on continue sans mémoire */
    }
    // Le candidat n'est utilisé QUE si la mémoire n'a pas encore d'identifiant
    // (`openVisit` garde celui qui existe déjà) — un visiteur de retour garde
    // donc sa variante, jamais un nouveau tirage à chaque visite.
    const visit = openVisit(readVisit(readStorage(VISIT_STORAGE_KEY), now), now, {
      alreadyCounted: counted,
      visitorId: createVisitorId(),
    })
    visitCount.current = visit.visitCount
    writeStorage(VISIT_STORAGE_KEY, serializeVisit(visit))

    const visitorId = visit.visitorId ?? ''
    firstMessageVariant.current = assignVariant('first_message', visitorId)
    openTimingVariant.current = assignVariant('open_timing', visitorId)

    trackChat('chat_widget_viewed', { openTimingVariant: openTimingVariant.current })
    if (visit.visitCount >= 2) trackChat('chat_returning_visitor')
  }, [])

  /** La variante « concrete » ne remplace QUE le message de bienvenue de la
   *  toute première ouverture — un retour ou une sortie d'intention gardent
   *  leur propre texte, non concerné par cet A/B. */
  const greetingFor = useCallback(
    (kind: AutoOpenMessage) =>
      kind === 'first' && firstMessageVariant.current === 'concrete'
        ? t('greeting.firstConcrete')
        : t(`greeting.${kind}`),
    [t],
  )

  const openWidget = useCallback(
    (kind: AutoOpenMessage = 'first', automatic = false) => {
      setNudge(null)
      setUnread(0)
      setOpen(previous => {
        if (!previous) {
          trackChat(automatic ? 'chat_auto_opened' : 'chat_opened', {
            firstMessageVariant: firstMessageVariant.current,
          })
        }
        return true
      })
      setMessages(previous => (previous.length ? previous : [{ id: 0, role: 'assistant', content: greetingFor(kind) }]))
    },
    [greetingFor],
  )

  /**
   * L'ouverture automatique — §4.4.
   *
   * Le plan vient du module pur ; ce bloc ne fait que l'attendre, et vérifier au
   * moment de tirer que la personne n'est ni en train de défiler, ni en train de
   * remplir un formulaire. Ces deux conditions REPORTENT : quelqu'un qui défile
   * finira par s'arrêter, et les traiter comme des refus reviendrait à ne jamais
   * s'ouvrir sur les visiteurs les plus actifs.
   */
  useEffect(() => {
    if (open || autoOpened.current || dismissed.current) return

    const viewport: Viewport = window.matchMedia?.('(max-width: 640px)').matches ? 'mobile' : 'desktop'
    const rawPlan = shouldAutoOpen({
      pathname: pathname ?? '/',
      visit: { autoOpened: autoOpened.current, dismissed: dismissed.current, visitCount: visitCount.current },
      viewport,
    })
    // L'A/B du moment d'ouverture (§11, P1) : ne remplace le délai QUE sur la
    // toute première ouverture en grand — `applyOpenTiming` laisse tout le
    // reste (bulle, retour, sortie d'intention, page silencieuse) inchangé.
    const plan = applyOpenTiming(rawPlan, openTimingVariant.current, viewport)
    if (!plan) return

    let scrollTimer = 0
    let scrolling = false
    // La variante « au défilement » attend le plancher de présence ET la
    // profondeur de lecture — les deux, pas l'un ou l'autre : un plancher posé
    // sans profondeur ouvrirait quand même au bout du délai.
    let floorElapsed = plan.trigger !== 'scroll'
    const depthReached = () => {
      const doc = document.documentElement
      const total = doc.scrollHeight - window.innerHeight
      const depth = total > 0 ? window.scrollY / total : 1
      return depth >= SCROLL_OPEN_DEPTH
    }
    const typing = () => {
      const active = document.activeElement
      if (!active) return false
      const tag = active.tagName
      // La zone de saisie de Laura ne compte pas : sinon elle ne s'ouvrirait
      // jamais chez quelqu'un qui vient d'y cliquer.
      if (active.closest('[data-laura-panel]')) return false
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (active as HTMLElement).isContentEditable
    }

    let retry = 0
    const fire = () => {
      if (autoOpened.current || dismissed.current) return
      if (!canFireNow({ scrolling, typing: typing() })) {
        retry = window.setTimeout(fire, SCROLL_IDLE_MS)
        return
      }
      autoOpened.current = true
      if (plan.open) openWidget(plan.message, true)
      else setNudge(t(`proactive.${proactiveTopicFor(pathname ?? '/') ?? 'home'}`))
    }

    const onScroll = () => {
      scrolling = true
      window.clearTimeout(scrollTimer)
      scrollTimer = window.setTimeout(() => {
        scrolling = false
      }, SCROLL_IDLE_MS)
      if (plan.trigger === 'scroll' && floorElapsed && depthReached()) fire()
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    // Le plancher : sur le déclencheur « temps », c'est lui qui tire. Sur le
    // déclencheur « défilement », il ne fait que lever le plancher — le
    // défilement lui-même tire, y compris s'il a déjà dépassé la profondeur
    // avant que le plancher n'expire (mobile).
    const floorTimer = window.setTimeout(() => {
      if (plan.trigger !== 'scroll') {
        fire()
        return
      }
      floorElapsed = true
      if (depthReached()) fire()
    }, plan.delayMs)

    return () => {
      window.clearTimeout(floorTimer)
      window.clearTimeout(retry)
      window.clearTimeout(scrollTimer)
      window.removeEventListener('scroll', onScroll)
    }
  }, [open, pathname, openWidget, t])

  /** La sortie d'intention — §4.4 règle n°5, desktop uniquement. */
  useEffect(() => {
    if (open || autoOpened.current || dismissed.current) return
    const onLeave = (event: MouseEvent) => {
      if (event.clientY > 8) return
      const plan = shouldAutoOpen({
        pathname: pathname ?? '/',
        visit: { autoOpened: autoOpened.current, dismissed: dismissed.current, visitCount: visitCount.current },
        viewport: 'desktop',
        exitIntent: true,
      })
      if (!plan?.open) return
      autoOpened.current = true
      openWidget('exit', true)
    }
    document.addEventListener('mouseout', onLeave)
    return () => document.removeEventListener('mouseout', onLeave)
  }, [open, pathname, openWidget])

  /** L'accroche discrète — elle survit pour les pages « bulle seulement ». */
  useEffect(() => {
    if (open || nudge || autoOpened.current) return
    const topic = proactiveTopicFor(pathname ?? '/')
    if (!topic) return
    const message = t(`proactive.${topic}`)
    // Règle n°7 : jamais deux fois la même accroche sur trente jours.
    if (alreadySeen(readVisit(readStorage(VISIT_STORAGE_KEY), Date.now()), message)) return
    const timer = window.setTimeout(() => {
      setNudge(message)
      const visit = readVisit(readStorage(VISIT_STORAGE_KEY), Date.now())
      if (visit) writeStorage(VISIT_STORAGE_KEY, serializeVisit(rememberVisit(visit, { message, topic })))
    }, PROACTIVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [open, nudge, pathname, t])

  useEffect(() => {
    scrollAnchor.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, pending])

  /** Une conversation entamée et abandonnée sans clic est une information : elle
   *  dit qu'on a répondu à côté. */
  useEffect(() => {
    const onLeave = () => {
      if (messages.some(message => message.role === 'user') && !converted.current) trackChat('chat_abandoned')
    }
    window.addEventListener('pagehide', onLeave)
    return () => window.removeEventListener('pagehide', onLeave)
  }, [messages])

  const pushBubbles = useCallback(async (bubbles: string[]) => {
    for (const [index, bubble] of bubbles.entries()) {
      if (index > 0) {
        setPending(true)
        await new Promise(resolve => window.setTimeout(resolve, gapBefore(bubble)))
      }
      setPending(false)
      setMessages(previous => [...previous, { id: Date.now() + index + 1, role: 'assistant', content: bubble }])
      setUnread(previous => previous + 1)
    }
  }, [])

  const send = useCallback(
    async (raw: string) => {
      const content = raw.trim()
      if (!content || busy.current) return
      busy.current = true

      setError(null)
      setDraft('')
      setQuickReplies([])
      if (saysGoodbye(content)) goodbye.current = true
      lastVisitorAt.current = Date.now()
      const history: Message[] = [...messages, { id: Date.now(), role: 'user', content }]
      setMessages(history)
      setPending(true)

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sessionId.current,
            locale,
            page: pathname ?? '/',
            lead,
            messages: history.slice(-MAX_TURNS_SENT).map(({ role, content: text }) => ({ role, content: text })),
          }),
        })

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as ChatErrorBody | null
          // Un refus se mesure comme le reste : c'est le serveur qui décide
          // qu'il y en a eu un, le navigateur qui le déclenche.
          for (const event of body?.events ?? []) trackChat(event)
          setError(body?.error ?? 'unavailable')
          setPending(false)
          return
        }

        const body = (await response.json()) as ChatResponseBody
        setLead(body.lead ?? {})
        setCta(body.cta)
        setPrefill(body.prefill ?? null)
        // Le serveur connaît une propriété que le navigateur ne peut pas
        // connaître (le THÈME d'une objection non couverte) — elle voyage
        // avec l'événement, jamais recalculée ici.
        for (const event of body.events ?? []) trackChat(event, body.eventProps?.[event])
        if (!firstReplySeen.current) {
          firstReplySeen.current = true
          // Le succès des DEUX A/B (§11) : premier message et moment d'ouverture
          // partagent la même mesure de succès, donc les deux propriétés.
          trackChat('chat_first_reply', {
            firstMessageVariant: firstMessageVariant.current,
            openTimingVariant: openTimingVariant.current,
          })
        }
        await pushBubbles(body.messages?.length ? body.messages : [body.reply])
        setQuickReplies(body.quickReplies ?? [])
        // Le silence commence quand Laura a fini de parler, pas quand le
        // visiteur a fini d'écrire.
        lastVisitorAt.current = Date.now()

        // D47 : la conversation se garde trente jours, chez le visiteur.
        const visit = readVisit(readStorage(VISIT_STORAGE_KEY), Date.now())
        if (visit) {
          writeStorage(
            VISIT_STORAGE_KEY,
            serializeVisit(
              rememberVisit(visit, {
                lead: body.lead,
                turns: [
                  ...history.map(({ role, content: text }) => ({ role, content: text })),
                  { role: 'assistant' as const, content: body.reply },
                ],
              }),
            ),
          )
        }
      } catch {
        setError('unavailable')
      } finally {
        setPending(false)
        busy.current = false
      }
    },
    [lead, locale, messages, pathname, pushBubbles],
  )

  /**
   * Les relances de silence — §4.11.
   *
   * Deux au maximum, jamais après un au revoir, jamais sur quelqu'un qui n'a
   * pas encore écrit. Elles sont produites côté navigateur et n'appellent aucun
   * modèle : relancer coûte un tour de conversation à quelqu'un qui n'a rien
   * demandé, et ce tour se paierait à chaque page ouverte et oubliée.
   */
  useEffect(() => {
    if (!open || !lastVisitorAt.current) return
    // ⚠️ Jamais pendant qu'on répond. Trouvé en recette live : la relance est
    // partie AVANT la réponse de Laura, parce que le compteur partait du
    // dernier message du VISITEUR et qu'un tour de conversation peut durer
    // plus de quarante-cinq secondes. Relancer quelqu'un pendant qu'on est
    // soi-même en train de lui répondre est la seule chose qui rende une
    // relance ridicule.
    //
    // Le silence se mesure donc à partir du moment où LAURA a fini de parler —
    // c'est ce que veut dire « si la personne ne répond plus depuis 45 s » —
    // et `lastVisitorAt` est ré-horodaté à l'arrivée de la réponse.
    if (pending) return
    const timer = window.setInterval(() => {
      const kind = nextSilenceNudge({
        silentForMs: Date.now() - lastVisitorAt.current,
        nudgesSent: nudgesSent.current,
        saidGoodbye: goodbye.current,
        hasSpoken: lastVisitorAt.current > 0,
      })
      if (!kind) return
      nudgesSent.current += 1
      setMessages(previous => [...previous, { id: Date.now(), role: 'assistant', content: t(`nudge.${kind}`) }])
    }, SILENCE_TICK_MS)
    return () => window.clearInterval(timer)
  }, [open, messages, pending, t])

  const onCtaClick = useCallback(() => {
    converted.current = true
    if (cta?.kind === 'demo') trackChat('demo_clicked')
    if (cta?.kind === 'calendly') trackChat('calendly_clicked')
  }, [cta])

  const closeWidget = useCallback(() => {
    // Fermée = fermée. Le §4.4 règle n°1 ne souffre aucune exception : on
    // n'insiste jamais deux fois.
    dismissed.current = true
    setOpen(false)
  }, [])

  const replyChips = useMemo(
    () => quickReplies.map(key => ({ key, label: t(`quickReplies.${key}`) })),
    [quickReplies, t],
  )

  /**
   * Le libellé des champs qui partiraient avec le visiteur — chantier n°5.
   *
   * Affiché AVANT le clic, jamais après : c'est ce qui rend « il le sait »
   * vrai plutôt que promis. Les noms de champs (pas leurs valeurs) suffisent à
   * la promesse structurelle — la liste blanche, elle, est déjà tenue par
   * `buildPrefill` côté serveur.
   */
  const carriedFieldLabels = useMemo(
    () => PREFILL_FIELDS.filter(field => prefill?.fields[field]).map(field => t(`prefill.fields.${field}`)),
    [prefill, t],
  )

  if (!open) {
    return (
      <div className="fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2">
        {nudge ? (
          <button
            type="button"
            onClick={() => openWidget('first')}
            className="flex max-w-sm items-start gap-2.5 rounded-2xl border border-white/10 bg-[#12142a]/95 px-4 py-3 text-left text-sm text-white/85 shadow-xl backdrop-blur transition hover:border-white/20"
          >
            {/* La bulle proactive est le SEUL endroit du widget où Laura parlait
                sans visage — un message qui arrive tout seul, sans qu'on sache
                de qui il vient. NOMMÉ pour la même raison qu'une bulle du fil :
                rien d'autre ici ne dit qui parle. */}
            <LauraFace size={28} name={t('header.name')} className="mt-0.5" />
            <span>{nudge}</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => openWidget('first')}
          aria-label={t('launcher.aria')}
          className="relative rounded-full shadow-xl outline-none transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          {/* Décoratif : le bouton porte déjà `aria-label` (« Ouvrir la
              discussion avec Laura, assistante IA »). Nommer l'avatar en plus
              ferait dire son nom deux fois de suite. */}
          <LauraFace size={56} decorative className="ring-2 ring-white/15" />
          {/* Le point de présence : il dit que quelqu'un est là, pas qu'une
              personne est là — la mention « Assistante IA » s'en charge à
              l'ouverture, et elle est lue avant le premier message. */}
          <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#0c0e1d] bg-emerald-400" />
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-600 px-1 text-xs font-semibold text-white">
              {unread}
            </span>
          ) : null}
        </button>
      </div>
    )
  }

  return (
    <section
      data-laura-panel
      aria-label={t('launcher.aria')}
      className="fixed inset-x-0 bottom-0 z-40 flex h-[100dvh] w-full flex-col overflow-hidden border border-white/10 bg-[#0c0e1d]/97 shadow-2xl backdrop-blur sm:inset-x-auto sm:bottom-4 sm:right-4 sm:h-[min(40rem,70dvh)] sm:w-[min(26.25rem,calc(100vw-2rem))] sm:rounded-2xl"
    >
      <header className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          {/* Décoratif : son nom est écrit juste à côté, en toutes lettres. */}
          <LauraFace size={40} decorative />
          <div>
            <p className="text-sm font-semibold leading-tight text-white">{t('header.name')}</p>
            {/* La mention n'est pas une note de bas de page : elle est lue avant
                le premier message, sans interaction, et l'avatar ne la masque
                jamais. */}
            <p className="text-xs leading-tight text-white/60">{t('header.role')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={closeWidget}
          aria-label={t('header.close')}
          className="rounded-full px-2 py-1 text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.map(message =>
          message.role === 'user' ? (
            <div
              key={message.id}
              className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl bg-violet-600/25 px-3 py-2 text-sm text-white"
            >
              {message.content}
            </div>
          ) : (
            <div key={message.id} className="flex max-w-[92%] items-end gap-2">
              {/* NOMMÉ : dans le fil, rien d'autre n'attribue le message. Sans
                  ce nom, un lecteur d'écran lit une réponse sans savoir de qui
                  elle vient — l'alignement et la couleur ne s'entendent pas. */}
              <LauraFace size={28} name={t('header.name')} />
              <div className="whitespace-pre-wrap rounded-2xl bg-white/5 px-3 py-2 text-sm text-white/85">
                {message.content}
              </div>
            </div>
          ),
        )}

        {pending ? (
          <div className="flex items-end gap-2" role="status" aria-label={t('typing')}>
            {/* Décoratif : le `role="status"` du parent annonce déjà « Laura
                écrit ». Le visage ne dit pas une deuxième fois qui écrit. */}
            <LauraFace size={28} decorative />
            <span className="flex items-center gap-1 rounded-2xl bg-white/5 px-3 py-3">
              {[0, 1, 2].map(dot => (
                <span
                  key={dot}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/50"
                  style={{ animationDelay: `${dot * 150}ms` }}
                />
              ))}
            </span>
          </div>
        ) : null}

        {error ? (
          <p
            role="status"
            className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100"
          >
            {t(`errors.${error}`)}
          </p>
        ) : null}

        {!pending && replyChips.length ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {replyChips.map(chip => (
              <button
                key={chip.key}
                type="button"
                onClick={() => void send(chip.label)}
                className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/75 transition hover:border-white/30 hover:text-white"
              >
                {chip.label}
              </button>
            ))}
          </div>
        ) : null}

        {cta?.kind === 'signup' && carriedFieldLabels.length ? (
          <p role="note" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60">
            {t('prefill.carries', { fields: carriedFieldLabels.join(', ') })}
            <br />
            {t('prefill.withheld')}
          </p>
        ) : null}

        {cta?.url ? (
          <a
            href={cta.url}
            target="_blank"
            rel="noreferrer"
            onClick={onCtaClick}
            className="inline-flex rounded-full bg-violet-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-violet-500"
          >
            {t(`cta.${cta.kind}`)}
          </a>
        ) : null}

        <div ref={scrollAnchor} />
      </div>

      <form
        className="border-t border-white/10 px-3 py-2"
        onSubmit={event => {
          event.preventDefault()
          void send(draft)
        }}
      >
        <div className="flex items-end gap-2">
          {/* Décoratif, et à 60 % : c'est l'état « elle attend que tu écrives ».
              L'opacité est posée par le CONSOMMATEUR — le visage, lui, ne
              change jamais d'un état à l'autre (voir le docblock de
              `LauraFace`). La zone de saisie porte déjà son propre libellé. */}
          <LauraFace size={28} decorative className="mb-1 opacity-60" />
          <textarea
            value={draft}
            onChange={event => setDraft(event.target.value.slice(0, MAX_MESSAGE_CHARS))}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void send(draft)
              }
            }}
            rows={2}
            placeholder={t('input.placeholder')}
            aria-label={t('input.placeholder')}
            className="min-h-[2.5rem] flex-1 resize-none rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-violet-400/60 focus:outline-none"
          />
          <Button type="submit" variant="violet" disabled={pending || !draft.trim()} className="rounded-full px-4">
            {t('input.send')}
          </Button>
        </div>
        <p className="mt-2 text-xs leading-snug text-white/45">
          {t('disclosure')}{' '}
          <a href={`/${locale === 'fr' ? '' : `${locale}/`}privacy`} className="underline hover:text-white/70">
            {t('privacy')}
          </a>
        </p>
      </form>
    </section>
  )
}
