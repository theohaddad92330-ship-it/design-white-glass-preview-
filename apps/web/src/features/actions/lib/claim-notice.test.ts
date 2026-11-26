import { describe, expect, it } from 'vitest'
import type { TFunction } from 'i18next'
import { claimNotice } from './claim-notice'

/**
 * #1959.9 / #1959.10 — le message « déjà lancé » nomme quelqu'un et une heure.
 *
 * Le `t` de test rend la CLÉ et ses paramètres : ce qui compte ici est laquelle
 * des six phrases est choisie et avec quoi, pas la traduction (la parité FR/EN
 * est tenue par la garde i18n du dépôt).
 */
const t = ((key: string, params?: Record<string, unknown>) =>
  `${key}|${JSON.stringify(params ?? {})}`) as unknown as TFunction

describe('claimNotice (#1959.9/.10)', () => {
  it('sans réclamation, il n’y a rien à dire', () => {
    expect(claimNotice(undefined, t, 'fr-FR')).toBeNull()
  })

  it('#1959.9 — une action lancée par QUELQU’UN D’AUTRE le nomme', () => {
    const notice = claimNotice(
      { actor: 'Marc Dubois', completedAt: '2026-09-15T12:32:00.000Z', self: false },
      t,
      'fr-FR',
    )
    expect(notice).toContain('pending.claimed.byAt')
    expect(notice).toContain('Marc Dubois')
  })

  it('#1959.10 — et elle porte l’heure RÉELLE d’exécution, pas celle du clic', () => {
    const notice = claimNotice(
      { actor: 'Marc Dubois', completedAt: '2026-09-15T12:32:00.000Z', self: false },
      t,
      'fr-FR',
    )
    // L'heure vient de la DATE, jamais d'un « maintenant ». Elle s'affiche dans
    // le fuseau de qui lit — 12:32 UTC se lit 14:32 à Paris et 12:32 à Londres :
    // l'attendu se CALCULE, il ne se code pas en dur, sinon le test dit
    // seulement dans quel fuseau tourne la machine (la CI tourne en UTC).
    const executed = new Date('2026-09-15T12:32:00.000Z')
    const hh = String(executed.getHours()).padStart(2, '0')
    const mm = String(executed.getMinutes()).padStart(2, '0')
    expect(notice).toMatch(new RegExp(`${hh}[:h]${mm}`))
  })

  it('#1959.10 — une étiquette de langue que l’environnement refuse ne produit AUCUN message', () => {
    // Le repli n'est PAS la locale du runtime : elle écrirait l'heure dans la
    // langue du navigateur sur un écran qui parle celle de l'app.
    expect(
      claimNotice({ actor: 'Marc', completedAt: '2026-09-15T12:32:00.000Z', self: false }, t, 'pas une locale'),
    ).toBeNull()
  })

  it('#1959.9 — son propre geste se reconnaît : on ne renvoie pas la personne vers elle-même', () => {
    const notice = claimNotice({ actor: 'Léa Martin', completedAt: '2026-09-15T12:32:00.000Z', self: true }, t, 'fr-FR')
    expect(notice).toContain('pending.claimed.selfAt')
  })

  it('#1959.9 — un lancement SYSTÈME ne nomme personne (on nomme la capacité)', () => {
    const notice = claimNotice({ actor: null, completedAt: '2026-09-15T12:32:00.000Z', self: false }, t, 'fr-FR')
    expect(notice).toContain('pending.claimed.systemAt')
  })

  it('#1959.10 — un effet ENCORE EN VOL le dit, et ne date rien', () => {
    const notice = claimNotice({ actor: 'Marc Dubois', completedAt: null, self: false }, t, 'fr-FR')
    expect(notice).toContain('pending.claimed.byRunning')
    expect(notice).not.toMatch(/\d{1,2}[:h]\d{2}/)
  })

  it('#1959.10 — une heure illisible ne produit AUCUN message plutôt qu’un moment inventé', () => {
    // « Non mesuré n'est jamais 0 », appliqué au temps : la raison rendue par le
    // serveur reste affichée, on n'ajoute pas une heure qu'on n'a pas su lire.
    expect(claimNotice({ actor: 'Marc', completedAt: 'tout à l’heure', self: false }, t, 'fr-FR')).toBeNull()
  })
})
