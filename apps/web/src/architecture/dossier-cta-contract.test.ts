/**
 * GA — chaque bouton de la barre d'actions du dossier porte son CONTRAT (#2116.28-37, .44-47).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE MESURE
 * ─────────────────────────────────────────────────────────────────────────
 * Dans les fichiers nommés par `DOSSIER_CTA_SCOPE_FILES`, tout élément
 * cliquable (`<Button`, `<button`, une entrée de menu, un déclencheur de
 * sous-menu) doit porter un `cta="…"` dont la valeur existe au registre
 * `DOSSIER_CTA_CONTRACTS`. Et l'inverse : tout identifiant du registre doit
 * être posé quelque part dans ces fichiers — un contrat que personne ne câble
 * est exactement le défaut n°1 du dépôt, du code juste que personne n'appelle.
 *
 * Elle interdit en plus un `disabled=` écrit à la main : un bouton du dossier
 * devient inerte par `busy` (le geste est en cours) ou par `blockedBy` (un
 * empêchement, qui porte pourquoi / ce qui manque / le geste de déblocage).
 * `disabled` seul est la forme qui ne dit rien, et c'est celle que #2116.44-47
 * refuse.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE MESURE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Elle ne lit QUE ces fichiers. Les onglets du dossier et les dialogues que la
 * barre ouvre rejoindront le registre par leur `section` — élargir la portée,
 * c'est ajouter un fichier à la liste, pas réécrire la garde. Un `<Button>` de
 * `DossierCta.tsx` (la primitive qui POSE le `cta`) est hors portée par
 * construction : sinon la garde s'accuserait elle-même.
 *
 * L'extracteur lit la balise OUVRANTE en entier — il suit les accolades et les
 * chaînes, il ne coupe donc pas à la flèche d'un `onClick={() => …}` (le défaut
 * qui a rendu une garde borgne en août), et il retire les commentaires avant de
 * chercher (un identifiant CITÉ dans un docbloc ne compte pour personne).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DOSSIER_CTA_CONTRACTS, DOSSIER_CTA_IDS, DOSSIER_CTA_SCOPE_FILES } from '@bellum/contracts'
import { resources } from '@/i18n/resources'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')

/** Les balises qu'on tient pour cliquables dans le dossier. */
const CLICKABLE = [
  'Button',
  'button',
  'DropdownMenuItem',
  'DropdownMenuSubTrigger',
  'DossierCtaButton',
  'DossierCtaMenuItem',
  'DossierCtaSubTrigger',
]

/** Retire commentaires de ligne, de bloc et accolades JSX — sans toucher aux chaînes. */
function stripComments(source: string): string {
  let out = ''
  let i = 0
  let quote: string | null = null
  while (i < source.length) {
    const char = source[i]
    const next = source[i + 1]
    if (quote) {
      out += char
      if (char === '\\') {
        out += next ?? ''
        i += 2
        continue
      }
      if (char === quote) quote = null
      i += 1
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      out += char
      i += 1
      continue
    }
    if (char === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1
      continue
    }
    if (char === '/' && next === '*') {
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1
      i += 2
      continue
    }
    out += char
    i += 1
  }
  // `{  }` restés vides par le retrait d'un `{/* … */}` : sans intérêt ici, on
  // les laisse — ils ne contiennent aucune balise.
  return out
}

/**
 * Les balises ouvrantes des éléments cliquables. On avance caractère par
 * caractère jusqu'au `>` de fermeture hors accolade et hors chaîne : c'est ce
 * qui permet de lire une balise qui contient `onClick={() => …}`.
 */
function openingTags(source: string, names: readonly string[]): { name: string; tag: string }[] {
  const found: { name: string; tag: string }[] = []
  // Pas de drapeau `g` sur une RegExp réutilisée : `lastIndex` est STATEFUL.
  const start = new RegExp(`<(${names.join('|')})(?=[\\s/>])`)
  let rest = source
  let guard = 0
  while (guard < 5000) {
    guard += 1
    const match = start.exec(rest)
    if (!match) break
    const from = match.index
    let i = from
    let depth = 0
    let quote: string | null = null
    while (i < rest.length) {
      const char = rest[i]
      if (quote) {
        if (char === '\\') i += 1
        else if (char === quote) quote = null
      } else if (char === '"' || char === "'" || char === '`') {
        quote = char
      } else if (char === '{') {
        depth += 1
      } else if (char === '}') {
        depth -= 1
      } else if (char === '>' && depth === 0) {
        break
      }
      i += 1
    }
    found.push({ name: match[1], tag: rest.slice(from, i + 1) })
    rest = rest.slice(i + 1)
  }
  return found
}

