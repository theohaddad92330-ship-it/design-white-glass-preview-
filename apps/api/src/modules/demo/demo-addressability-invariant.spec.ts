import { ADDRESSABILITY_AXES, addressabilitySchema } from '@bellum/contracts'
import { DEMO_DELIVERY_CLIENT, DEMO_DOSSIERS } from './demo-dataset'

/**
 * `raw_analysis.addressability` est écrit en production depuis le 06/09
 * (`phase1_research.py:1535` → `addressability_for_company`), maintenant nommé
 * au contrat (`accountAnalysisSchema`) et semé sur les trois dossiers qui
 * portent déjà `access_barrier` (Société Générale, SNCF, le client d’exemple).
 *
 * Cette suite tient l'invariant du tome 1 §6, DE FAÇON GÉNÉRIQUE — elle ne relit
 * pas les valeurs semées à la main, elle les recalcule depuis
 * `ADDRESSABILITY_AXES` et les compare :
 *
 *  - « non mesuré » n'est JAMAIS « 0 » : `max` est la somme des plafonds des
 *    SEULS axes mesurés, jamais 20 par défaut ;
 *  - les axes MESURÉS (ceux qui portent un facteur) et les axes `unmeasured`
 *    sont un partage EXACT des cinq axes — jamais les deux à la fois, jamais
 *    ni l'un ni l'autre ;
 *  - `score` est la somme des points des facteurs — « aucun résidu
 *    inexpliqué » ;
 *  - `unmeasured` NOMME `relation` sur Société Générale et SNCF : la salle de démo
 *    n'a aucun CRM connecté (`crm_connections` vide à dessein,
 *    `demo-coverage.ts`) et ces deux dossiers ne portent aucune mission.
 *
 * Si un jour quelqu'un sème `score: 0` (ou un `max` gonflé) pour un axe non
 * mesuré, cette suite doit rougir — c'est le test qui le PROUVE, à la fin.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #2298.4 (réfuté en production le 19/09/2026) — LE CLIENT D'EXEMPLE FAIT
 * EXCEPTION
 * ─────────────────────────────────────────────────────────────────────────
 * `_relation_axis` lit désormais missions/agenda/e-mails/correction en plus
 * du CRM. Le client d'exemple (`DEMO_DELIVERY_CLIENT`) PORTE des missions
 * signées (`missions_count = 12`, toutes RUNNING/FINISHED) — sans CRM connecté
 * en démo, c'est pourtant un compte qui « porte une mission et aucun CRM », le
 * témoin même du retour de production (ACTIA/LVMH). Son axe RELATION doit
 * donc être MESURÉ, jamais dans `unmeasured` : le laisser non mesuré serait
 * exactement le défaut réfuté — une donnée réelle (une mission SIGNÉE) que
 * l'écran ne cite pas.
 */

const AXIS_MAX = new Map<string, number>(ADDRESSABILITY_AXES.map(axis => [axis.key, axis.max]))
const ALL_AXES = ADDRESSABILITY_AXES.map(axis => axis.key)

function seededAddressabilityBlocks(): Array<{ label: string; value: unknown }> {
  const fromDossiers = DEMO_DOSSIERS.filter(
    dossier => (dossier.account.raw_analysis as Record<string, unknown>).addressability != null,
  ).map(dossier => ({
    label: dossier.account.company_name,
    value: (dossier.account.raw_analysis as Record<string, unknown>).addressability,
  }))

  return [
    ...fromDossiers,
    { label: DEMO_DELIVERY_CLIENT.account.company_name, value: DEMO_DELIVERY_CLIENT.analysis.addressability },
  ]
}

