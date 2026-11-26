import { canonicalSkill, normaliseSkillText, splitSkillEntries } from './skill-referential'

/**
 * Une compétence à semer dans le référentiel typé, depuis une liste libre.
 *
 * `rawLabel` n'est gardé que s'il DIFFÈRE du canonique : recopier
 * « kubernetes » à côté de « kubernetes » affiche deux fois la même chose.
 */
interface SkillSeedRow {
  skill: string
  rawLabel: string | null
}

/**
 * La liste libre d'une fiche → des compétences typées.
 *
 * Ce module existe à cause d'un défaut trouvé en recette : la fiche a DEUX
 * champs de compétences — la liste libre (`consultants.stack`, qui alimente le
 * matching) et le référentiel typé (`consultant_skills`, avec niveau et source,
 * qui alimente la colonne du vivier, l'onglet « Compétences », le segment
 * « profils rares » et la file d'enrichissement des alias). Les deux portaient
 * le même nom à l'écran, et seul le second était lu : un recruteur qui tapait
 * « Kubernetes, Terraform, Go » à la création voyait ensuite « Aucune
 * compétence saisie » sur la fiche qu'il venait de remplir.
 *
 * Le semis est délibérément ADDITIF et n'écrase rien (`ON CONFLICT DO NOTHING`
 * chez l'appelant) : une compétence déjà vue en mission ou confirmée en
 * entretien ne doit jamais retomber à « déclaré », et retirer un mot de la
 * liste libre ne doit jamais supprimer une compétence prouvée.
 */
export function skillSeedRows(stack: readonly string[] | null | undefined): SkillSeedRow[] {
  if (!stack || stack.length === 0) return []
  const seen = new Set<string>()
  const rows: SkillSeedRow[] = []
  // KEVIN-FIX K.2 — « java spring vue » sème trois compétences, pas une seule étiquette.
  for (const entry of splitSkillEntries(stack)) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    // Une entrée non reconnue du référentiel n'est PAS jetée : « Snowflake » ou
    // le nom d'un outil interne sont de vraies compétences, et ne semer que ce
    // que le référentiel connaît déjà l'empêcherait de grandir. Elle est
    // simplement normalisée pour que « Node.JS » et « node.js » n'ouvrent pas
    // deux lignes.
    const skill = canonicalSkill(trimmed) ?? normaliseSkillText(trimmed)
    if (!skill || seen.has(skill)) continue
    seen.add(skill)
    // Le libellé d'origine est gardé dès qu'il DIFFÈRE du canonique, casse
    // comprise : une compétence hors référentiel a pour canonique sa propre
    // forme normalisée, et s'en contenter afficherait « outil maison zephyr »
    // là où le recruteur avait écrit « Outil maison Zephyr ».
    rows.push({ skill, rawLabel: trimmed === skill ? null : trimmed })
  }
  return rows
}

function canonicalOf(label: string): string {
  return canonicalSkill(label) ?? normaliseSkillText(label)
}

/**
 * #3812.1 — le miroir inverse : la liste libre (`consultants.stack`) après
 * l'ajout d'une compétence faite dans l'onglet « Compétences ». `null` = rien à
 * écrire (déjà là, sous ce libellé ou un autre : « K8s » = « Kubernetes »).
 */
export function stackWithSkill(stack: readonly string[] | null | undefined, label: string): string[] | null {
  const trimmed = label.trim()
  const canonical = canonicalOf(trimmed)
  if (!canonical) return null
  // KEVIN-FIX K.2 — la liste est lue DÉCOUPÉE : « java spring vue » + « Vue » ne s'additionnent pas en doublon.
  const current = splitSkillEntries(stack)
  const unchanged = current.length === (stack ?? []).length
  if (current.some(entry => canonicalOf(entry) === canonical)) return unchanged ? null : current
  return [...current, trimmed]
}

/** #3812.1 — la liste libre après le retrait d'une compétence canonique ;
 *  `null` = rien à retirer. */
export function stackWithoutSkill(stack: readonly string[] | null | undefined, canonical: string): string[] | null {
  const current = (stack ?? []).filter((entry): entry is string => typeof entry === 'string')
  const kept = current.filter(entry => canonicalOf(entry) !== canonical)
  return kept.length === current.length ? null : kept
}

/**
 * #3812.1 — la liste libre est la saisie du formulaire : un mot RETIRÉ du
 * formulaire retire la compétence `declared` du référentiel (sinon la fiche, le
 * vivier et Laura ne liraient plus la même liste). Seule la source `declared`
 * est visée : une compétence vue en mission, confirmée en entretien ou lue dans
 * le CV ne disparaît jamais parce qu'un mot a quitté la liste libre.
 */
