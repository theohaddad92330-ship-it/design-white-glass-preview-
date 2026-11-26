import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PLAYBOOK_APPROVAL_EXPIRY_DAYS,
  PLAYBOOK_DAILY_CAP,
  PLAYBOOK_MAX_PER_TARGET,
  QUIET_HOURS_END,
  QUIET_HOURS_START,
} from '@bellum/contracts'
import { CLAIM_HOLDERS, SAFEGUARD_KEYS } from './holders'

/**
 * La page « Garde-fous » ne promet que ce que le dépôt tient.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une page publique qui dit « voilà ce que nous ne ferons jamais » est le
 * texte le plus facile à écrire du site et le plus coûteux à démentir : il se
 * lit avant d'acheter, il se cite en réunion, et il se périme en silence le
 * jour où quelqu'un déplace la fonction qui le tenait. C'est exactement le
 * défaut que `messages-credit-truth.test.ts` a trouvé sur les crédits — une
 * déclaration en langage naturel qu'aucune garde ne confrontait au code — et
 * le remède est le même : donner à la déclaration une garde qui LIT le code.
 *
 * Elle vérifie trois choses, et aucune n'est décorative :
 *
 *  1. Chaque garde-fou annoncé cite un `fichier:ligne` qui EXISTE et qui dit
 *     bien ce qu'on lui fait dire. Un renommage fait tomber la CI, ce qui est
 *     le seul moment où l'on peut encore corriger la page.
 *  2. La page annonce EXACTEMENT autant de garde-fous qu'elle sait prouver.
 *     Un septième inventé pour faire un compte rond serait précisément la
 *     faute que la page dénonce.
 *  3. Aucun nombre écrit sur la page ne vient d'ailleurs que du code. Le pack
 *     du 26/08 propose six chiffres de marché (« 50-70 % de désabonnement »,
 *     « −38 points de réputation en 90 jours »…) et interdit lui-même, deux
 *     pages plus loin, « un chiffre non vérifiable ». Les deux ne tiennent pas
 *     ensemble ; cette garde tranche du côté du code.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ELLE LIT LES CONSTANTES, ELLE NE LES RECOPIE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `PLAYBOOK_DAILY_CAP` et ses voisines sont IMPORTÉES. Le jour où le plafond
 * passe de vingt-cinq à cinquante, la garde exige que la page suive — un
 * nombre recopié ici serait le mensonge qu'elle prétend empêcher, avec un cran
 * de retard.
 */

/** La racine du dépôt : les porteurs vivent hors de `apps/website`. */
const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')
const MESSAGES = join(__dirname, '..', '..', '..', 'messages')
const NAMESPACE = 'safeguards.json'

/**
 * Pourquoi un porteur ne tient plus sa promesse — ou `null` s'il la tient.
 *
 * Rendre une PHRASE plutôt qu'un booléen n'est pas du confort : le jour où la
 * garde tombe, la personne qui la lit n'a pas le contexte, et « false » ne lui
 * dit pas si le fichier a bougé, si la ligne a glissé, ou si la règle a été
 * supprimée. Les trois se réparent différemment.
 */
function whyHolderFails(holder: { file: string; line: number; contains: string }): string | null {
  const path = join(REPO_ROOT, holder.file)
  if (!existsSync(path)) return `${holder.file} n'existe plus (porteur déplacé ou supprimé)`
  const lines = readFileSync(path, 'utf8').split('\n')
  const found = lines[holder.line - 1]
  if (found === undefined) return `${holder.file} n'a que ${lines.length} lignes, or on cite la ${holder.line}`
  if (!found.includes(holder.contains)) {
    return `${holder.file}:${holder.line} ne contient plus « ${holder.contains} » — lu : « ${found.trim()} »`
  }
  return null
}

/** Les langues servies par le site. Lues, jamais listées à la main. */
function locales(): string[] {
  return readdirSync(MESSAGES).filter(entry => !entry.startsWith('.'))
}

