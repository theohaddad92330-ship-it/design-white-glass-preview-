import type { TFunction } from 'i18next'
import type { LauraContextFacet, LauraPageContext } from '@bellum/contracts'
import { SEQUENCE_BUCKETS, type SequenceBucket } from '../sequences-cockpit'

/**
 * #1904 — CE QUE L'ÉCRAN SÉQUENCES DÉCLARE À LAURA.
 *
 * #1904.11 : sans messagerie connectée, les séquences se préparent mais rien ne
 * part. Laura doit le savoir AVANT de proposer une relance — c'est le manque
 * que cet écran nomme en premier. Un état de messagerie INCONNU (lecture en
 * cours ou en échec) ne se déclare pas « non connecté ».
 *
 * Les compteurs sont ceux des quatre tuiles (`bucketCounts`), jamais recalculés :
 * Laura lit le chiffre que la personne voit.
 */

/** Borne du contrat pour `purpose`. */
const PURPOSE_MAX = 160

type SequencesContextInput = {
  isLoading: boolean
  /** Le nombre de séquences — `null` quand la liste n'a pas été lue. */
  total: number | null
  /** Les quatre tuiles — `null` quand la liste n'a pas été lue. */
  counts: Record<SequenceBucket, number> | null
  /** `null` = état de la messagerie non mesuré. */
  mailboxConnected: boolean | null
}

export function sequencesLauraContext(t: TFunction<'outreach'>, input: SequencesContextInput): LauraPageContext {
  const facets: LauraContextFacet[] = []
  if (input.total !== null) facets.push({ label: t('laura.total'), value: String(input.total) })
  if (input.counts) {
    for (const key of SEQUENCE_BUCKETS) facets.push({ label: t(`kpi.${key}`), value: String(input.counts[key]) })
  }

  const missing: string[] = []
  if (input.mailboxConnected === false) missing.push(t('laura.mailboxMissing'))
  if (input.total === 0) missing.push(t('page.empty.title'))

  // Les gestes RENDUS : le bouton de l'entête, et la porte de l'état vide — la
  // même alternative que l'écran (`canSend ? cta : ctaConnect`).
  const actions = [t('page.create')]
  if (input.total === 0)
    actions.push(input.mailboxConnected === true ? t('page.empty.cta') : t('page.empty.ctaConnect'))

  const purpose = t('page.subtitle')
  return {
    kind: 'screen',
    label: t('page.title'),
    entityId: null,
    facets,
    state: input.isLoading ? 'loading' : 'ready',
    purpose: purpose.length <= PURPOSE_MAX ? purpose : `${purpose.slice(0, PURPOSE_MAX - 1)}…`,
    ...(missing.length > 0 ? { missing } : {}),
    actions,
  }
}
