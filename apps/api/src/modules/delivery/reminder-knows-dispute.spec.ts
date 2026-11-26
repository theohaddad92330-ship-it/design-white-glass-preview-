import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/**
 * GA-51 — TOUTE LECTURE DE LA CADENCE DE RELANCE CONNAÎT LE LITIGE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET LE DÉFAUT QUI L'A RENDUE NÉCESSAIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * `reminderDue` REFUSE de relancer une facture contestée — c'est BEL-MIS-011,
 * « le litige n'est pas un retard » : le client sait très bien qu'il n'a pas
 * payé, il refuse de payer, et lui redemander tous les sept jours pendant qu'un
 * litige court est la façon la plus sûre de le durcir.
 *
 * Ce refus était écrit, testé, et **la moitié des appelants ne le déclenchait
 * pas**. Les deux champs du litige étaient FACULTATIFS, avec une raison qui
 * semblait prudente (« un appelant qui ne sait rien du litige garde le
 * comportement d'avant »). Il y avait deux appelants : le service les passait,
 * l'écran ne les passait pas. Une propriété absente d'un objet littéral est
 * exactement ce que « facultatif » autorise — donc rien, nulle part, ne pouvait
 * le dire. La ligne affichait « Relance n°2 due · Ton ferme » sur une facture
 * que l'utilisateur venait de déclarer contestée, pendant que le toast lui
 * promettait « Les relances s'arrêtent sur ce mois ».
 *
 * C'est la famille « paramètre déclaré, jamais passé », et le correctif de fond
 * a été de RETIRER LE MOYEN : les deux champs sont désormais obligatoires dans
 * le contrat, donc `tsc` refuse un appel qui ne s'est pas posé la question.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE AJOUTE AU COMPILATEUR — ET POURQUOI ELLE N'EST PAS UN DOUBLON
 * ─────────────────────────────────────────────────────────────────────────────
 * Le type exige que les champs SOIENT LÀ. Il ne peut pas exiger qu'ils soient
 * VRAIS. Un appelant pressé qui voit une erreur de compilation a un moyen
 * évident de la faire taire :
 *
 *     disputedAt: null, disputeResolvedAt: null,   // ← compile, et ment
 *
 * et le défaut revient à l'identique, en pire : il est maintenant ÉCRIT. C'est
 * précisément le geste que ce dépôt s'interdit ailleurs (« ne jamais déplacer
 * une entrée vers ‹ vide à dessein › juste pour faire passer le test »).
 * La garde interdit donc le littéral à l'appel : la valeur doit se LIRE sur la
 * ligne qu'on est en train d'évaluer.
 *
 * `null` reste une valeur parfaitement légitime À L'EXÉCUTION — « cette facture
 * n'a pas de litige » est une réponse. Ce qui est refusé, c'est de l'écrire en
 * dur à l'appel, ce qui revient à répondre à la place de la donnée.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..')

/** Là où un appelant de la cadence peut vivre. Le contrat est inclus : la
 *  fonction y est DÉFINIE, et une garde qui ne lirait que les consommateurs
 *  raterait un appel interne ajouté plus tard. */
const SCANNED_ROOTS = ['apps/web/src', 'apps/api/src', 'packages/contracts/src']

const SOURCE_EXTENSIONS = ['.ts', '.tsx']

/**
 * Les fichiers de test sont HORS corpus, et c'est une exemption raisonnée : un
 * test a le droit — le devoir, même — de construire un cas « sans litige » en
 * écrivant `disputedAt: null`. C'est ce qu'il vérifie. L'interdit porte sur le
 * code qui tourne en production, où la valeur doit venir de la ligne.
 */
function isTestFile(path: string): boolean {
  return /\.(?:spec|test)\.tsx?$/.test(path)
}

function walk(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.turbo') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      found.push(...walk(full))
      continue
    }
    if (SOURCE_EXTENSIONS.some(ext => entry.endsWith(ext))) found.push(full)
  }
  return found
}

