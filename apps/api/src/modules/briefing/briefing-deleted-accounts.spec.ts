import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #4009 — LE BRIEF NE CITE JAMAIS UNE FICHE SUPPRIMÉE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Une fiche supprimée est un soft delete (`status = 'deleted'`,
 * `accounts.service.ts`) : la ligne reste, avec ses signaux, ses missions et
 * ses runs. Décision Louis du 11/10 (#3670) : elle ne ressort JAMAIS — on peut
 * seulement nommer sa suppression. La recherche de Laura posait déjà la borne ;
 * le brief, lui, citait encore « ALTRAN TECHNOLOGIES » par `signal_history`.
 *
 * Le défaut vivait à dix endroits du même fichier. Cette garde relit
 * `briefing.service.ts` et exige la borne sur CHAQUE lecture de `accounts` :
 * une lecture ajoutée demain sans elle fait rougir la CI en la nommant.
 *
 * Ce que la garde prouve, comme toute garde de ce dépôt :
 *  - elle LIT quelque chose (un plancher de lectures trouvées) ;
 *  - elle sait dire NON (une lecture sans borne, plantée, la fait rougir) ;
 *  - elle n'attrape pas ce qu'elle ne vise pas (l'exemption est nommée, avec
 *    sa raison, et doit exister — une exemption orpheline fait rougir).
 */

// #4009.1 — la garde lit AUSSI les services dont les phrases remontent dans le brief : #4010 n'avait
// gardé que briefing.service.ts, et « Le maillon faible » (service voisin) citait encore Altran.
const SERVICES = [
  join(__dirname, 'briefing.service.ts'),
  join(__dirname, '..', 'weakest-link-diagnosis', 'weakest-link-diagnosis.service.ts'),
]
const SERVICE = SERVICES[0]

/** Une lecture de la table `accounts` : SQL brut ou repository TypeORM. */
const ACCOUNT_READ = /\b(?:FROM|JOIN)\s+accounts\b|this\.accounts\.find\(/

/** La borne : la constante partagée, ou le littéral dans un SQL brut. */
const DELETED_BOUND = /UNCITED_ACCOUNT_STATUSES|'deleted'/

/**
 * Les lectures qui ne CITENT aucun compte. Chacune avec sa raison ; une ligne
 * qui disparaît du fichier fait rougir le dernier test (exemption orpheline).
 */
const EXEMPT: ReadonlyArray<{ fragment: string; reason: string }> = [
  {
    fragment: 'OR EXISTS (SELECT 1 FROM accounts a WHERE a.id = ${alias}.account_id',
    reason:
      "portée d'attribution d'une ligne (tâche, relance) : ne rend aucun nom, et la borner ici " +
      'masquerait la ligne en portée « own » mais pas en portée « workspace »',
  },
]

/**
 * Le texte d'une lecture, de sa première ligne à sa fin : la fermeture du
 * gabarit SQL (backtick) ou de l'appel `find({ … })`. Plafonné : une lecture
 * de plus de 40 lignes n'existe pas ici, et un plafond évite d'aller chercher
 * la borne dans la lecture suivante.
 */
function statementAt(lines: string[], start: number): string {
  const first = lines[start]
  const isFind = first.includes('this.accounts.find(')
  const out = [first]
  // Un SQL d'une seule ligne (ouvert et fermé sur la même ligne) s'arrête là.
  if (!isFind && (first.match(/`/g) ?? []).length >= 2) return first
  for (let i = start + 1; i < Math.min(lines.length, start + 40); i++) {
    out.push(lines[i])
    if (isFind ? /^\s*\}\)/.test(lines[i]) : lines[i].includes('`')) break
  }
  return out.join('\n')
}

function unboundedReads(source: string): string[] {
  const lines = source.split('\n')
  const offenders: string[] = []
  lines.forEach((line, index) => {
    if (!ACCOUNT_READ.test(line)) return
    if (EXEMPT.some(exempt => line.includes(exempt.fragment))) return
    if (!DELETED_BOUND.test(statementAt(lines, index)))
      offenders.push(`briefing.service.ts:${index + 1}: ${line.trim()}`)
  })
  return offenders
}

function accountReads(source: string): number {
  return source.split('\n').filter(line => ACCOUNT_READ.test(line)).length
}

describe('#4009 — le brief ne cite jamais une fiche supprimée', () => {
  const source = readFileSync(SERVICE, 'utf8')

  it('LIT le service : au moins dix lectures de comptes trouvées', () => {
    expect(accountReads(source)).toBeGreaterThanOrEqual(10)
  })

  it('chaque lecture de `accounts` porte la borne `deleted`', () => {
    expect(unboundedReads(source)).toEqual([])
  })

  it('#4009.1 — le diagnostic « maillon faible » (service voisin) est gardé lui aussi', () => {
    const weakest = readFileSync(SERVICES[1], 'utf8')
    expect(accountReads(weakest)).toBeGreaterThanOrEqual(1)
    expect(unboundedReads(weakest)).toEqual([])
    // sait dire NON : la borne retirée, la garde nomme la lecture.
    const unbound = weakest.replace(/status: Not\(In\(\[\.\.\.UNCITED_ACCOUNT_STATUSES\]\)\),/, '')
    expect(unboundedReads(unbound)).toHaveLength(1)
  })

  it('sait dire NON : une lecture SQL sans borne, plantée, est nommée', () => {
    const planted = `${source}\nconst x = \`SELECT id, company_name FROM accounts WHERE workspace_id = $1\`\n`
    expect(unboundedReads(planted)).toEqual([expect.stringContaining('FROM accounts WHERE workspace_id')])
  })

  it('sait dire NON : un `find` sans borne, planté, est nommé', () => {
    const planted = `${source}\n    const rows = await this.accounts.find({\n      where: { workspace_id: id },\n    })\n`
    expect(unboundedReads(planted)).toEqual([expect.stringContaining('this.accounts.find(')])
  })

  it("chaque exemption vise une lecture qui existe encore (pas d'exemption orpheline)", () => {
    for (const exempt of EXEMPT) expect(source).toContain(exempt.fragment)
  })
})
