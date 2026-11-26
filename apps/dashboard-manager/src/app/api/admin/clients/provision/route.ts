import { type NextRequest, NextResponse } from 'next/server'
import { adminMutate } from '@/lib/admin'
import { exigerCapacite, operateurDeLaRequete } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

// Server-side proxy: provision an invoice-billed client (ESN + owner + team +
// plan + terms). Forwards to POST /internal/admin/clients/provision with the
// internal secret, which never reaches the browser.
//
// The body is passed through as-is: the API validates it with zod
// (`provisionClientSchema`), which is the single source of truth. Re-validating
// the whole shape here would just be a second copy to drift — unlike the plan
// route, which guards one enum. Errors come back with the upstream status so the
// form can show the API's own message (« Sièges épuisés », « abonnement Stripe
// actif », …) rather than a generic failure.
//
// ⚠️ UNE SEULE EXCEPTION AU « TEL QUEL » : `actor` (#1665, règle 4). Voir
// `avecAuteur` plus bas.

/**
 * Réécrit l'auteur de l'opération à partir de la SESSION, et jamais du corps.
 *
 * ⚠️ Le champ est ÉCRASÉ, pas complété : un navigateur qui poste
 * `actor: {email: "theo@…", role: "owner"}` signerait le journal d'audit au nom
 * de quelqu'un d'autre. Une identité qui vient du client n'est pas une identité,
 * c'est une déclaration — c'est la raison pour laquelle `exigerCapacite` relit
 * déjà le cookie signé au lieu de croire un en-tête.
 *
 * `null` quand la couche d'identité est éteinte (`DM_ALLOWED_EMAILS` absente) :
 * la clé est alors RETIRÉE, et l'API journalise « opérateur non identifié », ce
 * qui est vrai, plutôt qu'un nom deviné.
 */
async function avecAuteur(req: NextRequest, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { actor: _ignore, ...reste } = body
  const operateur = await operateurDeLaRequete(req)
  return operateur ? { ...reste, actor: { email: operateur.email, role: operateur.role } } : reste
}

async function lireCorps(req: NextRequest): Promise<Record<string, unknown> | null> {
  const body = (await req.json().catch(() => null)) as unknown
  if (!body || typeof body !== 'object') return null
  return body as Record<string, unknown>
}

export async function POST(req: NextRequest) {
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'clients.provision')
  if (refus) return refus

  const body = await lireCorps(req)
  if (!body) {
    return NextResponse.json({ ok: false, error: 'Corps de requête invalide.' }, { status: 400 })
  }
  try {
    const { status, data } = await adminMutate('POST', '/clients/provision', await avecAuteur(req, body))
    // #1666 — le journal d’audit unique : Qui · Quoi · Sur quoi · Quand ·
    // Depuis où · Résultat. Le résultat se DÉDUIT du code rendu (2xx = réussi,
    // 4xx = refusé, 5xx = échec) : un refus n’est pas une panne.
    //
    // ⚠️ Les DEUX chemins sont nécessaires et ne font pas double emploi :
    // `avecAuteur` fait voyager l'identité jusqu'à l'API, qui journalise le
    // DÉTAIL des six étapes (#1665) ; `journaliserAudit` écrit la ligne de la
    // CONSOLE, celle qui dit qu'un opérateur a appuyé sur le bouton. Retirer
    // l'une laisserait soit un geste sans détail, soit un détail sans geste.
    await journaliserAudit(req, {
      operation: 'clients.provision',
      category: 'permission',
      subjectType: 'workspace',
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