/** Toutes les chaînes du namespace d'une langue, avec leur chemin. */
function stringsOf(locale: string): Map<string, string> {
  const out = new Map<string, string>()
  const walk = (node: unknown, path: string): void => {
    if (typeof node === 'string') {
      out.set(path, node)
      return
    }
    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, `${path}[${index}]`))
      return
    }
    if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`)
    }
  }
  walk(JSON.parse(readFileSync(join(MESSAGES, locale, NAMESPACE), 'utf8')), `${locale}/${NAMESPACE}`)
  return out
}

describe('la page « Garde-fous » — chaque promesse est tenue par du code', () => {
  it('lit vraiment le dépôt — sinon la garde serait verte sur du vide', () => {
    // Sans cette assertion, un chemin cassé ferait passer tous les tests
    // suivants sur zéro porteur ouvert, et la garde ne garderait plus rien.
    expect(existsSync(join(REPO_ROOT, 'package.json'))).toBe(true)
    expect(CLAIM_HOLDERS.length).toBeGreaterThanOrEqual(SAFEGUARD_KEYS.length)
    for (const holder of CLAIM_HOLDERS) {
      const path = join(REPO_ROOT, holder.file)
      expect(existsSync(path), `${holder.file} introuvable depuis la racine du dépôt`).toBe(true)
      expect(readFileSync(path, 'utf8').split('\n').length).toBeGreaterThan(20)
    }
  })

  it('chaque garde-fou annoncé cite une ligne de code qui le tient VRAIMENT', () => {
    const broken = CLAIM_HOLDERS.map(whyHolderFails).filter((reason): reason is string => reason !== null)
    expect(
      broken,
      '\nLa page publique affirme quelque chose que le code ne tient plus.\n' +
        'Corriger le porteur dans holders.ts — ou RETIRER la promesse de la page.\n\n' +
        `${broken.join('\n')}\n`,
    ).toEqual([])
  })

  it('sait dire NON — une ligne qui a glissé, un fichier disparu', () => {
    // Preuve qu'elle mesure. Sans ce test, une garde qui ne saurait rien
    // refuser resterait verte pour toujours, et personne ne le remarquerait.
    const real = CLAIM_HOLDERS[0]
    expect(whyHolderFails(real)).toBeNull()
    expect(whyHolderFails({ ...real, line: real.line + 1 })).not.toBeNull()
    expect(whyHolderFails({ ...real, contains: 'ce texte n’est nulle part' })).not.toBeNull()
    expect(whyHolderFails({ ...real, file: 'packages/contracts/src/schemas/inexistant.ts' })).not.toBeNull()
    expect(whyHolderFails({ ...real, line: 9_999_999 })).not.toBeNull()
  })

  it('chaque garde-fou de la page a AU MOINS un porteur', () => {
    // L'inverse du test précédent : interdire le faux ne suffit pas, encore
    // faut-il que chaque promesse affichée soit rattachée à quelque chose.
    for (const key of SAFEGUARD_KEYS) {
      const held = CLAIM_HOLDERS.filter(holder => holder.claim === key)
      expect(held.length, `Le garde-fou « ${key} » n’est tenu par aucun fichier.`).toBeGreaterThan(0)
    }
  })
})

describe('la page annonce exactement ce qu’elle sait prouver', () => {
  it('affiche autant de garde-fous qu’il y en a de tenus, dans TOUTES les langues', () => {
    // Un septième garde-fou inventé pour faire le compte serait exactement la
    // faute que la page dénonce ; un sixième oublié dans une traduction fait
    // dire au site allemand autre chose qu'au site français.
    const found = locales()
    expect(found.length).toBeGreaterThanOrEqual(2)
    for (const locale of found) {
      const items = JSON.parse(readFileSync(join(MESSAGES, locale, NAMESPACE), 'utf8')) as {
        guardrails: { items: unknown[] }
      }
      expect(items.guardrails.items.length, `${locale} n’annonce pas le bon nombre de garde-fous.`).toBe(
        SAFEGUARD_KEYS.length,
      )
    }
  })
})

describe('aucun chiffre de la page ne vient d’ailleurs que du code', () => {
  /**
   * Les seuls nombres qu'une phrase de cette page a le droit de porter.
   *
   * Tous IMPORTÉS. `0` y figure pour une seule raison, écrite : les heures
   * s'écrivent « 8:00 » hors du français, et « 00 » est une minute, pas une
   * affirmation. Aucun chiffre de marché ne peut se glisser derrière lui.
   */
  const fromCode = new Set(
    [
      QUIET_HOURS_START,
      QUIET_HOURS_END,
      PLAYBOOK_DAILY_CAP,
      PLAYBOOK_MAX_PER_TARGET,
      PLAYBOOK_APPROVAL_EXPIRY_DAYS,
      SAFEGUARD_KEYS.length,
      0,
    ].map(Number),
  )

  function offenders(): string[] {
    const found: string[] = []
    for (const locale of locales()) {
      for (const [path, text] of stringsOf(locale)) {
        for (const token of text.match(/\d+/g) ?? []) {
          if (!fromCode.has(Number(token))) found.push(`${path} → « ${text.slice(0, 120)} » (${token})`)
        }
      }
    }
    return found
  }

  it('lit vraiment les libellés de la page', () => {
    for (const locale of locales()) {
      expect(stringsOf(locale).size, `${locale} : le namespace est vide.`).toBeGreaterThan(15)
    }
  })

  it('n’écrit aucun nombre que le produit ne porte pas', () => {
    expect(
      offenders(),
      '\nUn nombre écrit sur cette page doit venir d’une constante du produit.\n' +
        `Autorisés aujourd’hui : ${[...fromCode].sort((a, b) => a - b).join(', ')}.\n` +
        'Un chiffre de marché — taux de désabonnement, points de réputation — n’a rien à faire ici\n' +
        'sans une source publique, nommée et datée, que quelqu’un a ouverte.\n\n' +
        `${offenders().join('\n')}\n`,
    ).toEqual([])
  })

  it('sait dire NON — les chiffres de marché du pack sont reconnus', () => {
    // Exactement les formulations proposées, dans les quatre langues du site.
    const proposed = [
      '50 à 70 % des destinataires se désabonnent',
      '38 points de réputation perdus en 90 jours',
      'up to 70% unsubscribe within 30 days',
    ]
    for (const phrase of proposed) {
      const numbers = (phrase.match(/\d+/g) ?? []).map(Number)
      expect(
        numbers.some(value => !fromCode.has(value)),
        `Non détecté : « ${phrase} »`,
      ).toBe(true)
    }
  })
})
