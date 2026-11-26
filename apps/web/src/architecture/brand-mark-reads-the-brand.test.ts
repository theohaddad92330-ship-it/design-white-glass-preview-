import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-253 — LE NOM DU PRODUIT NE S'ÉCRIT PAS EN DUR DANS LE CODE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE, ET CE QUE GA-252 NE COUVRAIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * GA-252 tient les 601 clés de TRADUCTION. Elle ne lit que `i18n/locales`, et
 * c'est délibéré. Mais la marque ne vivait pas que dans les traductions : elle
 * était aussi écrite en TOUTES LETTRES dans le JSX — l'entête de la barre
 * latérale, le mot-symbole des écrans de connexion, l'auteur du PDF exporté,
 * le pied « propulsé par » de la page de partage publique.
 *
 * Ces endroits-là sont les PIRES : ils sont invisibles à une relecture des
 * catalogues, et le dernier — un dossier qu'un client envoie à SON client —
 * est exactement celui pour lequel on vend la marque blanche.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX INTERDITS
 * ─────────────────────────────────────────────────────────────────────────
 * 1. **Le nom en toutes lettres**, hors commentaire. Il se lit sur
 *    `useBrand()` (dans l'app), ou se reçoit en prop (dans `@bellum/ui`, qui
 *    ne connaît ni le réseau ni l'espace actif).
 * 2. **`BrandMark` importé depuis `@bellum/ui`** dans l'application. Le
 *    composant du paquet exige `brand` ; l'écrire aux neuf endroits qui
 *    affichent le mot-symbole garantit d'en oublier un. `@/features/brand/
 *    BrandMark` lit la marque une fois pour tous.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE REGARDE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Les COMMENTAIRES — ils racontent ce lot, et une garde qui interdit d'écrire
 * son propre sujet est une garde qu'on désactive. Les identifiants
 * (`BellumReadCard`, `--bellum-primary-500`, `@bellum/ui`) : le motif exige la
 * capitale et un mot complet. Et les tests, qui ont le droit de vérifier
 * qu'un repli rend bien le nom du produit.
 */

const ROOTS = [join(__dirname, '..'), join(__dirname, '../../../../packages/ui/src')]

/**
 * Les seuls endroits qui ont le DROIT d'écrire le nom.
 *
 * `brand.ts` du paquet contracts est la source unique — il n'est pas dans les
 * racines balayées, il est cité ici pour que le lecteur sache où regarder.
 */
const ALLOWED: string[] = []

/**
 * Les écrans autorisés à importer `BrandMark` de `@bellum/ui`.
 *
 * UN SEUL, et sa raison est le contraire d'une commodité : Réglages › Marque
 * montre un APERÇU du brouillon en cours de saisie. `useBrand()` y rendrait la
 * marque ENREGISTRÉE — donc un aperçu qui ne change qu'après avoir enregistré,
 * c'est-à-dire l'inverse d'un aperçu.
 *
 * Toute autre entrée ici serait un oubli, pas une exception.
 */
const MAY_IMPORT_UI_BRAND_MARK = ['features/settings/view/BrandingView.tsx']

/**
 * `BellumAI`, sa coquille `BellumAl` (un L à la place du I), et `Laura`.
 *
 * ⚠️ Les bornes sont `(?<![A-Za-z])` / `(?![A-Za-z])` et pas `\b`. C'est la
 * preuve n°2 qui l'a imposé : `subject=Suggestion%20BellumAI` — la forme
 * RÉELLEMENT trouvée dans le code — n'était pas attrapée, parce que `\b`
 * exige un changement de classe de caractère et que `0` est un caractère de
 * mot. Un nom encodé dans une URL reste un nom affiché.
 */
const BRAND_LITERAL = /(?<![A-Za-z])(?:BellumAI|BellumAl|Laura)(?![A-Za-z])/

type Line = { file: string; line: number; text: string }

function sourceFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue
      if (/\.(test|spec)\.tsx?$/.test(entry)) continue
      out.push(full)
    }
  }
  walk(root)
  return out
}

/**
 * Les lignes de code, commentaires retirés.
 *
 * ⚠️ Un état `inBlock` et pas un `replace` global : un `/* … *\/` sur plusieurs
 * lignes se lit ligne par ligne ici, et sans l'état la deuxième ligne d'un
 * docblock passerait pour du code.
 */
function codeLines(files: string[]): Line[] {
  const out: Line[] = []
  for (const file of files) {
    let inBlock = false
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((raw, index) => {
        let text = raw
        if (inBlock) {
          const end = text.indexOf('*/')
          if (end === -1) return
          text = text.slice(end + 2)
          inBlock = false
        }
        const start = text.indexOf('/*')
        if (start !== -1) {
          const end = text.indexOf('*/', start + 2)
          if (end === -1) {
            inBlock = true
            text = text.slice(0, start)
          } else {
            text = text.slice(0, start) + text.slice(end + 2)
          }
        }
        const lineComment = text.indexOf('//')
        if (lineComment !== -1) text = text.slice(0, lineComment)
        if (!text.trim()) return
        out.push({ file, line: index + 1, text })
      })
  }
  return out
}

const FILES = ROOTS.flatMap(sourceFiles)
const CODE = codeLines(FILES)

describe('GA-253 — le mot-symbole lit la marque, il ne l’écrit pas', () => {
  it('LIT vraiment le code de l’app ET celui du paquet', () => {
    // Preuve n°1 : un chemin faux rendrait cette garde verte en ne lisant rien.
    expect(FILES.length).toBeGreaterThan(800)
    expect(FILES.some(f => f.includes('/packages/ui/src/'))).toBe(true)
    expect(FILES.some(f => f.includes('/features/brand/'))).toBe(true)
    expect(CODE.length).toBeGreaterThan(20_000)
  })

  it('sait dire NON — les formes réellement rencontrées sont refusées', () => {
    // Preuve n°2, sur les quatre lignes que ce lot a supprimées.
    for (const text of [
      '          BellumAI',
      '      title="BellumAI"',
      '    <Document title={title} author="BellumAI" subject={s}>',
      "      href: 'mailto:x?subject=Suggestion%20BellumAI',",
      '  return match ? t(match[1]) : "Laura"',
    ]) {
      expect(BRAND_LITERAL.test(text), text).toBe(true)
    }
  })

  it('n’attrape PAS ce qu’elle ne vise pas', () => {
    // Preuve n°3. Les identifiants, les tokens et les chemins de paquet citent
    // « bellum » légitimement — les confondre rendrait la garde ininstallable,
    // et une garde ininstallable se fait désactiver.
    for (const text of [
      "import { Card } from '@bellum/ui'",
      'className="text-[var(--bellum-primary-500)]"',
      'export type BellumReadData = { id: string }',
      'const brand = useBrand()',
      'const name = brand?.name?.trim() || DEFAULT_BRAND_NAME',
    ]) {
      expect(BRAND_LITERAL.test(text), text).toBe(false)
    }
  })

  it('supprime bien les commentaires avant de chercher', () => {
    // Le nettoyage EST la garde : sans lui elle crierait sur ses propres
    // docblocks, et la réponse serait de la désactiver.
    const brandProvider = CODE.filter(l => l.file.endsWith('features/brand/BrandProvider.tsx'))
    expect(brandProvider.length).toBeGreaterThan(10)
    expect(brandProvider.some(l => BRAND_LITERAL.test(l.text))).toBe(false)
  })

  it('ne trouve aucun nom de marque écrit en dur dans du code', () => {
    const offences = CODE.filter(l => BRAND_LITERAL.test(l.text) && !ALLOWED.some(a => l.file.endsWith(a))).map(
      l => `${l.file.split('/src/')[1]}:${l.line} — ${l.text.trim()}`,
    )

    expect(
      offences,
      offences.length === 0
        ? ''
        : `Nom de marque écrit en dur dans du code :\n${offences.map(o => `  ${o}`).join('\n')}\n\n` +
            `Dans l'app : useBrand() (@/features/brand/BrandProvider).\n` +
            `Dans @bellum/ui : la marque se reçoit en prop — le paquet ne connaît\n` +
            `ni le réseau ni l'espace actif. Le repli unique est DEFAULT_BRAND_NAME.`,
    ).toEqual([])
  })

  it('interdit d’importer `useBrand` depuis le FOURNISSEUR', () => {
    /*
     * ─────────────────────────────────────────────────────────────────────
     * CE N'EST PAS UNE QUESTION DE STYLE — C'EST UNE MESURE
     * ─────────────────────────────────────────────────────────────────────
     * `BrandProvider` importe react-query, le client d'API et `@/i18n`. Il en
     * a besoin : il va CHERCHER la marque. `useBrand` ne fait qu'un
     * `useContext`.
     *
     * Tant que les deux vivaient dans le même module, tout consommateur du
     * hook tirait le graphe du fournisseur — et `PageHeader` est rendu par
     * presque chaque écran. Mesuré le 01/09/2026 sur `src/features/accounts`
     * + `src/features/contacts` (173 fichiers) :
     *
     *      ensemble : 96,07 s  (collect 231 s, setup 522 s)
     *      séparés  : 29,31 s  (collect  68 s, setup 145 s)
     *
     * Soit 3,3×. En CI, où la machine n'absorbe pas la différence, deux tests
     * du shard 2/3 sont passés au-dessus du délai de 20 s — verts en local,
     * rouges là-bas, et pour une raison qui n'avait rien à voir avec eux.
     *
     * Un import « pratique » depuis `BrandProvider` remettrait les 67 secondes.
     */
    const offences = FILES.filter(f => f.includes('/apps/web/src/'))
      .filter(f => !f.endsWith('features/brand/BrandProvider.tsx'))
      .filter(f => /import\s*\{[^}]*\buseBrand\b[^}]*\}\s*from\s*'[^']*BrandProvider'/.test(readFileSync(f, 'utf8')))
      .map(f => f.split('/src/')[1]!)

    expect(
      offences,
      offences.length === 0
        ? ''
        : `Ces fichiers importent useBrand du FOURNISSEUR :\n${offences.map(o => `  ${o}`).join('\n')}\n\n` +
            `Importer '@/features/brand/brand-context' — le hook seul, sans\n` +
            `react-query ni le client d'API. Mesuré : 3,3× sur la collecte des tests.`,
    ).toEqual([])
  })

  it('interdit d’importer BrandMark depuis @bellum/ui dans l’application', () => {
    // Neuf écrans affichent le mot-symbole. Le composant du paquet exige
    // `brand` : passer `useBrand()` neuf fois garantit d'en oublier un.
    const offences = FILES.filter(f => f.includes('/apps/web/src/'))
      .filter(f => !f.endsWith('features/brand/BrandMark.tsx'))
      .filter(f => !MAY_IMPORT_UI_BRAND_MARK.some(allowed => f.endsWith(allowed)))
      .filter(f => /import\s*\{[^}]*\bBrandMark\b[^}]*\}\s*from\s*'@bellum\/ui'/.test(readFileSync(f, 'utf8')))
      .map(f => f.split('/src/')[1]!)

    expect(
      offences,
      offences.length === 0
        ? ''
        : `Ces écrans importent BrandMark du paquet :\n${offences.map(o => `  ${o}`).join('\n')}\n\n` +
            `Importer '@/features/brand/BrandMark' — il lit la marque une fois pour tous.`,
    ).toEqual([])
  })
})
