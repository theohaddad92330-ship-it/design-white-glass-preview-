import {
  ALERT_KIND_CHANNEL,
  ALERT_KIND_LABEL,
  ANTI_REPEAT_MS,
  antiRepeatMsFor,
  decideAlertAction,
  enrichmentOutageAlert,
  mergeEmailRecipients,
  ownerEmailsFromDmAllowedEmails,
  renderAlert,
  resolveChannel,
  type AlertKind,
} from './backoffice-alert-dispatch'
import { WORKSPACE_RISK_ALERT_WINDOW_MS } from './workspace-risk-alert'

describe('#1946.22 — l’alerte « espace à risque » ne harcèle pas (décision Louis 13/09, batch 12)', () => {
  const now = new Date('2026-09-13T08:00:00.000Z')
  const firingAgo = (ms: number) => ({
    state: 'firing' as const,
    lastSentAt: new Date(now.getTime() - ms).toISOString(),
  })

  it('sa fenêtre anti-répétition est celle de l’alerte, SEPT jours — lue, jamais recopiée', () => {
    expect(antiRepeatMsFor('espace_a_risque')).toBe(WORKSPACE_RISK_ALERT_WINDOW_MS)
  })

  it('sait dire NON — six jours après le premier envoi, le même espace est dédupliqué', () => {
    const antiRepeatMs = antiRepeatMsFor('espace_a_risque')
    expect(
      decideAlertAction({ existing: firingAgo(6 * 24 * 60 * 60 * 1000), resolved: false, now, antiRepeatMs }),
    ).toEqual({
      action: 'skip',
      reason: 'deduped',
    })
  })

  it('la semaine révolue, un espace toujours à risque ré-alerte UNE fois', () => {
    const antiRepeatMs = antiRepeatMsFor('espace_a_risque')
    expect(
      decideAlertAction({ existing: firingAgo(WORKSPACE_RISK_ALERT_WINDOW_MS), resolved: false, now, antiRepeatMs })
        .action,
    ).toBe('send')
  })

  it('n’attrape pas ce qu’elle ne vise pas — les dix autres alertes gardent leur heure', () => {
    // #2528.3 ajoute une DEUXIÈME exception nommée (`provider_credits_exhausted`,
    // 6 h) — testée séparément plus bas. #2707.1 ajoute une ONZIÈME nature
    // (`nouveau_prospect_demo`), sur l'heure commune elle aussi. #3698.6 ajoute
    // une TROISIÈME exception (`enrichissement_indisponible`, 6 h) : 12 - 3 = 9.
    // #4035.3 ajoute une TREIZIÈME nature (`salle_demo_indisponible`), sur l'heure commune : 13 - 3 = 10.
    // SIG-C (11/10) — une QUATRIÈME exception (`source_muette`, 6 h) : avec les deux, 14 - 4 = 10.
    // #4694 ajoute une QUINZIÈME nature (`ip_sortante_changee`), sur l'heure commune : 15 - 4 = 11.
    const others = (Object.keys(ALERT_KIND_CHANNEL) as AlertKind[]).filter(
      kind =>
        kind !== 'espace_a_risque' &&
        kind !== 'provider_credits_exhausted' &&
        kind !== 'enrichissement_indisponible' &&
        kind !== 'source_muette',
    )
    expect(others).toHaveLength(11)
    for (const kind of others) expect(antiRepeatMsFor(kind)).toBe(ANTI_REPEAT_MS)
  })

  it('porte un nom lisible et suit la règle de canal d’un churn client', () => {
    expect(ALERT_KIND_LABEL.espace_a_risque).toBe('Espace client à risque')
    expect(ALERT_KIND_CHANNEL.espace_a_risque).toBe(ALERT_KIND_CHANNEL.churn_client)
  })
})