describe('adressabilité semée en démo — invariant « non mesuré n’est jamais 0 »', () => {
  const blocks = seededAddressabilityBlocks()

  it('sème l’adressabilité sur AU MOINS un dossier — sinon cette suite ne prouve rien', () => {
    // Preuve que le corpus n'est pas vide (une garde doit LIRE quelque chose).
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks.map(b => b.label)).toEqual(
      expect.arrayContaining(['Société Générale', 'SNCF', DEMO_DELIVERY_CLIENT.account.company_name]),
    )
  })

  it.each(blocks.map(b => [b.label, b.value] as const))('valide le contrat — %s', (_label, value) => {
    expect(addressabilitySchema.safeParse(value).success).toBe(true)
  })

  // #2298.4 — le client d'exemple PORTE des missions signées : son axe
  // RELATION est mesuré, il ne fait donc plus partie de ce témoin. Société
  // Générale et SNCF, eux, ne portent ni CRM ni mission — `relation` y reste NOMMÉ
  // « non mesuré », jamais fondu dans un score à zéro.
  const blocksWithoutMission = blocks.filter(b => b.label !== DEMO_DELIVERY_CLIENT.account.company_name)

  it.each(blocksWithoutMission.map(b => [b.label, b.value] as const))(
    '%s : `unmeasured` nomme `relation` — aucun CRM ni mission dans ce dossier',
    (_label, value) => {
      const parsed = addressabilitySchema.parse(value)
      expect(parsed.unmeasured).toContain('relation')
    },
  )

  /**
   * #2298.4 (réfuté en production le 19/09/2026) — « un compte qui porte une
   * mission et aucun CRM → l'axe cite la mission » (le test qui sait dire
   * NON). Avant ce lot, le seed du client d'exemple rangeait `relation` dans
   * `unmeasured` alors qu'il porte 12 missions signées — exactement le défaut
   * mesuré en production (ACTIA/LVMH) : une donnée réelle que l'écran ne
   * citait pas.
   */
  it('le client d’exemple (12 missions signées, aucun CRM) : `relation` est MESURÉ, jamais `unmeasured`', () => {
    const value = DEMO_DELIVERY_CLIENT.analysis.addressability
    const parsed = addressabilitySchema.parse(value)
    expect(parsed.unmeasured).not.toContain('relation')
    const relation = parsed.factors.find(factor => factor.axis === 'relation')
    expect(relation).toBeDefined()
    expect(relation?.evidence ?? '').toMatch(/mission/i)
    // Jamais le CRM : ce dossier n'en a aucun connecté en démo (`demo-coverage.ts`).
    expect(relation?.evidence ?? '').not.toMatch(/CRM/i)
  })

  it.each(blocks.map(b => [b.label, b.value] as const))(
    '%s : les axes MESURÉS et `unmeasured` se partagent EXACTEMENT les cinq axes',
    (_label, value) => {
      const parsed = addressabilitySchema.parse(value)
      const measured = new Set(parsed.factors.map(factor => factor.axis))
      for (const axis of ALL_AXES) {
        // Jamais les deux (un facteur ET listé « non mesuré »), jamais ni l'un
        // ni l'autre (un axe qui disparaît sans explication).
        expect(measured.has(axis)).toBe(!parsed.unmeasured.includes(axis))
      }
    },
  )

  it.each(blocks.map(b => [b.label, b.value] as const))(
    '%s : `max` = la somme des plafonds des SEULS axes mesurés — jamais 20 par défaut',
    (_label, value) => {
      const parsed = addressabilitySchema.parse(value)
      const measured = parsed.factors.map(factor => factor.axis)
      const expectedMax = measured.reduce((sum, axis) => sum + (AXIS_MAX.get(axis) ?? 0), 0)
      expect(parsed.max).toBe(expectedMax)
      // Le résultat de départ : le dossier n'a jamais tout mesuré, donc `max`
      // n'est jamais les 20 points que le barème réserve à l'adressabilité.
      expect(parsed.max).toBeLessThan(20)
    },
  )

  it.each(blocks.map(b => [b.label, b.value] as const))(
    '%s : `score` = la somme des points des facteurs — aucun résidu inexpliqué',
    (_label, value) => {
      const parsed = addressabilitySchema.parse(value)
      if (parsed.score === null) {
        expect(parsed.factors).toHaveLength(0)
        return
      }
      expect(parsed.score).toBe(parsed.factors.reduce((sum, factor) => sum + factor.points, 0))
    },
  )

  it('sait dire NON : un `max` qui compte un axe jamais mesuré ne passe pas cette suite', () => {
    // La preuve que l'assertion ci-dessus MORD : un seed qui gonflerait `max`
    // à 20 pour un seul axe mesuré — « non mesuré rendu 0 » un cran plus haut —
    // doit faire tomber le même calcul que celui qui vient de passer partout.
    const overclaimed = addressabilitySchema.parse({
      score: 2,
      max: 20,
      unmeasured: ['proportion', 'path', 'relation', 'access_cost'],
      factors: [{ axis: 'lock', label: 'x', points: 2, evidence: 'y', block: 'accessibility' as const }],
    })
    const measured = overclaimed.factors.map(factor => factor.axis)
    const expectedMax = measured.reduce((sum, axis) => sum + (AXIS_MAX.get(axis) ?? 0), 0)
    expect(overclaimed.max).not.toBe(expectedMax)
  })
})
