import { type NextRequest, NextResponse } from 'next/server'
import { createBanner, type BannerWriteInput } from '@/lib/banners'
import { exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

// Server-side proxy: create a banner. Forwards to POST /internal/admin/banners
// with the internal secret (which never reaches the browser). The API
// re-validates the body (Zod) — this handler only forwards. Called by the
// create form on /banners.
export async function POST(req: NextRequest) {
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'banners.write')
  if (refus) return refus

  const body = (await req.json().catch(() => ({}))) as BannerWriteInput
  try {
    const { status, data } = await createBanner(body)
    // #1666 — le journal d’audit unique : Qui · Quoi · Sur quoi · Quand ·
    // Depuis où · Résultat. Le résultat se DÉDUIT du code rendu (2xx = réussi,
    // 4xx = refusé, 5xx = échec) : un refus n’est pas une panne.
    await journaliserAudit(req, {
      operation: 'banners.create',
      category: 'ordinaire',
      subjectType: 'banner',
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
