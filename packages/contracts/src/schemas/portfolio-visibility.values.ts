import { z } from 'zod'

/**
 * Les deux valeurs du cloisonnement, dans un module FEUILLE.
 *
 * Elles vivaient dans `portfolio-visibility.ts`, qui importe `hasPermission`
 * de `workspace.ts` pour calculer sa portée. Le jour où `workspace.ts` a eu
 * besoin du schéma pour l'exposer EN LECTURE, le cycle s'est refermé :
 * `workspace.ts` → `portfolio-visibility.ts` → `workspace.ts`. En ESM un cycle
 * ne casse pas au chargement, il rend une valeur `undefined` — et l'erreur
 * sortait à des kilomètres de sa cause (« Cannot read properties of undefined
 * (reading 'default') »).
 *
 * Ce fichier n'importe QUE zod. Il ne peut donc participer à aucun cycle, et
 * les valeurs continuent de vivre à UN SEUL endroit — les recopier dans
 * `workspace.ts` aurait laissé deux listes diverger en silence.
 */
export const PORTFOLIO_VISIBILITIES = [
  /** Défaut historique : chaque membre voit tout le portefeuille de l'équipe. */
  'open',
  /** Chaque commercial voit son portefeuille et les comptes libres. */
  'restricted',
] as const

export const portfolioVisibilitySchema = z.enum(PORTFOLIO_VISIBILITIES)
export type PortfolioVisibility = (typeof PORTFOLIO_VISIBILITIES)[number]
