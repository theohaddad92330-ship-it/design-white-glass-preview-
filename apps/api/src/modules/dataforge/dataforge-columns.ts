/**
 * Le REGISTRE des colonnes du CSV canonique DATAFORGE — où va chacune, et
 * pourquoi celles qui n'entrent pas n'entrent pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QU'IL CORRIGE (mesuré le 29/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Le parseur gardait trois préfixes — `account__`, `domain__`, `bellum_` — la
 * liste de la V9, qui n'avait aucune autre colonne. La V10 en ajoute quatre :
 * `domain_taxonomy__` (7 colonnes), `domain_gap__` (4), `talent_supply__` (4),
 * `tjm__` (3). **Dix-huit colonnes sur 158 tombaient**, et le pire n'était pas
 * qu'elles tombent : c'est qu'elles ne comptaient nulle part. Un filtre
 * silencieux se lit « il n'y avait rien ».
 *
 * Le remède n'est pas d'allonger la liste de préfixes — la V11 la périmerait de
 * la même façon. C'est de rendre le filtre TOTAL : toute colonne est classée, et
 * ce que le registre ne connaît pas ressort en `unknown` au lieu de disparaître.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PRIOR ≠ EVIDENCE (GA-37)
 * ─────────────────────────────────────────────────────────────────────────────
 * Les 18 colonnes sont TOUTES constantes par domaine : mesuré 66/66 domaines à
 * valeur unique, et 0/1 195 comptes à valeur unique. Ce sont des a priori de
 * DOMAINE — « ce qu'on sait du marché du PMO » — jamais une preuve sur un
 * compte. Elles entrent donc dans `domain_payload` (brut, interne, jamais un
 * champ typé qu'un écran lirait comme un fait), et rien de ce fichier ne les
 * fait passer dans la branche `evidence` du service.
 */

/** Comment un motif d'écart se PROUVE — sinon c'est une affirmation dans un commentaire. */
type DataforgeDiscardCheck =
  | { readonly kind: 'always-empty' }
  | { readonly kind: 'duplicate-of'; readonly column: string }

/** Où atterrit une colonne, et — si elle n'atterrit nulle part — pourquoi. */
interface DataforgeColumnFate {
  /**
   * `account` / `domain` : le payload qui la reçoit ; `discarded` : écartée avec
   * sa raison ; `unknown` : inconnue du registre — à REGARDER, jamais à jeter.
   */
  readonly destination: 'account' | 'domain' | 'discarded' | 'unknown'
  /** Vrai quand la colonne est déjà portée en champ TYPÉ : le payload ne la duplique pas. */
  readonly typed: boolean
  readonly reason?: string
  readonly check?: DataforgeDiscardCheck
}

/**
 * Colonnes déjà portées en champ typé du COMPTE — le payload garde le reste,
 * sans doublon.
 */
const CONSUMED_ACCOUNT_COLUMNS: ReadonlySet<string> = new Set([
  'account__siren_siret',
  'account__website',
  'account__group_name',
])

/** Idem côté DOMAINE. */
const CONSUMED_DOMAIN_COLUMNS: ReadonlySet<string> = new Set([
  'domain__sector_prior_demand_score',
  'domain__sector_prior_externalization_score',
  'domain__public_activity_signal_score',
  'domain__demand_intensity_score',
  'domain__externalizable_demand_score',
  'domain__internal_competition_score',
  'domain__direct_access_score',
  'domain__mediated_access_score',
  'domain__commercial_opportunity_score',
  'domain__data_confidence_score',
  'domain__evidence_item_count',
  'domain__strongest_evidence_strength',
  'domain__median_observed_tjm',
  'domain__buyer_personas',
  'domain__likely_contract_models',
  'domain__qualification_or_barriers',
  'domain__recommended_procurement_route',
])

/**
 * Les colonnes ÉCARTÉES, chacune avec sa raison ET la façon de la contrôler.
 *
 * Cinq sur les dix-huit — les treize autres entrent dans `domain_payload`.
 * Chaque raison a été MESURÉE sur le fichier canonique (78 870 lignes) le
 * 29/08/2026 ; l'audit la re-contrôle à chaque ingestion et compte les
 * contradictions, pour qu'un pack V11 qui changerait de contenu ne passe pas
 * inaperçu derrière une phrase écrite un jour d'août.
 */
