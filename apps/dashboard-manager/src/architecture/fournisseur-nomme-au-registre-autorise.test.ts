import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { OUR_SUPPLIERS } from '@bellum/contracts'
import { PROVIDER_LABEL } from '../lib/enrichment-coverage'

/**
 * GA-341 — un fournisseur de la cascade d'enrichissement ne se nomme QUE dans
 * le registre de libellés `PROVIDER_LABEL` (`lib/enrichment-coverage.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LÉGITIME, ET C'EST ÉCRIT ICI POUR NE PLUS ÊTRE IMPLICITE
 * ─────────────────────────────────────────────────────────────────────────────
 * Doctrine c19_vocabulaire / GA-44 : « NOS fournisseurs ne se nomment JAMAIS —
 * ni à l'écran, ni dans un prompt, ni sur le site ». Le back-office est
 * l'exception voulue : c'est l'écran de l'OPÉRATEUR, pas celui du client, et
 * l'opérateur a besoin de savoir QUELLE cascade a répondu (Apollo, puis
 * SalesQL, Dropcontact, Hunter.io, Lusha, Kaspr, FullEnrich — voir le
 * commentaire d'`enrichment-panel.tsx`). Cette garde ne retire donc AUCUN
 * libellé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Rien ne distinguait le légitime de l'accidentel : un nom de fournisseur
 * ajouté demain dans un composant qui alimente un export, un e-mail ou une
 * capture destinée au CLIENT serait passé sans un rouge — exactement le défaut
 * que GA-340 a nommé pour le détecteur partagé, un cran plus haut. Cette garde
 * fait deux choses :
 *  1. lie les CLÉS de `PROVIDER_LABEL` au contrat — un fournisseur retiré
 *     d'`OUR_SUPPLIERS`, ou une clé inventée qui n'y correspond pas, la fait
 *     rougir ;
 *  2. sait dire qu'un DEUXIÈME registre « id fournisseur → libellé » pour l'un
 *     des SEPT fournisseurs de la cascade, écrit ailleurs dans le back-office,
 *     est le même défaut qu'un doublon de `PROVIDER_LABEL`.
 *
 * ⚠️ CE QU'ELLE NE FAIT PAS : elle ne cherche pas la simple MENTION du mot
 * « Apollo » dans une phrase (`cockpit-panel.tsx` en a plusieurs, dans des
 * tableaux de coût — légitimes, déjà là). Une garde qui ferait ça attraperait
 * aussi la comparaison `row.provider === 'apollo'`, qui est un IDENTIFIANT
 * technique en minuscules, pas un libellé montré à quelqu'un — c'est le motif
 * exact de GA-340 pour le détecteur : la casse porte l'information utile ici,
 * l'appliquer en aveugle (comme `supplierNamesIn`, volontairement insensible à
 * la casse pour du texte AFFICHÉ) sur du code source ferait rougir la moitié du
 * back-office. Elle cherche la FORME d'un registre : une clé (l'identifiant)
 * suivie de deux-points et de la valeur EXACTE du libellé canonique.
 *
 * ⚠️ TROUVÉ EN ÉCRIVANT CETTE GARDE, LE 16/09/2026, NON CORRIGÉ ICI —
 * `cockpit-panel.tsx` porte SON PROPRE registre, `PROVIDER_LABELS` (pluriel),
 * pour le tableau de coût/alerte : il couvre aussi des fournisseurs de
 * COLLECTE et de MODÈLE (Firecrawl, Pappers, Brave, Anthropic) hors du
 * périmètre de la cascade d'enrichissement que sert `PROVIDER_LABEL`, et y
 * répète `apollo: 'Apollo'`. Fusionner les deux registres changerait le
 * comportement du tableau de coût — hors périmètre de ce lot. Il est nommé
 * comme SECONDE exception, écrite, pour qu'un TROISIÈME registre ne s'ajoute
 * pas sans qu'on le voie.
 */

const SRC = fileURLToPath(new URL('../', import.meta.url))
const REGISTRE_AUTORISE = 'lib/enrichment-coverage.ts'

/** La seconde exception nommée — voir le paragraphe ci-dessus. */
const AUTRES_REGISTRES_CONNUS: Readonly<Record<string, string>> = {
  'app/monitoring/_components/cockpit-panel.tsx':
    "PROVIDER_LABELS (pluriel) du tableau de coût/alerte : couvre AUSSI des fournisseurs de collecte et de modèle, hors du périmètre de la cascade d'enrichissement. Trouvé le 16/09/2026 (GA-341), pas fusionné — changement de comportement hors périmètre de ce lot.",
}

