import { z } from 'zod'
import { ACCOUNT_SCORE_MIN_EVALUATED_AXES } from '../account-score.js'
import { nullableString } from './base.js'

/**
 * #2118.4 / .6 / .19-.20 / .22-.28 / .30-.37 / .39-.40 / .44-.47 / .52 —
 * LA LECTURE DU DOSSIER, EN CONTRAT FERMÉ.
 *
 * **Le défaut mesuré.** Les axes du score d'évaluation d'un compte étaient du
 * TEXTE LIBRE : `score_factors[].label` vient du modèle
 * (`apps/ia/app/services/score_axes.py`), et l'écran affichait ce que le
 * modèle avait bien voulu écrire ce jour-là (`scoreFactors.ts:69`). Deux
 * conséquences : un axe pouvait changer de nom d'une analyse à l'autre — donc
 * rien n'était comparable — et un axe NON évaluable disparaissait purement et
 * simplement de la liste, au lieu d'être nommé. Un axe qu'on ne voit pas ne se
 * distingue pas d'un axe à zéro : c'est « non mesuré rendu 0 » par omission.
 *
 * D'où sept axes FIXES, nommés ici et nulle part ailleurs, et un état par axe.
 *
 * **Pourquoi pas les axes existants.** Trois jeux d'axes vivaient déjà dans le
 * dépôt, et aucun ne répond à la demande :
 *  - `apps/ia/app/services/account_score.py` (`SCORE_AXES`, la grille /25 de
 *    l'annexe méthodo) — cinq axes, aucun état, aucun levier, et son total sert
 *    au verdict GO/PRUDENT/STOP. Il reste la RÈGLE du verdict ; ce contrat-ci
 *    est la LECTURE qu'on en donne, pas un second verdict.
 *  - `apps/ia/app/services/discover_scoring.py` — les sept axes existent là,
 *    mais pour Découvrir (un autre écran, un autre objet). S'en inspirer,
 *    jamais s'y coupler : deux écrans qui partagent un module partagent aussi
 *    ses évolutions.
 *  - `packages/contracts/src/schemas/account-briefing.ts` — cinq axes + huit
 *    blocs, écrits le 02/08 et JAMAIS appelés par `apps/` (le défaut n°1 du
 *    dépôt : du code juste que personne n'appelle). On ne le recycle pas en
 *    douce : il ne porte ni les sept axes, ni l'état par axe, ni le no-go
 *    temporaire.
 *
 * **Tous les champs sont optionnels, sans exception.** Des milliers
 * d'analyses écrites avant ce lot n'ont pas ce bloc, et un dossier ancien doit
 * continuer à s'afficher — champ absent = `unknown`, jamais une panne, jamais
 * un 0.
 */

/**
 * Les SEPT axes, dans l'ordre où ils se lisent. L'ordre est celui du registre
 * (#2118.30 → .36) : ce que je vends, à qui, quand, par où, avec quel argent,
 * contre qui, et sur quelles preuves.
 *
 * Ajouter un axe est possible (en FIN de liste, GA-08) ; en retirer un ne
 * l'est pas — la valeur est écrite dans `raw_analysis` des comptes déjà
 * analysés.
 */
export const DOSSIER_SCORE_AXES = [
  /** #2118.30 — ton offre répond-elle aux problèmes de ce compte ? */
  'adequation_offre',
  /** #2118.31 — le compte a-t-il du volume à confier, et à quelle échéance ? */
  'potentiel_commercial',
  /** #2118.32 — les faits sur lesquels on juge sont-ils d'aujourd'hui ? */
  'fraicheur',
  /**
   * #2118.33 — peut-on atteindre un décideur, ou le compte est-il fermé ?
   * #2306.5 — tranché sans Louis (recommandation la plus sûre, GA-08 : ajouter
   * un axe change le dénominateur /35 de milliers d'analyses déjà écrites) :
   * les CONDITIONS d'engagement (taille du compte, budget, localisation,
   * modèle contractuel, TJM praticable) sont ABSORBÉES ici plutôt qu'un
   * huitième axe dédié — c'est déjà leur périmètre (« peut-on atteindre ce
   * compte, à ces conditions »), pas un fait séparé sur l'offre ou le prix.
   */
  'accessibilite',
  /** #2118.34 — ce compte achète-t-il de la prestation externe, et sait-il le faire ? */
  'capacite_achat_externe',
  /** #2118.35 — qui est déjà en place, et sur quel périmètre ? */
  'concurrence',
  /** #2118.36 — ce qui fonde les six autres est-il sourcé ou supposé ? */
  'qualite_preuves',
] as const
export type DossierScoreAxisKey = (typeof DOSSIER_SCORE_AXES)[number]
export const dossierScoreAxisKeySchema = z.enum(DOSSIER_SCORE_AXES)

