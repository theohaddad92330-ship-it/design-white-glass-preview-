import { describe, expect, it } from 'vitest'
import type { FeedbackItem } from '@/lib/feedback'
import {
  MIN_RETOURS_POUR_UNE_MEDIANE,
  delaiDeReponse,
  ecranDe,
  grouperParEcran,
  medianeDesDelais,
  type DelaiReponse,
} from './feedback.logic'

/**
 * #1658.2 — le délai de réponse, sa médiane, et le regroupement par écran.
 *
 * L'environnement du back-office est `node` : ce qui se teste ici est la
 * DÉRIVATION. Ce qui se voit à l'écran se recette en direct.
 */

const MAINTENANT = new Date('2026-09-07T12:00:00Z')
const HEURE = 3_600_000

function retour(patch: Partial<FeedbackItem> = {}): FeedbackItem {
  return {
    id: 'f1',
    user_id: 'u1',
    account_id: null,
    category: 'bug',
    message: 'ça plante',
    user_email: null,
    page_url: null,
    user_agent: null,
    console_logs: null,
    client_context: null,
    github_issue_number: 100,
    github_issue_url: 'https://github.com/o/r/issues/100',
    created_at: '2026-09-05T12:00:00Z',
    issue: null,
    ...patch,
  }
}

describe('le délai de réponse d’un retour', () => {
  const lisible = { maintenant: MAINTENANT, responsesAvailable: true }

  it('mesure de l’ouverture à la PREMIÈRE réponse', () => {
    const delai = delaiDeReponse(retour({ first_response_at: '2026-09-05T16:00:00Z' }), lisible)
    expect(delai).toEqual({
      etat: 'repondu',
      msEcoules: 4 * HEURE,
      premiereReponseAt: '2026-09-05T16:00:00Z',
    })
  })

  it('un retour sans réponse est EN ATTENTE, avec l’attente à ce jour', () => {
    const delai = delaiDeReponse(retour({ first_response_at: null }), lisible)
    expect(delai).toEqual({ etat: 'en_attente', msEcoules: 48 * HEURE })
  })

  it('DISTINGUE « personne n’a répondu » de « je n’ai pas pu regarder »', () => {
    // Le même retour, la même donnée absente — deux verdicts, parce que la
    // question « a-t-on regardé ? » n'a pas la même réponse. Les confondre
    // annoncerait une dette de réponse sur tout le monde un jour de panne.
    const enAttente = delaiDeReponse(retour({ first_response_at: null }), lisible)
    const inconnu = delaiDeReponse(retour({ first_response_at: null }), {
      maintenant: MAINTENANT,
      responsesAvailable: false,
    })
    expect(enAttente.etat).toBe('en_attente')
    expect(inconnu.etat).toBe('inconnu')
  })

  it('un retour SANS issue n’attend rien — il n’y a nulle part où répondre', () => {
    const delai = delaiDeReponse(retour({ github_issue_number: null }), lisible)
    expect(delai.etat).toBe('inconnu')
    if (delai.etat === 'inconnu') expect(delai.raison).toContain('aucune issue')
  })

  it('refuse un délai NÉGATIF plutôt que de rendre un nombre qu’on sait faux', () => {
    const delai = delaiDeReponse(
      retour({ created_at: '2026-09-05T12:00:00Z', first_response_at: '2026-09-04T12:00:00Z' }),
      lisible,
    )
    expect(delai.etat).toBe('inconnu')
  })

  it('une date illisible n’est pas l’époque Unix — elle est inconnue', () => {
    expect(delaiDeReponse(retour({ created_at: 'pas une date' }), lisible).etat).toBe('inconnu')
    // Et une réponse illisible retombe sur l'attente, pas sur 56 ans de délai.
    expect(delaiDeReponse(retour({ first_response_at: 'n’importe quoi' }), lisible).etat).toBe('en_attente')
  })

  it('une réponse identique à l’ouverture vaut ZÉRO, et c’est une vraie mesure', () => {
    const delai = delaiDeReponse(
      retour({ created_at: '2026-09-05T12:00:00Z', first_response_at: '2026-09-05T12:00:00Z' }),
      lisible,
    )
    expect(delai).toMatchObject({ etat: 'repondu', msEcoules: 0 })
  })

  it('EXPOSE de quoi brancher la file de décision, sans la recalculer', () => {
    // #1647 livre la nature `feedback_unanswered` ; ce module ne la code pas.
    // Ce test fige le contrat : un retour à brancher est un `en_attente`, et
    // `msEcoules` porte l'attente. La file lira ce champ.
    const vieux = delaiDeReponse(retour({ created_at: '2026-09-05T11:00:00Z', first_response_at: null }), lisible)
    expect(vieux.etat).toBe('en_attente')
    if (vieux.etat === 'en_attente') expect(vieux.msEcoules).toBe(49 * HEURE)
  })
})