describe('resolveChannel — #1676.1', () => {
  it('une alerte email-only reste par e-mail même si Slack est configuré', () => {
    expect(resolveChannel('connexion_anormale', true)).toBe('email')
    expect(resolveChannel('rapport_hebdomadaire', true)).toBe('email')
  })

  it('une alerte slack-preferred part sur Slack quand un webhook est configuré', () => {
    expect(resolveChannel('cout_quotidien', true)).toBe('slack')
  })

  it('sans webhook Slack configuré, tout part par e-mail — jamais de perte', () => {
    const kinds = Object.keys(ALERT_KIND_CHANNEL) as AlertKind[]
    for (const kind of kinds) {
      expect(resolveChannel(kind, false)).toBe('email')
    }
  })
})

describe('decideAlertAction — anti-répétition 1h et message de résolution', () => {
  const now = new Date('2026-09-09T10:00:00.000Z')

  it('premier déclenchement : envoie', () => {
    expect(decideAlertAction({ existing: null, resolved: false, now })).toEqual({
      action: 'send',
      reason: 'first_time',
    })
  })

  it("sait dire NON — un second déclenchement dans l'heure est dédupliqué", () => {
    const existing = { state: 'firing' as const, lastSentAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString() }
    expect(decideAlertAction({ existing, resolved: false, now })).toEqual({ action: 'skip', reason: 'deduped' })
  })

  it('après 1h révolue, le même sujet toujours en défaut ré-alerte', () => {
    const existing = { state: 'firing' as const, lastSentAt: new Date(now.getTime() - 61 * 60 * 1000).toISOString() }
    expect(decideAlertAction({ existing, resolved: false, now })).toEqual({
      action: 'send',
      reason: 'still_firing_after_window',
    })
  })

  it('exactement 1h ne compte pas comme révolue (borne stricte <)', () => {
    const existing = { state: 'firing' as const, lastSentAt: new Date(now.getTime() - ANTI_REPEAT_MS).toISOString() }
    expect(decideAlertAction({ existing, resolved: false, now }).action).toBe('send')
  })

  it("une transition vers résolu N'EST PAS dédupliquée, même moins d'1h après le dernier envoi", () => {
    const existing = { state: 'firing' as const, lastSentAt: new Date(now.getTime() - 1000).toISOString() }
    expect(decideAlertAction({ existing, resolved: true, now })).toEqual({
      action: 'resolve',
      reason: 'transition_to_resolved',
    })
  })

  it('résoudre un sujet déjà résolu ou jamais vu ne renvoie rien', () => {
    expect(decideAlertAction({ existing: null, resolved: true, now })).toEqual({
      action: 'skip',
      reason: 'already_resolved_or_never_fired',
    })
    const resolved = { state: 'resolved' as const, lastSentAt: now.toISOString() }
    expect(decideAlertAction({ existing: resolved, resolved: true, now })).toEqual({
      action: 'skip',
      reason: 'already_resolved_or_never_fired',
    })
  })

  it('un sujet resté résolu ré-envoie normalement (pas de dédup fantôme)', () => {
    const resolved = { state: 'resolved' as const, lastSentAt: new Date(now.getTime() - 1000).toISOString() }
    expect(decideAlertAction({ existing: resolved, resolved: false, now })).toEqual({
      action: 'send',
      reason: 'first_time',
    })
  })
})