/**
 * Retire commentaires de bloc et de ligne.
 *
 * ⚠️ Non négociable, et déjà payé huit fois dans ce dépôt : « une garde qui
 * cherche un MOT trouve les commentaires ». Les docblocs de ce chantier citent
 * `reminderDue` en toutes lettres, plusieurs fois, avec des parenthèses. Sans
 * ce nettoyage, la garde s'analyserait elle-même et sa propre prose.
 *
 * Les littéraux de chaîne sont laissés tels quels : aucun n'existe dans ce
 * corpus autour d'un appel de cadence, et les retirer coûterait un analyseur
 * là où deux expressions suffisent.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
}

/**
 * Le texte COMPLET de chaque appel `reminderDue(...)`, parenthèses équilibrées.
 *
 * Équilibrer plutôt que découper à la virgule ou au `)` : l'argument est un
 * objet littéral qui contient lui-même des appels (`new Date(...)`) et des
 * virgules. Un extracteur coupé au premier `)` rendrait un fragment, et un
 * fragment sans `disputedAt` se lirait comme une infraction — une garde qui
 * accuse à tort finit désactivée.
 */
function extractCalls(source: string): string[] {
  const calls: string[] = []
  const needle = 'reminderDue('
  let from = 0
  for (;;) {
    const start = source.indexOf(needle, from)
    if (start === -1) break
    from = start + needle.length

    // La DÉFINITION n'est pas un appel. `export function reminderDue(` ouvre la
    // même parenthèse et déclare les champs au lieu de les passer.
    if (/function\s+$/.test(source.slice(Math.max(0, start - 20), start))) continue

    let depth = 0
    let index = start + needle.length - 1
    for (; index < source.length; index += 1) {
      const char = source[index]
      if (char === '(') depth += 1
      else if (char === ')') {
        depth -= 1
        if (depth === 0) {
          index += 1
          break
        }
      }
    }
    calls.push(source.slice(start, index))
    from = index
  }
  return calls
}

/** La valeur écrite pour une clé, jusqu'à la virgule de MÊME niveau. */
function valueFor(call: string, key: string): string | null {
  const at = call.indexOf(`${key}:`)
  if (at === -1) {
    // La forme abrégée `{ disputedAt, ... }` lit bien une variable.
    return new RegExp(`[{,]\\s*${key}\\s*[,}]`).test(call) ? 'shorthand' : null
  }
  let depth = 0
  let index = at + key.length + 1
  const start = index
  for (; index < call.length; index += 1) {
    const char = call[index]
    if (char === '(' || char === '[' || char === '{') depth += 1
    else if (char === ')' || char === ']' || char === '}') {
      if (depth === 0) break
      depth -= 1
    } else if (char === ',' && depth === 0) break
  }
  return call.slice(start, index).trim()
}

interface DisputeFinding {
  file: string
  reason: string
}

const REQUIRED_KEYS = ['disputedAt', 'disputeResolvedAt'] as const

/** Le détecteur, isolé de la lecture disque pour être testable dans les deux
 *  sens — c'est ce qui permet de prouver qu'il sait dire NON. */
function inspectSource(file: string, source: string): DisputeFinding[] {
  const findings: DisputeFinding[] = []
  for (const call of extractCalls(stripComments(source))) {
    for (const key of REQUIRED_KEYS) {
      const value = valueFor(call, key)
      if (value === null) {
        findings.push({ file, reason: `l'appel à reminderDue ne passe pas \`${key}\`` })
        continue
      }
      if (value === 'null' || value === 'undefined') {
        findings.push({
          file,
          reason: `\`${key}\` est écrit en dur (\`${value}\`) : la valeur doit se lire sur la ligne, pas être répondue à sa place`,
        })
      }
    }
  }
  return findings
}

