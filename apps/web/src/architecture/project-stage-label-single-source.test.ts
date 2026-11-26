import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PROJECT_STAGES } from '@bellum/contracts'

/**
 * #2320.30 (épopée #2967) — « Deux pages n'affichent jamais des états
 * différents pour un dossier ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Mesuré le 25/09/2026 : le LIBELLÉ d'une étape d'opportunité est déjà
 * dérivé d'UNE seule façon partout où il s'affiche — la clé i18n
 * `stage.states.<étape>` (`ProjectsTable`, `ProjectStageControl`,
 * `ProjectsPage`, `StageMovePanel`, `PendingActions`, `PipelineValueCard`,
 * `timelineEvent`, `TabProjects` : huit appelants, une seule forme). Rien ne
 * gardait ce fait — un futur écran aurait pu introduire un second dictionnaire
 * de libellés sans que rien ne le remarque, exactement le défaut que GA-26
 * (« un réglage vit à un seul endroit ») nomme.
 *
 * Deux vérifications :
 *  1. Les clés `stage.states.*` (FR et EN) couvrent EXACTEMENT `PROJECT_STAGES`
 *     — ni de moins (une étape sans traduction retombe sur sa clé brute dans
 *     une langue et un libellé dans l'autre : DEUX pages divergeraient), ni de
 *     plus (une clé morte que personne ne peut plus faire échouer).
 *  2. Aucun fichier de PRODUCTION, hors les JSON de locale eux-mêmes, ne porte
 *     un dictionnaire dupliqué — un objet dont les clés sont EXACTEMENT les
 *     neuf étapes, avec des valeurs qui RESSEMBLENT à un libellé humain
 *     (accentué), pas à un jeton technique (`primary`, `success`…) : c'est la
 *     signature d'une SECONDE table de libellés, jamais d'une carte de
 *     variantes ou de priorités, qui existent légitimement à côté.
 *
 * Cette garde ne couvre que l'étape d'OPPORTUNITÉ (`PROJECT_STAGES`) — la
 * plus visible des quatre objets de la chaîne. Besoin/positionnement/mission
 * n'ont pas (encore) cette garde : chacun a son propre espace de statuts,
 * plus jeune, avec moins d'appelants à ce jour.
 */

const WEB_SRC = join(__dirname, '..')
const LOCALES_DIR = join(WEB_SRC, 'i18n', 'locales')

function readStageStates(locale: 'fr' | 'en'): Record<string, string> {
  const json = JSON.parse(readFileSync(join(LOCALES_DIR, locale, 'projects.json'), 'utf8')) as {
    stage: { states: Record<string, string> }
  }
  return json.stage.states
}

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'locales') continue
      walk(full, files)
      continue
    }
    if ((entry.endsWith('.ts') || entry.endsWith('.tsx')) && !entry.includes('.test.') && !entry.endsWith('.d.ts')) {
      files.push(full)
    }
  }
  return files
}

/** Une valeur qui RESSEMBLE à un libellé humain FR/EN — pas un jeton
 *  technique. Les jetons du dépôt (`primary`, `warning`, `default`…) sont
 *  courts et sans accent ; un libellé porte un espace ou une majuscule suivie
 *  de minuscules, souvent accentué. */
function looksLikeHumanLabel(value: string): boolean {
  return /[ÀÂÄÉÈÊËÎÏÔÖÙÛÜàâäéèêëîïôöùûü ]/.test(value) && value.length >= 4
}

describe("#2320.30 — le libellé d'étape d'opportunité vit à UN seul endroit", () => {
  it('lit un corpus réel', () => {
    expect(walk(WEB_SRC).length).toBeGreaterThan(500)
  })

  it('les neuf étapes ont TOUTES leur traduction FR — ni de moins, ni de plus', () => {
    expect(Object.keys(readStageStates('fr')).sort()).toEqual([...PROJECT_STAGES].sort())
  })

  it('les neuf étapes ont TOUTES leur traduction EN — ni de moins, ni de plus', () => {
    expect(Object.keys(readStageStates('en')).sort()).toEqual([...PROJECT_STAGES].sort())
  })

  it('au moins cinq appelants LISENT le libellé par la même forme (`stage.states.`)', () => {
    const callers = walk(WEB_SRC).filter(file => readFileSync(file, 'utf8').includes('stage.states.'))
    expect(callers.length).toBeGreaterThanOrEqual(5)
  })

  it('aucun fichier de production ne porte un SECOND dictionnaire de libellés d’étape', () => {
    const offenders: string[] = []
    for (const file of walk(WEB_SRC)) {
      const source = readFileSync(file, 'utf8')
      if (!source.includes('detected') || !source.includes('dormant')) continue
      // Toutes les étapes apparaissent-elles comme des CLÉS d'objet (motif
      // `<étape>:` ou `<étape> =`), avec au moins une valeur d'apparence
      // humaine juste après ? Un simple `switch (stage) { case 'detected': }`
      // dont les branches ne rendent PAS de texte français/anglais ne compte
      // pas — ce sont les cartes de variantes/priorités déjà présentes
      // (`project-index.ts`, `stale-alert.ts`), légitimes et hors sujet.
      const allStagesAsKeys = PROJECT_STAGES.every(stage => new RegExp(`['"\`]?${stage}['"\`]?\\s*:`).test(source))
      if (!allStagesAsKeys) continue
      const humanLabelValues = [...source.matchAll(/:\s*['"`]([^'"`]+)['"`]/g)]
        .map(match => match[1] ?? '')
        .filter(looksLikeHumanLabel)
      if (humanLabelValues.length >= 3) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })
})
