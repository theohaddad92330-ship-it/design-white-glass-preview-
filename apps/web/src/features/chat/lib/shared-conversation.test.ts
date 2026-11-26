import { describe, expect, it } from 'vitest'
import { sharedConversationAuthors } from './shared-conversation'

/**
 * #1910.8 — « CONVERSATION PARTAGÉE » COMME ÉTAT DE PÉRIMÈTRE.
 *
 * Un fil de Laura est team-scopé côté serveur depuis la phase 2
 * multi-utilisateur : `GET /chat/messages` résout l'espace de l'appelant et rend
 * le fil de cet espace sans regarder qui l'a écrit (voir `ShareConversation`).
 * Tous les fils sont donc PARTAGEABLES — ce qui rend l'information inutile si on
 * l'affiche partout.
 *
 * Ce qui se DIT est ce qui se MESURE : un collègue a effectivement écrit dans ce
 * fil. C'est « non mesuré n'est jamais 0 » appliqué à un état d'interface — ne
 * rien dire quand on ne peut pas prouver, plutôt que d'afficher une étiquette
 * vraie en théorie et vide de sens à l'écran.
 *
 * ⚠️ La sous-estimation est ASSUMÉE. L'API ne rend aucun identifiant d'auteur
 * (`WorkspaceAuthor = { firstName, avatarUrl }`, délibérément : « jamais
 * d'e-mail ni d'identifiant ») : deux collègues prénommés pareil, ou un auteur
 * que le serveur n'a pas pu résoudre, ne se comptent pas. On tait alors l'état
 * au lieu de le deviner — se tromper dans ce sens ne raconte rien de faux.
 */
describe('sharedConversationAuthors — qui d’autre a écrit dans ce fil', () => {
  const me = { firstName: 'Théo', avatarUrl: null }

  it('un fil où je suis seul n’est pas annoncé comme partagé', () => {
    expect(
      sharedConversationAuthors(
        [
          { role: 'user', author: me },
          { role: 'assistant', author: null },
          // Une bulle tapée dans CET onglet : pas encore relue, donc pas de champ.
          { role: 'user' },
        ],
        me,
      ),
    ).toBeNull()
  })

  it('un fil où un collègue a écrit le dit, et le NOMME', () => {
    expect(
      sharedConversationAuthors(
        [
          { role: 'user', author: me },
          { role: 'user', author: { firstName: 'Sarah', avatarUrl: null } },
        ],
        me,
      ),
    ).toEqual(['Sarah'])
  })

  it('deux collègues sont nommés une seule fois chacun, dans l’ordre du fil', () => {
    expect(
      sharedConversationAuthors(
        [
          { role: 'user', author: { firstName: 'Sarah', avatarUrl: null } },
          { role: 'user', author: { firstName: 'Léa', avatarUrl: null } },
          { role: 'user', author: { firstName: 'Sarah', avatarUrl: null } },
          { role: 'user', author: me },
        ],
        me,
      ),
    ).toEqual(['Sarah', 'Léa'])
  })

  it('une réponse de Laura n’est l’auteur de personne', () => {
    expect(
      sharedConversationAuthors([{ role: 'assistant', author: { firstName: 'Sarah', avatarUrl: null } }], me),
    ).toBeNull()
  })

  it('un auteur que le serveur n’a pas su résoudre ne compte pas — on ne devine pas un collègue', () => {
    expect(
      sharedConversationAuthors(
        [
          { role: 'user', author: null },
          { role: 'user', author: me },
        ],
        me,
      ),
    ).toBeNull()
  })

  it('sans prénom déclaré de mon côté, on ne peut rien affirmer — donc on se tait', () => {
    // Mon propre prénom est absent du profil : chaque auteur nommé pourrait être
    // moi. Sous-estimer est le seul sens dans lequel se tromper ne ment pas.
    expect(
      sharedConversationAuthors([{ role: 'user', author: { firstName: 'Théo', avatarUrl: null } }], null),
    ).toBeNull()
  })
})