/**
 * #2118.37 — l'état d'un axe, TOUJOURS dit.
 *
 *  - `measured` — on a de quoi noter cet axe.
 *  - `partial`  — on a de quoi noter, sur des preuves minces ; la note compte,
 *                 et l'écran doit dire qu'elle est fragile.
 *  - `unknown`  — on n'a PAS de quoi noter. Aucune note : l'axe sort du
 *                 dénominateur (GA-18 / GA-19), il n'abaisse rien.
 */
export const DOSSIER_AXIS_STATES = ['measured', 'partial', 'unknown'] as const
export type DossierAxisState = (typeof DOSSIER_AXIS_STATES)[number]
export const dossierAxisStateSchema = z.enum(DOSSIER_AXIS_STATES)

/** La note maximale d'un axe. Sept axes × 5 = 35 quand les sept sont mesurés —
 *  mais le dénominateur RÉEL se calcule, il ne se recopie pas. */
export const DOSSIER_AXIS_MAX = 5

/**
 * Doctrine c26, « un score n'est jamais nu » : sous le plancher, il n'y a pas
 * de score.
 *
 * #4016.L9.a — ⚠️ RENVERSEMENT DATÉ du 13/10/2026 (Louis) : le plancher passe
 * de trois à DEUX axes notés, et il vit dans `account-score.ts`
 * ({@link ACCOUNT_SCORE_MIN_EVALUATED_AXES}) — ce fichier le reprend, il ne le
 * redit pas. Ancien texte : ~~« sous trois axes notés, il n'y a pas de score.
 * Deux axes sur sept ne décrivent pas un compte, ils décrivent ce qu'on a eu
 * le temps de collecter. »~~ Le score dit désormais sur combien d'axes il
 * repose (`scoredAxes` sur `DOSSIER_SCORE_AXES.length`).
 */
export const DOSSIER_SCORE_MIN_MEASURED_AXES = ACCOUNT_SCORE_MIN_EVALUATED_AXES

/**
 * #2306.30 — les DEUX axes dont dépendent l'accès à un décideur et la capacité
 * du compte à acheter de la prestation externe. Doctrine (CLAUDE.md, LAU-
 * FINAL-047) : « NO-GO : score élevé ne pousse pas vers accès/achat inconnu ».
 * Un score élevé calculé sur les cinq AUTRES axes ne dit RIEN de ces deux-là —
 * il ne doit jamais se lire comme un signal qu'on peut atteindre ce compte ou
 * lui vendre quelque chose. `computeDossierScore` nomme ce sous-ensemble dans
 * `cappedBy`, que le score ait pu être calculé ou non.
 */
export const DOSSIER_SCORE_CAP_AXES = [
  'accessibilite',
  'capacite_achat_externe',
] as const satisfies readonly DossierScoreAxisKey[]

/**
 * Un axe du score. `impact` dit ce que cet axe fait au verdict (#2118.39),
 * `lever` dit ce qui le ferait monter (#2118.40) — attachés à l'axe, pas
 * agrégés en bas de carte : un levier détaché de sa ligne ne se rattache à
 * rien.
 */
export const dossierScoreAxisSchema = z
  .object({
    key: dossierScoreAxisKeySchema,
    state: dossierAxisStateSchema,
    /** La note sur `DOSSIER_AXIS_MAX`. ABSENTE quand l'état est `unknown`. */
    value: z.number().min(0).max(DOSSIER_AXIS_MAX).optional().nullable(),
    /** L'effet de cet axe sur le verdict global, en une phrase. */
    impact: nullableString,
    /** Ce qui ferait monter cet axe, concrètement. */
    lever: nullableString,
  })
  .superRefine((axis, ctx) => {
    const hasValue = typeof axis.value === 'number'
    // #2118.52 — « non mesuré » n'est jamais un chiffre. Un `value: 0` sur un
    // axe `unknown` est exactement le zéro qui ment : il se somme, il se rend,
    // il se compare. Le contrat le refuse plutôt que de compter dessus.
    if (axis.state === 'unknown' && hasValue) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'un axe inconnu ne porte pas de note' })
    }
    // Symétrique : un axe déclaré mesuré sans note ne décompose rien — il
    // rendrait un état à l'écran et un trou dans le calcul.
    if (axis.state !== 'unknown' && !hasValue) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'un axe mesuré porte une note' })
    }
  })
