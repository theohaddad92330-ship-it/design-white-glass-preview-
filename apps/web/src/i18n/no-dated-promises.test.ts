import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-342 — aucune chaîne d'interface ne promet une date de calendrier.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Le 16/09/2026, l'écran d'entrée de la démonstration publique disait encore
 * « {{brand}} sort en septembre ; d'ici là, explore librement. » — on ÉTAIT le
 * 16 septembre. La phrase avait été écrite des semaines plus tôt, elle était
 * juste ce jour-là, et elle a pourri toute seule : personne ne surveille une
 * date enfouie dans un fichier de traduction, et il n'existe aucun endroit du
 * produit d'où elle se recalculerait.
 *
 * C'est la même famille de défaut que `c33_promesse_chiffree` : un chiffre de
 * performance qui ne se recalcule depuis aucune source est une donnée fictive
 * affichée avec l'autorité d'une mesure. Une DATE de sortie écrite en dur est
 * une donnée fictive affichée avec l'autorité d'un engagement — et elle a ceci
 * de pire qu'elle devient fausse sans que personne n'ait touché au code.
 *
 * Deux dégâts, pas un :
 *   1. le prospect lit un engagement qui n'est plus tenu ;
 *   2. la phrase doit être RE-TRADUITE dans chaque langue à chaque glissement
 *      de calendrier — c'est-à-dire qu'elle ne le sera pas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE, EXACTEMENT
 * ─────────────────────────────────────────────────────────────────────────
 * Un nom de mois PRÉCÉDÉ d'une préposition de temps — « en septembre », « dès
 * octobre », « jusqu'en mars », « ships in September », « until January ». Ce
 * n'est pas le nom de mois qui fait la faute (185 libellés en portent un, dont
 * une écrasante majorité de « may » modal anglais) : c'est le SITUEMENT dans le
 * calendrier. « 16 septembre 2026 » — la forme d'une date de changelog — n'est
 * pas visé : il DATE quelque chose de passé, il ne promet rien.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DISCRIMINANT — une promesse n'est pas un exemple
 * ─────────────────────────────────────────────────────────────────────────
 * Trois libellés portent légitimement une date, et les trois sont des
 * PLACEHOLDERS : le texte grisé d'un champ, qui montre à l'utilisateur la forme
 * de ce qu'on attend de LUI (« Sopra est en place jusqu'en mars 2027 », « Budget
 * gelé jusqu'en janvier », « Rappeler début septembre »). Un texte
 * d'illustration saisi dans un champ n'est pas une affirmation du produit : il
 * ne vieillit pas, parce qu'il n'a jamais rien promis.
 *
 * Le discriminant est donc la CLÉ : son dernier segment se termine par
 * `placeholder`. Mesuré sur le corpus au 16/09/2026, il sépare exactement les
 * 6 occurrences légitimes (3 clés × 2 langues) des 2 fautives (`introBody` FR et
 * EN) — zéro exception nommée nécessaire.
 *
 * ⚠️ Il n'a PAS été élargi à `example` / `sample` : aucun libellé du corpus ne
 * porte ces noms aujourd'hui, et une garde ne s'accorde pas une exemption dont
 * elle n'a pas le témoin. Le jour où un exemple daté naît sous un autre nom de
 * clé, la garde rougit — c'est le bon sens de l'échec : elle demande qu'on
 * nomme l'exemption plutôt que de la deviner.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE LIT PAS, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────
 * Le corpus est celui des fichiers de `apps/web/src/i18n/locales`, pas l'objet
 * `resources` : ce dernier agrège aussi le namespace `changelog`, qui vit dans
 * `@bellum/contracts` et dont chaque entrée porte une date — par construction,
 * et à juste titre. Lire `resources` aurait noyé la garde sous des dates qui
 * sont son objet même.
 */

/* ------------------------------------------------------------------ */
/*  1. Le corpus                                                       */
/* ------------------------------------------------------------------ */

const LOCALES_DIR = join(__dirname, 'locales')

type Label = { locale: string; file: string; key: string; text: string }

