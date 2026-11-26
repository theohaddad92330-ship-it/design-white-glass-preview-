import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { COMMUNITY_THRESHOLD, decideMarketSignalDate, marketSignalDateSchema } from '@bellum/contracts'

/**
 * GA-360 à GA-363 — #2288.2 : LE PÉRIMÈTRE EXACT DE LA LEVÉE DE DOCTRINE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI QUATRE GARDES POUR UNE SEULE DÉCISION
 * ─────────────────────────────────────────────────────────────────────────────
 * La mémoire marché retirait TOUTE date, et la raison n'était pas la fraîcheur :
 * une date, plus une entreprise, plus un fait suffisent souvent à désigner QUEL
 * espace a fait l'observation — et les espaces de Bellum sont des ESN, donc des
 * concurrents (la raison de GA-43). Le 18/09/2026, Louis a levé la doctrine avec
 * un périmètre, et un périmètre sans garde est une opinion à trois semaines :
 *
 * · GA-360 — une date EXACTE qui vient d'un AUTRE espace est refusée ;
 * · GA-361 — un fait SOUS LE SEUIL ne porte AUCUNE date ;
 * · GA-362 — AUCUN identifiant d'espace ne sort, ni en clair, ni dérivé ;
 * · GA-363 — la fonction qui décide n'a qu'UN SEUL appelant de vérité.
 *
 * ⚠️ Chacune doit savoir dire NON, et LIRE quelque chose. Une garde qui
 * n'attrape rien parce qu'un fichier a été renommé est verte pour toujours.
 */

const CONTRACTS_SCHEMAS = join(__dirname, '..', '..', '..', '..', 'packages', 'contracts', 'src', 'schemas')
const CONTRACT_FILE = join(CONTRACTS_SCHEMAS, 'market-signal-date.ts')

/** Les trois racines de code PRODUCTION qui pourraient rejouer la décision. */
const PRODUCTION_ROOTS = [
  join(__dirname, '..'),
  join(__dirname, '..', '..', '..', 'web', 'src'),
  join(__dirname, '..', '..', '..', '..', 'packages', 'contracts', 'src'),
]

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry)) continue
    if (/\.(spec|test)\.tsx?$/.test(entry)) continue
    out.push(full)
  }
  return out
}

/** Même précaution que GA-43 : on retire les commentaires AVANT de lire du code,
 *  sans quoi les docblocks de ce dépôt — qui CITENT le motif fautif — se
 *  dénoncent eux-mêmes. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Les clés déclarées par les `z.object({ … })` d'une source de contrat. */
function declaredSchemaKeys(source: string): string[] {
  const keys: string[] = []
  for (const match of stripComments(source).matchAll(/^\s{4,6}([a-zA-Z][a-zA-Z0-9]*):\s*z\./gm)) {
    keys.push(match[1] as string)
  }
  return keys
}

/** Cent cas d'observations VENUES D'AILLEURS, jamais de l'espace qui demande. */
function foreignOnlyCases(): { workspaceId: string; observedAt: string }[][] {
  const cases: { workspaceId: string; observedAt: string }[][] = []
  for (let spaces = 1; spaces <= 8; spaces += 1) {
    for (let day = 1; day <= 12; day += 1) {
      cases.push(
        Array.from({ length: spaces }, (_unused, index) => ({
          workspaceId: `ws-autre-${index}`,
          observedAt: `2026-0${(day % 9) + 1}-1${index % 9}T0${index % 9}:00:00.000Z`,
        })),
      )
    }
  }
  return cases
}

