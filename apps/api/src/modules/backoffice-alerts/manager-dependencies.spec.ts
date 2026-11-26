import { dependencyPresence, isApiManagerDependencyId } from './manager-dependencies'

describe('isApiManagerDependencyId', () => {
  it('sait dire NON — un identifiant inventé est refusé', () => {
    expect(isApiManagerDependencyId('vercel')).toBe(false)
    expect(isApiManagerDependencyId('n’importe quoi')).toBe(false)
  })

  it('reconnaît les trois dépendances côté API', () => {
    expect(isApiManagerDependencyId('stripe')).toBe(true)
    expect(isApiManagerDependencyId('resend')).toBe(true)
    expect(isApiManagerDependencyId('slack')).toBe(true)
  })
})

describe('dependencyPresence — présence seulement, jamais une valeur', () => {
  it('tout absent → tout non configuré', () => {
    expect(dependencyPresence({})).toEqual([
      { id: 'stripe', configured: false },
      { id: 'resend', configured: false },
      { id: 'slack', configured: false },
    ])
  })

  it('tout présent → tout configuré, et rien de la clé ne fuit dans le résultat', () => {
    const result = dependencyPresence({
      stripeSecretKey: 'sk_test_super_secret',
      resendApiKey: 're_super_secret',
      slackWebhookUrl: 'https://hooks.slack.test/super-secret-path',
    })
    expect(result).toEqual([
      { id: 'stripe', configured: true },
      { id: 'resend', configured: true },
      { id: 'slack', configured: true },
    ])
    expect(JSON.stringify(result)).not.toContain('secret')
  })
})
