'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AdminOwnerInvitation } from '@/lib/admin'
import { describeOwnerInvitation, refusalMessage } from '@/lib/owner-invitation-state'
import { EmailEnClair } from '@/app/_components/email-en-clair'
import { dateEtHeure } from '@/lib/dates'

/**
 * L'activation du propriétaire d'un siège provisionné à la main — #2643.2,
 * #2643.1.
 *
 * ⚠️ CE QU'IL NE FAIT PAS TOUT SEUL, ET C'EST TOUT L'INTÉRÊT : rien ne part au
 * chargement de la page. L'e-mail PRÉPARÉ (#1665 règle 2) n'est envoyé — ou
 * relancé, #2643.3 — que sur le clic « Envoyer » ci-dessous : un
 * provisionnement raté enverrait quand même, et c'est un vrai client qui le
 * reçoit (décision Louis 20/09/2026).
 */
export function OwnerInvitationPanel({
  id,
  ownerInvitation,
}: {
  id: string
  ownerInvitation: AdminOwnerInvitation | null | undefined
}) {
  const state = describeOwnerInvitation(ownerInvitation)

  if (state.kind === 'unavailable') {
    return (
      <section className="card" style={{ marginTop: 16, display: 'grid', gap: 10 }}>
        <div className="label">Activation du propriétaire</div>
        <div className="empty" style={{ padding: 12 }}>
          Indisponible sur cette version de l&apos;API.
        </div>
      </section>
    )
  }

  if (state.kind === 'none') {
    return (
      <section className="card" style={{ marginTop: 16, display: 'grid', gap: 10 }}>
        <div className="label">Activation du propriétaire</div>
        <div className="empty" style={{ padding: 12 }}>
          Aucune invitation à préparer : le compte du propriétaire existait déjà à la création de cet espace.
        </div>
      </section>
    )
  }

  return (
    <section className="card" style={{ marginTop: 16, display: 'grid', gap: 12 }}>
      <div className="label">Activation du propriétaire</div>

      <p style={{ margin: 0, fontSize: 13 }}>
        <EmailEnClair email={state.email} />
      </p>

      {!state.prepared ? (
        <div className="error" style={{ padding: 12 }}>
          Le lien de définition de mot de passe n&apos;a pas pu être engendré
          {state.error ? ` (${state.error})` : ''}. Réessayez depuis la fiche utilisateur.
        </div>
      ) : state.sentAt ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <span className="pill">Envoyé</span>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
            Le {dateEtHeure(state.sentAt)}
            {state.sentBy ? ` par ${state.sentBy}` : ''}
            {state.sendCount > 1 ? ` · ${state.sendCount} envois au total` : ''}.
          </p>
          {/* #2643.3 — la relance est le MÊME geste : renvoyer, c'est rappeler
              ce lien, jamais l'envoyer seul. */}
          <SendOwnerInvitationButton id={id} label="Relancer" />
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          <span className="pill">Préparé, pas encore envoyé</span>
          {state.expiresAt ? (
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
              Le lien expirera le {dateEtHeure(state.expiresAt)}.
            </p>
          ) : null}
          <SendOwnerInvitationButton id={id} label="Envoyer" />
        </div>
      )}
    </section>
  )
}

/** Le SEUL bouton qui déclenche l'envoi — voir la porte côté API
 *  (`OwnerActivationService.send`, #2643.1). */
function SendOwnerInvitationButton({ id, label }: { id: string; label: string }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function envoyer() {
    if (state === 'sending') return
    setState('sending')
    setError(null)
    try {
      const res = await fetch(`/api/admin/workspaces/${encodeURIComponent(id)}/owner-invitation/send`, {
        method: 'POST',
      })
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean
        error?: string
        sent?: boolean
        reason?: string
      } | null
      if (!res.ok || data?.sent === false) {
        setState('error')
        setError(data?.error ?? refusalMessage(data?.reason))
        return
      }
      setState('done')
      router.refresh()
    } catch {
      setState('error')
      setError('API injoignable.')
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button className="btn-sm" onClick={envoyer} disabled={state === 'sending'}>
        {state === 'sending' ? 'Envoi…' : label}
      </button>
      {state === 'done' ? <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ envoyé</span> : null}
      {state === 'error' ? <span style={{ fontSize: 12, color: 'var(--red)' }}>✗ {error ?? 'échec'}</span> : null}
    </div>
  )
}
