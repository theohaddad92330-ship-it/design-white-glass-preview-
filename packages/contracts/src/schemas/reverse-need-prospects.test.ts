import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  REVERSE_PROSPECTS_UNAVAILABLE_REASONS,
  reverseProspectMatchSchema,
  reverseProspectsResultSchema,
} from './reverse-need-prospects.js'

/**
 * La forme partagée de la prospection inversée depuis un besoin — voir le
 * docblock de `reverse-need-prospects.ts` pour la définition. Ce fichier
 * teste deux choses distinctes :
 *
 *  1. le schéma lui-même — les trois rendus possibles (indisponible côté
 *     zone, indisponible côté compétences, disponible vide, disponible
 *     rempli) sont tous acceptés, et rien d'autre ne l'est ;
 *  2. GA-204 — API et web lisent tous les deux CETTE forme, aucun des deux
 *     n'en redéclare une localement.
 */

function match(over: Partial<Record<string, unknown>> = {}) {
  return {
    need_id: '11111111-1111-4111-8111-111111111111',
    need_title: 'Architecte plateforme',
    project_id: '22222222-2222-4222-8222-222222222222',
    project_label: 'Plateforme',
    account_id: '33333333-3333-4333-8333-333333333333',
    account_name: 'ACME',
    location: 'Paris',
    shared_skills: ['Kubernetes'],
    already_in_portfolio: false,
    ...over,
  }
}

describe('reverseProspectMatchSchema — une piste', () => {
  it('accepte une piste complète', () => {
    expect(reverseProspectMatchSchema.parse(match())).toEqual(match())
  })

  it('refuse un champ manquant — une piste incomplète ne doit pas passer en silence', () => {
    const { location: _absent, ...withoutLocation } = match()
    expect(reverseProspectMatchSchema.safeParse(withoutLocation).success).toBe(false)
  })
})

describe('reverseProspectsResultSchema — les trois rendus, jamais confondus', () => {
  it('indisponible : la zone manque — `unavailableReason` le dit, `matches` reste vide', () => {
    const result = reverseProspectsResultSchema.parse({
      needId: '11111111-1111-4111-8111-111111111111',
      location: null,
      skillTerms: [],
      unavailableReason: 'location_missing',
      matches: [],
    })
    expect(result.unavailableReason).toBe('location_missing')
    expect(result.matches).toEqual([])
  })

  it('indisponible : les compétences manquent — la zone, elle, est connue', () => {
    const result = reverseProspectsResultSchema.parse({
      needId: '11111111-1111-4111-8111-111111111111',
      location: 'Paris',
      skillTerms: [],
      unavailableReason: 'skills_missing',
      matches: [],
    })
    expect(result.unavailableReason).toBe('skills_missing')
  })

  it('disponible et vide : le croisement a tourné, personne trouvé — distinct de l’indisponible', () => {
    // C'est la distinction que la forme existe pour préserver : une liste
    // vide avec `unavailableReason: null` n'est PAS la même réponse qu'une
    // liste vide avec un motif — l'écran les rend différemment.
    const result = reverseProspectsResultSchema.parse({
      needId: '11111111-1111-4111-8111-111111111111',
      location: 'Paris',
      skillTerms: ['Kubernetes'],
      unavailableReason: null,
      matches: [],
    })
    expect(result.unavailableReason).toBeNull()
    expect(result.matches).toEqual([])
  })

  it('disponible et rempli : au moins une piste', () => {
    const result = reverseProspectsResultSchema.parse({
      needId: '11111111-1111-4111-8111-111111111111',
      location: 'Paris',
      skillTerms: ['Kubernetes'],
      unavailableReason: null,
      matches: [match()],
    })
    expect(result.unavailableReason).toBeNull()
    expect(result.matches).toHaveLength(1)
  })

  it('refuse un motif hors des deux valeurs connues', () => {
    expect(
      reverseProspectsResultSchema.safeParse({
        needId: '11111111-1111-4111-8111-111111111111',
        location: null,
        skillTerms: [],
        unavailableReason: 'autre_chose',
        matches: [],
      }).success,
    ).toBe(false)
  })

  it('les deux seuls motifs sont ceux du §7.5 — pas un troisième ajouté en douce', () => {
    expect([...REVERSE_PROSPECTS_UNAVAILABLE_REASONS].sort()).toEqual(['location_missing', 'skills_missing'])
  })
})

