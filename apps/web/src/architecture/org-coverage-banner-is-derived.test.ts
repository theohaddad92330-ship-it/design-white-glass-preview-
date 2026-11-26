/**
 * GA-114 — l'écran ne REFABRIQUE pas un compteur de couverture, et surtout pas
 * un que le contrat refuse de produire.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ LE 30/08/2026, EN PRODUCTION
 * ─────────────────────────────────────────────────────────────────────────
 * Le bandeau de l'onglet Organigramme annonçait, sur le compte AIRBUS :
 *
 *   > « 2 241 découverts · **43 rattachés** · … »
 *
 * `orgCoverageSchema` déclare `attachedToEntity` OPTIONNEL et écrit pourquoi :
 * « Le compter sur le corpus entier donnerait le nombre d'enrichis, présenté
 * comme un nombre de rattachés — donc "40 rattachés sur 2 241" là où la vérité
 * est "on ne sait pas pour 2 201 d'entre eux". » L'assembleur Python refuse
 * pour la même raison, écrite deux fois.
 *
 * L'écran le fabriquait quand même, en comptant `graph.people` — LA PROJECTION,
 * que la taille de vague d'enrichissement borne à cinquante. Le nombre affiché
 * ne pouvait donc jamais dépasser 50, quel que soit le compte : il ne mesurait
 * pas ce que son libellé promettait, il mesurait la vague. C'est mot pour mot
 * l'exemple que le contrat donne pour expliquer son refus — **l'hypothèse du
 * commentaire était le comportement livré**.
 *
 * Le même bloc se trompait une seconde fois, plus discrètement : « enrichis IA »
 * annonçait 9 (les nœuds projetés) là où le run en avait mesuré 16, sur le
 * dossier de démonstration Société Générale.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN INTERDIT, ET PAS UN CLIQUET
 * ─────────────────────────────────────────────────────────────────────────
 * Après le correctif, le compte est ZÉRO : `deriveOrgCoverage` est la seule
 * dérivation, et elle vit dans `@bellum/contracts`. Il n'y a aucune dette à
 * résorber, donc toute réapparition est une régression.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE LIT LE CONTRAT, ET NE CONNAÎT AUCUN NOM PAR CŒUR
 * ─────────────────────────────────────────────────────────────────────────
 * Une garde qui embarquerait sa propre liste de champs deviendrait fausse le
 * jour où le contrat en ajoute un — et elle serait VERTE en le devenant, ce qui
 * est le pire des deux mondes. Celle-ci extrait les champs de
 * `OrgCoverageHeader` et les champs OPTIONNELS de `orgCoverageSchema` depuis le
 * fichier du contrat, et vérifie qu'elle a bien lu avant de conclure.
 *
 * Elle ne cherche pas non plus le MOT « coverage » : le bloc fautif aurait pu
 * s'appeler autrement. Elle reconnaît la FORME — un littéral d'objet dont les
 * clés sont celles du bandeau.
 *
 * Les deux preuves exigées d'une garde :
 *  · elle LIT quelque chose → `describe('le corpus…')` et `describe('le contrat…')`
 *    vérifient que rien n'est vide et que les fichiers concernés sont dedans ;
 *  · elle SAIT DIRE NON → `describe('le détecteur…')` lui soumet le bloc
 *    RÉELLEMENT supprimé le 30/08 et vérifie qu'elle le refuse.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const WEB_SRC = join(__dirname, '..')
const CONTRACT = join(__dirname, '../../../../packages/contracts/src/schemas/org-graph.ts')

/* ------------------------------------------------------------------ */
/*  1. Retirer ce qui n'est pas du code                                */
/* ------------------------------------------------------------------ */

/**
 * Remplace commentaires, chaînes et littéraux d'expression régulière par des
 * espaces, en préservant la longueur (les offsets restent lisibles).
 *
 * Sans ce passage, la garde trouverait ses propres exemples dans les blocs de
 * documentation ci-dessus et se déclarerait rouge sur son propre commentaire —
 * c'est arrivé deux fois dans ce dépôt.
 */
