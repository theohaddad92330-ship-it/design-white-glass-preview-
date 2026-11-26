import { fileURLToPath } from 'node:url'
import { mergeConfig } from 'vitest/config'
import shared from '@bellum/tooling/configs/vitest'

/**
 * Le site n'avait AUCUN test.
 *
 * Tant qu'il ne servait que des pages statiques, c'était défendable. Le chatbot
 * Laura y ajoute du code qui DÉCIDE — ce qui atteint le modèle, ce qui en sort,
 * où l'on envoie un visiteur — et ce code-là ne peut pas partir sans filet : le
 * rapport du 17/08 en fait même une exigence de mise en production (§10, la
 * batterie adversariale).
 *
 * Configuration partagée du dépôt, plus l'alias `@/` de Next : sans lui, un
 * module qui importe `@/i18n/routing` passe le typecheck et échoue à
 * l'exécution des tests — c'est-à-dire exactement là où on croyait être couvert.
 */
export default mergeConfig(shared, {
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
