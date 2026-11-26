import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #2081.14 — TOUTE ROUTE QUI FAIT SORTIR DES DONNÉES LIT LA RÈGLE D'ESPACE.
 *
 * DÉCISION Louis 19/09/2026 (QCM) — la règle « qui peut exporter » ne ferme que
 * la SORTIE de données : CSV, téléchargements, exports vers un tableur ou un
 * outil externe. Et TOUS les chemins de sortie la lisent, au même endroit :
 * le marqueur `@DataExit()`, que lit `WorkspacePermissionGuard`, qui appelle
 * `workspaceRuleForbids` (GA-26 : une seule dérivation).
 *
 * Avant cette garde, la règle tenait sur la permission `data:export` : elle
 * fermait l'import et le partage, et laissait ouverts le CSV de l'ADV, ceux de
 * la facturation et des paiements, les exports Attio, Pipedrive et Google
 * Sheets — aucun ne portait `data:export`.
 *
 * Ce que la garde tient, pour chaque contrôleur :
 *  1. une route qui SERT UN FICHIER (`text/csv`, `attachment; filename`,
 *     `sendDocument`) ou dont le chemin dit « export », « download » ou une
 *     extension de fichier porte `@DataExit()` — ou figure dans `EXEMPTES`
 *     avec sa raison écrite ;
 *  2. une route `@DataExit()` est gardée par `WorkspacePermissionGuard` (sur la
 *     classe ou sur la méthode) — sans lui, le marqueur ne serait lu par
 *     personne ;
 *  3. une exemption vise une route qui existe encore.
 *
 * ⚠️ Comme GA-05, le découpage suit les verbes : `@DataExit()` se pose APRÈS
 * `@Get`/`@Post`, sinon il tombe dans le segment de la route précédente.
 */

const MODULES = join(__dirname, '..', 'modules')

/**
 * Les routes qui ont l'air d'une sortie et n'en sont pas une au sens de la
 * règle — chacune avec sa raison. Clé : `<fichier> <VERBE> <chemin>`.
 */
const EXEMPTES: Readonly<Record<string, string>> = {
  'privacy/privacy.controller.ts GET export':
    'RGPD, droit d’accès et de portabilité : la personne reçoit SES données — une règle d’espace ne le retire pas.',
  'privacy/privacy.controller.ts GET export/object':
    'RGPD, droit d’accès et de portabilité : la personne reçoit SES données — une règle d’espace ne le retire pas.',
  // #2439.7/.8/.17 — « Mes exports » : le journal des exports DÉJÀ effectués par
  // la personne elle-même, pas une nouvelle extraction de données de l’espace —
  // même raison que les deux entrées `export`/`export/object` juste au-dessus.
  'privacy/privacy.controller.ts GET export/history':
    'RGPD, droit d’accès et de portabilité : la personne reçoit SES données — une règle d’espace ne le retire pas.',
  'consultants/matching/matching.controller.ts GET needs/:id/match/explain':
    'Décision Louis 19/09/2026 : l’explication de matching reste ouverte aux membres sous la règle.',
  'projects/projects.controller.ts POST :id/export-crm':
    'Versement au CRM (une TÂCHE décrivant le besoin), pas une fiche exportée — décision Louis 19/09/2026 : le versement CRM reste ouvert.',
  'expenses/expense-reports.controller.ts GET :id/attachments/:attachmentId/download':
    'La pièce justificative que la personne a déposée, relue là où elle vit — pas une extraction de données de l’espace.',
  'projects/projects.controller.ts GET needs/:needId/documents/:documentId/download':
    'Le document déposé sur un besoin, relu là où il vit — pas une extraction de données de l’espace.',
  // #2814 — même patron que les deux pièces ci-dessus.
  'invoice-connector/invoice-attachments.controller.ts GET :missionId/:periodMonth/:attachmentId/download':
    'La pièce jointe déposée sur une facture préparée, relue là où elle vit — pas une extraction de données de l’espace.',
  // #2957 (#2180.54) — même patron que les trois pièces ci-dessus.
  'rfp/rfp.controller.ts GET :id/documents/:objectId/download':
    'Le fichier source d’un appel d’offres déposé à l’import, relu là où il vit — pas une extraction de données de l’espace.',
  // #3803.2 — même patron : l'original d'un document déposé dans Connaissances, relu par la visionneuse.
  'rag/rag.controller.ts GET :id/source':
    'L’original d’un document déposé dans Connaissances, relu là où il vit (visionneuse) — pas une extraction de données de l’espace.',
  // #2081.14 — livrable commercial, décision Louis 19/09 : le PDF/Word du compte, le deck et les
  // dossiers de compétences sont des documents remis à un client, pas des exports de données.
  'documents/documents.controller.ts GET accounts/:id/dossier.docx': 'livrable commercial, décision Louis 19/09',
  'documents/documents.controller.ts GET accounts/:id/dossier.pdf': 'livrable commercial, décision Louis 19/09',
  'documents/documents.controller.ts GET accounts/:id/deck.pptx': 'livrable commercial, décision Louis 19/09',
  'consultants/consultants.controller.ts GET :id/cv-versions/:versionId.docx':
    'livrable commercial, décision Louis 19/09',
  'consultants/consultants.controller.ts GET :id/cv-versions/:versionId.pdf':
    'livrable commercial, décision Louis 19/09',
}

