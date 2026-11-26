/**
 * GA-74 (volet web) — la mention d'un objet métier a UNE forme, et elle est RENDUE.
 *
 * ⚠️ Le dépôt est monté à GA-67 le 29/08/2026, et plusieurs agents écrivaient en
 * parallèle ce jour-là : une collision de numéro reste possible et se règle par
 * un renommage. Le volet registre de GA-74 vit dans
 * `packages/contracts/src/schemas/object-forms.test.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE, ET CE QU'ELLE NE PRÉTEND PAS LIRE
 * ─────────────────────────────────────────────────────────────────────────
 * `placement-laws.test.ts` explique pourquoi la loi 3 du tome 7 (« sept
 * formes ») n'est pas gardée : reconnaître un objet métier dans du JSX
 * demanderait de deviner, et une garde qui devine passe au vert sur du faux.
 * Cette garde-ci ne le tente pas. Elle vérifie la seule chose qui se lise sans
 * interprétation : que la primitive de mention **a des appelants**.
 *
 * C'est le défaut n°1 du dépôt, appliqué à sa propre réparation. Une primitive
 * `ObjectMention` écrite, testée, documentée et appelée par personne serait
 * exactement le motif que `chantiers-livres.md` retrouve dans les trente
 * chantiers : « du code juste, calculé, testé, que personne n'appelle ».
 * Mesuré le 29/08/2026 avant ce lot : quinze mentions de compte à la main dans
 * quatorze fichiers, zéro composant partagé.
 *
 * ⚠️ Elle n'interdit PAS les `<Link to="/accounts/$id">` restants, et c'est
 * délibéré : sur les quinze mesurés, plusieurs ne sont pas des mentions — ils
 * enveloppent une carte entière ou une ligne cliquable de bout en bout, dont
 * l'action n'est pas « ouvrir cet objet » mais « reprendre ce travail ». Les
 * interdire d'un coup de expression régulière ferait tomber la CI sur du code
 * juste, et la garde serait désactivée dans la semaine. Ce qui est gardé, c'est
 * qu'il n'existe qu'UNE primitive de mention et qu'elle est vivante.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const WEB_SRC = join(__dirname, '..')
const PRIMITIVE = join(WEB_SRC, 'components', 'primitives', 'ObjectMention.tsx')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry)) continue
    if (entry === 'routeTree.gen.ts') continue
    out.push(full)
  }
  return out
}

/**
 * Retire les commentaires de bloc, y compris ceux d'un `{...}` JSX.
 *
 * Une garde qui lit le JSX doit lire le JSX, pas la prose qui l'explique. Ce
 * dépôt commente abondamment, et il commente en CITANT du code : le docblock
 * qui explique pourquoi une mention n'est pas un `<Text>` contient le mot
 * `<Text>`. Les commentaires de LIGNE ne sont pas retirés — `//` apparaît dans
 * les URL, et les retirer casserait plus qu'il ne répare.
 */
function stripBlockComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '')
}

const FILES = sourceFiles(WEB_SRC)
/** Les fichiers de PRODUCTION — un test qui rend la primitive n'est pas un écran. */
const PRODUCTION = FILES.filter(file => !/\.(test|spec)\.tsx?$/.test(file))

describe('GA-74 — la garde lit un corpus, et il n’est pas vide', () => {
  it('parcourt tout `apps/web/src`', () => {
    // Une garde qui liste zéro fichier passe au vert quoi qu'il arrive. Six
    // gardes borgnes en deux jours : celle-ci prouve d'abord qu'elle voit.
    expect(FILES.length).toBeGreaterThan(500)
    expect(PRODUCTION.length).toBeGreaterThan(400)
  })

  it('voit bien la primitive qu’elle surveille', () => {
    expect(FILES).toContain(PRIMITIVE)
    expect(readFileSync(PRIMITIVE, 'utf8')).toContain('export function ObjectMention')
  })
})

/**
 * Un fichier qui rend VRAIMENT `<ObjectMention>`.
 *
 * ⚠️ La première version testait `source.includes('<ObjectMention')`, et elle
 * était borgne : `<ObjectMentionAutreChose` contient cette chaîne. Le contrôle
 * négatif l'a montré — renommer la balise d'un appelant laissait la garde
 * VERTE, donc elle n'aurait jamais vu la primitive redevenir orpheline. La fin
 * de nom se vérifie, sans quoi on garde un préfixe et pas un composant.
 */
