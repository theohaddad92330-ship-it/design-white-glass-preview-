import type { PageSpec } from '../types'
import { APP_PAGES } from './app'
import { DM_PAGES } from './dm'
import { SITE_PAGES } from './site'

/**
 * Le registre de TOUTES les pages maquettées. Une page qui n'est pas ici
 * n'existe pas pour le plugin. Ajouter une page = créer
 * `pages/<surface>/<slug>.ts` et l'ajouter au tableau de `pages/<surface>/index.ts`.
 */
export const PAGES: readonly PageSpec[] = [...APP_PAGES, ...SITE_PAGES, ...DM_PAGES]