describe('GA-360 (#2288.2) — une date EXACTE ne vient JAMAIS d’un autre espace', () => {
  it('LIT le contrat réel — les deux branches existent, et elles sont `.strict()`', () => {
    const source = readFileSync(CONTRACT_FILE, 'utf8')
    expect(source).toContain("z.literal('own')")
    expect(source).toContain("z.literal('shared')")
    // Sans `.strict()`, un `observedOn` glissé sur la branche partagée passerait
    // en silence : c'est le `.strict()` qui PORTE la règle, pas la prose.
    expect(stripComments(source).match(/\.strict\(\)/g)?.length).toBe(2)
  })

  it('le TYPE refuse une date exacte présentée comme venant d’ailleurs', () => {
    expect(marketSignalDateSchema.safeParse({ nature: 'shared', observedOn: '2026-08-12T00:00:00.000Z' }).success).toBe(
      false,
    )
    expect(marketSignalDateSchema.safeParse({ nature: 'shared', observedMonth: '2026-08-12' }).success).toBe(false)
    expect(
      marketSignalDateSchema.safeParse({
        nature: 'shared',
        observedMonth: '2026-08',
        observedOn: '2026-08-12T00:00:00.000Z',
      }).success,
    ).toBe(false)
  })

  it('la DÉCISION ne rend jamais un jour sur des observations venues d’ailleurs', () => {
    for (const observations of foreignOnlyCases()) {
      const decided = decideMarketSignalDate({
        observations,
        askingWorkspaceId: 'ws-moi',
        contributes: true,
      })
      if (decided === null) continue
      expect(decided.nature).toBe('shared')
      // `2026-08`, jamais `2026-08-12` : la forme EST la garantie.
      expect(decided).not.toHaveProperty('observedOn')
      expect('observedMonth' in decided && /^\d{4}-\d{2}$/.test(decided.observedMonth)).toBe(true)
    }
  })

  it('sait dire NON — un schéma permissif, lui, laisserait passer le jour (témoin)', () => {
    // On rejoue la règle sur un contrat FABRIQUÉ plutôt que de casser le vrai :
    // le casser ferait circuler, même le temps d'un test, ce que la garde
    // protège. Le témoin prouve que l'assertion ci-dessus mesure bien quelque
    // chose — sans `.strict()`, le même objet passerait.
    const permissif = { nature: 'shared', observedMonth: '2026-08', observedOn: '2026-08-12T00:00:00.000Z' }
    expect(marketSignalDateSchema.safeParse(permissif).success).toBe(false)
    expect(Object.keys(permissif)).toContain('observedOn')
  })
})

describe('GA-361 (#2288.2) — sous le seuil d’espaces contributeurs, AUCUNE date', () => {
  const dated = (count: number) =>
    Array.from({ length: count }, (_unused, index) => ({
      workspaceId: `ws-autre-${index}`,
      observedAt: '2026-08-12T00:00:00.000Z',
    }))

  it('LIT le seuil partagé — il n’est pas retapé dans la décision', () => {
    const source = stripComments(readFileSync(CONTRACT_FILE, 'utf8'))
    expect(source).toContain('COMMUNITY_THRESHOLD')
    // Un réglage vit à UN seul endroit (GA-26) : aucune comparaison à un nombre
    // écrit en dur ne doit décider du seuil ici.
    expect(source).not.toMatch(/foreignWorkspaces\.size\s*<\s*\d/)
  })

  it('en dessous du seuil : `null`, et exactement au seuil : un mois', () => {
    for (let spaces = 0; spaces < COMMUNITY_THRESHOLD; spaces += 1) {
      expect(
        decideMarketSignalDate({ observations: dated(spaces), askingWorkspaceId: 'ws-moi', contributes: true }),
      ).toBeNull()
    }
    expect(
      decideMarketSignalDate({
        observations: dated(COMMUNITY_THRESHOLD),
        askingWorkspaceId: 'ws-moi',
        contributes: true,
      }),
    ).toEqual({ nature: 'shared', observedMonth: '2026-08' })
  })

  it('compte des ESPACES, jamais des déclarations — un espace bavard ne franchit pas le seuil', () => {
    const bavard = Array.from({ length: COMMUNITY_THRESHOLD * 4 }, () => ({
      workspaceId: 'ws-autre-unique',
      observedAt: '2026-08-12T00:00:00.000Z',
    }))
    expect(decideMarketSignalDate({ observations: bavard, askingWorkspaceId: 'ws-moi', contributes: true })).toBeNull()
  })

  it('sait dire NON — un seuil abaissé à deux rendrait une date (témoin)', () => {
    // Le témoin montre ce que la règle EMPÊCHE : à deux espaces, une règle plus
    // permissive daterait. La vraie, elle, se tait.
    const deux = dated(2)
    expect(deux.length).toBeLessThan(COMMUNITY_THRESHOLD)
    expect(decideMarketSignalDate({ observations: deux, askingWorkspaceId: 'ws-moi', contributes: true })).toBeNull()
  })
})

