import { type NextRequest, NextResponse } from 'next/server'
import { toggleBanner } from '@/lib/banners'
import { exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

// Server-side proxy: flip a banner's `active` flag (which also bumps its
// version server-side so a re-activated banner reappears past dismissals).
// Forwards to PATCH /internal/admin/banners/:id/toggle with the internal
// secret. Called by the row toggle on /banners.
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'banners.write')
  if (refus) return refus

  const body = (await req.json().catch(() => ({}))) as { active?: unknown }
  const active = body.active === true
  try {
    const { status, data } = await toggleBanner(params.id, active)
    // #1666 — le journal d’audit unique : Qui · Quoi · Sur quoi · Quand ·
    // Depuis où · Résultat. Le résultat se DÉDUIT du code rendu (2xx = réussi,
    // 4xx = refusé, 5xx = échec) : un refus n’est pas une panne.
    await journaliserAudit(req, {
      operation: 'banners.toggle',
      category: 'ordinaire',
      subjectType: 'banner',
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
