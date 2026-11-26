import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * UN SEUL ASSISTANT DE CRÉATION DE BESOIN (31/08/2026) — ⚠️ une seule porte
 * depuis le 14/10/2026 (#4196, lot L5).
 *
 * `/missions/nouvelle` (`CreateMissionPage`) a été la seconde porte de
 * l'assistant du 31/08 au 14/10/2026. Elle monte désormais `MissionCreateForm`,
 * qui crée une vraie MISSION : « Nouvelle mission » ne produit plus un besoin.
 * La garde ci-dessous le tient dans les DEUX sens — le dialogue monte toujours
 * l'assistant, la page de mission ne le monte plus.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUE CETTE GARDE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * L'assistant en quatre étapes est atteint par `CreateNeedDialog` — le dialogue de
 * `/projects/needs` (« Créer un besoin »). Il l'a été aussi par `CreateMissionPage`
 * (31/08/2026, demandée par Louis sur `08-creer-un-besoin.png`) jusqu'au lot L5.
 *
 * Une porte, un seul assistant. Le mode d'échec que cette garde refuse est
 * celui que le dépôt a déjà payé : quelqu'un COPIE le composant pour l'adapter
 * à sa porte, les deux copies vivent, et six semaines plus tard l'une valide un
 * champ que l'autre ignore. C'est la loi 4 du tome 7 — « rien n'apparaît deux
 * fois sous la même forme avec le même contenu » — et la seule forme de cette
 * loi qu'une machine sache lire honnêtement : compter les DÉFINITIONS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE, ET CE QU'ELLE NE PRÉTEND PAS SAVOIR
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle sait dire trois choses, exactement :
 *  1. `NeedWizard` n'est DÉFINI qu'une fois dans tout `apps/web/src` ;
 *  2. la porte le MONTE (`<NeedWizard`), l'importe du module de l'assistant, et la
 *     page `/missions/nouvelle` ne le monte PLUS (#4196) ;
 *  3. la conversion vers le corps serveur (`needWizardDraftToAccountNeedInput`)
 *     n'a qu'un seul appelant hors modèle et hors tests — un second serait un
 *     second chemin de création, donc un second assistant déguisé.
 *
 * ⚠️ #2558.1 — c'est le NOM de la conversion qui a changé le 18/09/2026, pas
 * la règle : depuis que le besoin peut exister sans projet, le corps envoyé
 * porte le CLIENT (`needWizardDraftToAccountNeedInput`, qui compose l'ancienne
 * projection des champs plutôt que de la recopier). Une garde suit ce qu'elle
 * protège ; elle ne gèle pas un identifiant.
 *
 * Elle ne sait PAS si les deux portes rendent la même chose à l'écran. Une
 * garde qui le prétendrait lirait du JSX comme un humain, ce qu'aucune
 * expression régulière ne fait honnêtement.
 *
 * ⚠️ Les COMMENTAIRES sortent du corpus : ce fichier-ci et les docblocks des
 * deux portes citent `NeedWizard` en toutes lettres. Une garde qui compte une
 * citation compte un composant qui n'existe pas.
 */

const SRC = join(__dirname, '..')
const WIZARD = join(SRC, 'features', 'projects', 'open-needs', 'view', 'NeedWizard.tsx')
const DIALOG_DOOR = join(SRC, 'features', 'projects', 'open-needs', 'view', 'CreateNeedDialog.tsx')
const MISSION_PAGE = join(SRC, 'features', 'missions', 'view', 'CreateMissionPage.tsx')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry)) continue
    if (/\.(test|spec)\.tsx?$/.test(entry)) continue
    if (entry === 'routeTree.gen.ts') continue
    out.push(full)
  }
  return out
}

/** ⚠️ Un commentaire cite ; il ne définit ni ne monte rien. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const FILES = sourceFiles(SRC)

describe('un seul assistant de création de besoin, deux portes', () => {
  it('LIT un corpus réel — sinon tout ce qui suit serait vrai par vacuité', () => {
    // Le corpus a dépassé 900 fichiers en août 2026 ; une borne basse suffit à
    // repérer un `SRC` mal résolu, qui rendrait cette garde verte sur RIEN.
    expect(FILES.length).toBeGreaterThan(300)
    for (const door of [WIZARD, DIALOG_DOOR, MISSION_PAGE]) {
      expect(FILES).toContain(door)
    }
  })

  it('ne définit `NeedWizard` qu’une seule fois dans tout apps/web/src', () => {
    const definers = FILES.filter(file =>
      /export function NeedWizard\b/.test(stripComments(readFileSync(file, 'utf8'))),
    )
    expect(definers.map(file => relative(SRC, file))).toEqual([relative(SRC, WIZARD)])
  })

  it('la porte du dialogue monte l’assistant, importé du module de l’assistant', () => {
    const source = stripComments(readFileSync(DIALOG_DOOR, 'utf8'))
    expect(source, `${relative(SRC, DIALOG_DOOR)} ne monte pas <NeedWizard>`).toMatch(/<NeedWizard\b/)
    // L'import doit VISER le module de l'assistant — un import depuis une
    // copie locale passerait le test précédent sans rien prouver.
    expect(source, `${relative(SRC, DIALOG_DOOR)} n’importe pas NeedWizard`).toMatch(
      /import\s*\{[^}]*\bNeedWizard\b[^}]*\}\s*from\s*'[^']*NeedWizard'/,
    )
  })

  it('« Nouvelle mission » (/missions/nouvelle) crée une MISSION : elle monte le formulaire, plus l’assistant de besoin (#4196)', () => {
    const source = stripComments(readFileSync(MISSION_PAGE, 'utf8'))
    expect(source).not.toMatch(/<NeedWizard\b/)
    expect(source).toMatch(/<MissionCreateForm\b/)
  })

  it('n’a qu’UN chemin de création — une seconde conversion serait un second assistant', () => {
    const callers = FILES.filter(file => {
      if (file.includes(join('open-needs', 'model'))) return false
      return /needWizardDraftToAccountNeedInput\s*\(/.test(stripComments(readFileSync(file, 'utf8')))
    })
    expect(callers.map(file => relative(SRC, file))).toEqual([relative(SRC, WIZARD)])
  })
})
