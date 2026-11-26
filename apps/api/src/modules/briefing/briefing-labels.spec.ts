import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BRIEFING_ACTION_LABEL_KEYS,
  BRIEFING_CONSEQUENCE_LABEL_KEYS,
  BRIEFING_CONTEXT_LABEL_KEYS,
  BRIEFING_FACT_LABEL_KEYS,
  BRIEFING_VERDICT_LABEL_KEYS,
} from './briefing-actions'

/**
 * TOUTES les clés que le serveur émet pour une carte — le libellé, le fait, le
 * contexte. Les trois familles traversent la même frontière (une chaîne côté
 * serveur, une entrée de JSON côté web) et paient donc le même défaut : deux
 * familles ajoutées sans être gardées auraient affiché `context.silence` en
 * clair sur l'écran le plus regardé du produit, exactement comme
 * `action.conflict` l'a fait.
 */
const ALL_EMITTED_KEYS = [
  ...BRIEFING_ACTION_LABEL_KEYS,
  ...BRIEFING_FACT_LABEL_KEYS,
  ...BRIEFING_CONTEXT_LABEL_KEYS,
  // L1 (#2095.59 / #2095.85) — le verdict et la conséquence traversent la même
  // frontière : une clé par genre, gardée ici comme les trois autres familles.
  ...BRIEFING_VERDICT_LABEL_KEYS,
  ...BRIEFING_CONSEQUENCE_LABEL_KEYS,
] as const

/**
 * Une clé de libellé émise par le serveur a-t-elle sa traduction ?
 *
 * Ce test existe à cause d'un défaut vu en production, sur l'écran le plus
 * regardé du produit : le bloc « À faire maintenant » de « Aujourd’hui »
 * affichait `action.conflict`, `action.meetingPrep`, `action.followUp` — les
 * clés brutes, en clair, devant l'utilisateur.
 *
 * La cause tenait à une lettre. Le serveur émettait `briefing.action.X`, le
 * fichier de traduction disait `briefing.actions.X`. Les libellés étaient tous
 * écrits, en français comme en anglais ; personne ne les voyait.
 *
 * Rien ne pouvait l'attraper : la clé est une CHAÎNE côté serveur et une entrée
 * de JSON côté web. Deux dépôts logiques, aucun lien. Ce test est ce lien — il
 * lit le vrai fichier de traduction de l'app web et exige que chaque clé émise
 * s'y trouve, dans les deux langues.
 *
 * i18next, lui, ne se plaint pas : une clé absente s'affiche telle quelle. C'est
 * un choix raisonnable pour une bibliothèque, et c'est exactement pourquoi la
 * garde doit vivre ici.
 */

const LOCALES = ['fr', 'en'] as const

/** Le fichier de traduction du namespace `briefing`, tel que l'app web le sert. */
function readBriefingLocale(locale: string): Record<string, unknown> {
  const path = join(__dirname, '..', '..', '..', '..', 'web', 'src', 'i18n', 'locales', locale, 'briefing.json')
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

/** Résout `actions.conflict` dans l'objet de traduction. */
function lookup(tree: Record<string, unknown>, dottedKey: string): unknown {
  return dottedKey.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object') return (node as Record<string, unknown>)[part]
    return undefined
  }, tree)
}

/**
 * Les FORMES d'une clé — une seule, ou les deux formes de pluriel d'i18next.
 *
 * La première version de cette garde ne savait lire qu'une clé nue. Le jour où
 * le serveur a émis une clé PLURALISÉE (`context.silence`, dont les seules
 * entrées réelles sont `_one` et `_other`), elle a cherché `context.silence`,
 * n'a rien trouvé, et aurait déclaré la traduction manquante — pour une clé
 * parfaitement traduite. Une garde qui se trompe de forme ne garde rien : elle
 * apprend à se faire désactiver.
 *
 * Rend une liste vide quand RIEN n'existe sous aucune des trois formes — c'est
 * le seul cas qui doit faire rougir.
 */
function resolveForms(tree: Record<string, unknown>, dottedKey: string): Array<{ suffix: string; value: string }> {
  const direct = lookup(tree, dottedKey)
  if (typeof direct === 'string') return [{ suffix: '', value: direct }]
  return ['_one', '_other']
    .map(suffix => ({ suffix, value: lookup(tree, `${dottedKey}${suffix}`) }))
    .filter((entry): entry is { suffix: string; value: string } => typeof entry.value === 'string')
}

describe('libellés du brief du jour', () => {
  it('lit un corpus NON VIDE — sans lui, une boucle sur zéro clé passerait au vert', () => {
    expect(BRIEFING_ACTION_LABEL_KEYS.length).toBeGreaterThan(0)
    expect(BRIEFING_FACT_LABEL_KEYS.length).toBeGreaterThan(0)
    expect(BRIEFING_CONTEXT_LABEL_KEYS.length).toBeGreaterThan(0)
    // …et que le fichier de traduction lu est bien celui de l'app web.
    expect(lookup(readBriefingLocale('fr'), 'actions.title')).toBeTruthy()
  })

  it.each(LOCALES)('chaque clé émise par le serveur existe en %s', locale => {
    const tree = readBriefingLocale(locale)

    for (const labelKey of ALL_EMITTED_KEYS) {
      // Le web retire le préfixe de namespace avant de traduire.
      const withoutNamespace = labelKey.replace(/^briefing\./, '')
      const forms = resolveForms(tree, withoutNamespace)

      // Le nom de la clé fautive est DANS la valeur comparée : jest n'accepte
      // pas de message sur `expect`, donc sans lui un échec dirait « 0 n'est
      // pas supérieur à 0 » et il faudrait le déboguer.
      expect(`${withoutNamespace} → ${forms.length} forme(s)`).not.toBe(`${withoutNamespace} → 0 forme(s)`)
      const blank = forms.filter(form => form.value.trim().length === 0).map(form => form.suffix)
      expect({ key: withoutNamespace, blank }).toEqual({ key: withoutNamespace, blank: [] })
    }
  })

  it('aucune clé n’est émise sous le préfixe au singulier', () => {
    // Le défaut exact qu'on a corrigé : `action.` au lieu de `actions.`.
    for (const labelKey of ALL_EMITTED_KEYS) {
      expect(labelKey.startsWith('briefing.action.')).toBe(false)
    }
  })

  it('les deux langues portent les mêmes variables d’interpolation', () => {
    // Une variable présente en français et absente en anglais affiche
    // « {{counterpart}} » à l'écran — le même symptôme, une langue plus loin.
    const trees = Object.fromEntries(LOCALES.map(locale => [locale, readBriefingLocale(locale)]))

    for (const labelKey of ALL_EMITTED_KEYS) {
      const withoutNamespace = labelKey.replace(/^briefing\./, '')
      const bySuffix = LOCALES.map(locale =>
        Object.fromEntries(
          resolveForms(trees[locale]!, withoutNamespace).map(form => [
            form.suffix,
            [...form.value.matchAll(/\{\{(\w+)\}\}/g)]
              .map(match => match[1])
              .sort()
              .join(','),
          ]),
        ),
      )
      // Idem : la clé voyage DANS la valeur comparée.
      expect({ key: withoutNamespace, vars: bySuffix[0] }).toEqual({ key: withoutNamespace, vars: bySuffix[1] })
    }
  })
})
