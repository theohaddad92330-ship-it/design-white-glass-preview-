import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NAV_SECTIONS, sectionForPath } from '../components/navigation/sections'

/**
 * GA-62 — pas de tableau de bord recruteur séparé (doctrine `c51_tableau_recruteur`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE REFUS DIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le §6 du PDF-02 refuse « un tableau de bord recruteur séparé ». Recruteur et
 * commercial travaillent sur les MÊMES écrans — les besoins ouverts et le
 * vivier —, et ce qui les sépare est une permission, jamais un écran.
 *
 * La raison est celle d'un défaut déjà payé : deux écrans pour le même stock de
 * besoins produisent deux vérités sur ce qui presse, et le jour où l'un des deux
 * gagne une colonne, l'autre ne l'a pas. C'est aussi pourquoi `/projects/needs`
 * est un ONGLET et non une entrée de navigation — au-delà de dix entrées, on
 * n'utilise plus que les trois qu'on connaît.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE AJOUTE AUX DEUX QUI EXISTENT
 * ─────────────────────────────────────────────────────────────────────────────
 * `nav-gates-on-permission.test.ts` refuse déjà toute comparaison de rôle
 * littérale DANS la navigation, et `sections.test.ts` refuse une dixième section
 * et une route déclarée deux fois. Aucune des deux ne regarde les ÉCRANS
 * eux-mêmes : un composant de `open-needs/` ou de `consultants/` qui se
 * brancherait sur `role === 'recruiter'` passerait au vert dans les deux.
 *
 * ⚠️ Ce qui reste légitime, et que cette garde NE touche pas : `managerOnly`.
 * « Pilotage » est réservé au responsable parce que son endpoint l'est. Ce qui
 * est refusé est un écran réservé à un MÉTIER dont l'API est ouverte à tous —
 * la faute exacte que le déplacement de `/pilotage/rex` sous Missions a
 * corrigée le 28/08.
 */

/** Les deux écrans que recruteur et commercial partagent, tels que le refus les
 *  nomme. Leurs répertoires, parce que c'est là qu'un branchement par métier
 *  s'écrirait — pas dans la barre de navigation. */
const SHARED_SCREENS = ['src/features/projects/open-needs', 'src/features/consultants'] as const

/** Les mots par lesquels une section réservée à un métier se reconnaîtrait. */
const TRADE_WORDS = /recrut|recruit|sourcer|staffeur/i

/** `role === 'recruiter'`, `role !== "sales"`, et leurs variantes. */
const LITERAL_ROLE =
  /\brole\s*[=!]==?\s*['"](owner|admin|member|viewer|sales|sales_ops|tech_admin|recruiter|finance)['"]/

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (/\.tsx?$/.test(entry) && !entry.includes('.test.')) out.push(full)
  }
  return out
}

const WEB_SRC = join(__dirname, '..')
const sharedScreenFiles = SHARED_SCREENS.flatMap(dir => sourceFiles(join(WEB_SRC, '..', dir)))

