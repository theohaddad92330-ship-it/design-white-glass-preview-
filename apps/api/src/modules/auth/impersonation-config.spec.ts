import { MAX_TTL_MINUTES, readTtlMinutes } from './impersonation-config'

/**
 * Le plafond de 30 minutes d'une incarnation — LU, pas seulement écrit (#1670.3).
 *
 * « EXPIRATION AUTOMATIQUE à 30 minutes. Une session d'incarnation qui traîne
 * est une session oubliée. »
 *
 * ⚠️ POURQUOI CE FICHIER EXISTE ALORS QUE LE PLAFOND EXISTAIT DÉJÀ.
 * Le rabotage (`Math.min(…, MAX_TTL_MINUTES)`) était en place depuis
 * l'origine — et `MAX_TTL_MINUTES` n'apparaissait dans AUCUN test. Porter `30`
 * à `240` serait passé en CI sans qu'une ligne rougisse : le test T3 de l'issue
 * (« session à 31 min → expirée ») était vrai par accident de rédaction, pas
 * tenu. Un chiffre que rien ne lit n'est pas une garantie, c'est une intention.
 */

const ORIGINE = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINE }
})

describe('readTtlMinutes — le plafond de 30 minutes (#1670.3)', () => {
  it('LIT quelque chose — sans réglage, la durée par défaut est celle du produit', () => {
    delete process.env['IMPERSONATION_TTL_MINUTES']
    expect(readTtlMinutes()).toBe(15)
  })

  it('SAIT DIRE NON — une demande au-delà du plafond est RABOTÉE, jamais honorée', () => {
    process.env['IMPERSONATION_TTL_MINUTES'] = '240'
    expect(readTtlMinutes()).toBe(MAX_TTL_MINUTES)

    process.env['IMPERSONATION_TTL_MINUTES'] = '31'
    expect(readTtlMinutes()).toBe(30)

    // Le T3 de l'issue, écrit comme il se lit : à 31 minutes, la session est morte.
    expect(readTtlMinutes()).toBeLessThan(31)
  })

  it('le plafond VAUT 30 — le déplacer doit coûter une modification de ce test', () => {
    expect(MAX_TTL_MINUTES).toBe(30)
  })

  it('n’attrape pas ce qu’elle ne vise pas — une demande SOUS le plafond est honorée', () => {
    process.env['IMPERSONATION_TTL_MINUTES'] = '5'
    expect(readTtlMinutes()).toBe(5)
  })

  it('une valeur illisible retombe sur le défaut, jamais sur l’infini', () => {
    for (const absurde of ['', 'beaucoup', '0', '-10', 'NaN']) {
      process.env['IMPERSONATION_TTL_MINUTES'] = absurde
      expect(readTtlMinutes()).toBe(15)
    }
  })
})
