import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-177 — un `CHECK` de migration reste NOMMÉ, en cliquet.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE TROU QUE GA-12 NE VOIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-12 (`check-constraints-cover-enums.spec.ts`) vérifie qu'une contrainte
 * `CHECK` couvre bien son énumération TypeScript — mais son extracteur ne
 * cherche que `CONSTRAINT <nom> CHECK (…)`. Un `CHECK` écrit EN LIGNE dans une
 * définition de colonne — `value text NOT NULL CHECK (value IN ('oui','non'))`
 * — n'a pas de nom porté par le texte de la migration : GA-12 ne peut rien
 * enregistrer pour lui, et rien ne tombe en CI le jour où quelqu'un ajoute une
 * valeur à l'énumération TypeScript sans élargir cette contrainte-là.
 * L'intégrité Postgres reste réelle ; c'est la protection contre la DÉRIVE qui
 * manque.
 *
 * Deux migrations de la vague du 30/08/2026 ont pris cette forme —
 * `SprintSwitchLog` (`1790900000001`) et `EsnSubcontractingDeclarations`
 * (`1790900000008`), cette dernière EXPLICITEMENT écrite en ligne pour rester
 * hors de portée de GA-12 (voir son commentaire « POURQUOI LES CONTRAINTES
 * CHECK SONT EN LIGNE, SANS CONSTRAINT NOMMÉ »). Le nommage reste la
 * convention très largement majoritaire du dépôt ; rien ne l'imposait avant
 * cette garde.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE FAIT — ET NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne rend pas nommées les 35 contraintes en ligne déjà présentes — les
 * réécrire n'est pas le sujet de ce chantier. Elle fige leur nombre, comme
 * GA-07 fige le compte d'imports service → service (§3.2) : un plafond qui ne
 * monte plus, et qui redescend quand quelqu'un migre une entrée vers la forme
 * nommée.
 *
 * QUOI FAIRE quand cette garde tombe : n'écris plus
 *   `<colonne> <type> ... CHECK (<colonne> IN (…))`
 * mais
 *   `<colonne> <type> ...,
 *    CONSTRAINT <table>_<colonne>_check CHECK (<colonne> IN (…))`
 * (ou un `ALTER TABLE … ADD CONSTRAINT <table>_<colonne>_check CHECK (…)`
 * séparé), PUIS déclare la correspondance dans le `MAPPING` de
 * `check-constraints-cover-enums.spec.ts` — nom de la contrainte vers nom de
 * l'énumération TypeScript, ou `null` avec la raison si aucune n'existe.
 *
 * Hors mesure, volontairement : un `CHECK` sans `IN (…)` — `count >= 0` par
 * exemple — n'énumère rien, GA-12 n'a rien à en faire non plus. Et une
 * contrainte NOMMÉE dont le nom est illisible pour une AUTRE raison (entre
 * guillemets — `workspaces_billing_currency_check` — ou construit par
 * interpolation JS — `${table}_role_check` dans `RbacRoles` /
 * `MemberPermissions`, tous deux déjà présents avant cette garde) n'est pas de
 * la même famille : elle PORTE le mot-clé `CONSTRAINT`, elle n'est pas écrite
 * en ligne dans une colonne. Élargir GA-12 pour lire ces formes-là est un
 * chantier séparé.
 */

const MIGRATIONS = join(__dirname, '..', 'migrations')

/** Un commentaire de migration qui MENTIONNE `CHECK (…) IN (…)` en prose (ex:
 *  `RbacRoles`, qui documente une contrainte passée) n'est pas du SQL réel. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/** Tout `CHECK (` du texte de migration — nommé ou non, c'est ensuite classé. */
