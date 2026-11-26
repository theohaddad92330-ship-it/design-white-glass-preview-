'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ElementPicker } from './element-picker'
import { captureAppContext } from '@/lib/capture/app-context'
import { getRecentBreadcrumbs, installBreadcrumbs } from '@/lib/capture/breadcrumbs'
import { getRecentConsole, installConsoleBuffer } from '@/lib/capture/console-buffer'
import { getRecentErrors, installErrorBuffer } from '@/lib/capture/error-buffer'
import { getRecentNetworkFailures } from '@/lib/capture/network-buffer'
import { buildElementContext, type ElementContext } from '@/lib/capture/element-context'
import { nextPaint } from '@/lib/capture/next-paint'
import { captureViewport } from '@/lib/capture/screenshot'

/**
 * SIGNALER UN DÉFAUT DEPUIS LE BACK-OFFICE — le même geste que dans l'app.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * L'opérateur qui voit un défaut ici n'avait aucun moyen de le remonter sans
 * quitter l'écran : il devait rouvrir l'application cliente, refaire le geste
 * ailleurs, et le contexte se perdait en route.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PARCOURS, IDENTIQUE À CELUI DE L'APPLICATION
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **viser** — on pointe ce qui est cassé, l'overlay avale le clic ;
 *  2. **capturer** — capture d'écran de la fenêtre, la zone pointée ENTOURÉE ;
 *  3. **écrire** — trois catégories, un message ;
 *  4. **envoyer** — l'issue GitHub est ouverte, son numéro revient à l'écran.
 *
 * ⚠️ La capture a lieu APRÈS que le viseur a quitté le DOM, sinon l'overlay se
 * retrouve dans l'image. Le double `requestAnimationFrame` attend ce repaint —
 * c'est la même précaution que dans l'application, et elle a été apprise là-bas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI PART AVEC, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * La console récente, les erreurs d'exécution, les appels HTTP en échec AVEC
 * leur `x-correlation-id` (la clé qui ouvre les logs serveur de cette
 * requête-là), le fil des derniers gestes, l'élément pointé avec son sélecteur
 * et son markup, et l'état de la console : version déployée, environnement,
 * route, thème RÉELLEMENT rendu, langue, fuseau, en ligne ou non, taille de
 * fenêtre.
 *
 * ⚠️ Les tampons s'installent **au montage**, pas à l'ouverture du panneau :
 * une erreur se produit avant qu'on décide de la signaler, jamais après.
 *
 * ⚠️ Ce qui MANQUERA toujours ici : `data-bellum-src`. L'application cliente
 * estampille chaque nœud au build (greffon Vite) ; le back-office n'a pas cet
 * équivalent, donc `sourceFile` reste `null`. La pile de composants React,
 * elle, est lue depuis les fibres du DOM et fonctionne — et les `grepTokens`
 * donnent de quoi retrouver le code à la main. On envoie ce qu'on a, on
 * n'invente pas le reste.
 *
 * ⚠️ Le nom de l'opérateur n'est **pas** un champ de ce formulaire : il est relu
 * de l'en-tête Basic Auth côté serveur (`/api/feedback` → `actorFromRequest`).
 * Un nom saisi dans une page peut être n'importe quoi ; une signature qu'on
 * choisit ne signe rien.
 */
type Category = 'bug' | 'metier' | 'autre'

const CATEGORIES: { value: Category; label: string; hint: string }[] = [
  { value: 'bug', label: 'Bug', hint: 'Quelque chose ne marche pas' },
  { value: 'metier', label: 'Métier', hint: 'Le comportement est faux ou incomplet' },
  { value: 'autre', label: 'Autre', hint: 'Idée, question, remarque' },
]

type Phase = 'idle' | 'picking' | 'capturing' | 'form' | 'done'

type Sent = { issueNumber: number | null; issueUrl: string | null }

