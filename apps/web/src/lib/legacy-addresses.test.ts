import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { currentAddressOf, LEGACY_ADDRESSES, rewriteLegacyAddress } from './legacy-addresses'

// Golden journey 40 (#2208.71) — « Ouvrir chaque ancienne URL » : la table centrale remplace l'ancien
// `route-migration-old-links.integration.test.ts` (les redirections par fichier de route ont disparu, #4359).
describe('#4359 — table centrale des anciennes adresses', () => {
  it('réécrit le chemin et garde la recherche et l’ancre (retour OAuth)', () => {
    const out = rewriteLegacyAddress({ url: new URL('https://app.test/settings/integrations?google=connected#x') })
    expect(out?.pathname).toBe('/integrations')
    expect(out?.search).toBe('?google=connected')
    expect(out?.hash).toBe('#x')
  })

  // Théo A today-jour.A8 — « Tableau de bord » retiré : l'ancien lien ouvre « Ta journée ».
  it('envoie /dashboard vers /briefing, sans fichier de route', () => {
    expect(currentAddressOf('/dashboard')).toBe('/briefing')
    expect(rewriteLegacyAddress({ url: new URL('https://app.test/dashboard/') })?.pathname).toBe('/briefing')
  })

  it('accepte la barre finale', () => {
    expect(currentAddressOf('/needs/')).toBe('/projects')
  })

  it('laisse passer une adresse courante ou inconnue', () => {
    expect(rewriteLegacyAddress({ url: new URL('https://app.test/projects') })).toBeUndefined()
    expect(rewriteLegacyAddress({ url: new URL('https://app.test/toString') })).toBeUndefined()
  })

  it('ne chaîne pas : aucune cible n’est elle-même une ancienne adresse', () => {
    for (const target of Object.values(LEGACY_ADDRESSES))
      expect(currentAddressOf(target.split(/[?#]/)[0] as string)).toBeUndefined()
  })

  it('chaque cible est une route servie, et aucune ancienne adresse n’a gardé son fichier de route', () => {
    const tree = readFileSync(join(__dirname, '..', 'routeTree.gen.ts'), 'utf8')
    const served = new Set(
      [...tree.matchAll(/fullPath: '([^']*)'/g)].map(m => (m[1] as string).replace(/(.)\/$/, '$1')),
    )
    expect(served.size).toBeGreaterThan(50)
    for (const [legacy, destination] of Object.entries(LEGACY_ADDRESSES)) {
      const target = (destination.split(/[?#]/)[0] as string) || '/'
      expect(served.has(target), `${legacy} mène à ${target}, qui n’est pas servi`).toBe(true)
      expect(served.has(legacy), `${legacy} a de nouveau un fichier de route : il double la table`).toBe(false)
    }
  })
})

// #4197.2 + #4167.3 — recette prod 31/10 : `/missions/board` tombait sur « Mission introuvable », `/actions/chaines`
// sur « Action introuvable » (la route `$id` prend le segment pour un identifiant). Garde #4197, #4167, #4359.
describe('#4197.2 #4167.3 — les adresses retirées sous une route `$id` redirigent, jamais « introuvable »', () => {
  const rewritten = (href: string) => {
    const out = rewriteLegacyAddress({ url: new URL(href) })
    return out === undefined ? undefined : `${out.pathname}${out.search}${out.hash}`
  }

  it.each([
    ['https://app.test/missions/board', '/missions?vue=liste'],
    ['https://app.test/actions/chaines', '/pilotage#parcours'],
    ['https://app.test/pilotage/parcours', '/pilotage#parcours'],
    // #4197.2 — recette prod 31/10 : `/pipeline` rendait 404 ; les affaires vivent sous `/projects`.
    ['https://app.test/pipeline', '/projects'],
    ['https://app.test/pipeline?vue=kanban#colonne', '/projects?vue=kanban#colonne'],
  ])('%s → %s', (from, to) => {
    expect(rewritten(from)).toBe(to)
  })

  it('garde la recherche de l’ancien lien et ne l’écrase pas par celle de la cible', () => {
    expect(rewritten('https://app.test/missions/board?accountId=a1')).toBe('/missions?accountId=a1&vue=liste')
    expect(rewritten('https://app.test/missions/board?vue=liste')).toBe('/missions?vue=liste')
  })

  it('l’ancre de l’ancien lien l’emporte sur celle de la cible', () => {
    expect(rewritten('https://app.test/actions/chaines#autre')).toBe('/pilotage#autre')
  })

  // Les jumelles déjà traitées hors table (fichier `$id` qui redirige) ou décidées « introuvable » (#4359).
  it('chaque segment retiré qu’une route `$id` capterait est déclaré, ou explicitement laissé « introuvable »', () => {
    const declared = ['/missions/board', '/actions/chaines', '/missions/renouvellements', '/consultants/pool']
    for (const path of declared) expect(currentAddressOf(path), path).toBeDefined()
    // #4359 (garde `route-migration-registry.test.ts`) : ces deux-là restent « introuvable » par décision.
    for (const path of ['/actions/ecritures', '/favorites']) expect(currentAddressOf(path), path).toBeUndefined()
  })
})
