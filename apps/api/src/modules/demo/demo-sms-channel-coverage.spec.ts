import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_INTENTIONALLY_EMPTY, DEMO_SEEDED_TABLES, DEMO_SMS_CHANNEL_COVERAGE } from './demo-coverage'

/**
 * #1938.4 — décision Louis 13/09 batch 13 : « et en démonstration, la section
 * SMS de Réglages › Notifications montre quoi ? »
 *
 * `notification_sms_channels` est scopée par `user_id` : la garde PAR TABLE
 * (`demo-coverage.spec.ts`, qui ne classe que les tables purgées d'un espace)
 * ne pose donc jamais la question. Ce fichier la pose, sur le même principe que
 * `demo-compatible-environments-coverage.spec.ts` — et il vérifie la seule
 * réponse qui tienne : AUCUN numéro n'est jamais écrit depuis une salle, parce
 * que chaque route du canal demande d'abord si c'en est une.
 */

const CONTROLLER = join(__dirname, '..', 'notifications', 'notifications.controller.ts')

/** Les cinq routes du canal SMS, par nom de méthode. */
const SMS_ROUTES = ['getSms', 'startSmsVerification', 'confirmSmsVerification', 'updateSmsTypes', 'withdrawSms']

/** Le corps d'une méthode de contrôleur : de sa signature au décorateur suivant. */
function methodBody(source: string, name: string): string {
  const start = source.indexOf(`  async ${name}(`)
  if (start < 0) return ''
  const next = source.indexOf('\n  @', start)
  return source.slice(start, next < 0 ? source.length : next)
}

describe('couverture démo — le canal SMS des alertes urgentes (#1938.4)', () => {
  const source = readFileSync(CONTROLLER, 'utf8')

  it('LIT le contrôleur réel, et y trouve les cinq routes du canal', () => {
    expect(source.length).toBeGreaterThan(0)
    for (const route of SMS_ROUTES) expect(methodBody(source, route).length).toBeGreaterThan(0)
  })

  it('chaque route SMS demande « est-ce une salle de démonstration ? » avant de toucher au canal', () => {
    const withoutTheQuestion = SMS_ROUTES.filter(route => !methodBody(source, route).includes('isDemoWorkspace'))
    expect(withoutTheQuestion).toEqual([])
  })

  it('sait dire NON — une route qui ne pose pas la question est détectée (témoin)', () => {
    const tampered = [
      "  @Get('sms')",
      '  async getSms(user) {',
      '    return this.sms.getSettings(user.userId, false)',
      '  }',
      '',
      "  @Patch('sms')",
      '  async updateSmsTypes(user, dto) {',
      '    const isDemo = await this.workspaceContext.isDemoWorkspace(user.userId)',
      '  }',
    ].join('\n')
    expect(methodBody(tampered, 'getSms')).not.toContain('isDemoWorkspace')
    expect(methodBody(tampered, 'updateSmsTypes')).toContain('isDemoWorkspace')
  })

  it('classe la section « vide à dessein », et la raison nomme la table, la garde et le fournisseur absent', () => {
    expect(DEMO_SMS_CHANNEL_COVERAGE.state).toBe('vide_a_dessein')
    for (const cause of ['notification_sms_channels', 'isDemoWorkspace', 'fournisseur', 'Bientôt disponible']) {
      expect(DEMO_SMS_CHANNEL_COVERAGE.reason).toContain(cause)
    }
    expect(DEMO_SMS_CHANNEL_COVERAGE.reason.length).toBeGreaterThan(200)
  })

  it('n’attrape pas ce qu’elle ne vise pas — la table n’est ni seedée, ni rangée parmi les tables purgées d’un espace', () => {
    expect(DEMO_SEEDED_TABLES).not.toContain('notification_sms_channels')
    expect(Object.keys(DEMO_INTENTIONALLY_EMPTY)).not.toContain('notification_sms_channels')
  })
})
