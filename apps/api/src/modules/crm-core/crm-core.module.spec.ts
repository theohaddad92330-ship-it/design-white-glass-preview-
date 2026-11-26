import { CrmCoreModule } from './crm-core.module'
import { CreditsModule } from '../credits/credits.module'
import { CreditsService } from '../credits/credits.service'
import { WorkspaceModule } from '../workspace/workspace.module'
import { RecordEditService } from './record-edit.service'

/**
 * #2318.9 — LAU-FINAL-059, CRÉDITS : « aucun coût pour consulter le diff,
 * appliquer une correction, recalculer localement, réutiliser les résultats ;
 * coût uniquement sur la nouvelle collecte payante ».
 *
 * La seule collecte payante de ce chantier est `AnalysisRefreshService.refresh`
 * (`analysis-refresh.service.ts`), qui débite APRÈS succès et ne débite RIEN
 * sur échec (couvert par `analysis-refresh.service.spec.ts`).
 *
 * « Appliquer une correction » passe par CE module (`RecordEditService`,
 * `AccountRecordController.patch` / `ContactRecordController.patch`). Sa
 * gratuité n'est pas qu'observée : elle est STRUCTURELLE — `CrmCoreModule` ne
 * connaît `CreditsModule` ni `CreditsService` sous aucune forme, donc AUCUN de
 * ses services (pas seulement `RecordEditService`) ne peut débiter un crédit,
 * y compris un service qui y serait ajouté plus tard sans y penser.
 *
 * Une régression ici — quelqu'un branche `CreditsModule` pour, par exemple,
 * facturer une résolution de doublon — romprait « aucun coût pour appliquer
 * une correction » en silence : c'est exactement ce que ce test attrape.
 */
describe('CrmCoreModule (#2318.9 — appliquer une correction ne débite jamais)', () => {
  it('n’importe pas CreditsModule — et la métadonnée lue est bien la vraie liste', () => {
    const imports = (Reflect.getMetadata('imports', CrmCoreModule) as unknown[]) ?? []
    // Canari : si `Reflect.getMetadata` rendait `[]` par accident (décorateur
    // non exécuté, mauvaise clé…), ce test serait vert pour la MAUVAISE
    // raison. `WorkspaceModule` est TOUJOURS importé — sa présence prouve que
    // la métadonnée lue est la vraie liste, pas une liste vide qui mentirait.
    expect(imports).toContain(WorkspaceModule)
    expect(imports).not.toContain(CreditsModule)
  })

  it('ne fournit ni n’exporte CreditsService — et la métadonnée lue est bien la vraie liste', () => {
    const providers = (Reflect.getMetadata('providers', CrmCoreModule) as unknown[]) ?? []
    const exportsList = (Reflect.getMetadata('exports', CrmCoreModule) as unknown[]) ?? []
    expect(providers).toContain(RecordEditService)
    expect(providers).not.toContain(CreditsService)
    expect(exportsList).not.toContain(CreditsService)
  })
})
