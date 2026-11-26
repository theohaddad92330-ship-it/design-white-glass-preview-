import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { connectedToolLogo } from './brand-logos'

const DIR = join(__dirname, 'brand-logos')
const FILES = readdirSync(DIR).filter(name => name.endsWith('.svg'))
const LICENSES = readFileSync(join(DIR, 'LICENSES.md'), 'utf8')

/** Licences acceptées : domaine public (marque non protégeable par le droit d'auteur) ou CC0. */
const ACCEPTED_LICENSE = /PD-textlogo|PD-logo|PD-shape|PD-simple|PD-ineligible|CC0/

/**
 * #3973 / #3708.logos (Louis 05/10/2026, livré 15/10/2026) — les logos de marque du sélecteur « Outils et
 * sources ». Une garde qui sait dire NON : un fichier sans licence écrite, une licence hors liste, un SVG qui
 * charge quoi que ce soit à distance ou exécute du script, un identifiant d'outil qui n'est pas au registre.
 */
describe('logos de marque — chaque fichier a sa licence écrite, et reste inerte', () => {
  it('lit quelque chose (une garde sans fichier ne protège rien)', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(17)
  })

  it.each(FILES)('%s : une ligne de LICENSES.md (source + licence acceptée)', file => {
    const row = LICENSES.split('\n').find(line => line.startsWith('|') && line.includes(`\`${file}\``))
    expect(row, `aucune ligne de licence pour ${file}`).toBeDefined()
    expect(row).toMatch(ACCEPTED_LICENSE)
    expect(row).toMatch(/commons\.wikimedia\.org|simple-icons/)
  })

  it.each(FILES)('%s : un SVG inerte (ni script, ni image distante, ni lien externe), de taille bornée', file => {
    const svg = readFileSync(join(DIR, file), 'utf8')
    expect(svg).toMatch(/<svg[\s>]/)
    expect(svg).not.toMatch(/<script|<foreignObject|on[a-z]+\s*=|javascript:/i)
    expect(svg).not.toMatch(/(?:xlink:)?href\s*=\s*["']https?:/i)
    expect(svg).not.toMatch(/url\(\s*["']?https?:/i)
    expect(svg.length).toBeLessThan(20_000)
  })

  it('LICENSES.md ne promet aucun fichier absent', () => {
    for (const match of LICENSES.matchAll(/`([a-z0-9-]+\.svg)`/g)) {
      expect(FILES, `LICENSES.md cite ${match[1]}, absent du dossier`).toContain(match[1])
    }
  })
})

describe('connectedToolLogo', () => {
  it('rend le logo d’un outil CLIENT branché qui a un fichier', () => {
    expect(connectedToolLogo('hubspot')).toEqual(expect.stringContaining('hubspot'))
    expect(connectedToolLogo('gmail')).toEqual(expect.stringContaining('gmail'))
  })

  it('#3973 — les outils du client sans fichier Commons ont leur logo simple-icons (CC0)', () => {
    for (const provider of ['zoho', 'linkedin', 'teams', 'discord', 'mattermost', 'googlechat']) {
      expect(connectedToolLogo(provider), provider).toEqual(expect.stringContaining(provider))
    }
  })

  it('#3973 — Outlook : le fournisseur « microsoft » en famille e-mail prend le logo Outlook', () => {
    expect(connectedToolLogo('microsoft', 'email')).toEqual(expect.stringContaining('outlook'))
    expect(connectedToolLogo('microsoft')).toEqual(expect.stringContaining('microsoft'))
  })

  it('un outil sans source légale (Attio) n’a pas de logo : il garde son icône', () => {
    expect(connectedToolLogo('attio')).toBeNull()
  })

  it('sait dire NON : un fournisseur qui nous sert, ou inconnu, n’a jamais de logo', () => {
    for (const provider of [
      'anthropic',
      'apollo',
      'pappers',
      'brave',
      'firecrawl',
      'supabase',
      'railway',
      'inconnu',
      '',
    ]) {
      expect(connectedToolLogo(provider), provider).toBeNull()
    }
  })
})
