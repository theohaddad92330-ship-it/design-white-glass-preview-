import { returnedRows } from '../../database/returned-rows'

/**
 * Ce que les comptes de démonstration semés depuis un CSV (Société Générale,
 * Groupe BPCE) ont EN COMMUN : les écritures SQL des ESN présentes et des
 * annotations de pistes, et la lecture des étiquettes de technologie.
 *
 * Extrait de `sg-csv-complement.ts` le 30/09/2026 (dossier Groupe BPCE) : deux
 * comptes, une seule copie des requêtes (GA-26 — une règle vit à un endroit).
 * Le comportement SG est INCHANGÉ (`sg-csv-complement.spec.ts` le tient).
 */

/** `manager.query` de TypeORM, ou tout exécuteur de même forme. */
export type CsvSqlExecutor = (sql: string, params?: unknown[]) => Promise<unknown[]>

export type CsvPartner = {
  name: string
  profiles: number
  rank: 'unknown'
  relationship: 'unknown'
  partnerSource: 'analysis'
  certainty: 'forte' | 'moyenne' | 'faible'
  scope: string
  note: string
  detectedAt: string
}

export type CsvNeedAnnotation = {
  kind: string
  label: string | null
  csvId: string
  source: string
  perimeter: string
  role: string
  detail: string
}

export function countOf(result: unknown[]): number {
  const first = result[0] as { count?: number | string } | undefined
  return Number(first?.count ?? 0) || 0
}

/**
 * `account_partners` : une ligne par ESN, bornée au compte ET à son espace.
 * ⚠️ Une correction humaine gagne toujours : `ON CONFLICT DO NOTHING`.
 */
export async function writeCsvPartners(
  exec: CsvSqlExecutor,
  workspaceId: string,
  accountId: string,
  partners: readonly CsvPartner[],
  dryRun: boolean,
): Promise<number> {
  let written = 0
  for (const partner of partners) {
    if (dryRun) {
      const found = await exec(
        `SELECT count(*)::int AS count FROM accounts a
          WHERE a.id = $2 AND a.workspace_id = $1
            AND NOT EXISTS (SELECT 1 FROM account_partners p WHERE p.account_id = a.id AND lower(p.name) = lower($3))`,
        [workspaceId, accountId, partner.name],
      )
      written += countOf(found)
      continue
    }
    const inserted = await exec(
      `INSERT INTO account_partners
         (workspace_id, account_id, name, rank, relationship, note, source, placements, certainty, scope, detected_at, declared_by)
       SELECT a.workspace_id, a.id, $3, $4, $5, $6, $7, 0, $8, $9, $10, NULL
         FROM accounts a
        WHERE a.id = $2 AND workspace_id = $1
       ON CONFLICT (account_id, lower(name)) DO NOTHING
       RETURNING id`,
      [
        workspaceId,
        accountId,
        partner.name,
        partner.rank,
        partner.relationship,
        partner.note,
        partner.partnerSource,
        partner.certainty,
        partner.scope,
        partner.detectedAt,
      ],
    )
    written += inserted.length
  }
  return written
}

/**
 * Les pistes « Besoin détecté » (`opportunities`) : source, périmètre, rôle et
 * détail, reliés à leur ligne du CSV. `COALESCE` : un champ déjà rempli (par
 * l'utilisateur, par le pipeline) n'est jamais écrasé.
 */
