import { type NextRequest, NextResponse } from 'next/server'
import { csvDesProspects, nomFichierProspects } from '@/app/prospects/prospects-export.logic'
import { fetchDemoLeads } from '@/lib/demo-leads'
import { exigerCapacite } from '@/lib/guard'
import { journaliserAudit } from '@/lib/journal-audit'

export const dynamic = 'force-dynamic'

/**
 * #4387 — EXPORT CSV DES PROSPECTS (Louis, 20/10/2026).
 *
 * Seule exception à `aucun-export-de-donnees-personnelles.test.ts` (#1670.5),
 * inscrite par CHEMIN EXACT : les prospects ont rempli le formulaire d'accès à
 * la démo pour être recontactés. Aucun autre export n'est autorisé ici.
 *
 * Même autorisation que la liste (`leads.read`) — vérifiée ICI, pas seulement à
 * l'écran. TOUTES les lignes que la liste lit (`fetchDemoLeads`, plus récent
 * d'abord) : l'écran n'a ni filtre ni pagination.
 *
 * ⚠️ Le journal d'audit (catégorie `export`) reçoit QUI, QUAND (la ligne est
 * datée) et COMBIEN — jamais une donnée du fichier.
 */
export async function GET(req: NextRequest) {
  // #4387 — le rôle se vérifie ICI, pas seulement à l’écran.
  const refus = await exigerCapacite(req, 'leads.read')
  if (refus) return refus

  let leads
  try {
    leads = await fetchDemoLeads()
  } catch (err) {
    // Une panne n'est pas « zéro prospect » : pas de fichier vide, une erreur claire.
    return NextResponse.json(
      { ok: false, error: `Prospects indisponibles. ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    )
  }

  // #4387 — chaque export est tracé : combien de lignes, jamais lesquelles.
  await journaliserAudit(req, {
    operation: 'prospects.export',
    category: 'export',
    subjectType: 'prospects',
    statusCode: 200,
    detail: `${leads.length} ligne(s) exportée(s) en CSV`,
  })

  return new NextResponse(csvDesProspects(leads), {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${nomFichierProspects(new Date())}"`,
      'cache-control': 'no-store',
      'x-export-rows': String(leads.length),
    },
  })
}
