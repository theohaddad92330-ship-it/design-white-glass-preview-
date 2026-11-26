import {
  ALERT_KIND_CHANNEL,
  ALERT_KIND_LABEL,
  ANTI_REPEAT_MS,
  antiRepeatMsFor,
  providerSilentAlert,
  providerUnusedAlert,
  renderAlert,
  resolveChannel,
} from './backoffice-alert-dispatch'
import { BackofficeAlertsController } from './backoffice-alerts.controller'
import { BackofficeAlertsService } from './backoffice-alerts.service'
import { providerSilentSchema } from './dto/provider-silent.dto'
import { providerUnusedSchema } from './dto/provider-unused.dto'

/**
 * SIG-C (11/10) C4 — « source muette » : un fournisseur EN ERREUR sur N appels
 * consécutifs (compteur Redis côté IA, remis à zéro au premier succès) devient
 * une alerte OPÉRATEUR. Zéro résultat n'est pas une erreur — c'est l'IA qui le
 * décide ; ici, le canal : e-mail seul (le fournisseur y est nommé par sa clé
 * d'environnement, jamais dans un canal d'équipe, jamais côté client).
 */
describe('source_muette — SIG-C C4', () => {
  const body = {
    source: 'THEIRSTACK_API_KEY',
    sinceIso: '2026-10-11T08:00:00.000Z',
    consecutiveErrors: 5,
    lastReason: 'HTTP 403',
    degraded: 'Une partie des offres d’emploi agrégées manque aux dossiers.',
  }

  it('canal e-mail uniquement (le fournisseur y est nommé), fenêtre de 6 h', () => {
    expect(ALERT_KIND_CHANNEL.source_muette).toBe('email-only')
    expect(resolveChannel('source_muette', true)).toBe('email')
    expect(antiRepeatMsFor('source_muette')).toBe(6 * 60 * 60 * 1000)
    expect(antiRepeatMsFor('source_muette')).not.toBe(ANTI_REPEAT_MS)
    expect(ALERT_KIND_LABEL.source_muette).toBe('Source muette')
  })

  it('le message nomme la clé, le nombre d’erreurs, la dernière cause et le geste', () => {
    const { title, detail } = providerSilentAlert(body.source, body.sinceIso, 5, 'HTTP 403', body.degraded)
    expect(title).toBe('THEIRSTACK_API_KEY')
    expect(detail).toContain('5 appels consécutifs')
    expect(detail).toContain('HTTP 403')
    expect(detail).toContain(body.degraded)
    expect(detail).toContain("variable d'environnement THEIRSTACK_API_KEY")
    expect(renderAlert({ kind: 'source_muette', title, detail, resolved: false }).subject).not.toContain('URGENT')
  })

  it('le geste suit la cause : clé (401/403), crédit (402), quota (429), service (5xx/timeout)', () => {
    const d = (reason: string) => providerSilentAlert(body.source, body.sinceIso, 5, reason, body.degraded).detail
    expect(d('HTTP 401')).toContain('Geste à faire : vérifier la clé')
    expect(d('HTTP 403')).toContain('Geste à faire : vérifier la clé')
    // ALERTES-402 (30/10/2026) — le mail du 28/10 disait « vérifier l'état du service » sur un 402.
    expect(d('HTTP 402')).toContain('Geste à faire : recharger le crédit')
    expect(d('HTTP 429')).toContain('Geste à faire : vérifier le quota')
    expect(d('HTTP 503')).toContain("Geste à faire : vérifier l'état du service")
    expect(d('ReadTimeout')).toContain("Geste à faire : vérifier l'état du service")
  })

  it('[RÉSOLU] dit que la source répond de nouveau, sans « est en erreur » ni « Geste à faire »', () => {
    const { title, detail } = providerSilentAlert(body.source, body.sinceIso, 11, 'HTTP 403', body.degraded, true)
    expect(detail).toContain('répond de nouveau')
    expect(detail).toContain('11 appels échoués')
    expect(detail).not.toContain('est en erreur')
    expect(detail).not.toContain('Geste à faire')
    const mail = renderAlert({ kind: 'source_muette', title, detail, resolved: true })
    expect(mail.subject).toContain('[RÉSOLU]')
    expect(mail.text).not.toContain('Geste à faire')
  })

  it('le contrat refuse un texte libre en guise de source et un compteur absurde', () => {
    expect(providerSilentSchema.safeParse(body).success).toBe(true)
    expect(providerSilentSchema.safeParse({ ...body, source: 'theirstack' }).success).toBe(false)
    expect(providerSilentSchema.safeParse({ ...body, consecutiveErrors: 0 }).success).toBe(false)
    expect(providerSilentSchema.safeParse({ ...body, lastReason: 'x'.repeat(201) }).success).toBe(false)
  })

  it('le contrôleur délègue à BackofficeAlertsService#reportProviderSilent', async () => {
    const alerts = { reportProviderSilent: jest.fn().mockResolvedValue(undefined) }
    const controller = new BackofficeAlertsController(alerts as never)
    expect(await controller.providerSilent(body as never)).toEqual({ ok: true })
    expect(alerts.reportProviderSilent).toHaveBeenCalledWith(body)
  })

  it('le service dispatche un source_muette dont le sujet EST la source ; resolved transmis', async () => {
    const dispatch = { dispatch: jest.fn().mockResolvedValue({ action: 'send' }) }
    const args = Array.from({ length: 11 }, () => ({}))
    const service = new (BackofficeAlertsService as unknown as new (...a: unknown[]) => BackofficeAlertsService)(
      dispatch,
      ...args,
    )
    await service.reportProviderSilent(body)
    await service.reportProviderSilent({ ...body, resolved: true })
    expect(dispatch.dispatch).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ kind: 'source_muette', subject: 'THEIRSTACK_API_KEY', resolved: false }),
    )
    expect(dispatch.dispatch).toHaveBeenNthCalledWith(2, expect.objectContaining({ resolved: true }))
  })

  // ALERTES-402 (30/10/2026) — le silence d'une source que le cache rend inutile : même canal
  // opérateur, autre question. TheirStack est resté à sec du 28 au 30/10 sans produire une erreur.
  describe('source jamais appelée — ALERTES-402', () => {
    it('le message dit les jours sans appel, la date du dernier, et ne parle JAMAIS d’erreur', () => {
      const { title, detail } = providerUnusedAlert('THEIRSTACK_API_KEY', body.sinceIso, 4, body.degraded)
      expect(title).toBe('THEIRSTACK_API_KEY')
      expect(detail).toContain('n’a plus été APPELÉE depuis 4 jour(s)')
      expect(detail).toContain(body.degraded)
      expect(detail).toContain("variable d'environnement THEIRSTACK_API_KEY")
      expect(detail).not.toContain('est en erreur')
      expect(detail).not.toContain('appels consécutifs')
    })

    it('une date illisible se rend telle quelle, jamais « Invalid Date »', () => {
      const { detail } = providerUnusedAlert('MANTIKS_API_KEY', 'pas-une-date', 9, body.degraded)
      expect(detail).toContain('pas-une-date')
      expect(detail).not.toContain('Invalid Date')
    })

    // Deux contrats SÉPARÉS exprès : `provider-silent` continue d'exiger au moins une erreur
    // (« en erreur sur 0 appels » serait faux), `provider-unused` n'en compte aucune.
    it('le contrat du silence par inaction est à lui, et exige une clé d’environnement', () => {
      const unused = { source: 'THEIRSTACK_API_KEY', lastCallIso: body.sinceIso, days: 4, degraded: body.degraded }
      expect(providerUnusedSchema.safeParse(unused).success).toBe(true)
      expect(providerUnusedSchema.safeParse({ ...unused, days: 0 }).success).toBe(false)
      expect(providerUnusedSchema.safeParse({ ...unused, source: 'theirstack' }).success).toBe(false)
      expect(providerUnusedSchema.safeParse({ ...unused, lastCallIso: 'hier' }).success).toBe(false)
      expect(providerSilentSchema.safeParse({ ...body, consecutiveErrors: 0 }).success).toBe(false)
    })

    it('le service rend le texte « jamais appelée », sur le canal de la source muette', async () => {
      const dispatch = { dispatch: jest.fn().mockResolvedValue({ action: 'send' }) }
      const args = Array.from({ length: 11 }, () => ({}))
      const service = new (BackofficeAlertsService as unknown as new (...a: unknown[]) => BackofficeAlertsService)(
        dispatch,
        ...args,
      )
      await service.reportProviderUnused({
        source: 'THEIRSTACK_API_KEY',
        lastCallIso: body.sinceIso,
        days: 4,
        degraded: body.degraded,
      })
      expect(dispatch.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'source_muette',
          subject: 'THEIRSTACK_API_KEY',
          detail: expect.stringContaining('n’a plus été APPELÉE depuis 4 jour(s)'),
        }),
      )
    })
  })
})