export const DATAFORGE_DISCARDED_COLUMNS: Readonly<
  Record<string, { readonly reason: string; readonly check: DataforgeDiscardCheck }>
> = {
  domain_taxonomy__buyers: {
    reason:
      'Doublon verbatim de `domain__buyer_personas`, déjà portée en champ typé : identique sur 78 870/78 870 lignes (mesuré le 29/08/2026). L’ingérer une seconde fois créerait deux définitions du même fait, qui divergeraient au premier pack corrigé d’un seul côté.',
    check: { kind: 'duplicate-of', column: 'domain__buyer_personas' },
  },
  domain_taxonomy__contracts: {
    reason:
      'Doublon verbatim de `domain__likely_contract_models`, déjà portée en champ typé : identique sur 78 870/78 870 lignes (mesuré le 29/08/2026).',
    check: { kind: 'duplicate-of', column: 'domain__likely_contract_models' },
  },
  domain_taxonomy__barriers: {
    reason:
      'Doublon verbatim de `domain__qualification_or_barriers`, déjà portée en champ typé : identique sur 78 870/78 870 lignes (mesuré le 29/08/2026).',
    check: { kind: 'duplicate-of', column: 'domain__qualification_or_barriers' },
  },
  domain_taxonomy__cross_sell_logic: {
    reason:
      'Vide sur 78 870/78 870 lignes du pack V10 (mesuré le 29/08/2026) : la colonne existe, son contenu n’a jamais été produit. On la COMPTE à zéro plutôt que de l’ignorer — « personne ne l’a remplie » et « personne ne l’a regardée » ne se ressemblent que dans un journal muet.',
    check: { kind: 'always-empty' },
  },
  domain_gap__candidate_supply_rows: {
    reason:
      'Doublon verbatim de `talent_supply__candidate_profile_rows`, qui est ingérée : identique sur les 66 domaines (mesuré le 29/08/2026). Compter la même source deux fois la ferait passer pour deux sources.',
    check: { kind: 'duplicate-of', column: 'talent_supply__candidate_profile_rows' },
  },
}

/**
 * Les familles de colonnes du pack, PAR PRÉFIXE, et le payload qui les reçoit.
 *
 * Les quatre familles V10 (`domain_taxonomy__`, `domain_gap__`,
 * `talent_supply__`, `tjm__`) sont des priors de DOMAINE, mesurés constants sur
 * les 1 195 comptes : elles rejoignent le payload domaine, où elles restent
 * brutes et internes.
 *
 * ⚠️ L'ordre compte : `domain_taxonomy__profiles` ne commence PAS par
 * `domain__` (deux caractères `_` contre `_t`), mais la lecture serait fragile
 * si un jour une famille devenait le préfixe d'une autre — les préfixes les plus
 * longs sont donc testés d'abord.
 */
const COLUMN_FAMILIES: readonly { readonly prefix: string; readonly destination: 'account' | 'domain' }[] = [
  { prefix: 'domain_taxonomy__', destination: 'domain' },
  { prefix: 'domain_gap__', destination: 'domain' },
  { prefix: 'talent_supply__', destination: 'domain' },
  { prefix: 'account__', destination: 'account' },
  { prefix: 'domain__', destination: 'domain' },
  { prefix: 'bellum_', destination: 'domain' },
  { prefix: 'tjm__', destination: 'domain' },
]

/** Le sort d'UNE colonne. Aucune ne « tombe » : au pire elle est `unknown`. */
export function classifyDataforgeColumn(column: string): DataforgeColumnFate {
  const discarded = DATAFORGE_DISCARDED_COLUMNS[column]
  if (discarded) {
    return { destination: 'discarded', typed: false, reason: discarded.reason, check: discarded.check }
  }
  if (CONSUMED_ACCOUNT_COLUMNS.has(column)) return { destination: 'account', typed: true }
  if (CONSUMED_DOMAIN_COLUMNS.has(column)) return { destination: 'domain', typed: true }
  const family = [...COLUMN_FAMILIES]
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find(entry => column.startsWith(entry.prefix))
  if (family) return { destination: family.destination, typed: false }
  return { destination: 'unknown', typed: false }
}

