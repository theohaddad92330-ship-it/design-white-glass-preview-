import { describe, expect, it } from 'vitest'
import { isSupportedTimeZone, updateProfileSchema, userProfileSchema } from './profile.js'

/**
 * LE FUSEAU PAR UTILISATEUR — LA PORTE (décision Louis, 14/09/2026).
 *
 * Les trois preuves exigées d'une garde :
 *  · elle sait dire NON — un nom de fuseau inventé est REFUSÉ, et ce test
 *    échouerait si le `.refine` disparaissait ;
 *  · elle LIT quelque chose — le corpus des fuseaux réellement connus de la
 *    plate-forme n'est pas vide, et on y prend de vrais noms ;
 *  · elle n'attrape pas le cas légitime voisin — une mise à jour de profil
 *    SANS `timezone` reste valide au bit près, et `null` (« je retire mon
 *    fuseau ») reste accepté : c'est le témoin du comportement d'avant.
 */
describe('profile timezone — la porte', () => {
  const knownZones = Intl.supportedValuesOf('timeZone')

  it('lit un corpus de fuseaux non vide', () => {
    // Sans ce contrôle, tous les `expect` d'en dessous pourraient porter sur
    // une liste vide et rester verts en ne vérifiant rien.
    expect(knownZones.length).toBeGreaterThan(100)
    expect(knownZones).toContain('Europe/Paris')
    expect(knownZones).toContain('America/Toronto')
  })

  it('⚠️ `supportedValuesOf` ne liste QUE les fuseaux canoniques — un ALIAS est valide et absent', () => {
    // Mesuré en écrivant ce test : 418 fuseaux listés, et « America/Montreal »
    // n'en fait PAS partie (c'est un alias de « America/Toronto »), alors que
    // `Intl` l'accepte parfaitement. Conséquence tenue côté écran : la liste
    // déroulante de Réglages ajoute TOUJOURS la valeur enregistrée si elle n'y
    // est pas — sinon un fuseau licite disparaîtrait de l'écran qui le montre,
    // et le premier « enregistrer » l'écraserait par un autre.
    expect(isSupportedTimeZone('America/Montreal')).toBe(true)
    expect(knownZones).not.toContain('America/Montreal')
  })

  it('accepte un fuseau IANA réel', () => {
    for (const zone of ['Europe/Paris', 'America/Montreal', 'Asia/Singapore', 'UTC']) {
      expect(isSupportedTimeZone(zone)).toBe(true)
      expect(updateProfileSchema.safeParse({ timezone: zone }).success).toBe(true)
    }
  })

  it('dit NON à ce qui n’est pas un fuseau', () => {
    for (const bogus of ['Europe/Parisss', 'Montréal', 'GMT+2h', 'null', ' ']) {
      expect(isSupportedTimeZone(bogus)).toBe(false)
      expect(updateProfileSchema.safeParse({ timezone: bogus }).success).toBe(false)
    }
    // La chaîne vide n'est pas « je ne sais pas » : `null` l'est.
    expect(updateProfileSchema.safeParse({ timezone: '' }).success).toBe(false)
  })

  it('TÉMOIN — une mise à jour sans fuseau, et un fuseau retiré, restent valides', () => {
    expect(updateProfileSchema.safeParse({ first_name: 'Maëlle' }).success).toBe(true)
    expect(updateProfileSchema.safeParse({}).success).toBe(true)
    expect(updateProfileSchema.safeParse({ timezone: null }).success).toBe(true)
  })

  it('le profil rendu PORTE le fuseau, et `null` y est une valeur licite', () => {
    const base = {
      id: '11111111-1111-4111-8111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222',
      email: 'maelle@example.com',
      first_name: 'Maëlle',
      last_name: 'Lorquin',
      avatar_url: null,
      created_at: '2026-09-14T08:00:00.000Z',
      updated_at: '2026-09-14T08:00:00.000Z',
      auth_created_at: null,
      auth_last_sign_in_at: null,
    }
    expect(userProfileSchema.safeParse({ ...base, timezone: 'America/Montreal' }).success).toBe(true)
    expect(userProfileSchema.safeParse({ ...base, timezone: null }).success).toBe(true)
    // Le champ n'est pas optionnel : un serveur qui l'oublierait laisserait
    // l'écran sans moyen de distinguer « inconnu » de « pas encore chargé ».
    expect(userProfileSchema.safeParse(base).success).toBe(false)
  })
})
