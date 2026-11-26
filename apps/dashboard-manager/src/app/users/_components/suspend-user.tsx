'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { decrireConsequenceSuspension } from './suspend-consequence'
import type { EspaceDeLigne, EtatDuCompte } from '../users.logic'

/**
 * Suspendre — ou réactiver — un compte, avec une confirmation qui NOMME la
 * conséquence (#1664).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI CHANGE PAR RAPPORT À L'ANCIEN `SuspendToggle`
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. `window.confirm('Suspendre ce compte ?')` est parti. Une boîte native ne
 *     porte ni mise en forme, ni le nom de la personne, ni la liste de ce qui
 *     survit — et c'est justement cette liste que l'issue réclame.
 *  2. Le composant ne prend plus un BOOLÉEN `banned`. Il prend l'état
 *     {@link EtatDuCompte}, qui a trois valeurs. L'ancien appelant écrivait
 *     `banned={auth?.banned ?? false}` : quand le magasin d'authentification ne
 *     répond pas, `auth` vaut `null` et l'écran affichait « Suspendre le
 *     compte » — c'est-à-dire qu'il DEVINAIT « actif ». Un compte déjà suspendu
 *     se voyait proposer une suspension. On ne devine plus : l'état inconnu
 *     n'offre aucun geste et le DIT.
 *  3. Un seul composant sert la fiche ET la ligne de l'annuaire. Deux panneaux
 *     qui rendraient la même conséquence divergeraient à la première correction.
 */

type Props = {
  userId: string
  /** Le nom de la personne — la conséquence NOMME quelqu'un, elle ne dit pas
   *  « ce compte ». */
  label: string
  espaces: readonly EspaceDeLigne[]
  compte: EtatDuCompte
  /** Rendu après un geste réussi : la fiche rafraîchit, l'annuaire referme son
   *  panneau. Le rafraîchissement lui-même est fait ici, dans les deux cas. */
  onDone?: () => void
}

export function SuspendUser({ userId, label, espaces, compte, onDone }: Props) {
  const router = useRouter()
  const [ouvert, setOuvert] = useState(false)
  const [etat, setEtat] = useState<'idle' | 'working' | 'error'>('idle')
  const [erreur, setErreur] = useState('')

  // ⚠️ L'état INCONNU n'offre aucun geste. Proposer « Suspendre » sans savoir si
  // le compte l'est déjà, c'est proposer une action qui ne fait rien — la raison
  // exacte pour laquelle `user-row-actions.tsx` refusait ce bouton en liste.
  if (compte.etat === 'inconnu') {
    return (
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
        État du compte non lu — suspension indisponible tant que l’authentification ne répond pas.
      </span>
    )
  }

  const suspendu = compte.etat === 'suspendu'
  const consequence = decrireConsequenceSuspension(label, espaces, suspendu)

  async function agir() {
    if (etat === 'working') return
    setEtat('working')
    setErreur('')
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/${suspendu ? 'unsuspend' : 'suspend'}`, {
        method: 'POST',
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) {
        setEtat('error')
        setErreur(data.error ?? data.message ?? `HTTP ${res.status}`)
        return
      }
      setEtat('idle')
      setOuvert(false)
      router.refresh()
      onDone?.()
    } catch (err) {
      setEtat('error')
      setErreur(err instanceof Error ? err.message : String(err))
    }
  }

  if (!ouvert) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="btn-sm" onClick={() => setOuvert(true)}>
          {suspendu ? 'Réactiver le compte…' : 'Suspendre le compte…'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {suspendu ? 'Le compte est actuellement suspendu.' : 'Bloque la connexion sans supprimer les données.'}
        </span>
      </span>
    )
  }

  return (
    <div
      style={{
        display: 'grid',
        gap: 10,
        padding: 14,
        borderRadius: 10,
        border: `1px solid color-mix(in srgb, ${suspendu ? 'var(--green)' : 'var(--amber)'} 45%, transparent)`,
        background: `color-mix(in srgb, ${suspendu ? 'var(--green)' : 'var(--amber)'} 8%, transparent)`,
      }}
    >
      <strong>{consequence.titre}</strong>

      <div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Ce que ça arrête</div>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
          {consequence.arrete.map(phrase => (
            <li key={phrase} style={{ fontSize: 13 }}>
              {phrase}
            </li>
          ))}
        </ul>
      </div>

      <div>
        {/* La moitié qu'une confirmation générique omet toujours — et celle qui
            empêche de confondre ce geste avec la suppression. */}
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Ce qui reste</div>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
          {consequence.survit.map(phrase => (
            <li key={phrase} style={{ fontSize: 13 }}>
              {phrase}
            </li>
          ))}
        </ul>
      </div>

      <span style={{ fontSize: 13 }}>{consequence.reversibilite}</span>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="btn-sm" onClick={agir} disabled={etat === 'working'}>
          {etat === 'working' ? '…' : suspendu ? 'Réactiver' : 'Suspendre'}
        </button>
        <button
          type="button"
          className="btn-sm"
          disabled={etat === 'working'}
          onClick={() => {
            setOuvert(false)
            setEtat('idle')
            setErreur('')
          }}
        >
          Annuler
        </button>
      </div>

      {erreur ? <span style={{ fontSize: 12, color: 'var(--red)' }}>{erreur}</span> : null}
    </div>
  )
}