function listControllers(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listControllers(full))
    else if (entry.endsWith('.controller.ts')) out.push(full)
  }
  return out
}

const HTTP_DECORATOR = /@(Get|Post|Put|Patch|Delete)\s*\(\s*(?:['"`]([^'"`]*)['"`])?/g

/** Un chemin qui dit « je fais sortir » : `export`, `download`, une extension de fichier. */
const PATH_EXIT = /(^|[/.:-])export([/.-]|$)|(^|\/)download$|\.(csv|xlsx|docx|pdf|pptx|md|json)$/
/** Un corps qui sert un fichier. */
const BODY_EXIT = /text\/csv|attachment; filename|\bsendDocument\(/

interface Route {
  verb: string
  path: string
  block: string
}

function routesOf(source: string): Route[] {
  const found: { index: number; verb: string; path: string }[] = []
  for (const m of source.matchAll(HTTP_DECORATOR)) {
    found.push({ index: m.index ?? 0, verb: m[1]!.toUpperCase(), path: m[2] ?? '' })
  }
  return found.map((route, i) => {
    const raw = source.slice(route.index, i + 1 < found.length ? found[i + 1]!.index : source.length)
    // La dernière route s'arrête à la fin de la CLASSE (`}` en colonne 0) : les
    // fonctions d'aide écrites après (un `sendDocument` qui pose l'en-tête
    // `attachment`) ne sont pas son corps.
    const classEnd = raw.search(/\n\}/)
    return { verb: route.verb, path: route.path, block: classEnd === -1 ? raw : raw.slice(0, classEnd) }
  })
}

function classHeader(source: string): string {
  const idx = source.search(/@(Get|Post|Put|Patch|Delete)\s*\(/)
  return idx === -1 ? source : source.slice(0, idx)
}

function looksLikeDataExit(route: Route): boolean {
  return PATH_EXIT.test(route.path) || BODY_EXIT.test(route.block)
}

function isMarked(route: Route): boolean {
  return /@DataExit\(\)/.test(route.block)
}

/** Les routes qui ont l'air d'une sortie, ne portent pas `@DataExit()` et ne sont pas exemptées. */
function unmarkedExits(file: string, source: string): string[] {
  return routesOf(source)
    .filter(route => looksLikeDataExit(route) && !isMarked(route))
    .map(route => `${file} ${route.verb} ${route.path}`)
    .filter(key => !(key in EXEMPTES))
}

/** Les routes `@DataExit()` que `WorkspacePermissionGuard` ne garde pas — le marqueur n'y serait lu par personne. */
function unguardedExits(file: string, source: string): string[] {
  const classGuarded = /WorkspacePermissionGuard/.test(classHeader(source))
  return routesOf(source)
    .filter(route => isMarked(route) && !classGuarded && !/WorkspacePermissionGuard/.test(route.block))
    .map(route => `${file} ${route.verb} ${route.path}`)
}

describe('#2081.14 — toute sortie de données lit la règle d’espace (`@DataExit()`)', () => {
  const controllers = listControllers(MODULES).map(full => ({
    file: full.slice(MODULES.length + 1),
    source: readFileSync(full, 'utf8'),
  }))
  const marked = controllers.flatMap(c =>
    routesOf(c.source)
      .filter(isMarked)
      .map(r => `${c.file} ${r.verb} ${r.path}`),
  )

  it('lit un corpus — une garde qui ne lit rien ne garde rien', () => {
    expect(controllers.length).toBeGreaterThan(50)
    // Les sorties nommées par la décision du 19/09 sont bien vues, et marquées.
    for (const key of [
      'adv/adv.controller.ts GET dossiers/export.csv',
      'delivery/invoice-readiness.controller.ts GET export.csv',
      'payments/outgoing-payments.controller.ts GET export.csv',
      // #4186 — l'export de contact Salesforce/Pipedrive/Attio/Odoo passe par
      // la route UNIQUE de la porte commune, toujours marquée sortie de données.
      'crm/crm.controller.ts POST push/contact',
      'google/google.controller.ts POST sheets/export',
      'crm/crm.controller.ts POST hubspot/export',
      // #4016 L11 — décision Louis 11/10/2026 : l'export de masse des besoins
      // (renversement daté de c43) n'existe QUE sous ce marqueur.
      'projects/projects.controller.ts POST needs/export',
    ]) {
      expect(marked).toContain(key)
    }
  })

  it('chaque route qui fait sortir des données porte `@DataExit()`, ou une exemption écrite', () => {
    expect(controllers.flatMap(c => unmarkedExits(c.file, c.source))).toEqual([])
  })

  it('chaque route `@DataExit()` est gardée par `WorkspacePermissionGuard`', () => {
    expect(controllers.flatMap(c => unguardedExits(c.file, c.source))).toEqual([])
  })

  it('chaque exemption vise une route qui existe encore — pas d’exemption morte', () => {
    const existing = new Set(controllers.flatMap(c => routesOf(c.source).map(r => `${c.file} ${r.verb} ${r.path}`)))
    expect(Object.keys(EXEMPTES).filter(key => !existing.has(key))).toEqual([])
  })

  it('sait dire NON — une nouvelle route CSV sans marqueur, un marqueur sans guard', () => {
    const csv = `
      @Controller('x')
      @UseGuards(JwtGuard, WorkspacePermissionGuard)
      export class X {
        @Get('lignes.csv')
        exporter(@Res() res: Response) { res.setHeader('Content-Type', 'text/csv; charset=utf-8') }
      }`
    expect(unmarkedExits('x.controller.ts', csv)).toEqual(['x.controller.ts GET lignes.csv'])

    const outil = `
      @Controller('outil')
      export class Outil {
        @Post('export')
        @DataExit()
        @UseGuards(JwtGuard)
        push() {}
      }`
    expect(unmarkedExits('outil.controller.ts', outil)).toEqual([])
    expect(unguardedExits('outil.controller.ts', outil)).toEqual(['outil.controller.ts POST export'])
  })

  it('n’attrape pas ce qu’elle ne vise pas — un import, un partage, une lecture', () => {
    const src = `
      @Controller('y')
      @UseGuards(JwtGuard, WorkspacePermissionGuard)
      export class Y {
        @Post('contacts/import')
        importer() {}
        @Post(':id/share')
        partager() {}
        @Get('timesheets/month')
        lire() {}
      }`
    expect(unmarkedExits('y.controller.ts', src)).toEqual([])
  })
})
