import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { OUTBOUND_WRITE_KINDS, type OutboundWriteKind } from './outbound-write-preview'

/**
 * Chaque nature d'écriture CRM déclarée franchit RÉELLEMENT la porte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT DU 22/08
 * ─────────────────────────────────────────────────────────────────────────────
 * `OUTBOUND_WRITE_KINDS` déclare sept natures depuis le 21/08 — et l'arbitrage
 * était « TOUTES les écritures CRM ». Deux seulement passaient par la porte.
 * `create_task` et `log_meeting` écrivaient chez le fournisseur en direct ;
 * `create_company`, `create_list` et `enroll_sequence` n'avaient aucun
 * producteur du tout.
 *
 * Cinq valeurs d'énumération déclarées, testées, prévisualisées — et jamais
 * produites. C'est le pendant exact du défaut « chemin d'écriture sans
 * appelant » que `wired-write-paths.spec.ts` attrape, vu par l'autre bout : ici
 * c'est le VOCABULAIRE qui est livré sans emploi.
 *
 * ⚠️ Trois natures restent sans producteur, et c'est un CONSTAT gelé, pas une
 * permission. La liste ne doit que rétrécir : le jour où le CRM profond passe
 * par la porte, on retire la ligne.
 */

const MODULES = join(__dirname, '..')

/** Natures déclarées et non encore produites au 22/08/2026. `create_company`
 *  en est sortie le 14/10/2026 : la création de société passe par la porte
 *  commune (#4186, `CrmWriteService`). `enroll_sequence` est produite côté main. */
const UNPRODUCED_AT_FREEZE: OutboundWriteKind[] = ['create_list']

function sources(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sources(full))
    else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) out.push(full)
  }
  return out
}

describe('les natures d’écriture CRM ont un producteur', () => {
  // Les LECTEURS d'une nature ne la produisent pas : la prévisualisation, et la
  // vue d'une demande d'écriture qui classe son risque (vague 24).
  const corpus = sources(MODULES)
    .filter(file => !file.endsWith('outbound-write-preview.ts'))
    .filter(file => !file.endsWith('crm-write-request-view.ts'))
    .map(file => readFileSync(file, 'utf8'))
    .join('\n')

  /** Le seul emploi qui compte : passer la nature à la porte. */
  const produced = OUTBOUND_WRITE_KINDS.filter(kind => corpus.includes(`'${kind}'`))
  const unproduced = OUTBOUND_WRITE_KINDS.filter(kind => !produced.includes(kind))

  it('aucune nature NOUVELLE n’est déclarée sans franchir la porte', () => {
    const added = unproduced.filter(kind => !UNPRODUCED_AT_FREEZE.includes(kind))
    if (added.length > 0) {
      throw new Error(
        [
          'Une nature d’écriture CRM est déclarée et jamais produite. Une valeur',
          'd’énumération sans emploi se prend pour une capacité livrée — et la',
          'prévisualisation qui va avec ne prévisualise rien.',
          '',
          ...added.map(kind => `  · ${kind}`),
        ].join('\n'),
      )
    }
    expect(added).toEqual([])
  })

  it('la liste gelée ne fait que RÉTRÉCIR', () => {
    const stale = UNPRODUCED_AT_FREEZE.filter(kind => produced.includes(kind))
    // Si ce test tombe : ces natures passent désormais par la porte, retire-les
    // de la liste. Une liste qui garde des lignes mortes finit par ne plus rien dire.
    expect(stale).toEqual([])
  })

  it('les deux natures réparées le 22/08 franchissent bien la porte', () => {
    // Sans cette assertion, vider `OUTBOUND_WRITE_KINDS` ferait passer les deux
    // tests ci-dessus au vert.
    expect(produced).toContain('create_task')
    expect(produced).toContain('log_meeting')
    expect(produced).toContain('export_contact')
    expect(produced).toContain('create_note')
  })
})
