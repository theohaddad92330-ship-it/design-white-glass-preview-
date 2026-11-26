import type { WorkspaceProfile } from '@bellum/contracts'
import { DEMO_FORFAIT_DOSSIERS, DEMO_FORFAIT_FRAMED_OPPORTUNITY, DEMO_FORFAIT_PROJECTS } from './demo-forfait-dataset'
import { computeDemoSeedFingerprint, DEMO_SEED_FINGERPRINT } from './demo-seed-fingerprint'

/**
 * #4291 (lot J, décision Louis 21/10) — LES DEUX ESPACES DÉMO : le profil staffing historique et le profil
 * « forfait / conseil » (#4270). Une salle EST l'un ou l'autre, pour toute sa vie.
 *
 * Pas de second moteur : même pool (`DemoPoolService`), même remise à neuf (`DemoResetService`), même semis
 * (`DemoSeedService.seedWorkspace`), paramétrés par la variante. Pas de colonne neuve non plus : la variante se
 * lit sur le NUMÉRO de salle (`workspaces.demo_slot_index`, déjà unique) — au-delà de
 * {@link DEMO_FORFAIT_SLOT_BASE}, la salle est forfait. Une salle ne change jamais de numéro, donc jamais de
 * variante ; la purge (scopée par espace) ne peut donc pas mélanger les deux jeux.
 */
export type DemoRoomVariant = WorkspaceProfile

/** Les salles staffing sont numérotées 1..N (N = `DEMO_POOL_SIZE`, 8 par défaut) ; les salles forfait 1001.. */
export const DEMO_FORFAIT_SLOT_BASE = 1000

export function demoRoomVariantOf(slotIndex: number | null | undefined): DemoRoomVariant {
  return slotIndex != null && slotIndex > DEMO_FORFAIT_SLOT_BASE ? 'forfait_conseil' : 'staffing'
}

/** Le numéro de la `rank`-ième salle (1-indexé) d'une variante. */
export function demoSlotIndexFor(variant: DemoRoomVariant, rank: number): number {
  return variant === 'forfait_conseil' ? DEMO_FORFAIT_SLOT_BASE + rank : rank
}

/** Le rang d'une salle DANS sa variante (« Démo Bellum forfait 2 » pour la salle 1002). */
export function demoRoomRank(slotIndex: number): number {
  return demoRoomVariantOf(slotIndex) === 'forfait_conseil' ? slotIndex - DEMO_FORFAIT_SLOT_BASE : slotIndex
}

/**
 * L'empreinte de semis attendue d'une salle de cette variante. Staffing : {@link DEMO_SEED_FINGERPRINT}, à
 * l'octet — la démo actuelle ne change pas. Forfait : la même, PLUS le jeu forfait ; changer l'un ou l'autre
 * périme la salle forfait, qui est alors re-semée hors requête comme toute salle périmée (#3135).
 */
const DEMO_FORFAIT_SEED_FINGERPRINT = computeDemoSeedFingerprint(`${DEMO_SEED_FINGERPRINT}|forfait_conseil`, [
  DEMO_FORFAIT_DOSSIERS,
  DEMO_FORFAIT_PROJECTS,
  DEMO_FORFAIT_FRAMED_OPPORTUNITY,
])

export function demoSeedFingerprintFor(variant: DemoRoomVariant): string {
  return variant === 'forfait_conseil' ? DEMO_FORFAIT_SEED_FINGERPRINT : DEMO_SEED_FINGERPRINT
}
