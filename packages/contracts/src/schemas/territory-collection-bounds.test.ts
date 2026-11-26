import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TERRITORY_COLLECTION_LIMITS } from './territory-watch.js'

/**
 * LA BORNE DÉCLARÉE EST LA BORNE APPLIQUÉE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Un chiffre BORNÉ n'est pas un dénombrement » — l'écran Marché écrit
 * « au moins 100 » quand la collecte a atteint son plafond. Toute cette
 * honnêteté repose sur UN nombre : le plafond réel.
 *
 * Or ce plafond est posé dans le service Python, à l'appel de la source :
 *
 *     hiring_task = list_hiring_companies(department, None, since_days, 100)
 *     tenders_task = list_tender_buyers(department, since_days, 50)
 *     awards_task  = list_award_buyers(department, max(since_days, 365), 50)
 *
 * et `TERRITORY_COLLECTION_LIMITS` en est un MIROIR, côté TypeScript. Un miroir
 * que rien ne confronte à son original devient faux sans prévenir : le jour où
 * quelqu'un passe la collecte de 100 à 300, l'écran continuerait à écrire
 * « au moins 100 » sur un vrai dénombrement de 214, et — pire — refuserait la
 * tendance sur des mesures parfaitement comparables.
 *
 * ⚠️ Cette garde est la RAISON pour laquelle le miroir est acceptable. Sans
 * elle, la bonne réponse serait de faire voyager la borne dans la réponse du
 * service IA — ce qui est le vrai correctif, et reste à faire (le service IA
 * était hors périmètre du lot du 31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE PRÉTEND PAS SAVOIR
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne dit pas que la source RESPECTE sa borne — ça, c'est le travail des
 * tests Python. Elle dit que les deux moitiés du produit parlent du même nombre.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const IA = join(HERE, '..', '..', '..', '..', 'apps', 'ia', 'app', 'services')
const OVERVIEW = readFileSync(join(IA, 'territory_overview.py'), 'utf8')

/**
 * La borne de collecte d'un appel — lue sur son argument NOMMÉ `limit=`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN MOT-CLÉ ET PLUS UNE POSITION
 * ─────────────────────────────────────────────────────────────────────────────
 * Cette garde lisait le DERNIER ARGUMENT POSITIONNEL, avec un scanner qui
 * équilibrait les parenthèses (pour ne pas lire `365` dans
 * `max(since_days, 365)`). C'était déjà sa deuxième version.
 *
 * Le 04/09/2026, l'appel a gagné la maille fine du territoire —
 * `commune_code=…`, `distance_km=…`, et un commentaire au milieu de la liste
 * d'arguments. Le scanner a rendu `null`, la garde a rougi, et son diagnostic
 * était FAUX : la borne n'avait pas bougé d'un chiffre. Un lecteur pressé
 * aurait « corrigé » la constante TypeScript sur un nombre inventé.
 *
 * La leçon n'est pas « améliorer le scanner » : c'est qu'une garde ne doit pas
 * avoir à analyser du Python. La borne est donc NOMMÉE côté appel
 * (`limit=100`), et lue par son nom. Elle survit à un argument ajouté, à une
 * réécriture sur plusieurs lignes, à un commentaire au milieu, et à un
 * changement d'ordre.
 *
 * ⚠️ Pas de drapeau `g` sur cette expression : `RegExp.exec()` avec `g` est À
 * ÉTAT et rend alternativement une correspondance et `null` sur la même
 * chaîne. Le dépôt s'est déjà fait prendre.
 *
 * ⚠️ Elle reste un MIROIR. Le vrai correctif — faire voyager la borne dans la
 * réponse du service IA — n'est toujours pas fait ; cette garde est la raison
 * pour laquelle le miroir est acceptable en attendant.
 */