function stripNonCode(src: string): string {
  const out: string[] = []
  let lastSignificant = ''
  let i = 0

  const blank = (text: string): void => {
    for (const char of text) out.push(char === '\n' ? '\n' : ' ')
  }

  while (i < src.length) {
    const two = src.slice(i, i + 2)

    if (two === '//') {
      const end = src.indexOf('\n', i)
      const stop = end === -1 ? src.length : end
      blank(src.slice(i, stop))
      i = stop
      continue
    }

    if (two === '/*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end === -1 ? src.length : end + 2
      blank(src.slice(i, stop))
      i = stop
      continue
    }

    const char = src[i]!

    if (char === '"' || char === "'" || char === '`') {
      let j = i + 1
      while (j < src.length) {
        if (src[j] === '\\') {
          j += 2
          continue
        }
        if (src[j] === char) break
        j += 1
      }
      const stop = Math.min(j + 1, src.length)
      blank(src.slice(i, stop))
      i = stop
      continue
    }

    // `/` est ambigu : division ou début d'expression régulière. On tranche sur
    // le dernier caractère significatif, l'heuristique usuelle.
    if (char === '/' && !/[\w$)\]]/.test(lastSignificant)) {
      let j = i + 1
      let inClass = false
      while (j < src.length) {
        if (src[j] === '\\') {
          j += 2
          continue
        }
        if (src[j] === '[') inClass = true
        else if (src[j] === ']') inClass = false
        else if (src[j] === '/' && !inClass) break
        else if (src[j] === '\n') break
        j += 1
      }
      if (src[j] === '/') {
        const stop = j + 1
        blank(src.slice(i, stop))
        i = stop
        continue
      }
    }

    out.push(char)
    if (!/\s/.test(char)) lastSignificant = char
    i += 1
  }

  return out.join('')
}

/* ------------------------------------------------------------------ */
/*  2. Ce que le CONTRAT déclare — lu, jamais recopié                  */
/* ------------------------------------------------------------------ */

const contractSource = readFileSync(CONTRACT, 'utf8')
const contractCode = stripNonCode(contractSource)

/** Les champs de `OrgCoverageHeader` — les dix compteurs du bandeau. */
function readHeaderFields(code: string): string[] {
  const start = code.indexOf('export type OrgCoverageHeader')
  if (start === -1) return []
  const open = code.indexOf('{', start)
  const close = code.indexOf('\n}', open)
  if (open === -1 || close === -1) return []
  return [...code.slice(open, close).matchAll(/^\s*([A-Za-z_$][\w$]*)\s*[?]?\s*:/gm)].map(m => m[1]!)
}

/**
 * Les champs que `orgCoverageSchema` déclare OPTIONNELS — ceux dont l'absence
 * est un trou NOMMÉ, et que rien ne doit donc produire ailleurs.
 */
function readRefusedFields(code: string): string[] {
  const start = code.indexOf('export const orgCoverageSchema')
  if (start === -1) return []
  const stop = code.indexOf('.superRefine', start)
  const block = code.slice(start, stop === -1 ? code.length : stop)
  return [...block.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:\s*z\.[^\n]*\.optional\(\)/gm)].map(m => m[1]!)
}

const HEADER_FIELDS = readHeaderFields(contractCode)
const REFUSED_FIELDS = readRefusedFields(contractCode)

/* ------------------------------------------------------------------ */
/*  3. Le corpus — le code qui PART EN PRODUCTION                      */
/* ------------------------------------------------------------------ */

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, out)
      continue
    }
    if (!/\.tsx?$/.test(entry)) continue
    // Les tests construisent légitimement des blocs `coverage` valides pour les
    // donner au contrat : ce qui est interdit, c'est de les FABRIQUER dans ce
    // qui s'affiche.
    if (/\.(test|spec)\.tsx?$/.test(entry)) continue
    out.push(full)
  }
  return out
}

const CORPUS = walk(WEB_SRC).map(path => ({ path, code: stripNonCode(readFileSync(path, 'utf8')) }))

