'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { WorkspaceBudgetLevers } from '@bellum/contracts'
import { formFromLevers, leversFromForm, libelleEtatPlafonds, type CostLeversForm } from './cost-levers-panel.logic'

/**
 * LES CINQ LEVIERS de coût IA d'un espace — épopée #2975 (#2440.83-89).
 *
 * `PUT /internal/admin/workspaces/:id/budget` existait, testé, SANS aucun appelant : personne ne
 * pouvait poser un plafond, donc la porte (`checkBudgetGate`, branchée sur l'analyse et
 * l'enrichissement) ne bloquait jamais rien. Ce panneau est cet appelant — sur la fiche ESN qui
 * connaît déjà l'espace, juste au-dessus du ledger qui montre ce que le mois a coûté.
 *
 * Le coût ne s'affiche jamais côté application : ce réglage n'existe qu'ici. Un plafond vide est
 * « pas de plafond », jamais 0.
 */
export function CostLeversPanel({
  id,
  levers,
  panne,
}: {
  id: string
  levers: WorkspaceBudgetLevers | null
  panne: string | null
}) {
  if (!levers) {
    return (
      <section className="card" style={{ marginTop: 16, display: 'grid', gap: 10 }}>
        <div className="label">Plafonds de coût IA</div>
        <div className="error" style={{ padding: 12 }}>
          Indisponible — l&apos;API n&apos;a pas répondu. {panne}
        </div>
      </section>
    )
  }
  return <Formulaire id={id} levers={levers} />
}

function Formulaire({ id, levers }: { id: string; levers: WorkspaceBudgetLevers }) {
  const router = useRouter()
  const [form, setForm] = useState<CostLeversForm>(() => formFromLevers(levers))
  const [etat, setEtat] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const lu = leversFromForm(form)
  const dirty = JSON.stringify(form) !== JSON.stringify(formFromLevers(levers))

  function modifier(patch: Partial<CostLeversForm>) {
    setForm(courant => ({ ...courant, ...patch }))
    setEtat('idle')
    setMessage(null)
  }

  async function enregistrer() {
    if (!lu.ok) {
      setEtat('error')
      setMessage(lu.error)
      return
    }
    if (etat === 'saving') return
    setEtat('saving')
    try {
      const res = await fetch(`/api/admin/workspaces/${encodeURIComponent(id)}/budget`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(lu.levers),
      })
      if (!res.ok) {
        setEtat('error')
        setMessage(`Échec de l’enregistrement (${res.status}).`)
        return
      }
      setEtat('done')
      router.refresh()
    } catch {
      setEtat('error')
      setMessage('API injoignable.')
    }
  }

  const champ = (cle: 'monthly' | 'perMember' | 'perAction', libelle: string): React.ReactElement => (
    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
      {libelle}
      <input
        inputMode="decimal"
        placeholder="aucun plafond"
        value={form[cle]}
        onChange={e => modifier({ [cle]: e.target.value })}
        aria-label={libelle}
        style={{ minWidth: 140 }}
      />
    </label>
  )

  return (
    <section className="card" style={{ marginTop: 16, display: 'grid', gap: 12 }}>
      <div className="label">Plafonds de coût IA</div>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        Montants en dollars, sur le mois civil en cours, pour CET espace seulement — jamais agrégés entre espaces. Un
        champ vide ne pose aucun plafond.
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {champ('monthly', 'Budget mensuel de l’espace ($)')}
        {champ('perMember', 'Plafond par membre ($)')}
        {champ('perAction', 'Plafond par action ($)')}
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
        <input type="checkbox" checked={form.blockAtCap} onChange={e => modifier({ blockAtCap: e.target.checked })} />
        Bloquer l’action au-delà d’un plafond (sinon elle passe)
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
        <input
          type="checkbox"
          checked={form.alertOnOverage}
          onChange={e => modifier({ alertOnOverage: e.target.checked })}
        />
        Signaler un dépassement au back-office (quand l’action n’est pas bloquée)
      </label>
      <p style={{ fontSize: 12, margin: 0 }}>{lu.ok ? libelleEtatPlafonds(lu.levers) : lu.error}</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn-sm" onClick={enregistrer} disabled={!dirty || !lu.ok || etat === 'saving'}>
          {etat === 'saving' ? 'Enregistrement…' : 'Enregistrer les plafonds'}
        </button>
        {etat === 'done' ? <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ enregistré</span> : null}
        {etat === 'error' ? <span style={{ fontSize: 12, color: 'var(--red)' }}>✗ {message ?? 'échec'}</span> : null}
      </div>
    </section>
  )
}
