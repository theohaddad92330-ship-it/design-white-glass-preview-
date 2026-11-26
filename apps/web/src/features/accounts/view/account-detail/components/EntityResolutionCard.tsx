import { Button } from '@bellum/ui'
import { Building2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  applyEntityResolutionCorrections,
  type EntityResolution,
  type EntityResolutionCorrection,
  type EntityResolutionCorrectionRequest,
} from '@bellum/contracts'

/**
 * #2284 — Entity Resolver P0 : QUELLE entreprise ce dossier décrit.
 *
 * Lit `raw_analysis.entity_resolution` (écrit par
 * `apps/ia/app/services/entity_resolution.py`, qui compose les verdicts
 * homonymes + identité registre/web). Rien n'est recalculé ici (GA-26).
 *
 * - l'état et le type se nomment (maison mère ≠ groupe ≠ filiale) ;
 * - les sources se nomment par CATÉGORIE, jamais par fournisseur ;
 * - #2284.70 — une filiale porte un avertissement : ses données ne sont pas
 *   celles du groupe ;
 * - #2284.65 — une ambiguïté se pose en question, candidats nommés ;
 * - « non mesuré » ≠ 0 : pas de confiance ni de nombre de filiales inventés.
 *
 * Muette sur un dossier antérieur à #2284 (`resolution === null`).
 * `normalized_name` n'est jamais listé comme source : c'est la requête, pas
 * une preuve — le nom seul ne résout rien (#2284.28).
 */
