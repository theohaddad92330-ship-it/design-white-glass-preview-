import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { NAV_SECTIONS } from '../app/_components/nav-sections'

/**
 * #1682/#1683-#1688 — « /produit » N'EST PAS ATTEIGNABLE PAR UNE URL SEULE.
 *
 * `rail-et-environnement.test.ts` vérifie déjà qu'aucun HREF du rail ne mène à
 * une page absente — mais PAS l'inverse : une page neuve sans entrée de rail
 * passerait cette garde sans qu'elle la voie, et resterait introuvable pour
 * quiconque ne connaît pas déjà son chemin. C'est exactement le trou que ce
 * lot referme pour `/produit`, nommément — pas un balayage général de toutes
 * les pages du back-office (une page technique ou une sous-route peut avoir de
 * bonnes raisons de ne pas être dans le rail ; ce n'est pas le sujet ici).
 */

const APP = fileURLToPath(new URL('../app/', import.meta.url))

const TOUS_LES_HREFS = NAV_SECTIONS.flatMap(section => section.items.map(item => item.href))

describe('/produit est atteignable depuis NAV_SECTIONS, pas seulement par son URL', () => {
  it('LIT quelque chose — le rail et le dossier des routes existent', () => {
    // Contrôle positif : sans lui, un `NAV_SECTIONS` vide ou un `APP` faux
    // rendraient chaque assertion ci-dessous creuse.
    expect(TOUS_LES_HREFS.length).toBeGreaterThan(10)
    expect(existsSync(join(APP, 'produit', 'page.tsx'))).toBe(true)
  })

  it('la page existe sur le disque', () => {
    expect(existsSync(join(APP, 'produit', 'page.tsx'))).toBe(true)
  })

  it('NAV_SECTIONS porte une entrée dont le href est exactement /produit', () => {
    expect(TOUS_LES_HREFS).toContain('/produit')
  })

  it('cette entrée vit dans la section « produit »', () => {
    const section = NAV_SECTIONS.find(s => s.id === 'produit')
    expect(section, 'la section « produit » doit exister').toBeDefined()
    expect(section?.items.map(item => item.href)).toContain('/produit')
  })

  it('sait dire NON — une route voisine non déclarée n’est pas confondue avec /produit', () => {
    // `/produit/onboarding` existe et est déclarée : elle ne doit pas être
    // prise pour la preuve que `/produit` lui-même est atteignable.
    expect(TOUS_LES_HREFS).toContain('/produit/onboarding')
    expect(TOUS_LES_HREFS.filter(href => href === '/produit')).toHaveLength(1)
  })
})
