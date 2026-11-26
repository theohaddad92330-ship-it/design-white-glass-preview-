import { type NextRequest, NextResponse } from 'next/server'
import { fetchIncidentImpact } from '@/lib/incident-ops'
import { exigerCapacite } from '@/lib/guard'

// #2445.12 (épopée #2766, lot SRC5 28/09 soir) — combien d'espaces DISTINCTS
// cet incident touche, COMPTÉS jamais nommés. Même capacité de lecture que
// le reste de la console d'opérations (`audit.read`).
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const refus = await exigerCapacite(req, 'audit.read')
  if (refus) return refus

  try {
    return NextResponse.json(await fetchIncidentImpact(params.id))
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `API injoignable. ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    )
  }
}