export async function writeCsvNeedAnnotations(
  exec: CsvSqlExecutor,
  workspaceId: string,
  accountId: string,
  annotations: readonly CsvNeedAnnotation[],
  dryRun: boolean,
): Promise<number> {
  let written = 0
  // Une piste « à compléter » = une ligne dont AU MOINS un des quatre champs
  // lus par l'écran est encore vide.
  const incomplete = `(o.source IS NULL OR o.offer IS NULL OR o.detail IS NULL
                       OR NULLIF(btrim(COALESCE(o.btmmp ->> 'management', '')), '') IS NULL)`
  const target = `o.account_id = a.id AND a.id = $1 AND a.workspace_id = $2 AND o.kind = $3
                  AND ($4::text IS NULL OR md5(o.label) = md5($4::text))`

  for (const annotation of annotations) {
    if (dryRun) {
      const found = await exec(
        `SELECT count(*)::int AS count FROM opportunities o, accounts a WHERE ${target} AND ${incomplete}`,
        [accountId, workspaceId, annotation.kind, annotation.label],
      )
      written += countOf(found)
      continue
    }
    // UPDATE … RETURNING rend `[lignes, nombre]` sous TypeORM : `returnedRows` lit les lignes.
    const updated = returnedRows<{ id: string }>(
      await exec(
        `UPDATE opportunities o
          SET source = COALESCE(o.source, $5),
              offer = COALESCE(o.offer, $6),
              detail = COALESCE(o.detail, $7),
              btmmp = CASE
                        WHEN NULLIF(btrim(COALESCE(o.btmmp ->> 'management', '')), '') IS NULL
                          THEN COALESCE(o.btmmp, '{}'::jsonb) || jsonb_build_object('management', $8::text)
                        ELSE o.btmmp
                      END
         FROM accounts a
        WHERE ${target} AND ${incomplete}
        RETURNING o.id`,
        [
          accountId,
          workspaceId,
          annotation.kind,
          annotation.label,
          annotation.source,
          annotation.perimeter,
          annotation.detail,
          annotation.role,
        ],
      ),
    )
    written += updated.length
  }
  return written
}

/**
 * La colonne `technologies` d'un contact est une liste d'étiquettes séparées
 * par « / » — mais certaines étiquettes CONTIENNENT déjà « / » (« Product /
 * Agilité », « DevOps / CI-CD »). Elles sont reconnues d'abord, entières.
 * Les étiquettes qui ne sont pas une technologie (métier, posture, fonction)
 * ne font pas de ligne dans une carte « Technologies ».
 */
const COMPOUND_TAGS = [
  'UX / UI / Design',
  'Product / Agilité',
  'Marketing / contenu',
  'Formation / coaching',
  'Change / transformation',
  'Réseau / infra',
  'Finance / contrôle',
  'C/C++ / embarqué',
  'BI / dataviz',
  'IA / ML',
  'Gestion de projet / PMO',
  'DevOps / CI-CD',
  'SEO / growth',
  'RH / recrutement',
]

const NON_TECHNOLOGY_TAGS = new Set([
  'Product / Agilité',
  'Marketing / contenu',
  'Formation / coaching',
  'Change / transformation',
  'Finance / contrôle',
  'Gestion de projet / PMO',
  'SEO / growth',
  'RH / recrutement',
  'UX / UI / Design',
])

/**
 * #3503 — LES FRAGMENTS D'UNE ÉTIQUETTE DE MÉTIER. Le relevé pondéré des
 * compétences (BPCE, bloc 15) arrive DÉJÀ coupé au « / » : « Marketing (29) |
 * contenu (29) ». Chaque morceau d'une étiquette de `NON_TECHNOLOGY_TAGS`
 * (plus les fonctions métier qui n'en ont pas) ne nomme pas une technologie :
 * il ne fait aucune pastille dans « Technologies en place ».
 */
const NON_TECHNOLOGY_EXTRA = ['Vidéo', 'motion', 'Juridique', 'conformité', 'Supply chain', 'achats']
const NON_TECHNOLOGY_FRAGMENTS = new Set(
  [...[...NON_TECHNOLOGY_TAGS].flatMap(tag => tag.split(' / ')), ...NON_TECHNOLOGY_EXTRA].map(part =>
    part.toLowerCase(),
  ),
)

export function isNonTechnologyLabel(name: string): boolean {
  const label = name.trim()
  return NON_TECHNOLOGY_TAGS.has(label) || NON_TECHNOLOGY_FRAGMENTS.has(label.toLowerCase())
}

export function technologyTags(value: string): string[] {
  let rest = value
  const tags: string[] = []
  for (const compound of COMPOUND_TAGS) {
    if (rest.includes(compound)) {
      tags.push(compound)
      rest = rest.split(compound).join(' / ')
    }
  }
  for (const part of rest.split(' / ')) {
    const tag = part.trim()
    if (tag) tags.push(tag)
  }
  return [...new Set(tags)]
}
