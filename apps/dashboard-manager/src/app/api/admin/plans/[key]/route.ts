import { type NextRequest, NextResponse } from 'next/server'
import { adminMutate } from '@/lib/admin'
import { exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

// Server-side proxy: edit a billing plan's template (name / price / caps / seats).
// Forwards to the API's PATCH /internal/admin/plans/:key with the internal secret
// (which never reaches the browser). Called by the inline editor on /plans.
//
// v1 is EDIT-ONLY: the key must be an existing catalog plan (the API 404s an
// unknown key). Editing a plan changes the template used by the NEXT
// checkout/assign — it never rewrites existing subscribers' stored caps.

// Every numeric field the API's `updatePlanSchema` accepts. This list MUST stay
// in sync with apps/api/src/modules/admin/dto/update-plan.dto.ts: a field the
// editor sends and the API would accept, but that is missing here, is dropped
// in transit — the PATCH still succeeds (the other fields are valid), the UI
// shows a success tick, and the value silently reverts on refresh.
//
// That is exactly what happened to `extra_seat_price`: added to the editor and
// the DTO by #588, never added here, so no operator could change the per-seat
// price and none of them was told. Two guards now make that failure mode
// impossible to reintroduce silently: the unknown-field check below turns a
// field this proxy does not know into a 400 rather than a shrug, and
// `dm-plan-proxy-parity.spec.ts` fails CI if this list drifts from the DTO.
const NUMERIC_FIELDS = ['price', 'accounts_limit', 'enrichment_credits', 'seats', 'extra_seat_price'] as const

// Les champs LISTE que l'API accepte (`features` = la grille de gating par
// offre). Même discipline que ci-dessus : omis ici, ils seraient jetés en
// silence, l'éditeur afficherait un ✓ et la grille resterait inchangée.
const ARRAY_FIELDS = ['features'] as const

const KNOWN_FIELDS: readonly string[] = ['label', ...NUMERIC_FIELDS, ...ARRAY_FIELDS]

export async function PATCH(req: NextRequest, props: { params: Promise<{ key: string }> }) {
  const params = await props.params
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'offers.write')
  if (refus) return refus

  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const patch: Record<string, number | string | string[]> = {}

  // Fail loudly on anything this proxy would otherwise drop on the floor.
  const unknown = Object.keys(raw).filter(key => !KNOWN_FIELDS.includes(key))
  if (unknown.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          `Champ(s) non pris en charge par le proxy : ${unknown.join(', ')}. La modification a été REFUSÉE (rien n'a été enregistré). / ` +
          `Field(s) not supported by this proxy: ${unknown.join(', ')}. The update was REJECTED (nothing was saved).`,
      },
      { status: 400 },
    )
  }

  if (typeof raw.label === 'string' && raw.label.trim().length > 0) {
    patch.label = raw.label.trim()
  } else if (raw.label !== undefined) {
    // A blank/whitespace label used to be dropped in silence — same failure mode
    // as the seat price, on the one field with no client-side number guard.
    return NextResponse.json(
      { ok: false, error: 'Le nom du plan ne peut pas être vide. / Plan name cannot be empty.' },
      { status: 400 },
    )
  }
  for (const field of NUMERIC_FIELDS) {
    const value = raw[field]
    if (value === undefined) continue
    const n = Number(value)
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Champ « ${field} » invalide : entier ≥ 0 attendu. / Invalid ${field}: non-negative integer.`,
        },
        { status: 400 },
      )
    }
    patch[field] = n
  }

  for (const field of ARRAY_FIELDS) {
    const value = raw[field]
    if (value === undefined) continue
    // Une liste VIDE est légitime (fermer toutes les portes d'un palier) : on ne
    // la confond pas avec « champ absent ». Seul un type inattendu est refusé.
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
      return NextResponse.json(
        {
          ok: false,
          error: `Champ « ${field} » invalide : liste de chaînes attendue. / Invalid ${field}: expected a list of strings.`,
        },
        { status: 400 },
      )
    }
    patch[field] = value as string[]
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: 'Aucun champ à modifier. / No field to update.' }, { status: 400 })
  }

  try {
    const { status, data } = await adminMutate('PATCH', `/plans/${encodeURIComponent(params.key)}`, patch)
    // #1666 — le journal d’audit unique : Qui · Quoi · Sur quoi · Quand ·
    // Depuis où · Résultat. Le résultat se DÉDUIT du code rendu (2xx = réussi,
    // 4xx = refusé, 5xx = échec) : un refus n’est pas une panne.
    await journaliserAudit(req, {
      operation: 'plans.write',
      category: 'permission',
      subjectType: 'plan',
      subjectId: params.key,
      statusCode: status,
    })
    return NextResponse.json(data, { status })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `API injoignable. ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    )
  }
}