describe('la médiane des délais', () => {
  function repondu(heures: number): DelaiReponse {
    return { etat: 'repondu', msEcoules: heures * HEURE, premiereReponseAt: '2026-09-05T12:00:00Z' }
  }

  it('LE TEST DE L’ISSUE — sous trois retours, « trop peu », jamais un chiffre', () => {
    expect(medianeDesDelais([repondu(2), repondu(4)])).toEqual({ etat: 'trop_peu', retenus: 2 })
    expect(MIN_RETOURS_POUR_UNE_MEDIANE).toBe(3)
  })

  it('à trois retours, elle se mesure — la valeur du milieu', () => {
    expect(medianeDesDelais([repondu(10), repondu(2), repondu(4)])).toEqual({
      etat: 'mesuree',
      msEcoules: 4 * HEURE,
      retenus: 3,
    })
  })

  it('sur un nombre PAIR, c’est la moyenne des deux valeurs centrales', () => {
    expect(medianeDesDelais([repondu(2), repondu(4), repondu(6), repondu(12)])).toMatchObject({
      etat: 'mesuree',
      msEcoules: 5 * HEURE,
    })
  })

  it('EXCLUT les retours en attente — leur délai n’est pas encore connu', () => {
    // Les inclure ferait BAISSER la médiane à chaque retour resté sans réponse :
    // l'inverse de ce qu'elle doit dire. Même règle qu'un axe non mesuré qui
    // sort du dénominateur.
    const delais: DelaiReponse[] = [
      repondu(10),
      repondu(20),
      repondu(30),
      { etat: 'en_attente', msEcoules: HEURE },
      { etat: 'en_attente', msEcoules: HEURE },
    ]
    expect(medianeDesDelais(delais)).toEqual({ etat: 'mesuree', msEcoules: 20 * HEURE, retenus: 3 })
  })

  it('quand RIEN n’a pu être lu, elle est inconnue — pas « trop peu de retours »', () => {
    const delais: DelaiReponse[] = [
      { etat: 'inconnu', raison: 'GitHub muet' },
      { etat: 'inconnu', raison: 'GitHub muet' },
    ]
    expect(medianeDesDelais(delais)).toMatchObject({ etat: 'inconnue' })
  })

  it('sur une liste vide, elle dit « trop peu » plutôt que zéro', () => {
    expect(medianeDesDelais([])).toEqual({ etat: 'trop_peu', retenus: 0 })
  })
})

describe('l’écran d’un retour', () => {
  it('préfère la route que l’APPLICATION connaît à l’URL', () => {
    const item = retour({
      page_url: 'https://app.bellum-ai.com/accounts?tab=2',
      client_context: { appContext: { route: '/integrations' } },
    })
    expect(ecranDe(item)).toBe('/integrations')
  })

  it('retombe sur le chemin de l’URL quand la route manque', () => {
    expect(ecranDe(retour({ page_url: 'https://app.bellum-ai.com/clients?view=esn' }))).toBe('/clients')
    expect(ecranDe(retour({ page_url: '/feedback?state=open' }))).toBe('/feedback')
  })

  it('remplace les identifiants par `:id` — sinon chaque dossier ferait son groupe', () => {
    expect(ecranDe(retour({ page_url: 'https://x/analysis/9f2c1a4e-1111-4222-8333-444455556666' }))).toBe(
      '/analysis/:id',
    )
    expect(ecranDe(retour({ client_context: { appContext: { route: '/run/1287' } } }))).toBe('/run/:id')
  })

  it('rend `null` quand rien n’est lisible — un écran deviné n’est pas une réponse', () => {
    expect(ecranDe(retour({ page_url: null, client_context: null }))).toBeNull()
    expect(ecranDe(retour({ page_url: 'pas-une-url' }))).toBeNull()
  })

  it('la racine reste la racine', () => {
    expect(ecranDe(retour({ page_url: 'https://app.bellum-ai.com/' }))).toBe('/')
  })
})

describe('le regroupement par écran', () => {
  function surEcran(id: string, route: string | null): FeedbackItem {
    return retour({ id, client_context: route ? { appContext: { route } } : null, page_url: null })
  }

  it('LIT quelque chose — deux retours du même écran font UN groupe', () => {
    const groupes = grouperParEcran([surEcran('a', '/clients'), surEcran('b', '/clients')])
    expect(groupes).toHaveLength(1)
    expect(groupes[0]?.ecran).toBe('/clients')
    expect(groupes[0]?.items.map(i => i.id)).toEqual(['a', 'b'])
  })

  it('classe du plus signalé au moins signalé — c’est la question posée', () => {
    const groupes = grouperParEcran([
      surEcran('a', '/feedback'),
      surEcran('b', '/clients'),
      surEcran('c', '/clients'),
      surEcran('d', '/clients'),
      surEcran('e', '/revenus'),
      surEcran('f', '/revenus'),
    ])
    expect(groupes.map(g => g.ecran)).toEqual(['/clients', '/revenus', '/feedback'])
  })

  it('à volume égal, l’ordre est l’alphabet — deux chargements rendent le même écran', () => {
    const groupes = grouperParEcran([surEcran('a', '/zeta'), surEcran('b', '/alpha')])
    expect(groupes.map(g => g.ecran)).toEqual(['/alpha', '/zeta'])
  })

  it('« écran non estampillé » se range EN DERNIER, même s’il est le plus gros', () => {
    // Une lacune d'instrumentation ne doit pas passer pour la pire page du
    // produit.
    const groupes = grouperParEcran([
      surEcran('a', null),
      surEcran('b', null),
      surEcran('c', null),
      surEcran('d', '/clients'),
    ])
    expect(groupes.map(g => g.libelle)).toEqual(['/clients', 'Écran non estampillé'])
    expect(groupes[1]?.items).toHaveLength(3)
  })

  it('ne perd aucun retour en chemin', () => {
    const items = [surEcran('a', '/x'), surEcran('b', null), surEcran('c', '/y'), surEcran('d', '/x')]
    const groupes = grouperParEcran(items)
    expect(groupes.flatMap(g => g.items)).toHaveLength(items.length)
  })

  it('n’invente aucun groupe sur une liste vide', () => {
    expect(grouperParEcran([])).toEqual([])
  })
})