/**
 * GA-204 — LA FORME DE LA PROSPECTION INVERSÉE N'EXISTE QU'ICI.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * `ReverseProspectMatch` / `ReverseProspectsResult` étaient dupliqués : une
 * fois dans `apps/api/.../reverse-need-prospects.ts`, une fois dans
 * `apps/web/.../open-needs/api.ts`, même forme, aucun schéma commun. Le mode
 * d'échec n'est pas immédiat — les deux copies naissent identiques — il vient
 * le jour où un champ est ajouté d'un seul côté : rien ne casse, le serveur
 * envoie un champ que le client ignore, ou le client lit un champ qui reste
 * `undefined` pour toujours. Aucun test ne tombe, l'écran affiche du vide.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE
 * ─────────────────────────────────────────────────────────────────────────────
 * Pas que les deux formes « se ressemblent » — deux copies parfaitement
 * synchronisées passeraient ce test-là sans qu'il ne reste plus qu'UNE
 * définition. Elle vérifie mécaniquement qu'il n'existe plus qu'une
 * définition : les deux fichiers consommateurs IMPORTENT le type depuis
 * `@bellum/contracts`, et aucun des deux ne porte plus sa propre déclaration
 * (`type ReverseProspectMatch =` / `type ReverseProspectsResult =`).
 */
const _here = dirname(fileURLToPath(import.meta.url))

function monorepoFile(relative: string): string {
  let current = _here
  for (let depth = 0; depth < 10; depth += 1) {
    const candidate = join(current, relative)
    if (existsSync(candidate)) return candidate
    current = dirname(current)
  }
  throw new Error(`Fichier introuvable en remontant depuis ${_here} : ${relative}`)
}

const API_FILE = monorepoFile('apps/api/src/modules/projects/reverse-need-prospects.ts')
const WEB_FILE = monorepoFile('apps/web/src/features/projects/open-needs/api.ts')

const apiSource = readFileSync(API_FILE, 'utf8')
const webSource = readFileSync(WEB_FILE, 'utf8')

/** Le corps du fichier, commentaires `//` et blocs `/* … *‍/` retirés — sinon
 *  un docblock qui CITE `type ReverseProspectMatch =` (pour expliquer la
 *  migration) ferait échouer la garde sur du code juste. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

const LOCAL_DECLARATION = /\btype\s+ReverseProspect(Match|sResult)\s*=/

describe('GA-204 — API et web lisent la MÊME définition, il n’en reste qu’une', () => {
  it('LIT vraiment les deux fichiers consommateurs (sinon la garde est borgne)', () => {
    // Le corpus, pas le verdict : un chemin périmé qui lirait un fichier vide
    // ou déplacé passerait au vert sans avoir rien comparé.
    expect(apiSource.length).toBeGreaterThan(500)
    expect(webSource.length).toBeGreaterThan(500)
  })

  it('le fichier API importe la forme depuis @bellum/contracts', () => {
    expect(apiSource).toMatch(/from ['"]@bellum\/contracts['"]/)
    expect(apiSource).toMatch(/ReverseProspectMatch/)
    expect(apiSource).toMatch(/ReverseProspectsResult/)
  })

  it('le fichier web importe la forme depuis @bellum/contracts', () => {
    expect(webSource).toMatch(/from ['"]@bellum\/contracts['"]/)
    expect(webSource).toMatch(/ReverseProspectMatch/)
    expect(webSource).toMatch(/ReverseProspectsResult/)
  })

  it('ni l’API ni le web ne redéclarent leur propre `ReverseProspectMatch` / `ReverseProspectsResult`', () => {
    expect(withoutComments(apiSource)).not.toMatch(LOCAL_DECLARATION)
    expect(withoutComments(webSource)).not.toMatch(LOCAL_DECLARATION)
  })
})
