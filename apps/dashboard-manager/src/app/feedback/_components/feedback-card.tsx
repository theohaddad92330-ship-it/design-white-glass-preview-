'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { EmailEnClair } from '@/app/_components/email-en-clair'
import { aDesPiecesJointes, aUneCapture, type FeedbackComment, type FeedbackItem } from '@/lib/feedback'
import { dateEtHeure, dureeEcoulee } from '@/lib/dates'
import type { DelaiReponse } from '../feedback.logic'

// Une carte de retour, avec ce qu'on peut en FAIRE : fermer, rouvrir, répondre.
// L'état affiché vient de GitHub (source de vérité) ; ce composant ne garde
// aucun état métier en local — après une action, il rafraîchit la page serveur.

const CATEGORY_LABEL: Record<FeedbackItem['category'], string> = {
  bug: '🐞 Bug',
  metier: '💡 Métier',
  autre: '💬 Autre',
}

export function FeedbackCard({
  item,
  issuesAvailable,
  delai,
}: {
  item: FeedbackItem
  issuesAvailable: boolean
  /** Calculé UNE fois par la page, avec une seule horloge (#1658.2). */
  delai: DelaiReponse
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [comments, setComments] = useState<FeedbackComment[] | null>(null)
  const [commentsUnavailable, setCommentsUnavailable] = useState(false)
  const [draft, setDraft] = useState('')

  /**
   * La capture, demandée à L'OUVERTURE du pli (07/09/2026).
   *
   * Mesuré en production : la liste rendait 32,6 Mo de captures base64 — 94 % du
   * poids de la page, 5,6 s — pour des images repliées que personne n'ouvrait.
   * Le coût venait du TRANSPORT, pas de l'affichage : ce composant est client,
   * et Next sérialise l'intégralité de ses props dans la charge utile. Ne pas
   * rendre l'`<img>` n'aurait rien économisé — c'est la donnée qui devait cesser
   * de voyager.
   *
   * ⚠️ « Absente » n'est pas « erreur ». Un retour sans capture est une réponse ;
   * une capture illisible est une panne. Les confondre ferait tourner l'écran
   * indéfiniment sur un retour qui n'a simplement rien à montrer.
   */
  const [capture, setCapture] = useState<
    | { etat: 'jamais' }
    | { etat: 'chargement' }
    | { etat: 'chargee'; url: string }
    | { etat: 'absente' }
    | { etat: 'erreur'; message: string }
  >({ etat: 'jamais' })

  async function chargerCapture(event: React.SyntheticEvent<HTMLDetailsElement>) {
    // Refermer le pli ne redemande rien, et un second dépli non plus : la
    // capture est immuable, la redemander serait un aller-retour pour rien.
    if (!event.currentTarget.open || capture.etat !== 'jamais') return
    setCapture({ etat: 'chargement' })
    try {
      const res = await fetch(`/api/admin/feedback/capture/${encodeURIComponent(item.id)}`)
      const data = (await res.json().catch(() => ({}))) as { screenshotUrl?: string | null; error?: string }
      if (!res.ok) {
        setCapture({ etat: 'erreur', message: data.error ?? `Erreur ${res.status}` })
        return
      }
      setCapture(data.screenshotUrl ? { etat: 'chargee', url: data.screenshotUrl } : { etat: 'absente' })
    } catch (err) {
      setCapture({ etat: 'erreur', message: err instanceof Error ? err.message : String(err) })
    }
  }

  /**
   * #1792 — LES PIÈCES JOINTES, demandées à l'ouverture — même modèle que
   * `capture` juste au-dessus (léger ici, mais le lien peut porter une donnée
   * personnelle : même porte, même moment de demande, jamais dans la liste).
   *
   * Un tableau plutôt qu'une valeur unique : les états valent pour LE LOT, pas
   * pièce par pièce — un échec de LECTURE (l'appel à l'API) est distinct d'un
   * échec de DÉPÔT (une pièce nommée avec `url: null`, déjà connu au chargement
   * de la liste, rendu pièce par pièce plus bas).
   */
  const [piecesJointes, setPiecesJointes] = useState<
    | { etat: 'jamais' }
    | { etat: 'chargement' }
    | { etat: 'chargees'; pieces: { name: string; url: string | null }[] }
    | { etat: 'erreur'; message: string }
  >({ etat: 'jamais' })

  async function chargerPiecesJointes(event: React.SyntheticEvent<HTMLDetailsElement>) {
    // Même garde que `chargerCapture` : refermer ne redemande rien, un second
    // dépli non plus — le lot ne change pas entre deux ouvertures.
    if (!event.currentTarget.open || piecesJointes.etat !== 'jamais') return
    setPiecesJointes({ etat: 'chargement' })
    try {
      const res = await fetch(`/api/admin/feedback/attachments/${encodeURIComponent(item.id)}`)
      const data = (await res.json().catch(() => ({}))) as {
        attachments?: { name: string; url: string | null }[] | null
        error?: string
      }
      if (!res.ok) {
        setPiecesJointes({ etat: 'erreur', message: data.error ?? `Erreur ${res.status}` })
        return
      }
      setPiecesJointes({ etat: 'chargees', pieces: data.attachments ?? [] })
    } catch (err) {
      setPiecesJointes({ etat: 'erreur', message: err instanceof Error ? err.message : String(err) })
    }
  }

  const issue = item.issue
  const number = item.github_issue_number

  async function call(path: string, body: unknown) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) throw new Error(data.error ?? data.message ?? `Erreur ${res.status}`)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function toggleState() {
    if (!number || !issue) return
    const next = issue.state === 'open' ? 'closed' : 'open'
    if (await call(`/api/admin/feedback/${number}/state`, { state: next })) router.refresh()
  }

  async function loadComments() {
    if (!number) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/feedback/${number}/comments`, { cache: 'no-store' })
      const data = (await res.json()) as { comments?: FeedbackComment[]; available?: boolean }
      setComments(data.comments ?? [])
      setCommentsUnavailable(data.available === false)
    } catch {
      setComments([])
      setCommentsUnavailable(true)
    } finally {
      setBusy(false)
    }
  }

  async function sendComment() {
    if (!number || !draft.trim()) return
    if (await call(`/api/admin/feedback/${number}/comments`, { body: draft.trim() })) {
      setDraft('')
      await loadComments()
      router.refresh()
    }
  }

  return (
    <article className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <span style={{ fontWeight: 600 }}>{CATEGORY_LABEL[item.category]}</span>
        <span style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <DelaiBadge delai={delai} />
          <IssueBadge item={item} issuesAvailable={issuesAvailable} />
          <span style={{ fontSize: 12, opacity: 0.5 }}>{dateEtHeure(item.created_at)}</span>
        </span>
      </div>

      <p style={{ margin: '10px 0', whiteSpace: 'pre-wrap' }}>{item.message}</p>

      <div style={{ fontSize: 12, opacity: 0.7, display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
        {/* Adresse en clair (c87), jamais dans un autre `<a>` : elle porte son propre `mailto:`. */}
        <EmailEnClair email={item.user_email} />
        <EspaceDeLAuteur item={item} />
        {item.page_url ? <span>{item.page_url}</span> : null}
        {item.client_context?.appContext?.buildVersion ? (
          <span>build {item.client_context.appContext.buildVersion}</span>
        ) : null}
        {item.github_issue_url ? (
          <a href={item.github_issue_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
            issue #{item.github_issue_number}
          </a>
        ) : null}
      </div>

      {correlationIds(item).length ? (
        <p style={{ fontSize: 11, opacity: 0.6, marginTop: 8 }}>
          Corrélation : <code>{correlationIds(item).join(', ')}</code>
        </p>
      ) : null}

      {aUneCapture(item) ? (
        <details style={{ marginTop: 10 }} onToggle={chargerCapture}>
          <summary style={{ cursor: 'pointer', fontSize: 12, opacity: 0.7 }}>Capture</summary>
          {capture.etat === 'chargement' ? (
            <p style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>Chargement de la capture…</p>
          ) : capture.etat === 'absente' ? (
            <p style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>Ce retour n’a pas de capture.</p>
          ) : capture.etat === 'erreur' ? (
            <p style={{ marginTop: 8, fontSize: 12, color: 'var(--red)' }}>Capture illisible : {capture.message}</p>
          ) : capture.etat === 'chargee' ? (
            // Une balise <img> nue et non `next/image` : la source est un
            // data-URI, pas un fichier que l'optimiseur saurait servir.
            <img
              src={capture.url}
              alt="Capture jointe au retour"
              style={{ marginTop: 8, maxWidth: '100%', borderRadius: 6, border: '1px solid var(--border)' }}
            />
          ) : null}
        </details>
      ) : null}

      {aDesPiecesJointes(item) ? (
        <details style={{ marginTop: 10 }} onToggle={chargerPiecesJointes}>
          <summary style={{ cursor: 'pointer', fontSize: 12, opacity: 0.7 }}>Pièces jointes</summary>
          {piecesJointes.etat === 'chargement' ? (
            <p style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>Chargement des pièces jointes…</p>
          ) : piecesJointes.etat === 'erreur' ? (
            <p style={{ marginTop: 8, fontSize: 12, color: 'var(--red)' }}>
              Pièces jointes illisibles : {piecesJointes.message}
            </p>
          ) : piecesJointes.etat === 'chargees' ? (
            <ul style={{ marginTop: 8, paddingLeft: 18, fontSize: 12 }}>
              {piecesJointes.pieces.map((piece, index) => (
                <li key={`${piece.name}-${index}`} style={{ marginBottom: 8 }}>
                  <PieceJointe piece={piece} />
                </li>
              ))}
            </ul>
          ) : null}
        </details>
      ) : null}

      {number ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button className="btn" onClick={toggleState} disabled={busy || !issue}>
            {issue?.state === 'closed' ? 'Rouvrir' : 'Marquer traité'}
          </button>
          <button className="btn" onClick={loadComments} disabled={busy}>
            {comments ? 'Rafraîchir le fil' : `Voir le fil${issue ? ` (${issue.comments})` : ''}`}
          </button>
        </div>
      ) : (
        <p style={{ fontSize: 12, opacity: 0.6, marginTop: 12 }}>
          Aucune issue ouverte pour ce retour — rien à traiter sur GitHub, il ne vit qu'en base.
        </p>
      )}

      {error ? <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{error}</p> : null}

      {comments ? (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          {commentsUnavailable ? (
            <p style={{ fontSize: 12, opacity: 0.6 }}>Fil indisponible (GitHub n'a pas répondu).</p>
          ) : comments.length === 0 ? (
            <p style={{ fontSize: 12, opacity: 0.6 }}>Aucune réponse pour l'instant.</p>
          ) : (
            comments.map(comment => (
              <div key={comment.id} style={{ marginBottom: 10 }}>
                <p style={{ fontSize: 11, opacity: 0.6 }}>
                  {comment.author ?? 'inconnu'} · {dateEtHeure(comment.createdAt)}
                </p>
                <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', margin: '2px 0 0' }}>{comment.body}</p>
              </div>
            ))
          )}

          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Répondre au retour (publié sur l'issue)"
            rows={3}
            style={{
              width: '100%',
              marginTop: 8,
              padding: 8,
              fontSize: 13,
              background: 'var(--bg)',
              color: 'inherit',
              border: '1px solid var(--border)',
              borderRadius: 6,
            }}
          />
          <button className="btn" onClick={sendComment} disabled={busy || !draft.trim()} style={{ marginTop: 6 }}>
            Publier la réponse
          </button>
        </div>
      ) : null}
    </article>
  )
}

/**
 * L'état du retour. Trois cas distincts, et c'est délibéré : traité, ouvert, et
 * « on n'a pas pu regarder » — confondre le troisième avec le deuxième ferait
 * rouvrir des retours déjà traités un jour de panne GitHub.
 */
function IssueBadge({ item, issuesAvailable }: { item: FeedbackItem; issuesAvailable: boolean }) {
  if (!item.github_issue_number) return <Badge color="var(--muted)">sans issue</Badge>
  if (!issuesAvailable) return <Badge color="var(--muted)">état inconnu</Badge>
  if (!item.issue) return <Badge color="var(--muted)">issue introuvable</Badge>
  return item.issue.state === 'closed' ? (
    <Badge color="var(--green)">traité</Badge>
  ) : (
    <Badge color="var(--amber)">ouvert</Badge>
  )
}

/** Les quatre extensions d'image que le dépôt de pièces accepte — miroir de `isImageKind` côté API. */
const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp)$/i

/**
 * UNE pièce jointe — #1792, même distinction que `attachmentsSection` dans
 * l'issue GitHub : une image s'affiche, un autre type se lie (GitHub ne les
 * rend pas inline), et un échec de DÉPÔT se nomme au lieu d'un lien mort.
 *
 * `url: null` est un fait connu depuis l'écriture en base (échec du dépôt sur
 * GitHub) — pas une erreur de LECTURE de cet écran, qui a ses propres états
 * plus haut.
 */
function PieceJointe({ piece }: { piece: { name: string; url: string | null } }) {
  if (!piece.url) {
    return <span style={{ color: 'var(--red)' }}>⚠️ {piece.name} — n’a pas pu être déposée sur GitHub.</span>
  }
  if (IMAGE_EXTENSION.test(piece.name)) {
    return (
      <a href={piece.url} target="_blank" rel="noreferrer">
        {/* Balise nue, pas `next/image` : la source est un blob GitHub, pas un
            fichier que l'optimiseur saurait servir. */}
        <img
          src={piece.url}
          alt={piece.name}
          style={{
            display: 'block',
            maxWidth: '100%',
            maxHeight: 220,
            borderRadius: 6,
            border: '1px solid var(--border)',
          }}
        />
      </a>
    )
  }
  return (
    <a href={piece.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
      {piece.name}
    </a>
  )
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 11, color, border: `1px solid ${color}`, borderRadius: 999, padding: '1px 8px' }}>
      {children}
    </span>
  )
}

/**
 * LE DÉLAI DE PREMIÈRE RÉPONSE (#1658.2).
 *
 * Trois états, et ils se lisent différemment à dessein : « répondu en 4 h » est
 * une mesure close, « sans réponse depuis 4 h » est un compteur qui tourne, et
 * « délai inconnu » dit qu'on n'a pas pu regarder. Les deux premiers ne diffèrent
 * pas d'un mot près : ils ne demandent pas la même action.
 *
 * ⚠️ Le titre porte la RAISON de l'état inconnu — pas la donnée. La règle du
 * dépôt interdit de ranger une donnée dans un `title=` (invisible au clavier,
 * muette au lecteur d'écran) ; une justification de repli, elle, n'est pas la
 * donnée : le libellé visible suffit à décider.
 */
function DelaiBadge({ delai }: { delai: DelaiReponse }) {
  if (delai.etat === 'repondu') {
    return <Badge color="var(--green)">répondu en {dureeEcoulee(delai.msEcoules)}</Badge>
  }
  if (delai.etat === 'en_attente') {
    return <Badge color="var(--amber)">sans réponse depuis {dureeEcoulee(delai.msEcoules)}</Badge>
  }
  return (
    <span title={delai.raison}>
      <Badge color="var(--muted)">délai inconnu</Badge>
    </span>
  )
}

/**
 * L'ESPACE QUI A REMONTÉ — et l'ambiguïté, dite plutôt que tranchée (#1658.2).
 *
 * ⚠️ `beta_feedback` NE PORTE PAS de `workspace_id` : le rattachement passe par
 * l'AUTEUR. Un utilisateur membre de deux espaces rend donc le lien ambigu, et
 * en choisir un enverrait l'opérateur chez le mauvais client sans jamais le lui
 * dire. On les montre TOUS, et l'écran nomme l'ambiguïté.
 *
 * Trois absences qui ne se confondent pas :
 *  · champ ABSENT (API antérieure au champ) → on ne dit rien, plutôt que
 *    « aucun espace », qui serait faux pendant une fenêtre de déploiement ;
 *  · `null` avec un auteur → aucun espace connu pour lui ;
 *  · pas d'auteur du tout → c'est un signalement du back-office, il n'appartient
 *    à aucun espace, et le dire est une information.
 */
function EspaceDeLAuteur({ item }: { item: FeedbackItem }) {
  if (item.workspaces === undefined) return null
  if (item.user_id === null) return <span>signalement back-office — aucun espace</span>
  const espaces = item.workspaces
  if (!espaces || espaces.length === 0) return <span>espace inconnu</span>

  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'baseline' }}>
      {espaces.map(espace => (
        <Link key={espace.id} href={`/esn/${espace.id}`} style={{ color: 'var(--accent)' }}>
          {espace.name}
        </Link>
      ))}
      {espaces.length > 1 ? (
        <span style={{ opacity: 0.7 }}>
          — l’auteur appartient à {espaces.length} espaces, le retour n’en désigne aucun
        </span>
      ) : null}
    </span>
  )
}

/** Les identifiants de corrélation des appels en échec — la clé des logs Railway. */
function correlationIds(item: FeedbackItem): string[] {
  const failures = item.client_context?.networkFailures ?? []
  return Array.from(new Set(failures.map(f => f.correlationId).filter((id): id is string => Boolean(id))))
}