export type DossierScoreAxis = z.infer<typeof dossierScoreAxisSchema>

/**
 * #2118.44 — une dimension de fiabilité. Même règle que pour un axe : `unknown`
 * ne porte pas de chiffre. « Couverture non mesurée » n'est pas « couverture
 * 0 % », et la nuance se perd dès qu'on écrit le zéro.
 */
export const dossierReliabilityDimensionSchema = z
  .object({
    state: dossierAxisStateSchema,
    /** 0-100. Absent quand l'état est `unknown`. */
    value: z.number().min(0).max(100).optional().nullable().default(null),
    note: nullableString,
  })
  .superRefine((dim, ctx) => {
    if (dim.state === 'unknown' && typeof dim.value === 'number') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'une dimension inconnue ne porte pas de chiffre',
      })
    }
  })

/**
 * #2118.44 — la fiabilité du DOSSIER, définie en trois dimensions nommées :
 * qualité de ce qu'on a collecté, couverture de ce qu'on a pu couvrir,
 * fraîcheur de ce sur quoi on juge. Elle ne dit RIEN du potentiel du compte —
 * c'est la confusion que le libellé actuel laissait possible.
 */
export const dossierReliabilitySchema = z.object({
  quality: dossierReliabilityDimensionSchema.optional().nullable(),
  coverage: dossierReliabilityDimensionSchema.optional().nullable(),
  freshness: dossierReliabilityDimensionSchema.optional().nullable(),
})

/** #2118.25 — un frein nommé, et pourquoi il freine. */
export const dossierObstacleSchema = z.object({
  label: nullableString,
  why: nullableString,
})

/**
 * #2118.26 / .28 — l'anti-conseil : ce qu'il ne faut PAS faire sur ce compte,
 * et pourquoi. Les deux champs ensemble ou rien : « ne commence pas par le CTO
 * groupe » sans sa raison est un ordre, pas un conseil.
 */
export const dossierAntiAdviceSchema = z.object({
  what: nullableString,
  why: nullableString,
})

/**
 * #2118.27 — l'action suivante, DISTINCTE de la prochaine action du résumé
 * (`bellum_read.next_action`, une phrase). Celle-ci est un geste : un libellé
 * et l'endroit où le faire.
 */
export const dossierNextActionSchema = z.object({
  label: nullableString,
  /** Route TanStack ciblée, quand l'action se fait ailleurs dans le produit. */
  route: nullableString,
  /** Onglet du dossier, quand elle se fait ici. */
  tab: nullableString,
})

/** #2118.24 — la meilleure porte d'entrée : qui, quel profil, pourquoi lui. */
export const dossierEntryPointSchema = z.object({
  label: nullableString,
  target_profile: nullableString,
  why: nullableString,
})

/**
 * #2118.45 / .47 — un no-go est TEMPORAIRE, contextualisé, et nomme ce qui le
 * ferait changer.
 *
 * `temporary` est un `literal(true)`, pas un booléen : le contrat ne permet pas
 * d'écrire un no-go définitif. C'est la doctrine (« un fait périmé redevient
 * inconnu », on n'enterre pas un compte) rendue impossible à contourner plutôt
 * qu'écrite en commentaire.
 */
export const dossierNoGoSchema = z.object({
  temporary: z.literal(true),
  /** Ce qui bloque AUJOURD'HUI — un panel fermé, un marché notifié, un gel. */
  context: nullableString,
  /** L'événement ou le signal qui rouvrirait le compte. */
  trigger: nullableString,
})

/** #2118.4 — un élément non évalué, NOMMÉ, et pourquoi il manque. */
export const dossierMissingItemSchema = z.object({
  label: nullableString,
  why: nullableString,
})

/**
 * La lecture complète. Tous les champs optionnels — voir l'entête : un dossier
 * d'avant ce lot n'en porte aucun et doit rester lisible.
 */
