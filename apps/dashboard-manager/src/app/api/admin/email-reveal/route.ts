import { journaliserAcces } from '@/lib/auth-routes'
import { NextResponse, type NextRequest } from 'next/server'
import { actorFromRequest } from '@/lib/operator'
import { exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

/**
 * Journalise la RÉVÉLATION d'une adresse masquée (#1670.4 — « et le clic est
 * journalisé »).
 *
 * ⚠️ CE QUI N'EST PAS ÉCRIT : l'adresse elle-même. Le journal reçoit la forme
 * MASQUÉE et le contexte (l'écran d'où vient le clic). Écrire l'adresse en clair
 * dans un journal pour tracer qu'on l'a affichée déplacerait la fuite au lieu de
 * la fermer — c'est la même règle que le masquage avant export de Langfuse.
 *
 * ⚠️ MISE À JOUR DU 07/09/2026 — LE JOURNAL D'AUDIT UNIQUE EXISTE (#1666).
 * Ce docblock annonçait : « Quand le journal d'audit unique de #1666 existera,
 * cette route y écrira à la place. » C'est fait. La révélation part désormais
 * dans `journaliserAudit` — la porte du journal unique — en plus du journal
 * d'ACCÈS, qui reste la source de l'alerte de #1671.3 et garde sa rétention de
 * douze mois.
 *
 * ⚠️ ET ELLE N'EST PAS MIROITÉE, pour ne pas produire deux lignes pour un clic :
 * `access-event-audit.ts` exclut explicitement `email_revele` du miroir, parce
 * que l'écriture d'ici est PLUS RICHE — elle porte l'écran d'où vient le clic et
 * la forme masquée de l'adresse, que le journal d'accès ne transporte pas.
 *
 * La réponse reste 204 : le journal ne bloque jamais un geste de support.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest): Promise<NextResponse> {
  // #1669 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'email.reveal')
  if (refus) return refus

  const actor = await actorFromRequest(req)
  let context = 'inconnu'
  let masked = '****'
  try {
    const body = (await req.json()) as { context?: unknown; masked?: unknown }
    if (typeof body.context === 'string') context = body.context.slice(0, 120).replace(/[\r\n]/g, ' ')
    if (typeof body.masked === 'string') masked = body.masked.slice(0, 120).replace(/[\r\n]/g, ' ')
  } catch {
    /* corps illisible — on journalise quand même le fait, sans inventer */
  }
  // ⚠️ Idem `guard.ts` : cette ligne recopiait `console.warn(JSON.stringify(…))`
  // au lieu de passer par la porte du journal, et cette révélation n'apparaissait
  // donc nulle part dans le journal d'accès (#1671.2). C'est pourtant l'un des
  // gestes que #1670.4 demande précisément de tracer.
  //
  // ⚠️ SEULE LA FORME MASQUÉE VOYAGE. `masked` est le `m****@societe.com` déjà
  // affiché ; l'adresse en clair ne sort pas d'ici, ni dans le journal, ni dans
  // la réponse. Tracer la révélation ne doit pas être un second chemin par
  // lequel l'adresse s'écrit quelque part.
  journaliserAcces('email_revele', req, { actorEmail: actor, target: context, detail: masked })

  // #1666 — LE JOURNAL UNIQUE. C'est l'écriture que ce fichier attendait depuis
  // #1670.4 (« quand celui-ci existera, cette route y écrira »).
  //
  // ⚠️ SEULE LA FORME MASQUÉE VOYAGE, ici comme dans le journal d'accès.
  // `subjectLabel` porte le `m****@societe.com` déjà affiché à l'écran ;
  // l'adresse en clair ne sort pas d'ici. Tracer une révélation ne doit pas être
  // un second chemin par lequel l'adresse s'écrit quelque part.
  //
  // ⚠️ Catégorie `ordinaire` : révéler une adresse qu'on a déjà le droit de voir
  // est un geste de support, pas un export ni un changement de permission. Elle
  // se garde 24 mois — assez pour répondre à « qui a consulté cette fiche ? ».
  await journaliserAudit(req, {
    operation: 'email.reveal',
    category: 'ordinaire',
    outcome: 'succes',
    subjectType: 'email',
    subjectLabel: masked,
    statusCode: 204,
    detail: `Révélée depuis ${context}`,
  })

  return new NextResponse(null, { status: 204 })
}
