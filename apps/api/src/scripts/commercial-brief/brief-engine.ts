import type { CommercialBrief } from '@bellum/contracts'

import { BLANK_LABEL, readCockpit } from './cockpit'
import type { AccountPlan, Fields, PersonRole, SheetPlan, SupplementPlan } from './plan-types'
import { buildTable, type Table } from './table'
import { neutralizeOneSide, neutralizeProspectEsn } from './text-rules'
import type { GridWorkbook } from './xlsx-grid'

/**
 * Moteur de conversion : un classeur (grilles de texte) + le plan du compte →
 * un objet `CommercialBrief` (non validé : la validation zod et les contrôles
 * métier sont faits par l'appelant, qui échoue sur toute violation).
 */

type Person = NonNullable<CommercialBrief['people']>[number]
type Section = CommercialBrief['sections'][number]
type Cell = Section['rows'][number][string]

type CoverageLine = { sheet: string; field: string; rows: number; note?: string }
export type Conversion = {
  brief: CommercialBrief
  coverage: CoverageLine[]
  /** Valeurs écartées par les plans, par raison. */
  skipped: Record<string, number>
  /** Anomalies de la SOURCE, gardées telles quelles et signalées (cellules illisibles, libellés vides…). */
  anomalies: string[]
}

const ascii = (value: string): string => value.normalize('NFD').replace(/[̀-ͯ]/g, '')
const norm = (value: string | undefined): string =>
  ascii(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
const slug = (value: string): string => norm(value).replace(/ /g, '-')
const columnKey = (header: string): string => {
  if (header.trim() === '#') return 'numero'
  return norm(header) === 'entite' ? 'entity' : norm(header).replace(/ /g, '_')
}
const nameKey = (name: string): string => norm(name).split(' ').filter(Boolean).sort().join(' ')

const RANK: Record<PersonRole, number> = { contact: 0, manager: 1, decision_maker: 2, external: -1, alumni: -1 }

const NUMERIC = /^-?\d+(\.\d+)?$/
const PHONE_COLUMN = /tele?phone|mobile|fixe|numero|phone/

/** Le second classeur d'un compte (voir `SupplementPlan`) et le plan qui le classe. */
type SupplementInput = { grid: GridWorkbook; plan: SupplementPlan }

export const convertWorkbook = (
  grid: GridWorkbook,
  plan: AccountPlan,
  supplements: readonly SupplementInput[] = [],
): Conversion => {
  if ((plan.supplements?.length ?? 0) !== supplements.length) {
    throw new Error(
      `[${plan.slug}] supplément(s) : ${plan.supplements?.length ?? 0} déclaré(s) au plan, ${supplements.length} classeur(s) fourni(s)`,
    )
  }
  const coverage: CoverageLine[] = []
  const skipped: Record<string, number> = {}
  const anomalies: string[] = []
  const cov = (sheet: string, field: string, rows: number, note?: string): void => {
    coverage.push({ sheet, field, rows, ...(note ? { note } : {}) })
  }

  // ── nettoyage du texte : « OneSide » neutralisé + réécritures déclarées ──
  const usedRewrites = new Set<number>()
  const clean = (sheet: string, text: string): string => {
    let out = neutralizeProspectEsn(neutralizeOneSide(text))
    plan.rewrites.forEach((rewrite, i) => {
      if (rewrite.sheet === sheet && out.includes(rewrite.find)) {
        out = out.split(rewrite.find).join(rewrite.replace)
        usedRewrites.add(i)
      }
    })
    return out.trim()
  }

  // ── onglets du classeur ⇄ onglets du plan : égalité stricte ──
  const planSheets = new Map(plan.sheets.map(s => [s.sheet, s]))
  const workbookSheets = grid.sheets.map(s => s.name)
  const unmapped = workbookSheets.filter(name => !planSheets.has(name))
  if (unmapped.length) throw new Error(`[${plan.slug}] onglet(s) non mappé(s) : ${unmapped.join(', ')}`)
  const missing = [...planSheets.keys()].filter(name => !workbookSheets.includes(name))
  if (missing.length) throw new Error(`[${plan.slug}] onglet(s) du plan absent(s) du classeur : ${missing.join(', ')}`)

  const fields: Fields = {
    phone: (value, label) => {
      if (value === undefined) return undefined
      const digits = value.replace(/\D/g, '')
      // un numéro : chiffres et séparateurs seulement, ≥ 6 chiffres — ni une date (« 2021-10-20 00:00:00 »),
      // ni un libellé (« Faux numéro », « pas attribué »), ni du texte collé (profil LinkedIn)
      if (/^\d{4}-\d{2}-\d{2}/.test(value) || digits.length < 6 || !/^[\d\s.+()/\-;,|]+$/.test(value)) {
        skipped[`${label} : valeur qui n'est pas un numéro`] =
          (skipped[`${label} : valeur qui n'est pas un numéro`] ?? 0) + 1
        return undefined
      }
      return value
    },
    email: (...values) => {
      const kept: string[] = []
      const address = /[A-Za-z0-9._%+'’-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
      const count = (reason: string): void => {
        skipped[reason] = (skipped[reason] ?? 0) + 1
      }
      for (const value of values) {
        if (!value?.trim()) continue
        const found = value.match(address) ?? []
        for (const mail of found) if (!kept.includes(mail)) kept.push(mail)
        // Des cellules E-MAIL portent l'adresse SUIVIE d'une note de notre prospection (« mail envoyé ==> à relancer ») :
        // on garde l'adresse, jamais la note (notre propre performance).
        if (found.length === 0) count('e-mail : valeur sans adresse')
        else if (value.replace(address, '').replace(/[\s|;,]+/g, '') !== '')
          count("e-mail : note de suivi collée à l'adresse, retirée")
      }
      return kept.length ? kept.join(' | ') : undefined
    },
    name: value => value?.replace(/\s+/g, ' ').trim() || undefined,
    first: (...values) => values.find(v => v !== undefined && v.trim() !== ''),
    join: (separator, ...values) => {
      const kept = values.filter((v): v is string => v !== undefined && v.trim() !== '' && v.trim() !== '—')
      return kept.length ? kept.join(separator) : undefined
    },
    link: (row, header) => {
      const target = row.link(header)
      if (target) return target
      const text = row.get(header)
      if (text && /^https?:\/\//.test(text)) return text
      if (text) skipped['LinkedIn : texte sans adresse'] = (skipped['LinkedIn : texte sans adresse'] ?? 0) + 1
      return undefined
    },
    skip: reason => {
      skipped[reason] = (skipped[reason] ?? 0) + 1
    },
  }

  // ── tables ──
  const tables = new Map<string, Table>()
  for (const sheet of grid.sheets) {
    if (sheet.badCells > 0) {
      anomalies.push(
        `[${sheet.name}] ${sheet.badCells} cellule(s) « [object Object] » (export source cassé) : traitées comme vides`,
      )
    }
    if (planSheets.get(sheet.name)?.cockpit || planSheets.get(sheet.name)?.skip) continue
    tables.set(sheet.name, buildTable(sheet, clean))
  }

  const exitedAliases = new Map(plan.exitedAliases.aliases.map(a => [norm(a), a]))
  const usedAliases = new Map<string, string>() // norm → première graphie rencontrée
  const matchAlias = (value: string | undefined): boolean => {
    const key = norm(value)
    if (!key || !exitedAliases.has(key)) return false
    if (!usedAliases.has(key)) usedAliases.set(key, value as string)
    return true
  }

  // ── COCKPIT ──
  const cockpitSheet = grid.sheets.find(s => planSheets.get(s.name)?.cockpit)
  if (!cockpitSheet) throw new Error(`[${plan.slug}] aucun onglet COCKPIT dans le plan`)
  const cockpit = readCockpit(cockpitSheet, clean)
  if (!cockpit.title.toUpperCase().startsWith(plan.titlePrefix)) {
    throw new Error(`[${plan.slug}] titre du COCKPIT « ${cockpit.title} » ≠ « ${plan.titlePrefix} … »`)
  }
  cov('COCKPIT', 'kpis', cockpit.kpis.length)
  cov('COCKPIT', 'what_i_know', cockpit.knowledge.length)
  cov('COCKPIT', 'charts', cockpit.charts.length, `${cockpit.charts.reduce((n, c) => n + c.items.length, 0)} points`)
  if (cockpit.blankChartLabels > 0) {
    anomalies.push(
      `[COCKPIT] ${cockpit.blankChartLabels} point(s) de graphique sans libellé dans le classeur : rendus « ${BLANK_LABEL} »`,
    )
  }

  // Tuiles écartées par le plan (nommées, avec raison) : la valeur attendue est vérifiée, pour qu'un classeur
  // corrigé ne soit pas amputé à tort.
  const kpis = cockpit.kpis.filter(kpi => {
    const rule = plan.droppedKpis?.find(r => r.label === kpi.label && r.value === kpi.value)
    if (rule) anomalies.push(`[COCKPIT] tuile « ${kpi.label} » (${kpi.value}) écartée : ${rule.reason}`)
    return !rule
  })
  for (const rule of plan.layer ? [] : (plan.droppedKpis ?? [])) {
    if (!cockpit.kpis.some(k => k.label === rule.label && k.value === rule.value)) {
      throw new Error(`[${plan.slug}] tuile à écarter « ${rule.label} » (${rule.value}) absente du COCKPIT`)
    }
  }

  // ── sorties ──
  const sections: Section[] = []
  const entities: CommercialBrief['entities'] = []
  const sites: CommercialBrief['sites'] = []
  const prices: CommercialBrief['prices'] = []
  const esn: CommercialBrief['esn'] = []
  const guardrails: CommercialBrief['guardrails'] = []
  const notes: Record<string, Cell>[] = []
  const people: { person: Person; role: PersonRole; claimed: Set<string> }[] = []

  const droppedOf = (sheet: SheetPlan): Set<string> => new Set(Object.keys(sheet.dropped ?? {}))

  const buildSection = (
    table: Table,
    key: string,
    dropped: Set<string>,
    extra?: { motifs: Map<number, string> },
  ): Section => {
    const headers = table.headers.filter(h => !dropped.has(h))
    const columns = headers.map(h => ({ key: columnKey(h), label: h }))
    if (new Set(columns.map(c => c.key)).size !== columns.length)
      throw new Error(`[${table.sheet}] clés de colonne en double`)
    const rows: Record<string, Cell>[] = []
    const numeric = new Set(
      headers.filter(h => {
        if (PHONE_COLUMN.test(norm(h))) return false
        const values = table.rows.map(r => r.get(h)).filter((v): v is string => v !== undefined)
        return values.length > 0 && values.every(v => NUMERIC.test(v))
      }),
    )
    for (const row of table.rows) {
      const record: Record<string, Cell> = {}
      for (const header of headers) {
        const raw = row.get(header)
        if (raw === undefined) continue
        // une colonne d'adresses ne garde que les adresses (jamais la note de prospection collée derrière)
        const value = norm(header).startsWith('e mail')
          ? fields.email(raw)
          : ['mobile', 'fixe', 'telephone'].includes(norm(header))
            ? fields.phone(raw, header)
            : raw
        if (value === undefined) continue
        record[columnKey(header)] = numeric.has(header) ? Number(value) : value
      }
      const motif = extra?.motifs.get(row.n)
      if (motif) record.motif = motif
      if (Object.keys(record).length === 0) continue
      const entityHeader = headers.find(h => norm(h) === 'entite')
      const departmentHeader = headers.find(h => norm(h) === 'departement')
      const entityHit = entityHeader ? matchAlias(row.get(entityHeader)) : false
      const departmentHit = departmentHeader ? matchAlias(row.get(departmentHeader)) : false
      if (entityHit || departmentHit) record.exited = true
      rows.push(record)
    }
    const motifColumn = extra ? [{ key: 'motif', label: 'MOTIF' }] : []
    return { key, title: table.title, columns: [...columns, ...motifColumn], rows }
  }

  const restSection = (table: Table, rest: Map<number, string>, label: string): void => {
    if (rest.size === 0) return
    const section = buildSection(
      { ...table, rows: table.rows.filter(r => rest.has(r.n)) },
      `${slug(table.sheet)}-non-retenus`,
      new Set(),
      { motifs: rest },
    )
    section.title = `${table.title} — lignes non retenues comme ${label}`
    sections.push(section)
  }

  const sectionKey = (sheet: string, requested?: string): string => requested ?? slug(sheet)

  // ── fiche + siège (une COUCHE n'en lit pas : le siège est celui du compte de base) ──
  const ficheTable = [...planSheets.values()].find(s => s.fiche)
  let hqReliability: string | undefined
  if (!plan.layer) {
    if (!ficheTable) throw new Error(`[${plan.slug}] aucun onglet FICHE COMPTE dans le plan`)
    const fiche = tables.get(ficheTable.sheet) as Table
    const hqRow = fiche.rows.find(r => norm(r.get('CHAMP')) === norm(plan.headquarters.champ))
    if (!hqRow) throw new Error(`[${plan.slug}] ligne « ${plan.headquarters.champ} » absente de ${fiche.sheet}`)
    const hqText = hqRow.get('VALEUR') ?? ''
    for (const part of [plan.headquarters.label, plan.headquarters.city, plan.headquarters.address].filter(
      (p): p is string => !!p,
    )) {
      if (!hqText.includes(part)) throw new Error(`[${plan.slug}] siège : « ${part} » absent de « ${hqText} »`)
    }
    hqReliability = hqRow.get('FIABILITÉ')
  }

  // Pays des sites : la France, sauf périmètre suisse (ABB Suisse, décision Louis 04/10/2026).
  const country = plan.scope === 'suisse' ? 'CH' : 'FR'

  // ── passe 1 : tout sauf les personnes ──
  for (const sheetPlan of plan.sheets) {
    if (sheetPlan.skip) {
      cov(sheetPlan.sheet, '(non lu)', 0, sheetPlan.skip)
      continue
    }
    if (sheetPlan.cockpit) continue
    const table = tables.get(sheetPlan.sheet) as Table
    const dropped = droppedOf(sheetPlan)
    for (const header of dropped) {
      if (!table.headers.includes(header))
        throw new Error(`[${table.sheet}] colonne retirée « ${header} » absente du classeur`)
    }
    const produced = { section: false }

    if (sheetPlan.fiche || sheetPlan.section) {
      const section = buildSection(table, sectionKey(table.sheet, sheetPlan.section?.key), dropped)
      sections.push(section)
      produced.section = true
      cov(table.sheet, `sections[${section.key}]`, section.rows.length)
    }

    if (sheetPlan.sites) {
      const rest = new Map<number, string>()
      let count = 0
      for (const row of table.rows) {
        const draft = sheetPlan.sites.map(row, fields)
        if ('rest' in draft) {
          rest.set(row.n, draft.rest)
          continue
        }
        sites.push({ ...clip(draft), country } as CommercialBrief['sites'][number])
        count += 1
      }
      restSection(table, rest, 'sites')
      cov(table.sheet, 'sites', count)
      if (rest.size)
        cov(
          table.sheet,
          `sections[${slug(table.sheet)}-non-retenus]`,
          rest.size,
          [...new Set(rest.values())].join(' ; '),
        )
    }

    if (sheetPlan.entities) {
      const rest = new Map<number, string>()
      let count = 0
      for (const row of table.rows) {
        const draft = sheetPlan.entities.map(row, fields)
        if ('rest' in draft) {
          rest.set(row.n, draft.rest)
          continue
        }
        entities.push(clip(draft) as CommercialBrief['entities'][number])
        count += 1
      }
      restSection(table, rest, 'entités')
      cov(table.sheet, 'entities', count)
      if (rest.size)
        cov(
          table.sheet,
          `sections[${slug(table.sheet)}-non-retenus]`,
          rest.size,
          [...new Set(rest.values())].join(' ; '),
        )
    }

    if (sheetPlan.esn) {
      // Une ligne qui n'est pas une ESN (partenaire tiers, hors France) : `{ rest }` — gardée dans la section de
      // l'onglet si elle existe, sinon dans `<onglet>-non-retenus` avec son motif.
      const rest = new Map<number, string>()
      let count = 0
      for (const row of table.rows) {
        const draft = sheetPlan.esn.map(row, fields)
        if ('rest' in draft) {
          rest.set(row.n, draft.rest)
          continue
        }
        esn.push(clip(draft) as CommercialBrief['esn'][number])
        count += 1
      }
      if (!produced.section) restSection(table, rest, 'ESN')
      cov(table.sheet, 'esn', count)
      if (rest.size)
        cov(
          table.sheet,
          produced.section
            ? 'lignes non ESN (gardées dans la section de l’onglet)'
            : `sections[${slug(table.sheet)}-non-retenus]`,
          rest.size,
          [...new Set(rest.values())].join(' ; '),
        )
    }

    if (sheetPlan.prices) {
      let count = 0
      for (const row of table.rows) {
        const mapped = sheetPlan.prices.map(row, fields)
        // Une ligne peut porter plusieurs prix (grille métier × séniorité d'ADEO) : un prix par cellule chiffrée.
        const drafts = mapped === null ? [] : Array.isArray(mapped) ? mapped : [mapped]
        for (const draft of drafts) {
          prices.push(clip(draft) as CommercialBrief['prices'][number])
          count += 1
        }
      }
      cov(
        table.sheet,
        'prices',
        count,
        count > table.rows.length
          ? `${count} prix lus sur ${table.rows.length} ligne(s) (une ligne porte plusieurs prix)`
          : `${table.rows.length - count} ligne(s) sans prix, gardées en section`,
      )
    }

    if (sheetPlan.guardrails) {
      for (const row of table.rows) {
        const point = row.get('POINT')
        const detail = row.get("CE QU'IL FAUT SAVOIR")
        if (!point || !detail) throw new Error(`[${table.sheet}] garde-fou incomplet ligne ${row.n}`)
        guardrails.push({ point, detail })
      }
      cov(table.sheet, 'guardrails', table.rows.length)
    }

    if (sheetPlan.guardrailRows) {
      let count = 0
      for (const row of table.rows) {
        const guardrail = sheetPlan.guardrailRows.map(row)
        if (!guardrail) continue
        guardrails.push(guardrail)
        count += 1
      }
      cov(table.sheet, 'guardrails', count, 'règles retenues comme garde-fous ; l’onglet entier reste en section')
    }

    // titre / sous-titre / notes : jamais perdus (la section porte déjà le titre)
    if (!produced.section) notes.push({ onglet: table.sheet, type: 'titre', texte: table.title })
    if (table.subtitle) notes.push({ onglet: table.sheet, type: 'sous-titre', texte: table.subtitle })
    for (const note of table.notes) notes.push({ onglet: table.sheet, type: 'note', texte: note })
  }

  // ── passe 2 : les personnes (onglets `add` d'abord, puis `merge`) ──
  const peopleSheets = plan.sheets.filter(s => s.people)
  const ordered = [
    ...peopleSheets.filter(s => s.people?.mode === 'add'),
    ...peopleSheets.filter(s => s.people?.mode === 'merge'),
  ]
  for (const sheetPlan of ordered) {
    const peoplePlan = sheetPlan.people as NonNullable<SheetPlan['people']>
    const table = tables.get(sheetPlan.sheet) as Table
    const dropped = droppedOf(sheetPlan)
    const rest = new Map<number, string>()
    let added = 0
    let merged = 0
    for (const row of table.rows) {
      const draft = peoplePlan.map(row, fields, table)
      if ('rest' in draft) {
        rest.set(row.n, draft.rest)
        continue
      }
      const role = typeof peoplePlan.role === 'function' ? peoplePlan.role(row) : peoplePlan.role
      const person = clip(draft) as Person
      if (!person.name) throw new Error(`[${table.sheet}] ligne ${row.n} : personne sans nom`)
      // Fusion : entre rôles « de hiérarchie » (contact < manager < décideur) comme avant ; depuis 04/10/2026 aussi entre
      // deux onglets de MÊME rôle externe / ancien (une même personne vue dans « Contacts » et dans « Profils en poste »).
      const mergeable = (candidate: (typeof people)[number]): boolean =>
        (RANK[role] >= 0 && RANK[candidate.role] >= 0) || role === candidate.role
      const candidates =
        peoplePlan.mode === 'merge'
          ? people.filter(
              c => mergeable(c) && !c.claimed.has(table.sheet) && nameKey(c.person.name) === nameKey(person.name),
            )
          : []
      // Deux personnes de même nom dans l'onglet de base (Rachid KHIARI ×2) : on rapproche d'abord par e-mail, puis par
      // département, puis par entité — jamais « la première venue ».
      const score = (c: (typeof people)[number]): number =>
        (person.email && c.person.email && norm(c.person.email) === norm(person.email) ? 4 : 0) +
        (person.department && c.person.department && norm(c.person.department) === norm(person.department) ? 2 : 0) +
        (person.entity && c.person.entity && norm(c.person.entity) === norm(person.entity) ? 1 : 0)
      const target = candidates.reduce<(typeof people)[number] | undefined>(
        (best, c) => (best === undefined || score(c) > score(best) ? c : best),
        undefined,
      )
      if (target) {
        for (const [key, value] of Object.entries(person)) {
          if (key === 'name') continue
          const current = (target.person as Record<string, unknown>)[key]
          if (current === undefined || current === '') (target.person as Record<string, unknown>)[key] = value
        }
        if (RANK[role] > RANK[target.role]) target.role = role
        target.claimed.add(table.sheet)
        merged += 1
      } else {
        people.push({ person, role, claimed: new Set([table.sheet]) })
        added += 1
      }
    }
    if (peoplePlan.also) {
      const section = buildSection(table, sectionKey(table.sheet, peoplePlan.also.key), dropped)
      sections.push(section)
      cov(table.sheet, `sections[${section.key}]`, section.rows.length, 'onglet entier gardé (colonnes hors contrat)')
    } else {
      restSection(table, rest, 'personnes')
    }
    const roleLabel = typeof peoplePlan.role === 'function' ? 'role par ligne' : `role=${peoplePlan.role}`
    cov(
      table.sheet,
      `people (${roleLabel})`,
      added + merged,
      `${added} ajoutée(s), ${merged} fusionnée(s) dans une personne déjà listée` +
        (rest.size
          ? `, ${rest.size} ligne(s) non personnes → ${peoplePlan.also ? `section ${sectionKey(table.sheet, peoplePlan.also.key)}` : `section ${slug(table.sheet)}-non-retenus`}`
          : ''),
    )
  }

  // ── périmètre sorti : une personne dont l'entité OU le département est un alias sorti est marquée `exited` ──
  // (calculé APRÈS les fusions : un champ copié d'une autre ligne ne doit jamais importer son `exited`)
  for (const { person } of people) {
    const byEntity = matchAlias(person.entity)
    const byDepartment = matchAlias(person.department)
    if (byEntity || byDepartment) {
      person.exited = true
      if (!person.entity && byDepartment) person.entity = person.department
    }
  }

  // ── annotations du CEO glissées dans des noms / fonctions : gardées, signalées ──
  const annotated = people.filter(({ person }) =>
    /[àa] appeler|appeler |[àa] supprimer|kmj/i.test(`${person.name} ${person.function ?? ''}`),
  )
  if (annotated.length) {
    anomalies.push(
      `${annotated.length} personne(s) dont le nom ou la fonction est une annotation du classeur (« à appeler », « KMJ : », « A supprimer ? »), gardées telles quelles : ` +
        annotated
          .slice(0, 6)
          .map(({ person }) => `« ${person.name} »`)
          .join(', '),
    )
  }

  // ── contrôle : chaque colonne lue ou retirée avec sa raison ──
  for (const sheetPlan of plan.sheets) {
    if (sheetPlan.cockpit || sheetPlan.skip) continue
    const table = tables.get(sheetPlan.sheet) as Table
    const dropped = droppedOf(sheetPlan)
    for (const header of table.headers) {
      const readIt = table.touched.has(header)
      if (dropped.has(header) && readIt)
        throw new Error(`[${table.sheet}] colonne « ${header} » déclarée retirée mais lue`)
      if (!dropped.has(header) && !readIt)
        throw new Error(`[${table.sheet}] colonne « ${header} » ni lue ni déclarée retirée`)
    }
    for (const [header, reason] of Object.entries(sheetPlan.dropped ?? {}))
      cov(table.sheet, `colonne retirée « ${header} »`, table.filled.get(header) ?? 0, reason)
  }
  plan.rewrites.forEach((rewrite, i) => {
    if (!usedRewrites.has(i))
      throw new Error(
        `[${plan.slug}] réécriture inutilisée (source changée ?) : [${rewrite.sheet}] « ${rewrite.find} »`,
      )
  })

  // ── entités sorties ──
  const derived = plan.derivedEntities?.(tables) ?? []
  for (const draft of derived) entities.push(clip(draft) as CommercialBrief['entities'][number])
  if (derived.length) cov('(dérivées)', 'entities', derived.length, derived.map(d => d.name).join(', '))
  for (const [key, spelling] of usedAliases) {
    if (entities.some(e => norm(e.name) === key)) continue
    entities.push({
      name: spelling,
      nature: plan.exitedAliases.nature,
      status: 'exited',
      note: plan.exitedAliases.note,
    })
  }
  if (usedAliases.size)
    cov(
      '(dérivées)',
      'entities (sorties, par graphie de la source)',
      usedAliases.size,
      [...usedAliases.values()].join(', '),
    )

  // ── sites lus dans une ligne de la FICHE COMPTE (comptes sans onglet de sites : Naval Group Indret) ──
  const derivedSites = plan.derivedSites?.(tables) ?? []
  for (const draft of derivedSites) sites.push({ ...clip(draft), country } as CommercialBrief['sites'][number])
  if (derivedSites.length) cov('(dérivés)', 'sites', derivedSites.length, derivedSites.map(d => d.name).join(', '))

  // ── siège ──
  const hqSites = sites.filter(s => s.kind === 'headquarters')
  if (hqSites.length === 0 && !plan.layer) {
    sites.unshift({
      name: plan.headquarters.label,
      city: plan.headquarters.city,
      country,
      kind: 'headquarters',
      ...(hqReliability ? { reliability: hqReliability } : {}),
    })
    cov((ficheTable as SheetPlan).sheet, 'sites (siège dérivé de la ligne Siège)', 1)
  }

  // ── prix lus dans un texte ──
  if (plan.derivedPrices) {
    const text = (sheet: string): string => {
      const table = tables.get(sheet)
      if (!table) throw new Error(`[${plan.slug}] onglet « ${sheet} » absent pour les prix dérivés`)
      return table.rows.flatMap(r => table.headers.map(h => r.get(h) ?? '')).join('\n')
    }
    const derivedPrices = plan.derivedPrices(text)
    for (const draft of derivedPrices) prices.push(clip(draft) as CommercialBrief['prices'][number])
    cov('(dérivés)', 'prices', derivedPrices.length, 'lus dans le texte du classeur, phrases vérifiées')
  }

  // ── second classeur du compte (démo clients 04/10/2026) : chaque onglet est CLASSÉ, sinon échec ──
  const SECOND = 'second classeur'
  const rowSignature = (table: Table, row: Table['rows'][number]): string =>
    [...table.headers]
      .sort((a, b) => norm(a).localeCompare(norm(b)))
      .map(h => (row.get(h) ?? '').trim())
      .join('\u0001')
  const baseTableOfSection = (sectionKeyWanted: string): Table => {
    const owner = plan.sheets.find(
      s =>
        (s.section || s.fiche || s.people?.also) &&
        sectionKey(s.sheet, s.section?.key ?? s.people?.also?.key) === sectionKeyWanted,
    )
    const table = owner ? tables.get(owner.sheet) : undefined
    if (!table)
      throw new Error(`[${plan.slug}] aucune section de base « ${sectionKeyWanted} » pour les lignes manquantes`)
    return table
  }
  supplements.forEach(({ grid: other, plan: sp }) => {
    const label = `${SECOND} « ${sp.source} »`
    const classed = new Set<string>([
      ...(sp.cockpit ? ['COCKPIT'] : []),
      ...(sp.sections ?? []).map(s => s.sheet),
      ...(sp.missingRows ?? []).map(s => s.sheet),
      ...Object.keys(sp.identical ?? {}),
    ])
    const names = other.sheets.map(s => s.name)
    const unclassed = names.filter(n => !classed.has(n))
    if (unclassed.length) throw new Error(`[${plan.slug}] ${label} : onglet(s) non classé(s) : ${unclassed.join(', ')}`)
    const absent = [...classed].filter(n => !names.includes(n))
    if (absent.length)
      throw new Error(`[${plan.slug}] ${label} : onglet(s) du plan absent(s) du classeur : ${absent.join(', ')}`)
    for (const s of other.sheets) {
      if (s.badCells > 0)
        anomalies.push(`[${s.name} — ${SECOND}] ${s.badCells} cellule(s) « [object Object] » traitées comme vides`)
    }
    const tableOf = (name: string): Table =>
      buildTable(other.sheets.find(s => s.name === name) as (typeof other.sheets)[number], clean)
    /** Titre / sous-titre / notes d'un onglet du second classeur : jamais perdus ; ceux que la base porte déjà à l'identique sont omis. */
    const noteOf = (table: Table, baseTable?: Table): void => {
      const known = new Set(baseTable ? [baseTable.title, baseTable.subtitle, ...baseTable.notes] : [])
      const onglet = `${table.sheet} (${SECOND})`
      if (baseTable && !known.has(table.title)) notes.push({ onglet, type: 'titre', texte: table.title })
      if (table.subtitle && !known.has(table.subtitle))
        notes.push({ onglet, type: 'sous-titre', texte: table.subtitle })
      for (const note of table.notes) if (!known.has(note)) notes.push({ onglet, type: 'note', texte: note })
    }

    if (sp.cockpit) {
      const sheetGrid = other.sheets.find(s => s.name === 'COCKPIT') as (typeof other.sheets)[number]
      const second = readCockpit(sheetGrid, clean)
      const cockpitRows: Record<string, Cell>[] = [
        ...second.kpis.map(k => ({
          bloc: 'Indicateur',
          libelle: k.label,
          valeur: k.value,
          ...(k.caption ? { lecture: k.caption } : {}),
        })),
        ...second.knowledge.map(k => ({ bloc: 'Rubrique', libelle: k.rubric, valeur: k.known, lecture: k.meaning })),
        ...second.charts.flatMap(c =>
          c.items.map(item => ({ bloc: `Graphique — ${c.title}`, libelle: item.label, valeur: item.value })),
        ),
      ]
      sections.push({
        key: sp.cockpit.key,
        title: sp.cockpit.title,
        columns: [
          { key: 'bloc', label: 'BLOC' },
          { key: 'libelle', label: 'LIBELLÉ' },
          { key: 'valeur', label: 'VALEUR' },
          { key: 'lecture', label: 'CE QUE ÇA VEUT DIRE' },
        ],
        rows: cockpitRows,
      })
      notes.push({ onglet: `COCKPIT (${SECOND})`, type: 'titre', texte: second.title })
      notes.push({ onglet: `COCKPIT (${SECOND})`, type: 'sous-titre', texte: second.subtitle })
      cov(
        `COCKPIT (${SECOND})`,
        `sections[${sp.cockpit.key}]`,
        cockpitRows.length,
        `${second.kpis.length} indicateurs, ${second.knowledge.length} rubriques, ${second.charts.length} graphiques (les KPI du compte restent ceux du premier classeur : 6 au plus)`,
      )
    }

    for (const wanted of sp.sections ?? []) {
      const table = tableOf(wanted.sheet)
      const section = buildSection(table, wanted.key, new Set())
      if (wanted.title) section.title = wanted.title
      sections.push(section)
      noteOf(table)
      cov(
        `${wanted.sheet} (${SECOND})`,
        `sections[${wanted.key}]`,
        section.rows.length,
        'onglet entier gardé, à clé propre',
      )
    }

    for (const wanted of sp.missingRows ?? []) {
      const table = tableOf(wanted.sheet)
      const baseTable = baseTableOfSection(wanted.into)
      const baseSection = sections.find(s => s.key === wanted.into) as Section
      const known = new Set(baseTable.rows.map(r => rowSignature(baseTable, r)))
      const missingRows = table.rows.filter(r => !known.has(rowSignature(table, r)))
      const extra = buildSection({ ...table, rows: missingRows }, wanted.into, new Set())
      if (extra.columns.map(c => c.key).join() !== baseSection.columns.map(c => c.key).join())
        throw new Error(
          `[${plan.slug}] ${label} : « ${wanted.sheet} » n'a pas les colonnes de la section « ${wanted.into} »`,
        )
      baseSection.rows.push(...extra.rows)
      noteOf(table, baseTable)
      cov(
        `${wanted.sheet} (${SECOND})`,
        `sections[${wanted.into}] (lignes absentes du premier classeur)`,
        extra.rows.length,
        `${table.rows.length - missingRows.length} ligne(s) déjà présente(s) à l'identique`,
      )
    }

    for (const [otherSheet, baseSheet] of Object.entries(sp.identical ?? {})) {
      const table = tableOf(otherSheet)
      const baseTable = tables.get(baseSheet)
      if (!baseTable) throw new Error(`[${plan.slug}] ${label} : onglet de base « ${baseSheet} » absent`)
      const mine = new Set(table.rows.map(r => rowSignature(table, r)))
      const theirs = new Set(baseTable.rows.map(r => rowSignature(baseTable, r)))
      const onlyHere = [...mine].filter(s => !theirs.has(s)).length
      const onlyThere = [...theirs].filter(s => !mine.has(s)).length
      if (onlyHere + onlyThere > 0 || norm(table.headers.join()) !== norm(baseTable.headers.join())) {
        throw new Error(
          `[${plan.slug}] ${label} : « ${otherSheet} » déclaré identique à « ${baseSheet} » mais ${onlyHere} ligne(s) en plus, ${onlyThere} en moins`,
        )
      }
      noteOf(table, baseTable)
      cov(`${otherSheet} (${SECOND})`, `identique à « ${baseSheet} »`, table.rows.length, 'rien à ajouter')
    }
  })

  // ── notes ──
  const cockpitNotes: Record<string, Cell>[] = [
    { onglet: 'COCKPIT', type: 'titre', texte: cockpit.title },
    { onglet: 'COCKPIT', type: 'sous-titre', texte: cockpit.subtitle },
  ]
  sections.push({
    key: 'notes',
    title: 'Notes des onglets',
    columns: [
      { key: 'onglet', label: 'ONGLET' },
      { key: 'type', label: 'TYPE' },
      { key: 'texte', label: 'TEXTE' },
    ],
    rows: [...cockpitNotes, ...notes],
  })
  cov('(titres et notes)', 'sections[notes]', cockpitNotes.length + notes.length)

  const brief = {
    account_name: plan.name,
    generated_at: grid.created.toISOString(),
    scope: plan.scope ?? 'france',
    headquarters: {
      label: plan.headquarters.label,
      city: plan.headquarters.city,
      ...(plan.headquarters.address ? { address: plan.headquarters.address } : {}),
    },
    kpis,
    what_i_know: cockpit.knowledge,
    charts: cockpit.charts,
    entities,
    sites,
    prices,
    esn,
    people: people.map(({ person, role }) => ({ ...orderPerson(person), role })),
    sections,
    guardrails,
  } as CommercialBrief
  return { brief, coverage, skipped, anomalies }
}

/** Retire les clés vides ; garde l'ordre d'écriture. */
const clip = <T extends object>(draft: T): T => {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(draft)) {
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) continue
    out[key] = typeof value === 'string' ? value.trim() : value
  }
  return out as T
}

const PERSON_ORDER = [
  'name',
  'function',
  'entity',
  'department',
  'manager',
  'city',
  'email',
  'mobile',
  'phone',
  'linkedin',
  'hook',
  'role',
  'exited',
  'reliability',
]
const orderPerson = (person: Person): Person => {
  const record = person as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of PERSON_ORDER) if (record[key] !== undefined) out[key] = record[key]
  return out as Person
}