function corpus(): { file: string; source: string }[] {
  const files: { file: string; source: string }[] = []
  for (const root of SCANNED_ROOTS) {
    for (const full of walk(join(REPO_ROOT, root))) {
      if (isTestFile(full)) continue
      const source = readFileSync(full, 'utf8')
      if (!source.includes('reminderDue(')) continue
      files.push({ file: relative(REPO_ROOT, full), source })
    }
  }
  return files
}

describe('GA-51 — la garde LIT quelque chose', () => {
  it('trouve les fichiers de production qui appellent la cadence', () => {
    const files = corpus().map(entry => entry.file)
    // Borne basse : un corpus vide rendrait les assertions suivantes vertes sur
    // du néant, ce qui est le mode d'échec de six gardes borgnes de ce dépôt.
    expect(files.length).toBeGreaterThanOrEqual(2)
    // Et les DEUX appelants connus sont nommés : un scan qui les raterait
    // passerait au vert en ne regardant qu'un dossier.
    expect(files).toContain('apps/api/src/modules/delivery/invoice-readiness.service.ts')
    expect(files).toContain('apps/web/src/features/missions/view/PaymentReminderDue.tsx')
  })

  it('extrait un appel ENTIER, pas un fragment coupé à la première parenthèse', () => {
    const call = extractCalls('const d = reminderDue({ disputedAt: row.a }, new Date(x))')
    expect(call).toHaveLength(1)
    expect(call[0]).toContain('new Date(x)')
    expect(call[0]?.endsWith(')')).toBe(true)
  })

  it('ne prend PAS la définition de la fonction pour un appel', () => {
    expect(extractCalls('export function reminderDue(\n  input: { state: X },\n)')).toHaveLength(0)
  })

  it('ne lit pas les commentaires — c’est le défaut payé huit fois ici', () => {
    const commented = `/* reminderDue({ state }, now) sans litige */\n// reminderDue({ state }, now)\n`
    expect(inspectSource('faux.ts', commented)).toEqual([])
  })
})

describe('GA-51 — la garde sait dire NON', () => {
  it('rougit sur un appel qui OMET le litige, et NOMME le fichier', () => {
    const findings = inspectSource(
      'apps/web/src/features/missions/view/Coupable.tsx',
      'const due = reminderDue({ state: item.state, dueOn: item.dueOn, paidAt: null, remindersSent: 0 }, now)',
    )
    expect(findings).not.toHaveLength(0)
    expect(findings.every(f => f.file === 'apps/web/src/features/missions/view/Coupable.tsx')).toBe(true)
    expect(findings.map(f => f.reason).join(' ')).toContain('disputedAt')
  })

  it('rougit sur le littéral qui ferait TAIRE le compilateur', () => {
    // Le geste exact que le type ne peut pas empêcher, et toute la raison
    // d'être de cette garde.
    const findings = inspectSource(
      'apps/web/src/Menteur.tsx',
      'reminderDue({ state: s, dueOn: d, paidAt: p, remindersSent: n, disputedAt: null, disputeResolvedAt: null }, now)',
    )
    expect(findings).toHaveLength(2)
    expect(findings[0]?.file).toBe('apps/web/src/Menteur.tsx')
    expect(findings[0]?.reason).toContain('en dur')
  })

  it('ACCEPTE un appel qui lit la valeur sur la ligne', () => {
    const honest =
      'reminderDue({ state: i.state, dueOn: i.dueOn, paidAt: i.paidAt, remindersSent: i.remindersSent, disputedAt: i.disputedAt, disputeResolvedAt: i.disputeResolvedAt }, now)'
    expect(inspectSource('ok.ts', honest)).toEqual([])
  })
})

describe('GA-51 — aucune relance ne s’affiche sans savoir si un litige court', () => {
  it('chaque appelant de production passe le litige, et le LIT', () => {
    const findings = corpus().flatMap(entry => inspectSource(entry.file, entry.source))
    expect(findings.map(f => `${f.file} — ${f.reason}`)).toEqual([])
  })
})
