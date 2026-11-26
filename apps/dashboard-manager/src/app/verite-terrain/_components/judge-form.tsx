'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type {
  MarketMemoryGroundTruthLabel,
  MarketMemoryGroundTruthReaderResult,
} from '@/lib/market-memory-ground-truth'
import { MARKET_MEMORY_GROUND_TRUTH_LABELS } from '@/lib/market-memory-ground-truth'
import { LABEL_CAPTIONS } from '../verite-terrain.logic'

type Etat = { phase: 'idle' } | { phase: 'loading' } | { phase: 'error'; message: string }

/**
 * #1622 — L'ÉCRAN DE JUGEMENT : un cas, la lecture qu'en fait la mémoire
 * marché, et six boutons. Rien de plus.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE COMPOSANT NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucun champ de note, aucun commentaire libre, aucun réglage — la doctrine du
 * retour est explicite : « un écran de labellisation qui demande de réfléchir
 * à l'ergonomie ne sert jamais ». `judgedBy` n'apparaît NULLE PART dans ce
 * composant : le proxy serveur (`app/api/market-memory-ground-truth/judgments/
 * route.ts`) l'attache depuis la session de l'opérateur.
 */
export function JudgeForm() {
  const router = useRouter()
  const [accountName, setAccountName] = useState('')
  const [accountWebsite, setAccountWebsite] = useState('')
  const [accountCountry, setAccountCountry] = useState('')
  const [esnName, setEsnName] = useState('')
  const [reading, setReading] = useState<MarketMemoryGroundTruthReaderResult | null>(null)
  const [lookupState, setLookupState] = useState<Etat>({ phase: 'idle' })
  const [judgingLabel, setJudgingLabel] = useState<MarketMemoryGroundTruthLabel | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)

  const peutInterroger = accountName.trim().length > 0 && esnName.trim().length > 0

  async function voirLaLecture() {
    if (!peutInterroger) return
    setConfirmation(null)
    setLookupState({ phase: 'loading' })
    const params = new URLSearchParams({ accountName: accountName.trim(), esnName: esnName.trim() })
    if (accountWebsite.trim()) params.set('accountWebsite', accountWebsite.trim())
    if (accountCountry.trim()) params.set('accountCountry', accountCountry.trim())
    try {
      const res = await fetch(`/api/market-memory-ground-truth/lookup?${params.toString()}`)
      const data = (await res.json()) as MarketMemoryGroundTruthReaderResult
      if (!res.ok) {
        setLookupState({ phase: 'error', message: 'reason' in data ? data.reason : `HTTP ${res.status}` })
        return
      }
      setReading(data)
      setLookupState({ phase: 'idle' })
    } catch (err) {
      setLookupState({ phase: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  async function juger(label: MarketMemoryGroundTruthLabel) {
    if (judgingLabel) return
    setJudgingLabel(label)
    setConfirmation(null)
    try {
      const res = await fetch('/api/market-memory-ground-truth/judgments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountName: accountName.trim(),
          accountWebsite: accountWebsite.trim() || undefined,
          accountCountry: accountCountry.trim() || undefined,
          esnName: esnName.trim(),
          label,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) {
        setLookupState({ phase: 'error', message: data.error ?? data.message ?? `HTTP ${res.status}` })
        return
      }
      setConfirmation(`Jugement enregistré : « ${LABEL_CAPTIONS[label]} ».`)
      setReading(null)
      router.refresh()
    } catch (err) {
      setLookupState({ phase: 'error', message: err instanceof Error ? err.message : String(err) })
    } finally {
      setJudgingLabel(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <Champ label="Compte (raison sociale)" value={accountName} onChange={setAccountName} required />
        <Champ label="Site web (optionnel)" value={accountWebsite} onChange={setAccountWebsite} />
        <Champ label="Pays (optionnel)" value={accountCountry} onChange={setAccountCountry} />
        <Champ label="ESN à juger" value={esnName} onChange={setEsnName} required />
      </div>

      <button
        type="button"
        className="btn-sm"
        onClick={voirLaLecture}
        disabled={!peutInterroger || lookupState.phase === 'loading'}
        style={{ alignSelf: 'flex-start' }}
      >
        {lookupState.phase === 'loading' ? 'Lecture…' : 'Voir la lecture de la mémoire marché'}
      </button>

      {lookupState.phase === 'error' ? (
        <p style={{ fontSize: 13, color: 'var(--red)' }}>Mémoire marché indisponible : {lookupState.message}</p>
      ) : null}

      {reading ? <Lecture reading={reading} /> : null}

      {reading ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {MARKET_MEMORY_GROUND_TRUTH_LABELS.map(label => (
            <button
              key={label}
              type="button"
              className="btn-sm"
              onClick={() => juger(label)}
              disabled={judgingLabel !== null}
            >
              {judgingLabel === label ? 'Enregistrement…' : LABEL_CAPTIONS[label]}
            </button>
          ))}
        </div>
      ) : null}

      {confirmation ? <p style={{ fontSize: 13, color: 'var(--green)' }}>{confirmation}</p> : null}
    </div>
  )
}

function Champ({
  label,
  value,
  onChange,
  required,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
      <span>
        {label}
        {required ? ' *' : ''}
      </span>
      <input
        type="text"
        value={value}
        onChange={event => onChange(event.target.value)}
        style={{ padding: '6px 8px', fontSize: 14, borderRadius: 6, border: '1px solid var(--border)' }}
      />
    </label>
  )
}

/** La lecture que la mémoire marché fait du cas — jamais un pourcentage,
 *  jamais un « 0 » quand rien n'est observé : `hadReading: false` se DIT. */
function Lecture({ reading }: { reading: MarketMemoryGroundTruthReaderResult }) {
  if (reading.status === 'unavailable') {
    return <p style={{ fontSize: 13, color: 'var(--red)' }}>Mémoire marché indisponible : {reading.reason}</p>
  }
  if (!reading.reading.hadReading) {
    return (
      <p style={{ fontSize: 13, color: 'var(--muted)' }}>
        Cette ESN n’apparaît pas dans ce que la mémoire marché observe pour ce compte.
      </p>
    )
  }
  const { rank, persons, certainty } = reading.reading
  // GA-19 : pas de `?? 0` ici, même pour un simple accord au pluriel. Un
  // `persons` absent n'est pas « zéro personne » — la lecture le dit alors avec
  // son mot, et l'accord se décide sur un nombre RÉELLEMENT lu.
  const personnes =
    typeof persons === 'number' ? `${persons} personne${persons > 1 ? 's' : ''}` : 'nombre de personnes non mesuré'
  return (
    <p style={{ fontSize: 13 }}>
      Observée au rang {rank} — {personnes}, certitude {certainty}.
    </p>
  )
}
