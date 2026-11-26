import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-338 — un champ DÉCLARATIF n'entre jamais dans un chemin de NOTATION.
 *
 * Deux issues, la MÊME faute : prendre une déclaration pour une mesure.
 *
 * #2032.15 — un PARCOURS (`user_role` / son miroir `sellerRole`) adapte la
 * FORME du conseil (vocabulaire, niveau d'explication — voir
 * `app/prompts/laura_role_and_voice.py`, qui le lit très légitimement pour
 * choisir un FOCUS de conversation, jamais un score). Il ne doit JAMAIS
 * devenir un poids dans un calcul qui note un compte ou une personne :
 * personne ne doit pouvoir déduire qu'un profil technique « ne sait pas
 * vendre » (ni l'inverse) d'un chiffre.
 *
 * #2036.10 — une zone SOUHAITÉE (`growth_target_zones`, #2036.9 : « je
 * souhaite développer ») ne doit JAMAIS être lue comme une CAPACITÉ AVÉRÉE
 * (`geo_zones`, « je peux intervenir / j'ai déjà des relations »,
 * `apps/api/src/modules/partner-pipeline/profile-geo-zones.ts`). Les deux
 * champs restent des colonnes SÉPARÉES (#2036.9) précisément pour que ce
 * second interdit soit vérifiable : fusionner les deux listes referait, un
 * cran plus haut, la faute de GA-259 (« un taux de couverture mesure ce
 * qu'on SAIT, jamais ce que le marché FAIT ») — ici, une zone déclarée
 * mesure ce que l'utilisateur DIT, jamais ce qu'il FAIT.
 *
 * PÉRIMÈTRE, NOMMÉ — une garde qui interdit trop est désarmée en une semaine :
 * `sellerRole` reste légitime dans `bellum_advisor.py` / `bellum_plan.py`
 * (le TON, jamais un score) et `laura_role_and_voice.py` (le FOCUS de
 * conversation par famille de rôle) : aucun des deux n'est un moteur de
 * notation, et ils sont volontairement HORS de `NOTATION_CORES`.
 */

const REPO_ROOT = join(__dirname, '../../../..')

/** #2032.15 — le PARCOURS ne pèse jamais dans un calcul de score. */
const CAREER_PATH_FIELDS = ['user_role', 'sellerRole']

/**
 * Les fichiers Python qui CALCULENT un score ou un rang — compte (fit /25,
 * bandes GO/PRUDENT/STOP), prospect (Découvrir), périmètre, contact. Choisis
 * PARCE QU'ILS NE LISENT AUJOURD'HUI NI L'UN NI L'AUTRE CHAMP (vérifié avant
 * d'écrire cette garde) : elle verrouille un état sain AVANT l'incident,
 * comme `protected_criteria.py` le fait pour les critères protégés.
 */
const NOTATION_CORES = [
  'apps/ia/app/services/account_score.py',
  'apps/ia/app/services/account_score_axes.py',
  'apps/ia/app/services/score_axes.py',
  'apps/ia/app/services/discover_scoring.py',
  'apps/ia/app/services/perimeter_score.py',
  'apps/ia/app/services/esn_fit.py',
  'apps/ia/app/services/contact_ranking.py',
]

/** #2036.10 — une zone SOUHAITÉE ne pèse jamais comme une capacité avérée. */
const TERRITORY_INTENT_FIELDS = ['growth_target_zones', 'growthTargetZones']

/**
 * Les fichiers qui traduisent `geo_zones` (capacité avérée) en un territoire
 * exploitable pour le matching partenaires — le seul chemin, aujourd'hui, où
 * une zone déclarée devient un critère de sélection.
 */
const CAPACITY_CORES = [
  'apps/api/src/modules/partner-pipeline/profile-geo-zones.ts',
  'apps/api/src/modules/partner-pipeline/partner-pipeline.service.ts',
]

function readCore(relative: string): string {
  return readFileSync(join(REPO_ROOT, relative), 'utf8')
}

function fieldsFound(source: string, fields: readonly string[]): string[] {
  return fields.filter(field => new RegExp(`\\b${field}\\b`).test(source))
}

describe('GA-338 — un champ déclaratif ne franchit aucun chemin de notation', () => {
  it('le corpus des moteurs de notation (parcours) n’est pas vide', () => {
    expect(NOTATION_CORES.length).toBeGreaterThan(0)
  })

  it('le corpus des moteurs de capacité territoriale n’est pas vide', () => {
    expect(CAPACITY_CORES.length).toBeGreaterThan(0)
  })

  it('les moteurs déclarés existent tous sur le disque', () => {
    const missing = [...NOTATION_CORES, ...CAPACITY_CORES].filter(relative => {
      try {
        return !statSync(join(REPO_ROOT, relative)).isFile()
      } catch {
        return true
      }
    })
    expect(missing).toEqual([])
  })

  it.each(NOTATION_CORES)('%s ne lit ni `user_role` ni `sellerRole` (#2032.15)', relative => {
    const found = fieldsFound(readCore(relative), CAREER_PATH_FIELDS)
    // Si ce test tombe : un PARCOURS vient de peser dans un calcul de score —
    // c'est exactement l'interdit de #2032.15. Retire-le du calcul.
    expect(found).toEqual([])
  })

  it.each(CAPACITY_CORES)('%s ne lit jamais `growth_target_zones` (#2036.10)', relative => {
    const found = fieldsFound(readCore(relative), TERRITORY_INTENT_FIELDS)
    // Si ce test tombe : une zone SOUHAITÉE vient d'être lue comme une
    // capacité avérée — c'est exactement l'interdit de #2036.10.
    expect(found).toEqual([])
  })

  it('n’attrape pas ce qu’elle ne vise pas : `geo_zones` (capacité avérée) reste lisible dans les moteurs de capacité', () => {
    // Témoin de cas légitime voisin : la garde n'interdit pas `geo_zones`
    // lui-même — c'est la CAPACITÉ, légitimement lue ici. Seule la zone
    // SOUHAITÉE (`growth_target_zones`) est bannie.
    for (const relative of CAPACITY_CORES) {
      expect(readCore(relative)).toMatch(/\bgeo_zones\b|\bgeoZones\b|\bGEO_ZONE_DEPARTMENT\b/)
    }
  })

  it('n’attrape pas ce qu’elle ne vise pas : les axes de score déclarés restent lisibles', () => {
    // Témoin de cas légitime voisin : `account_score.py` porte des mots comme
    // « accessibilite » (géo) sans que la garde ne rougisse — elle ne bannit
    // que les DEUX champs nommés, pas tout vocabulaire voisin.
    expect(readCore('apps/ia/app/services/account_score.py')).toMatch(/accessibilit/)
  })

  it('sait dire NON : `user_role` injecté dans un moteur de notation fait rougir la vérification (#2032.15)', () => {
    const source = readCore('apps/ia/app/services/account_score.py')
    const contaminated = `${source}\n# payload["user_role"] pèserait ici`
    expect(fieldsFound(contaminated, CAREER_PATH_FIELDS)).toEqual(['user_role'])
  })

  it('sait dire NON : `growth_target_zones` injecté dans un moteur de capacité fait rougir la vérification (#2036.10)', () => {
    const source = readCore('apps/api/src/modules/partner-pipeline/partner-pipeline.service.ts')
    const contaminated = `${source}\n// const zones = answers.growth_target_zones`
    expect(fieldsFound(contaminated, TERRITORY_INTENT_FIELDS)).toEqual(['growth_target_zones'])
  })
})
