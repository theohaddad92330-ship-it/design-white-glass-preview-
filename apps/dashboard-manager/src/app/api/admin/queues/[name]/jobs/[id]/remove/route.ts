import { type NextRequest, NextResponse } from 'next/server'
import { adminMutate } from '@/lib/admin'
import { actorFromRequest } from '@/lib/operator'
import { exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

// Server-side proxy: remove a job from a queue. Forwards to
// POST /internal/admin/queues/:name/jobs/:id/remove with the internal secret
// (which never reaches the browser). The API validates the queue name against
// its allowlist and audit-logs the mutation with the forwarded operator `actor`.
export async function POST(req: NextRequest, props: { params: Promise<{ name: string; id: string }> }) {
  const params = await props.params
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'queues.write')
  if (refus) return refus

  try {
    const { status, data } = await adminMutate(
      'POST',
      `/queues/${encodeURIComponent(params.name)}/jobs/${encodeURIComponent(params.id)}/remove`,
      { actor: await actorFromRequest(req) },
    )
    // #1666 — le journal d’audit unique : Qui · Quoi · Sur quoi · Quand ·
    // Depuis où · Résultat. Le résultat se DÉDUIT du code rendu (2xx = réussi,
    // 4xx = refusé, 5xx = échec) : un refus n’est pas une panne.
    await journaliserAudit(req, {
      operation: 'queues.job_remove',
      category: 'suppression',
      subjectType: 'queue_job',
      subjectId: params.id,
      subjectLabel: params.name,
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
