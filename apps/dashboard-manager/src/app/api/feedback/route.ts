import { type NextRequest, NextResponse } from 'next/server'
import { reportIssue, type BackofficeReport } from '@/lib/feedback'
import { actorFromRequest } from '@/lib/operator'
import { exigerCapacite } from '@/lib/guard'

/**
 * Le signalement d'un opérateur, relayé vers l'API.
 *
 * ⚠️ **Le nom de l'opérateur est relu de l'en-tête Basic Auth ICI**, jamais pris
 * du corps de la requête. Le back-office est derrière une authentification
 * Basic (`middleware.ts`) : c'est elle qui sait qui parle. Un nom envoyé par la
 * page serait un champ que n'importe qui remplit, donc une signature qui ne
 * signe rien.
 *
 * ⚠️ Le secret interne ne quitte pas le serveur — même motif que
 * `/api/launch` et `/api/admin`.
 */
export async function POST(req: NextRequest) {
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'issue.report')
  if (refus) return refus

  const body = (await req.json().catch(() => ({}))) as Partial<BackofficeReport>
  const message = (body.message ?? '').trim()
  if (!message) {
    return NextResponse.json({ ok: false, error: 'Décris ce que tu as vu.' }, { status: 400 })
  }
  const category = body.category === 'metier' || body.category === 'autre' ? body.category : 'bug'

  // ⚠️ Tout le contexte capturé est relayé TEL QUEL — capture d'écran, zone
  // pointée, appels en échec, fil des gestes, état de la console. La première
  // version n'en relayait que cinq champs : le navigateur capturait le reste et
  // la porte le jetait en silence. Une porte plus étroite que ce qu'on lui
  // envoie est un chemin d'écriture qui n'existe pas.
  const { status, ok, data } = await reportIssue({
    ...body,
    category,
    message,
    operator: await actorFromRequest(req),
  })

  if (!ok) {
    const error =
      (data as { message?: string; error?: string } | null)?.error ??
      (data as { message?: string } | null)?.message ??
      `L’API a répondu ${status}.`
    return NextResponse.json({ ok: false, error }, { status: status >= 400 ? status : 502 })
  }

  // ⚠️ Le numéro d'issue est RENDU, et il vaut `null` quand GitHub a refusé.
  // L'écran doit pouvoir dire « c'est enregistré, mais aucune issue n'a été
  // ouverte » plutôt qu'annoncer une issue qui n'existe pas.
  const created = data as { github_issue_number?: number | null; github_issue_url?: string | null }
  return NextResponse.json({
    ok: true,
    issueNumber: created.github_issue_number ?? null,
    issueUrl: created.github_issue_url ?? null,
  })
}