/** Les SEPT fournisseurs de la cascade d'enrichissement — ceux que sert `PROVIDER_LABEL`. */
const ENRICHMENT_SUPPLIERS: ReadonlyArray<{ provider: string; name: string }> = OUR_SUPPLIERS.filter(
  (s): s is typeof s & { provider: string } => s.kind === 'enrichment' && s.provider !== null,
)

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * La FORME d'un registre id→libellé pour l'un des sept fournisseurs : une clé
 * (l'identifiant, entre guillemets ou non) suivie de `:` et de la valeur EXACTE
 * du libellé canonique, entre guillemets. Extrait en fonction pour que le
 * témoin fabriqué plus bas passe par EXACTEMENT le même chemin que le
 * balayage réel — pas une seconde implémentation qui pourrait diverger.
 */
export function secondRegistryEntriesIn(source: string): string[] {
  const found: string[] = []
  for (const { provider, name } of ENRICHMENT_SUPPLIERS) {
    const pattern = new RegExp(
      `['"\`]?\\b${escapeRegExp(provider)}\\b['"\`]?\\s*:\\s*['"\`]${escapeRegExp(name)}['"\`]`,
    )
    if (pattern.test(source)) found.push(`${provider} → ${name}`)
  }
  return found
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const chemin = join(dir, entry)
    if (statSync(chemin).isDirectory()) sourceFiles(chemin, out)
    else if (/\.tsx?$/.test(entry) && !entry.includes('.test.')) out.push(chemin)
  }
  return out
}

describe('GA-341 — un fournisseur de la cascade d’enrichissement ne se nomme qu’au registre autorisé', () => {
  it('LIT quelque chose — le contrat, le registre et le corpus du back-office ont un contenu réel', () => {
    expect(ENRICHMENT_SUPPLIERS.length).toBeGreaterThanOrEqual(5)
    expect(Object.keys(PROVIDER_LABEL).length).toBeGreaterThanOrEqual(5)
    expect(sourceFiles(SRC).length).toBeGreaterThan(30)
  })

  it('les clés de PROVIDER_LABEL sont EXACTEMENT les fournisseurs d’enrichissement du contrat', () => {
    // Une clé inventée, ou un fournisseur retiré d'OUR_SUPPLIERS pendant que
    // PROVIDER_LABEL le garde encore, casse cette égalité d'ensembles.
    const attendu = ENRICHMENT_SUPPLIERS.map(s => s.provider).sort()
    expect(Object.keys(PROVIDER_LABEL).sort()).toEqual(attendu)
  })

  it('sait dire NON — un second registre id → libellé pour un fournisseur de la cascade est vu', () => {
    expect(secondRegistryEntriesIn(`const X: Record<string, string> = { dropcontact: 'Dropcontact' }`)).toEqual([
      'dropcontact → Dropcontact',
    ])
    expect(secondRegistryEntriesIn(`hunter: "Hunter.io",`)).toEqual(['hunter → Hunter.io'])
  })

  it('n’attrape pas ce qu’elle ne vise pas — mention inline, identifiant technique, outil du client', () => {
    // Une mention isolée dans un tableau de coût — pas une PAIRE clé→libellé.
    expect(secondRegistryEntriesIn(`<td>Résultats Apollo</td>`)).toEqual([])
    // L'identifiant technique en minuscules, comparé, pas affiché.
    expect(secondRegistryEntriesIn(`row.provider === 'apollo' ? 'par défaut' : 'repli'`)).toEqual([])
    // Le mot ordinaire voisin d'un fournisseur `ordinaryWord` (#1912) : la
    // valeur n'est pas le libellé CANONIQUE, donc pas de correspondance.
    expect(secondRegistryEntriesIn(`hunter: "Solo hunter, l'archétype ESN"`)).toEqual([])
    // L'outil que le CLIENT branche se nomme légitimement partout — il n'est
    // pas dans ENRICHMENT_SUPPLIERS, donc jamais cherché.
    expect(secondRegistryEntriesIn(`{ hubspot: 'HubSpot', gmail: 'Gmail' }`)).toEqual([])
  })

  it('aucun registre id → libellé non déclaré ne duplique la cascade d’enrichissement', () => {
    const fautifs: string[] = []
    for (const chemin of sourceFiles(SRC)) {
      const rel = relative(SRC, chemin)
      if (rel === REGISTRE_AUTORISE || AUTRES_REGISTRES_CONNUS[rel] !== undefined) continue
      const hits = secondRegistryEntriesIn(readFileSync(chemin, 'utf8'))
      fautifs.push(...hits.map(hit => `${rel} — ${hit}`))
    }

    expect(
      fautifs,
      [
        'Un fournisseur de la cascade d’enrichissement est nommé hors de PROVIDER_LABEL',
        '(lib/enrichment-coverage.ts) et hors des exceptions nommées (GA-341).',
        '',
        ...fautifs,
      ].join('\n'),
    ).toEqual([])
  })

  it('les exceptions nommées existent encore et portent une raison écrite', () => {
    // Le prix d'entrée d'une exception : un chemin qui a disparu, ou une
    // raison vide, ne protège plus rien — GA-38 pour l'esprit, appliqué ici.
    for (const [chemin, raison] of Object.entries(AUTRES_REGISTRES_CONNUS)) {
      expect(statSync(join(SRC, chemin)).isFile()).toBe(true)
      expect(raison.length).toBeGreaterThan(40)
    }
  })
})
