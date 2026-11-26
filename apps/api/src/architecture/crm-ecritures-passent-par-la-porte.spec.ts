import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * #4186 — TOUTE écriture CRM, tous fournisseurs, passe par la porte.
 *
 * Doctrine : « une écriture CRM/ERP passe par une porte (auto-approuvée sur
 * geste utilisateur, sinon prévisualisation figée) ». Au 14/10, seul HubSpot y
 * passait : `POST /salesforce|pipedrive|attio|odoo/export` appelaient le
 * service du fournisseur en direct, la création de société HubSpot aussi, et
 * l'export de besoin déposait une affaire sans trace.
 *
 * Cette garde nomme les POINTS D'ENTRÉE d'écriture qui ne connaissent pas la
 * porte, et n'autorise leur appel QUE depuis l'adaptateur commun
 * (`crm/adapter/`) — dont le seul appelant d'écriture est `CrmWriteService`.
 *
 *  - `<service>.exportContact(` / `.exportNeed(` / `.upsertContactDirect(` /
 *    `<depth>.createCompany(` : les écritures nues des services fournisseurs.
 *    Exception NOMMÉE : `crm.exportContact(` (HubSpot), qui porte sa propre
 *    porte depuis BEL-INT-603, et les clients HTTP (`client.…`).
 *  - `.taskNote` / `.upsertCompany` / `.upsertContact?.` / `adapter.upsertContact` :
 *    les écritures de l'adaptateur, permises au seul `crm-write.service.ts`.
 *
 * Elle sait dire NON (fixtures) et prouve qu'elle LIT (elle trouve les appels
 * légitimes de l'adaptateur).
 */

const MODULES = join(__dirname, '..', 'modules')

function sources(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sources(full))
    else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts') && !entry.endsWith('.client.ts')) out.push(full)
  }
  return out
}

/** Les écritures nues des services fournisseurs. `crm` (HubSpot, déjà gardé) et `client` sont permis. */
const RAW_SERVICE_WRITE = /([\w.]+)\.(exportContact|exportNeed|exportCompany|upsertContactDirect|createCompany)\(/g
// `this` : un service qui appelle sa PROPRE écriture nue derrière sa porte
// (`CrmService.exportContact` → `this.upsertContactDirect`).
// `crmWrites` : le port de la porte commune elle-même (routeur d'actions).
const ALLOWED_RECEIVERS = new Set(['crm', 'this.crm', 'client', 'this.client', 'this', 'crmWrites'])
/** Les écritures de l'adaptateur commun. */
const ADAPTER_WRITE = /\.(taskNote|upsertCompany)\b|\.upsertContact\?\.|adapter\??\.upsertContact\b/g

const ADAPTER_DIR = `crm${'/'}adapter${'/'}`
const WRITE_SERVICE = `crm${'/'}crm-write.service.ts`

/** Les appels hors porte d'une source ; `file` est relatif à `modules/`. */
function violations(file: string, source: string): string[] {
  const out: string[] = []
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  if (!file.startsWith(ADAPTER_DIR)) {
    for (const match of code.matchAll(RAW_SERVICE_WRITE)) {
      if (!ALLOWED_RECEIVERS.has(match[1] ?? '')) out.push(`${file} : ${match[0]}`)
    }
  }
  if (!file.startsWith(ADAPTER_DIR) && file !== WRITE_SERVICE) {
    for (const match of code.matchAll(ADAPTER_WRITE)) out.push(`${file} : ${match[0]}`)
  }
  return out
}

describe('#4186 — les écritures CRM passent par la porte, tous fournisseurs', () => {
  const files = sources(MODULES).map(full => ({
    file: relative(MODULES, full).split('\\').join('/'),
    source: readFileSync(full, 'utf8'),
  }))

  it('aucun appel d’écriture CRM nue hors de l’adaptateur commun', () => {
    const found = files.flatMap(({ file, source }) => violations(file, source))
    if (found.length > 0) {
      throw new Error(
        [
          'Une écriture CRM part sans passer par la porte (OutboundWriteService).',
          'Passe par CrmWriteService.write({ provider, kind, payload, origin }).',
          '',
          ...found.map(line => `  · ${line}`),
        ].join('\n'),
      )
    }
    expect(found).toEqual([])
  })

  it('la garde LIT : l’adaptateur appelle bien les écritures des services, et la porte celles de l’adaptateur', () => {
    const adapter = files.find(({ file }) => file === `${ADAPTER_DIR}crm-adapter.ts`)?.source ?? ''
    expect(adapter).toMatch(/service\.exportContact\(/)
    expect(adapter).toMatch(/deps\.odoo\.exportContact\(/)
    const gate = files.find(({ file }) => file === WRITE_SERVICE)?.source ?? ''
    expect(gate).toMatch(/adapter\.taskNote/)
    expect(gate).toMatch(/outbound\.request\(/)
  })

  it('sait dire NON — une écriture Pipedrive, Attio ou Odoo hors porte est repérée', () => {
    expect(
      violations('pipedrive/pipedrive.controller.ts', 'return this.pipedrive.exportContact(user.userId, dto)'),
    ).toEqual(['pipedrive/pipedrive.controller.ts : this.pipedrive.exportContact('])
    expect(violations('attio/x.ts', 'await this.attio.exportNeed(u, i)')).toHaveLength(1)
    expect(violations('odoo/odoo.controller.ts', 'this.odoo.exportContact(user.userId, dto)')).toHaveLength(1)
    expect(violations('crm/crm.controller.ts', 'return this.depth.createCompany(user.userId, dto)')).toHaveLength(1)
    expect(violations('crm/crm-task.service.ts', 'const op = target.adapter.taskNote')).toHaveLength(1)
    // …et ne prend pas ce qu'elle ne vise pas : HubSpot gardé, client HTTP, commentaire, porte.
    expect(violations('mcp-api/x.ts', 'return this.crm.exportContact(u, input, { origin })')).toEqual([])
    expect(violations('pipedrive/pipedrive.service.ts', 'await client.upsertContact(token, d, input)')).toEqual([])
    expect(violations('x/y.ts', '// this.pipedrive.exportContact(u, i)')).toEqual([])
    expect(violations(WRITE_SERVICE, 'const op = adapter.taskNote')).toEqual([])
  })
})
