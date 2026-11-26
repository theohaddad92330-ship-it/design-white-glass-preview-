import { DEMO_DISCOVER_QUALIFICATION_MASKING_COVERAGE } from './demo-coverage'
import { demoDiscoverResponse } from './demo-scripts'

/**
 * #2614.1 — « et en démonstration, le masquage des comptes exclus de
 * Découvrir montre quoi ? »
 *
 * Craft rule n°9 : l'écran n'a ni table ni clé `raw_analysis` à lui — la
 * garde par table ne poserait jamais la question. Ce fichier est l'appelant
 * qui lit la VRAIE réponse scriptée (`demoDiscoverResponse`), pas un
 * commentaire qui l'affirme.
 *
 * ⚠️ Volontairement SANS `discoverResponseSchema.parse` (contrairement à
 * `demo-discover-contract-model-coverage.spec.ts`) : `qualification` n'est pas
 * déclaré dans `discoverCandidateSchema` (`@bellum/contracts`), donc `.parse`
 * le retirerait en silence — une garde qui l'utiliserait passerait au vert
 * même si le champ disparaissait de la réponse RÉELLE (celle que `ia-proxy.
 * controller.ts` renvoie telle quelle, `as unknown as DiscoverResponse`, sans
 * jamais passer par ce schéma).
 */
describe('#2614.1 — le masquage des comptes exclus, en démonstration', () => {
  it('est classé seedé, avec sa raison', () => {
    expect(DEMO_DISCOVER_QUALIFICATION_MASKING_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_QUALIFICATION_MASKING_COVERAGE.reason).toContain('#2614.1')
  })

  it('la vue PAR DÉFAUT (filtre cible appliqué) porte un candidat EXCLU par le conseil de qualification', () => {
    const byDefault = demoDiscoverResponse({}) as { candidates: Array<Record<string, unknown>> }
    const excluded = byDefault.candidates.filter(
      c => (c['qualification'] as { verdict?: string } | undefined)?.verdict === 'excluded',
    )
    // Si ce test tombe : le candidat exclu est sorti de la cible déclarée (ou
    // a disparu) — le retour #2614.1 ne serait plus visible sans que le
    // visiteur coche « chercher hors de ma cible », un geste que rien ne lui
    // suggère de faire pour voir le masquage à l'œuvre.
    expect(excluded.length).toBeGreaterThan(0)
    for (const candidate of excluded) {
      const qualification = candidate['qualification'] as { code: string | null; reason: string }
      expect(qualification.code).toBeTruthy()
      expect(qualification.reason.length).toBeGreaterThan(0)
    }
  })

  it('le candidat exclu porte un nom, pour que le compteur masqué reste traçable', () => {
    const byDefault = demoDiscoverResponse({}) as { candidates: Array<Record<string, unknown>> }
    const excluded = byDefault.candidates.find(
      c => (c['qualification'] as { verdict?: string } | undefined)?.verdict === 'excluded',
    )
    expect(excluded?.['name']).toBe('Roggeman Structures — M. Roggeman (démo)')
  })
})