function collectionLimit(source: string, callee: string): number | null {
  const start = source.indexOf(`${callee}(`)
  if (start < 0) return null
  let depth = 0
  let end = -1
  for (let index = start + callee.length; index < source.length; index += 1) {
    const char = source[index]
    if (char === '(') depth += 1
    else if (char === ')') {
      depth -= 1
      if (depth === 0) {
        end = index
        break
      }
    }
  }
  if (end < 0) return null
  const inside = source.slice(start + callee.length + 1, end)
  const match = /\blimit\s*=\s*(\d[\d_]*)/.exec(inside)
  return match ? Number((match[1] as string).replace(/_/g, '')) : null
}

function namedConstant(source: string, name: string): number | null {
  const match = new RegExp(`^${name}\\s*=\\s*([\\d_]+)`, 'm').exec(source)
  return match ? Number((match[1] as string).replace(/_/g, '')) : null
}

describe('la borne déclarée dans les contrats est la borne appliquée à la collecte', () => {
  it('LIT quelque chose — un fichier vide passerait au vert pour toujours', () => {
    // Sans ces assertions, un renommage de fichier ou un motif cassé rendrait
    // tous les tests ci-dessous verts en ne comparant plus rien.
    expect(OVERVIEW.length).toBeGreaterThan(2000)
    expect(OVERVIEW).toContain('list_hiring_companies')
    expect(OVERVIEW).toContain('REGISTRY_COUNT_CEILING')
    expect(Object.keys(TERRITORY_COLLECTION_LIMITS)).toHaveLength(4)
  })

  it('les offres sont bornées au nombre que le contrat annonce', () => {
    expect(collectionLimit(OVERVIEW, 'list_hiring_companies')).toBe(TERRITORY_COLLECTION_LIMITS.offers)
  })

  it('les appels d’offres ouverts aussi', () => {
    expect(collectionLimit(OVERVIEW, 'list_tender_buyers')).toBe(TERRITORY_COLLECTION_LIMITS.openTenders)
  })

  it('les marchés attribués aussi', () => {
    expect(collectionLimit(OVERVIEW, 'list_award_buyers')).toBe(TERRITORY_COLLECTION_LIMITS.awardedContracts)
  })

  it('le plafond que le registre pose sur son propre compte aussi', () => {
    expect(namedConstant(OVERVIEW, 'REGISTRY_COUNT_CEILING')).toBe(TERRITORY_COLLECTION_LIMITS.esnPresent)
  })

  it('elle ignore les arguments NOMMÉS — ils ne sont pas positionnels', () => {
    // Le cas qui l'a fait rougir le 04/09/2026 : la maille fine du territoire a
    // ajouté `commune_code=` et `distance_km=` après la borne. La garde lisait
    // le dernier argument, pas le dernier POSITIONNEL, et annonçait une
    // divergence qui n'existait pas.
    expect(OVERVIEW).toContain('commune_code=scope.commune_code')
    expect(collectionLimit(OVERVIEW, 'list_hiring_companies')).toBe(100)
  })

  it('elle lit un argument imbriqué sans se tromper de nombre', () => {
    // Le cas qui a fait tomber sa première version : `max(since_days, 365)`
    // dans la liste d'arguments. Un extracteur naïf y lit « 365 » et annonce
    // une divergence qui n'existe pas.
    expect(OVERVIEW).toContain('max(since_days, 365)')
    expect(collectionLimit(OVERVIEW, 'list_award_buyers')).not.toBe(365)
  })

  it('elle sait dire NON — une borne changée d’un seul côté est refusée', () => {
    // La preuve qu'elle mord : le même extracteur, sur une source où la limite
    // a bougé. Sans cette assertion, on ne saurait pas distinguer « les bornes
    // concordent » de « l'extracteur ne trouve jamais rien ».
    const doctored = OVERVIEW.replace('limit=100', 'limit=300')
    expect(doctored, 'la source de la preuve a changé de forme — la garde ne prouve plus rien').not.toBe(OVERVIEW)
    expect(collectionLimit(doctored, 'list_hiring_companies')).toBe(300)
    expect(collectionLimit(doctored, 'list_hiring_companies')).not.toBe(TERRITORY_COLLECTION_LIMITS.offers)
  })
})