function rendersMention(source: string): boolean {
  return /<ObjectMention[\s/>]/.test(source)
}

describe('GA-74 — la mention est RENDUE, pas seulement écrite', () => {
  const callers = PRODUCTION.filter(file => file !== PRIMITIVE && rendersMention(readFileSync(file, 'utf8')))

  it('au moins trois écrans de production la rendent', () => {
    // Trois, parce qu'un seul appelant se supprime sans qu'on y pense et que
    // deux peuvent appartenir au même écran. En dessous, la primitive n'a plus
    // de raison d'être partagée et redevient un composant local.
    expect(callers.length).toBeGreaterThanOrEqual(3)
  })

  it('ces appelants viennent de FEATURES différentes — sinon elle n’est pas partagée', () => {
    const features = new Set(
      callers.map(file => {
        const rel = relative(WEB_SRC, file)
        const parts = rel.split(/[\\/]/)
        return parts[0] === 'features' ? `features/${parts[1]}` : parts[0]
      }),
    )
    expect(features.size).toBeGreaterThanOrEqual(2)
  })

  it('la garde sait dire NON — un composant jamais rendu ne passerait pas', () => {
    // Le contrôle négatif, sur la même mécanique exactement : un nom de balise
    // qui n'existe nulle part doit donner zéro appelant. Si ce test échoue,
    // c'est la LECTURE qui est cassée, pas le code surveillé.
    const ghosts = PRODUCTION.filter(file => /<ObjectMentionQuiNExistePas[\s/>]/.test(readFileSync(file, 'utf8')))
    expect(ghosts).toEqual([])
  })

  it('ne compte PAS un composant dont le nom commence pareil', () => {
    // La faute exacte de la première version, figée : `<ObjectMentionRetiree`
    // contient `<ObjectMention`. Sans la fin de nom, renommer une balise
    // laissait la garde verte — elle surveillait un préfixe, pas un composant.
    expect(rendersMention('<ObjectMentionRetiree kind="account" />')).toBe(false)
    expect(rendersMention('<ObjectMention kind="account" />')).toBe(true)
    expect(rendersMention('<ObjectMention\n  kind="account"\n/>')).toBe(true)
  })
})

describe('GA-74 — une seule primitive de mention', () => {
  it('aucun autre composant ne s’appelle « …Mention »', () => {
    // La forme F1 est minuscule, donc facile à re-écrire : c'est précisément ce
    // qui a produit quinze variantes. Un deuxième composant de mention rouvrira
    // la divergence, cette fois avec deux noms légitimes.
    const rivals: string[] = []
    for (const file of PRODUCTION) {
      if (file === PRIMITIVE) continue
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/export (?:default )?function (\w*Mention)\b/g)) {
        rivals.push(`${relative(WEB_SRC, file)} → ${match[1]}`)
      }
    }
    expect(rivals).toEqual([])
  })

  it('la primitive ne rend pas un `<p>` — une mention se pose DANS une phrase', () => {
    // `Text` rend un `<p>` par défaut. Un `<p>` dans un `<p>` est réparé par le
    // navigateur en coupant le paragraphe : la mention saute à la ligne, et
    // personne ne comprend pourquoi. Elle hériterait en plus de la borne de
    // lecture à 70 caractères (D81), qui n'a aucun sens sur un nom propre.
    //
    // ⚠️ La première version de ce test lisait les COMMENTAIRES : le docblock de
    // la primitive cite « de simples `<Text>` non cliquables » pour expliquer
    // le défaut mesuré, et la garde comptait cette phrase comme une balise. Elle
    // était donc rouge sur du code juste — l'inverse de la garde borgne, mais la
    // même cause : un extracteur qui ne sait pas ce qu'il lit.
    const stripped = stripBlockComments(readFileSync(PRIMITIVE, 'utf8'))
    const texts = [...stripped.matchAll(/<Text\b[^>]*/g)].map(match => match[0])
    expect(texts.length).toBeGreaterThan(0)
    for (const tag of texts) expect(tag).toContain('element="span"')
  })

  it('le retrait des commentaires FAIT quelque chose — sinon il masque le défaut qu’il corrige', () => {
    // Un `stripBlockComments` qui ne retirerait rien rendrait le test précédent
    // vert pour la mauvaise raison le jour où il redeviendrait faux.
    const source = readFileSync(PRIMITIVE, 'utf8')
    expect(source).toContain('<Text>')
    expect(stripBlockComments(source)).not.toContain('<Text>')
  })
})
