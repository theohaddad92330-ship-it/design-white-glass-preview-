import { EVIDENCE_GAP_LABELS, type EvidenceLevel, type ProjectEvidence } from '@bellum/contracts'
import { Badge, Text, Tooltip, TooltipContent, TooltipTrigger } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/**
 * #2119.2 / #2119.9 — LE NIVEAU DE PREUVE D'UNE LIGNE, NOMMÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE COMPOSANT REFERME
 * ─────────────────────────────────────────────────────────────────────────────
 * Les quatre niveaux existent au contrat depuis des mois
 * (`opportunity-ontology.ts`), l'API les calcule sur chaque ligne de
 * `GET /projects` — et aucun écran ne les lisait. Le commercial voyait donc une
 * ligne « détectée » et une ligne « confirmée » rendues de la même façon, alors
 * que l'une repose sur un article de presse et l'autre sur une parole. Les
 * confondre est ce qui fait écrire à un DSI qu'on a « noté son besoin » quand il
 * n'a rien demandé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS ÉTATS, ET POURQUOI ILS SE RENDENT DIFFÉREMMENT
 * ─────────────────────────────────────────────────────────────────────────────
 *  · `evidence === undefined` — l'API ne l'a pas dit (une réponse antérieure au
 *    champ, lue pendant la fenêtre de déploiement). Le composant est MUET :
 *    afficher « non mesuré » serait affirmer quelque chose qu'on n'a pas reçu.
 *  · `evidence.level === null` — l'API a répondu, et la réponse est « rien de
 *    daté, rien d'exprimé ». C'est NON MESURÉ, et ça se DIT. Jamais « 0 », jamais
 *    le plus bas des quatre niveaux par défaut (GA-18 / GA-19) : `fact` exige un
 *    événement daté ET sourcé, l'attribuer d'office serait une invention.
 *  · un niveau — il s'affiche avec son exigence, et ce qui manque pour monter
 *    d'un cran est NOMMÉ, jamais compté ni chiffré.
 *
 * ⚠️ Aucune probabilité, jamais : ni « chances », ni score de fit, ni pourcentage
 * de complétude. `EVIDENCE_GAP_LABELS` donne des CRITÈRES — « aucun décideur
 * identifié » se vérifie, « 40 % de chances » ne se vérifie pas.
 */
export function OpportunityEvidenceBadge({ evidence }: { evidence?: ProjectEvidence }) {
  const { t, i18n } = useTranslation('projects')
  // L'API n'a pas dit : on se tait. Ce n'est pas la même chose que « non mesuré ».
  if (!evidence) return null

  const lang = i18n.language.startsWith('en') ? 'en' : 'fr'

  if (evidence.level === null) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="cursor-help outline-none">
            <Badge variant="outline">{t('evidence.unmeasured')}</Badge>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {t('evidence.unmeasuredHint')}
        </TooltipContent>
      </Tooltip>
    )
  }

  const label = t(`evidence.levels.${evidence.level}`)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} aria-label={t('evidence.ariaLabel', { level: label })} className="cursor-help outline-none">
          <Badge variant={badgeVariant(evidence.level)}>{label}</Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {/* L'exigence du barème, MOT POUR MOT depuis le contrat — jamais
            reformulée ici : deux écritures de la même règle divergent à la
            première retouche. */}
        <Text size="xs">{evidence.requirement ? evidence.requirement[lang] : null}</Text>
        {evidence.missing.length > 0 ? (
          <Text size="xs" className="mt-2">
            {t('evidence.missingPrefix')} {evidence.missing.map(gap => EVIDENCE_GAP_LABELS[gap][lang]).join(' ')}
          </Text>
        ) : null}
      </TooltipContent>
    </Tooltip>
  )
}

/** Le niveau monte, la teinte monte avec lui. Aucune n'est « mauvaise » : un
 *  fait daté est une bonne nouvelle, il n'est simplement pas une demande. */
function badgeVariant(level: EvidenceLevel): 'default' | 'primary' | 'success' {
  if (level === 'opportunity') return 'success'
  if (level === 'confirmed_demand') return 'primary'
  return 'default'
}
