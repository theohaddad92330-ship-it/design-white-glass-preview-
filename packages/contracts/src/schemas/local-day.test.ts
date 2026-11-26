/**
 * ⚠️ LE FUSEAU EST FIXÉ AVANT TOUTE CONSTRUCTION DE `Date`, ET C'EST LE POINT.
 *
 * Ce fichier teste une dérivation qui lit l'horloge LOCALE. Sa première version
 * construisait `new Date('2026-09-01T00:30:00+02:00')` et affirmait que la clé
 * du jour valait `2026-09-01` — vrai à Paris, **faux sur un runner de CI, qui
 * tourne en UTC** : la « veille » y est le jour même, le contraste disparaît, et
 * quatre assertions tombent.
 *
 * C'est exactement la faute que la dérivation testée corrige, commise dans son
 * propre test. Un test qui dépend du fuseau de la machine ne mesure pas le code,
 * il mesure où il tourne.
 *
 * `process.env.TZ` posé avant le premier `Date` est honoré par Node (≥ 16) et
 * rend le fichier reproductible partout. Paris parce que c'est le fuseau des
 * utilisateurs, et parce que l'heure d'été y écarte l'horloge locale de l'UTC —
 * un fuseau à décalage nul ne prouverait rien.
 */
process.env.TZ = 'Europe/Paris'

import { describe, it, expect } from 'vitest'
import { localDayKey, localMonthKey, shiftLocalDays } from './local-day.js'

/**
 * LE DÉFAUT MESURÉ LE 01/09/2026, À 00 h 06 CEST.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `toISOString().slice(0, 10)` NE REND PAS LA DATE D'AUJOURD'HUI
 * ─────────────────────────────────────────────────────────────────────────────
 * Il rend la date UTC de l'instant. À 00 h 06 à Paris en heure d'été, l'instant
 * UTC est encore la VEILLE — donc toute échéance, tout mois de période et tout
 * test qui passe par ce chemin recule d'un jour pendant deux heures chaque nuit.
 *
 * Trois endroits du dépôt avaient déjà écrit la bonne réponse dans un
 * commentaire, chacun dans son coin et chacun en PRIVÉ :
 *
 *  · `staffing.ts` — « mesuré : 29 au lieu de 30 en UTC+2 » ;
 *  · `computed-at.ts` — « se lirait "calculé le 29" pendant deux heures » ;
 *  · `agenda-view.ts`.
 *
 * Et le bug était quand même en production à deux autres endroits : l'échéance
 * J+n du matching, et le mois de période du semis de démonstration. **Une
 * connaissance écrite trois fois en privé n'est pas une dérivation partagée**
 * (GA-26) — c'est trois occasions de la réécrire de travers une quatrième fois.
 */
describe('la clé de jour se lit sur l’horloge LOCALE', () => {
  it('tourne bien dans le fuseau qu’il a posé — sinon il ne mesure rien', () => {
    // Sans ce contrôle, un environnement qui ignorerait `TZ` ferait passer les
    // tests suivants pour la mauvaise raison, ou les ferait échouer sans dire
    // pourquoi. Le décalage de Paris au 1er septembre est de +2 h (heure d'été).
    expect(new Date('2026-09-01T00:30:00Z').getHours()).toBe(2)
  })

  // 00 h 30 à Paris en heure d'été = 22 h 30 UTC la VEILLE. C'est la fenêtre
  // exacte où le dépôt se trompait.
  const minuitPasse = new Date('2026-09-01T00:30:00+02:00')

  it('rend le jour local, pas le jour UTC', () => {
    expect(localDayKey(minuitPasse)).toBe('2026-09-01')
    // La garde sait dire NON : c'est bien la réponse que l'ancien chemin donnait.
    expect(minuitPasse.toISOString().slice(0, 10)).toBe('2026-08-31')
  })

  it('rend le mois local, pas le mois UTC — le cas du 1er du mois', () => {
    expect(localMonthKey(minuitPasse)).toBe('2026-09')
    expect(minuitPasse.toISOString().slice(0, 7)).toBe('2026-08')
  })

  it('décale de n jours SANS repasser par UTC', () => {
    // Une échéance à J+7 posée à 00 h 30 rendait J+6.
    expect(shiftLocalDays(minuitPasse, 7)).toBe('2026-09-08')
    expect(shiftLocalDays(minuitPasse, -9)).toBe('2026-08-23')
  })

  it('garde le zéro de tête — un mois ou un jour à un chiffre reste sur deux', () => {
    expect(localDayKey(new Date('2026-01-05T12:00:00Z'))).toBe('2026-01-05')
  })

  it('en plein midi, les deux chemins coïncident — sinon le test ne prouverait rien', () => {
    const midi = new Date('2026-09-01T12:00:00+02:00')
    expect(localDayKey(midi)).toBe(midi.toISOString().slice(0, 10))
  })

  it('un décalage franchit une fin de mois et une fin d’année', () => {
    expect(shiftLocalDays(new Date('2026-12-31T23:00:00+01:00'), 1)).toBe('2027-01-01')
    expect(shiftLocalDays(new Date('2026-03-01T00:10:00+01:00'), -1)).toBe('2026-02-28')
  })
})
