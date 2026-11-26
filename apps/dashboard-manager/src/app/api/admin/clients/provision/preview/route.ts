import { type NextRequest, NextResponse } from 'next/server'
import { adminMutate } from '@/lib/admin'
import { exigerCapacite } from '@/lib/guard'

// L'APERÇU des six étapes, avant validation (#1665, règle 3 · T2).
//
// Même proxy que la route sœur, même secret interne, même zod côté API — un
// aperçu validé plus largement que l'écriture décrirait une opération que la
// validation refuserait ensuite, et l'opérateur confirmerait un récapitulatif
// faux.
//
// ⚠️ MÊME CAPACITÉ QUE L'ÉCRITURE, ET C'EST DÉLIBÉRÉ. Cet aperçu n'écrit rien,
// mais il RÉPOND : « ce compte existe déjà », « il porte un abonnement Stripe »,
// « cet espace s'appelle Mon espace ». C'est un oracle d'existence de comptes,
// à travers tous les clients. Le donner à un `viewer` reviendrait à lui offrir
// la moitié de l'information de l'écran qu'on lui refuse.
//
// ⚠️ AUCUN `actor` N'EST TRANSMIS ICI, contrairement à la route d'écriture : un
// aperçu ne s'inscrit pas au journal d'audit des OPÉRATIONS. Le journal d'accès
// du back-office (#1671.2) couvre déjà « qui est entré, et ce qui lui a été
// refusé » ; ajouter chaque brouillon de formulaire au journal des opérations
// noierait les vraies écritures sous les répétitions d'un même geste.

export async function POST(req: NextRequest) {
  const refus = await exigerCapacite(req, 'clients.provision')
  if (refus) return refus

  const body = (await req.json().catch(() => null)) as unknown
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, error: 'Corps de requête invalide.' }, { status: 400 })
  }
  try {
    const { status, data } = await adminMutate('POST', '/clients/provision/preview', body)
    return NextResponse.json(data, { status })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `API injoignable. ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    )
  }
}
