import { mergeConfig } from 'vitest/config'
import shared from '@bellum/tooling/configs/vitest'

/**
 * La porte du consentement lit `document.cookie` : ses tests ont besoin d'un
 * DOM, et de l'extension `.tsx` pour le composant de garde.
 */
export default mergeConfig(shared, {
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