describe('GA-362 (#2288.2) — aucun identifiant d’espace ne sort, ni en clair ni dérivé', () => {
  it('LIT le contrat — la sortie ne déclare QUE la nature et sa date', () => {
    const keys = new Set(declaredSchemaKeys(readFileSync(CONTRACT_FILE, 'utf8')))
    expect(keys.size).toBeGreaterThan(0)
    expect([...keys].sort()).toEqual(['nature', 'observedMonth', 'observedOn'])
  })

  it('aucun `workspaceId` ni comptage de contributeurs ne traverse le TYPE', () => {
    for (const glisse of [
      { nature: 'shared', observedMonth: '2026-08', workspaceId: 'ws-autre-0' },
      { nature: 'shared', observedMonth: '2026-08', sourcesCount: 3 },
      { nature: 'shared', observedMonth: '2026-08', contributors: ['ws-a'] },
      { nature: 'own', observedOn: '2026-08-12T00:00:00.000Z', workspaceId: 'ws-moi' },
    ]) {
      expect(marketSignalDateSchema.safeParse(glisse).success).toBe(false)
    }
  })

  it('aucun identifiant d’espace n’apparaît dans ce que la DÉCISION rend', () => {
    for (const observations of foreignOnlyCases()) {
      const decided = decideMarketSignalDate({ observations, askingWorkspaceId: 'ws-moi', contributes: true })
      if (decided === null) continue
      const serialized = JSON.stringify(decided)
      for (const observation of observations) expect(serialized).not.toContain(observation.workspaceId)
      expect(serialized).not.toContain('ws-moi')
      // Ni le NOMBRE d'espaces : « vu par 3 espaces » sur un fait rare est déjà
      // une information — c'est la dérivation qu'on interdit, pas seulement
      // l'identifiant.
      expect(serialized).not.toMatch(/"(sourcesCount|contributors|workspaces|spaces)"/)
    }
  })

  it('sait dire NON — une sortie fabriquée qui porte un espace est détectée (témoin)', () => {
    const fautive = JSON.stringify({ nature: 'shared', observedMonth: '2026-08', sourcesCount: 3 })
    expect(fautive).toMatch(/"sourcesCount"/)
    expect(marketSignalDateSchema.safeParse(JSON.parse(fautive)).success).toBe(false)
  })
})

describe('GA-363 (#2288.2) — la décision n’a QU’UN SEUL appelant de vérité', () => {
  /** Les fichiers de PRODUCTION qui APPELLENT la décision (jamais qui la déclarent). */
  function callers(): string[] {
    const found: string[] = []
    for (const root of PRODUCTION_ROOTS) {
      for (const file of sourceFiles(root)) {
        const source = stripComments(readFileSync(file, 'utf8'))
        if (!/\bdecideMarketSignalDate\s*\(/.test(source)) continue
        if (/export function decideMarketSignalDate/.test(source)) continue
        found.push(file.slice(file.indexOf('/apps/') >= 0 ? file.indexOf('/apps/') : file.indexOf('/packages/')))
      }
    }
    return found
  }

  it('LIT quelque chose — les trois racines de production existent et portent du code', () => {
    for (const root of PRODUCTION_ROOTS) expect(sourceFiles(root).length).toBeGreaterThan(10)
  })

  it('la décision est déclarée UNE fois, et appelée par UN SEUL fichier', () => {
    const declarations = PRODUCTION_ROOTS.flatMap(sourceFiles).filter(file =>
      /export function decideMarketSignalDate/.test(readFileSync(file, 'utf8')),
    )
    expect(declarations).toHaveLength(1)

    const found = callers()
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('market-signal-dates.ts')
  })

  it('l’ÉCRAN ne rejoue pas la décision — il rend ce qu’il reçoit', () => {
    const webFiles = sourceFiles(join(__dirname, '..', '..', '..', 'web', 'src'))
    expect(webFiles.length).toBeGreaterThan(10)
    for (const file of webFiles) {
      expect(stripComments(readFileSync(file, 'utf8'))).not.toContain('decideMarketSignalDate')
    }
  })

  it('sait dire NON — une seconde copie serait vue (témoin)', () => {
    // La règle rejouée sur deux sources FABRIQUÉES : casser la vraie
    // laisserait, le temps d'un test, deux décisions divergentes dans le dépôt.
    const detecte = (source: string) =>
      /\bdecideMarketSignalDate\s*\(/.test(stripComments(source)) &&
      !/export function decideMarketSignalDate/.test(source)
    expect(detecte('const d = decideMarketSignalDate({ observations, askingWorkspaceId, contributes })')).toBe(true)
    expect(detecte('// decideMarketSignalDate(x) — cité dans un commentaire')).toBe(false)
    expect(detecte('export function decideMarketSignalDate(input) { return null }')).toBe(false)
  })
})
