'use client'

import {
  IMPERSONATION_REASON_CODES,
  IMPERSONATION_REASON_LABELS,
  type ImpersonationReasonCode,
} from '@bellum/contracts'
import { useState } from 'react'

/**
 * Les actions rapides d'une LIGNE de l'annuaire (ADMIN-01, audit du 17/08).
 *
 * Le back-office affichait email, nom, plan, crédits, ESN et date — et rien
 * d'autre. Pour incarner un compte ou renvoyer un lien de connexion à un bêta
 * testeur qui appelle, l'admin devait ouvrir la fiche, agir, revenir. Sur une
 * liste de trente comptes en phase d'ouverture, ce n'est pas un détail de
 * confort : c'est le temps du support pendant la seule semaine où il compte.
 *
 * Toutes les routes existaient déjà (`/api/admin/users/[userId]/…`), aucune
 * n'était atteignable depuis la ligne.
 *
 * **Ce que ce menu n'offre PAS, et pourquoi.**
 *
 *  - *Suspendre / Réactiver* : l'annuaire ne porte pas l'état d'authentification
 *    (`banned`) — le lire coûterait un appel par utilisateur à chaque affichage
 *    de la liste. Proposer « Suspendre » à un compte déjà suspendu afficherait
 *    une action qui ne fait rien, ce qui est pire qu'un clic de plus. Les deux
 *    restent sur la fiche, où l'état est connu.
 *  - *Suppression* : irréversible, et elle a sa confirmation sur la fiche. Une
 *    suppression à un clic dans une liste triée finit par tomber sur la ligne
 *    d'à côté.
 *
 * Le MOTIF d'incarnation n'est pas contourné : la route l'exige (min. 3
 * caractères) parce qu'il alimente le journal d'audit, et une action rapide qui
 * ferait sauter cette exigence viderait la trace de son intérêt. Il se saisit
 * donc dans la ligne, sans quitter la liste.
 */
type Props = {
  userId: string
  email: string
}

type Outcome =
  | { kind: 'idle' }
  | { kind: 'reason' }
  | { kind: 'busy' }
  | { kind: 'link'; url: string }
  | { kind: 'error'; message: string }

const LINK_BUTTON: React.CSSProperties = { background: 'none', border: 0, cursor: 'pointer', padding: 0 }

export function UserRowActions({ userId, email }: Props) {
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' })
  // #1670 — un CATALOGUE fermé, pas un champ libre. Le second point d'entrée de
  // l'incarnation : il porte la même règle que la fiche utilisateur, et la liste
  // vient des contrats — deux copies d'un catalogue divergent à la première
  // correction.
  const [reasonCode, setReasonCode] = useState<ImpersonationReasonCode | ''>('')

  async function post(path: string, body?: unknown): Promise<{ link?: string; url?: string } | null> {
    setOutcome({ kind: 'busy' })
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/${path}`, {
        method: 'POST',
        ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
      })
      const data = (await res.json().catch(() => null)) as { link?: string; url?: string; error?: string } | null
      if (!res.ok) {
        setOutcome({ kind: 'error', message: data?.error ?? `Échec (${res.status})` })
        return null
      }
      return data
    } catch (err) {
      setOutcome({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
      return null
    }
  }

  async function requestResetLink() {
    const data = await post('reset-link')
    if (!data) return
    if (!data.link) {
      setOutcome({ kind: 'error', message: 'Réponse sans lien.' })
      return
    }
    setOutcome({ kind: 'link', url: data.link })
  }

  async function startImpersonation() {
    if (reasonCode === '') return
    const data = await post('impersonate', { reason_code: reasonCode })
    if (!data) return
    setReasonCode('')
    setOutcome({ kind: 'idle' })
    // La session d'incarnation s'ouvre dans un ONGLET à part : l'annuaire reste
    // là où l'opérateur l'a laissé, et les deux contextes ne se marchent pas
    // dessus (cf. l'isolation par onglet, DEMO-01).
    if (data.url) window.open(data.url, '_blank', 'noopener')
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
      <a className="link" href={`/users/${encodeURIComponent(userId)}`}>
        Fiche
      </a>
      {outcome.kind === 'reason' ? (
        <>
          <select
            autoFocus
            value={reasonCode}
            onChange={event => setReasonCode(event.target.value as ImpersonationReasonCode | '')}
            aria-label={`Motif d'incarnation de ${email}`}
            style={{ width: 200, fontSize: 12 }}
          >
            <option value="">Choisis un motif…</option>
            {IMPERSONATION_REASON_CODES.map(code => (
              <option key={code} value={code}>
                {IMPERSONATION_REASON_LABELS[code]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="link"
            style={LINK_BUTTON}
            disabled={reasonCode === ''}
            onClick={startImpersonation}
          >
            Ouvrir
          </button>
          <button
            type="button"
            className="link"
            style={LINK_BUTTON}
            onClick={() => {
              setReasonCode('')
              setOutcome({ kind: 'idle' })
            }}
          >
            Annuler
          </button>
        </>
      ) : (
        <button type="button" className="link" style={LINK_BUTTON} onClick={() => setOutcome({ kind: 'reason' })}>
          Incarner
        </button>
      )}
      <button
        type="button"
        className="link"
        onClick={requestResetLink}
        disabled={outcome.kind === 'busy'}
        style={LINK_BUTTON}
        title={`Générer un lien de connexion pour ${email}`}
      >
        {outcome.kind === 'busy' ? '…' : 'Lien de connexion'}
      </button>
      {/* Le lien s'AFFICHE, il ne part pas tout seul : aucun e-mail n'est envoyé
          par ce geste, et l'opérateur qui a la personne au téléphone le lui
          colle. Il expire en 15 minutes — dit ici, sinon on le retrouve collé
          dans un fil de discussion trois jours plus tard. */}
      {outcome.kind === 'link' ? (
        <input
          readOnly
          value={outcome.url}
          onFocus={event => event.currentTarget.select()}
          style={{ width: 220, fontSize: 12 }}
          aria-label="Lien de connexion (valable 15 minutes)"
          title="Valable 15 minutes"
        />
      ) : null}
      {outcome.kind === 'error' ? (
        <span style={{ color: 'var(--danger, #c0392b)', fontSize: 12 }}>{outcome.message}</span>
      ) : null}
    </span>
  )
}