export const dossierReadSchema = z.object({
  /** #2118.6 / .30-.40 — le score décomposé. Jamais un chiffre nu. */
  axes: z.array(dossierScoreAxisSchema).max(DOSSIER_SCORE_AXES.length).optional(),
  /** #2118.22 — pourquoi ce compte pour CETTE ESN (cf. .19 : jamais interchangeable). */
  why_for_your_esn: nullableString,
  /** #2118.23 — le périmètre à attaquer, pas le groupe entier. */
  recommended_scope: nullableString,
  /** #2118.24 — déjà rendu par `OpeningStrategyCard` ; porté ici pour que la lecture soit d'un seul tenant. */
  best_entry_point: dossierEntryPointSchema.optional().nullable(),
  /**
   * #2304.7 (épopée #2932, LAU-FINAL-045) — Q6 « quelle voie d'achat ou
   * d'accès plausible sur ce compte » : DISTINCT de `best_entry_point` (QUI
   * contacter) — ceci dit PAR OÙ entrer commercialement (un programme déjà
   * lancé, un appel d'offres en cours, une porte partenaire…).
   */
  access_path: nullableString,
  /** #2118.25 — les freins. */
  obstacles: z.array(dossierObstacleSchema).optional(),
  /** #2118.26 / .28 */
  anti_advice: dossierAntiAdviceSchema.optional().nullable(),
  /** #2118.27 */
  next_action: dossierNextActionSchema.optional().nullable(),
  /** #2118.44 */
  reliability: dossierReliabilitySchema.optional().nullable(),
  /** #2118.45 / .46 / .47 */
  no_go: dossierNoGoSchema.optional().nullable(),
  /**
   * #2118.20 — le profil ESN est incomplet : l'analyse du COMPTE reste fiable,
   * c'est le fit avec l'offre qui est limité. Le message affiché est de
   * l'i18n côté écran — un libellé français écrit dans un contrat est français
   * pour toujours.
   */
  profile_incomplete: z.boolean().optional().nullable(),
  /** Les champs du profil qui manquent, pour que le message dise QUOI compléter. */
  profile_incomplete_fields: z.array(z.string()).optional(),
  /** #2118.4 — ce qui n'a PAS pu être évalué, un par un. */
  missing: z.array(dossierMissingItemSchema).optional(),
  /**
   * #2306.15 — la version du profil ESN qui a PRODUIT ce score, conservée sur
   * le bloc lui-même (elle vivait déjà sur le RUN — `run-profile.ts`,
   * `esnProfileVersion` — mais pas ici : un score consulté loin de son run
   * n'avait aucun moyen de dire avec quel profil il avait été lu).
   */
  esn_profile_version: z.number().int().nullable().optional(),
  /**
   * #2306.16 — les objectifs commerciaux NOMMÉS (`esn_objectives`, #2052)
   * actifs quand ce compte a été scoré. PAS l'objectif de phase du plan
   * (`recommended_scope` ci-dessus) : l'ambition déclarée de l'ESN (rendez-
   * vous, nouveaux comptes, structuration…), qui peut peser sur la lecture.
   * `[]`/absent = aucun objectif déclaré à ce moment-là, jamais une invention.
   */
  scoring_objectives: z.array(z.string()).optional(),
  /**
   * #2306.22 — le poids de chaque axe dans la somme, rendu EXPLICITE plutôt
   * qu'assumé. Poids ÉGAL en doctrine aujourd'hui (`account_score.py`,
   * "Equal weight") ; si des poids variables sont un jour introduits, le champ
   * existe déjà et les scores déjà écrits restent lisibles avec le poids qui
   * les a vraiment produits (add-only, GA-08 : rien n'est recalculé ici).
   */
  axis_weights: z.partialRecord(dossierScoreAxisKeySchema, z.number()).optional(),
  /**
   * #2306.23 — la version de la RÈGLE de score qui a produit ce bloc (somme
   * égale sur les axes notés, `computeDossierScore`). Une note ne veut plus
   * rien dire si on ne sait plus quelle règle l'a calculée le jour où elle
   * change.
   */
  algorithm_version: z.string().nullable().optional(),
})
export type DossierRead = z.infer<typeof dossierReadSchema>

/**
 * Le score, calculé — jamais rendu par le modèle, et jamais recalculé ailleurs
 * (GA-26 : une dérivation vit à UN endroit ; deux chemins qui la refont
 * divergent, et c'est l'écran qui arbitre au hasard).
 *
 * `insufficient` n'est pas une erreur : c'est la réponse honnête quand moins de
 * `DOSSIER_SCORE_MIN_MEASURED_AXES` axes sont notés.
 */
