import { type NextRequest, NextResponse } from 'next/server'
import { logIncidentAction } from '@/lib/incident-ops'
import { acteurDepuisBasicAuth, exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

// #2445.12 (épopée #2766, lot SRC5 28/09 soir) — journaliser une ACTION prise
// sur un incident connecteur. Forwards to POST
// /internal/admin/incidents/:id/actions ; l'identité Basic-Auth de
// l'opérateur voyage comme `actor`, jamais un jeton utilisateur.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'incidents.write')
  if (refus) return refus

  const body = (await req.json().catch(() => ({}))) as { note?: unknown }
  const note = typeof body.note === 'string' ? body.note.trim() : ''
  if (!note) {
    return NextResponse.json({ ok: false, error: 'Une action se journalise avec une note, pas vide.' }, { status: 400 })
  }

  try {
    const { status, data } = await logIncidentAction(params.id, note, acteurDepuisBasicAuth(req))
    // #1666 — le journal d’audit unique : Qui · Quoi · Sur quoi · Quand ·
    // Depuis où · Résultat. Le résultat se DÉDUIT du code rendu.
    await journaliserAudit(req, {
      operation: 'incidents.action',
      category: 'ordinaire',
      subjectType: 'connector_incident',
      subjectId: params.id,
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
