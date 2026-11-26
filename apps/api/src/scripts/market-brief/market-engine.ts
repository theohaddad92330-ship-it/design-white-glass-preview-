import type { MarketBrief } from '@bellum/contracts'

import { humanizeChartLabel, readCockpit } from '../commercial-brief/cockpit'
import { buildTable, type Row, type Table } from '../commercial-brief/table'
import { neutralizeOneSide, neutralizeProspectEsn } from '../commercial-brief/text-rules'
import type { GridWorkbook } from '../commercial-brief/xlsx-grid'
import type { MarketPlan, Share, SheetPlan } from './market-plans'

/**
 * Moteur du convertisseur des briefs de marché (capacité « Marchés locaux », lot L5). Il IMPORTE les lecteurs du
 * convertisseur des briefs comptes (grille xlsx, table, cockpit, règles de texte) et n'écrit que ce qui est propre
 * au marché : grille de prix, tendance, galaxies, clients, calendrier, règles.
 *
 * Règles tenues ici, jamais re-questionnées :
 *  - AUCUNE donnée inventée : tout vient d'une cellule du classeur ; ce qu'un champ du contrat ne porte pas est
 *    écarté AVEC SA RAISON et compté dans le rapport de couverture ;
 *  - le nom de l'ESN prospect est neutralisé (règles de texte des briefs comptes) ;
 *  - nos FOURNISSEURS ne se nomment jamais (`SUPPLIER_NAMES`) ;
 *  - les personnes sont EN CLAIR (D5) : nom, poste, employeur, e-mail, mobile, LinkedIn ;
 *  - un onglet non mappé, une colonne lue sans être déclarée, une ligne d'onglet partagé sans zone : ERREUR.
 */

type Cell = string | number | boolean | null
type Section = MarketBrief['sections'][number]
type Person = MarketBrief['people'][number]
type Client = NonNullable<MarketBrief['clients']>[number]
type Esn = MarketBrief['esn'][number]
type Rule = NonNullable<MarketBrief['rules']>[number]

type CoverageLine = { sheet: string; destination: string; rows: number; note?: string }
type MarketConversion = {
  brief: MarketBrief
  coverage: CoverageLine[]
  /** Valeurs écartées, par raison. */
  skipped: Record<string, number>
}