export type DossierScoreComputation = {
  kind: 'score' | 'insufficient'
  /** La somme des axes notés. Absente (`undefined`) quand `kind` vaut `insufficient`. */
  value?: number
  /** Le dénominateur RÉEL : `DOSSIER_AXIS_MAX` × le nombre d'axes notés. */
  outOf?: number
  /** `value / outOf`, 0-1. Absent avec `kind: 'insufficient'`. */
  ratio?: number
  /** Combien d'axes ont été notés (`measured` ou `partial`). */
  scoredAxes: number
  /** Combien l'ont été sur des preuves minces. */
  partialAxes: number
  /** Les axes NON évalués, nommés — ce que l'écran doit dire (#2118.4). */
  unknownAxes: DossierScoreAxisKey[]
  /**
   * #2306.30 — le sous-ensemble de `unknownAxes` qui PLAFONNE la lecture :
   * {@link DOSSIER_SCORE_CAP_AXES} inconnus, dans l'ordre du contrat. Vide =
   * rien ne plafonne. Présent même quand `kind` vaut `insufficient` — un score
   * absent n'empêche pas de nommer ce qui, en plus, resterait inconnu.
   */
  cappedBy: DossierScoreAxisKey[]
}

/**
 * #2118.52 — un axe non mesuré SORT du dénominateur.
 *
 * C'est la règle entière du calcul, et elle tient en une phrase : on ne somme
 * que ce qu'on a noté, et on divise par ce qu'on a noté. Un axe `unknown`
 * n'ajoute ni au numérateur ni au dénominateur — donc il ne peut pas faire
 * baisser le score. La version qui sommait `weight ?? 0` sur un `max` figé
 * faisait exactement l'inverse : elle mesurait la complétude de notre collecte
 * et l'appelait « potentiel du compte ».
 */
export function computeDossierScore(axes: readonly DossierScoreAxis[] | undefined): DossierScoreComputation {
  const rows = dedupeAxes(axes ?? [])
  const scored = rows.filter(axis => axis.state !== 'unknown' && typeof axis.value === 'number')
  const unknownAxes = DOSSIER_SCORE_AXES.filter(key => !scored.some(axis => axis.key === key))
  const cappedBy = DOSSIER_SCORE_CAP_AXES.filter(key => unknownAxes.includes(key))
  const partialAxes = scored.filter(axis => axis.state === 'partial').length
  if (scored.length < DOSSIER_SCORE_MIN_MEASURED_AXES) {
    return {
      kind: 'insufficient',
      scoredAxes: scored.length,
      partialAxes,
      unknownAxes: [...unknownAxes],
      cappedBy: [...cappedBy],
    }
  }
  const value = scored.reduce((sum, axis) => sum + (axis.value ?? 0), 0)
  const outOf = scored.length * DOSSIER_AXIS_MAX
  return {
    kind: 'score',
    value,
    outOf,
    ratio: outOf === 0 ? 0 : value / outOf,
    scoredAxes: scored.length,
    partialAxes,
    unknownAxes: [...unknownAxes],
    cappedBy: [...cappedBy],
  }
}

/**
 * Les SEPT axes, dans l'ordre canonique, les absents complétés en `unknown`.
 *
 * C'est ce qui rend « ce qui n'a pas pu être évalué est NOMMÉ » automatique :
 * un axe que le modèle n'a pas rendu ne peut pas disparaître de l'écran, il
 * apparaît en « inconnu ». Un axe omis et un axe à zéro se ressemblaient ; ici
 * ils ne peuvent plus.
 */
export function orderedDossierAxes(axes: readonly DossierScoreAxis[] | undefined): DossierScoreAxis[] {
  const byKey = new Map<DossierScoreAxisKey, DossierScoreAxis>()
  for (const axis of dedupeAxes(axes ?? [])) byKey.set(axis.key, axis)
  return DOSSIER_SCORE_AXES.map(
    key => byKey.get(key) ?? { key, state: 'unknown' as const, value: null, impact: null, lever: null },
  )
}

/** Première occurrence gagne — un axe rendu deux fois compterait deux fois. */
function dedupeAxes(axes: readonly DossierScoreAxis[]): DossierScoreAxis[] {
  const seen = new Set<string>()
  const out: DossierScoreAxis[] = []
  for (const axis of axes) {
    if (seen.has(axis.key)) continue
    seen.add(axis.key)
    out.push(axis)
  }
  return out
}
