import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { OUTREACH_SCENARIOS, OUTREACH_WRITING_RULES } from './outreach-scenarios.js'
import { OUTREACH_MIN_DAYS_BETWEEN_MESSAGES } from './outreach-sequence.js'

/**
 * La garde de parité des règles de rédaction — TS (registre à identifiants) ↔
 * Python (les prompts qui les DISENT au modèle).
 *
 * ## Ce qu'elle protège, et pourquoi elle ne pouvait pas être un import
 *
 * `OUTREACH_WRITING_RULES` est le registre que lit le contrôle avant envoi : ses
 * huit identifiants sont ce sur quoi un brouillon est refusé. Les prompts qui
 * demandent d'écrire le message vivent en Python, dans un autre processus, qui
 * n'a pas le paquet contracts à l'exécution. La frontière interdit l'import ;
 * elle n'interdit pas de vérifier.
 *
 * L'invariant tenu ici : **le contrôle ne refuse jamais un message sur une règle
 * que le prompt n'a pas énoncée.** Il y avait trois listes de « règles d'or » —
 * huit dans `bellum_outreach`, dix dans `bellum_messages` (dont les huit
 * premières verbatim), huit à identifiants ici. Trois listes divergent au premier
 * ajout, et c'est le contrôle qui perd.
 *
 * ⚠️ Une garde doit prouver qu'elle LIT quelque chose. Les tests de corpus
 * ci-dessous échouent si l'extraction rend zéro entrée — sans eux, une regex
 * périmée rendrait la parité verte à vide, pour toujours.
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

const MESSAGES_PY = monorepoFile('apps/ia/app/prompts/bellum_messages.py')
const OUTREACH_PY = monorepoFile('apps/ia/app/prompts/bellum_outreach.py')

const messagesSource = readFileSync(MESSAGES_PY, 'utf8')
const outreachSource = readFileSync(OUTREACH_PY, 'utf8')

/** Le corps littéral de `CHECKER_RULE_SOURCES` — commentaires `#` retirés
 *  d'abord : une garde qui compte ses propres commentaires lit un corpus
 *  qu'elle a inventé. */
