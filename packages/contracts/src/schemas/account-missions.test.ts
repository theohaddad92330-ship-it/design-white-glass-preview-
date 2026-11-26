import { describe, expect, it } from 'vitest'
import { activeMissionNextAction, activeMissionRowSchema } from './account-missions.js'
import { RENEWAL_WINDOWS } from './mission.js'

/**
 * LA PROCHAINE ACTION D'UNE MISSION QUI TOURNE — une dérivation, un endroit.
 *
 * Elle vivait en fonction PRIVÉE dans `account-missions.service.ts`, donc
 * atteignable par le seul onglet Missions du dossier de compte. `/missions`
 * affichait ses alertes en badges muets faute de pouvoir l'appeler — et la
 * réponse n'est jamais de la recopier : deux échelles d'urgence divergent au
 * premier ajout (GA-26). Elle est remontée ici, à côté du vocabulaire qu'elle
 * produit (#1354, #1355, #1357, #1366).
 */
describe('activeMissionNextAction — la fenêtre de renouvellement décide, et elle seule', () => {
  it('rend une action DÉCLARÉE par le contrat, quelle que soit la fenêtre', () => {
    // Ensembles, pas chaînes libres : une septième fenêtre ajoutée à
    // `RENEWAL_WINDOWS` sans réponse ici sort par ce test.
    const vocabulary = new Set<string>(activeMissionRowSchema.shape.nextAction.options)
    expect(vocabulary.size).toBeGreaterThanOrEqual(5)
    for (const window of RENEWAL_WINDOWS) {
      expect(vocabulary.has(activeMissionNextAction(window)), `fenêtre sans action : ${window}`).toBe(true)
    }
  })

  it('sans date de fin, la seule action possible est d’en poser une', () => {
    // C'est le cœur de #1354 : « Sans date de fin » n'est pas un constat, c'est
    // un geste — aucune fenêtre ne se déclenchera jamais sur cette mission.
    expect(activeMissionNextAction('unknown')).toBe('set_end_date')
  })

  it('l’urgence se traduit sans se réinventer', () => {
    expect(activeMissionNextAction('overdue')).toBe('renewal_overdue')
    expect(activeMissionNextAction('imminent')).toBe('renew_now')
    expect(activeMissionNextAction('j30')).toBe('renew_now')
    expect(activeMissionNextAction('j60')).toBe('renew_soon')
  })

  it('sait dire NON : une échéance lointaine n’invente aucun geste', () => {
    // `none` est une VÉRITÉ, pas un vide — et `nextActionLink` lui refuse toute
    // destination. Rendre « Préparer le renouvellement » à J-200 ferait de
    // chaque ligne calme une invitation à cliquer pour ne rien trouver.
    expect(activeMissionNextAction('far')).toBe('none')
  })
})