function flatten(value: unknown, path: string, out: (p: string, t: string) => void): void {
  if (typeof value === 'string') {
    out(path, value)
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) flatten(child, path ? `${path}.${key}` : key, out)
  }
}

function readCorpus(): { labels: Label[]; locales: string[]; files: number } {
  const labels: Label[] = []
  const locales = readdirSync(LOCALES_DIR).sort()
  let files = 0
  for (const locale of locales) {
    for (const file of readdirSync(join(LOCALES_DIR, locale))) {
      if (!file.endsWith('.json')) continue
      files += 1
      const json: unknown = JSON.parse(readFileSync(join(LOCALES_DIR, locale, file), 'utf8'))
      flatten(json, '', (key, text) => labels.push({ locale, file, key, text }))
    }
  }
  return { labels, locales, files }
}

const CORPUS = readCorpus()

/* ------------------------------------------------------------------ */
/*  2. Le détecteur                                                    */
/* ------------------------------------------------------------------ */

/** Les prépositions qui SITUENT dans le calendrier. Sans l'une d'elles, un nom
 *  de mois date un fait ; avec elle, il fixe un rendez-vous. */
const FR_WHEN = String.raw`(?:en|dès|d['’]ici|jusqu['’]en|jusqu['’]au|jusqu['’]à|à partir de|courant|mi-|fin|début|avant|après)`
const FR_MONTHS = String.raw`(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)`
const EN_WHEN = String.raw`(?:in|by|from|until|till|through|before|after|starting|early|mid|late|end of)`
/** « May » est le seul mois anglais homographe d'un mot courant — et le mot
 *  courant est un MODAL, qui s'écrit en minuscule. On le traite donc à part,
 *  sensible à la casse, plutôt que de renoncer au mois ou d'avaler 150 « may ». */
const EN_MONTHS_UNAMBIGUOUS = String.raw`(?:january|february|march|april|june|july|august|september|october|november|december)`

const DETECTORS: Record<string, RegExp[]> = {
  fr: [new RegExp(String.raw`\b${FR_WHEN}\s*${FR_MONTHS}\b`, 'i')],
  en: [
    new RegExp(String.raw`\b${EN_WHEN}\s+${EN_MONTHS_UNAMBIGUOUS}\b`, 'i'),
    new RegExp(String.raw`\b(?:in|by|from|until|till|through|before|after|starting|early|mid|late|end of)\s+May\b`),
  ],
}

/** Le texte SITUE-t-il quelque chose dans un mois du calendrier ? */
function statesACalendarMonth(locale: string, text: string): boolean {
  const detectors = DETECTORS[locale] ?? DETECTORS.en
  return detectors.some(re => re.test(text))
}

/** Une illustration saisie dans un champ, pas une affirmation du produit. */
function isFieldPlaceholder(key: string): boolean {
  const last = key.split('.').pop() ?? ''
  return /placeholder$/i.test(last)
}

function offenders(): Label[] {
  return CORPUS.labels.filter(label => statesACalendarMonth(label.locale, label.text) && !isFieldPlaceholder(label.key))
}

/** Les trois exemples datés du corpus, nommés. Ils servent de TÉMOINS : la
 *  garde doit continuer à les laisser passer, et ils doivent continuer à porter
 *  une date — sinon le témoignage ne prouve plus rien. */
const WITNESS_PLACEHOLDER_KEYS = [
  'accountDetail.json::relationshipMemory.competitiveEdgePlaceholder',
  'activities.json::log.bodyPlaceholder',
  'projects.json::openNeeds.hold.placeholder',
]

/* ------------------------------------------------------------------ */
/*  3. La garde                                                        */
/* ------------------------------------------------------------------ */

