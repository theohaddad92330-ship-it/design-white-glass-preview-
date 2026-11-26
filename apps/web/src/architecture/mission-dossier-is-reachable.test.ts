import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-82 — LE DOSSIER D'UNE MISSION S'ATTEINT EN CLIQUANT, PAS EN LE TAPANT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUE CETTE GARDE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une adresse qui n'est reliée à aucun clic n'est pas livrée. `/actions/sequences`
 * est resté orphelin des mois — écran écrit, route déclarée, tests verts, et
 * personne pour le trouver ; c'est Louis qui l'a découvert en cherchant autre
 * chose. Le mode d'échec est silencieux par construction : rien ne casse.
 *
 * La règle est donc : la route `/missions/$id` EXISTE dans l'arbre, et au
 * moins un écran y mène par un lien. Cette garde ne dit pas COMBIEN de portes il
 * faut — elle refuse le zéro.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE PEUT PAS VÉRIFIER, ET POURQUOI ELLE NE FAIT PAS SEMBLANT
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne sait pas si le lien est VISIBLE (derrière un onglet, un menu, un droit
 * de plan). Une garde qui prétendrait le savoir accuserait du code correct, et
 * « une garde qui crie sur du comportement correct se désactive dans la
 * semaine ». Ce qu'elle sait dire est exact : il y a une porte, ou il n'y en a
 * pas.
 *
 * ⚠️ Les COMMENTAIRES sont retirés du corpus : ce fichier-ci et les docblocks
 * des écrans citent l'adresse en toutes lettres. Une garde qui compte une
 * citation compte un lien qui n'existe pas — c'est la garde borgne, retournée.
 */

const SRC = join(__dirname, '..')
const ROUTE_TREE = join(SRC, 'routeTree.gen.ts')
const ROUTE_FILE = join(SRC, 'routes', 'missions', '$id.tsx')

/** L'adresse du dossier, écrite UNE fois : la recopier ici la ferait dériver. */
const DOSSIER_PATH = '/missions/$id'

/**
 * Les fichiers d'écran — donc PAS les routes elles-mêmes.
 *
 * Une route qui se cite elle-même (`createFileRoute('/missions/$id')`)
 * n'est pas une porte : c'est la déclaration de la serrure. Les compter
 * rendrait cette garde verte sur un écran que personne n'atteint, ce qu'elle
 * existe précisément pour refuser.
 */
function screenFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'routes') continue
      out.push(...screenFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry)) continue
    if (/\.(test|spec)\.tsx?$/.test(entry)) continue
    if (entry === 'routeTree.gen.ts') continue
    out.push(full)
  }
  return out
}

/** ⚠️ Un commentaire cite ; il ne clique pas. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function relative(file: string): string {
  return file.slice(file.indexOf('/src/') + 5)
}

/**
 * Les écrans qui portent une porte vers le dossier.
 *
 * TROIS formes, et il faut les trois : un `<Link to="…">`, un
 * `navigate({ to: '…' })`, et la MENTION (`<ObjectMention kind="mission">`),
 * qui est la forme normale depuis que la primitive F1 sait ouvrir une mission.
 * N'en chercher qu'une rendrait la garde rouge sur du code juste le jour où un
 * écran passe à la primitive — et une garde qui crie sur du comportement
 * correct se désactive dans la semaine.
 *
 * ⚠️ `[\s/>]` après le nom du composant : `<ObjectMentionAutreChose` ne compte
 * pas. Le défaut a déjà été trouvé une fois dans ce dépôt, par un contrôle
 * négatif — `.includes('<ObjectMention')` acceptait l'homonyme.
 *
 * ⚠️ La mention n'est comptée que si elle porte `kind="mission"` : la même
 * primitive ouvre aussi les comptes et les contacts, et compter un
 * `<ObjectMention kind="account">` rendrait cette garde verte grâce à une porte
 * qui mène ailleurs.
 */