/* ------------------------------------------------------------------ */
/*  4. Le détecteur — la FORME d'un bandeau refait à la main           */
/* ------------------------------------------------------------------ */

/** Découpe un corps d'objet sur ses virgules de PREMIER niveau. */
function topLevelSegments(body: string): string[] {
  const segments: string[] = []
  let depth = 0
  let current = ''
  for (const char of body) {
    if (char === '{' || char === '[' || char === '(') depth += 1
    else if (char === '}' || char === ']' || char === ')') depth -= 1
    if (char === ',' && depth === 0) {
      segments.push(current)
      current = ''
      continue
    }
    current += char
  }
  segments.push(current)
  return segments
}

/**
 * Les clés de premier niveau de chaque littéral d'objet du fichier.
 *
 * ⚠️ Les clés ABRÉGÉES comptent — et c'est la première version de cette garde
 * qui l'a appris en restant verte sur le bloc qu'elle devait attraper : le bloc
 * du 30/08 écrivait `discovered,` sans deux-points, si bien qu'un détecteur
 * réglé sur `clé :` n'en voyait qu'UN des deux compteurs et concluait à
 * l'innocence.
 *
 * En contrepartie, un littéral qui n'a QUE des clés abrégées est presque
 * toujours une déstructuration (`const { discovered, llmEnriched } = coverage`),
 * qui est une LECTURE parfaitement légitime du bandeau. On exige donc qu'au
 * moins une clé porte une valeur : c'est ce qui distingue « je fabrique » de
 * « je lis ».
 */
function objectLiteralKeySets(code: string): string[][] {
  const sets: string[][] = []
  for (let i = 0; i < code.length; i += 1) {
    if (code[i] !== '{') continue
    let depth = 0
    let end = -1
    for (let j = i; j < code.length; j += 1) {
      if (code[j] === '{') depth += 1
      else if (code[j] === '}') {
        depth -= 1
        if (depth === 0) {
          end = j
          break
        }
      }
    }
    if (end === -1) continue

    const keys: string[] = []
    let assigned = 0
    for (const segment of topLevelSegments(code.slice(i + 1, end))) {
      const withValue = /^\s*([A-Za-z_$][\w$]*)\s*:/.exec(segment)
      if (withValue) {
        keys.push(withValue[1]!)
        assigned += 1
        continue
      }
      const shorthand = /^\s*([A-Za-z_$][\w$]*)\s*$/.exec(segment)
      if (shorthand) keys.push(shorthand[1]!)
    }
    if (keys.length > 0 && assigned > 0) sets.push(keys)
  }
  return sets
}

/**
 * Un littéral REFAIT le bandeau dès qu'il en porte deux compteurs — un seul nom
 * peut appartenir à un autre domaine (`unassigned` existe aussi sur le tableau
 * de bord manager), deux ne se croisent pas par hasard.
 *
 * ⚠️ Le bloc supprimé le 30/08 n'utilisait PAS les noms du contrat : il disait
 * `attached`, `enriched`, `verifiedLinks`. Une garde qui n'aurait cherché que
 * les noms du contrat ne l'aurait jamais vu — mais il portait aussi `discovered`
 * et `uncoveredZones`, qui sont ceux du bandeau. C'est cette intersection-là que
 * le seuil de deux attrape.
 */
function refabricatesBanner(keys: string[]): boolean {
  return keys.filter(key => HEADER_FIELDS.includes(key)).length >= 2
}

/** Produire une valeur pour un champ que le contrat déclare comme un trou. */
function producesRefusedField(keys: string[]): string[] {
  return keys.filter(key => REFUSED_FIELDS.includes(key))
}

/* ------------------------------------------------------------------ */
/*  5. Les preuves                                                     */
/* ------------------------------------------------------------------ */