const ANY_CHECK = /CHECK\s*\(/gi

/**
 * Une occurrence est NOMMÉE dès que le mot-clé `CONSTRAINT` + UN TOKEN
 * QUELCONQUE la précède directement — identifiant nu, `"entre guillemets"`,
 * ou `${interpolé}`. Chercher littéralement le mot-clé `CONSTRAINT`, jamais
 * deviner depuis la FORME d'un identifiant, est ce qui évite le piège inverse :
 * une regex qui chercherait `<identifiant> <identifiant> ... CHECK` pour
 * repérer une colonne inline capturerait tout aussi bien `CONSTRAINT
 * <nom>` (« CONSTRAINT » lu comme une colonne, « <nom> » comme son type) et
 * classerait une contrainte NOMMÉE parmi les contraintes EN LIGNE.
 */
const IMMEDIATELY_NAMED = /CONSTRAINT\s+\S+\s*$/i

/**
 * Le corps porte une LISTE DE VALEURS — `[col IS NULL OR] col IN ('a', 'b')`
 * — le même filtre que GA-12 : un `CHECK (count >= 0)` n'énumère rien, il
 * n'est d'aucune des deux formes que cette garde compte.
 */
const IN_LIST_BODY = /^\s*(?:[a-z0-9_."]+\s+IS\s+NULL\s+OR\s+)?[a-z0-9_."]+\s+IN\s*\(([^)]*)\)/i

type InlineHit = { file: string; context: string }

function inlineCheckHits(): InlineHit[] {
  const hits: InlineHit[] = []
  for (const file of readdirSync(MIGRATIONS).filter(name => name.endsWith('.ts'))) {
    // Seul le `up()` compte, comme dans GA-11/GA-12 : un `down()` restaure
    // l'état d'avant, par nature — il ne déclare rien de nouveau.
    const source = stripComments(readFileSync(join(MIGRATIONS, file), 'utf8'))
    const up = source.split('public async down')[0] ?? ''

    for (const match of up.matchAll(ANY_CHECK)) {
      const idx = match.index ?? 0
      const before = up.slice(Math.max(0, idx - 200), idx)
      if (IMMEDIATELY_NAMED.test(before.trimEnd())) continue // nommé — hors sujet ici

      const after = up.slice(idx + match[0].length, idx + match[0].length + 500)
      const body = IN_LIST_BODY.exec(after)
      if (!body) continue // pas de `IN (…)` — n'énumère rien
      const values = [...(body[1] ?? '').matchAll(/'([^']*)'/g)]
      if (values.length === 0) continue // pas une liste de littéraux

      hits.push({ file, context: before.slice(-60).trim() })
    }
  }
  return hits
}

/**
 * Le constat sur `origin/integration/vague-m-30-aout` le 30/08/2026 : 35
 * occurrences, dans 19 fichiers. À faire DESCENDRE — jamais monter.
 */
const INLINE_CHECK_COUNT_AT_FREEZE = 35
const FILES_WITH_INLINE_CHECK_AT_FREEZE = 19

describe('GA-177 — les CHECK de migration restent nommés, en cliquet', () => {
  const hits = inlineCheckHits()
  const files = new Set(hits.map(hit => hit.file))

  it('le nombre de CHECK en ligne ne remonte plus', () => {
    if (hits.length > INLINE_CHECK_COUNT_AT_FREEZE) {
      throw new Error(
        [
          `${hits.length} CHECK en ligne trouvés, contre ${INLINE_CHECK_COUNT_AT_FREEZE} au gel.`,
          '',
          'Un `CHECK` de migration doit être NOMMÉ :',
          '  CONSTRAINT <table>_<colonne>_check CHECK (<colonne> IN (…))',
          "plutôt qu'écrit en ligne dans la définition de la colonne — sinon GA-12",
          '(check-constraints-cover-enums.spec.ts) ne peut rien vérifier pour lui.',
          'Nomme la contrainte, PUIS déclare-la dans le `MAPPING` de GA-12.',
          '',
          ...hits.map(hit => `  · ${hit.file} — …${hit.context}`),
        ].join('\n'),
      )
    }
    expect(hits.length).toBeLessThanOrEqual(INLINE_CHECK_COUNT_AT_FREEZE)
  })

  it('le nombre de fichiers concernés ne remonte pas non plus', () => {
    // Deux mesures plutôt qu'une, comme GA-07 : ajouter trois CHECK en ligne
    // dans UN fichier déjà fautif ne doit pas se lire comme trois régressions
    // indépendantes, mais le nombre de FICHIERS ne doit pas non plus monter en
    // silence si dix occurrences se regroupaient artificiellement en un seul.
    expect(files.size).toBeLessThanOrEqual(FILES_WITH_INLINE_CHECK_AT_FREEZE)
  })

  it('le plafond figé reste proche du réel — un plafond trop haut ne garde rien', () => {
    // Si le réel descend nettement sous le plafond (quelqu'un a nommé des
    // contraintes existantes), c'est le plafond qu'il faut baisser ici, sinon
    // la garde se met à tolérer une régression de plusieurs contraintes.
    expect(INLINE_CHECK_COUNT_AT_FREEZE - hits.length).toBeLessThanOrEqual(5)
    expect(FILES_WITH_INLINE_CHECK_AT_FREEZE - files.size).toBeLessThanOrEqual(5)
  })

  it('la garde lit bien quelque chose — un corpus vide passerait au vert pour toujours', () => {
    // Un dossier de migrations introuvable ou mal résolu par `__dirname` ferait
    // `readdirSync` renvoyer `[]` sans lever — le « faux zéro silencieux » que
    // ce dépôt a déjà rencontré ailleurs (grep sur un chemin inexistant, etc.).
    const migrationFiles = readdirSync(MIGRATIONS).filter(name => name.endsWith('.ts'))
    expect(migrationFiles.length).toBeGreaterThan(200)
    // Et la preuve que l'extraction trouve du VRAI contenu, pas un total qui
    // tomberait juste par coïncidence : les deux migrations qui ont motivé
    // cette garde doivent apparaître dans le relevé.
    expect(files.has('1790900000001-SprintSwitchLog.ts')).toBe(true)
    expect(files.has('1790900000008-EsnSubcontractingDeclarations.ts')).toBe(true)
  })
})
