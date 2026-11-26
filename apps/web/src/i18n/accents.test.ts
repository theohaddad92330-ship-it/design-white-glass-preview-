import { NAMESPACES } from '@/i18n/config'
import { resources } from '@/i18n/resources'

/**
 * FR accent guard.
 *
 * Le bloc `analysis.previews` est parti en prod entièrement désaccentué
 * (« Une premiere lecture du compte se dessine », « consolide le perimetre »,
 * « Ce que Bellum verifie »). C'est l'écran que le prospect lit pendant les
 * 3 à 6 minutes de l'analyse : la première impression du produit était en
 * français fautif. La parité FR/EN ne pouvait pas l'attraper — les clés et les
 * placeholders étaient corrects, seul le texte était faux.
 *
 * On liste donc les mots qui n'existent PAS sans accent en français. Un mot
 * ambigu (« cote » vs « côté », « ou » vs « où », « a » vs « à ») n'a rien à
 * faire ici : le test doit rester un constat mécanique, jamais un jugement de
 * style. Les placeholders `{{role}}` sont retirés avant l'examen — ce sont des
 * identifiants de code, pas de la copie.
 */
const MUST_BE_ACCENTED = [
  'chaine',
  'credible',
  'deja',
  'ecosysteme',
  'elements',
  'emerger',
  'entites',
  'equipes',
  'generes',
  'identifies',
  'maturite',
  'meriteront',
  'perimetre',
  'pese',
  'precisent',
  'premiere',
  'prepare',
  'preparer',
  'priorite',
  'priorites',
  'proximite',
  'repere',
  'responsabilite',
  'sequence',
  'verifie',
  'verifies',
] as const

type Tree = Record<string, unknown>

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') {
      out.set(path, value)
    } else if (value && typeof value === 'object') {
      for (const [subPath, subValue] of flatten(value as Tree, path)) {
        out.set(subPath, subValue)
      }
    }
  }
  return out
}

/** `{{role}}` est un nom de variable, pas un mot français : on le retire. */
function copyOnly(value: string): string {
  return value.replace(/\{\{[^}]*\}\}/g, ' ')
}

// Les lettres accentuées entrent dans la classe « mot » : sans ça, « pese »
// matcherait à l'intérieur de « pèse » n'est jamais vrai, mais « verifie »
// matcherait dans « vérifie » si la frontière était le \b d'ASCII.
const WORD = '[A-Za-zÀ-ÖØ-öø-ÿ]'

describe('i18n FR accents', () => {
  it.each([...NAMESPACES])('namespace "%s" has no unaccented french word', ns => {
    const offenders: string[] = []
    for (const [path, value] of flatten(resources.fr[ns] as Tree)) {
      const text = copyOnly(value)
      for (const word of MUST_BE_ACCENTED) {
        if (new RegExp(`(?<!${WORD})${word}(?!${WORD})`, 'i').test(text)) {
          offenders.push(`${path} → « ${word} » dans : ${value}`)
          break
        }
      }
    }
    expect(offenders, `mots non accentués dans fr/${ns}.json`).toEqual([])
  })
})
