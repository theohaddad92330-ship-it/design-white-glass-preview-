import { type NextRequest, NextResponse } from 'next/server'
import { exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

/**
 * La capture d'UN retour, demandée à l'ouverture — la moitié qui rend la liste
 * légère.
 *
 * MESURÉ EN PRODUCTION LE 07/09/2026
 * L'écran des retours rendait **34,7 Mo d'HTML** en 5,6 s, dont **32,6 Mo —
 * 94 % du poids** — de captures d'écran en base64 inlinées : une par retour,
 * 181 en tout, TOUTES dans un `<details>` replié que personne n'ouvre. La page
 * suivante la plus lourde de la console fait 391 Ko.
 *
 * Le coût ne venait pas de l'affichage mais du TRANSPORT : `FeedbackCard` est un
 * composant client, et Next sérialise l'intégralité de ses props dans la charge
 * utile — ne pas rendre l'`<img>` n'aurait donc rien économisé. C'est la donnée
 * qui devait cesser de voyager, pas la balise.
 *
 * La liste dit maintenant QU'IL Y EN A UNE (`has_screenshot`) ; l'image se
 * demande ici, une par une, quand quelqu'un ouvre le pli.
 *
 * ⚠️ POURQUOI `capture/[id]` ET NON `[id]/screenshot`.
 * La première version était `feedback/[id]/screenshot`, à côté des existants
 * `feedback/[number]/comments` et `feedback/[number]/state` — et `next build`
 * l'a refusée : « You cannot use different slug names for the same dynamic
 * path ('id' !== 'number') ». Ce n'était pas une contrariété d'outil, c'était
 * une erreur de modélisation que Next a nommée : `[number]` est le numéro
 * d'issue GITHUB, `[id]` est l'identifiant de la LIGNE en base. Deux ressources
 * différentes ne partagent pas un préfixe dynamique. Le segment statique
 * `capture` les sépare, et dit lequel des deux on adresse.
 *
 * ⚠️ Ni `vitest`, ni `tsc --noEmit`, ni `eslint` ne voient cette erreur : elle
 * n'existe qu'au moment où Next construit sa table de routes.
 *
 * #2444.12 — UN GET SUR UNE DONNÉE PERSONNELLE N'EST PLUS SILENCIEUX.
 * `journal-audit-a-des-ecrivains.test.ts` n'exige la porte que sur les verbes
 * MUTANTS (« GET lit ; il n'a rien à journaliser ») — un choix juste pour la
 * mutation, mais qui laissait sans trace la lecture d'une capture d'écran
 * CLIENT : un accès à une donnée personnelle minimale (une seule ligne, par
 * son id), jamais journalisé. Même porte, même catégorie que la révélation
 * d'email (#1670.4, `email-reveal/route.ts`) : le geste de support reste
 * permis, il cesse seulement d'être invisible.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params
  // Une capture d'écran de client est une donnée personnelle : elle passe par
  // la même porte que le reste de la console.
  const refus = await exigerCapacite(req, 'feedback.read')
  if (refus) return refus

  const base = process.env['API_BASE_URL']
  const secret = process.env['INTERNAL_API_SECRET']
  if (!base || !secret) {
    return NextResponse.json({ ok: false, error: 'API non configurée côté serveur.' }, { status: 503 })
  }

  try {
    const res = await fetch(`${base}/internal/feedback/${encodeURIComponent(params.id)}/screenshot`, {
      headers: { 'x-internal-secret': secret },
      cache: 'no-store',
    })
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `API a répondu ${res.status}.` }, { status: res.status })
    }
    const data = (await res.json()) as { screenshot_url?: string | null }
    // `null` n'est pas une erreur : « ce retour n'a pas de capture » est une
    // réponse, et l'écran sait l'afficher plutôt que de tourner indéfiniment.
    const screenshotUrl = data.screenshot_url ?? null
    // #2444.12 — l'accès à une donnée personnelle ne reste jamais silencieux.
    await journaliserAudit(req, {
      operation: 'feedback.screenshot_view',
      category: 'ordinaire',
      subjectType: 'beta_feedback',
      subjectId: params.id,
      statusCode: res.status,
      detail: screenshotUrl ? 'Capture consultée' : 'Aucune capture pour ce retour',
    })
    return NextResponse.json({ ok: true, screenshotUrl })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `API injoignable. ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    )
  }
}
