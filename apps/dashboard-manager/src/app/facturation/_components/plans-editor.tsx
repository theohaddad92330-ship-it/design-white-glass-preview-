'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AdminPlan } from '@/lib/admin'
import type { OfferEconomics } from '@/lib/offer-economics'
import { clientsSurLOffre, phraseDeConfirmation, resumerLesChangements } from './offers-economics.logic'

// Inline editor for the DB-backed plan catalogue (the Offres sub-view of
// Facturation). Each row edits a plan's name / price / caps / seats and PATCHes
// the DM route handler (which proxies to the API with the internal secret,
// server-side), then refreshes the table. v1 = EDIT existing plans only (no
// create/delete). Bilingual FR / EN labels.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ AUCUNE MODIFICATION D'OFFRE SANS CONFIRMATION EXPLICITE (issue 1656)
// ─────────────────────────────────────────────────────────────────────────────
// Jusqu'au 07/09/2026, « Enregistrer » déclenchait le PATCH AU CLIC. Un
// changement de catalogue touche des clients EXISTANTS — un prix modifié
// s'applique aux abonnements en cours à leur prochaine échéance, et une fonction
// décochée leur est retirée IMMÉDIATEMENT.
//
// La confirmation ne demande donc pas « êtes-vous sûr ? », qui ne protège de
// rien : elle NOMME la conséquence — combien de clients sont sur cette offre
// aujourd'hui, quels champs bougent, lesquels traversent la porte. Même
// principe que la suppression d'un utilisateur, qui nomme les espaces qu'elle
// emporte.
//
// ⚠️ Et quand la mesure du nombre de clients est indisponible, elle le DIT.
// Un « 0 client concerné » de panne, juste avant un changement de prix, serait
// le pire mensonge de cet écran.

type SaveState = 'idle' | 'saving' | 'done' | 'error'

/**
 * La grille de gating par offre : ce qu'un palier OUVRE.
 *
 * Recopiée de `PLAN_FEATURE_KEYS` (@bellum/contracts) — le dashboard ne dépend
 * pas du paquet. La copie ne peut pas dériver en silence : `plan-features-dm-parity.spec.ts`
 * (côté API) lit CE fichier et échoue si la liste s'écarte du contrat, et l'API
 * refuse de toute façon une clé inconnue.
 */
const PLAN_FEATURES: ReadonlyArray<{ key: string; fr: string; en: string }> = [
  { key: 'exports', fr: 'Exports PDF/CSV', en: 'PDF/CSV exports' },
  { key: 'chat_ai', fr: 'Copilote IA', en: 'AI copilot' },
  { key: 'discover', fr: 'Découvrir', en: 'Discover' },
  { key: 'watchlist', fr: 'Veille', en: 'Watchlist' },
  { key: 'knowledge_base', fr: 'Base de connaissance', en: 'Knowledge base' },
  { key: 'team_workspace', fr: 'Espace partagé', en: 'Shared workspace' },
  { key: 'needs', fr: 'Besoins', en: 'Needs' },
  { key: 'talent_pool', fr: 'Vivier', en: 'Talent pool' },
  { key: 'crm_native', fr: 'CRM Bellum', en: 'Bellum CRM' },
  { key: 'ats_native', fr: 'ATS Bellum', en: 'Bellum ATS' },
  { key: 'manager_cockpit', fr: 'Pilotage', en: 'Management cockpit' },
  { key: 'crm_sync', fr: 'Export CRM', en: 'CRM export' },
  { key: 'mcp_assistant', fr: 'Assistant IA (MCP)', en: 'AI assistant (MCP)' },
  { key: 'public_api', fr: 'API publique', en: 'Public API' },
  { key: 'rfp', fr: 'Appels d’offres', en: 'Tenders' },
]

type Draft = {
  label: string
  priceEuros: string
  accountsLimit: string
  enrichmentCredits: string
  seats: string
  extraSeatPriceEuros: string
  features: string[]
}

