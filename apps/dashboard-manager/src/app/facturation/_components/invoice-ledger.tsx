'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ManualInvoice } from '@/lib/admin'
import { jourSeul } from '@/lib/dates'

/**
 * Le journal des factures d'un client, et le geste qui l'alimente.
 *
 * Ce que ce composant remplace : un unique sélecteur « payé / non payé » posé
 * sur le CONTRAT. Il ne pouvait rien dire du mois suivant — c'est la même ligne
 * qu'on rebasculait indéfiniment, si bien qu'un client facturé une fois et un
 * client facturé tous les mois se ressemblaient exactement.
 *
 * La période n'est PAS demandée : l'API la déduit de la plus ancienne qui
 * manque, ce que l'opérateur veut dire neuf fois sur dix en enregistrant une
 * facture — et qu'il retaperait de travers un jour sur deux.
 *
 * Aucune suppression : une facture fausse se corrige (référence, encaissement).
 * Un journal troué ne se rapproche plus de la comptabilité qu'il reflète.
 */

// Une DATE SEULE n'a pas de fuseau : `jourSeul` la lit et la rend en UTC.
// L'ancien `T00:00:00` la parsait à minuit LOCAL, ce qui tenait par accident.
const DAY = (iso: string) => jourSeul(iso)

export function InvoiceLedger({ workspaceId, invoices }: { workspaceId: string; invoices: ManualInvoice[] }) {
  const router = useRouter()
  const [reference, setReference] = useState('')
  const [paid, setPaid] = useState(true)
  const [state, setState] = useState<'idle' | 'saving'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function record(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = reference.trim()
    if (!trimmed) return
    setState('saving')
    setError(null)
    try {
      const res = await fetch(`/api/admin/clients/manual/${encodeURIComponent(workspaceId)}/invoices`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reference: trimmed, paymentStatus: paid ? 'paid' : 'unpaid' }),
      })
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string }
      if (!res.ok) {
        // Le message de l'API nomme le vrai blocage (référence déjà présente,
        // conditions absentes) — le recopier vaut mieux qu'un « échec ».
        setError(data.message ?? data.error ?? `Échec (HTTP ${res.status}).`)
        return
      }
      setReference('')
      router.refresh()
    } catch (err) {
      setError(`Requête impossible. ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setState('idle')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 260 }}>
      {invoices.length === 0 ? (
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>Aucune facture enregistrée</span>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {invoices.map(invoice => (
            <li key={invoice.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="mono" style={{ fontSize: 12 }}>
                {invoice.reference}
              </span>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                {DAY(invoice.periodStart)} → {DAY(invoice.periodEnd)}
              </span>
              <InvoicePaymentSelect invoiceId={invoice.id} status={invoice.paymentStatus} />
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={record} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          value={reference}
          onChange={e => setReference(e.target.value)}
          placeholder="N° de facture"
          aria-label="Numéro de la facture émise"
          maxLength={120}
          style={{ width: 130, fontSize: 12 }}
        />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
          <input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)} />
          encaissée
        </label>
        <button type="submit" className="btn ghost" disabled={state === 'saving' || !reference.trim()}>
          {state === 'saving' ? '…' : 'Enregistrer'}
        </button>
      </form>
      {error ? <span style={{ color: 'var(--red)', fontSize: 12 }}>{error}</span> : null}
    </div>
  )
}

/**
 * Le rapprochement bancaire, désormais posé sur LA facture concernée.
 *
 * Aucune conséquence sur les droits du client : le quota est porté par le plan.
 * Un impayé ne coupe l'accès à personne automatiquement, et cet écran ne le
 * fera pas non plus — il le rend visible.
 */
function InvoicePaymentSelect({ invoiceId, status }: { invoiceId: string; status: 'unpaid' | 'paid' }) {
  const router = useRouter()
  const [value, setValue] = useState(status)
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle')

  async function change(next: 'unpaid' | 'paid') {
    const previous = value
    setValue(next)
    setState('saving')
    try {
      const res = await fetch(`/api/admin/clients/manual/invoices/${encodeURIComponent(invoiceId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paymentStatus: next }),
      })
      if (!res.ok) {
        setValue(previous)
        setState('error')
        return
      }
      setState('idle')
      router.refresh()
    } catch {
      setValue(previous)
      setState('error')
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <select
        value={value}
        disabled={state === 'saving'}
        onChange={e => change(e.target.value as 'unpaid' | 'paid')}
        aria-label={`Statut de paiement de la facture ${invoiceId}`}
        style={{ color: value === 'unpaid' ? 'var(--red)' : 'var(--green)', fontSize: 12 }}
      >
        <option value="unpaid">Non payée</option>
        <option value="paid">Payée</option>
      </select>
      {state === 'error' ? <span style={{ color: 'var(--red)', fontSize: 12 }}>échec</span> : null}
    </span>
  )
}
