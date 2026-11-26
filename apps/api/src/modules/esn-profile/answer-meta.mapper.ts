import {
  answerMetaSchema,
  CURRENT_QUESTIONNAIRE_VERSION,
  QUESTION_CONSUMERS,
  resolveAnswerBranchReason,
  type AnswerMeta,
  type AnswerMetaMap,
  type EsnAnswers,
  type SaveAnswers,
} from '@bellum/contracts'
import type { EsnProfileEntity } from '../../database/entities/esn-profile.entity'

/**
 * #2006.22 — projette `esn_profiles.answer_meta` (colonne JSONB ADDITIVE,
 * migration `1795000000001-OnboardingAnswerMeta.ts`) sur {@link AnswerMetaMap}.
 *
 * Une ligne écrite AVANT ce lot n'a pas la colonne (le défaut SQL `'{}'` la
 * couvre) : `{}` en sortie, jamais une exception. Une entrée dont la forme a
 * dérivé (un ancien format, une corruption manuelle) est ÉCARTÉE clé par clé
 * plutôt que de faire échouer la lecture du profil ENTIER — le même principe
 * que `offerDomain.catch(null)` dans `esn-answers.mapper.ts` : un champ mal
 * formé dégrade CE champ, jamais tout le voisinage.
 *
 * `resolveAnswerStatus` (`@bellum/contracts`) referme la boucle : appelée sur
 * une entrée ABSENTE d'ici (clé jamais migrée), elle rend `proposed`, jamais
 * `confirmed` — c'est la garantie que #2006.22 demande, tenue en un seul
 * endroit plutôt que réimplémentée à chaque appelant.
 */
export function mapRowToAnswerMeta(row: EsnProfileEntity | null): AnswerMetaMap {
  const raw = row?.answer_meta
  if (!raw || typeof raw !== 'object') return {}

  const result: AnswerMetaMap = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = answerMetaSchema.safeParse(value)
    if (parsed.success) result[key] = parsed.data
  }
  return result
}

/**
 * #2006.22 (décision Louis 20/09/2026, QCM) — « une réponse saisie ou
 * corrigée par l'utilisateur est `confirmed`. C'est le geste humain qui
 * confirme, rien d'autre. » Referme le fil que le lot précédent avait laissé
 * ouvert : `mapRowToAnswerMeta` lisait déjà `answer_meta`, rien ne l'écrivait
 * jamais sur une sauvegarde.
 *
 * ⚠️ `changed`, PAS `touched` : `answers` peut porter des clés dont la valeur
 * N'A PAS changé — `ProfileStagePage` (`useProfileAnswers`) réenvoie l'objet
 * COMPLET des réponses déjà chargées à chaque sauvegarde automatique, pas
 * seulement le champ que l'utilisateur vient de modifier. Stamper toute clé
 * PRÉSENTE (comme le fait `stampEffectifObservedAt` juste à côté, pour une
 * autre colonne) confirmerait donc, à la moindre frappe sur UN champ,
 * l'intégralité du profil déjà rempli — exactement l'inverse honnête que
 * #2006.22 demande. `before` (les réponses résolues AVANT cette écriture)
 * permet de ne stamper QUE ce qui diffère réellement, le même principe que
 * `changedProfileFields` (`esn-profile.service.ts`) pour le journal §8.
 *
 * Une correction humaine gagne toujours (doctrine du dépôt) : cette fonction
 * ne fait qu'ÉCRIRE la correction la plus récente pour les clés qui ont
 * vraiment bougé — une clé absente de `changed` garde EXACTEMENT son entrée
 * précédente, jamais rétrogradée ni retouchée.
 *
 * `label` porte la clé technique, pas un texte affiché : aucun catalogue
 * atteignable depuis l'API ne couvre aujourd'hui les ~190 clés d'`EsnAnswers`
 * avec un libellé humain — seules ~57 questions du profil progressif ont un
 * chemin i18n `profileQuestions.items.<clé>.label` (`apps/web`, inatteignable
 * depuis `apps/api`, et de toute façon partiel). Écrire un libellé inventé
 * pour les ~130 clés restantes mentirait au contrat ; la clé technique ne
 * ment jamais — c'est un aveu documenté, pas une invention (#2006.22 : « un
 * motif de branchement faux est pire qu'un motif absent », même principe
 * appliqué ici au libellé). `branchReason` et `consumerAreas`, eux, sont
 * BRANCHÉS sur des classifications réelles déjà vérifiées par le code :
 * {@link resolveAnswerBranchReason} (mêmes règles que `splitAnswersByScope`)
 * et `QUESTION_CONSUMERS` (`onboarding-question-consumers.ts`, `Record`
 * total sur `keyof EsnAnswers` — jamais vide pour une clé valide).
 */