function toDraft(plan: AdminPlan): Draft {
  return {
    label: plan.label,
    priceEuros: String(plan.price / 100),
    accountsLimit: String(plan.accountsLimit),
    enrichmentCredits: String(plan.enrichmentCredits),
    seats: String(plan.seats),
    extraSeatPriceEuros: String(plan.extraSeatPrice / 100),
    features: [...(plan.features ?? [])],
  }
}

const NUM = { width: 88 } as const

/** What we PATCHed, keyed by the field name the API echoes it back under. */
const PERSISTED_AS: ReadonlyArray<{ sent: keyof PlanPatch; got: keyof AdminPlan; fr: string; en: string }> = [
  { sent: 'label', got: 'label', fr: 'nom', en: 'name' },
  { sent: 'price', got: 'price', fr: 'prix', en: 'price' },
  { sent: 'accounts_limit', got: 'accountsLimit', fr: 'crédits/mois', en: 'credits/mo' },
  { sent: 'enrichment_credits', got: 'enrichmentCredits', fr: 'enrichissements', en: 'enrichments' },
  { sent: 'seats', got: 'seats', fr: 'sièges', en: 'seats' },
  { sent: 'extra_seat_price', got: 'extraSeatPrice', fr: 'prix siège', en: 'seat price' },
  { sent: 'features', got: 'features', fr: 'fonctions incluses', en: 'included features' },
]

type PlanPatch = {
  label: string
  price: number
  accounts_limit: number
  enrichment_credits: number
  seats: number
  extra_seat_price: number
  features: string[]
}

/**
 * Fields the server did NOT store as sent. An empty list means the edit landed
 * in full; anything else is a save that would otherwise have looked successful.
 * A field the response omits entirely counts as a mismatch — silence is exactly
 * the symptom we are hunting.
 */
function diffPersisted(sent: PlanPatch, got: Partial<AdminPlan>): string[] {
  return PERSISTED_AS.filter(({ sent: from, got: to }) => !sameValue(sent[from], got[to])).map(f => `${f.fr} / ${f.en}`)
}

/** Égalité de valeur, listes comprises — `features` est un tableau, qu'un `!==`
 *  déclarerait TOUJOURS différent (et donc toute sauvegarde en échec). L'ordre
 *  ne compte pas : le serveur renvoie la liste dans l'ordre du contrat. */
function sameValue(sent: unknown, got: unknown): boolean {
  if (Array.isArray(sent) || Array.isArray(got)) {
    if (!Array.isArray(sent) || !Array.isArray(got)) return false
    return sent.length === got.length && [...sent].sort().every((v, i) => v === [...got].sort()[i])
  }
  return sent === got
}

/** Le corps du PATCH, construit à partir du brouillon d'une ligne. */
function toBody(d: Draft): PlanPatch {
  return {
    label: d.label.trim(),
    price: Math.round(Number(d.priceEuros) * 100),
    accounts_limit: Math.trunc(Number(d.accountsLimit)),
    enrichment_credits: Math.trunc(Number(d.enrichmentCredits)),
    seats: Math.trunc(Number(d.seats)),
    extra_seat_price: Math.round(Number(d.extraSeatPriceEuros) * 100),
    features: [...d.features],
  }
}

