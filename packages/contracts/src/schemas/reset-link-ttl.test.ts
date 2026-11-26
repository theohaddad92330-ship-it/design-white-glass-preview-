import { describe, expect, it } from 'vitest'
import {
  clampResetTtl,
  DEFAULT_RESET_LINK_TTL,
  RESET_LINK_TTL_CHOICES,
  resetTtlMs,
  SUPABASE_OTP_EXP_CEILING_MS,
} from './reset-link-ttl.js'

const HOUR = 60 * 60 * 1000

describe('les durées proposées', () => {
  it('sont ordonnées de la plus courte à la plus longue', () => {
    const ms = RESET_LINK_TTL_CHOICES.map(choice => choice.ms)
    expect([...ms].sort((a, b) => a - b)).toEqual(ms)
  })

  it('le défaut est 24 heures, et il existe dans la liste', () => {
    expect(DEFAULT_RESET_LINK_TTL).toBe('24h')
    expect(resetTtlMs(DEFAULT_RESET_LINK_TTL)).toBe(24 * HOUR)
    expect(RESET_LINK_TTL_CHOICES.some(c => c.key === DEFAULT_RESET_LINK_TTL)).toBe(true)
  })

  it('AUCUN choix ne dépasse le plafond de la plateforme Supabase', () => {
    // Mesuré le 25/08 : le tableau de bord refuse au-delà de 86 400 s. Un choix
    // systématiquement écrêté est une case qui ne fait rien.
    for (const choice of RESET_LINK_TTL_CHOICES) {
      expect(choice.ms).toBeLessThanOrEqual(SUPABASE_OTP_EXP_CEILING_MS)
    }
    expect(SUPABASE_OTP_EXP_CEILING_MS).toBe(86_400_000)
  })
})

describe('clampResetTtl — la plus COURTE des deux échéances gagne', () => {
  it('rabote quand Supabase accorde moins que ce qu’on demande', () => {
    // Le pire lien possible : notre écran l'accepte, la personne saisit son mot
    // de passe, et Supabase refuse à l'échange.
    expect(clampResetTtl(24 * HOUR, 1 * HOUR)).toEqual({ ms: HOUR, clamped: true })
  })

  it('laisse passer quand le plafond est plus large', () => {
    expect(clampResetTtl(24 * HOUR, 7 * 24 * HOUR)).toEqual({ ms: 24 * HOUR, clamped: false })
  })

  it('n’invente AUCUN plafond quand on n’en connaît pas', () => {
    // Deviner une limite raccourcirait des liens sans raison sur un projet bien
    // configuré — et un lien trop court se regénère, alors qu'un lien qui ment
    // coûte un aller-retour avec quelqu'un de bloqué.
    for (const ceiling of [undefined, null, 0, -1, Number.NaN]) {
      expect(clampResetTtl(24 * HOUR, ceiling as number)).toEqual({ ms: 24 * HOUR, clamped: false })
    }
  })

  it('dit TOUJOURS si la durée a été rabotée', () => {
    // Sans ce drapeau, le back-office afficherait « 48 h » au-dessus d'un lien
    // qui en vaut une.
    expect(clampResetTtl(7 * 24 * HOUR, 24 * HOUR).clamped).toBe(true)
    expect(clampResetTtl(HOUR, 24 * HOUR).clamped).toBe(false)
  })
})
