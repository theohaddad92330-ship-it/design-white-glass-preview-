import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-116 — le statut d'une décision est lisible par machine.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Un total est un argument. » `agent_docs/decisions-aout-2026.md` porte 22
 * décisions numérotées. Jusqu'au 30/08/2026, leur statut n'était écrit nulle part
 * où on puisse le LIRE : il vivait dans un chapeau de prose de dix-sept lignes,
 * en haut d'un fichier de 287.
 *
 * Deux lecteurs sérieux l'ont compté et se sont trompés, dans deux directions
 * opposées :
 *
 *   · le certificat d'épuisement de l'archive 00
 *     (`gouvernance-iteration-3-2026-08-25.md`, preuve n°5) n'a pas ouvert le
 *     fichier et a écrit « ZÉRO décision en suspens » ;
 *   · la passe B (`passe-b-iteration-3/ARCHIVE-00.md`, trou n°2) l'a ouvert, a
 *     compté le seul marqueur régulier qu'il offrait — le titre `**À trancher**`,
 *     qui nomme la QUESTION et ne dit rien de sa réponse — et a écrit
 *     « QUATORZE encore marquées à trancher ».
 *
 * La vérité est SEPT. Aucun des deux ne mentait ; aucun des deux ne pouvait
 * compter. C'est ça que cette garde répare : elle ne juge aucun statut, elle
 * exige qu'il en existe un, dans un vocabulaire fermé, pour chaque décision, et
 * que le total écrit se RECALCULE au lieu d'être recopié.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne dit pas si une décision DEVRAIT être ouverte, ni si le statut écrit est
 * le bon — une garde protège une règle, elle ne l'invente pas. Elle rend
 * seulement impossible qu'une décision n'ait aucun statut, ou qu'un total soit
 * faux sans que la CI le voie.
 *
 * Elle ne couvre qu'UN fichier. Quatre autres décisions produit vivent sans
 * numéro dans `agent_docs/restitution-tracker.md` : elles sont incomptables tant
 * qu'elles n'en ont pas, et c'est parqué en D332
 * (`agent_docs/iteration-3-precedence-et-certificat-2026-08-30.md`).
 */

const REPO_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..', '..', '..')
const DECISIONS_FILE = join(REPO_ROOT, 'agent_docs', 'decisions-aout-2026.md')

/** Le vocabulaire fermé. Emprunté au point 3 de la « Règle générale » de
 *  `SOURCE_PRECEDENCE.md:11` (`implémenté`, `partiel`, `absent`, `régressé`,
 *  `supplanté`, `contradictoire`), adapté à des décisions. */
const STATUSES = ['TRANCHÉE', 'PARTIELLE', 'OUVERTE', 'SUPPLANTÉE'] as const
type Status = (typeof STATUSES)[number]

interface Parsed {
  /** Les décisions déclarées par un titre de section : `### D7. …` */
  headings: string[]
  /** Les lignes de la table de statut : D7 → statut + justification. */
  rows: Map<string, { status: string; proof: string }>
  /** Le total écrit en prose : « 22 décisions — 11 TRANCHÉE, … ». */
  claimed: { total: number; byStatus: Map<string, number> } | null
}

/** Le parseur, écrit une fois et réutilisé par les cas de rupture — sinon la
 *  preuve qu'elle sait dire NON porterait sur un autre code que celui qui garde. */
function parse(markdown: string): Parsed {
  const headings: string[] = []
  const rows = new Map<string, { status: string; proof: string }>()
  let claimed: Parsed['claimed'] = null

  for (const line of markdown.split('\n')) {
    const heading = /^###\s+(D\d+)\./.exec(line)
    if (heading) {
      headings.push(heading[1] as string)
      continue
    }
    // `| D7       | **TRANCHÉE**    | Chapeau 31/07 : … |`
    const row = /^\|\s*(D\d+)\s*\|\s*\*{0,2}([A-ZÀ-Ÿ]+)\*{0,2}\s*\|\s*(.*?)\s*\|\s*$/.exec(line)
    if (row) {
      rows.set(row[1] as string, { status: row[2] as string, proof: row[3] as string })
      continue
    }
    // `**Compte : 22 décisions — 11 TRANCHÉE, 4 SUPPLANTÉE, 1 PARTIELLE, 6 OUVERTE.**`
    const total = /\*\*Compte\s*:\s*(\d+)\s+décisions\s*—\s*([^*]+)\*\*/.exec(line)
    if (total) {
      const byStatus = new Map<string, number>()
      for (const part of (total[2] as string).matchAll(/(\d+)\s+([A-ZÀ-Ÿ]+)/g)) {
        byStatus.set(part[2] as string, Number(part[1]))
      }
      claimed = { total: Number(total[1]), byStatus }
    }
  }
  return { headings, rows, claimed }
}

