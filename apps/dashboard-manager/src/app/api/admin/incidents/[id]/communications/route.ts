import { type NextRequest, NextResponse } from 'next/server'
import { logIncidentCommunication } from '@/lib/incident-ops'
import { acteurDepuisBasicAuth, exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

// #2445.12 (épopée #2766, lot SRC5 28/09 soir) — journaliser une
// COMMUNICATION tenue avec un client sur un incident connecteur. `workspaceId`
// est facultatif : une communication générale (statut public) n'en cible aucun.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'incidents.write')
  if (refus) return refus

  const body = (await req.json().catch(() => ({}))) as { note?: unknown; workspaceId?: unknown }
  const note = typeof body.note === 'string' ? body.note.trim() : ''
  if (!note) {
    return NextResponse.json(
      { ok: false, error: 'Une communication se journalise avec une note, pas vide.' },
      { status: 400 },
    )
  }
  const workspaceId = typeof body.workspaceId === 'string' && body.workspaceId ? body.workspaceId : undefined

  try {
    const { status, data } = await logIncidentCommunication(params.id, note, acteurDepuisBasicAuth(req), workspaceId)
    await journaliserAudit(req, {
      operation: 'incidents.communication',
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
