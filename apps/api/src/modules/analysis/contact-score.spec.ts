import type { ContactApolloDetails } from '@bellum/contracts'
import { contactSourceTag, currentPositionTitle, employerConflict, enrichmentPositionTitle } from './contact-score'

// #2632.1 — l'écran ne détectait que les DÉPARTS (`RISQUE`, employeur courant
// ≠ compte), jamais les ARRIVÉES. Un contact dont l'historique Apollo montre
// un employeur DIFFÉRENT juste avant l'entrée courante — qui, elle, correspond
// au compte — vient d'y arriver : `ARRIVEE` en miroir déterministe de
// `RISQUE`, à partir des mêmes données déjà collectées (aucune date inventée,
// aucun appel externe neuf).
describe('#2632.1 — contactSourceTag détecte une arrivée récente (ARRIVEE)', () => {
  it('tague ARRIVEE un contact dont l’historique montre un employeur précédent différent du compte', () => {
    const apolloDetails = {
      employmentHistory: [
        { organization: 'Capgemini', current: false },
        { organization: 'Société Générale SA', current: true },
      ],
    }
    expect(contactSourceTag('apollo', apolloDetails, 'Société Générale', null)).toBe('ARRIVEE')
  })

  it('ne tague PAS ARRIVEE un contact sans historique antérieur (une seule entrée courante)', () => {
    const apolloDetails = {
      employmentHistory: [{ organization: 'Société Générale SA', current: true }],
    }
    expect(contactSourceTag('apollo', apolloDetails, 'Société Générale', null)).toBe('PUBLIC')
  })

  it('ne tague PAS ARRIVEE quand l’employeur précédent est la même entité (promotion interne, pas une arrivée)', () => {
    const apolloDetails = {
      employmentHistory: [
        { organization: 'Société Générale SA', current: false },
        { organization: 'Société Générale SA', current: true },
      ],
    }
    expect(contactSourceTag('apollo', apolloDetails, 'Société Générale', null)).toBe('PUBLIC')
  })

  it('RISQUE l’emporte toujours sur ARRIVEE : un employeur courant qui ne correspond pas reste un départ', () => {
    const apolloDetails = {
      employmentHistory: [
        { organization: 'Société Générale SA', current: false },
        { organization: 'Capgemini', current: true },
      ],
    }
    expect(contactSourceTag('apollo', apolloDetails, 'Société Générale', null)).toBe('RISQUE')
  })
})

// #2296.10/.36/.37 — « une correction humaine gagne toujours, quelle que soit
// sa date » : une ligne humaine (manual/crm) ne bascule plus silencieusement
// RISQUE quand un fournisseur rapporte un employeur différent — le désaccord
// se NOMME (`employerConflict`) au lieu d'écraser le fait humain.
describe('#2296.10/.36/.37 — la correction humaine gagne, le conflit se nomme', () => {
  const mismatchingApollo = { organization: 'Capgemini' }

  it('ne tague JAMAIS RISQUE une ligne "manual" en désaccord avec un fournisseur', () => {
    expect(contactSourceTag('manual', mismatchingApollo, 'Société Générale', null)).toBe('INTERNE')
  })

  it('ne tague JAMAIS RISQUE une ligne "crm" en désaccord avec un fournisseur', () => {
    expect(contactSourceTag('crm', mismatchingApollo, 'Société Générale', null)).toBe('INTERNE')
  })

  it('tague TOUJOURS RISQUE une ligne non humaine (comportement inchangé)', () => {
    expect(contactSourceTag('apollo', mismatchingApollo, 'Société Générale', null)).toBe('RISQUE')
  })

  it('employerConflict NOMME le désaccord sur une ligne humaine', () => {
    expect(employerConflict('manual', mismatchingApollo, 'Société Générale', null)).toEqual({
      detectedEmployer: 'Capgemini',
    })
  })

  it('employerConflict est absent sur une ligne non humaine (déjà RISQUE, rien à nommer en plus)', () => {
    expect(employerConflict('apollo', mismatchingApollo, 'Société Générale', null)).toBeNull()
  })

  it('employerConflict est absent quand les deux sources s’accordent', () => {
    expect(employerConflict('manual', { organization: 'Société Générale SA' }, 'Société Générale', null)).toBeNull()
  })

  it('employerConflict est absent sans signal fournisseur', () => {
    expect(employerConflict('manual', null, 'Société Générale', null)).toBeNull()
  })
})

// #3911.1 — homonyme d'entreprise : la recherche qui a trouvé ce contact n'avait
// aucune ancre EXACTE (id Apollo / domaine), seulement le nom en texte libre —
// deux entités homonymes la passent toutes les deux. `contactSourceTag` dégrade
// alors PUBLIC (annuaire vérifié) en HYPOTHÈSE (même sémantique que l'inféré non
// vérifié) plutôt que de présenter un rattachement non contrôlé comme sûr.
describe('#3911.1 — employerUnverified dégrade PUBLIC en HYPOTHÈSE', () => {
  it('dégrade un contact Apollo trouvé sans ancre exacte', () => {
    const apolloDetails = { organization: 'Société Générale', employerUnverified: true }
    expect(contactSourceTag('apollo', apolloDetails, 'Société Générale', null)).toBe('HYPOTHÈSE')
  })

  it('ne dégrade rien quand la recherche avait une ancre exacte (comportement historique)', () => {
    const apolloDetails = { organization: 'Société Générale' }
    expect(contactSourceTag('apollo', apolloDetails, 'Société Générale', null)).toBe('PUBLIC')
  })

  it('RISQUE l’emporte toujours sur la dégradation (un départ reste un départ)', () => {
    const apolloDetails = { organization: 'Capgemini', employerUnverified: true }
    expect(contactSourceTag('apollo', apolloDetails, 'Société Générale', null)).toBe('RISQUE')
  })

  it('ARRIVEE l’emporte toujours sur la dégradation', () => {
    const apolloDetails = {
      employerUnverified: true,
      employmentHistory: [
        { organization: 'Capgemini', current: false },
        { organization: 'Société Générale SA', current: true },
      ],
    }
    expect(contactSourceTag('apollo', apolloDetails, 'Société Générale', null)).toBe('ARRIVEE')
  })

  it('une ligne humaine (manual/crm) n’est jamais dégradée par ce signal fournisseur', () => {
    const apolloDetails = { organization: 'Société Générale', employerUnverified: true }
    expect(contactSourceTag('manual', apolloDetails, 'Société Générale', null)).toBe('INTERNE')
  })
})