export async function pruneDeclaredSkills(
  executor: SkillSeedExecutor,
  input: { consultantId: string; stack: string[] | null },
): Promise<void> {
  const kept = skillSeedRows(input.stack).map(row => row.skill)
  await executor.query(
    `DELETE FROM consultant_skills
      WHERE consultant_id = $1
        AND source = 'declared'
        AND skill <> ALL($2::text[])`,
    [input.consultantId, kept],
  )
}

/** Le minimum dont le semis a besoin — un `EntityManager` en porte plus. */
interface SkillSeedExecutor {
  query(sql: string, parameters?: unknown[]): Promise<unknown>
}

/**
 * Écrit le semis. Un seul endroit porte le SQL : deux chemins d'écriture
 * (la fiche saisie à la main, la revue de CV) sèment la même chose, et les
 * laisser diverger produirait deux référentiels aux règles différentes.
 *
 * Rend le nombre de compétences PROPOSÉES (pas celles réellement insérées :
 * `ON CONFLICT DO NOTHING` en écarte silencieusement, et c'est voulu).
 */
export async function seedTypedSkills(
  executor: SkillSeedExecutor,
  input: { consultantId: string; workspaceId: string | null; stack: string[] | null; source: 'declared' | 'cv' },
): Promise<number> {
  const rows = skillSeedRows(input.stack)
  if (rows.length === 0) return 0
  await executor.query(
    `INSERT INTO consultant_skills (consultant_id, workspace_id, skill, raw_label, level, source)
     SELECT $1, $2, seed.skill, NULLIF(seed.raw_label, ''), 'inconnu', $5
       FROM unnest($3::text[], $4::text[]) AS seed(skill, raw_label)
      ON CONFLICT (consultant_id, skill) DO NOTHING`,
    [
      input.consultantId,
      input.workspaceId,
      rows.map(row => row.skill),
      rows.map(row => row.rawLabel ?? ''),
      input.source,
    ],
  )
  return rows.length
}

/**
 * Les termes d'une liste libre que le référentiel NE reconnaît pas.
 *
 * Ce sont eux qui alimentent la file d'enrichissement des alias : tant qu'un
 * terme n'y est pas tranché, les profils qui le portent ne remontent sur
 * aucune recherche — et personne ne sait lesquels. La file n'était nourrie que
 * par la saisie d'une compétence une par une ; un CV relu ou une fiche remplie
 * n'y déposaient rien.
 *
 * Rend le libellé ÉCRIT, pas sa forme normalisée : c'est un humain qui tranche,
 * et « Outil maison Zephyr » se reconnaît mieux que « outil maison zephyr ».
 */
export function unknownSkillTerms(stack: readonly string[] | null | undefined): string[] {
  if (!stack || stack.length === 0) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of stack) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (!trimmed) continue
    const normalised = normaliseSkillText(trimmed)
    if (!normalised || seen.has(normalised)) continue
    seen.add(normalised)
    if (canonicalSkill(trimmed)) continue
    out.push(trimmed)
  }
  return out
}

/** Une ligne du référentiel telle que la synchronisation de la liste la lit. */
interface SkillLabelRow {
  skill: string
  raw_label: string | null
  created_at?: string | Date | null
}

/**
 * #5016.1 — la liste libre (`consultants.stack`) complétée par le référentiel
 * typé (`consultant_skills`), qui FAIT FOI. `null` = rien à écrire.
 *
 * ADDITIF : un mot déjà dans la liste reste (même absent du référentiel — c'est
 * peut-être une correction humaine que le semis n'a pas encore rejointe), un
 * libellé du référentiel absent de la liste est ajouté, sous le libellé écrit
 * par le recruteur quand il existe (`raw_label`), sinon sous sa forme canonique.
 */
export function mergeStackWithSkills(
  stack: readonly string[] | null | undefined,
  skills: readonly SkillLabelRow[],
  editedByHumanAt: string | Date | null = null,
): string[] | null {
  const current = splitSkillEntries(stack ?? [])
  const known = new Set(current.map(canonicalOf))
  const added: string[] = []
  const editedAt = editedByHumanAt ? new Date(editedByHumanAt).getTime() : null
  for (const row of skills) {
    if (known.has(row.skill)) continue
    // #5016.3 — correction humaine gagne : ce que la personne a retiré de la liste
    // ne revient pas ; seule une compétence ENTRÉE APRÈS sa correction s'y ajoute.
    if (editedAt !== null && !(row.created_at && new Date(row.created_at).getTime() > editedAt)) continue
    known.add(row.skill)
    added.push(row.raw_label?.trim() || row.skill)
  }
  // `unchanged` : la liste stockée est déjà sous sa forme découpée.
  if (added.length === 0) return null
  return [...current, ...added]
}

