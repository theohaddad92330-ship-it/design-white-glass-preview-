import { type NextRequest, NextResponse } from 'next/server'
import { fetchOwnershipTransferPreview } from '@/lib/admin'
import { exigerCapacite } from '@/lib/guard'

// #4158.33 — l'APERÇU d'un transfert de propriété, avant validation : une LECTURE.
// Même capacité que l'écriture, délibérément : l'aperçu répond « ce transfert
// passerait » ou « il serait refusé parce que… » — un oracle sur la facturation
// d'un client qu'un `viewer` n'a pas à lire.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const refus = await exigerCapacite(req, 'workspaces.write')
  if (refus) return refus

  const newOwnerUserId = req.nextUrl.searchParams.get('newOwnerUserId') ?? ''
  if (!UUID.test(newOwnerUserId)) {
    return NextResponse.json({ ok: false, error: 'Choisis le nouveau propriétaire.' }, { status: 400 })
  }
  try {
    return NextResponse.json(await fetchOwnershipTransferPreview(params.id, newOwnerUserId))
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `API injoignable. ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    )
  }
}