// #4465 — la FONCTION et la PRÉSENCE se lisent sur l'expérience EN COURS chez le compte, jamais sur une terminée.
describe('#4465 — l’expérience en cours chez le compte décide de la présence', () => {
  const apollo = (
    employmentHistory: NonNullable<ContactApolloDetails['employmentHistory']>,
    organization = 'CAFPI',
  ) => ({
    organization,
    employmentHistory,
  })

  it('une personne partie depuis un an (toutes les expériences terminées, la dernière chez le compte) est RISQUE', () => {
    const details = apollo([
      { title: 'DSI', organization: 'Cafpi', current: false, start_date: '2019-01-01', end_date: '2025-10-01' },
      {
        title: 'Consultant',
        organization: 'Autre ESN',
        current: false,
        start_date: '2015-01-01',
        end_date: '2018-12-31',
      },
    ])
    expect(contactSourceTag('apollo', details, 'CAFPI', null)).toBe('RISQUE')
  })

  it('jamais RISQUE sur une ligne humaine, même parti : une correction humaine gagne', () => {
    const details = apollo([{ title: 'DSI', organization: 'Cafpi', current: false, end_date: '2025-10-01' }])
    expect(contactSourceTag('manual', details, 'CAFPI', null)).not.toBe('RISQUE')
  })

  it('sans date de fin prouvée (current faux seul), le départ n’est pas affirmé', () => {
    const details = apollo([{ title: 'DSI', organization: 'Cafpi', current: false }])
    expect(contactSourceTag('apollo', details, 'CAFPI', null)).not.toBe('RISQUE')
  })

  it('sans historique, jamais RISQUE : on ne conclut pas sur une absence', () => {
    expect(contactSourceTag('apollo', { organization: 'CAFPI' }, 'CAFPI', null)).not.toBe('RISQUE')
  })

  it('deux expériences en cours dont une chez le compte : la personne y est (pas RISQUE)', () => {
    const details = apollo([
      { title: 'Administrateur', organization: 'Association Z', current: true, start_date: '2024-01-01' },
      { title: 'DSI', organization: 'Cafpi', current: true, start_date: '2020-01-01' },
    ])
    expect(contactSourceTag('apollo', details, 'CAFPI', null)).not.toBe('RISQUE')
  })

  it('une expérience terminée chez un autre employeur ne fait pas RISQUE quand l’en-cours est chez le compte', () => {
    const details = apollo([
      {
        title: 'Directeur',
        organization: 'Banque Y',
        current: false,
        start_date: '2015-01-01',
        end_date: '2019-01-01',
      },
      { title: 'DSI', organization: 'Cafpi', current: true, start_date: '2019-02-01' },
    ])
    expect(contactSourceTag('apollo', details, 'CAFPI', null)).not.toBe('RISQUE')
  })
})

describe('#4465 — currentPositionTitle', () => {
  const history = [
    {
      title: 'Directeur de projets',
      organization: 'Cafpi',
      current: false,
      start_date: '2019-02-01',
      end_date: '2022-12-31',
    },
    { title: 'DSI', organization: 'Cafpi', current: true, start_date: '2023-01-01' },
  ]
  it('rend le titre de l’expérience en cours la plus récente chez le compte', () => {
    expect(currentPositionTitle(history, ['CAFPI'])).toBe('DSI')
  })
  it('rend null quand aucune expérience en cours chez le compte', () => {
    expect(currentPositionTitle(history.slice(0, 1), ['CAFPI'])).toBeNull()
    expect(currentPositionTitle([], ['CAFPI'])).toBeNull()
    expect(currentPositionTitle(history, [])).toBeNull()
  })
})

describe('#4465 — enrichmentPositionTitle', () => {
  const history = [
    {
      organization_name: 'Cafpi',
      title: 'Directeur de projets',
      current: false,
      start_date: '2019-02-01',
      end_date: '2022-12-31',
    },
    { organization_name: 'Cafpi', title: 'DSI', current: true, start_date: '2023-01-01', end_date: null },
  ]
  it('corrige une fonction périmée par l’expérience en cours', () => {
    expect(
      enrichmentPositionTitle({
        source: 'apollo',
        currentTitle: 'Directeur de projets',
        history,
        employerNames: ['CAFPI'],
      }),
    ).toBe('DSI')
  })
  it('ne touche jamais une ligne saisie par un humain (manual / crm)', () => {
    for (const source of ['manual', 'crm']) {
      expect(enrichmentPositionTitle({ source, currentTitle: 'Autre', history, employerNames: ['CAFPI'] })).toBeNull()
    }
  })
  it('ne réécrit pas la bonne fonction, ni sur un historique muet', () => {
    expect(
      enrichmentPositionTitle({ source: 'apollo', currentTitle: 'DSI', history, employerNames: ['CAFPI'] }),
    ).toBeNull()
    expect(
      enrichmentPositionTitle({ source: 'apollo', currentTitle: 'DSI', history: null, employerNames: ['CAFPI'] }),
    ).toBeNull()
  })
})
