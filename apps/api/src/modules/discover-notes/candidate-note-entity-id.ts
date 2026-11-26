import { createHash } from 'node:crypto'

/**
 * `entity_id` (uuid) DÉRIVÉ, de façon stable, de (espace, siren) — jamais un
 * identifiant aléatoire : deux appels pour le même candidat du même espace
 * doivent toujours retrouver la MÊME ligne. Namespacé par l'espace pour que
 * deux espaces différents portant le même SIREN (deux ESN qui regardent la
 * même cible) n'entrent jamais en collision.
 *
 * GA-07 — cette dérivation vivait dans `discover-candidate-notes.service.ts`,
 * et `DemoSeedService` (module `demo/`) l'importait pour semer la note
 * d'exemple du candidat Découvrir — un import service→service de plus au
 * cliquet (18/09/2026, vague M) pour une fonction PURE, sans injection, sans
 * état, qui n'a rien d'un couplage entre deux domaines. Un contrat partagé
 * (ce fichier, jamais nommé `*.service.ts`) est l'issue nommée par la garde :
 * `demo-seed.service.ts` importe désormais CETTE dérivation, pas le service.
 * `discover-candidate-notes.service.ts` la réexporte pour ses propres
 * appelants (`candidateNoteEntityId` reste public au même endroit).
 */
export function candidateNoteEntityId(workspaceId: string, siren: string): string {
  const hash = createHash('sha256').update(`discover-candidate:${workspaceId}:${siren}`).digest('hex')
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `${((Number.parseInt(hash[16], 16) & 0x3) | 0x8).toString(16)}${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join('-')
}