describe('GA-62 — recruteur et commercial partagent les mêmes écrans', () => {
  it('LIT quelque chose — les quatorze sections et les deux répertoires partagés', () => {
    // Sans cette assertion, un répertoire renommé rendrait la garde verte sur
    // du vide, ce qui est le défaut qu'elle est censée empêcher ailleurs.
    // 9 → 10 le 14/10/2026 (#4158.9) : « Équipe » devient une section de 1er niveau.
    // 10 → 14 le 24/10/2026 (#4492, PR 12C) : Contacts, Signaux, Découvrir et Messagerie redeviennent des sections.
    expect(NAV_SECTIONS.length).toBe(14)
    expect(sharedScreenFiles.length).toBeGreaterThan(10)
  })

  it('aucune section ni onglet de navigation n’est réservé à un métier', () => {
    const offenders: string[] = []
    for (const section of NAV_SECTIONS) {
      if (TRADE_WORDS.test(section.key) || TRADE_WORDS.test(section.labelKey)) offenders.push(section.key)
      for (const tab of section.tabs) {
        if (TRADE_WORDS.test(tab.to) || TRADE_WORDS.test(tab.labelKey)) offenders.push(`${section.key} › ${tab.to}`)
      }
    }
    if (offenders.length > 0) {
      throw new Error(
        [
          'Une entrée de navigation porte le nom d’un métier. Le §6 du PDF-02',
          'refuse « un tableau de bord recruteur séparé » : ce qui sépare un',
          'recruteur d’un commercial est une PERMISSION, pas un écran.',
          '',
          ...offenders.map(entry => `  · ${entry}`),
        ].join('\n'),
      )
    }
    expect(offenders).toEqual([])
  })

  it('les deux écrans partagés sont bien DÉCLARÉS dans la navigation partagée', () => {
    // Le NON de la règle précédente serait vrai aussi sur une nav qui aurait
    // perdu les deux écrans. On vérifie donc qu'ils y sont, et sous quelle
    // section : `/projects/needs` est un ONGLET de Projets, jamais une entrée.
    const projects = NAV_SECTIONS.find(section => section.key === 'projects')
    const talents = NAV_SECTIONS.find(section => section.key === 'talents')
    // #4344 / #4349 (Louis 19/10/2026, renverse #4197) — Affaires = le Pipe seul, Talents = le Vivier seul :
    // aucune des deux sections n'a d'onglet. Les besoins ouverts vivent SOUS Affaires (ouverts depuis
    // l'entête du pipe), le Vivier est l'entrée de Talents — les deux écrans restent dans la nav partagée.
    expect(talents?.to).toBe('/consultants')
    expect(talents?.tabs).toEqual([])
    expect(projects?.to).toBe('/projects')
    expect(sectionForPath('/projects/needs')?.section.key).toBe('projects')
    // Et aucun des deux n'est réservé au responsable : `managerOnly` reste
    // légitime ailleurs, jamais sur un écran que les deux métiers partagent.
    expect(projects?.managerOnly).toBeUndefined()
    expect(talents?.managerOnly).toBeUndefined()
    expect(projects?.tabs.find(tab => tab.to === '/projects/needs')?.managerOnly).toBeUndefined()
  })

  it('les besoins ouverts portent le MÊME palier que le pipe — pas un palier à eux', () => {
    // Un tableau de bord recruteur séparé commencerait par sa propre clé de
    // palier. Et une clé de palier NOUVELLE sans migration rend 403 pour tout
    // le monde : le dépôt l'a déjà payé une fois.
    const projects = NAV_SECTIONS.find(section => section.key === 'projects')
    const needs = projects?.tabs.find(tab => tab.to === '/projects/needs')
    expect(projects?.feature).toBe('needs')
    // L'onglet n'en déclare aucun : il hérite de celui de sa section.
    expect(needs?.feature).toBeUndefined()
  })

  it('aucun écran partagé ne se branche sur un rôle littéral', () => {
    const offenders = sharedScreenFiles
      .filter(file => LITERAL_ROLE.test(stripComments(readFileSync(file, 'utf8'))))
      .map(file => file.slice(file.indexOf('/src/')))
    if (offenders.length > 0) {
      throw new Error(
        [
          'Un écran partagé par le recruteur et le commercial compare le rôle à',
          'une valeur littérale. Passe par `hasPermission(role, …)` : réduire un',
          'écran partagé à un métier, c’est le tableau de bord séparé que le §6',
          'du PDF-02 refuse, en moins visible.',
          '',
          ...offenders.map(path => `  · ${path}`),
        ].join('\n'),
      )
    }
    expect(offenders).toEqual([])
  })

  it('sait dire NON — un onglet de métier et un branchement par rôle sont vus', () => {
    // On rejoue les deux règles sur des entrées fabriquées : casser les vraies
    // ferait passer un écran cloisonné le temps d'un test.
    expect(TRADE_WORDS.test('/recrutement')).toBe(true)
    expect(TRADE_WORDS.test('tabs.recruiterBoard')).toBe(true)
    expect(TRADE_WORDS.test('/projects/needs')).toBe(false)
    expect(TRADE_WORDS.test('tabs.needs')).toBe(false)

    expect(LITERAL_ROLE.test("if (role === 'recruiter') return null")).toBe(true)
    expect(LITERAL_ROLE.test('if (hasPermission(role, "records:write")) return null')).toBe(false)
  })

  it('les commentaires sont retirés avant lecture — ce fichier en cite un', () => {
    // Le docblock ci-dessus écrit `role === 'recruiter'`. Sans le retrait, la
    // garde se dénoncerait elle-même sur n'importe quel écran qui l'explique.
    expect(LITERAL_ROLE.test(stripComments("/* role === 'recruiter' */ const a = 1"))).toBe(false)
    expect(LITERAL_ROLE.test(stripComments("const gate = role === 'recruiter'"))).toBe(true)
  })
})
