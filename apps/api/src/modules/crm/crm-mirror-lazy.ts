import type { ModuleRef } from '@nestjs/core'
import { CRM_MIRROR_SYNC_TARGET, type CrmMirrorSync } from '../crm-mirror/crm-mirror.port'

/**
 * Le miroir SYNC-A vu depuis `CrmModule` SANS importer `CrmMirrorModule` : celui-ci importe `CrmModule`
 * (registre d'adaptateurs), l'inverse fermait un cycle de modules. Le jeton `CRM_MIRROR_SYNC_TARGET` (port seul, aucun service d'un autre module importé — GA-07) est résolu à l'appel, dans le
 * conteneur global — `CrmMirrorModule` est chargé par `CrmSyncModule`. Absent : une passe vide, jamais d'erreur.
 */
export function lazyCrmMirrorSync(moduleRef: ModuleRef): CrmMirrorSync {
  return {
    async syncProvider(input) {
      const mirror = moduleRef.get<CrmMirrorSync>(CRM_MIRROR_SYNC_TARGET, { strict: false })
      return mirror ? mirror.syncProvider(input) : { counts: {}, archived: 0, errors: [] }
    },
  }
}
