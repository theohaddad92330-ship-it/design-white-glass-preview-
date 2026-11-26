import { describe, expect, it } from 'vitest'
import { loginSchema, requestOtpSchema, resetPasswordSchema, signupSchema, verifyOtpSchema } from './auth.js'

/**
 * L'e-mail, tel qu'un navigateur le remplit.
 *
 * Une bêta-testeuse a rapporté le 14/08/2026 que « me connecter fonctionne
 * rarement ». La cause n'était ni le mot de passe ni le compte : l'espace ajouté
 * par un remplissage automatique, ou la majuscule que posent les claviers
 * mobiles en début de champ, faisaient échouer `.email()`. L'écran répondait
 * « adresse invalide » sur une adresse qui était la sienne, et la personne en
 * concluait que la connexion marche une fois sur deux.
 *
 * La normalisation vit au CONTRAT — donc à un seul endroit, et elle couvre les
 * cinq portes d'un coup. Ces tests l'épinglent parce qu'elle n'en avait aucun :
 * elle a été posée par la correction, et rien n'empêchait de la retirer.
 *
 * ⚠️ L'ordre compte : `trim` PUIS `toLowerCase`, PUIS `.email()`. Valider avant
 * de nettoyer, c'est le défaut d'origine.
 */

/** Les cinq portes qui prennent une adresse. Le tableau EST le corpus. */
const GATES = [
  { name: 'loginSchema', parse: (email: string) => loginSchema.parse({ email, password: 'motdepasse' }) },
  {
    name: 'signupSchema',
    parse: (email: string) =>
      signupSchema.parse({ email, password: 'motdepasse', first_name: 'Laura', last_name: 'A' }),
  },
  { name: 'resetPasswordSchema', parse: (email: string) => resetPasswordSchema.parse({ email }) },
  { name: 'requestOtpSchema', parse: (email: string) => requestOtpSchema.parse({ email }) },
  { name: 'verifyOtpSchema', parse: (email: string) => verifyOtpSchema.parse({ email, code: 'A2B3C4' }) },
] as const

describe('l’e-mail des schémas d’authentification', () => {
  it('a bien cinq portes à garder', () => {
    // Un corpus vide rendrait tout ce qui suit vert sans rien vérifier.
    expect(GATES.length).toBe(5)
  })

  it.each(GATES)('$name accepte l’adresse remplie automatiquement', ({ parse }) => {
    expect(parse('  Laura@Skaizen.FR ').email).toBe('laura@skaizen.fr')
  })

  it.each(GATES)('$name refuse toujours ce qui n’est pas une adresse', ({ parse }) => {
    // Le nettoyage ne doit pas devenir une tolérance : « laura » reste invalide.
    expect(() => parse('  laura ')).toThrow()
    expect(() => parse('   ')).toThrow()
  })
})

describe('le code à six caractères', () => {
  it('accepte les LETTRES — l’alphabet OTP en contient', () => {
    // N'accepter que des chiffres rendait le code insaisissable dès qu'il
    // portait une lettre, c'est-à-dire presque toujours.
    expect(verifyOtpSchema.parse({ email: 'a@b.fr', code: 'A2B3C4' }).code).toBe('A2B3C4')
    expect(verifyOtpSchema.parse({ email: 'a@b.fr', code: 'a2b3c4' }).code).toBe('a2b3c4')
  })

  it('refuse une longueur qui n’est pas six', () => {
    expect(verifyOtpSchema.safeParse({ email: 'a@b.fr', code: 'A2B3C' }).success).toBe(false)
    expect(verifyOtpSchema.safeParse({ email: 'a@b.fr', code: 'A2B3C4D' }).success).toBe(false)
  })
})
