import { readChatDraft, writeChatDraft } from '@/features/chat/lib/composer-draft'
import { dismissCandidate, readShortlist } from '@/features/discover/lib/discover-shortlist'
import { clearVolatileUserState } from './clear-client-user-state'

/**
 * #1953.15-.18 — la purge à la déconnexion emporte aussi le brouillon.
 *
 * Un brouillon porte l'identifiant de l'UTILISATEUR (`composer-draft.ts`) :
 * c'est une donnée de compte, pas une préférence de poste, et elle doit donc
 * partir au même endroit que le reste de `clearVolatileUserState` plutôt
 * qu'attendre sa propre expiration à 7 jours.
 */

beforeEach(() => {
  localStorage.clear()
})

/**
 * #3880.5 — UN CHANGEMENT D'ESPACE NE REJOUE PAS LE TRAVAIL D'UN AUTRE.
 *
 * `clearVolatileUserState` est le SEUL sweep (#2644.1, GA-43 : « aucune
 * donnée d'un espace ne survit à la frontière suivante ») appelé par
 * `useWorkspaces.switchWorkspace` ET par la déconnexion
 * (`session-manager.ts`). La shortlist « Suivre »/« Écarter » de Découvrir
 * (`discover-shortlist.ts`) est scopée par UTILISATEUR, jamais par espace
 * (`discover-storage.ts` ne connaît que `userId`) — exactement la même classe
 * de défaut que le scroll infini des comptes/contacts que #2644.1 a déjà
 * corrigée pour cette fonction, mais jamais étendue à Découvrir : le candidat
 * qu'un commercial a écarté chez un espace client réapparaîtrait écarté chez
 * un autre espace du même utilisateur, sans qu'aucune donnée de cet autre
 * espace l'ait jamais justifié.
 */
describe('clearVolatileUserState (#3880.5)', () => {
  it('efface la shortlist Découvrir (Suivre/Écarter) pour ne pas la faire traverser un changement d’espace', () => {
    dismissCandidate('user-1', '552100554')
    expect(readShortlist('user-1').dismissed.has('552100554')).toBe(true)

    clearVolatileUserState()

    expect(readShortlist('user-1').dismissed.has('552100554')).toBe(false)
  })
})

describe('clearVolatileUserState', () => {
  it('efface les brouillons de saisie de Laura', () => {
    writeChatDraft('u1', 'thread-1', 'Un brouillon encore ouvert')
    expect(readChatDraft('u1', 'thread-1')).toBe('Un brouillon encore ouvert')

    clearVolatileUserState()

    expect(readChatDraft('u1', 'thread-1')).toBe('')
  })

  it('ne touche pas les préférences de poste sans rapport (thème, etc.)', () => {
    localStorage.setItem('bellum:theme', 'dark')
    writeChatDraft('u1', 'thread-1', 'Un brouillon')

    clearVolatileUserState()

    expect(localStorage.getItem('bellum:theme')).toBe('dark')
  })
})