export function stampAnswerMeta(
  entity: EsnProfileEntity,
  answers: SaveAnswers,
  before: EsnAnswers,
  userId: string,
  now: Date,
): void {
  const changedKeys = (Object.keys(answers) as (keyof SaveAnswers)[]).filter(key => {
    const value = answers[key]
    if (value === undefined) return false
    return JSON.stringify(value) !== JSON.stringify((before as Record<string, unknown>)[key as string])
  })
  if (changedKeys.length === 0) return

  const nowIso = now.toISOString()
  const stamped: Record<string, AnswerMeta> = {}
  for (const key of changedKeys) {
    const answerKey = key as keyof EsnAnswers
    stamped[key as string] = {
      question: { key: key as string, label: key as string, version: CURRENT_QUESTIONNAIRE_VERSION },
      questionnaireVersion: CURRENT_QUESTIONNAIRE_VERSION,
      provenance: { source: 'user', confidence: 'high', observedAt: nowIso, actorId: userId },
      status: 'confirmed',
      branchReason: resolveAnswerBranchReason(answerKey),
      consumerAreas: QUESTION_CONSUMERS[answerKey]?.areas ?? [],
    }
  }
  entity.answer_meta = { ...(entity.answer_meta ?? {}), ...stamped }
}

/**
 * #4425.4 — CONFIRMER une réponse SANS la réécrire : le geste « Confirmer » des
 * réponses dont l'origine n'est pas établie (valeur historique, aucune
 * enveloppe).
 *
 * Distinct de {@link stampAnswerMeta}, qui ne stampe QUE ce qui a changé (un
 * réenvoi complet inchangé ne doit rien confirmer — #2006.22) : ici la valeur
 * ne bouge pas, c'est le geste humain explicite qui confirme.
 *
 * - déjà `confirmed` / `corrected` → rien n'est retouché (une correction
 *   humaine gagne toujours, quelle que soit sa date) ;
 * - une ORIGINE stockée (registre, site, connecteur…) est GARDÉE : confirmer
 *   n'efface pas d'où vient la valeur, ça dit seulement qu'un humain l'a relue ;
 * - sans origine (aucune enveloppe, ou `unknown`) → la personne qui confirme
 *   devient la source (`user`), c'est le seul fait que le code connaisse.
 *
 * Rend `true` quand l'entité a changé (l'appelant sauvegarde alors).
 */
export function confirmAnswerMeta(entity: EsnProfileEntity, key: keyof EsnAnswers, userId: string, now: Date): boolean {
  const parsed = answerMetaSchema.safeParse(entity.answer_meta?.[key as string])
  const existing = parsed.success ? parsed.data : null
  if (existing && (existing.status === 'confirmed' || existing.status === 'corrected')) return false

  const hasOrigin = existing !== null && existing.status !== 'unknown'
  const confirmed: AnswerMeta = {
    question: existing?.question ?? {
      key: key as string,
      label: key as string,
      version: CURRENT_QUESTIONNAIRE_VERSION,
    },
    questionnaireVersion: existing?.questionnaireVersion ?? CURRENT_QUESTIONNAIRE_VERSION,
    provenance: hasOrigin
      ? existing.provenance
      : { source: 'user', confidence: 'high', observedAt: now.toISOString(), actorId: userId },
    status: 'confirmed',
    branchReason: existing?.branchReason ?? resolveAnswerBranchReason(key),
    consumerAreas: existing?.consumerAreas ?? QUESTION_CONSUMERS[key]?.areas ?? [],
  }
  entity.answer_meta = { ...(entity.answer_meta ?? {}), [key as string]: confirmed }
  return true
}