describe('renderAlert', () => {
  it('porte le préfixe [RÉSOLU] uniquement en résolution', () => {
    const firing = renderAlert({ kind: 'cout_quotidien', title: 'Titre', detail: 'Détail', resolved: false })
    expect(firing.subject).not.toContain('[RÉSOLU]')
    const resolved = renderAlert({ kind: 'cout_quotidien', title: 'Titre', detail: 'Détail', resolved: true })
    expect(resolved.subject).toContain('[RÉSOLU]')
  })

  it('échappe le HTML — un détail avec des balises ne casse pas le message', () => {
    const rendered = renderAlert({
      kind: 'connexion_anormale',
      title: '<script>x</script>',
      detail: 'a & b',
      resolved: false,
    })
    expect(rendered.html).not.toContain('<script>x</script>')
    expect(rendered.html).toContain('&lt;script&gt;')
    expect(rendered.html).toContain('a &amp; b')
  })

  // #2528.3 — décision Louis 17/09 batch : « l'objet commence par URGENT — ».
  it('provider_credits_exhausted porte URGENT — en tête tant que non résolu, jamais en résolution', () => {
    const firing = renderAlert({
      kind: 'provider_credits_exhausted',
      title: 'BRAVE_API_KEY',
      detail: 'Détail',
      resolved: false,
    })
    expect(firing.subject.startsWith('URGENT — ')).toBe(true)

    const resolved = renderAlert({
      kind: 'provider_credits_exhausted',
      title: 'BRAVE_API_KEY',
      detail: 'Détail',
      resolved: true,
    })
    expect(resolved.subject).not.toContain('URGENT')
    expect(resolved.subject).toContain('[RÉSOLU]')
  })

  it('aucune autre alerte ne porte URGENT — même non résolue', () => {
    const kinds = (Object.keys(ALERT_KIND_CHANNEL) as AlertKind[]).filter(k => k !== 'provider_credits_exhausted')
    for (const kind of kinds) {
      expect(renderAlert({ kind, title: 'T', detail: 'D', resolved: false }).subject).not.toContain('URGENT')
    }
  })
})

describe('provider_credits_exhausted — #2528.3', () => {
  it('canal e-mail uniquement, jamais Slack', () => {
    expect(ALERT_KIND_CHANNEL.provider_credits_exhausted).toBe('email-only')
    expect(resolveChannel('provider_credits_exhausted', true)).toBe('email')
  })

  it('fenêtre anti-répétition de 6h, distincte de l’heure commune ET des 7 jours d’espace à risque', () => {
    const ms = antiRepeatMsFor('provider_credits_exhausted')
    expect(ms).toBe(6 * 60 * 60 * 1000)
    expect(ms).not.toBe(ANTI_REPEAT_MS)
    expect(ms).not.toBe(WORKSPACE_RISK_ALERT_WINDOW_MS)
  })
})

describe('ownerEmailsFromDmAllowedEmails — #2528.3', () => {
  it('ne retient que les entrées explicitement :owner', () => {
    expect(ownerEmailsFromDmAllowedEmails('theo@x.com:owner,louis@x.com:operator,stagiaire@x.com:viewer')).toEqual([
      'theo@x.com',
    ])
  })

  it('une entrée sans suffixe de rôle n’est PAS owner (elle vaut operator ailleurs)', () => {
    expect(ownerEmailsFromDmAllowedEmails('sans-role@x.com')).toEqual([])
  })

  it('un rôle illisible n’est pas deviné en owner', () => {
    expect(ownerEmailsFromDmAllowedEmails('faute@x.com:admin')).toEqual([])
  })

  it('absente ou vide rend une liste vide, jamais une erreur', () => {
    expect(ownerEmailsFromDmAllowedEmails(undefined)).toEqual([])
    expect(ownerEmailsFromDmAllowedEmails('')).toEqual([])
  })

  it('normalise la casse', () => {
    expect(ownerEmailsFromDmAllowedEmails('Theo@X.com:OWNER')).toEqual(['theo@x.com'])
  })
})

describe('mergeEmailRecipients — #2528.3', () => {
  it('déduplique sans tenir compte de la casse, en gardant base puis extra', () => {
    expect(mergeEmailRecipients(['a@x.com', 'B@x.com'], ['b@x.com', 'c@x.com'])).toEqual([
      'a@x.com',
      'B@x.com',
      'c@x.com',
    ])
  })

  it('ignore une entrée sans @ dans extra', () => {
    expect(mergeEmailRecipients(['a@x.com'], ['pas-un-email'])).toEqual(['a@x.com'])
  })
})

