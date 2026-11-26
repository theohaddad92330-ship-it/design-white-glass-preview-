import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Text } from '@bellum/ui'
import { activeLoadMissingAnswers } from '../lib/active-load-missing-answers'
import { AuditCard } from './AuditCard'
import type { AuditUnestablishedEntry } from '../lib/build-audit'

/**
 * #2071.7 — CE QUI REMPLACE LE « NIVEAU DE CONFIANCE » DEMANDÉ.
 *
 * Le retour demandait un niveau de confiance dans l'entête. Un chiffre unique
 * y aurait été lu comme une chance de réussite — refusé six fois dans ce
 * produit — et il aurait de toute façon mesuré la complétude de NOS données,
 * pas l'activité de l'utilisateur. Un score décomposé n'est pas possible non
 * plus : sous trois axes il n'y a pas de score, et aucun axe n'est noté ici.
 *
 * Ce qui reste vrai et utile : la LISTE NOMMÉE de ce qui n'a pas pu être
 * établi, avec la porte pour le compléter.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Défaut du 16/09/2026 — CE QUE CE COMPOSANT NE S'AUTORISE PLUS À DIRE
 * ─────────────────────────────────────────────────────────────────────────
 * Mesuré en production le 16/09/2026 : il écrivait « Tout ce que cet écran
 * affiche a pu être établi » pendant que trois blocs de la MÊME page rendaient
 * « non mesuré ». La cause était dans la dérivation (voir `blockStates` dans
 * `lib/build-audit.ts`), et elle est réparée là-bas : ici, la seule règle est
 * que `unestablished.none` ne sort QUE sur une liste réellement vide.
 *
 * DEUX RAISONS, DEUX PORTES. Un bloc qui manque parce que le profil ne le
 * renseigne pas se répare en complétant le profil ; un bloc qu'aucune source
 * ne produit encore ne se répare pas de ce côté — proposer le questionnaire
 * pour lui serait une fausse promesse. Le lien n'apparaît donc que si au moins
 * une entrée est réparable par l'utilisateur.
 *
 * ⚠️ Le libellé d'une entrée se lit dans `origin.*`, le MÊME catalogue que les
 * lignes « Source : … » des autres blocs de l'audit — un nom de bloc ne
 * s'écrit pas deux fois. Les trois blocs du contrat (plan, paliers,
 * configuration) y ont leur entrée sans être des `AuditOrigin` : les
 * composants qui rendent « Source : … » sont typés sur `AuditOrigin` et ne
 * peuvent donc pas les atteindre.
 */
/**
 * #2457 — la raison d'un bloc DÉRIVÉ (`verdict`/`maturity`/`priority`) porte
 * un COMPTE, pas une clé nue : « aucune des 18 règles de tension n'a détecté
 * de rupture » NOMME ce qui a manqué et COMBIEN, jamais un « indisponible ».
 * `maturity` porte SES TROIS nombres (axes évalués / total / seuil minimal) —
 * jamais un taux : « 2 sur 12 axes évalués » n'est pas une couverture de
 * marché (GA-259), c'est un compte de ce qu'on a pu mesurer.
 */
/**
 * Exportée pour `AuditPdfDocument.tsx` (#2075.23) — le PDF rend la MÊME
 * raison que l'écran pour le bloc « Limites », jamais une seconde dérivation
 * qui pourrait diverger (GA-26).
 */
export function unestablishedReasonText(
  entry: AuditUnestablishedEntry,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  // #2067.2 / .4 / .5 / .6 — une grandeur de l'arbitrage NOMME la réponse qui
  // lui manque : « ton profil ne le renseigne pas encore » ne dirait pas laquelle.
  if ('missingAnswers' in entry) {
    return t('unestablished.reason.answerMissing', { answers: activeLoadMissingAnswers(entry.missingAnswers, t) })
  }
  if (entry.reason !== 'notConcluded') return t(`unestablished.reason.${entry.reason}`)
  if (entry.key === 'maturity') {
    return t('unestablished.reason.notConcludedMaturity', {
      axesEvaluated: entry.axesEvaluated,
      axesTotal: entry.axesTotal,
      axesMinimum: entry.axesMinimum,
    })
  }
  // #2074.10-.15 / #2090.7 — `moves` porte SA raison : sans rupture, il n'y a
  // pas de geste à proposer, ce qui n'est pas la même phrase que « aucun
  // conseil n'a pu être tiré ».
  const REASON_BY_KEY: Partial<Record<AuditUnestablishedEntry['key'], string>> = {
    verdict: 'notConcludedVerdict',
    moves: 'notConcludedMoves',
    hypotheses: 'notConcludedHypotheses',
  }
  const reasonKey = REASON_BY_KEY[entry.key] ?? 'notConcludedPriority'
  return t(`unestablished.reason.${reasonKey}`, { rulesChecked: entry.rulesChecked })
}

export function AuditUnestablished({ entries }: { entries: AuditUnestablishedEntry[] }) {
  const { t } = useTranslation('commercialAudit')
  const hasProfileGap = entries.some(entry => entry.reason === 'profileMissing')

  return (
    <AuditCard className="space-y-2">
      <Text element="h2" size="lg" weight="semibold">
        {t('unestablished.title')}
      </Text>
      <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('unestablished.description')}
      </Text>
      {entries.length === 0 ? (
        <Text element="p" size="sm">
          {t('unestablished.none')}
        </Text>
      ) : (
        <>
          <ul className="space-y-1">
            {entries.map(entry => (
              <li key={entry.key}>
                {/* Un seul nœud texte : un libellé et sa raison se lisent
                    ensemble, et un lecteur d'écran comme un test peuvent
                    cibler la ligne entière. */}
                <Text element="p" size="sm">
                  {t('unestablished.item', {
                    label: t(`origin.${entry.key}`),
                    reason: unestablishedReasonText(entry, t),
                  })}
                </Text>
              </li>
            ))}
          </ul>
          {hasProfileGap ? (
            <Link
              to="/settings/profile"
              className="inline-flex items-center pointer-coarse:min-h-11 text-sm font-medium text-[var(--bellum-text-accent)]"
            >
              {t('unestablished.cta')}
            </Link>
          ) : null}
        </>
      )}
    </AuditCard>
  )
}