/** L'identifiant de contrat porté par une balise, ou `null`. */
function ctaOf(tag: string): string | null {
  const match = /\bcta="([^"]+)"/.exec(tag)
  return match ? match[1] : null
}

function scopeSources(): { path: string; source: string }[] {
  return DOSSIER_CTA_SCOPE_FILES.map(path => ({
    path,
    source: stripComments(readFileSync(join(SRC, path), 'utf8')),
  }))
}

function allTags(): { path: string; name: string; tag: string }[] {
  return scopeSources().flatMap(file => openingTags(file.source, CLICKABLE).map(tag => ({ path: file.path, ...tag })))
}

/** Une clé `ns:chemin` existe-t-elle dans cette langue. */
function resolves(locale: 'fr' | 'en', key: string): boolean {
  const [ns, path] = key.split(':')
  const tree = (resources as Record<string, Record<string, unknown>>)[locale]?.[ns]
  if (!tree) return false
  let node: unknown = tree
  for (const segment of path.split('.')) {
    if (typeof node !== 'object' || node === null) return false
    node = (node as Record<string, unknown>)[segment]
  }
  return typeof node === 'string' && node.trim().length > 0
}

describe('contrat de bouton du dossier — le câblage', () => {
  it('LIT un corpus non vide — sinon « zéro fautif » se lirait comme une réussite', () => {
    const tags = allTags()
    expect(tags.length).toBeGreaterThanOrEqual(14)
    // Et le corpus contient bien du code, pas cinq fichiers vides.
    for (const file of scopeSources()) expect(file.source.length, file.path).toBeGreaterThan(200)
  })

  it('chaque élément cliquable de la barre porte un identifiant de contrat — #2116.28', () => {
    const nus = allTags()
      .filter(tag => ctaOf(tag.tag) === null)
      .map(tag => `${tag.path} → <${tag.name}`)
    expect(nus, `boutons sans contrat : ${nus.join(', ')}`).toEqual([])
  })

  it('aucun identifiant posé ne sort du registre', () => {
    const inconnus = allTags()
      .map(tag => ctaOf(tag.tag))
      .filter((id): id is string => id !== null && !DOSSIER_CTA_IDS.includes(id))
    expect(inconnus, `identifiants hors registre : ${inconnus.join(', ')}`).toEqual([])
  })

  it('chaque contrat du registre a un APPELANT — un contrat que rien ne câble ne garde rien', () => {
    const poses = new Set(allTags().map(tag => ctaOf(tag.tag)))
    const orphelins = DOSSIER_CTA_IDS.filter(id => !poses.has(id))
    expect(orphelins, `contrats jamais posés sur un bouton : ${orphelins.join(', ')}`).toEqual([])
  })

  it('#2116.48 — l’inventaire est complet DANS LES DEUX SENS : autant d’identifiants posés que de contrats', () => {
    // Les deux règles ci-dessus disent « aucun identifiant hors registre » et
    // « aucun contrat sans appelant » ; leur conjonction est une ÉGALITÉ, et
    // l'écrire comme telle est ce qui fait du registre un inventaire : la
    // liste des seize boutons du dossier, et rien d'autre. Les interdits qui
    // s'appuient dessus vivent dans `dossier-cta-interdits.test.ts` (routes,
    // traductions, implémentation) et `cta-contract.test.ts` (forme, doublons,
    // actions principales, sorties).
    const poses = [...new Set(allTags().map(tag => ctaOf(tag.tag)))].filter((id): id is string => id !== null)
    expect(poses.sort()).toEqual([...DOSSIER_CTA_IDS].sort())
    expect(poses).toHaveLength(DOSSIER_CTA_CONTRACTS.length)
  })

  it('un bouton du dossier ne se désactive jamais sans dire pourquoi — #2116.44, .45, .46, .47', () => {
    const muets = allTags()
      .filter(tag => /\bdisabled[=\s>]/.test(tag.tag))
      .map(tag => `${tag.path} → ${ctaOf(tag.tag) ?? `<${tag.name}`}`)
    expect(muets, `\`disabled\` sans raison (utiliser \`busy\` ou \`blockedBy\`) : ${muets.join(', ')}`).toEqual([])
  })

  it('les textes du registre existent en FR ET en EN', () => {
    const keys = DOSSIER_CTA_CONTRACTS.flatMap(cta =>
      [cta.expectedResultKey, cta.successStateKey, cta.failureStateKey, cta.proofKey].filter(
        (key): key is string => key !== null,
      ),
    )
    expect(keys.length).toBeGreaterThan(20)
    const manquantes = keys.filter(key => !resolves('fr', key) || !resolves('en', key))
    expect(manquantes, `clés absentes d'une des deux langues : ${manquantes.join(', ')}`).toEqual([])
  })

  it("les textes d'empêchement existent aussi en FR ET en EN — #2116.45, .46, .47", () => {
    const source = readFileSync(join(SRC, 'features/accounts/view/account-detail/cta/dossier-cta-blocked.ts'), 'utf8')
    const keys = [...source.matchAll(/'(accounts:cta\.blocked\.[a-zA-Z.]+)'/g)].map(match => match[1])
    // Trois textes par empêchement : pourquoi, ce qui manque, le déblocage.
    expect(keys.length).toBeGreaterThanOrEqual(6)
    const manquantes = keys.filter(key => !resolves('fr', key) || !resolves('en', key))
    expect(manquantes, `clés d'empêchement absentes : ${manquantes.join(', ')}`).toEqual([])
  })

  it('sait dire NON — un bouton fabriqué sans contrat, et un identifiant inventé', () => {
    const sansContrat = `
      <Button variant="ghost" onClick={() => choose('prioritised')}>
        {t('gate.actions.prioritise')}
      </Button>`
    const tagsSansContrat = openingTags(stripComments(sansContrat), CLICKABLE)
    expect(tagsSansContrat).toHaveLength(1)
    expect(ctaOf(tagsSansContrat[0].tag)).toBeNull()

    const idInvente = `<DossierCtaButton cta="dossier.qui.nexiste.pas" onClick={() => void 0}>x</DossierCtaButton>`
    const id = ctaOf(openingTags(idInvente, CLICKABLE)[0].tag)
    expect(id).toBe('dossier.qui.nexiste.pas')
    expect(DOSSIER_CTA_IDS.includes(id as string)).toBe(false)

    const muet = `<DossierCtaButton cta="dossier.gate.open" disabled={pending}>x</DossierCtaButton>`
    expect(/\bdisabled[=\s>]/.test(openingTags(muet, CLICKABLE)[0].tag)).toBe(true)
  })

  it("n'attrape pas ce qu'elle ne vise pas — un bouton hors barre d'actions, et la primitive elle-même", () => {
    // 1. Un dialogue du dossier, hors portée de ce lot : ses boutons n'ont pas
    //    de contrat, et la garde ne les compte pas.
    const temoin = 'features/accounts/view/account-detail/components/AccountShareDialog.tsx'
    const source = stripComments(readFileSync(join(SRC, temoin), 'utf8'))
    const tags = openingTags(source, CLICKABLE)
    expect(tags.length, 'le témoin doit vraiment contenir des boutons').toBeGreaterThan(0)
    expect(
      tags.some(tag => ctaOf(tag.tag) === null),
      'le témoin doit vraiment être sans contrat',
    ).toBe(true)
    expect(DOSSIER_CTA_SCOPE_FILES.includes(temoin as (typeof DOSSIER_CTA_SCOPE_FILES)[number])).toBe(false)

    // 2. La primitive qui POSE le contrat rend un `<Button>` nu : elle est hors
    //    portée par construction, sinon la garde s'accuserait elle-même.
    const primitive = 'features/accounts/view/account-detail/cta/DossierCta.tsx'
    expect(DOSSIER_CTA_SCOPE_FILES.includes(primitive as (typeof DOSSIER_CTA_SCOPE_FILES)[number])).toBe(false)

    // 3. `busy` et `blockedBy` passent — ce sont les deux formes qui DISENT.
    const legitime = `<DossierCtaButton cta="dossier.gate.open" busy={decide.isPending}>x</DossierCtaButton>`
    expect(/\bdisabled[=\s>]/.test(openingTags(legitime, CLICKABLE)[0].tag)).toBe(false)
  })

  it('lit une balise entière, flèche de `onClick` comprise — la panne des gardes borgnes', () => {
    const tag = openingTags(
      `<DossierCtaButton cta="dossier.gate.park.confirm" onClick={() => { decide.mutate({ gate: 'parked' }) }} busy={x}>ok</DossierCtaButton>`,
      CLICKABLE,
    )[0].tag
    expect(tag).toContain('busy={x}')
    expect(ctaOf(tag)).toBe('dossier.gate.park.confirm')
  })

  it('ignore un identifiant seulement CITÉ dans un commentaire', () => {
    const source = `// <DossierCtaButton cta="dossier.jamais.rendu">\n<DossierCtaButton cta="dossier.gate.open">x</DossierCtaButton>`
    const tags = openingTags(stripComments(source), CLICKABLE)
    expect(tags).toHaveLength(1)
    expect(ctaOf(tags[0].tag)).toBe('dossier.gate.open')
  })
})
