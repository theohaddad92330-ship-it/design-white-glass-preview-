import { type NextRequest, NextResponse } from 'next/server'
import { exigerCapacite } from '@/lib/guard'
import { fetchGroundTruthMetrics } from '@/lib/market-memory-ground-truth'

// #1622 — les six métriques, DÉJÀ RÉSOLUES côté API (jamais recalculées ici,
// voir GA-285). Proxy serveur — le secret interne ne quitte jamais le
// dashboard.
export async function GET(req: NextRequest) {
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'ground_truth.read')
  if (refus) return refus

  try {
    return NextResponse.json(await fetchGroundTruthMetrics())
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 })
  }
}
