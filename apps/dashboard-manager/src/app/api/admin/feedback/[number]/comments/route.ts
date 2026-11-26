import { type NextRequest, NextResponse } from 'next/server'
import { commentIssue, fetchIssueComments } from '@/lib/feedback'
import { exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

// Le fil de discussion d'un retour : lu au dépliage de la carte, écrit quand on
// répond. Proxy serveur — le secret interne ne quitte jamais le dashboard.

export async function GET(req: NextRequest, props: { params: Promise<{ number: string }> }) {
  const params = await props.params
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'feedback.read')
  if (refus) return refus

  const issueNumber = Number(params.number)
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    return NextResponse.json({ comments: [], available: false, error: 'Numéro d’issue invalide' }, { status: 400 })
  }
  try {
    return NextResponse.json(await fetchIssueComments(issueNumber))
  } catch (err) {
    // `available: false` ≠ « aucun commentaire » : l'écran doit pouvoir dire
    // qu'il n'a pas pu regarder.
    return NextResponse.json(
      { comments: [], available: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    )
  }
}

export async function POST(req: NextRequest, props: { params: Promise<{ number: string }> }) {
  const params = await props.params
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'feedback.write')
  if (refus) return refus

  const issueNumber = Number(params.number)
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    return NextResponse.json({ ok: false, error: 'Numéro d’issue invalide' }, { status: 400 })
  }
  const body = (await req.json().catch(() => ({}))) as { body?: unknown; author?: unknown }
  const text = typeof body.body === 'string' ? body.body.trim() : ''
  if (!text) return NextResponse.json({ ok: false, error: 'Commentaire vide' }, { status: 400 })
  try {
    const { status, data } = await commentIssue(issueNumber, text, typeof body.author === 'string' ? body.author : null)
    // #1666 — le journal d’audit unique : Qui · Quoi · Sur quoi · Quand ·
    // Depuis où · Résultat. Le résultat se DÉDUIT du code rendu (2xx = réussi,
    // 4xx = refusé, 5xx = échec) : un refus n’est pas une panne.
    await journaliserAudit(req, {
      operation: 'feedback.comment',
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