/** Ce que la garde reproche à un fichier. Une liste vide = rien à redire. */
function violations(parsed: Parsed): string[] {
  const problems: string[] = []
  const { headings, rows, claimed } = parsed

  for (const id of headings) {
    if (!rows.has(id)) problems.push(`${id} n'a aucune ligne de statut`)
  }
  for (const id of rows.keys()) {
    if (!headings.includes(id)) problems.push(`${id} a une ligne de statut mais n'existe pas`)
  }
  for (const [id, { status, proof }] of rows) {
    if (!(STATUSES as readonly string[]).includes(status)) {
      problems.push(`${id} porte un statut hors vocabulaire : « ${status} »`)
    }
    // Une décision qui reste ouverte sans raison écrite est le point de départ
    // d'un « rien à reprendre ».
    if ((status === 'OUVERTE' || status === 'PARTIELLE') && proof.trim().length < 20) {
      problems.push(`${id} est ${status} sans justification écrite`)
    }
  }
  if (!claimed) {
    problems.push('aucun total écrit — un compte qui ne se relit pas ne se vérifie pas')
    return problems
  }
  if (claimed.total !== headings.length) {
    problems.push(`le total écrit (${claimed.total}) ne vaut pas le compte réel (${headings.length})`)
  }
  const measured = new Map<string, number>()
  for (const { status } of rows.values()) {
    measured.set(status, (measured.get(status) ?? 0) + 1)
  }
  for (const status of new Set([...claimed.byStatus.keys(), ...measured.keys()])) {
    const written = claimed.byStatus.get(status) ?? 0
    const real = measured.get(status) ?? 0
    if (written !== real) problems.push(`${status} : ${written} écrit, ${real} mesuré`)
  }
  return problems
}

describe('GA-116 — le statut d’une décision est lisible par machine', () => {
  const markdown = existsSync(DECISIONS_FILE) ? readFileSync(DECISIONS_FILE, 'utf8') : ''
  const parsed = parse(markdown)

  it('lit un corpus non vide', () => {
    // Sans cette assertion, un chemin cassé rendrait la garde verte sur zéro
    // décision — et elle ne garderait plus rien. C'est le défaut n°1 du dépôt.
    expect(existsSync(DECISIONS_FILE)).toBe(true)
    expect(parsed.headings.length).toBeGreaterThanOrEqual(20)
    expect(parsed.rows.size).toBeGreaterThanOrEqual(20)
    expect(parsed.claimed).not.toBeNull()
  })

  it('chaque décision a un statut, chaque statut une décision, et le total se recalcule', () => {
    expect(violations(parsed)).toEqual([])
  })

  it('des décisions sont réellement OUVERTES — le fichier ne se déclare pas clos', () => {
    // Le contraire de la preuve n°5. Si un jour ce compte tombe à zéro, ce sera
    // parce que Louis a tranché — jamais parce que personne n'a regardé.
    const open = [...parsed.rows.values()].filter(row => row.status === 'OUVERTE' || row.status === 'PARTIELLE')
    expect(open.length).toBeGreaterThan(0)
  })

  describe('elle sait dire NON', () => {
    // Les quatre ruptures sont jouées contre le VRAI parseur, sur le VRAI
    // fichier amputé — pas sur un document jouet qui prouverait autre chose.
    it('une décision sans ligne de statut', () => {
      const broken = markdown.replace(/^\| D13 .*$/m, '')
      expect(violations(parse(broken)).join(' ')).toContain("D13 n'a aucune ligne de statut")
    })

    it('une ligne de statut sans décision', () => {
      const broken = markdown.replace(
        /^\*\*Compte : /m,
        '| D99 | **OUVERTE** | une décision qui n’existe pas dans le fichier |\n**Compte : ',
      )
      expect(violations(parse(broken)).join(' ')).toContain('D99')
    })

    it('un statut hors vocabulaire', () => {
      const broken = markdown.replace(/^(\| D13\s*\|\s*)\*\*[A-ZÀ-Ÿ]+\*\*/m, '$1**PEUTÊTRE**')
      // La substitution doit avoir eu lieu : un remplacement muet ferait passer
      // ce test au vert en ne cassant rien — c'est exactement ce qu'il traque.
      expect(broken).not.toBe(markdown)
      expect(violations(parse(broken)).join(' ')).toContain('hors vocabulaire')
    })

    it('un total qui ne se recalcule pas', () => {
      const broken = markdown.replace(/(\*\*Compte : \d+ décisions — )\d+( TRANCHÉE)/, '$199$2')
      expect(broken).not.toBe(markdown)
      expect(violations(parse(broken)).join(' ')).toContain('TRANCHÉE : 99 écrit')
    })
  })
})
