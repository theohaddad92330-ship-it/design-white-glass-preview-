import { type NextRequest, NextResponse } from 'next/server'
import { declareModelRoutingEvalSchema } from '@bellum/contracts'
import { adminMutate } from '@/lib/admin'
import { acteurDepuisBasicAuth, exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

// Server-side proxy : pose ou corrige la déclaration qu'UNE destination de routage fournisseur a
// été réévaluée (#2975, #2440.82) — relaie vers POST /internal/admin/model-routing/evals avec le
// secret interne. Avant cette route, le SEUL geste pour déclarer passait par la variable d'env
// `LLM_ROUTING_EVALS_PASSED` posée au déploiement ; appelée par `ModelRoutingPanel` (/health).
// `declaredBy` vient de l'identité Basic-Auth de l'opérateur, JAMAIS d'un champ du formulaire —
// même geste que `/analyses/[id]/stop`.

export async function POST(req: NextRequest) {
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'model_routing.write')
  if (refus) return refus

  const parsed = declareModelRoutingEvalSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Déclaration invalide : une destination (texte non vide) et une note facultative.' },
      { status: 400 },
    )
  }
  try {
    const { status, data } = await adminMutate('POST', '/model-routing/evals', {
      destinationKey: parsed.data.destinationKey,
      declaredBy: acteurDepuisBasicAuth(req),
      note: parsed.data.note ?? null,
    })
    await journaliserAudit(req, {
      operation: 'model_routing.evals.declare',
      category: 'ordinaire',
      subjectType: 'model_routing_destination',
      subjectId: parsed.data.destinationKey,
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
