'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { describeDeleteUserConsequence, type DeleteUserWorkspaceRef } from './delete-user-consequence'

// Irreversibly delete a user. Two-step guard: the operator must open the confirm
// panel and type the exact confirmation word before the destructive POST fires.
// POSTs the DM route handler (server-side proxy with the internal secret →
// API DELETE — which now also requires this SAME word server-side, #1664.2),
// then navigates back to the directory. There is NO undo.

const CONFIRM_WORD = 'SUPPRIMER'

/** « Skaizen », « Skaizen et Alterway », « Skaizen, Alterway et Neovance ». */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`
}

export function DeleteUser({
  userId,
  label,
  workspaces = [],
}: {
  userId: string
  label: string
  /** #1664.2 — noms les conséquences exactes : un espace DONT elle est
   *  propriétaire disparaît ENTIÈREMENT avec elle, un espace dont elle n'est
   *  que membre continue d'exister pour les autres. */
  workspaces?: DeleteUserWorkspaceRef[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [state, setState] = useState<'idle' | 'deleting' | 'error'>('idle')
  const [error, setError] = useState('')

  const armed = typed.trim().toUpperCase() === CONFIRM_WORD
  const { ownedWorkspaceNames, memberWorkspaceNames } = describeDeleteUserConsequence(workspaces)

  async function remove() {
    if (!armed || state === 'deleting') return
    setState('deleting')
    setError('')
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/delete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: typed.trim().toUpperCase() }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) {
        setState('error')
        setError(data.error ?? data.message ?? `HTTP ${res.status}`)
        return
      }
      // Gone — the detail page no longer resolves; go back to the directory.
      router.replace('/users')
      router.refresh()
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (!open) {
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        <button
          className="btn-sm"
          onClick={() => setOpen(true)}
          style={{ borderColor: 'color-mix(in srgb, var(--red) 50%, transparent)', color: 'var(--red)' }}
        >
          Supprimer le compte…
        </button>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          Supprime définitivement le compte Supabase du user. Action irréversible.
        </span>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'grid',
        gap: 10,
        padding: 14,
        borderRadius: 10,
        border: '1px solid color-mix(in srgb, var(--red) 45%, transparent)',
        background: 'color-mix(in srgb, var(--red) 8%, transparent)',
      }}
    >
      <strong style={{ color: 'var(--red)' }}>Suppression irréversible</strong>
      <span style={{ fontSize: 13, color: 'var(--text)' }}>
        Cela supprime définitivement le compte de <strong>{label}</strong> (authentification Supabase). Il n&apos;y a
        aucun moyen d&apos;annuler.
      </span>
      {/* #1664.2 — nomme la conséquence EXACTE, pas une formule générique.
          `workspaces.owner_user_id` cascade sur `auth.users` : supprimer le
          PROPRIÉTAIRE d'un espace supprime l'espace ENTIER, pas seulement ses
          données. C'est le fait le plus dommageable que le message d'avant
          omettait. */}
      {ownedWorkspaceNames.length > 0 ? (
        <span style={{ fontSize: 13, color: 'var(--red)' }}>
          Cette personne est <strong>propriétaire</strong> de {joinNames(ownedWorkspaceNames)} : la suppression emporte
          cet espace <strong>en entier</strong> — tous ses comptes, contacts et analyses — pas seulement les données de
          cette personne.
        </span>
      ) : null}
      {memberWorkspaceNames.length > 0 ? (
        <span style={{ fontSize: 13, color: 'var(--text)' }}>
          Cette personne perd l&apos;accès à {joinNames(memberWorkspaceNames)} ; ces espaces continuent d&apos;exister
          pour les autres membres.
        </span>
      ) : null}
      <span style={{ fontSize: 13, color: 'var(--text)' }}>
        Les actions déjà réalisées sous ce compte (analyses lancées, plans générés) perdent leur attribution dans
        l&apos;historique.
      </span>
      <span style={{ fontSize: 13, color: 'var(--text)' }}>
        Tape <code>{CONFIRM_WORD}</code> pour confirmer.
      </span>
      <input
        value={typed}
        placeholder={CONFIRM_WORD}
        onChange={e => setTyped(e.target.value)}
        aria-label="Confirmer la suppression"
        style={{ maxWidth: 220 }}
      />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          className="btn-sm"
          onClick={remove}
          disabled={!armed || state === 'deleting'}
          style={armed ? { borderColor: 'var(--red)', color: 'var(--red)' } : undefined}
        >
          {state === 'deleting' ? 'Suppression…' : 'Supprimer définitivement'}
        </button>
        <button
          className="btn-sm"
          onClick={() => {
            setOpen(false)
            setTyped('')
            setState('idle')
            setError('')
          }}
          disabled={state === 'deleting'}
        >
          Annuler
        </button>
      </div>
      {error ? <span style={{ fontSize: 12, color: 'var(--red)' }}>{error}</span> : null}
    </div>
  )
}
