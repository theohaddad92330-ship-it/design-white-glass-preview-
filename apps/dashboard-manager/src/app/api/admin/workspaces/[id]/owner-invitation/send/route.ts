import { type NextRequest, NextResponse } from 'next/server'
import { adminMutate } from '@/lib/admin'
import { exigerCapacite, operateurDeLaRequete } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

// Server-side proxy: envoyer (ou relancer, #2643.3) l'e-mail d'activation du
// propriétaire. Forwards to POST /internal/admin/workspaces/:id/owner-invitation
// /send avec le secret interne. Décision Louis 20/09/2026 : « l'envoi garde un
// geste opérateur » — ce bouton EST ce geste, il n'y en a pas d'autre.
//
// ⚠️ `actorEmail` vient de la SESSION, jamais du corps posté par le navigateur
// — même garde que `avecAuteur` (voir `api/admin/clients/provision/route.ts`).
// Ici, contrairement au provisionnement, une identité INCONNUE REFUSE l'envoi
// plutôt que de continuer sans auteur : un e-mail RÉEL part vers un vrai
// client, il lui faut un auteur attribuable.

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'clients.owner_invitation.send')
  if (refus) return refus

  const operateur = await operateurDeLaRequete(req)
  if (!operateur) {
    return NextResponse.json(
      { ok: false, error: 'Identification de l’opérateur requise pour envoyer cet e-mail.' },
      { status: 401 },
    )
  }

  try {
    const { status, data } = await adminMutate(
      'POST',
      `/workspaces/${encodeURIComponent(params.id)}/owner-invitation/send`,
      { actorEmail: operateur.email },
    )
    // #1666 — le journal d’audit unique : Qui · Quoi · Sur quoi · Quand ·
    // Depuis où · Résultat. Le résultat se DÉDUIT du code rendu.
    await journaliserAudit(req, {
      operation: 'clients.owner_invitation.send',
      category: 'permission',
      subjectType: 'workspace',
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
