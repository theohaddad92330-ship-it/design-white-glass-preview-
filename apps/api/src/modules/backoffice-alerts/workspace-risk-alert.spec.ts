import {
  CHURN_ALERT_SCORE,
  computeClientHealth,
  type ClientHealth,
  type ClientHealthInput,
} from '../admin/client-health'
import { WORKSPACE_RISK_ALERT_WINDOW_MS, workspaceRiskAlert } from './workspace-risk-alert'

/**
 * #1946.22 — décision Louis 13/09 batch 12 : l'alerte OPÉRATEUR d'un espace à
 * risque. Ces tests portent sur le fait PUR (le service FETCH, ce fichier
 * DÉCIDE) — la même discipline qu'`operational-alerts.ts` et
 * `client-lifecycle-alerts.ts`, ses voisins.
 */

const TODAY = new Date('2026-09-13T08:00:00.000Z')

/** Un espace ancien, dont TOUS les signaux mesurés sont au plancher. */
const EN_RISQUE: ClientHealthInput = {
  createdAt: '2026-01-05T00:00:00.000Z',
  lastActivityAt: '2026-07-01T00:00:00.000Z',
  featuresUsed: 1,
  featuresAvailable: 10,
  creditsUsed: 10,
  creditsAllowance: 40,
  activeMembers: 1,
  seats: 5,
  // Aucune analyse sur la fenêtre : l'axe incidents SORT du dénominateur.
  incidents: null,
  runs: null,
}

function health(input: ClientHealthInput): ClientHealth {
  return computeClientHealth(input, TODAY)
}

function scoreOf(value: ClientHealth): number {
  if (value.kind !== 'score') throw new Error(`fixture sans score : ${value.kind}`)
  return value.score
}

describe('#1946.22 — workspaceRiskAlert : un espace à risque MESURÉ alerte l’équipe', () => {
  it('la fenêtre anti-harcèlement vaut SEPT jours, et elle vit à un seul endroit', () => {
    expect(WORKSPACE_RISK_ALERT_WINDOW_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('un score mesuré SOUS le seuil existant alerte, avec le nom de l’espace, le score et ses axes nommés', () => {
    const value = health(EN_RISQUE)
    expect(scoreOf(value)).toBeLessThan(CHURN_ALERT_SCORE)

    const verdict = workspaceRiskAlert(
      { workspaceId: 'ws-1', name: 'Acme Conseil', isDemo: false, health: value },
      { backofficeUrl: 'https://bo.bellum-ai.com' },
    )

    expect(verdict.alert).toBe(true)
    if (!verdict.alert) return
    expect(verdict.subject).toBe('ws-1')
    expect(verdict.title).toBe('Acme Conseil')
    expect(verdict.detail).toContain(`${scoreOf(value)}/100`)
    // Le seuil se LIT dans le code, il ne se recopie pas dans une phrase.
    expect(verdict.detail).toContain(`(${CHURN_ALERT_SCORE})`)
    // Chaque axe MESURÉ est nommé avec ce qu'il a lu…
    expect(verdict.detail).toContain('Activité')
    expect(verdict.detail).toContain('dernier geste il y a 74 j')
    expect(verdict.detail).toContain('Usage des crédits')
    expect(verdict.detail).toContain('Membres actifs / sièges')
    // …et ce qui n'a PAS pu être évalué est NOMMÉ, avec sa raison — jamais tu.
    expect(verdict.detail).toContain('Non évalués')
    expect(verdict.detail).toContain('Retours et incidents')
    expect(verdict.detail).toContain('pas de dénominateur')
  })

  it('le lien mène à la fiche du back-office, jamais une URL devinée', () => {
    const verdict = workspaceRiskAlert(
      { workspaceId: 'ws-1', name: 'Acme & Fils', isDemo: false, health: health(EN_RISQUE) },
      { backofficeUrl: 'https://bo.bellum-ai.com/' },
    )
    expect(verdict.alert && verdict.detail).toContain(
      'https://bo.bellum-ai.com/revenus/clients?search=Acme%20%26%20Fils',
    )
    // Pas de double barre quand la variable finit par « / ».
    expect(verdict.alert && verdict.detail).not.toContain('.com//')
  })

  it('sans back-office configuré : aucune adresse inventée, l’écran est NOMMÉ', () => {
    const verdict = workspaceRiskAlert(
      { workspaceId: 'ws-1', name: 'Acme', isDemo: false, health: health(EN_RISQUE) },
      { backofficeUrl: null },
    )
    expect(verdict.alert).toBe(true)
    if (!verdict.alert) return
    expect(verdict.detail).not.toMatch(/https?:\/\//)
    expect(verdict.detail).toContain('Revenus › Clients')
  })

  it('sait dire NON — un score mesuré AU seuil ou au-dessus n’alerte pas', () => {
    const sain = health({ ...EN_RISQUE, lastActivityAt: '2026-09-12T00:00:00.000Z', creditsUsed: 40, activeMembers: 5 })
    expect(scoreOf(sain)).toBeGreaterThanOrEqual(CHURN_ALERT_SCORE)
    expect(
      workspaceRiskAlert({ workspaceId: 'ws-2', name: 'Sain', isDemo: false, health: sain }, { backofficeUrl: null }),
    ).toEqual({
      alert: false,
      reason: 'not_at_risk',
    })
  })

  it('« non mesuré » n’est jamais « à risque » — trop récent : aucune alerte, raison distincte de « sain »', () => {
    const jeune = health({ ...EN_RISQUE, createdAt: '2026-09-10T00:00:00.000Z' })
    expect(jeune.kind).toBe('too_recent')
    expect(
      workspaceRiskAlert({ workspaceId: 'ws-3', name: 'Jeune', isDemo: false, health: jeune }, { backofficeUrl: null }),
    ).toEqual({
      alert: false,
      reason: 'not_measured',
    })
  })

  it('« non mesuré » n’est jamais « à risque » — moins de trois axes : aucune alerte', () => {
    const muet = health({
      ...EN_RISQUE,
      lastActivityAt: null,
      featuresUsed: null,
      creditsUsed: null,
      creditsAllowance: null,
    })
    expect(muet.kind).toBe('not_enough_axes')
    expect(
      workspaceRiskAlert({ workspaceId: 'ws-4', name: 'Muet', isDemo: false, health: muet }, { backofficeUrl: null }),
    ).toEqual({
      alert: false,
      reason: 'not_measured',
    })
  })

  it('une salle de DÉMONSTRATION n’alerte jamais — elle n’est le compte de personne', () => {
    expect(
      workspaceRiskAlert(
        { workspaceId: 'demo-1', name: 'Salle 3', isDemo: true, health: health(EN_RISQUE) },
        { backofficeUrl: null },
      ),
    ).toEqual({ alert: false, reason: 'demo' })
  })

  it('aucune donnée de PERSONNE ne sort — même si la ligne lue en porte', () => {
    // La ligne de `/revenus/clients` porte l'adresse du propriétaire : elle ne
    // doit jamais atteindre une alerte qui part par e-mail ou dans un canal.
    const ligne = {
      workspaceId: 'ws-1',
      name: 'Acme',
      isDemo: false,
      health: health(EN_RISQUE),
      ownerEmail: 'sarah.durand@acme.fr',
      ownerUserId: 'user-42',
    }
    const verdict = workspaceRiskAlert(ligne, { backofficeUrl: 'https://bo.bellum-ai.com' })
    const sortie = JSON.stringify(verdict)
    expect(verdict.alert).toBe(true)
    expect(sortie).not.toContain('sarah')
    expect(sortie).not.toContain('@')
    expect(sortie).not.toContain('user-42')
  })
})
