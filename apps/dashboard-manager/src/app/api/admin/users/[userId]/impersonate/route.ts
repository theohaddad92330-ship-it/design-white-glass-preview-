import {
  IMPERSONATION_REASON_CODES,
  type ImpersonationReasonCode,
  impersonationReasonDetailSchema,
} from '@bellum/contracts'
import { type NextRequest, NextResponse } from 'next/server'
import { adminMutate } from '@/lib/admin'
import { exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'
import { actorFromRequest } from '@/lib/operator'

// Server-side proxy: START an impersonation session for a user. Forwards to
// POST /internal/admin/users/:userId/impersonate with the internal secret (which
// never reaches the browser). The API mints a short-lived, read-only
// impersonation token and returns a web URL (token in the URL fragment) the
// operator opens to view the app AS the user. Called by the impersonate island
// on /users/[userId].
//
// SECURITY: the acting-admin attribution (`admin_actor`) is derived SERVER-SIDE
// — never trusted from the client — so the audit trail records the authenticated
// operator, not a value the browser could spoof.
//
// ⚠️ #1668 — c'est désormais l'E-MAIL AUTHENTIFIÉ qui signe, plus le nom d'un
// Basic Auth partagé à trois. Cette route portait sa PROPRE copie de la lecture
// d'en-tête (`operatorFromBasicAuth`, avec son repli `dm-operator`) pendant que
// `lib/operator.ts` en portait une autre : deux lectures du même fait, dont une
// seule aurait appris l'identité. Il n'en reste qu'une.

export async function POST(req: NextRequest, props: { params: Promise<{ userId: string }> }) {
  const params = await props.params
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'impersonate')
  if (refus) return refus

  // #1670 — le motif est un CODE de catalogue, plus un texte libre. Trois
  // valeurs, et rien d'autre ne passe : « un catalogue se lit ». La liste vient
  // des contrats, elle n'est pas recopiée ici — une liste recopiée diverge.
  const body = (await req.json().catch(() => ({}))) as { reason_code?: unknown; reason_detail?: unknown }
  const codeBrut = typeof body.reason_code === 'string' ? body.reason_code : ''
  if (!(IMPERSONATION_REASON_CODES as readonly string[]).includes(codeBrut)) {
    return NextResponse.json(
      { ok: false, error: 'Motif requis — choisis-en un dans la liste.', motifs: IMPERSONATION_REASON_CODES },
      { status: 400 },
    )
  }
  const reasonCode = codeBrut as ImpersonationReasonCode
  // LUDOVIC-D LC.10 — une précision libre FACULTATIVE à côté du code (même schéma que l'API).
  const detail = impersonationReasonDetailSchema.safeParse(body.reason_detail ?? '')
  if (!detail.success) {
    return NextResponse.json(
      { ok: false, error: 'Précision trop longue (300 caractères, une ligne).' },
      { status: 400 },
    )
  }

  try {
    const { status, data } = await adminMutate('POST', `/users/${encodeURIComponent(params.userId)}/impersonate`, {
      reason_code: reasonCode,
      ...(detail.data ? { reason_detail: detail.data } : {}),
      admin_actor: await actorFromRequest(req),
    })
    // #1666 — le journal d’audit unique : Qui · Quoi · Sur quoi · Quand ·
    // Depuis où · Résultat. Le résultat se DÉDUIT du code rendu (2xx = réussi,
    // 4xx = refusé, 5xx = échec) : un refus n’est pas une panne.
    await journaliserAudit(req, {
      operation: 'users.impersonate',
      category: 'impersonation',
      subjectType: 'user',
      subjectId: params.userId,
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
