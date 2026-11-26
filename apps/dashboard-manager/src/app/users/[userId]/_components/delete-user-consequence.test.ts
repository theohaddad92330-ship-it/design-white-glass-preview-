import { describe, expect, it } from 'vitest'
import { describeDeleteUserConsequence } from './delete-user-consequence'

/**
 * #1664.2 — ce que la suppression d'un utilisateur EMPORTE, nommé.
 *
 * `workspaces.owner_user_id` porte `ON DELETE CASCADE` vers `auth.users` (voir
 * la migration `1784000000000-MultiUserWorkspaces.ts`) : supprimer le
 * PROPRIÉTAIRE d'un espace supprime l'espace ENTIER avec lui — pas seulement
 * ses propres données, celles de toute l'ESN. C'est le fait le plus dommageable
 * qu'une boîte de confirmation puisse omettre, et l'ancien message ne le
 * disait pas. Un simple membre, lui, ne fait que perdre l'accès : l'espace
 * continue d'exister pour les autres (seule la ligne `workspace_members` de
 * cette personne est en CASCADE).
 *
 * La décision vit ici, hors du composant, parce que l'environnement de test de
 * cette application est `node` (jsdom ne met rien en page).
 */

describe('describeDeleteUserConsequence', () => {
  it('names no workspace when the user belongs to none', () => {
    expect(describeDeleteUserConsequence([])).toEqual({ ownedWorkspaceNames: [], memberWorkspaceNames: [] })
  })

  it('names the workspace(s) this user OWNS — deleting them cascades to the whole workspace', () => {
    const res = describeDeleteUserConsequence([{ id: 'w1', name: 'Skaizen', role: 'owner' }])
    expect(res.ownedWorkspaceNames).toEqual(['Skaizen'])
    expect(res.memberWorkspaceNames).toEqual([])
  })

  it('names the workspace(s) this user is a plain MEMBER of — they only lose access', () => {
    const res = describeDeleteUserConsequence([{ id: 'w1', name: 'Skaizen', role: 'member' }])
    expect(res.ownedWorkspaceNames).toEqual([])
    expect(res.memberWorkspaceNames).toEqual(['Skaizen'])
  })

  it('treats "admin" the same as a plain member — only "owner" cascades the workspace', () => {
    const res = describeDeleteUserConsequence([{ id: 'w1', name: 'Skaizen', role: 'admin' }])
    expect(res.ownedWorkspaceNames).toEqual([])
    expect(res.memberWorkspaceNames).toEqual(['Skaizen'])
  })

  it('splits owned and member workspaces when the user belongs to several', () => {
    const res = describeDeleteUserConsequence([
      { id: 'w1', name: 'Skaizen', role: 'owner' },
      { id: 'w2', name: 'Alterway', role: 'member' },
      { id: 'w3', name: 'Neovance', role: 'owner' },
    ])
    expect(res.ownedWorkspaceNames).toEqual(['Skaizen', 'Neovance'])
    expect(res.memberWorkspaceNames).toEqual(['Alterway'])
  })
})
