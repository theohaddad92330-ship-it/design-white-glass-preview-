import { describe, expect, it } from 'vitest'
import type { Anomalie } from '@/lib/etat-securite'
import {
  FENETRE_JOURS_DEFAUT,
  FENETRES_PROPOSEES,
  couleurAnomalie,
  hrefFenetre,
  libelleEvenement,
  libellePurge,
  libelleTypeAnomalie,
  lireFenetre,
  resumeParType,
} from './securite.logic'

/**
 * L'ÉCRAN /securite (#1671.3, #1671.4) — ce qu'il calcule.
 *
 * Trois choses tenues ici, séparées du rendu pour être testées sans jsdom :
 *  · les trois signaux de #1671.3 ont un LIBELLÉ et une COULEUR ;
 *  · « ce qui a été purgé et quand » se dit, jamais deviné — un journal vide
 *    n'est pas la même phrase qu'un journal purgé depuis une certaine date ;
 *  · la fenêtre d'observation se lit et s'écrit dans l'URL, bornée comme côté
 *    API (1 à 365 jours) — jamais une valeur démesurée.
 */
describe('Écran /securite — les libellés (#1671.3, #1671.4)', () => {
  it('LIT quelque chose — les trois types d’anomalie ont un libellé ET une couleur', () => {
    const types: Anomalie['type'][] = ['rafale_echecs', 'pays_inhabituel', 'heure_inhabituelle']
    for (const type of types) {
      expect(libelleTypeAnomalie(type).length).toBeGreaterThan(3)
      expect(couleurAnomalie(type)).toMatch(/^var\(--\w+\)$/)
    }
  })

  it('une rafale d’échecs est en ROUGE — c’est le signal le plus critique (force brute en cours)', () => {
    expect(couleurAnomalie('rafale_echecs')).toBe('var(--red)')
  })

  it('un pays ou une heure inhabituels sont en AMBRE — un signal à vérifier, pas une alarme', () => {
    expect(couleurAnomalie('pays_inhabituel')).toBe('var(--amber)')
    expect(couleurAnomalie('heure_inhabituelle')).toBe('var(--amber)')
  })

  it('libelleEvenement couvre les neuf événements connus du journal', () => {
    const evenements = [
      'connexion',
      'connexion_refusee',
      'acces_refuse',
      'deconnexion',
      'enrolement_demarre',
      'enrolement_confirme',
      'enrolement_refuse',
      'capacite_refusee',
      'email_revele',
    ]
    for (const event of evenements) {
      expect(libelleEvenement(event).length).toBeGreaterThan(2)
      // Pas de clé technique laissée telle quelle (snake_case) dans un libellé.
      expect(libelleEvenement(event)).not.toContain('_')
    }
  })

  it('un événement inconnu ne casse pas l’écran — il rend sa valeur brute plutôt qu’une erreur', () => {
    expect(libelleEvenement('un_futur_evenement')).toBe('un_futur_evenement')
  })

  it('« ce qui a été purgé et quand » — un journal VIDE se dit, jamais « — » tout court', () => {
    const phrase = libellePurge(null)
    expect(phrase.length).toBeGreaterThan(15)
    expect(phrase.toLowerCase()).toContain('vide')
  })

  it('avec une plus ancienne entrée, la phrase NOMME la date ET la cadence de purge', () => {
    const phrase = libellePurge('2025-09-08T00:00:00.000Z')
    expect(phrase).toContain('08/09/2025')
    expect(phrase.toLowerCase()).toContain('purge')
  })

  it('resumeParType compte chaque type — zéro anomalie d’un type est un VRAI zéro, pas une absence', () => {
    const anomalies: Anomalie[] = [
      { type: 'rafale_echecs', actorEmail: 'a@x.fr', at: '2026-09-07T10:00:00Z', detail: 'x' },
      { type: 'rafale_echecs', actorEmail: 'b@x.fr', at: '2026-09-07T10:00:00Z', detail: 'x' },
      { type: 'pays_inhabituel', actorEmail: 'c@x.fr', at: '2026-09-07T10:00:00Z', detail: 'x' },
    ]
    const resume = resumeParType(anomalies)
    expect(resume.rafale_echecs).toBe(2)
    expect(resume.pays_inhabituel).toBe(1)
    expect(resume.heure_inhabituelle).toBe(0)
  })

  it('lireFenetre — un paramètre absent rend le défaut de #1671.4', () => {
    expect(lireFenetre({})).toBe(FENETRE_JOURS_DEFAUT)
  })

  it('lireFenetre — une valeur illisible ne casse pas l’écran, elle retombe sur le défaut', () => {
    expect(lireFenetre({ jours: 'abc' })).toBe(FENETRE_JOURS_DEFAUT)
    expect(lireFenetre({ jours: ['30', '90'] })).toBe(30)
  })

  it('lireFenetre — bornée comme côté API : jamais moins de 1, jamais plus de 365', () => {
    expect(lireFenetre({ jours: '0' })).toBe(1)
    expect(lireFenetre({ jours: '-5' })).toBe(1)
    expect(lireFenetre({ jours: '999999' })).toBe(365)
  })

  it('hrefFenetre construit un lien stable, sans paramètre pour le défaut', () => {
    expect(hrefFenetre(FENETRE_JOURS_DEFAUT)).toBe('/securite')
    expect(hrefFenetre(7)).toBe('/securite?jours=7')
    expect(hrefFenetre(90)).toBe('/securite?jours=90')
  })

  it('les fenêtres proposées à l’écran incluent le défaut', () => {
    expect(FENETRES_PROPOSEES).toContain(FENETRE_JOURS_DEFAUT)
    expect(FENETRES_PROPOSEES.length).toBeGreaterThanOrEqual(3)
  })
})
