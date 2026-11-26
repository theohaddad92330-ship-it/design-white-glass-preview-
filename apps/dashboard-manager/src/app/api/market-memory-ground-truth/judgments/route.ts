import { type NextRequest, NextResponse } from 'next/server'
import { adminMutate } from '@/lib/admin'
import { actorFromRequest } from '@/lib/operator'
import { exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'
import { fetchGroundTruthJudgments } from '@/lib/market-memory-ground-truth'

// #1622 — la liste des jugements COURANTS (GET) et l'enregistrement d'un
// jugement (POST, un des six boutons de l'écran). Proxy serveur — le secret
// interne ne quitte jamais le dashboard.

export async function GET(req: NextRequest) {
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'ground_truth.read')
  if (refus) return refus

  try {
    return NextResponse.json(await fetchGroundTruthJudgments())
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 })
  }
}

export async function POST(req: NextRequest) {
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'ground_truth.write')
  if (refus) return refus

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  try {
    // `judgedBy` vient de la SESSION, jamais du corps envoyé par le
    // navigateur — sans quoi rien n'empêcherait un opérateur de juger au nom
    // d'un autre (#1622 §4, doctrine : l'auteur d'un jugement est une donnée
    // d'audit légitime, jamais choisie par l'appelant).
    const { status, data } = await adminMutate('POST', '/market-memory-ground-truth/judgments', {
      ...body,
      judgedBy: await actorFromRequest(req),
    })
    // #1666 — le journal d’audit unique : Qui · Quoi · Sur quoi · Quand ·
    // Depuis où · Résultat. Le résultat se DÉDUIT du code rendu (2xx = réussi,
    // 4xx = refusé, 5xx = échec) : un refus n’est pas une panne.
    await journaliserAudit(req, {
      operation: 'ground_truth.judgment',
      category: 'ordinaire',
      subjectType: 'market_memory_ground_truth_case',
      subjectLabel: typeof body.esnName === 'string' ? body.esnName : undefined,
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
