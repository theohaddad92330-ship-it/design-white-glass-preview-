import { BACKOFFICE_AUDIT_CATEGORIES } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import {
  aUnePageSuivante,
  hrefCategorie,
  hrefFiltre,
  libelleCategorie,
  libelleResultat,
  libelleRetention,
  libellePlage,
  lireFiltre,
  origineLisible,
  sujetLisible,
} from './audit.logic'

/**
 * L'ÉCRAN D'AUDIT (#1666) — ce qu'il calcule.
 *
 * Les trois phrases de l'issue que ces tests tiennent :
 *  · « aucun filtre qui masque une catégorie entière » — un filtre se RETIRE en
 *    un clic, et les cinq catégories restent adressables quel que soit l'état ;
 *  · « suppressions : permanent » — jamais « 0 mois », jamais une case vide ;
 *  · « qui · quoi · sur quoi · quand · depuis où · résultat » — un champ absent
 *    s'écrit « — », il ne se devine pas.
 */
describe('Écran d’audit — les libellés (#1666)', () => {
  it('LIT quelque chose — les cinq catégories ont un libellé', () => {
    // Contrôle positif : un `Record` incomplet rendrait `undefined` à l'écran.
    expect(BACKOFFICE_AUDIT_CATEGORIES).toHaveLength(5)
    for (const categorie of BACKOFFICE_AUDIT_CATEGORIES) {
      expect(libelleCategorie(categorie).length).toBeGreaterThan(3)
    }
  })

  it('« permanent » se DIT — jamais « 0 mois », jamais une case vide', () => {
    expect(libelleRetention(null)).toBe('permanent')
    expect(libelleRetention(24)).toBe('24 mois')
    expect(libelleRetention(36)).toBe('36 mois')
  })

  it('les trois résultats se distinguent — un refus n’est pas une panne', () => {
    expect(libelleResultat('succes')).toBe('Réussi')
    expect(libelleResultat('refus')).toBe('Refusé')
    expect(libelleResultat('echec')).toBe('Échec')
  })
})

describe('Écran d’audit — « sur quoi » et « depuis où »', () => {
  it('le sujet se lit, nature comprise', () => {
    expect(sujetLisible({ subject_type: 'user', subject_id: 'u-1', subject_label: 'Dupont SAS' })).toBe(
      'user · Dupont SAS',
    )
    expect(sujetLisible({ subject_type: 'plan', subject_id: 'growth', subject_label: null })).toBe('plan · growth')
  })

  it('SAIT DIRE NON — un sujet absent rend « — », pas une chaîne à moitié construite', () => {
    // `'user · '` donnerait l'impression d'un sujet qu'on connaîtrait sans
    // savoir lequel.
    expect(sujetLisible({ subject_type: null, subject_id: null, subject_label: null })).toBe('—')
    expect(sujetLisible({ subject_type: 'user', subject_id: '  ', subject_label: null })).toBe('user')
  })

  it('une origine absente s’écrit « — », jamais « inconnu »', () => {
    expect(origineLisible({ ip: '203.0.113.7', country: 'FR' })).toBe('203.0.113.7 · FR')
    expect(origineLisible({ ip: null, country: 'FR' })).toBe('FR')
    expect(origineLisible({ ip: null, country: null })).toBe('—')
  })
})

describe('Écran d’audit — AUCUN FILTRE NE MASQUE UNE CATÉGORIE (#1666)', () => {
  it('cliquer une catégorie la POSE, la recliquer la RETIRE', () => {
    expect(hrefCategorie({ page: 1 }, 'impersonation')).toBe('/audit?category=impersonation')
    // Le point entier : la sortie du filtre est toujours à un clic.
    expect(hrefCategorie({ category: 'impersonation', page: 1 }, 'impersonation')).toBe('/audit')
  })

  it('les CINQ catégories restent adressables, quel que soit le filtre en cours', () => {
    // Il n'existe aucun état d'où une catégorie ne serait plus atteignable —
    // c'est ce qui distingue « restreindre » de « faire disparaître ».
    for (const depuis of BACKOFFICE_AUDIT_CATEGORIES) {
      for (const vers of BACKOFFICE_AUDIT_CATEGORIES) {
        const href = hrefCategorie({ category: depuis, page: 1 }, vers)
        expect(depuis === vers ? href : href).toContain('/audit')
        if (depuis !== vers) expect(href).toContain(`category=${vers}`)
      }
    }
  })

  it('« Toutes » ramène au journal entier', () => {
    expect(hrefCategorie({ category: 'suppression', page: 3 }, null)).toBe('/audit')
  })

  it('changer de filtre remet la PAGE à 1', () => {
    // Rester en page 4 d'un filtre qui n'en a que deux afficherait un tableau
    // vide — qui se lirait comme « aucune impersonation » alors qu'il y en a
    // quarante.
    expect(hrefFiltre({ category: 'ordinaire', page: 4 }, { category: 'suppression' })).toBe(
      '/audit?category=suppression',
    )
    // Et une pagination explicite, elle, garde sa page.
    expect(hrefFiltre({ category: 'ordinaire', page: 1 }, { page: 3 })).toBe('/audit?category=ordinaire&page=3')
  })

  it('les autres filtres survivent à un changement de catégorie', () => {
    const href = hrefCategorie({ outcome: 'refus', actorEmail: 'ops@bellum-it.com', page: 1 }, 'permission')
    expect(href).toContain('outcome=refus')
    expect(href).toContain('actorEmail=ops%40bellum-it.com')
    expect(href).toContain('category=permission')
  })
})

describe('Écran d’audit — lecture des paramètres d’URL', () => {
  it('LIT quelque chose — un filtre valide est retenu', () => {
    expect(lireFiltre({ category: 'export', outcome: 'refus', page: '2' })).toEqual({
      category: 'export',
      outcome: 'refus',
      page: 2,
    })
  })

  it('SAIT DIRE NON — une catégorie inventée est IGNORÉE, pas refusée', () => {
    // Elle rend le journal ENTIER : plus, jamais moins. Une page d'erreur sur
    // l'écran d'audit serait le pire des deux.
    expect(lireFiltre({ category: 'impersonations' })).not.toHaveProperty('category')
    expect(lireFiltre({ page: 'deux' }).page).toBe(1)
    expect(lireFiltre({ page: '-3' }).page).toBe(1)
  })

  it('n’attrape pas ce qu’elle ne vise pas — un tableau de valeurs prend la première', () => {
    expect(lireFiltre({ category: ['suppression', 'export'] }).category).toBe('suppression')
  })
})

describe('Écran d’audit — la pagination dit ce qu’elle montre', () => {
  it('la plage se lit', () => {
    expect(libellePlage(50, 50, 412)).toBe('51 – 100 sur 412')
    expect(libellePlage(0, 12, 12)).toBe('1 – 12 sur 12')
  })

  it('une page vide le DIT, avec le total du filtre', () => {
    // « 0 sur 412 » se lit comme un filtre trop étroit ; « 0 » tout court se
    // lirait comme un journal vide.
    expect(libellePlage(400, 0, 412)).toBe('0 sur 412')
  })

  it('la page suivante n’existe que s’il reste des lignes', () => {
    expect(aUnePageSuivante(0, 50, 412)).toBe(true)
    expect(aUnePageSuivante(400, 12, 412)).toBe(false)
  })
})
