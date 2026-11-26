'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TreasuryInput, TreasuryMonthView } from '@/lib/business-metrics'
import { libelleMois, messageDErreurApi } from '../../revenus.logic'
import { champEuros, lireMontant, type MontantSaisi } from '../tresorerie.logic'

/**
 * La saisie d'UN mois de trésorerie (#1649).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS RÈGLES DE L'ISSUE, TENUES ICI
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **Aucun mois n'est pré-rempli avec le précédent.** Changer de mois charge
 *     ce que CE mois porte, ou des cases vides. Recopier septembre dans octobre
 *     ferait signer un chiffre que personne n'a relevé.
 *  2. **Un champ vide vaut « non mesuré », pas zéro** — il part en `null`.
 *  3. **On CORRIGE un mois, on ne recalcule pas les autres.** L'écriture ne
 *     touche que le mois choisi ; la série se relit après.
 *
 * ⚠️ QUATRE CHAMPS, ET NON TROIS. #1649 en énumère trois puis écrit
 * « burn = fixes + variables − encaissements ». Les encaissements ne sont ni
 * saisis ni dérivables (le MRR est une position théorique, pas de la caisse), si
 * bien que la formule était incalculable telle quelle. Le quatrième champ garde
 * la formule EXACTE au lieu de la tronquer.
 */
export function TreasuryForm({
  mois,
  moisParDefaut,
  saisis,
}: {
  mois: string[]
  moisParDefaut: string
  saisis: TreasuryMonthView[]
}) {
  const router = useRouter()
  const [moisChoisi, setMoisChoisi] = useState(moisParDefaut)
  const dejaSaisi = useMemo(() => new Map(saisis.map(m => [m.month, m])), [saisis])

  const courant = dejaSaisi.get(moisChoisi) ?? null
  const [solde, setSolde] = useState(champEuros(courant?.bankBalanceCents))
  const [fixes, setFixes] = useState(champEuros(courant?.fixedExpensesCents))
  const [variables, setVariables] = useState(champEuros(courant?.variableExpensesCents))
  const [encaissements, setEncaissements] = useState(champEuros(courant?.collectedCents))
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  /** Change de mois et recharge CE mois — jamais le précédent (règle 1). */
  function choisirMois(valeur: string) {
    setMoisChoisi(valeur)
    const ligne = dejaSaisi.get(valeur) ?? null
    setSolde(champEuros(ligne?.bankBalanceCents))
    setFixes(champEuros(ligne?.fixedExpensesCents))
    setVariables(champEuros(ligne?.variableExpensesCents))
    setEncaissements(champEuros(ligne?.collectedCents))
    setErreur(null)
  }

  async function enregistrer(event: React.FormEvent) {
    event.preventDefault()
    setErreur(null)

    const champs: Array<[keyof TreasuryInput, string]> = [
      ['bankBalanceCents', solde],
      ['fixedExpensesCents', fixes],
      ['variableExpensesCents', variables],
      ['collectedCents', encaissements],
    ]
    const corps: TreasuryInput = {}
    for (const [cle, brut] of champs) {
      const lu: MontantSaisi = lireMontant(brut)
      if (lu.etat === 'illisible') {
        setErreur(`Montant illisible : « ${brut} ». Attendu un nombre d’euros, par exemple 12 480 ou 1 200,50.`)
        return
      }
      // Vide = « non mesuré », donc `null`. C'est une VALEUR, elle s'envoie.
      corps[cle] = lu.etat === 'vide' ? null : lu.cents
    }

    setEnCours(true)
    try {
      const res = await fetch(`/api/admin/business-metrics/treasury/${moisChoisi}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corps),
      })
      if (!res.ok) {
        // Le même défaut que le panneau des instantanés, et il fallait le
        // corriger des DEUX côtés : « Le mois s’écrit AAAA-MM » et « un mois à
        // venir ne se saisit pas » arrivent dans le champ `message` d'une
        // `BadRequestException`. Lire `error` affichait « Bad Request ».
        setErreur(messageDErreurApi(await res.json().catch(() => null), res.status))
        return
      }
      router.refresh()
    } catch (err) {
      setErreur(`API injoignable. ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setEnCours(false)
    }
  }

  return (
    <section className="card" style={{ margin: '0 0 20px', padding: 20 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>Saisir un mois</h2>
      <p className="subtitle" style={{ marginTop: 0 }}>
        Deux minutes par mois. Une case laissée vide reste « non mesuré » — elle ne vaut pas zéro, et rien n’est
        pré-rempli avec le mois précédent.
      </p>

      <form onSubmit={enregistrer}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200, flex: '1 1 200px' }}>
            <span>Mois</span>
            <select value={moisChoisi} onChange={e => choisirMois(e.target.value)}>
              {mois.map(m => (
                <option key={m} value={m}>
                  {libelleMois(m)}
                  {dejaSaisi.has(m) ? ' · saisi' : ''}
                </option>
              ))}
            </select>
          </label>

          <Champ label="Solde bancaire au 1er (€)" valeur={solde} onChange={setSolde} />
          <Champ label="Dépenses fixes (€)" valeur={fixes} onChange={setFixes} />
          <Champ label="Dépenses variables (€)" valeur={variables} onChange={setVariables} />
          <Champ label="Encaissements du mois (€)" valeur={encaissements} onChange={setEncaissements} />
        </div>

        {erreur ? (
          <div className="error" style={{ margin: '12px 0' }}>
            {erreur}
          </div>
        ) : null}

        <div style={{ marginTop: 16 }}>
          <button type="submit" className="btn" disabled={enCours}>
            {enCours ? 'Enregistrement…' : courant ? 'Corriger ce mois' : 'Enregistrer ce mois'}
          </button>
        </div>
      </form>
    </section>
  )
}

function Champ({ label, valeur, onChange }: { label: string; valeur: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180, flex: '1 1 180px' }}>
      <span>{label}</span>
      <input
        value={valeur}
        onChange={e => onChange(e.target.value)}
        inputMode="decimal"
        placeholder="non mesuré"
        maxLength={16}
      />
    </label>
  )
}