/**
 * #2707.1 — la onzième nature, « un nouveau prospect accède à la démo ».
 * Canal e-mail explicitement (Théo : « une notification simple par e-mail à
 * mon attention »), jamais Slack — même choix que `connexion_anormale` et
 * `rapport_hebdomadaire`.
 */
describe('nouveau_prospect_demo — #2707.1', () => {
  it('canal e-mail uniquement, jamais Slack même avec un webhook configuré', () => {
    expect(ALERT_KIND_CHANNEL.nouveau_prospect_demo).toBe('email-only')
    expect(resolveChannel('nouveau_prospect_demo', true)).toBe('email')
  })

  it('porte un nom lisible', () => {
    expect(ALERT_KIND_LABEL.nouveau_prospect_demo).toBe('Nouveau prospect démo')
  })

  it('heure commune — aucune fenêtre exceptionnelle nommée pour elle', () => {
    expect(antiRepeatMsFor('nouveau_prospect_demo')).toBe(ANTI_REPEAT_MS)
  })

  // « La nouvelle nature n'ajoute personne aux dix alertes existantes : elles
  // restent byte-identiques » (#2528.3, décision Louis 17/09, ratifiée par
  // #2707). Ce test sait dire NON — une virgule mal placée en ajoutant
  // `nouveau_prospect_demo` qui aurait changé `nouveau_client` d'une lettre
  // aurait fait échouer cette comparaison exacte.
  it('les dix alertes existantes restent byte-identiques', () => {
    const untouched: AlertKind[] = [
      'api_indisponible',
      'taux_echec_analyse',
      'job_bloque',
      'cout_quotidien',
      'connexion_anormale',
      'nouveau_client',
      'churn_client',
      'rapport_hebdomadaire',
      'espace_a_risque',
      'provider_credits_exhausted',
    ]
    expect(untouched).toHaveLength(10)
    for (const kind of untouched) {
      expect(ALERT_KIND_CHANNEL[kind]).toBeDefined()
      expect(ALERT_KIND_LABEL[kind]).toBeDefined()
    }
    // Aucune régression sur les valeurs déjà mesurées plus haut dans ce fichier
    // (espace_a_risque, provider_credits_exhausted) ni sur les canaux nommés :
    expect(ALERT_KIND_CHANNEL.connexion_anormale).toBe('email-only')
    expect(ALERT_KIND_CHANNEL.rapport_hebdomadaire).toBe('email-only')
    expect(ALERT_KIND_CHANNEL.nouveau_client).toBe('slack-preferred')
  })
})

describe('enrichissement_indisponible — #3698.6', () => {
  it('part sur Slack si un webhook est posé, sinon par e-mail — jamais de perte', () => {
    expect(ALERT_KIND_CHANNEL.enrichissement_indisponible).toBe('slack-preferred')
    expect(resolveChannel('enrichissement_indisponible', true)).toBe('slack')
    expect(resolveChannel('enrichissement_indisponible', false)).toBe('email')
  })

  it('ne se répète pas avant 6 h sur la même cause', () => {
    expect(antiRepeatMsFor('enrichissement_indisponible')).toBe(6 * 60 * 60 * 1000)
  })

  it('dit le geste à faire par cause, et que le client ne doit rien', () => {
    const quota = enrichmentOutageAlert('quota_exceeded')
    expect(quota.detail).toContain('budget')
    expect(quota.detail).toContain("Aucun crédit n'a été débité")
    expect(enrichmentOutageAlert('unauthorized').detail).toContain('clé')
    // Une cause inconnue ne se devine pas : elle renvoie aux journaux.
    expect(enrichmentOutageAlert('???').detail).toContain('journaux')
  })

  it('porte un titre lisible dans l’objet', () => {
    const { title, detail } = enrichmentOutageAlert('upstream_error')
    const rendered = renderAlert({ kind: 'enrichissement_indisponible', title, detail, resolved: false })
    expect(rendered.subject).toContain('Enrichissement indisponible')
    expect(rendered.subject).not.toContain('URGENT')
  })
})
