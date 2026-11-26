import { type NextRequest, NextResponse } from 'next/server'
import { setIssueState } from '@/lib/feedback'
import { exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

// Proxy serveur : ferme ou rouvre le retour côté GitHub. Le secret interne reste
// ici, jamais dans le navigateur (même schéma que /api/admin/banners).
export async function POST(req: NextRequest, props: { params: Promise<{ number: string }> }) {
  const params = await props.params
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'feedback.write')
  if (refus) return refus

  const issueNumber = Number(params.number)
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    return NextResponse.json({ ok: false, error: 'Numéro d’issue invalide' }, { status: 400 })
  }
  const body = (await req.json().catch(() => ({}))) as { state?: unknown }
  if (body.state !== 'open' && body.state !== 'closed') {
    return NextResponse.json({ ok: false, error: 'État attendu : open ou closed' }, { status: 400 })
  }
  try {
    const { status, data } = await setIssueState(issueNumber, body.state)
    // #1666 — le journal d’audit unique : Qui · Quoi · Sur quoi · Quand ·
    // Depuis où · Résultat. Le résultat se DÉDUIT du code rendu (2xx = réussi,
    // 4xx = refusé, 5xx = échec) : un refus n’est pas une panne.
    await journaliserAudit(req, {
      operation: 'feedback.state',
      category: 'ordinaire',
      subjectType: 'issue',
      subjectId: params.number,
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
