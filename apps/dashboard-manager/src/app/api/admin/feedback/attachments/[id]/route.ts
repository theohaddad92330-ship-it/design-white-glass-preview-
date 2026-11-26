import { type NextRequest, NextResponse } from 'next/server'
import { exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

/**
 * #1792 — LES PIÈCES JOINTES D'UN RETOUR, demandées à l'ouverture — le même
 * modèle EXACT que `capture/[id]/route.ts` pour la capture d'écran.
 *
 * `client_context.attachments` (nom + lien GitHub, jamais le contenu) est
 * écrit en base depuis #1792 et n'était lu par AUCUN écran — une colonne
 * écrite que personne ne lit, le défaut n°1 de ce dépôt.
 *
 * ⚠️ Une pièce jointe peut porter une donnée personnelle (la capture d'un
 * écran client) : elle passe donc par la MÊME porte que le reste de la
 * console (`feedback.read`), et le lien ne voyage pas dans la liste — la
 * liste ne dit que `has_attachments`, exactement comme `has_screenshot`.
 *
 * ⚠️ Segment statique `attachments`, comme `capture` : deux ressources
 * différentes (une capture, un lot de pièces) ne partagent pas un préfixe
 * dynamique — voir la note de `capture/[id]/route.ts` sur l'erreur que Next
 * nomme au build (« different slug names for the same dynamic path »).
 *
 * #2444.12 — même trace que `capture/[id]` : un GET sur une donnée personnelle
 * (le nom d'une pièce jointe et son lien) n'est plus silencieux, même porte
 * (`journaliserAudit`) que la révélation d'email (#1670.4).
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params
  // Une pièce jointe de client est une donnée personnelle : même porte que le
  // reste de la console.
  const refus = await exigerCapacite(req, 'feedback.read')
  if (refus) return refus

  const base = process.env['API_BASE_URL']
  const secret = process.env['INTERNAL_API_SECRET']
  if (!base || !secret) {
    return NextResponse.json({ ok: false, error: 'API non configurée côté serveur.' }, { status: 503 })
  }

  try {
    const res = await fetch(`${base}/internal/feedback/${encodeURIComponent(params.id)}/attachments`, {
      headers: { 'x-internal-secret': secret },
      cache: 'no-store',
    })
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `API a répondu ${res.status}.` }, { status: res.status })
    }
    const data = (await res.json()) as { attachments?: { name: string; url: string | null }[] | null }
    // `null` n'est pas une erreur : « ce retour n'existe pas » se lit ainsi,
    // exactement comme `screenshot_url: null` sur la capture.
    const attachments = data.attachments ?? null
    // #2444.12 — l'accès à une donnée personnelle ne reste jamais silencieux.
    await journaliserAudit(req, {
      operation: 'feedback.attachments_view',
      category: 'ordinaire',
      subjectType: 'beta_feedback',
      subjectId: params.id,
      statusCode: res.status,
      detail:
        attachments && attachments.length > 0 ? `${attachments.length} pièce(s) consultée(s)` : 'Aucune pièce jointe',
    })
    return NextResponse.json({ ok: true, attachments })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `API injoignable. ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    )
  }
}