describe('GA-114 — le contrat, LU', () => {
  it('les compteurs du bandeau sont extraits du contrat, pas recopiés ici', () => {
    expect(HEADER_FIELDS.length).toBeGreaterThanOrEqual(8)
    expect(HEADER_FIELDS).toContain('discovered')
    expect(HEADER_FIELDS).toContain('attachedToEntity')
    expect(HEADER_FIELDS).toContain('uncoveredZones')
  })

  it('le champ que le contrat REFUSE de produire est lu comme tel', () => {
    // Si `attachedToEntity` cessait d'être optionnel — parce que le rattachement
    // déterministe couvrirait enfin le corpus — cette assertion tomberait, et
    // c'est voulu : la règle changerait, la garde doit être relue.
    expect(REFUSED_FIELDS).toContain('attachedToEntity')
  })
})

describe('GA-114 — le corpus, LU', () => {
  it('lit un corpus non vide, et suffisamment gros pour être le vrai', () => {
    expect(CORPUS.length).toBeGreaterThan(200)
  })

  it('contient les deux fichiers du bandeau — sans eux la garde ne garde rien', () => {
    const paths = CORPUS.map(file => file.path)
    expect(paths.some(p => p.endsWith('organigramme/focalOrgData.ts'))).toBe(true)
    expect(paths.some(p => p.endsWith('organigramme/FocalOrgView.tsx'))).toBe(true)
  })

  it('le stripper laisse du code, il ne blanchit pas tout', () => {
    const banner = CORPUS.find(file => file.path.endsWith('organigramme/focalOrgData.ts'))!
    expect(banner.code).toContain('deriveOrgCoverage')
  })
})

describe('GA-114 — le détecteur SAIT DIRE NON', () => {
  it('refuse le bloc RÉELLEMENT supprimé le 30/08/2026', () => {
    const fautif = `
      const view = {
        coverage: {
          discovered,
          graphPeople: graph.people.length,
          attached: graph.people.filter(p => p.entityId != null).length,
          enriched: graph.people.filter(p => ENRICHED.has(p.identityStatus)).length,
          verifiedLinks: graph.hierarchyEdges.filter(e => e.verified).length,
          probableLinks: graph.hierarchyEdges.filter(e => !e.verified).length,
          uncoveredZones: graph.uncoveredZones.length,
        },
      }
    `
    expect(objectLiteralKeySets(stripNonCode(fautif)).some(refabricatesBanner)).toBe(true)
  })

  it('refuse le même bloc RENOMMÉ — elle lit des clés, pas le mot « coverage »', () => {
    const camoufle = `const banner = { discovered: n, uncoveredZones: z.length }`
    expect(objectLiteralKeySets(stripNonCode(camoufle)).some(refabricatesBanner)).toBe(true)
  })

  it('refuse un seul champ, s’il est celui que le contrat déclare comme un trou', () => {
    const seul = `const partial = { attachedToEntity: people.filter(p => p.entityId).length }`
    const offending = objectLiteralKeySets(stripNonCode(seul)).flatMap(producesRefusedField)
    expect(offending).toContain('attachedToEntity')
  })

  it('compte les clés ABRÉGÉES — le bloc du 30/08 écrivait `discovered,` sans valeur', () => {
    // La première version de cette garde restait VERTE sur le bloc fautif pour
    // cette seule raison. Sans ce test, elle serait borgne et personne ne le
    // saurait avant la prochaine régression.
    const abrege = `const c = { discovered, uncoveredZones: zones.length }`
    expect(objectLiteralKeySets(stripNonCode(abrege)).some(refabricatesBanner)).toBe(true)
  })

  it('laisse passer une LECTURE du bandeau — déstructurer n’est pas fabriquer', () => {
    const lecture = `const { discovered, llmEnriched, uncoveredZones } = deriveOrgCoverage(graph)`
    expect(objectLiteralKeySets(stripNonCode(lecture)).some(refabricatesBanner)).toBe(false)
  })

  it('n’invente pas de faute là où il n’y en a pas', () => {
    // Un seul nom partagé avec le bandeau : c'est le tableau de bord manager, un
    // autre domaine. Une garde qui le refuserait ferait fuir ses utilisateurs.
    const innocent = `const c = { total_accounts: 12, assigned: 5, unassigned: 7 }`
    expect(objectLiteralKeySets(stripNonCode(innocent)).some(refabricatesBanner)).toBe(false)
    // Et un commentaire qui DÉCRIT la faute n'est pas la faute.
    const commente = `// coverage: { discovered, uncoveredZones }\nconst x = 1`
    expect(objectLiteralKeySets(stripNonCode(commente)).some(refabricatesBanner)).toBe(false)
  })
})