export function EntityResolutionCard({
  resolution: computed,
  corrections = NO_CORRECTIONS,
  onCorrect,
  pending = false,
}: {
  resolution: EntityResolution | null
  /** #2284.67-.69 — les corrections de l'espace, superposées au calcul (jamais réécrit). */
  corrections?: readonly EntityResolutionCorrection[]
  /** #2284.65 — la porte du geste ; absente, la carte reste en lecture seule. */
  onCorrect?: (request: EntityResolutionCorrectionRequest) => void
  pending?: boolean
}) {
  const { t } = useTranslation('accountDetail')
  // #2284.67 — la correction humaine gagne, quelle que soit la date du calcul.
  const resolution = applyEntityResolutionCorrections(computed, corrections)
  if (!resolution) return null
  const latestVersion = corrections.reduce((max, correction) => Math.max(max, correction.version), 0)

  const anchored = resolution.canonical_id !== null
  const siren = anchored ? resolution.identifiers['siren'] : undefined
  const sources = resolution.sources.filter(source => source !== 'normalized_name')
  // R17 15/10 (#3917) — plusieurs détenteurs : le registre ne dit pas lequel est LE parent, aucune ligne
  // (« Filiale de ETG » pour Renault SAS). Un seul détenteur lu : il se nomme.
  const parent = resolution.parent_names.length === 1 ? resolution.parent_names[0] : undefined
  const formerLegalNames = resolution.former_legal_names ?? []
  // Après un rejet, un candidat restant se montre encore (état `unresolved`) :
  // il n'est pas confirmé, mais il reste la piste à trancher.
  const candidates = !anchored ? (resolution.question?.candidates ?? []) : []
  const anchoredName = resolution.legal_name ?? resolution.commercial_name

  return (
    <section
      aria-labelledby="entity-resolution-title"
      className="rounded-xl border border-[var(--bellum-border)] bg-[color-mix(in_srgb,var(--bellum-surface-1)_60%,transparent)] px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Building2 className="size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
        <h3 id="entity-resolution-title" className="text-sm font-medium text-[var(--bellum-text-primary)]">
          {t(`overview.entityResolution.state.${resolution.state}`)}
        </h3>
        {resolution.kind ? (
          <span className="rounded-md border border-[var(--bellum-border)] px-1.5 py-0.5 text-xs text-[var(--bellum-text-secondary)]">
            {t(`overview.entityResolution.kind.${resolution.kind}`)}
          </span>
        ) : null}
        {resolution.confidence !== null ? (
          <span className="text-xs text-[var(--bellum-text-muted)]">
            {t('overview.entityResolution.confidence', { value: resolution.confidence })}
          </span>
        ) : null}
      </div>

      {anchored ? (
        <p className="mt-1 text-xs text-[var(--bellum-text-muted)]">
          {[
            resolution.legal_name,
            siren ? t('overview.entityResolution.siren', { siren }) : null,
            resolution.location,
            resolution.children_count
              ? t('overview.entityResolution.children', { count: resolution.children_count })
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      ) : null}

      {resolution.kind === 'subsidiary' && parent ? (
        <p role="note" className="mt-2 text-xs text-[var(--bellum-text-secondary)]">
          {t('overview.entityResolution.subsidiaryWarning', { parent })}
        </p>
      ) : null}

      {/* #2284.58 — les dénominations antérieures du registre légal, jamais une
          correction CRM. Absentes = jamais affichées (« on n'affiche pas ce
          qu'on n'a pas »). */}
      {formerLegalNames.length > 0 ? (
        <p className="mt-1 text-xs text-[var(--bellum-text-muted)]">
          {t('overview.entityResolution.formerlyKnownAs', { names: formerLegalNames.join(', ') })}
        </p>
      ) : null}

      {candidates.length > 0 ? (
        <div className="mt-2">
          <p className="text-xs text-[var(--bellum-text-secondary)]">{t('overview.entityResolution.question')}</p>
          <ul className="mt-1 space-y-0.5">
            {candidates.map((candidate, index) => (
              <li
                key={`${candidate.siren ?? candidate.name}-${index}`}
                className="flex flex-wrap items-center gap-2 text-xs text-[var(--bellum-text-muted)]"
              >
                <span>
                  {[
                    candidate.name,
                    candidate.city,
                    candidate.siren ? t('overview.entityResolution.siren', { siren: candidate.siren }) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {onCorrect ? (
                  <CorrectionButtons
                    name={candidate.name}
                    siren={candidate.siren ?? null}
                    onCorrect={onCorrect}
                    pending={pending}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!anchored && resolution.reasons.length > 0 ? (
        <ul className="mt-1 space-y-0.5">
          {resolution.reasons.map(reason => (
            <li key={reason} className="text-xs text-[var(--bellum-text-muted)]">
              {reason}
            </li>
          ))}
        </ul>
      ) : null}

      {/* Kineis — « Résolue par » n'a de sens que pour une entité ANCRÉE : sous « ambiguë » / « non résolue »,
          il se contredisait lui-même. Les sources d'une ambiguïté restent lisibles dans ses raisons. */}
      {anchored && sources.length > 0 ? (
        <p className="mt-1 text-xs text-[var(--bellum-text-muted)]">
          {t('overview.entityResolution.sources', {
            sources: sources.map(source => t(`overview.entityResolution.source.${source}`)).join(', '),
          })}
        </p>
      ) : null}

      {latestVersion > 0 ? (
        <p className="mt-1 text-xs text-[var(--bellum-text-secondary)]">
          {t('overview.entityResolution.correctedBy', { version: latestVersion })}
        </p>
      ) : null}

      {anchored && onCorrect ? (
        <div className="mt-2">
          <CorrectionButtons
            name={anchoredName}
            siren={siren ?? null}
            onCorrect={onCorrect}
            pending={pending}
            hideConfirm={resolution.state === 'manual_override'}
          />
        </div>
      ) : null}
    </section>
  )
}

const NO_CORRECTIONS: readonly EntityResolutionCorrection[] = []

/** « C'est bien celle-ci » / « Ce n'est pas celle-ci » — le libellé visible est
 *  court, le nom accessible NOMME l'entreprise visée (GA-32). */
function CorrectionButtons({
  name,
  siren,
  onCorrect,
  pending,
  hideConfirm = false,
}: {
  name: string
  siren: string | null
  onCorrect: (request: EntityResolutionCorrectionRequest) => void
  pending: boolean
  hideConfirm?: boolean
}) {
  const { t } = useTranslation('accountDetail')
  return (
    <span className="inline-flex flex-wrap gap-1">
      {hideConfirm ? null : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="pointer-coarse:min-h-11"
          disabled={pending}
          aria-label={t('overview.entityResolution.confirmNamed', { name })}
          onClick={() => onCorrect({ decision: 'confirmed', target_name: name, target_siren: siren })}
        >
          {t('overview.entityResolution.confirm')}
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="pointer-coarse:min-h-11"
        disabled={pending}
        aria-label={t('overview.entityResolution.rejectNamed', { name })}
        onClick={() => onCorrect({ decision: 'rejected', target_name: name, target_siren: siren })}
      >
        {t('overview.entityResolution.reject')}
      </Button>
    </span>
  )
}
