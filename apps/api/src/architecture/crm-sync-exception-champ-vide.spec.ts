import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #4714.2 — le chemin du CRON de synchronisation tient son exception NOMMÉE.
 *
 * Doctrine : « une écriture CRM/ERP passe par une porte » (`OutboundWriteService`, #4186). Le cron
 * (`crm-sync`) en est l'exception décidée par Louis le 31/10/2026 : il REMPLIT un champ VIDE du CRM du
 * client (e-mail, téléphone), jamais n'écrase une saisie (`c147_synchro_crm_remplit_un_champ_vide_jamais_n_ecrase`,
 * #4714.1). Avant, l'exception n'était écrite nulle part et la garde #4186 ne regardait pas ce chemin.
 *
 * Ce que la garde dit NON à :
 *  - une écriture de plus que `pushContactField` dans `crm-sync/` (création de fiche, export, upsert…) ;
 *  - un appel `pushContactField` hors de la boucle des CHAMPS VIDES, ou un écrasement qui ne passe plus par la porte (#4714.3) ;
 *  - un filtre des champs vides qui ne teste plus « vide côté CRM » ;
 *  - un module qui ne nomme plus l'exception (`c147_…`) ;
 *  - `CrmService.pushContactField` qui créerait une fiche.
 */

const DIR = join(__dirname, '..', 'modules', 'crm-sync')
const EXCEPTION_KEY = 'c147_synchro_crm_remplit_un_champ_vide_jamais_n_ecrase'
/** Toute autre écriture fournisseur : la porte les couvre (#4186), le cron n'a pas le droit d'y toucher. */
const OTHER_WRITES =
  /\.(exportContact|exportNeed|exportCompany|upsertContactDirect|upsertContact|upsertCompany|createCompany|createContact|taskNote)\(/g

const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

/** Les manquements d'une source de `crm-sync/` ; `file` est le nom du fichier. */
function violations(file: string, source: string): string[] {
  const code = strip(source)
  const out: string[] = []
  for (const match of code.matchAll(OTHER_WRITES)) out.push(`${file} : écriture hors exception ${match[0]}`)
  if (file !== 'crm-sync.service.ts') {
    if (/pushContactField\(/.test(code)) out.push(`${file} : pushContactField hors du service de synchro`)
    return out
  }
  const blanksLoop = code.indexOf('for (const field of blanks)')
  const overwriteIf = code.indexOf('if (overwriteRemoteValues()')
  const calls = [...code.matchAll(/pushContactField\(/g)].map(m => m.index ?? -1)
  if (blanksLoop === -1 || overwriteIf === -1 || blanksLoop > overwriteIf) {
    out.push(`${file} : la boucle des champs vides ou le bloc d'écrasement explicite a disparu`)
  } else {
    // #4714.3 — un SEUL site d'écriture directe (les champs vides) ; l'écrasement passe par la porte.
    for (const at of calls) {
      if (!(at > blanksLoop && at < overwriteIf))
        out.push(`${file} : pushContactField hors du site décidé (offset ${at})`)
    }
    if (calls.length !== 1) out.push(`${file} : ${calls.length} appels pushContactField (1 décidé)`)
    if (!/this\.gate\.request\(/.test(code.slice(overwriteIf)))
      out.push(`${file} : l'écrasement ne passe plus par la porte d'écriture (#4714.3)`)
  }
  if (!/theirs\.length === 0/.test(code))
    out.push(`${file} : le filtre des champs vides ne teste plus « vide côté CRM »`)
  if (!source.includes(EXCEPTION_KEY)) out.push(`${file} : l'exception ${EXCEPTION_KEY} n'est plus nommée`)
  return out
}

const files = readdirSync(DIR)
  .filter(name => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
  .map(name => ({ name, source: readFileSync(join(DIR, name), 'utf8') }))

describe('#4714.2 — crm-sync : remplir un champ vide, jamais écraser, exception nommée', () => {
  it('le module respecte l’exception (aucune autre écriture, un site d’écriture directe, l’écrasement par la porte, exception nommée)', () => {
    expect(files.length).toBeGreaterThan(3)
    expect(files.flatMap(({ name, source }) => violations(name, source))).toEqual([])
  })

  it('la garde LIT : le service écrit bien par pushContactField et nomme l’exception', () => {
    const service = files.find(f => f.name === 'crm-sync.service.ts')?.source ?? ''
    expect(strip(service).match(/pushContactField\(/g)).toHaveLength(1)
    expect(service).toContain(EXCEPTION_KEY)
  })

  it('CrmService.pushContactField met à jour une fiche existante et n’en crée jamais', () => {
    const crm = readFileSync(join(__dirname, '..', 'modules', 'crm', 'crm.service.ts'), 'utf8')
    const start = crm.indexOf('async pushContactField(')
    const body = strip(crm.slice(start, crm.indexOf('async findPresence(', start)))
    expect(start).toBeGreaterThan(-1)
    expect(body).toContain('updateContact(')
    expect(body).not.toMatch(/createContact|createCompany|upsert/)
  })

  it('sait dire NON — chaque dérive est repérée', () => {
    const ok = [
      `// ${EXCEPTION_KEY}`,
      'const blanks = f.filter(field => theirs.length === 0)',
      'for (const field of blanks) { await this.crm.pushContactField(a, b, field, v) }',
      'if (overwriteRemoteValues() && this.gate) { await this.gate.request(r) }',
    ].join('\n')
    expect(violations('crm-sync.service.ts', ok)).toEqual([])
    // une écriture de création de fiche dans le cron
    expect(violations('crm-sync.service.ts', `${ok}\nawait this.crm.createContact(u, i)`)).toHaveLength(1)
    // l'écrasement qui repart en direct, hors porte (#4714.3)
    expect(
      violations('crm-sync.service.ts', ok.replace('this.gate.request(r)', 'this.crm.pushContactField(a, b, f, v)'))
        .length,
    ).toBeGreaterThan(0)
    // un second push, hors du site décidé (avant la boucle des vides)
    expect(violations('crm-sync.service.ts', `this.crm.pushContactField(a,b,c,d)\n${ok}`).length).toBeGreaterThan(0)
    // le filtre ne teste plus « vide côté CRM »
    expect(violations('crm-sync.service.ts', ok.replace('theirs.length === 0', 'true'))).toHaveLength(1)
    // l'exception n'est plus nommée
    expect(violations('crm-sync.service.ts', ok.replace(EXCEPTION_KEY, 'rien'))).toHaveLength(1)
    // pushContactField appelé depuis un autre fichier du module
    expect(violations('crm-frequent-sync.service.ts', 'this.crm.pushContactField(a,b,c,d)')).toHaveLength(1)
    // …et ne prend pas ce qu'elle ne vise pas : un commentaire
    expect(violations('crm-sync.config.ts', '// this.crm.createContact(u)')).toEqual([])
  })
})