/**
 * Louis 12/10/2026 — la NOUVELLE règle du bandeau : un graphe sans aucune arête ne
 * montre pas « 0 liens vérifiés · 0 liens probables · 0 zones à couvrir ». La
 * décision vit au contrat (`orgHasHierarchyEdges`) et le bandeau la LIT : une
 * condition recopiée à l'écran (`> 0` sur les compteurs) divergerait.
 */
const BANNER_FILE = 'organigramme/OrgCoverageBanner.tsx'

/** Le rendu des trois compteurs de liens est-il conditionné par la règle du contrat ? */
function gatesLinkCountersOnContract(code: string): boolean {
  const gate = code.indexOf('orgHasHierarchyEdges(')
  const verified = code.indexOf('hierarchyVerified')
  return gate !== -1 && verified !== -1 && gate < verified
}

describe('GA-114 — aucune arête, aucun compteur de liens (Louis 12/10/2026)', () => {
  it('le contrat exporte la règle, et le bandeau la lit avant de rendre les compteurs de liens', () => {
    expect(contractCode).toContain('export function orgHasHierarchyEdges')
    const banner = CORPUS.find(file => file.path.endsWith(BANNER_FILE))
    expect(banner).toBeDefined()
    expect(gatesLinkCountersOnContract(banner!.code)).toBe(true)
  })

  it('sait dire NON : l’ancien rendu (compteurs inconditionnels) est refusé', () => {
    const ancien = `
      <CoverageCount value={coverage.hierarchyVerified} label={t('a')} />
      <CoverageCount value={coverage.hierarchyProbable} label={t('b')} />
    `
    expect(gatesLinkCountersOnContract(stripNonCode(ancien))).toBe(false)
  })
})

// Louis 13/10/2026 — le panneau « Couverture & qualité » (vue Groupe) porte les mêmes compteurs : même règle.
describe('GA-114 — le panneau « Couverture & qualité » lit la même règle', () => {
  it('GroupOrgView lit orgHasHierarchyEdges avant de rendre les compteurs de liens', () => {
    const panel = CORPUS.find(file => file.path.endsWith('organigramme/GroupOrgView.tsx'))
    expect(panel).toBeDefined()
    expect(gatesLinkCountersOnContract(panel!.code)).toBe(true)
  })

  it('sait dire NON : l’ancien panneau (QualityRow inconditionnelles) est refusé', () => {
    const ancien = `
      <QualityRow label={t('a')} count={view.coverage.hierarchyVerified} />
      <QualityRow label={t('b')} count={view.coverage.uncoveredZones} />
    `
    expect(gatesLinkCountersOnContract(stripNonCode(ancien))).toBe(false)
  })
})

describe('GA-114 — aucun écran ne refabrique le bandeau de couverture', () => {
  it('aucun littéral d’objet ne porte deux compteurs du bandeau', () => {
    const offenders = CORPUS.filter(file => objectLiteralKeySets(file.code).some(refabricatesBanner)).map(f => f.path)
    expect(offenders).toEqual([])
  })

  it('aucun écran ne produit un champ que le contrat déclare comme un trou nommé', () => {
    const offenders = CORPUS.flatMap(file =>
      objectLiteralKeySets(file.code)
        .flatMap(producesRefusedField)
        .map(field => `${file.path} → ${field}`),
    )
    expect(offenders).toEqual([])
  })

  it('le bandeau focal lit BIEN la dérivation du contrat', () => {
    // Le pendant positif : sans lui, supprimer le bandeau entier rendrait la
    // garde verte, et un écran vide passerait pour un écran juste.
    const banner = CORPUS.find(file => file.path.endsWith('organigramme/focalOrgData.ts'))!
    expect(banner.code).toMatch(/coverage:\s*deriveOrgCoverage\(/)
  })
})