function checkerRuleSourceIds(): string[] {
  const marker = 'CHECKER_RULE_SOURCES: dict[str, str] = {'
  const start = messagesSource.indexOf(marker)
  expect(start, `déclaration \`CHECKER_RULE_SOURCES\` introuvable dans ${MESSAGES_PY}`).toBeGreaterThan(-1)
  const body = messagesSource.slice(start + marker.length).split('\n}')[0] ?? ''
  const withoutComments = body
    .split('\n')
    .map(line => line.replace(/#.*$/, ''))
    .join('\n')
  return [...withoutComments.matchAll(/"([a-z0-9_]+)":/g)].map(match => match[1] as string)
}

/** Tous les `checker_id="…"` revendiqués par la liste de règles Python. */
function claimedCheckerIds(): string[] {
  return [...messagesSource.matchAll(/checker_id="([a-z0-9_]+)"/g)].map(match => match[1] as string)
}

describe('parité des règles de rédaction — le registre TS ↔ les prompts Python', () => {
  it('LIT vraiment les deux prompts Python (sinon la garde est borgne)', () => {
    // Le corpus, pas le verdict : une garde qui lirait un fichier vide (chemin
    // périmé, renommage) passerait au vert sans rien avoir comparé.
    expect(messagesSource.length).toBeGreaterThan(2000)
    expect(outreachSource.length).toBeGreaterThan(1000)
    expect(messagesSource).toContain('GOLDEN_RULES')
    expect(outreachSource).toContain('golden_rules_block')

    expect(checkerRuleSourceIds().length).toBeGreaterThan(0)
    expect(claimedCheckerIds().length).toBeGreaterThan(0)
  })

  it('les huit règles du registre sont TOUTES énoncées par le prompt', () => {
    // L'invariant : le contrôle avant envoi ne refuse jamais un message sur une
    // règle que le prompt n'a pas dite. Deux des huit sont portées par un BLOC
    // (la cohérence M1-M2-M3, le respect des délais) et non par une règle
    // numérotée — la table Python le dit, plutôt que de laisser deviner.
    expect([...checkerRuleSourceIds()].sort()).toEqual([...OUTREACH_WRITING_RULES.map(rule => rule.id)].sort())
  })

  it('aucun prompt ne revendique un identifiant de règle qui n’existe pas', () => {
    const known = new Set(OUTREACH_WRITING_RULES.map(rule => rule.id))
    const claimed = claimedCheckerIds()
    expect(claimed.length).toBeGreaterThan(0)
    for (const id of claimed) {
      expect(known, `\`checker_id="${id}"\` ne correspond à aucune règle du registre`).toContain(id)
    }
  })

  it('il n’y a plus qu’UNE liste de règles d’or, et elle est rendue deux fois', () => {
    // Le défaut d'origine : le même en-tête écrit dans deux fichiers, donc deux
    // listes à maintenir. Il ne doit rester qu'une occurrence — celle du
    // rendu partagé — et `bellum_outreach` doit l'APPELER, pas la réécrire.
    const header = /RÈGLES D'OR/g
    const occurrences = (messagesSource.match(header) ?? []).length + (outreachSource.match(header) ?? []).length
    expect(occurrences, 'une deuxième liste de règles d’or est réapparue').toBe(1)
    expect(outreachSource).not.toContain("RÈGLES D'OR")
  })

  it('le décompte « vérifiable par du code » est celui du registre, pas celui du commentaire', () => {
    // Le commentaire annonçait « cinq mécaniques, trois non » : il y en a six et
    // deux. Un décompte écrit en prose ne casse jamais la CI — celui-ci, si.
    // #2123.74/.76/.78/.79 — les quatre interdits de ton du premier message sont
    // mécaniques : un élément réel se cherche dans le texte, un catalogue, une
    // urgence et une alerte historique se lisent à la sous-chaîne.
    // #2371.7 — le catalogue technique au décideur s'y ajoute : onze mécaniques.
    // #2372.6 — le document joint d'office se lit à la sous-chaîne : douze.
    const mechanical = OUTREACH_WRITING_RULES.filter(rule => rule.mechanical)
    expect(mechanical).toHaveLength(12)
    expect(OUTREACH_WRITING_RULES.filter(rule => !rule.mechanical).map(rule => rule.id)).toEqual([
      'sequence_coherence',
      'right_persona',
    ])
  })

  it('les identifiants de règle sont uniques et stables', () => {
    const ids = OUTREACH_WRITING_RULES.map(rule => rule.id)
    expect(new Set(ids).size).toBe(ids.length)
    const claimed = claimedCheckerIds()
    expect(new Set(claimed).size, 'deux règles Python revendiquent le même contrôle').toBe(claimed.length)
  })
})

describe('le plancher d’espacement DÉRIVE du registre des scénarios', () => {
  it('vaut le plus petit délai non nul des scénarios, calculé indépendamment', () => {
    // Il était écrit `= 4` à la main, avec en commentaire la façon de le
    // recalculer. Un nombre recopié à côté de sa table finit par ne plus la
    // suivre : le commentaire, lui, ne casse jamais la CI.
    const nonZero = Object.values(OUTREACH_SCENARIOS)
      .flatMap(scenario => [...scenario.minDelayDays])
      .filter(days => days > 0)
    expect(nonZero.length, 'aucun délai non nul lu — extraction vide').toBeGreaterThan(0)
    expect(OUTREACH_MIN_DAYS_BETWEEN_MESSAGES).toBe(Math.min(...nonZero))
    expect(Number.isFinite(OUTREACH_MIN_DAYS_BETWEEN_MESSAGES)).toBe(true)
  })

  it('reste 4 jours — la valeur en vigueur, qu’aucune mesure n’autorise à bouger', () => {
    expect(OUTREACH_MIN_DAYS_BETWEEN_MESSAGES).toBe(4)
  })
})
