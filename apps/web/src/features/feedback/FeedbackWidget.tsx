import { FEEDBACK_MESSAGE_MAX, FEEDBACK_MESSAGE_WARN_AT } from '@bellum/contracts'
import { useCallback, useEffect, useRef, useState } from 'react'
import { guideAnchorProps } from '@/features/guide/guide-anchors'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Text,
  cn,
  useAnySheetOpen,
} from '@bellum/ui'
import { Link, useRouterState } from '@tanstack/react-router'
import { Bug, Check, Crosshair, Lightbulb, MessageSquarePlus, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  overlayBodyClassName,
  overlayDescriptionClassName,
  overlayDialogClassName,
  overlayFootClassName,
  overlayHeadClassName,
  overlayTitleClassName,
} from '@/components/layout/overlay'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { useHideOnScroll } from '@/features/mobile/useHideOnScroll'
import { useIsMobile } from '@/features/mobile/useIsMobile'
import { useSession } from '@/lib/hooks/use-session'
import { feedbackApi, type FeedbackCategory } from './api'
import { isFeedbackWidgetHiddenOnMobilePath } from './feedback-widget-visibility'
import { AttachmentsField, type AttachmentEntry } from './AttachmentsField'
import { filesFromDataTransfer, readFileAsAttachment, rejectAttachment, type AttachmentRejection } from './attachments'
import { ElementPicker } from './ElementPicker'
import { buildElementContext, type ElementContext } from './elementContext'
import { nextPaint } from './nextPaint'
import { collectReportContext, type ReportContext } from './reportContext'
import { onReportRequest } from './reportLink'
import { ReportPreview } from './ReportPreview'
import { captureViewport } from './screenshot'

// Les `value` sont persistées côté API — seuls les libellés sont traduits (clés categories.*).
const CATEGORIES: { value: FeedbackCategory; icon: typeof Bug }[] = [
  { value: 'bug', icon: Bug },
  { value: 'metier', icon: Lightbulb },
  { value: 'autre', icon: MessageSquarePlus },
]

/**
 * `demo` — #1960.10 : en salle de démonstration, le widget n'envoie rien et le
 * dit. Ni viseur, ni capture, ni formulaire : l'API refuse de toute façon
 * (`feedback.controller.ts`), et proposer un envoi voué au refus ferait écrire
 * un message pour rien.
 */
type Phase = 'idle' | 'picking' | 'capturing' | 'form' | 'done' | 'demo'

/**
 * Global bug reporter, mounted once for the whole app. The user points at the
 * broken element; we grab its source location, a screenshot, the console and
 * the recent runtime errors, and the API turns that into a ticket.
 *
 * #1960 — Laura l'ouvre aussi, pré-rempli, quand quelqu'un décrit un problème
 * dans la conversation (`reportLink.ts`). Dans les deux cas, tout ce qui part
 * est MONTRÉ avant l'envoi, et rien ne part sans le clic d'envoi.
 */
