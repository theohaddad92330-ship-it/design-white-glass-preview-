import { DEMO_USER_ACTIONS } from './demo-dataset'

/**
 * #3532 (recette Y18) — la fiche démo Société Générale devait MONTRER « Message
 * copié » et « Analyse terminée » dans « Ce qui s'est passé sur ce compte », pour
 * prouver leur traduction. Le fil est récent d'abord et plafonné à 12 lignes : des
 * lignes vieilles de 71-74 h étaient reléguées sous « Voir les lignes plus
 * anciennes ». Cette garde exige donc des lignes RÉCENTES de chaque type, et
 * sait dire NON : sans elles, elle échoue.
 */
const PLUS_RECENT_QUE_HEURES = 24

describe('démo — fiche Société Générale, historique (#3532)', () => {
  for (const type of ['analysis_completed', 'message_copied'] as const) {
    it(`porte un « ${type} » récent, rattaché au dossier`, () => {
      const rows = DEMO_USER_ACTIONS.filter(a => a.company === 'Société Générale' && a.action_type === type)
      expect(rows.some(a => a.hours_ago <= PLUS_RECENT_QUE_HEURES)).toBe(true)
    })
  }

  it('aucune trace d’ENVOI sur ce dossier : on copie, on n’envoie pas', () => {
    const sent = DEMO_USER_ACTIONS.filter(a => a.company === 'Société Générale' && a.action_type === 'message_sent')
    expect(sent).toEqual([])
  })
})