interface DataforgeHeaderReport {
  /** Colonnes déjà portées en champ typé (elles ne sont pas dupliquées en payload). */
  readonly typed: string[]
  readonly accountPayload: string[]
  readonly domainPayload: string[]
  readonly discarded: { readonly column: string; readonly reason: string }[]
  /** Ce que le registre ne connaît pas — la seule chose qui rendait la V10 invisible. */
  readonly unknown: string[]
}

/** Le sort de TOUT l'en-tête : quatre seaux, aucun reste. */
export function classifyDataforgeHeader(header: readonly string[]): DataforgeHeaderReport {
  const report: DataforgeHeaderReport = {
    typed: [],
    accountPayload: [],
    domainPayload: [],
    discarded: [],
    unknown: [],
  }
  for (const column of header) {
    const fate = classifyDataforgeColumn(column)
    if (fate.destination === 'discarded') {
      report.discarded.push({ column, reason: fate.reason ?? '' })
    } else if (fate.destination === 'unknown') {
      report.unknown.push(column)
    } else if (fate.typed) {
      report.typed.push(column)
    } else if (fate.destination === 'account') {
      report.accountPayload.push(column)
    } else {
      report.domainPayload.push(column)
    }
  }
  return report
}

interface DataforgeColumnAuditReport {
  readonly rows: number
  /**
   * Une ligne par colonne écartée : combien de cellules portaient VRAIMENT
   * quelque chose, et combien de fois la raison de l'écart s'est révélée fausse.
   */
  readonly discarded: {
    readonly column: string
    readonly reason: string
    readonly nonEmptyRows: number
    readonly contradictions: number
  }[]
  readonly unknown: { readonly column: string; readonly nonEmptyRows: number }[]
}

/**
 * L'audit d'une ingestion : il OBSERVE les lignes et rend les chiffres.
 *
 * Deux comptes, et ils ne disent pas la même chose :
 *  · `nonEmptyRows` — ce qu'on a écarté portait-il de la donnée ? (« zéro »
 *    prouvé vaut mieux que « zéro » supposé) ;
 *  · `contradictions` — la RAISON de l'écart tient-elle encore ? Une colonne
 *    déclarée vide qui se remplit, un doublon qui diverge, une colonne de
 *    référence absente de l'en-tête : chacun se voit ici, jamais en silence.
 */
export function createColumnAudit(header: readonly string[]): {
  observe(row: Readonly<Record<string, string>>): void
  report(): DataforgeColumnAuditReport
} {
  const present = new Set(header)
  const discarded = header
    .filter(column => DATAFORGE_DISCARDED_COLUMNS[column] !== undefined)
    .map(column => {
      const entry = DATAFORGE_DISCARDED_COLUMNS[column]
      if (!entry) throw new Error(`colonne écartée introuvable au registre : ${column}`)
      return { column, entry, nonEmptyRows: 0, contradictions: 0 }
    })
  const unknown = header
    .filter(column => classifyDataforgeColumn(column).destination === 'unknown')
    .map(column => ({ column, nonEmptyRows: 0 }))
  let rows = 0

  return {
    observe(row): void {
      rows += 1
      for (const tracked of discarded) {
        const value = (row[tracked.column] ?? '').trim()
        if (value.length > 0) tracked.nonEmptyRows += 1
        if (tracked.entry.check.kind === 'always-empty') {
          if (value.length > 0) tracked.contradictions += 1
          continue
        }
        // Doublon : la colonne de référence DOIT être là. Absente, on ne peut
        // rien conclure — et « on ne peut rien conclure » n'est pas « c'est un
        // doublon ». Chaque ligne compte alors comme contradiction.
        const reference = tracked.entry.check.column
        if (!present.has(reference)) {
          tracked.contradictions += 1
          continue
        }
        if (value !== (row[reference] ?? '').trim()) tracked.contradictions += 1
      }
      for (const tracked of unknown) {
        if ((row[tracked.column] ?? '').trim().length > 0) tracked.nonEmptyRows += 1
      }
    },
    report(): DataforgeColumnAuditReport {
      return {
        rows,
        discarded: discarded.map(tracked => ({
          column: tracked.column,
          reason: tracked.entry.reason,
          nonEmptyRows: tracked.nonEmptyRows,
          contradictions: tracked.contradictions,
        })),
        unknown: unknown.map(tracked => ({ column: tracked.column, nonEmptyRows: tracked.nonEmptyRows })),
      }
    },
  }
}