export function FeedbackWidget() {
  const { t } = useTranslation('feedback')
  const { user } = useSession()
  // #1960.10 — `false` tant que la charge crédits est en vol : une surface réelle
  // ne bascule jamais en démo par défaut (voir `useIsDemo`).
  const isDemo = useIsDemo()
  const [phase, setPhase] = useState<Phase>('idle')
  const isMobile = useIsMobile()
  // Sur un écran étroit, aucun coin n'est libre : le contenu occupe toute la
  // largeur. Le bouton s'efface donc pendant qu'on descend et revient dès qu'on
  // remonte — on ne le perd jamais, et il n'est jamais devant ce qu'on lit.
  const scrolledAway = useHideOnScroll()
  /**
   * #3050 (26/09/2026, iPhone prod) — sur /chat MOBILE, la saisie de Laura est
   * PLEINE LARGEUR (plus de gouttière `ml-14` réservée à ce bouton, voir
   * `chat-surface.ts`) : le bouton, ancré bas-droite comme la saisie,
   * recouvrait « Envoyer ».
   *
   * #3775.5b (07/10/2026) — la même collision existe en BUREAU : le jeton
   * `CHAT_SURFACE.composerFeedbackGutter` reste vide (`chat-surface.ts`), donc
   * ce bouton partage toujours le coin bas-droite avec « Envoyer », à toutes
   * les largeurs. Masqué sur /chat entièrement (pas ailleurs — les autres
   * écrans gardent le bouton), il reste accessible depuis le menu « + » du
   * composer (`ComposerToolsMenu`, `requestReport`) ou l'en-tête du fil.
   */
  const pathname = useRouterState({ select: state => state.location.pathname })
  const hiddenOnChat = isFeedbackWidgetHiddenOnMobilePath(pathname)
  // Un tiroir ancré à droite (`side="right"`) pose son action primaire dans le
  // MÊME coin bas-droite que ce bouton — mesuré sur « Plus de filtres » du
  // vivier le 30/08/2026, le bouton « Appliquer » était recouvert par le
  // widget. Monter le z-index du tiroir casserait sa raison d'être (rester
  // au-dessus du contenu ordinaire) ; le widget s'efface donc pendant qu'un
  // tiroir occupe ce coin — comme il le fait déjà pour SON PROPRE dialogue
  // (`phase !== 'idle'` plus bas). `useAnySheetOpen` protège tout tiroir
  // présent ET futur sans qu'aucun panneau n'ait à y penser. GA-205.
  const anySheetOpen = useAnySheetOpen()
  const [category, setCategory] = useState<FeedbackCategory>('bug')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [element, setElement] = useState<ElementContext | null>(null)
  const [screenshot, setScreenshot] = useState<string | null>(null)
  // #1792 — pièces jointes choisies par la personne (collées ou
  // sélectionnées), en plus de la capture automatique ci-dessus.
  const [attachments, setAttachments] = useState<AttachmentEntry[]>([])
  const [attachmentError, setAttachmentError] = useState<AttachmentRejection | null>(null)
  // #1960.7 / .8 — l'instantané du contexte : pris à l'ouverture du formulaire,
  // montré par l'aperçu, et envoyé TEL QUEL. Relire les tampons au clic
  // enverrait autre chose que ce qui a été montré.
  const [report, setReport] = useState<ReportContext | null>(null)
  /**
   * #1960.12 — la RÉFÉRENCE du signalement (le numéro du ticket), `null` quand
   * aucun n'a été ouvert. Plus de lien : il menait vers un dépôt privé qu'un
   * client ne peut pas ouvrir, sous le nom d'un outil tiers. Le suivi se fait
   * dans l'application, sur Réglages › Mes signalements (#1960.10).
   */
  const [reference, setReference] = useState<number | null>(null)

  // La phase courante, lue par l'écouteur d'ouverture sans le réabonner à
  // chaque changement de phase.
  const phaseRef = useRef<Phase>(phase)
  phaseRef.current = phase

  const reset = useCallback((prefill: string) => {
    setCategory('bug')
    setMessage(prefill)
    setSending(false)
    setElement(null)
    setScreenshot(null)
    setAttachments([])
    setAttachmentError(null)
    setReport(null)
    setReference(null)
  }, [])

  const start = useCallback(() => {
    reset('')
    setPhase(isDemo ? 'demo' : 'picking')
  }, [reset, isDemo])

  /**
   * #1792 — AJOUTE un lot de fichiers (sélection multiple ou collage), en
   * s'arrêtant au PREMIER refus : on ne devine pas lesquels des suivants
   * auraient passé après lui, et le motif affiché reste celui qui compte.
   * Chaque fichier voit les tailles des pièces DÉJÀ acceptées — y compris
   * celles du même lot — pour que le plafond total juge correctement.
   */
  const addAttachments = useCallback(
    async (files: File[]) => {
      if (!files.length) return
      setAttachmentError(null)
      let sizes = attachments.map(entry => entry.size)
      const accepted: AttachmentEntry[] = []
      for (const file of files) {
        const rejection = rejectAttachment(file, sizes)
        if (rejection) {
          setAttachmentError(rejection)
          break
        }
        const attachment = await readFileAsAttachment(file)
        accepted.push({ attachment, size: file.size })
        sizes = [...sizes, file.size]
      }
      if (accepted.length) setAttachments(current => [...current, ...accepted])
    },
    [attachments],
  )

  const removeAttachment = useCallback((index: number) => {
    setAttachments(current => current.filter((_, i) => i !== index))
    setAttachmentError(null)
  }, [])

  const onPasteAttachment = useCallback(
    (event: React.ClipboardEvent) => {
      const files = filesFromDataTransfer(event.clipboardData)
      if (!files.length) return
      // Ne bloque JAMAIS un collage de texte ordinaire dans le message — on
      // n'intercepte que quand le presse-papiers porte réellement un fichier.
      event.preventDefault()
      void addAttachments(files)
    },
    [addAttachments],
  )

  // #1792 — GESTE 2 : glisser-déposer sur le panneau. Le compteur (plutôt
  // qu'un simple booléen) évite le clignotement classique du surlignage : un
  // survol qui passe d'un enfant à un autre déclenche un `dragleave` PUIS un
  // `dragenter`, et sans compteur le surlignage retomberait entre les deux.
  const dragDepthRef = useRef(0)
  const [isDraggingOver, setIsDraggingOver] = useState(false)

  const onDragEnterAttachment = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    dragDepthRef.current += 1
    setIsDraggingOver(true)
  }, [])

  // Sans ce `preventDefault`, le navigateur refuse le dépôt et ouvre le
  // fichier dans un nouvel onglet à la place — `onDrop` ne serait jamais
  // atteint.
  const onDragOverAttachment = useCallback((event: React.DragEvent) => {
    event.preventDefault()
  }, [])

  const onDragLeaveAttachment = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setIsDraggingOver(false)
  }, [])

  /**
   * #1792 — MÊME CHEMIN que le collage et le sélecteur : `filesFromDataTransfer`
   * puis `addAttachments`. Un fichier glissé hors liste blanche ou trop lourd
   * est refusé avec le MÊME motif que s'il avait été collé ou choisi — la
   * validation vit dans `addAttachments`/`rejectAttachment`, jamais ici.
   */
  const onDropAttachment = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      dragDepthRef.current = 0
      setIsDraggingOver(false)
      const files = filesFromDataTransfer(event.dataTransfer)
      if (files.length) void addAttachments(files)
    },
    [addAttachments],
  )

  // La capture a lieu après le démontage du viseur, sinon l'overlay finit dans
  // l'image.
  //
  // ⚠️ L'attente est BORNÉE. `requestAnimationFrame` ne tire jamais dans un
  // onglet caché : changer d'onglet entre le clic et la capture laissait le
  // widget sur « Capture en cours… » pour toujours, sans erreur ni trace.
  // Mesuré le 05/09/2026 sur le portage back-office, corrigé des deux côtés.
  const capture = useCallback(async (context: ElementContext | null, rect: DOMRect | null) => {
    setElement(context)
    // #1960.8 — l'instantané AVANT la capture : les messages que la capture
    // elle-même écrit dans la console ne décrivent pas le problème signalé.
    setReport(collectReportContext())
    setPhase('capturing')
    await nextPaint()
    setScreenshot(await captureViewport(rect))
    setPhase('form')
  }, [])

  const onPick = useCallback(
    (picked: Element, rect: DOMRect) => {
      void capture(buildElementContext(picked), rect)
    },
    [capture],
  )

  const onSkip = useCallback(() => {
    void capture(null, null)
  }, [capture])

  // #1960.4 — Laura ouvre le signalement, pré-rempli. Directement au
  // formulaire, sans viseur : le problème est décrit dans la conversation, pas
  // pointé à l'écran. Une demande qui arrive pendant qu'un signalement est déjà
  // ouvert est ignorée — elle écraserait ce que la personne a commencé à écrire.
  const signedIn = Boolean(user)
  useEffect(
    () =>
      onReportRequest(request => {
        if (!signedIn || phaseRef.current !== 'idle') return
        reset(request.message)
        // #1960.10 — le lien de Laura ouvre le MÊME message que le bouton en
        // démonstration : aucune capture, aucun formulaire.
        if (isDemo) {
          setPhase('demo')
          return
        }
        void capture(null, null)
      }),
    [capture, reset, signedIn, isDemo],
  )

  const submit = async () => {
    if (!message.trim() || sending) return
    setSending(true)
    // Ce qui a été montré ; relu seulement si l'aperçu n'a jamais été pris.
    const context = report ?? collectReportContext()
    try {
      const created = await feedbackApi.create({
        category,
        message: message.trim(),
        userEmail: user?.email ?? null,
        pageUrl: context.pageUrl,
        userAgent: context.userAgent,
        consoleLogs: context.consoleLogs,
        errorLogs: context.errorLogs,
        elementContext: element,
        screenshot,
        // #1792 — pièces choisies par la personne, en plus de la capture
        // automatique ci-dessus.
        attachments: attachments.map(entry => entry.attachment),
        // Ce que la capture ne montre pas : les appels qui ont échoué (avec leur
        // identifiant de corrélation, la clé des logs serveur), les gestes qui
        // ont mené là, et la version exacte du code affiché.
        networkFailures: context.networkFailures,
        breadcrumbs: context.breadcrumbs,
        appContext: context.appContext,
      })
      setReference(created.github_issue_number ?? null)
      setPhase('done')
    } catch (error) {
      console.error('[Feedback]', error)
      setSending(false)
    }
  }

  // Only offer feedback to signed-in users (the endpoint is JWT-guarded).
  if (!user) return null

  return (
    <>
      <button
        type="button"
        data-bellum-capture-ignore=""
        // #2212.16 — l'ancrage que le guide peut DÉSIGNER. Un attribut de
        // donnée : il ne change ni le style, ni l'accessibilité, ni le
        // comportement du bouton. Le guide ne localise jamais par sélecteur CSS
        // (#1787) — il lit cet ancrage, déclaré ici et catalogué dans
        // `features/guide/guide-anchors.ts`.
        {...guideAnchorProps('retour.bouton-declencheur')}
        onClick={start}
        // #2487 — deux mécanismes Radix indépendants, tous deux invisibles
        // au z-index (le voile d'une modale les partage déjà à 60 < 80) :
        // (1) une modale MODALE pose `pointer-events: none` sur `<body>`, ce
        // bouton en hérite comme tout le reste hors de son contenu —
        // `pointer-events-auto` l'excepte explicitement, exactement comme
        // `ElementPicker` le fait déjà pour sa barre d'indices ;
        // (2) le `DismissableLayer` de CETTE modale traite un `pointerdown`
        // ici comme EXTÉRIEUR à son contenu et la referme avant que le
        // widget n'ait eu le temps de s'ouvrir. `stopPropagation` l'empêche
        // d'atteindre le `document` où Radix écoute — sans toucher au clic
        // React lui-même (`onClick`, un événement séparé, plus tardif).
        onPointerDown={event => event.stopPropagation()}
        aria-label={t('trigger.ariaLabel')}
        title={t('trigger.ariaLabel')}
        className={cn(
          // #2117.84 — recette iPhone du 25/09 : le coin bas-GAUCHE (choisi
          // pour fuir un chevauchement à DROITE, #1417 — voir l'historique
          // git) recouvre en fait la rangée d'icônes du hero, des lignes de
          // liste et le premier libellé de « Laura garde en tête » : du
          // contenu qui commence, lui, presque toujours à GAUCHE. Il revient
          // donc à DROITE, aligné avec le bureau — le seul coin qu'aucun
          // contenu n'occupe en PERMANENCE au même écran.
          'pointer-events-auto fixed bottom-[calc(1rem+var(--bellum-mobile-nav-height,0px))] right-4 z-widget',
          'flex items-center justify-center rounded-full',
          // #2117.84 — plus PETIT sous 768px (40px plutôt que 44) : moins de
          // surface couverte sur un écran où l'espace manque déjà. `useIsMobile`
          // et non `pointer-coarse` : la taille ne doit changer qu'avec la
          // LARGEUR, jamais avec le type de pointeur (un bureau à écran tactile
          // garde sa taille de bureau).
          isMobile ? 'h-10 w-10' : 'h-11 w-11',
          'border border-[var(--bellum-border)] bg-card text-[var(--bellum-text-accent)] shadow-overlay',
          'transition-colors duration-immediate ease-bellum-out hover:bg-[var(--bellum-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]',
          // Un fondu plutôt qu'un `hidden` : il reste focalisable au clavier et
          // ne saute pas hors du flux de tabulation en cours de défilement.
          isMobile && scrolledAway && 'pointer-events-none opacity-0',
          // Le tiroir gagne le coin pendant qu'il est ouvert — le sien
          // (`phase !== 'idle'`) ou n'importe quel autre `Sheet` de l'app.
          (phase !== 'idle' || anySheetOpen) && 'hidden',
          // #3050 / #3775.5b — /chat, à toutes les largeurs : voir `hiddenOnChat` ci-dessus.
          hiddenOnChat && 'hidden',
        )}
      >
        <Bug className={isMobile ? 'size-4' : 'size-5'} />
      </button>

      {phase === 'picking' && <ElementPicker onPick={onPick} onSkip={onSkip} onCancel={() => setPhase('idle')} />}

      {phase === 'capturing' && (
        <div
          data-bellum-capture-ignore=""
          // #1788 — `z-widget` (80) : c'est le rôle nommé du widget de
          // signalement. `z-[9999]` était l'interdit littéral du dépôt (trois
          // nombres choisis pour « passer au-dessus de tout », comparés entre
          // eux par hasard — voir tailwind.config.ts).
          className="fixed inset-x-0 top-4 z-widget flex justify-center"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 rounded-full border border-[var(--bellum-border)] bg-card px-4 py-2 text-sm shadow-overlay">
            <Crosshair className="size-4 animate-pulse text-[var(--bellum-text-accent)]" />
            {t('picker.capturing')}
          </div>
        </div>
      )}

      <Dialog
        open={phase === 'form' || phase === 'done' || phase === 'demo'}
        onOpenChange={open => {
          if (!open) setPhase('idle')
        }}
      >
        {/* #1960.7 — l'aperçu allonge le formulaire : le dialogue DÉFILE dans la
            hauteur de l'écran (`dvh`, jamais `vh`), et c'est le seul conteneur
            qui défile. Sans borne, une boîte `fixed` centrée plus haute que
            l'écran perd son haut et son bas, bouton d'envoi compris. */}
        <DialogContent
          closeLabel={t('common:actions.close')}
          data-bellum-capture-ignore=""
          // #2212.36 — la cible de SECOURS du même ancrage. Quand ce panneau est
          // ouvert, le bouton déclencheur n'est plus à l'écran : désigner le
          // bouton échouerait pour une raison qui n'a rien d'une panne.
          {...guideAnchorProps('retour.panneau')}
          // Théo `dialog` : tête à filet, un SEUL corps qui défile, pied collant (le geste d'envoi reste visible).
          className={cn('flex max-h-[90dvh] flex-col', overlayDialogClassName)}
        >
          <div className={cn(overlayHeadClassName, 'flex-col items-start gap-1')}>
            <DialogTitle className={overlayTitleClassName}>{t('dialog.title')}</DialogTitle>
            <DialogDescription className={overlayDescriptionClassName}>
              {phase === 'demo' ? t('demo.message') : t('dialog.description')}
            </DialogDescription>
          </div>

          {phase === 'demo' ? (
            // #1960.10 — rien à envoyer, rien vers quoi mener : le message dit
            // ce que fait le bouton dans un espace réel, et se referme.
            <div className={overlayFootClassName}>
              <Button variant="outline" size="sm" className="pointer-coarse:min-h-11" onClick={() => setPhase('idle')}>
                {t('common:actions.close')}
              </Button>
            </div>
          ) : phase === 'done' ? (
            <Box className={cn(overlayBodyClassName, 'flex flex-col items-center gap-2 py-8 text-center')}>
              <span className="flex size-10 items-center justify-center rounded-full bg-[var(--success-soft-bg)] text-[var(--success-soft-text)]">
                <Check className="size-5" />
              </span>
              <Text weight="semibold">{t('done.title')}</Text>
              {/* Dire ce qui s'est VRAIMENT passé : annoncer une référence quand
                  il n'y en a pas laisse croire un bug remonté alors qu'il dort en
                  base, et personne ne revient dessus. */}
              <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                {reference != null
                  ? t('done.subtitleWithReference', { number: reference })
                  : t('done.subtitleStoredOnly')}
              </Text>
              <Box display="flex" className="mt-2 flex-wrap justify-center gap-2">
                {/* #1960.10 — la référence a enfin un endroit où se suivre. Un
                    lien INTERNE, et le seul du dialogue : rien ne mène vers
                    l'outil où vit le ticket. Le clic referme le dialogue, sinon
                    il resterait posé sur la page d'arrivée. */}
                <Button asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
                  <Link to="/settings/mes-signalements" onClick={() => setPhase('idle')}>
                    {t('done.follow')}
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="pointer-coarse:min-h-11"
                  onClick={() => setPhase('idle')}
                >
                  {t('common:actions.close')}
                </Button>
              </Box>
            </Box>
          ) : (
            // #1792 — les trois gestes sont écoutés sur TOUT le panneau, pas
            // seulement sur le champ des pièces jointes : le collage
            // (Ctrl/Cmd+V, un collage de texte ordinaire n'est jamais
            // intercepté — voir `onPasteAttachment`) et le glisser-déposer
            // (`onDrop…`) rejoignent le même `addAttachments` que le
            // sélecteur de `AttachmentsField`.
            <>
              <div
                className={cn(
                  overlayBodyClassName,
                  'space-y-4 transition-colors',
                  isDraggingOver && 'outline-2 -outline-offset-8 outline-dashed outline-[var(--bellum-text-accent)]',
                )}
                onPaste={onPasteAttachment}
                onDragEnter={onDragEnterAttachment}
                onDragOver={onDragOverAttachment}
                onDragLeave={onDragLeaveAttachment}
                onDrop={onDropAttachment}
              >
                {isDraggingOver && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="rounded-card border border-dashed border-[var(--accent-soft-border)] bg-[var(--bellum-surface-2)] px-3 py-2 text-center text-xs text-[var(--bellum-text-secondary)]"
                  >
                    {t('attachments.dropHint')}
                  </div>
                )}

                <div className="flex gap-2">
                  {CATEGORIES.map(({ value, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setCategory(value)}
                      className={cn(
                        'flex flex-1 items-center justify-center gap-2 rounded-control border px-3 py-2 text-sm font-medium transition-colors duration-immediate ease-bellum-out pointer-coarse:min-h-11',
                        category === value
                          ? 'border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)]'
                          : 'border-[var(--bellum-border)] text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)]',
                      )}
                    >
                      <Icon className="size-4" />
                      {/* i18n keys: categories.bug | categories.metier | categories.autre */}
                      {t(`categories.${value}`)}
                    </button>
                  ))}
                </div>

                {/* La borne vient du CONTRAT, pas d'un nombre recopié : l'API
                  refusait au-delà et le widget l'ignorait, si bien qu'un long
                  retour partait, se faisait refuser en 400 brut, et le texte
                  était perdu. Mesuré le 02/09 : le plus long des 21 retours
                  ouverts faisait 4 827 caractères — 96 % du plafond. */}
                <textarea
                  value={message}
                  onChange={event => setMessage(event.target.value.slice(0, FEEDBACK_MESSAGE_MAX))}
                  maxLength={FEEDBACK_MESSAGE_MAX}
                  placeholder={t('form.placeholder')}
                  rows={5}
                  autoFocus
                  className="w-full resize-none rounded-control border border-[var(--bellum-border-strong)] bg-[var(--bellum-bg)] px-3 py-2 text-sm text-[var(--bellum-text-primary)] outline-none placeholder:text-[var(--bellum-text-muted)] focus-visible:border-[var(--bellum-text-accent)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]"
                />

                <AttachmentsField
                  entries={attachments}
                  error={attachmentError}
                  onSelectFiles={files => void addAttachments(files)}
                  onRemove={removeAttachment}
                />

                {/* #1960.7 — tout ce qui accompagne le message, lisible AVANT le
                  clic d'envoi : la capture (retirable), l'élément pointé, la
                  page, l'adresse, les appels en échec, les gestes, la console,
                  les erreurs et le navigateur. */}
                {report ? (
                  <ReportPreview report={report} email={user.email ?? null}>
                    <ContextSummary
                      element={element}
                      screenshot={screenshot}
                      onRemoveScreenshot={() => setScreenshot(null)}
                    />
                  </ReportPreview>
                ) : null}
              </div>
              <div className={cn(overlayFootClassName, 'justify-between')}>
                {/* Le compteur n'apparaît que dans le dernier cinquième : en
                    permanence il serait du bruit, jamais il ne préviendrait de
                    rien. `aria-live` pour qu'il s'ENTENDE aussi. */}
                {message.length >= FEEDBACK_MESSAGE_WARN_AT ? (
                  <span aria-live="polite" className="text-xs text-[var(--bellum-text-muted)]">
                    {t('form.remaining', { count: FEEDBACK_MESSAGE_MAX - message.length })}
                  </span>
                ) : (
                  <span />
                )}
                <Button
                  variant="default"
                  size="sm"
                  icon={Send}
                  disabled={!message.trim()}
                  isLoading={sending}
                  onClick={submit}
                >
                  {t('form.submit')}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Confirms what is attached, in plain language. The element's technical
 * identity — selector, tag, classes, `data-bellum-src` line, component stack —
 * is deliberately not shown: it is reporting plumbing, not something the
 * reporter needs to read. It still travels in full inside `elementContext` and
 * lands in the ticket body.
 *
 * #1960.8 — la capture se RETIRE : elle montre l'écran tel qu'il était, donc
 * potentiellement une conversation ou la fiche d'un tiers. La voir sans pouvoir
 * l'écarter n'est pas un choix.
 */
function ContextSummary({
  element,
  screenshot,
  onRemoveScreenshot,
}: {
  element: ElementContext | null
  screenshot: string | null
  onRemoveScreenshot: () => void
}) {
  const { t } = useTranslation('feedback')
  if (!element && !screenshot) return null

  return (
    <div className="flex gap-3 rounded-card border border-[var(--bellum-border)] bg-card p-2">
      {screenshot && (
        <img
          src={screenshot}
          alt={t('context.screenshotAlt')}
          className="h-16 w-24 shrink-0 rounded border border-[var(--bellum-border)] object-cover"
        />
      )}
      <div className="min-w-0 flex-1 self-center space-y-0.5 text-xs text-[var(--bellum-text-secondary)]">
        {element ? (
          <>
            <p className="text-[var(--bellum-text-primary)]">{t('context.elementAttached')}</p>
            {element.text && <p className="truncate">{t('context.elementNamed', { element: element.text })}</p>}
          </>
        ) : (
          <p>{t('context.noElement')}</p>
        )}
        {screenshot ? (
          <Button variant="outline" size="sm" onClick={onRemoveScreenshot}>
            {t('context.removeScreenshot')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
