import { Button } from '@bellum/ui'
import {
  PLAN_FEATURE_KEYS,
  type PlanFeatureKey,
  type RouteAccess,
  type RouteAccessState,
  type ToolFamily,
} from '@bellum/contracts'
import { Link } from '@tanstack/react-router'
import { Banner, type BannerTone } from '@/components/layout/Banner'
import { AlertTriangle, Lock, PlugZap, ShieldAlert } from 'lucide-react'
import type { TFunction } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Le bandeau qui dit POURQUOI un écran ne sert pas tout à fait, et quoi faire.
 *
 * Le produit en avait onze variantes — verrou de palier, avis de dégradation de
 * Découvrir, état de bloc du brief, écran « bientôt disponible », redirection
 * silencieuse sur permission… Chacune disait la même chose autrement, et
 * l'une d'elles ne disait rien du tout : une permission manquante renvoyait au
 * tableau de bord sans un mot, ce qui se lit comme un bug.
 *
 * Un seul composant, quatre états, et surtout quatre GESTES distincts :
 *  - palier → changer d'offre, une décision qui appartient au propriétaire ;
 *  - permission → demander l'accès à quelqu'un de son équipe ;
 *  - aucun outil connecté → aller connecter, dans Réglages ;
 *  - dégradé → l'écran marche, une partie seulement est indisponible.
 *
 * Le dernier est le plus important : il s'affiche SANS fermer l'écran. Refuser
 * l'accès entier parce qu'un connecteur manque cache tout ce qui fonctionne, et
 * c'est ce qui fait conclure à une panne.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE GESTE ÉTAIT ANNONCÉ, ET N'EXISTAIT PAS — D222
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce docblock promettait « quatre GESTES distincts » depuis le premier jour, et
 * le rendu n'en portait aucun : ni lien, ni bouton. Le recomptage du tome 7 l'a
 * relevé comme un défaut VIVANT — « une bannière sans destinataire ni geste »,
 * c'est-à-dire « de la place perdue, deux fois ». Il est ici, avec sa
 * destination par état, et une exception écrite : la PERMISSION n'en a pas.
 * Il n'existe aucun écran où s'accorder un droit qu'on n'a pas ; le destinataire
 * du geste est une PERSONNE, et un bouton qui ne répare rien est pire qu'un
 * message nu.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LES BANDEAUX AD HOC LUI ONT APPRIS — D223
 * ─────────────────────────────────────────────────────────────────────────────
 * Migrer n'est pas aplatir. Trois écrans disaient quelque chose que ce composant
 * ne savait pas dire ; c'est lui qui a gagné le cas, pas leur message qui s'est
 * perdu :
 *
 *  - `title` / `description` — « Aucune messagerie connectée » est plus utile
 *    que « Aucun outil connecté ne fournit ces données » sur l'écran de la
 *    messagerie. La phrase générique reste le défaut, jamais un plafond ;
 *  - `action.label` — « Reconnecter » et « Connecter » ne disent pas la même
 *    chose, et la destination, elle, ne change pas ;
 *  - `action.onClick` — un geste qui n'est PAS une navigation. Démarrer une
 *    autorisation prend un aller-retour réseau, donc un état d'attente ; sans
 *    lui, la personne clique deux fois et ouvre deux consentements.
 */

/**
 * Le geste proposé, quand l'écran en sait plus que le bandeau.
 *
 * Tout est optionnel, et c'est le point : un écran qui n'a rien de plus précis à
 * dire ne passe rien, et hérite de la destination de son état.
 */
type CapabilityBannerAction = {
  /** Le libellé, quand l'écran en a un plus juste que le générique. */
  label?: string
  /**
   * Un geste qui n'est pas une navigation. Sa présence REMPLACE la destination
   * par défaut : deux destinataires pour un seul message, c'est le défaut
   * d'origine, pas sa correction.
   */
  onClick?: () => void
  /** Le geste est parti et n'a pas encore répondu. */
  pending?: boolean
}

