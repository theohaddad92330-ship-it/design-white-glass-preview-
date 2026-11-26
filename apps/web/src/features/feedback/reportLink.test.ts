import { FEEDBACK_MESSAGE_MAX } from '@bellum/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { REPORT_LINK_TARGET, onReportRequest, parseReportLink, requestReport } from './reportLink'

/**
 * #1960.4 — LE LIEN QUE LAURA ÉCRIT POUR OUVRIR LE SIGNALEMENT EXISTANT.
 *
 * Laura ne crée aucun ticket : elle écrit `[Signaler ce problème](#signaler:…)`,
 * et ce module dit ce que ce lien contient — la description pré-remplie, rien
 * d'autre. Le texte vient d'un MODÈLE : il est borné, jamais interprété, et la
 * personne le relit dans le formulaire avant tout envoi.
 *
 * Les cinq descriptions ci-dessous sont les critères de recette #1960.15 → .19,
 * écrits comme Laura les encode (espaces en `%20`, accents bruts ou encodés).
 */
describe('parseReportLink', () => {
  it.each([
    ['1960.15 bug fonctionnel', 'Le%20bouton%20Enrichir%20ne%20fait%20rien', 'Le bouton Enrichir ne fait rien'],
    [
      '1960.16 connecteur expiré',
      'Mon%20CRM%20est%20déconnecté%20depuis%20ce%20matin',
      'Mon CRM est déconnecté depuis ce matin',
    ],
    [
      '1960.17 donnée fausse',
      'Le%20d%C3%A9cideur%20affich%C3%A9%20a%20quitt%C3%A9%20l%27entreprise',
      "Le décideur affiché a quitté l'entreprise",
    ],
    ['1960.18 facturation', 'On%20m%27a%20débité%20deux%20fois%20mes%20crédits', "On m'a débité deux fois mes crédits"],
    [
      '1960.19 perte de session',
      'Je%20suis%20déconnecté%20à%20chaque%20rafraîchissement',
      'Je suis déconnecté à chaque rafraîchissement',
    ],
  ])('%s — rend la description décodée', (_case, encoded, expected) => {
    expect(parseReportLink(`${REPORT_LINK_TARGET}:${encoded}`)).toEqual({ message: expected })
  })

  it('ouvre un formulaire vide quand Laura n’a rien résumé', () => {
    expect(parseReportLink(REPORT_LINK_TARGET)).toEqual({ message: '' })
    expect(parseReportLink(`${REPORT_LINK_TARGET}:`)).toEqual({ message: '' })
  })

  it('garde le texte brut quand l’encodage est cassé, au lieu de tout perdre', () => {
    expect(parseReportLink(`${REPORT_LINK_TARGET}:100%%20bloqué`)).toEqual({ message: '100%%20bloqué' })
  })

  it('borne la description au plafond du contrat', () => {
    const long = 'a'.repeat(FEEDBACK_MESSAGE_MAX + 50)
    expect(parseReportLink(`${REPORT_LINK_TARGET}:${long}`)?.message).toHaveLength(FEEDBACK_MESSAGE_MAX)
  })

  // ⚠️ La garde sait dire NON : un chemin d'écran, une adresse externe ou un
  // jeton voisin ne sont PAS des liens de signalement — ils gardent leur chemin
  // d'avant (`appRouteTarget`), qui les refuse ou les navigue.
  it.each([['/accounts'], ['https://ailleurs.example'], ['#signalerX'], ['#report:Le%20bouton'], ['signaler:bug']])(
    'ne reconnaît pas %s',
    target => {
      expect(parseReportLink(target)).toBeNull()
    },
  )
})

describe('requestReport / onReportRequest', () => {
  afterEach(() => vi.restoreAllMocks())

  it('transmet la demande à qui écoute, et se désabonne proprement', () => {
    const listener = vi.fn()
    const unsubscribe = onReportRequest(listener)

    requestReport({ message: 'Le bouton ne fait rien' })
    expect(listener).toHaveBeenCalledWith({ message: 'Le bouton ne fait rien' })

    unsubscribe()
    requestReport({ message: 'encore' })
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