function doors(): string[] {
  const escaped = DOSSIER_PATH.replace(/\$/g, '\\$')
  const forms = [
    new RegExp(`to=["']${escaped}["']`),
    new RegExp(`to:\\s*["']${escaped}["']`),
    /<ObjectMention[\s/>][\s\S]{0,200}?kind=["']mission["']/,
  ]
  return screenFiles(SRC)
    .filter(file => {
      const code = stripComments(readFileSync(file, 'utf8'))
      return forms.some(form => form.test(code))
    })
    .map(relative)
    .sort()
}

describe('GA-82 — le dossier d’une mission est atteignable en cliquant', () => {
  it('LIT quelque chose — le corpus d’écrans n’est pas vide', () => {
    // Sans cette assertion, un chemin faux rendrait la garde verte sur zéro
    // fichier : le faux zéro silencieux, la cause racine la plus chère du dépôt.
    expect(screenFiles(SRC).length).toBeGreaterThan(200)
  })

  it('la route existe, et l’arbre GÉNÉRÉ la connaît', () => {
    // L'arbre est généré : une route ajoutée sans régénération est un fichier
    // que le routeur n'a jamais vu, et `Route.useParams()` ne se type même pas.
    expect(readFileSync(ROUTE_FILE, 'utf8')).toContain(`createFileRoute('${DOSSIER_PATH}')`)
    expect(readFileSync(ROUTE_TREE, 'utf8')).toContain(`'${DOSSIER_PATH}'`)
  })

  it('AU MOINS UN écran y mène par un lien', () => {
    // Le message porte la liste : un rouge qui dit seulement « 0 » envoie
    // chercher, un rouge qui dit « voici ce que j'ai trouvé » envoie corriger.
    expect(doors()).not.toEqual([])
  })

  /**
   * La porte du TIROIR est nommée à part, parce qu'elle est le chemin de clic
   * principal : c'est de là qu'une mission s'ouvrait avant ce lot. La perdre
   * rendrait le dossier théoriquement atteignable et pratiquement invisible —
   * et cette garde resterait verte grâce à une autre porte.
   */
  it('le TIROIR porte la sienne — le chemin de clic principal', () => {
    // #4194 (L3) : `MissionDetailSheet` n'est plus un tiroir ; le panneau latéral
    // unique `RecordPanel` porte la porte « Ouvrir la fiche complète » (`/missions/$id`).
    expect(doors()).toContain('features/records/RecordPanel.tsx')
  })

  it('le dossier du COMPTE porte la sienne — ses missions étaient du texte mort', () => {
    expect(doors()).toContain('features/accounts/view/account-detail/tabs/TabMissions.tsx')
  })

  /**
   * Les QUATRE écrans que la mesure de D200 nommait un par un : le libellé
   * d'une mission y était du `<Text>` mort, parce que la mention n'avait pas de
   * cible. Ils sont listés ici NOMMÉMENT plutôt que comptés, parce que « quatre
   * portes » resterait vert si on en retirait une et qu'on en ajoutait une
   * ailleurs — et ce sont ces quatre-là qui étaient le défaut.
   */
  it('les quatre écrans que D200 nommait mènent au dossier', () => {
    // ⚠️ 31/08/2026 — `InvoiceReadinessPanel.tsx` a rejoint sa forme TABLEAU
    // (maquette du 26/08, écran « Facturation ») : la mention de mission et le
    // chevron qui portaient la porte ont été EXTRAITS dans le composant qui
    // rend chaque ligne, `InvoiceReadinessTable.tsx`, que le panneau monte
    // toujours. La porte reste EXACTEMENT la même depuis l'écran — c'est le
    // FICHIER qui la porte qui a changé, pas le fait qu'elle existe. La citer
    // encore sous l'ancien nom ferait cette garde rouge sur un écran juste.
    const found = doors()
    for (const screen of [
      'features/missions/view/CollectionsPage.tsx',
      'features/missions/view/TimesheetsPage.tsx',
      'features/missions/view/InvoiceReadinessTable.tsx',
      'features/pilotage/rex/view/RexScreen.tsx',
    ]) {
      expect(found).toContain(screen)
    }
  })
})
