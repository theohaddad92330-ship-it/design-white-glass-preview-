import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isSupportedTimeZone } from '@bellum/contracts'
import { DEMO_PROFILE_TIMEZONE_COVERAGE } from './demo-coverage'
import { DEMO_OWNER } from './demo-dataset'

const SEED_SERVICE = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')

/**
 * PARITÉ DÉMO DU FUSEAU DE LA PERSONNE (décision Louis, 14/09/2026).
 *
 * `profiles.timezone` est une colonne de plus sur une table qui existe depuis
 * l'origine : `demo-coverage.spec.ts`, qui raisonne par TABLE, ne pouvait rien
 * en dire. Sans cette garde, Réglages › Profil › Identité partait en
 * démonstration avec un champ à remplir — le défaut que la parité démo existe
 * pour attraper.
 *
 * Les trois preuves :
 *  · elle sait dire NON — retirer `timezone: DEMO_OWNER.timezone` de
 *    `restoreOwnerIdentity`, ou vider `DEMO_OWNER.timezone`, la fait rougir ;
 *  · elle LIT quelque chose — le source de `DemoSeedService` est chargé depuis
 *    le disque et sa taille est contrôlée ;
 *  · elle n'attrape pas le cas voisin — elle n'exige RIEN d'un profil réel : un
 *    utilisateur hors démonstration garde un fuseau `null`, ce que la garde
 *    n'interdit nulle part.
 */
describe('parité démo — le fuseau du profil', () => {
  it('lit vraiment le source du semis', () => {
    expect(SEED_SERVICE.length).toBeGreaterThan(1000)
    expect(SEED_SERVICE).toContain('restoreOwnerIdentity')
  })

  it('le jeu de démonstration porte un fuseau, et c’en est un vrai', () => {
    expect(DEMO_OWNER.timezone).toBeTruthy()
    expect(isSupportedTimeZone(DEMO_OWNER.timezone)).toBe(true)
  })

  it('`restoreOwnerIdentity` l’ÉCRIT — sinon la colonne resterait vide en salle', () => {
    // Le semis et la remise à neuf du bail passent par la même écriture : c'est
    // ce qui garantit qu'un fuseau changé par un visiteur ne survit pas au bail.
    const block = SEED_SERVICE.slice(SEED_SERVICE.indexOf('private async restoreOwnerIdentity'))
    expect(block.slice(0, 900)).toContain('timezone: DEMO_OWNER.timezone')
  })

  it('la classification est SEEDÉE, avec sa raison écrite', () => {
    expect(DEMO_PROFILE_TIMEZONE_COVERAGE.state).toBe('seede')
    for (const cause of ['restoreOwnerIdentity', 'Europe/Paris', 'bail', 'profiles.timezone']) {
      expect(DEMO_PROFILE_TIMEZONE_COVERAGE.reason).toContain(cause)
    }
    expect(DEMO_PROFILE_TIMEZONE_COVERAGE.reason.length).toBeGreaterThan(200)
  })
})
