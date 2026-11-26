import 'reflect-metadata'
import { CrmMirrorModule } from '../crm-mirror/crm-mirror.module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CRM_MIRROR_SYNC, CRM_MIRROR_SYNC_TARGET, type CrmMirrorSync } from '../crm-mirror/crm-mirror.port'
import { CrmFirstImportRunner } from './crm-first-import.runner'
import { lazyCrmMirrorSync } from './crm-mirror-lazy'
import { CrmSyncModule } from '../crm-sync/crm-sync.module'
import { CrmModule } from './crm.module'

type Imported = { forwardRef?: () => unknown } | unknown

const resolve = (entry: Imported): unknown =>
  typeof entry === 'object' && entry !== null && 'forwardRef' in entry
    ? (entry as { forwardRef: () => unknown }).forwardRef()
    : entry

describe('Intégration SYNC — la reprise atteint le miroir (CRM_MIRROR_SYNC)', () => {
  it('le module qui porte la reprise FOURNIT le jeton par un relais, sans importer CrmMirrorModule (pas de cycle)', () => {
    const imports = (Reflect.getMetadata('imports', CrmModule) as Imported[]).map(resolve)
    expect(imports).not.toContain(CrmMirrorModule)
    const providers = Reflect.getMetadata('providers', CrmModule) as Array<{ provide?: unknown }>
    expect(providers.some(provider => provider.provide === CRM_MIRROR_SYNC)).toBe(true)
    expect(CrmFirstImportRunner).toBeDefined()
  })

  it('le relais délègue au CrmMirrorService résolu, et rend une passe vide si absent', async () => {
    const input = { workspaceId: 'w', provider: 'hubspot' as const, mode: 'full' as const }
    const result = { counts: { deals: 2 }, archived: 0, errors: [] }
    const present = lazyCrmMirrorSync({ get: () => ({ syncProvider: async () => result }) } as never)
    await expect(present.syncProvider(input)).resolves.toBe(result)
    const absent = lazyCrmMirrorSync({ get: () => null } as never)
    await expect(absent.syncProvider(input)).resolves.toEqual({ counts: {}, archived: 0, errors: [] })
  })

  it("le relais n'importe aucun service d'un autre module (GA-07) : le port seulement", () => {
    const source = readFileSync(join(__dirname, 'crm-mirror-lazy.ts'), 'utf8')
    const imports: string[] = source.match(/^import .*$/gm) ?? []
    expect(imports.some(line => line.includes('crm-mirror.port'))).toBe(true)
    expect(imports.filter(line => /\.service'/.test(line))).toEqual([])
    expect(source).not.toMatch(/CrmMirrorService/)
  })

  it('le module fournisseur exporte la cible résolue par le relais', () => {
    expect(Reflect.getMetadata('exports', CrmMirrorModule)).toContain(CRM_MIRROR_SYNC_TARGET)
  })

  it('la synchro fréquente (CrmSyncModule) IMPORTE aussi le module fournisseur', () => {
    const imports = (Reflect.getMetadata('imports', CrmSyncModule) as Imported[]).map(resolve)
    expect(imports).toContain(CrmMirrorModule)
  })

  it('le module fournisseur EXPORTE le jeton, et le fournit', () => {
    expect(Reflect.getMetadata('exports', CrmMirrorModule)).toContain(CRM_MIRROR_SYNC)
    const providers = Reflect.getMetadata('providers', CrmMirrorModule) as Array<{ provide?: unknown }>
    expect(providers.some(provider => provider.provide === CRM_MIRROR_SYNC)).toBe(true)
  })

  it('le fournisseur de miroir est de la forme attendue par la reprise', () => {
    const mirror: CrmMirrorSync = { syncProvider: async () => ({ counts: {}, archived: 0, errors: [] }) }
    expect(typeof mirror.syncProvider).toBe('function')
  })
})
