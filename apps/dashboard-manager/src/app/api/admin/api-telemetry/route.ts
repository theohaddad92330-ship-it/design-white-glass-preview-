import { type NextRequest, NextResponse } from 'next/server'
import { apiTelemetrySnapshot } from '@/lib/admin'
import { exigerCapacite } from '@/lib/guard'

// #1667.3 — le volume par endpoint et le p95, pour la page « API ».
//
// Même capacité que le testeur de requêtes de cette même page (`/api/run`,
// `analyses.run`) : ce n'est pas un nouveau geste, c'est le même écran qui en
// sait un peu plus. Rien n'est proxifié vers `apps/api` ici — `apiTelemetrySnapshot`
// lit le tampon EN MÉMOIRE que `adminGet`/`adminMutate` remplissent déjà à
// chaque appel admin (voir le docblock dans `src/lib/admin.ts`).

export async function GET(req: NextRequest) {
  const refus = await exigerCapacite(req, 'analyses.run')
  if (refus) return refus

  return NextResponse.json({ endpoints: apiTelemetrySnapshot() })
}
