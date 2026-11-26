import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { approachChannelFromParam } from '@/features/contacts/view/approach/approach-model'

// #4525.3 — « Appel » est un ONGLET de la page d'approche : l'adresse /contacts/<id>/approach/call reste valide et
// ouvre l'onglet, par la MÊME route que E-mail et LinkedIn (donc les mêmes droits). Plus de page dédiée : une route
// statique `/approach/call` passerait avant la route « canal » et ferait revenir l'ancienne page.
const tree = readFileSync(join(__dirname, '..', '..', 'routeTree.gen.ts'), 'utf8')

describe('#4525.3 — /contacts/<id>/approach/call ouvre l’onglet Appel', () => {
  it('la route dédiée n’existe plus, ni son fichier ni sa trace dans l’arbre de routes', () => {
    expect(existsSync(join(__dirname, '$id_.approach.call.tsx'))).toBe(false)
    expect(tree).not.toMatch(/approach\/call/)
    expect(tree).not.toMatch(/ContactsIdApproachCallRoute/)
  })

  it('la route « canal » porte e-mail, LinkedIn et appel : mêmes droits, et « call » est un canal reconnu', () => {
    expect(tree).toContain("'/contacts/$id_/approach/$channel'")
    expect(approachChannelFromParam('call')).toBe('call')
    expect(approachChannelFromParam('email')).toBe('email')
    expect(approachChannelFromParam('linkedin')).toBe('linkedin')
  })

  it('aucune route d’approche ne pose son propre `beforeLoad` : le garde est celui de la session, commun aux trois onglets', () => {
    const route = readFileSync(join(__dirname, '$id_.approach.$channel.tsx'), 'utf8')
    expect(route).not.toMatch(/beforeLoad/)
  })
})