export function PlansEditor({
  initialPlans,
  economics = null,
}: {
  initialPlans: AdminPlan[]
  /** Ce que chaque offre rapporte — sert UNIQUEMENT à nommer, dans la
   *  confirmation, combien de clients une modification touche. `null` quand la
   *  mesure n'a pas pu être chargée : la confirmation dit alors
   *  « indisponible », jamais « aucun ». */
  economics?: OfferEconomics[] | null
}) {
  const router = useRouter()
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(initialPlans.map(p => [p.key, toDraft(p)])),
  )
  const [states, setStates] = useState<Record<string, SaveState>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  /** La ligne dont la confirmation est OUVERTE. Une seule à la fois : deux
   *  panneaux ouverts inviteraient à confirmer le mauvais. */
  const [confirming, setConfirming] = useState<string | null>(null)

  function edit(key: string, field: keyof Draft, value: string) {
    setDrafts(d => ({ ...d, [key]: { ...d[key]!, [field]: value } }))
    setStates(s => ({ ...s, [key]: 'idle' }))
    // Une valeur qui change après l'ouverture du panneau rendrait la
    // confirmation fausse : elle décrirait un enregistrement qui n'est plus
    // celui qu'on s'apprête à faire. On la referme.
    setConfirming(c => (c === key ? null : c))
  }

  /** Ouvre / ferme une fonction sur un palier. Décocher RETIRE la fonction aux
   *  abonnés de ce palier dès l'enregistrement — contrairement aux quotas, qui
   *  ne servent que de modèle aux prochaines souscriptions. */
  function toggleFeature(key: string, feature: string) {
    setDrafts(d => {
      const draft = d[key]!
      const next = draft.features.includes(feature)
        ? draft.features.filter(f => f !== feature)
        : [...draft.features, feature]
      return { ...d, [key]: { ...draft, features: next } }
    })
    setStates(s => ({ ...s, [key]: 'idle' }))
    setConfirming(c => (c === key ? null : c))
  }

  async function save(plan: AdminPlan) {
    const d = drafts[plan.key]!
    const body = toBody(d)
    const invalid =
      d.label.trim().length === 0 ||
      [body.price, body.accounts_limit, body.enrichment_credits, body.seats, body.extra_seat_price].some(
        v => !Number.isFinite(v) || v < 0,
      )
    if (invalid) {
      setStates(s => ({ ...s, [plan.key]: 'error' }))
      setErrors(e => ({ ...e, [plan.key]: 'Valeurs invalides (entiers ≥ 0, nom requis). / Invalid values.' }))
      return
    }
    setStates(s => ({ ...s, [plan.key]: 'saving' }))
    setErrors(e => ({ ...e, [plan.key]: '' }))
    setConfirming(null)
    try {
      const res = await fetch(`/api/admin/plans/${encodeURIComponent(plan.key)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as Partial<AdminPlan> & {
        error?: string
        message?: string
      }
      if (!res.ok) {
        setStates(s => ({ ...s, [plan.key]: 'error' }))
        setErrors(e => ({ ...e, [plan.key]: data.error ?? data.message ?? `HTTP ${res.status}` }))
        return
      }
      // A 200 is not proof the edit landed. The API answers with the PERSISTED
      // plan, so we check it actually echoes what we sent: any field that came
      // back different was dropped or rejected somewhere between here and the
      // database, and the operator must see that instead of a green tick.
      // (`extra_seat_price` was silently dropped by the proxy whitelist for
      // exactly this reason — a success tick over an unchanged price.)
      const mismatched = diffPersisted(body, data)
      if (mismatched.length > 0) {
        setStates(s => ({ ...s, [plan.key]: 'error' }))
        setErrors(e => ({
          ...e,
          [plan.key]:
            `Non enregistré : ${mismatched.join(', ')}. La valeur affichée reste celle du serveur. / ` +
            `Not saved: ${mismatched.join(', ')}. The displayed value is still the server's.`,
        }))
        router.refresh()
        return
      }
      setStates(s => ({ ...s, [plan.key]: 'done' }))
      router.refresh()
    } catch (err) {
      setStates(s => ({ ...s, [plan.key]: 'error' }))
      setErrors(e => ({ ...e, [plan.key]: err instanceof Error ? err.message : String(err) }))
    }
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <p style={{ fontSize: 12, opacity: 0.75, margin: '0 0 10px' }}>
        Changer un <strong>prix</strong> (offre ou siège supplémentaire) s’applique aux nouveaux abonnements <em>et</em>{' '}
        à ceux déjà en cours : chaque abonné passe au nouveau tarif à sa prochaine échéance, sans facture ni avoir
        immédiat. Une erreur corrigée avant cette date n’a donc rien coûté. Les autres champs (quotas, sièges) ne
        servent que de modèle aux prochaines souscriptions et ne modifient aucun abonné existant.
        <br />
        Changing a <strong>price</strong> (plan or extra seat) applies to new subscriptions <em>and</em> to live ones:
        each subscriber moves to the new rate at their next renewal, with no immediate invoice or credit note. The other
        fields (quotas, seats) are only a template for future subscriptions and never alter an existing subscriber.
        <br />
        <br />
        Les <strong>fonctions incluses</strong> sont l’exception : décocher une case la retire IMMÉDIATEMENT aux abonnés
        du palier — l’API refuse alors l’appel et l’app affiche un verrou. Tout est ouvert par défaut ; ne fermer qu’une
        fonction qu’on assume de reprendre à ceux qui l’utilisent aujourd’hui.
        <br />
        <strong>Included features</strong> are the exception: unticking a box removes it IMMEDIATELY from that plan’s
        subscribers — the API then refuses the call and the app shows a lock. Everything ships open; only close what you
        accept taking back from today’s users.
      </p>
      <table>
        <thead>
          <tr>
            <th>Clé / Key</th>
            <th>Nom / Name</th>
            <th>Prix €/mois / Price €/mo</th>
            <th>Crédits/mois / Credits/mo</th>
            <th>Enrichissements (obsolète) / Enrichments (legacy)</th>
            <th>Sièges / Seats</th>
            <th>Prix siège €/mois / Seat €/mo</th>
            <th>Fonctions incluses / Included features</th>
            <th>Self-serve</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {initialPlans.map(plan => {
            const d = drafts[plan.key]!
            const state = states[plan.key] ?? 'idle'
            return (
              <tr key={plan.key}>
                <td>
                  <code>{plan.key}</code>
                </td>
                <td>
                  <input
                    value={d.label}
                    onChange={e => edit(plan.key, 'label', e.target.value)}
                    aria-label={`Nom du plan ${plan.key}`}
                    style={{ width: 130 }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={d.priceEuros}
                    onChange={e => edit(plan.key, 'priceEuros', e.target.value)}
                    aria-label={`Prix du plan ${plan.key}`}
                    style={NUM}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    value={d.accountsLimit}
                    onChange={e => edit(plan.key, 'accountsLimit', e.target.value)}
                    aria-label={`Analyses/mois du plan ${plan.key}`}
                    style={NUM}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    value={d.enrichmentCredits}
                    onChange={e => edit(plan.key, 'enrichmentCredits', e.target.value)}
                    aria-label={`Enrichissements du plan ${plan.key}`}
                    style={NUM}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    value={d.seats}
                    onChange={e => edit(plan.key, 'seats', e.target.value)}
                    aria-label={`Sièges du plan ${plan.key}`}
                    style={NUM}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={d.extraSeatPriceEuros}
                    onChange={e => edit(plan.key, 'extraSeatPriceEuros', e.target.value)}
                    aria-label={`Prix du siège supplémentaire du plan ${plan.key}`}
                    style={NUM}
                  />
                </td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {PLAN_FEATURES.map(feature => (
                      <label
                        key={feature.key}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, whiteSpace: 'nowrap' }}
                      >
                        <input
                          type="checkbox"
                          checked={d.features.includes(feature.key)}
                          onChange={() => toggleFeature(plan.key, feature.key)}
                          aria-label={`${feature.fr} — plan ${plan.key}`}
                        />
                        {feature.fr} / {feature.en}
                      </label>
                    ))}
                  </div>
                </td>
                <td>
                  <span className="badge" style={{ opacity: plan.selfServe ? 1 : 0.5 }}>
                    {plan.selfServe ? 'oui / yes' : 'non / no'}
                  </span>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button
                    type="button"
                    className="btn-sm"
                    onClick={() => setConfirming(c => (c === plan.key ? null : plan.key))}
                    disabled={state === 'saving'}
                    aria-expanded={confirming === plan.key}
                  >
                    {state === 'saving' ? 'Enregistrement… / Saving…' : 'Enregistrer / Save'}
                  </button>{' '}
                  {state === 'done' ? <span style={{ color: 'var(--green)' }}>✓</span> : null}
                  {state === 'error' ? <span style={{ color: 'var(--red)' }}>✗</span> : null}
                  {errors[plan.key] ? (
                    <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{errors[plan.key]}</div>
                  ) : null}
                  {confirming === plan.key ? (
                    <ConfirmationPanel
                      plan={plan}
                      draft={d}
                      clients={clientsSurLOffre(economics, plan.key)}
                      onConfirm={() => void save(plan)}
                      onCancel={() => setConfirming(null)}
                    />
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * La confirmation d'un enregistrement d'offre — issue 1656.
 *
 * Elle ne demande pas « êtes-vous sûr ? ». Elle NOMME :
 *  - combien de clients sont sur cette offre aujourd'hui (ou dit que la mesure
 *    est indisponible — jamais « aucun ») ;
 *  - quels champs vont changer ;
 *  - lesquels traversent la porte : un PRIX s'applique aux abonnés en cours à
 *    leur prochaine échéance, une fonction décochée leur est retirée
 *    IMMÉDIATEMENT.
 *
 * Un enregistrement qui ne change rien le dit aussi : ce n'est pas une erreur,
 * mais confirmer une écriture vide sans le savoir apprend à ne plus lire.
 */
function ConfirmationPanel({
  plan,
  draft,
  clients,
  onConfirm,
  onCancel,
}: {
  plan: AdminPlan
  draft: Draft
  clients: number | null
  onConfirm: () => void
  onCancel: () => void
}) {
  const changements = resumerLesChangements(
    {
      label: plan.label,
      price: plan.price,
      accountsLimit: plan.accountsLimit,
      enrichmentCredits: plan.enrichmentCredits,
      seats: plan.seats,
      extraSeatPrice: plan.extraSeatPrice,
      features: plan.features ?? [],
    },
    {
      label: draft.label.trim(),
      price: Math.round(Number(draft.priceEuros) * 100),
      accountsLimit: Math.trunc(Number(draft.accountsLimit)),
      enrichmentCredits: Math.trunc(Number(draft.enrichmentCredits)),
      seats: Math.trunc(Number(draft.seats)),
      extraSeatPrice: Math.round(Number(draft.extraSeatPriceEuros) * 100),
      features: draft.features,
    },
  )

  return (
    <div
      style={{
        marginTop: 8,
        padding: 10,
        border: '1px solid var(--border)',
        borderRadius: 6,
        background: 'var(--surface)',
        whiteSpace: 'normal',
        maxWidth: 320,
        fontSize: 13,
      }}
    >
      <p style={{ margin: '0 0 6px' }}>{phraseDeConfirmation(plan.label, clients)}</p>

      {changements.champs.length === 0 ? (
        <p style={{ margin: '0 0 6px', color: 'var(--muted)' }}>
          Aucune valeur n’a changé — enregistrer réécrira la même offre.
        </p>
      ) : (
        <p style={{ margin: '0 0 6px' }}>
          Champs modifiés : <strong>{changements.champs.join(', ')}</strong>.
        </p>
      )}

      {changements.prixModifie ? (
        <p style={{ margin: '0 0 6px' }}>
          ⚠️ Un <strong>prix</strong> change : les abonnements EN COURS y passeront à leur prochaine échéance, sans
          facture ni avoir immédiat.
        </p>
      ) : null}

      {changements.fonctionsRetirees.length > 0 ? (
        <p style={{ margin: '0 0 6px' }}>
          ⚠️ Fonctions <strong>retirées</strong> : {changements.fonctionsRetirees.join(', ')}. Elles disparaissent
          IMMÉDIATEMENT chez les abonnés de ce palier.
        </p>
      ) : null}

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button type="button" className="btn-sm" onClick={onConfirm}>
          Confirmer l’enregistrement
        </button>
        <button type="button" className="btn-sm" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  )
}