const ascii = (value: string): string => value.normalize('NFD').replace(/[̀-ͯ]/g, '')
const norm = (value: string | undefined): string =>
  ascii(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
const slug = (value: string): string => norm(value).replace(/ /g, '-')
const columnKey = (header: string): string => norm(header).replace(/ /g, '_') || 'colonne'

const NUMERIC = /^-?\d+(\.\d+)?$/
const PHONE_COLUMN = /tele?phone|mobile|fixe|numero|phone/
/** Libellé de métropole du classeur (« Greater Lille Metropolitan ») : ce n'est pas une ville. */
const GREATER_LABEL = /^greater\b/i
const EMAIL_ADDRESS = /[\w.+'’-]+@[\w-]+(?:\.[\w-]+)+/g

/** Nos fournisseurs de données : jamais nommés dans un brief (« mémoire marché », jamais le nom du fournisseur). */
const SUPPLIER_NAMES = /\b(?:dataforge|apollo|pappers|firecrawl|brave\s+search)\b/i

const PRICE_CELL = /^(\d+(?:[.,]\d+)?)\s*€\s*\(n=(\d+)\)$/
const PRICE_RANGE = /^(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)\s*€$/
const MIN_CELL_SAMPLE = 3

const toNumber = (text: string): number => Number(text.replace(',', '.'))

export const convertMarketWorkbook = (grid: GridWorkbook, plan: MarketPlan): MarketConversion => {
  const coverage: CoverageLine[] = []
  const skipped: Record<string, number> = {}
  const skip = (reason: string, count = 1): void => {
    skipped[reason] = (skipped[reason] ?? 0) + count
  }
  const cov = (sheet: string, destination: string, rows: number, note?: string): void => {
    coverage.push({ sheet, destination, rows, ...(note ? { note } : {}) })
  }
  const fail = (message: string): never => {
    throw new Error(`[${plan.slug}] ${message}`)
  }

  // ── nettoyage du texte : ESN prospect neutralisée, réécritures déclarées, fournisseurs jamais nommés ──
  const usedRewrites = new Set<number>()
  const clean = (sheet: string, text: string): string => {
    let out = neutralizeProspectEsn(neutralizeOneSide(text))
    plan.rewrites.forEach((rewrite, i) => {
      if (rewrite.sheet === sheet && out.includes(rewrite.find)) {
        out = out.split(rewrite.find).join(rewrite.replace)
        usedRewrites.add(i)
      }
    })
    if (SUPPLIER_NAMES.test(out.replace(EMAIL_ADDRESS, ''))) {
      fail(`[${sheet}] fournisseur nommé (jamais à l'écran), ajouter une réécriture au plan : ${out.slice(0, 140)}`)
    }
    return out.trim()
  }

  // ── onglets du classeur ⇄ onglets du plan : égalité stricte ──
  const planSheets = new Map(plan.sheets.map(s => [s.sheet, s]))
  const unmapped = grid.sheets.map(s => s.name).filter(name => !planSheets.has(name))
  if (unmapped.length) fail(`onglet(s) non mappé(s) : ${unmapped.join(', ')}`)
  const missing = [...planSheets.keys()].filter(name => !grid.sheets.some(s => s.name === name))
  if (missing.length) fail(`onglet(s) du plan absent(s) du classeur : ${missing.join(', ')}`)

  const anomalies = grid.sheets.filter(s => s.badCells > 0)
  for (const sheet of anomalies)
    skip(`[${sheet.name}] cellule « [object Object] » (export source cassé), traitée comme vide`, sheet.badCells)

  // ── champs : lecture et nettoyage des coordonnées ──
  const phone = (value: string | undefined, label: string): string | undefined => {
    if (value === undefined) return undefined
    const digits = value.replace(/\D/g, '')
    if (/^\d{4}-\d{2}-\d{2}/.test(value) || digits.length < 6 || !/^[\d\s.+()/\-;,|]+$/.test(value)) {
      skip(`${label} : valeur qui n'est pas un numéro`)
      return undefined
    }
    return value
  }
  const email = (value: string | undefined): string | undefined => {
    if (!value?.trim()) return undefined
    const address = /[A-Za-z0-9._%+'’-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
    const kept: string[] = []
    for (const mail of value.match(address) ?? []) if (!kept.includes(mail)) kept.push(mail)
    if (kept.length === 0) {
      skip('e-mail : valeur sans adresse')
      return undefined
    }
    return kept.join(' | ')
  }
  const link = (row: Row, header: string): string | undefined => {
    const target = row.link(header)
    if (target) return target
    const text = row.get(header)
    if (text && /^https?:\/\//.test(text)) return text
    if (text) skip('LinkedIn : texte sans adresse')
    return undefined
  }
  const int = (value: string | undefined, label: string): number | undefined => {
    if (value === undefined) return undefined
    if (!/^\d+$/.test(value)) return fail(`${label} : entier attendu, lu « ${value} »`)
    return Number(value)
  }
  const joined = (separator: string, ...values: (string | undefined)[]): string | undefined => {
    const kept = values.filter((v): v is string => v !== undefined && v.trim() !== '' && v.trim() !== '—')
    return kept.length ? kept.join(separator) : undefined
  }
  const splitCities = (value: string | undefined): string[] => {
    const out: string[] = []
    for (const part of (value ?? '').split('|').map(p => p.trim())) {
      if (!part) continue
      if (GREATER_LABEL.test(part)) skip(`ville : « ${part} » est un libellé de métropole de la source, pas une ville`)
      else if (!out.includes(part)) out.push(part)
    }
    return out
  }

  // ── tables ──
  const tables = new Map<string, Table>()
  for (const sheet of grid.sheets) {
    const sheetPlan = planSheets.get(sheet.name) as SheetPlan
    if (sheetPlan.cockpit || sheetPlan.skip) continue
    tables.set(sheet.name, buildTable(sheet, clean))
  }

  /** Répartit les lignes d'un onglet partagé : gardée, laissée à l'autre zone, ou erreur. */
  const share = (sheet: string, what: string, label: string, rule: Share): boolean => {
    if (rule.mine(label)) return true
    if (rule.elsewhere(label)) {
      skip(`${what} laissé à l'autre zone du classeur partagé`)
      return false
    }
    return fail(`[${sheet}] ${what} « ${label} » n'est attribué à aucune zone du classeur partagé`)
  }

  // ── sorties ──
  const sections: Section[] = []
  const people: Person[] = []
  const esn: Esn[] = []
  const guardrails: MarketBrief['guardrails'] = []
  const noteRows: Record<string, Cell>[] = []
  const clients: Client[] = []
  const groups: NonNullable<MarketBrief['groups']> = []
  const calendar: NonNullable<MarketBrief['calendar']> = []
  const rules: Rule[] = []
  const knowledge: MarketBrief['what_i_know'] = []
  let kpis: MarketBrief['kpis'] = []
  let charts: MarketBrief['charts'] = []
  let priceGrid: MarketBrief['price_grid']
  let priceTrend: MarketBrief['price_trend']
  let namedAccount: { name: string; reading: string } | undefined

  const buildSection = (
    table: Table,
    key: string,
    dropped: Set<string>,
    rowsOf: readonly Row[] = table.rows,
    motifs?: Map<number, string>,
  ): Section => {
    const headers = table.headers.filter(h => !dropped.has(h))
    const columns = headers.map(h => ({ key: columnKey(h), label: h }))
    if (new Set(columns.map(c => c.key)).size !== columns.length) fail(`[${table.sheet}] clés de colonne en double`)
    const numeric = new Set(
      headers.filter(h => {
        if (PHONE_COLUMN.test(norm(h))) return false
        const values = table.rows.map(r => r.get(h)).filter((v): v is string => v !== undefined)
        return values.length > 0 && values.every(v => NUMERIC.test(v))
      }),
    )
    const rows: Record<string, Cell>[] = []
    for (const row of rowsOf) {
      const record: Record<string, Cell> = {}
      for (const header of headers) {
        const raw = row.get(header)
        if (raw === undefined) continue
        const value = norm(header).startsWith('e mail')
          ? email(raw)
          : PHONE_COLUMN.test(norm(header))
            ? phone(raw, header)
            : raw
        if (value === undefined) continue
        record[columnKey(header)] = numeric.has(header) ? Number(value) : value
      }
      const motif = motifs?.get(row.n)
      if (motif) record.motif = motif
      if (Object.keys(record).length > 0) rows.push(record)
    }
    return {
      key,
      title: table.title,
      columns: [...columns, ...(motifs ? [{ key: 'motif', label: 'MOTIF' }] : [])],
      rows,
    }
  }

  for (const sheetPlan of plan.sheets) {
    const name = sheetPlan.sheet
    if (sheetPlan.skip) {
      cov(name, 'ignoré', 0, sheetPlan.skip)
      continue
    }

    // ── COCKPIT ──
    if (sheetPlan.cockpit) {
      const sheet = grid.sheets.find(s => s.name === name)
      if (!sheet) return fail(`[${name}] introuvable`)
      const cockpit = readCockpit(sheet, clean)
      if (!cockpit.title.toUpperCase().startsWith(plan.titlePrefix)) {
        fail(`titre du COCKPIT « ${cockpit.title} » ≠ « ${plan.titlePrefix} … »`)
      }
      const { kpis: kpiShare, knowledge: knowledgeShare, charts: chartShare } = sheetPlan.cockpit
      kpis = cockpit.kpis.filter(k => (kpiShare ? share(name, 'indicateur', k.label, kpiShare) : true))
      knowledge.push(
        ...cockpit.knowledge.filter(k => (knowledgeShare ? share(name, 'rubrique', k.rubric, knowledgeShare) : true)),
      )
      charts = cockpit.charts.filter(c => (chartShare ? share(name, 'graphique', c.title, chartShare) : true))
      cov(name, 'kpis', kpis.length)
      cov(name, 'what_i_know', knowledge.length)
      cov(name, 'charts', charts.length, `${charts.reduce((n, c) => n + c.items.length, 0)} points`)
      if (cockpit.blankChartLabels > 0)
        skip('graphique : point sans libellé dans le classeur, rendu « Non renseigné »', cockpit.blankChartLabels)
      continue
    }

    const table = tables.get(name) as Table
    const dropped = new Set(Object.keys(sheetPlan.dropped ?? {}))
    const has = (header: string): boolean => table.headers.includes(header)
    const first = (...headers: string[]): string | undefined => headers.find(has)
    // Titre et notes de l'onglet : jamais perdus, section `notes`.
    for (const note of [table.subtitle, ...table.notes]) {
      if (note) noteRows.push({ onglet: table.title, note })
    }

    if (sheetPlan.priceGrid) {
      const subtitle = table.subtitle ?? ''
      const sample = /(\d+)\s+besoins.*?(\d{4})\s*-\s*(\d{4})/.exec(subtitle)
      if (!sample) fail(`[${name}] « N besoins … AAAA-AAAA » introuvable dans le sous-titre « ${subtitle} »`)
      const [, sampleSize, from, to] = sample as RegExpExecArray
      const topNote = table.notes.map(n => /dominée par (.+?)\s*:\s*(\d+) besoins sur (\d+)/.exec(n)).find(Boolean)
      if (topNote && Number(topNote[3]) !== Number(sampleSize))
        fail(`[${name}] échantillon du sous-titre ≠ celui de la note de concentration`)
      const cell = (text: string | undefined): { amount: number; n: number } | undefined => {
        if (text === undefined || text === '—') return undefined
        const m = PRICE_CELL.exec(text)
        if (!m) return fail(`[${name}] cellule de prix illisible « ${text} »`)
        const n = Number(m[2])
        if (n < MIN_CELL_SAMPLE) {
          skip(`cellule de prix : n < ${MIN_CELL_SAMPLE}, ABSENTE (jamais affichée)`)
          return undefined
        }
        return { amount: toNumber((m as RegExpExecArray)[1]), n }
      }
      const rows: NonNullable<MarketBrief['price_grid']>['rows'] = table.rows.map(r => {
        const range = r.get('FOURCHETTE')
        const rm = range ? PRICE_RANGE.exec(range) : null
        if (range && !rm) fail(`[${name}] fourchette illisible « ${range} »`)
        const family = r.get('MÉTIER') as string
        const junior = cell(r.get('JUNIOR (0-2)'))
        const confirmed = cell(r.get('CONFIRMÉ (3-4)'))
        const senior = cell(r.get('SENIOR (5-10)'))
        return {
          family,
          needs: int(r.get('BESOINS'), 'BESOINS') as number,
          median: toNumber(r.get('PRIX MÉDIAN') as string),
          ...(junior ? { junior } : {}),
          ...(confirmed ? { confirmed } : {}),
          ...(senior ? { senior } : {}),
          ...(rm ? { range: { min: toNumber(rm[1]), max: toNumber(rm[2]) } } : {}),
        }
      })
      priceGrid = {
        currency: sheetPlan.priceGrid.currency,
        period: `${from}-${to}`,
        sample_size: Number(sampleSize),
        // Le classeur est un fichier FOURNI : la source de la grille se nomme (D6), jamais « observé » à notre compte.
        source_kind: 'provided_file',
        ...(topNote ? { top_client: { name: topNote[1], n: Number(topNote[2]) } } : {}),
        rows,
      }
      cov(name, 'price_grid', rows.length, `échantillon ${sampleSize}`)
    } else if (sheetPlan.priceTrend) {
      priceTrend = table.rows.map(r => ({
        year: int(r.get('ANNÉE'), 'ANNÉE') as number,
        needs: int(r.get('BESOINS'), 'BESOINS') as number,
        median: toNumber(r.get('PRIX MÉDIAN') as string),
      }))
      cov(name, 'price_trend', priceTrend.length)
    } else if (sheetPlan.group) {
      if (!norm(table.title).includes(norm(sheetPlan.group.name).split(' ').pop() ?? '')) {
        fail(`[${name}] titre « ${table.title} » ne parle pas de « ${sheetPlan.group.name} »`)
      }
      const members: NonNullable<MarketBrief['groups']>[number]['members'] = []
      for (const r of table.rows) {
        const memberName = r.get('ENSEIGNE')
        if (!memberName) continue
        const needs = int(r.get('BESOINS CHIFFRÉS'), 'BESOINS CHIFFRÉS')
        // 0 besoin chiffré = aucune ligne de prix à compter : une absence ne fait pas « 0 » (GA-18/19).
        if (needs === 0) skip('galaxie : « 0 besoin chiffré » omis (une absence ne s’affiche jamais « 0 »)')
        members.push({
          name: memberName,
          profiles: int(r.get('PROFILS EN POSTE'), 'PROFILS EN POSTE'),
          externals: int(r.get('EXTERNES'), 'EXTERNES'),
          ...(needs ? { needs } : {}),
        })
      }
      groups.push({ name: sheetPlan.group.name, ...(table.subtitle ? { note: table.subtitle } : {}), members })
      cov(name, 'groups', members.length)
    } else if (sheetPlan.clients) {
      const profilesHeader = first('PROFILS', 'PROFILS EN POSTE')
      const familiesHeader = first('FAMILLES', 'FAMILLES MÉTIER')
      for (const r of table.rows) {
        const clientName = r.get('ENTREPRISE')
        if (!clientName) continue
        const technos = has('TECHNOS') ? r.get('TECHNOS') : undefined
        const reading = joined(
          ' — ',
          has('LECTURE') ? r.get('LECTURE') : undefined,
          technos ? `Technos : ${technos}` : undefined,
        )
        const sector = has('SECTEUR') ? r.get('SECTEUR') : undefined
        const size = has('TAILLE') ? r.get('TAILLE') : undefined
        const profiles = profilesHeader ? int(r.get(profilesHeader), profilesHeader) : undefined
        const externals = has('EXTERNES') ? int(r.get('EXTERNES'), 'EXTERNES') : undefined
        const families = familiesHeader ? r.get(familiesHeader) : undefined
        clients.push({
          name: clientName,
          ...(sector ? { sector } : {}),
          ...(size ? { size } : {}),
          ...(profiles !== undefined ? { profiles } : {}),
          ...(externals !== undefined ? { externals } : {}),
          cities: splitCities(has('VILLES') ? r.get('VILLES') : undefined),
          ...(families ? { families } : {}),
          ...(reading ? { reading } : {}),
        })
      }
      cov(name, 'clients', clients.length)
    } else if (sheetPlan.esn) {
      const nameHeader = first('ESN / CABINET', 'SOCIÉTÉ') as string
      const profilesHeader = 'PROFILS'
      let count = 0
      for (const r of table.rows) {
        const esnName = r.get(nameHeader)
        if (!esnName) continue
        const profiles = int(r.get(profilesHeader), profilesHeader)
        const externals = int(r.get('EXTERNES'), 'EXTERNES')
        const role = has('RÔLE') ? r.get('RÔLE') : undefined
        const families = r.get('FAMILLES')
        const cities = splitCities(has('VILLES') ? r.get('VILLES') : undefined)
        const proof = joined(
          ' · ',
          role,
          profiles !== undefined
            ? `${profiles} ${profiles === 1 ? 'profil' : 'profils'} en poste${externals !== undefined ? `, dont ${externals} ${externals === 1 ? 'externe' : 'externes'}` : ''}`
            : undefined,
          families ? `Familles : ${families}` : undefined,
        )
        esn.push({
          name: esnName,
          evidence_level: 'observed',
          proof: proof ?? fail(`[${name}] ESN « ${esnName} » sans aucune preuve`),
          ...(cities.length ? { perimeter: cities.join(', ') } : {}),
        })
        count += 1
      }
      cov(name, 'esn', count)
    } else if (sheetPlan.people) {
      let count = 0
      for (const r of table.rows) {
        const personName = r.get('NOM')?.replace(/\s+/g, ' ').trim()
        if (!personName) {
          skip('personne : ligne sans nom, écartée')
          continue
        }
        const function_ = r.get('POSTE')
        const entity = r.get('ENTREPRISE')
        const family = r.get('FAMILLE')
        const city = splitCities(r.get('VILLE')).join(', ') || undefined
        const mail = email(r.get('E-MAIL'))
        const mobile = has('MOBILE') ? phone(r.get('MOBILE'), 'MOBILE') : undefined
        const linkedin = has('LINKEDIN') ? link(r, 'LINKEDIN') : undefined
        const technos = has('TECHNOS') ? r.get('TECHNOS') : undefined
        const person: Person = {
          name: personName,
          ...(function_ ? { function: function_ } : {}),
          ...(entity ? { entity } : {}),
          ...(family ? { department: family } : {}),
          ...(city ? { city } : {}),
          ...(mail ? { email: mail } : {}),
          ...(mobile ? { mobile } : {}),
          ...(linkedin ? { linkedin } : {}),
          ...(technos ? { hook: `Technos : ${technos}` } : {}),
          role: 'external',
        }
        people.push(person)
        count += 1
      }
      cov(name, 'people', count, 'externes en poste, en clair (D5)')
    } else if (sheetPlan.calendar) {
      for (const r of table.rows) {
        const label = r.get('FILIÈRE')
        const when = r.get('CALENDRIER')
        if (!label || !when) continue
        const detail = joined(
          ' — ',
          r.get('ACTIVITÉ') ? `Activité : ${r.get('ACTIVITÉ')}` : undefined,
          r.get('COMPÉTENCES DEMANDÉES') ? `Compétences demandées : ${r.get('COMPÉTENCES DEMANDÉES')}` : undefined,
          r.get('BARRIÈRE') ? `Barrière : ${r.get('BARRIÈRE')}` : undefined,
        )
        const actors = r.get('ACTEURS')
        calendar.push({ label, when, ...(actors ? { actors } : {}), ...(detail ? { detail } : {}) })
      }
      sections.push(buildSection(table, slug(name), dropped))
      cov(name, 'calendar + section', calendar.length)
    } else if (sheetPlan.knowledge) {
      for (const r of table.rows) {
        const rubric = r.get('SUJET')
        const known = r.get('CE QUE JE SAIS')
        const meaning = r.get('CE QUE ÇA VEUT DIRE POUR TOI')
        if (!rubric || !known || !meaning)
          fail(`[${name}] ligne ${r.n} incomplète (sujet / ce que je sais / ce que ça veut dire)`)
        knowledge.push({ rubric: rubric as string, known: known as string, meaning: meaning as string })
        if (sheetPlan.accountNamed && rubric === sheetPlan.accountNamed.row) {
          if (!(known as string).includes(sheetPlan.accountNamed.name)) {
            fail(
              `[${name}] la ligne « ${rubric} » ne nomme plus « ${sheetPlan.accountNamed.name} » (lien du compte à revoir)`,
            )
          }
          namedAccount = { name: sheetPlan.accountNamed.name, reading: known as string }
        }
      }
      if (sheetPlan.accountNamed && !namedAccount) fail(`[${name}] ligne « ${sheetPlan.accountNamed.row} » absente`)
      cov(name, 'what_i_know', table.rows.length)
    } else if (sheetPlan.rules) {
      for (const r of table.rows) {
        const rule = r.get('RÈGLE')
        const known = r.get('CE QUE JE SAIS')
        const meaning = r.get('CE QUE TU DOIS AVOIR EN TÊTE')
        if (!rule || !known || !meaning) fail(`[${name}] ligne ${r.n} incomplète`)
        const regime = r.get('RÉGIME')
        rules.push({
          rule: rule as string,
          ...(regime ? { regime: humanizeChartLabel(regime) } : {}),
          known: known as string,
          meaning: meaning as string,
        })
      }
      cov(name, 'rules', rules.length)
    } else if (sheetPlan.guardrails) {
      let kept = 0
      for (const r of table.rows) {
        const point = r.get('POINT')
        const detail = r.get("CE QU'IL FAUT SAVOIR")
        if (!point || !detail) fail(`[${name}] ligne ${r.n} incomplète`)
        if (!share(name, 'garde-fou', point as string, sheetPlan.guardrails)) continue
        guardrails.push({ point: point as string, detail: detail as string })
        kept += 1
      }
      cov(name, 'guardrails', kept)
    } else if (sheetPlan.needs) {
      const locationHeader = 'LOCALISATION'
      const motifs = new Map<number, string>()
      const inZone: Row[] = []
      const outside: Row[] = []
      for (const r of table.rows) {
        const location = r.get(locationHeader)
        if (location && sheetPlan.needs.inZone(location)) inZone.push(r)
        else {
          motifs.set(
            r.n,
            location ? `Localisation « ${location} », hors de la zone` : 'Localisation non renseignée dans le classeur',
          )
          outside.push(r)
        }
      }
      sections.push(buildSection(table, slug(name), dropped, inZone))
      sections.push(buildSection(table, `${slug(name)}-non-retenus`, dropped, outside, motifs))
      cov(name, 'section', inZone.length, `${outside.length} ligne(s) hors zone dans ${slug(name)}-non-retenus`)
    } else if (sheetPlan.section) {
      sections.push(buildSection(table, sheetPlan.section.key ?? slug(name), dropped))
      cov(name, 'section', table.rows.length)
    } else {
      fail(`[${name}] aucune destination dans le plan`)
    }

    // « Aucune colonne ignorée en silence » : toute colonne lue ou déclarée retirée, jamais les deux.
    const silent = table.headers.filter(h => !table.touched.has(h) && !dropped.has(h))
    if (silent.length) fail(`[${name}] colonne(s) ni lue(s) ni déclarée(s) retirée(s) : ${silent.join(', ')}`)
    const both = [...dropped].filter(h => table.touched.has(h))
    if (both.length) fail(`[${name}] colonne(s) déclarée(s) retirée(s) mais lue(s) : ${both.join(', ')}`)
    for (const header of dropped) {
      if (!has(header)) fail(`[${name}] colonne retirée « ${header} » absente du classeur`)
      skip(`colonne retirée [${name}] ${header} : ${(sheetPlan.dropped ?? {})[header]}`, table.filled.get(header) ?? 0)
    }
  }

  const stale = plan.rewrites.filter((r, i) => !usedRewrites.has(i) && !r.shared)
  if (stale.length) fail(`réécriture(s) périmée(s) (la source a changé) : ${stale.map(r => r.find).join(' ; ')}`)

  if (noteRows.length) {
    sections.push({
      key: 'notes',
      title: 'NOTES DU CLASSEUR',
      columns: [
        { key: 'onglet', label: 'ONGLET' },
        { key: 'note', label: 'NOTE' },
      ],
      rows: noteRows,
    })
  }

  // Compte nommé par le classeur (ABB Suisse) : entre dans `clients` pour que le lien « comptes de la zone » le trouve.
  if (namedAccount) {
    clients.push({ name: namedAccount.name, cities: [], reading: namedAccount.reading })
    cov('MARCHE SUISSE', 'clients', 1, `compte structuré nommé : ${namedAccount.name}`)
  }

  // ── la zone : départements / cantons et villes DÉCLARÉS au plan, villes vérifiées présentes dans le classeur ──
  const everyText = norm(grid.sheets.flatMap(s => s.rows.flatMap(r => [...r.cells.values()])).join(' '))
  for (const city of plan.zone.cities) {
    if (!` ${everyText} `.includes(` ${norm(city)} `))
      fail(`ville de la zone « ${city} » absente du classeur (rien d'inventé)`)
  }

  const brief: MarketBrief = {
    zone: { ...plan.zone, cities: [...plan.zone.cities] },
    generated_at: plan.generatedAt,
    kpis,
    what_i_know: knowledge,
    charts,
    esn,
    people,
    sections,
    guardrails,
    ...(priceGrid ? { price_grid: priceGrid } : {}),
    ...(priceTrend ? { price_trend: priceTrend } : {}),
    ...(clients.length ? { clients } : {}),
    ...(groups.length ? { groups } : {}),
    ...(calendar.length ? { calendar } : {}),
    ...(rules.length ? { rules } : {}),
  }
  return { brief, coverage, skipped }
}