interface StackAndSkills {
  stack: string[] | null
  stack_edited_by_human_at?: string | Date | null
  skills: SkillLabelRow[] | null
}

/**
 * #5016.1 — à CHAQUE écriture (création, modification, commit de CV), la liste
 * libre se resynchronise sur le référentiel : fiche, onglet « Compétences »,
 * vivier et matching lisent alors la même chose. Rend la nouvelle liste, ou
 * `null` quand rien n'a changé. Filtrée par espace, comme toute écriture.
 */
export async function syncStackFromSkills(
  executor: SkillSeedExecutor,
  input: { consultantId: string; workspaceId: string | null },
): Promise<string[] | null> {
  const result = (await executor.query(
    `SELECT c.stack, c.stack_edited_by_human_at,
            COALESCE(
              (SELECT json_agg(json_build_object('skill', s.skill, 'raw_label', s.raw_label, 'created_at', s.created_at) ORDER BY s.created_at)
                 FROM consultant_skills s
                WHERE s.consultant_id = c.id AND s.workspace_id IS NOT DISTINCT FROM c.workspace_id),
              '[]'::json) AS skills
       FROM consultants c
      WHERE c.id = $1 AND c.workspace_id IS NOT DISTINCT FROM $2`,
    [input.consultantId, input.workspaceId],
  )) as StackAndSkills[] | undefined
  const row = result?.[0]
  if (!row) return null
  const next = mergeStackWithSkills(row.stack, row.skills ?? [], row.stack_edited_by_human_at ?? null)
  if (!next) return null
  await executor.query(`UPDATE consultants SET stack = $1 WHERE id = $2 AND workspace_id IS NOT DISTINCT FROM $3`, [
    next,
    input.consultantId,
    input.workspaceId,
  ])
  return next
}

/**
 * #5016.2 — rattrapage CIBLÉ des seules fiches dont les deux sources divergent,
 * d'UN espace (jamais deux). SIMULATION par défaut : `apply` doit être posé
 * explicitement. N'écrit qu'en AJOUT (compétence semée `declared` pour un mot
 * de la liste que le référentiel ignore ; mot ajouté à la liste pour une
 * compétence du référentiel) — rien n'est retiré, donc une correction humaine
 * n'est jamais écrasée ; relancé, il ne trouve plus rien (idempotent).
 */
export async function runStackSyncCatchUp(
  executor: SkillSeedExecutor,
  input: { workspaceId: string; apply: boolean },
): Promise<{ examined: number; divergent: number; written: number }> {
  const rows = ((await executor.query(
    `SELECT c.id, c.stack, c.stack_edited_by_human_at,
            COALESCE(
              (SELECT json_agg(json_build_object('skill', s.skill, 'raw_label', s.raw_label, 'created_at', s.created_at) ORDER BY s.created_at)
                 FROM consultant_skills s
                WHERE s.consultant_id = c.id AND s.workspace_id = c.workspace_id),
              '[]'::json) AS skills
       FROM consultants c
      WHERE c.workspace_id = $1`,
    [input.workspaceId],
  )) ?? []) as Array<StackAndSkills & { id: string }>
  let divergent = 0
  let written = 0
  for (const row of rows) {
    // #5016.3 — correction humaine gagne : une fiche dont la stack a été corrigée à la main est sautée.
    if (row.stack_edited_by_human_at) continue
    const skills = row.skills ?? []
    const nextStack = mergeStackWithSkills(row.stack, skills)
    const referenced = new Set(skills.map(entry => entry.skill))
    const orphanWords = skillSeedRows(row.stack)
      .filter(seed => !referenced.has(seed.skill))
      .map(seed => seed.rawLabel ?? seed.skill)
    if (!nextStack && orphanWords.length === 0) continue
    divergent += 1
    if (!input.apply) continue
    if (orphanWords.length > 0) {
      await seedTypedSkills(executor, {
        consultantId: row.id,
        workspaceId: input.workspaceId,
        stack: orphanWords,
        source: 'declared',
      })
    }
    if (nextStack) {
      await executor.query(`UPDATE consultants SET stack = $1 WHERE id = $2 AND workspace_id = $3`, [
        nextStack,
        row.id,
        input.workspaceId,
      ])
    }
    written += 1
  }
  return { examined: rows.length, divergent, written }
}