export function CapabilityBanner({
  access,
  title,
  description,
  stillPossible,
  missingLabels,
  action,
}: {
  access: RouteAccess
  title?: string
  description?: string
  /**
   * #1932.5 — CE QUI RESTE POSSIBLE, dit AVANT d'envoyer connecter.
   *
   * La phrase appartient à l'écran : « les séquences se consultent et se
   * préparent, mais rien ne part » n'est vrai que sur les séquences, et une
   * formule générique (« le reste fonctionne ») ne dit pas la VALEUR, elle
   * rassure. Un écran qui n'a rien de précis à promettre ne passe rien, et le
   * bandeau n'affiche pas de ligne vide.
   */
  stillPossible?: string
  /**
   * Les MOTS de ce qui manque, quand l'écran les possède déjà (la messagerie nomme ses cinq droits : « envoyer après
   * ton clic »). Sans eux, `access.missing` porte des CODES que `missingNames` traduit (PLAN-GATE #4381) ; avec eux,
   * ils s'affichent tels quels — un code n'est jamais montré, un mot déjà écrit n'est jamais écrasé par le générique.
   */
  missingLabels?: readonly string[]
  action?: CapabilityBannerAction
}) {
  const { t } = useTranslation('access')
  // #1932.2 — « Continuer sans X » doit avoir un EFFET réel (D222 : un bouton
  // qui ne répare rien est pire qu'un message nu) : il replie le bandeau pour
  // cette vue. Un changement d'`access` (nouvel écran, capacité reconnectée)
  // rend un composant qui repart de `false` — la fermeture n'est jamais
  // permanente au-delà de cette instance.
  const [dismissed, setDismissed] = useState(false)

  if (access.state === 'ready' || dismissed) return null

  const tone = TONE[access.state]
  const Icon = tone.icon

  return (
    <Banner
      layout="card"
      tone={tone.tone}
      icon={Icon}
      title={title ?? t(`banner.${access.state}.title`)}
      className="mb-4 items-start"
    >
      <span className="flex flex-col gap-2">
        <span>{description ?? t(`banner.${access.state}.description`)}</span>
        {stillPossible && STILL_SERVES.includes(access.state) ? (
          <span>{t('banner.stillPossible', { value: stillPossible })}</span>
        ) : null}
        {access.missing.length > 0 ? (
          <span className="text-xs text-[var(--bellum-text-muted)]">
            {t('banner.missing', { items: (missingLabels ?? missingNames(access, t)).join(', ') })}
          </span>
        ) : null}
        <CapabilityGesture
          state={access.state}
          missing={access.missing}
          action={action}
          onContinue={() => setDismissed(true)}
        />
      </span>
    </Banner>
  )
}

/**
 * #1932.2 / #1932.3 — la CAPACITÉ manquante, nommée, jamais l'éditeur.
 *
 * `access.missing` porte des codes techniques, pas des mots qu'on montre à un
 * commercial. Un code absent de la table retombe sur un mot générique plutôt que
 * d'inventer un nom. Un SEUL code manquant se nomme ; plusieurs à la fois
 * retombent aussi sur le générique, parce que « Continuer sans ton CRM, ton
 * agenda » ne se lit pas comme une phrase.
 *
 * ⚠️ LES CLÉS SONT DES `ToolFamily`, ET C'ÉTAIT FAUX (mesuré le 16/09/2026).
 * La table était écrite sur `agenda` et `drive` — deux valeurs que le produit
 * n'émet NULLE PART : `access.missing` vient de `tool.family`
 * (`useRouteAccess.ts:69`), et l'énumération dit `calendar` et `documents`
 * (`packages/contracts/src/schemas/tool-registry.ts`). Deux des cinq entrées
 * étaient donc inatteignables par construction, et un écran dégradé faute
 * d'agenda disait « Continuer sans cet outil » avec le bon mot juste à côté.
 * Le type l'interdit désormais (`Partial<Record<ToolFamily, string>>` : écrire
 * `agenda:` ne compile plus), et `capability-label-families.test.tsx` le tient
 * à l'exécution.
 *
 * ⚠️ Et le mot de `documents` ne dit plus « ton Drive » : un outil qui n'est PAS
 * connecté se nomme par sa CAPACITÉ, jamais par son éditeur (doctrine du
 * 13/09/2026).
 */
export const CAPABILITY_LABEL_KEYS: Readonly<Partial<Record<ToolFamily, string>>> = {
  crm: 'banner.capability.crm',
  email: 'banner.capability.email',
  calendar: 'banner.capability.calendar',
  documents: 'banner.capability.documents',
  ats: 'banner.capability.ats',
}

/**
 * PLAN-GATE #4381 — « Ce qui manque : talent_pool » s'affichait tel quel à un
 * client : `access.missing` porte des CODES (clé de palier, famille d'outil,
 * permission), jamais des mots. Chaque code se nomme ici, dans la langue de
 * l'interface ; un code sans libellé retombe sur une phrase générique, JAMAIS
 * sur lui-même — afficher le code est exactement le défaut qu'on corrige.
 */
