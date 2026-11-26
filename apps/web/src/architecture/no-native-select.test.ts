import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-251 — UN MENU DÉROULANT PASSE PAR `SelectField`, PAS PAR `<select>`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI SE VOYAIT, ET POURQUOI AUCUN TEST NE L'ATTRAPAIT
 * ─────────────────────────────────────────────────────────────────────────
 * 69 % des menus du produit étaient des `<select>` HTML natifs : 47 balises
 * sur 35 fichiers, contre 26 usages du composant. Un `<select>` natif rend
 * son menu déroulant avec les couleurs du SYSTÈME D'EXPLOITATION — ni le
 * thème, ni le rayon, ni la police du produit ne s'y appliquent. En thème
 * sombre, c'est une liste blanche qui s'ouvre au milieu d'un écran noir.
 *
 * Aucun test ne pouvait le voir : dans jsdom, un `<select>` a un rôle, des
 * options, il se tabule et il se lit. Tout est vert. Ce qui casse est ce que
 * jsdom ne rend pas — la peinture du menu par l'OS.
 *
 * Plusieurs écrans avaient d'ailleurs SENTI le problème et tenté de le
 * rattraper : l'un forçait `style={{ background: '#1A1A24' }}` sur ses
 * `<option>` — une couleur qui n'existe dans aucun thème du dépôt, et qui
 * n'aurait de toute façon rien changé sur la plupart des navigateurs.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ARGUMENT QUI REVIENDRA, ET SA RÉPONSE
 * ─────────────────────────────────────────────────────────────────────────
 * Quatre fichiers portaient un commentaire disant que le natif était choisi
 * DÉLIBÉRÉMENT : « il se tabule, s'ouvre au clavier, appelle le sélecteur du
 * système sur un téléphone, n'exige aucun script », « pas de portail, pas de
 * z-index ». C'étaient de bons arguments, et ils ont été traités plutôt
 * qu'ignorés :
 *
 *  - clavier et lecteur d'écran : `SelectField` s'appuie sur Radix, qui rend
 *    un `combobox` ARIA complet — le test `select-field.test.tsx` vérifie
 *    l'ouverture au clavier et le nom accessible ;
 *  - z-index : l'échelle d'empilement du produit est NOMMÉE (`picker`), ce
 *    qui règle la question sans renoncer au thème ;
 *  - téléphone : le menu Radix est tactile et respecte le plancher de 44 px.
 *
 * Ce qui reste vrai du natif — zéro script — ne compense pas un menu qui
 * ignore le thème sur la moitié des écrans du produit.
 */

const WEB_SRC = join(__dirname, '..')

/**
 * `<select` en début de balise. Pas `<SelectField`, pas `<SelectTrigger`.
 *
 * ⚠️ La FIN DE LIGNE compte comme un séparateur, et ce n'est pas un détail :
 * la forme la plus répandue dans le dépôt est `      <select` suivi de ses
 * attributs à la ligne. Sans l'ancre `$`, cette garde était verte sur la
 * majorité des cas qu'elle prétend interdire — c'est la preuve « sait dire
 * NON » qui l'a trouvée, pas une relecture.
 */
const NATIVE_SELECT = /<select(?:[\s>/]|$)/

function tsxFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (entry.endsWith('.tsx') && !entry.includes('.test.')) out.push(full)
    }
  }
  walk(root)
  return out
}

/**
 * Une ligne de commentaire. Le dépôt en compte seize qui CITENT `<select>`
 * pour raconter ce qui a été retiré — dont celles de cette garde. Les compter
 * comme des fautes rendrait le fichier rouge sur sa propre explication.
 */
function isComment(line: string): boolean {
  const trimmed = line.trimStart()
  return trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('{/*')
}

const CORPUS = tsxFiles(WEB_SRC).map(path => ({ path, lines: readFileSync(path, 'utf8').split('\n') }))

describe('GA-251 — aucun menu déroulant natif dans les écrans', () => {
  it('LIT vraiment un corpus, et il n’est pas vide', () => {
    expect(CORPUS.length).toBeGreaterThan(800)
    expect(CORPUS.some(f => f.path.includes('/features/discover/'))).toBe(true)
  })

  it('sait dire NON — les formes réellement rencontrées sont refusées', () => {
    // Preuve n°2 : les quatre écritures trouvées dans le dépôt avant le
    // 01/09, y compris la balise auto-fermante et celle qui tient sur une
    // seule ligne.
    for (const ligne of [
      '      <select',
      '<select value={x} onChange={e => f(e.target.value)}>',
      '        <select',
      '<select/>',
    ]) {
      expect(NATIVE_SELECT.test(ligne), ligne).toBe(true)
    }
  })

  it('n’attrape PAS ce qu’elle ne vise pas', () => {
    // Preuve n°3. Le composant du produit et les briques Radix portent tous un
    // S majuscule ; les confondre avec le natif rendrait la garde inutilisable
    // le jour où elle protège précisément leur usage.
    for (const ligne of [
      '<SelectField value={x} onChange={f} options={o} />',
      '<SelectTrigger>',
      '<SelectContent>',
      'const selected = options.filter(o => o.value)',
      'import { Select } from "../components/select"',
    ]) {
      expect(NATIVE_SELECT.test(ligne), ligne).toBe(false)
    }
  })

  it('ne trouve aucun `<select>` natif dans le produit', () => {
    const offences: string[] = []
    for (const { path, lines } of CORPUS) {
      lines.forEach((line, index) => {
        if (isComment(line)) return
        if (NATIVE_SELECT.test(line)) offences.push(`${path.split('/src/')[1]}:${index + 1}`)
      })
    }

    expect(
      offences,
      offences.length === 0
        ? ''
        : `Menus déroulants natifs (ils ne suivent pas le thème) :\n` +
            offences.map(o => `  ${o}`).join('\n') +
            `\n\nUtiliser <SelectField> de @bellum/ui : value, onChange, options,\n` +
            `et emptyOption pour ce que le natif écrivait <option value="">.`,
    ).toEqual([])
  })

  it('vérifie que `SelectField` est bien EN SERVICE, pas seulement écrit', () => {
    // ⚠️ Le défaut n°1 du dépôt est du code juste que personne n'appelle. Une
    // garde qui interdit l'ancien sans mesurer l'adoption du neuf laisserait
    // passer un produit sans aucun menu déroulant du tout.
    const users = CORPUS.filter(f => f.lines.some(l => l.includes('<SelectField')))
    expect(users.length, 'SelectField devrait être employé sur une trentaine d’écrans').toBeGreaterThanOrEqual(30)
  })
})