export function ReportIssue() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [category, setCategory] = useState<Category>('bug')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<Sent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [element, setElement] = useState<ElementContext | null>(null)
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  /**
   * Les sondes, posées DÈS LE MONTAGE. Elles s'installent une seule fois
   * chacune (chaque module garde son propre drapeau), et elles enveloppent
   * `console`, `fetch`, les erreurs non rattrapées et l'historique de
   * navigation. Aucune n'avale quoi que ce soit : tout est réémis à l'original.
   */
  useEffect(() => {
    installConsoleBuffer()
    installErrorBuffer()
    installBreadcrumbs()
  }, [])

  useEffect(() => {
    if (phase === 'form') textareaRef.current?.focus()
  }, [phase])

  useEffect(() => {
    if (phase !== 'form' && phase !== 'done') return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPhase('idle')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase])

  const start = useCallback(() => {
    setCategory('bug')
    setMessage('')
    setSending(false)
    setSent(null)
    setError(null)
    setElement(null)
    setScreenshot(null)
    setPhase('picking')
  }, [])

  /**
   * La capture a lieu APRÈS le démontage du viseur, sinon l'overlay se retrouve
   * dans l'image.
   *
   * ⚠️ L'attente est BORNÉE. `requestAnimationFrame` ne tire jamais dans un
   * onglet caché : changer d'onglet entre le clic et la capture laissait le
   * widget sur « Capture en cours… » pour toujours, sans erreur ni trace.
   */
  const capture = useCallback(async (context: ElementContext | null, rect: DOMRect | null) => {
    setElement(context)
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

  async function send(): Promise<void> {
    const trimmed = message.trim()
    if (!trimmed || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          category,
          message: trimmed,
          pageUrl: window.location.href,
          userAgent: navigator.userAgent,
          consoleLogs: getRecentConsole() || null,
          errorLogs: getRecentErrors() || null,
          elementContext: element,
          screenshot,
          // Ce que la capture ne montre pas : les appels qui ont échoué avec
          // leur identifiant de corrélation, les gestes qui ont mené là, et la
          // version exacte du code affiché.
          networkFailures: getRecentNetworkFailures(),
          breadcrumbs: getRecentBreadcrumbs(),
          appContext: captureAppContext(),
        }),
      })
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean
        error?: string
        issueNumber?: number | null
        issueUrl?: string | null
      } | null
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? `L’API a répondu ${res.status}.`)
        return
      }
      setSent({ issueNumber: data.issueNumber ?? null, issueUrl: data.issueUrl ?? null })
      setPhase('done')
    } catch (err) {
      setError(`Envoi impossible. ${err instanceof Error ? err.message : ''}`.trim())
    } finally {
      setSending(false)
    }
  }

  const captured = [
    element ? 'zone pointée' : null,
    screenshot ? 'capture d’écran' : null,
    getRecentNetworkFailures().length > 0 ? `${getRecentNetworkFailures().length} appel(s) en échec` : null,
    getRecentBreadcrumbs().length > 0 ? `${getRecentBreadcrumbs().length} geste(s)` : null,
  ].filter((entry): entry is string => entry !== null)

  return (
    <>
      {phase === 'picking' ? <ElementPicker onPick={onPick} onSkip={onSkip} onCancel={() => setPhase('idle')} /> : null}

      {phase === 'capturing' ? (
        <div data-bellum-capture-ignore="" className="report-panel" role="status">
          <div className="report-body">
            <p className="report-hint">Capture en cours…</p>
          </div>
        </div>
      ) : null}

      {phase === 'form' || phase === 'done' ? (
        <div data-bellum-capture-ignore="" className="report-panel" role="dialog" aria-label="Signaler un défaut">
          {phase === 'done' && sent ? (
            <div className="report-body">
              {/*
                ⚠️ Le numéro d'issue vaut `null` quand GitHub a refusé (intégration
                éteinte, jeton périmé). On le DIT : annoncer une issue qui n'existe
                pas ferait croire un défaut remonté alors qu'il dort en base.
              */}
              <p className="report-ok">
                {sent.issueNumber ? `C’est remonté — issue #${sent.issueNumber}.` : 'C’est enregistré.'}
              </p>
              <p className="report-hint">
                {sent.issueNumber
                  ? 'Elle porte l’étiquette beta-backoffice.'
                  : 'Aucune issue GitHub n’a pu être ouverte — le retour est en base, il devra être repris à la main.'}
              </p>
              <div className="report-actions">
                {sent.issueUrl ? (
                  <a className="report-link" href={sent.issueUrl} target="_blank" rel="noreferrer">
                    Voir l’issue
                  </a>
                ) : null}
                <button type="button" className="report-secondary" onClick={start}>
                  En signaler un autre
                </button>
                <button type="button" className="report-primary" onClick={() => setPhase('idle')}>
                  Fermer
                </button>
              </div>
            </div>
          ) : (
            <div className="report-body">
              <p className="report-title">Signaler un défaut</p>
              <div className="report-cats">
                {CATEGORIES.map(entry => (
                  <button
                    key={entry.value}
                    type="button"
                    title={entry.hint}
                    aria-pressed={category === entry.value}
                    className={category === entry.value ? 'report-cat report-cat-on' : 'report-cat'}
                    onClick={() => setCategory(entry.value)}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>

              {/* La preuve de ce qui a été saisi : une vignette qu'on peut regarder,
                  pas une promesse. Un rapporteur qui ne voit pas sa capture ne
                  sait pas si elle montre ce qu'il croit. */}
              {/* Un `<img>` nu, et non `next/image` : la source est une data URL
                  produite dans le navigateur. `next/image` optimise des fichiers
                  servis par Next — il n'a rien à optimiser ici, et il refuserait
                  une source qu'il ne peut pas atteindre. */}
              {screenshot ? <img className="report-shot" src={screenshot} alt="Capture jointe au signalement" /> : null}

              <textarea
                ref={textareaRef}
                className="report-input"
                rows={5}
                value={message}
                placeholder="Ce que tu as vu, et ce que tu attendais."
                onChange={event => setMessage(event.target.value)}
              />

              {element ? (
                <p className="report-hint">
                  Zone pointée : <code>{element.descriptor.slice(0, 90)}</code>
                </p>
              ) : null}
              <p className="report-hint">
                Partent avec : l’adresse de cette page, ton navigateur, la console et les erreurs de la session
                {captured.length > 0 ? `, ${captured.join(', ')}` : ''}.
              </p>

              {error ? <p className="report-error">{error}</p> : null}
              <div className="report-actions">
                <button type="button" className="report-secondary" onClick={() => setPhase('idle')}>
                  Annuler
                </button>
                <button
                  type="button"
                  className="report-primary"
                  disabled={sending || message.trim().length === 0}
                  onClick={() => void send()}
                >
                  {sending ? 'Envoi…' : 'Envoyer'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/*
        Le bouton porte un NOM, pas seulement une icône : un bouton muet ne
        s'annonce pas à un lecteur d'écran et ne se survole pas utilement. Il
        s'efface pendant qu'on vise et pendant la capture — sinon il finirait
        dans l'image, et il serait à cliquer par-dessus la page qu'on pointe.
      */}
      {phase === 'idle' || phase === 'form' || phase === 'done' ? (
        <button
          type="button"
          data-bellum-capture-ignore=""
          className="report-fab"
          aria-label="Signaler un défaut"
          title="Signaler un défaut"
          aria-expanded={phase !== 'idle'}
          onClick={() => (phase === 'idle' ? start() : setPhase('idle'))}
        >
          <BugIcon />
        </button>
      ) : null}
    </>
  )
}

/** L'icône du widget client, à l'identique — même geste, même signe. */
function BugIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m8 2 1.88 1.88" />
      <path d="M14.12 3.88 16 2" />
      <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
      <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
      <path d="M12 20v-9" />
      <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
      <path d="M6 13H2" />
      <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
      <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
      <path d="M22 13h-4" />
      <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
    </svg>
  )
}