export function missingNames(access: RouteAccess, t: TFunction<'access'>): string[] {
  const names = access.missing.map(code => {
    if (access.state === 'permission') return t('banner.missingPermission')
    if ((PLAN_FEATURE_KEYS as readonly string[]).includes(code)) {
      return t(`banner.missingName.${code as PlanFeatureKey}`)
    }
    const family = CAPABILITY_LABEL_KEYS[code as ToolFamily]
    if (family) return t(family)
    return t('banner.missingName.generic')
  })
  return [...new Set(names)]
}

function capabilityLabel(missing: readonly string[], t: TFunction<'access'>): string {
  const key = missing.length === 1 ? CAPABILITY_LABEL_KEYS[missing[0] as ToolFamily] : undefined
  return t(key ?? 'banner.capability.generic')
}

/**
 * Où mène le bandeau, état par état.
 *
 * La table est ici et nulle part ailleurs : une destination recopiée sur chaque
 * écran est une destination qui diverge. `pointer-coarse:min-h-11` parce que
 * c'est un geste, et qu'un geste se touche au doigt.
 */
function CapabilityGesture({
  state,
  missing,
  action,
  onContinue,
}: {
  state: Exclude<RouteAccessState, 'ready'>
  missing: readonly string[]
  action: CapabilityBannerAction | undefined
  onContinue: () => void
}) {
  const { t } = useTranslation('access')

  // La permission n'a pas de geste, et c'est délibéré : il n'existe aucun écran
  // où s'accorder un droit qu'on n'a pas. La description nomme déjà le
  // destinataire — un responsable de l'espace. Le refus est posé AVANT le geste
  // sur mesure, sinon un écran pourrait le contourner sans le savoir ; et il n'y
  // a donc aucun libellé `banner.permission.action` à écrire, dans aucune langue.
  if (state === 'permission') return null

  if (action?.onClick) {
    const label = action.label ?? t(`banner.${state}.action`)
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-fit pointer-coarse:min-h-11"
        isLoading={action.pending ?? false}
        // Sans `loadingText`, un bouton en attente ne rend qu'un compteur : il
        // perd son nom accessible au pire moment, celui où l'on veut savoir ce
        // qui est parti. Le libellé reste, l'attente s'ajoute.
        loadingText={label}
        onClick={action.onClick}
      >
        {label}
      </Button>
    )
  }

  if (state === 'plan_locked') {
    const label = action?.label ?? t(`banner.${state}.action`)
    return (
      <Button asChild size="sm" variant="outline" className="w-fit pointer-coarse:min-h-11">
        <Link to="/billing">{label}</Link>
      </Button>
    )
  }

  if (state === 'degraded') {
    // #1932.2 / #1932.3 — le dégradé n'avait qu'UN geste (« Connecter ») quand
    // l'écran, par construction (D223), fonctionne déjà sans lui : rien ne
    // disait explicitement qu'on pouvait rester. « Continuer sans » DISMISS le
    // bandeau — un geste réel, pas un bouton qui ne répare rien (D222) — pendant
    // que « Connecter » garde sa destination d'avant.
    const capability = capabilityLabel(missing, t)
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="ghost" className="w-fit pointer-coarse:min-h-11" onClick={onContinue}>
          {t('banner.degraded.actionContinue', { capability })}
        </Button>
        <Button asChild size="sm" variant="outline" className="w-fit pointer-coarse:min-h-11">
          <Link to="/integrations">{action?.label ?? t('banner.degraded.action', { capability })}</Link>
        </Button>
      </div>
    )
  }

  const label = action?.label ?? t(`banner.${state}.action`)
  return (
    <Button asChild size="sm" variant="outline" className="w-fit pointer-coarse:min-h-11">
      <Link to="/integrations">{label}</Link>
    </Button>
  )
}

/**
 * Les deux états où l'écran SERT ENCORE — et donc les seuls où « ce qui reste
 * possible » est vrai. Un palier verrouillé et un rôle insuffisant ne laissent
 * rien de possible : y promettre quelque chose serait un mensonge, pas un
 * réconfort.
 */
const STILL_SERVES: readonly RouteAccessState[] = ['degraded', 'no_integration']

const TONE = {
  plan_locked: { icon: Lock, tone: 'neutral' },
  permission: { icon: ShieldAlert, tone: 'neutral' },
  no_integration: { icon: PlugZap, tone: 'neutral' },
  degraded: { icon: AlertTriangle, tone: 'warning' },
} as const satisfies Record<Exclude<RouteAccessState, 'ready'>, { icon: unknown; tone: BannerTone }>
