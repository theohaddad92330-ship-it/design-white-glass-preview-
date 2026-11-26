import { type NextRequest, NextResponse } from 'next/server'
import { exigerCapacite } from '@/lib/guard'
import { fetchGroundTruthReading } from '@/lib/market-memory-ground-truth'

// #1622 — aperçu SEUL : ce que la mémoire marché dit d'un couple ESN ↔ compte,
// avant que l'opérateur ne tranche. N'écrit rien — proxy serveur, le secret
// interne ne quitte jamais le dashboard.
export async function GET(req: NextRequest) {
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'ground_truth.read')
  if (refus) return refus

  const params = req.nextUrl.searchParams
  const accountName = params.get('accountName')?.trim() ?? ''
  const esnName = params.get('esnName')?.trim() ?? ''
  if (!accountName || !esnName) {
    return NextResponse.json({ status: 'unavailable', reason: 'nom de compte et nom d’ESN requis' }, { status: 400 })
  }

  try {
    const reading = await fetchGroundTruthReading({
      accountName,
      accountWebsite: params.get('accountWebsite')?.trim() || undefined,
      accountCountry: params.get('accountCountry')?.trim() || undefined,
      esnName,
    })
    return NextResponse.json(reading)
  } catch (err) {
    return NextResponse.json(
      { status: 'unavailable', reason: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    )
  }
}