describe('GA-342 — aucune promesse datée dans une chaîne d’interface', () => {
  it('lit bien tous les fichiers de langue — sinon la garde ne prouve rien', () => {
    // Un corpus vide rendrait chacune des assertions suivantes verte sans rien
    // vérifier : c'est le mode de défaillance qu'on paie six fois en deux jours.
    expect(CORPUS.locales).toEqual(['en', 'fr'])
    expect(CORPUS.files).toBeGreaterThanOrEqual(150)
    expect(CORPUS.labels.length).toBeGreaterThan(2000)
    expect(CORPUS.labels.some(l => l.locale === 'fr')).toBe(true)
    expect(CORPUS.labels.some(l => l.locale === 'en')).toBe(true)
    // …et le détecteur voit bien quelque chose DANS ce corpus : les témoins.
    expect(CORPUS.labels.filter(l => statesACalendarMonth(l.locale, l.text)).length).toBeGreaterThanOrEqual(6)
  })

  it('aucun libellé ne situe le produit dans un mois du calendrier', () => {
    const found = offenders().map(l => `${l.locale}/${l.file} → ${l.key} : « ${l.text.slice(0, 160)} »`)
    expect(
      found,
      '\nUne date de sortie écrite en dur dans un libellé pourrit toute seule : personne ne la\n' +
        'surveille, et elle doit être re-traduite dans chaque langue à chaque glissement.\n' +
        'Soit la phrase se passe de date, soit la date vient d’un réglage qui vit à UN endroit.\n' +
        'Si c’est un texte d’ILLUSTRATION saisi dans un champ, la clé doit finir par ' +
        '`placeholder`.\n\nLibellés fautifs :\n' +
        found.join('\n') +
        '\n',
    ).toEqual([])
  })

  it('SAIT DIRE NON — la phrase retirée de /demo est bien attrapée, dans les deux langues', () => {
    expect(statesACalendarMonth('fr', 'BellumAI sort en septembre ; d’ici là, explore librement.')).toBe(true)
    expect(statesACalendarMonth('en', 'BellumAI ships in September; until then, explore freely.')).toBe(true)
    // …et ses variantes proches, celles qu'on écrirait en la « corrigeant ».
    expect(statesACalendarMonth('fr', 'Disponible dès octobre.')).toBe(true)
    expect(statesACalendarMonth('fr', 'La marque blanche arrive mi-décembre.')).toBe(true)
    expect(statesACalendarMonth('en', 'Available from October.')).toBe(true)
    expect(statesACalendarMonth('en', 'White-label lands in May.')).toBe(true)
  })

  it('N’ATTRAPE PAS ce qu’elle ne vise pas — les exemples datés restent dicibles', () => {
    // Les trois témoins existent, portent bien une date, et ne sont PAS signalés.
    const witnesses = CORPUS.labels.filter(l => WITNESS_PLACEHOLDER_KEYS.includes(`${l.file}::${l.key}`))
    // 3 clés × 2 langues : si l'une disparaît ou perd sa date, le témoignage
    // n'a plus de valeur et il faut le savoir.
    expect(witnesses).toHaveLength(6)
    for (const witness of witnesses) {
      expect(statesACalendarMonth(witness.locale, witness.text), `${witness.locale}/${witness.key}`).toBe(true)
      expect(isFieldPlaceholder(witness.key), `${witness.locale}/${witness.key}`).toBe(true)
    }
    expect(offenders().filter(l => WITNESS_PLACEHOLDER_KEYS.includes(`${l.file}::${l.key}`))).toEqual([])
  })

  it('N’ATTRAPE PAS non plus un « may » modal, ni une date qui ne promet rien', () => {
    // La raison d'être du traitement séparé de « May » : 150 libellés anglais
    // portent le modal, et aucun ne promet quoi que ce soit.
    expect(statesACalendarMonth('en', 'The renewal list may be incomplete: some files may be missing.')).toBe(false)
    expect(statesACalendarMonth('en', 'It may have been deleted or does not belong to your workspace.')).toBe(false)
    // La forme d'une date de changelog : elle DATE, elle ne promet pas.
    expect(statesACalendarMonth('fr', '16 septembre 2026')).toBe(false)
    expect(statesACalendarMonth('en', 'September 16, 2026')).toBe(false)
    // Un mois nu, sans situement : un sélecteur de période, un axe de graphe.
    expect(statesACalendarMonth('fr', 'Septembre')).toBe(false)
    expect(statesACalendarMonth('en', 'September')).toBe(false)
  })
})
