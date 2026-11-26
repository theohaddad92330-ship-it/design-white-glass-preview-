import type { OverlaySpec } from '../types'
import { APP_A_L_OVERLAYS } from './app-a-l'
import { APP_M_Z_OVERLAYS } from './app-m-z'
import { APP_OVERLAYS } from './app'
import { DM_OVERLAYS } from './dm'
import { SITE_OVERLAYS } from './site'

/**
 * Le registre de TOUTES les surcouches maquettées (modales, confirmations, panneaux, menus,
 * info-bulles, toasts). L'inventaire du code est `inventory.md`, à côté : une surcouche
 * inventoriée a une spec ici, ou sa raison d'attendre y est écrite.
 */
export const OVERLAYS: readonly OverlaySpec[] = [
  ...APP_OVERLAYS,
  ...APP_A_L_OVERLAYS,
  ...APP_M_Z_OVERLAYS,
  ...SITE_OVERLAYS,
  ...DM_OVERLAYS,
]
