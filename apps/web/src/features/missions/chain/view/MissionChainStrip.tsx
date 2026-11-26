import { Badge, Box, Button, MOTION, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { formatMonth } from '@/lib/locale'
import { assigneesOf, useInvoiceReadiness, type MissionView } from '../../api'
import {
  deriveMissionChain,
  deriveMissionToCash,
  MISSION_CHAIN_STEPS,
  type MissionChainInput,
  type MissionChainLink,
  type MissionChainState,
} from '../missionChain'
import { MissionToCashTimeline } from './MissionToCashTimeline'

/**
 * LA BANDE « DE LA SIGNATURE AU CASH » — #2199.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS QUESTIONS, UN COUP D'ŒIL
 * ─────────────────────────────────────────────────────────────────────────────
 * Où en est cette mission dans sa chaîne, ce qui la bloque, et où cliquer pour
 * agir. Les cinq écrans existaient déjà et rien ne les reliait : cette bande ne
 * RECODE aucun d'eux, elle les relie.
 *
 * ⚠️ Elle n'ouvre AUCUNE page « Parcours » supplémentaire (#2199.16, .50) : la
 * chaîne vit dans le dossier de la mission, là où on se pose la question, et
 * nulle part ailleurs. Une page de plus obligerait à la chercher — et on ne la
 * chercherait pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QU'ELLE N'ÉCRIT JAMAIS
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucun compte (« 2 blocages » envoie ouvrir trois écrans pour savoir
 * lesquels — le motif est donc NOMMÉ), aucun taux d'avancement, aucun zéro à la
 * place d'une absence. Une étape non mesurée rend `UnknownValue` avec sa raison,
 * jamais un badge vert ; c'est le défaut le plus probable de cet écran, parce
 * qu'une étape dont on n'a pas la donnée ressemble beaucoup à une étape
 * franchie. Garde GA-351.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MISE EN PAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une bande d'étapes est un tableau de bord : elle prend la PLEINE largeur
 * (D81), et ce qui déborde défile dans SON conteneur — jamais le corps de la
 * page. Le défilement est HORIZONTAL seulement : la page garde seule l'axe
 * vertical, sinon deux conteneurs défilants s'imbriquent.
 */
export function MissionChainStrip({ mission }: { mission: MissionView }) {
  const { t } = useTranslation('missions')
  /**
   * ⚠️ AUCUN MOIS DEMANDÉ, et c'est délibéré : le serveur sert son défaut (le
   * mois précédent, D781), exactement celui sur lequel `/missions/facturation`
   * s'ouvre. En choisir un autre ici ferait dire à la bande et à l'écran de
   * destination deux états du même mois — le lecteur cliquerait sur « CRA non
   * validé » pour atterrir sur un mois où il l'est.
   */
  const { data, isPending, isError } = useInvoiceReadiness()
  const row = data?.items.find(item => item.missionId === mission.id)

  const assignee = assigneesOf(mission).find(person => person.id !== null) ?? null
  // #2199.11 à .15 — la chaîne est DÉRIVÉE, jamais recalculée ici.
  const input: MissionChainInput = {
    mission,
    readiness: row,
    // ⚠️ « la requête n'a pas abouti » et « ce mois ne couvre pas la mission »
    // rendraient le même vide sans ce drapeau : c'est la cause racine « cassé et
    // non mesurable se ressemblent », et elle se paie en « rien à faire » sur
    // une mission qui brûle.
    readinessKnown: !isPending && !isError && data !== undefined,
    // #2199.10 — le repositionnement mène au Reverse Market DU CONSULTANT. Une
    // affectation sans identité (forme d'avant le 04/09/2026) ne donne aucune
    // porte : on n'ouvre pas la fiche d'un homonyme deviné.
    consultantId: assignee?.id ?? null,
    // #2421.6 — le consultant répond de sa période et de son relevé : son NOM,
    // jamais deviné (`null` = personne d'affecté → l'étape ouverte est une exception).
    consultantName: assignee?.fullName ?? null,
    now: new Date(),
  }
  const chain = deriveMissionChain(input)
  // #2421 — le DÉTAIL des cinq maillons, du même fichier et des mêmes calculs.
  const stages = deriveMissionToCash(input)

  // #2986 — quand le bloc « Repositionnement » (`MissionRepositioningPanel`, même condition : état
  // `a_commencer`) est rendu sous la bande, il porte SEUL le motif : la bande n'y redit pas « La fin
  // approche : … » (recette démo 10/10 : le même propos deux fois, sous le même mot).
  const repositionPanelShown = mission.repositionTrigger?.state === 'a_commencer'

  const month = data?.month ? (formatMonth(data.month) ?? data.month) : null

  return (
    <>
      <motion.section
        {...MOTION.reveal}
        role="region"
        aria-label={t('chain.title')}
        className="rounded-md border border-border bg-card/50 p-3"
      >
        <Box className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <Text element="h2" size="sm" weight="semibold">
            {t('chain.title')}
          </Text>
          {/* Le mois LU, et non le mois courant : sans lui, « relevé non validé »
            ne dit pas de quel mois il parle, et le lecteur corrige le mauvais. */}
          {month ? (
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('chain.month', { month })}
            </Text>
          ) : null}
        </Box>
        <Text size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
          {t('chain.intro')}
        </Text>

        {/* ⚠️ `min-w-0` : `min-width: auto` sur un enfant de flex est le premier
          responsable des débordements horizontaux de ce dépôt. */}
        <Box className="mt-3 min-w-0">
          <ol className="flex min-w-0 list-none items-stretch gap-1 overflow-x-auto pb-1">
            {chain.map((item, index) => (
              <li key={item.step} className="flex min-w-0 shrink-0 items-stretch gap-1">
                {index > 0 ? (
                  <ChevronRight
                    className="mt-2 size-4 shrink-0 self-start text-[var(--bellum-text-muted)]"
                    aria-hidden
                  />
                ) : null}
                <ChainCell
                  link={item}
                  reasonOwnedByPanel={
                    // GA-351 : aucun nom d'étape en dur — le repositionnement est le DERNIER maillon.
                    item.step === MISSION_CHAIN_STEPS[MISSION_CHAIN_STEPS.length - 1] && repositionPanelShown
                  }
                />
              </li>
            ))}
          </ol>
        </Box>
      </motion.section>
      {/* #2421 — HORS de la région de la bande, et repliée : la bande reste le
        coup d'œil, la timeline se déplie quand on veut l'étape exacte. */}
      <MissionToCashTimeline stages={stages} now={input.now} />
    </>
  )
}

/**
 * LES QUATRE ÉTATS QUI PORTENT UN BADGE.
 *
 * `not_measured` n'en a pas : il rend `UnknownValue`, la primitive que GA-19
 * sait lire. Lui donner un badge gris le ferait ressembler à « sans objet »,
 * c'est-à-dire à une question qui ne se pose pas — alors qu'elle se pose et
 * qu'on n'a pas la réponse.
 */
const STATE_VARIANT: Readonly<
  Record<Exclude<MissionChainState, 'not_measured'>, 'default' | 'warning' | 'success' | 'secondary'>
> = {
  done: 'success',
  pending: 'default',
  blocked: 'warning',
  not_applicable: 'secondary',
  // #2421.2 — les deux états de la timeline détaillée ; la bande ne les emploie pas.
  not_due: 'secondary',
  in_progress: 'default',
}

function ChainCell({ link, reasonOwnedByPanel = false }: { link: MissionChainLink; reasonOwnedByPanel?: boolean }) {
  const { t } = useTranslation('missions')
  const step = t(`chain.steps.${link.step}`)
  // #2199.12 — le motif est NOMMÉ. Le libellé du bloqueur se lit là où il vit
  // déjà, pour l'écran de facturation : jamais recopié ici.
  // #2986 — sauf quand le bloc « Repositionnement » du dossier porte déjà ce motif.
  const detail = reasonOwnedByPanel
    ? null
    : link.blocker
      ? t(`readiness.blockers.${link.blocker}`)
      : link.reasonKey
        ? t(`chain.why.${link.reasonKey}`)
        : null

  const body = (
    <Box className="flex min-w-0 flex-col items-start gap-1 text-left">
      <Text size="sm" weight="medium" className="min-w-0">
        {step}
      </Text>
      {/* ⚠️ `UnknownValue` PORTE DÉJÀ sa raison (« non mesuré — … ») : la
          redoubler d'une ligne en dessous écrirait deux fois la même phrase
          dans la même cellule (loi 4 du tome 7). La raison ne se répète donc
          que sous un badge, où rien ne la dit encore. */}
      {link.state === 'not_measured' ? (
        <UnknownValue reason={detail ?? undefined} />
      ) : (
        <>
          <Badge variant={STATE_VARIANT[link.state]}>{t(`chain.state.${link.state}`)}</Badge>
          {detail ? (
            <Text size="xs" className="min-w-0 text-[var(--bellum-text-secondary)]">
              {detail}
            </Text>
          ) : null}
          {/* #2199.13, .14 — LE GESTE, et avec lui la main qui le fait :
              « relancer le consultant » et « relancer le client » ne désignent
              pas la même personne. Le libellé vient de `BLOCKER_ACTIONS` via la
              chaîne, jamais réassemblé ici. */}
          {link.actionKey ? (
            <Text size="xs" weight="medium" className="min-w-0 text-[var(--bellum-text-accent)]">
              {t(`readiness.actions.${link.actionKey}`)}
            </Text>
          ) : null}
        </>
      )}
    </Box>
  )

  // Pas de destination : l'étape se NOMME, elle ne s'ouvre pas. Un lien mort
  // est pire qu'un motif sans lien — le premier fait douter du produit entier.
  if (!link.route) {
    return (
      // ⚠️ Un `<div>` et non un bouton désactivé : il n'y a rien à activer. Un
      // bouton grisé se lit « ça marchera peut-être », et on le clique.
      <div className="w-52 rounded-md border border-border/60 p-2 pointer-coarse:min-h-11" title={t('chain.noDoor')}>
        {body}
      </div>
    )
  }

  // ⚠️ Ce qui se clique se TABULE (GA-35) : un vrai lien, jamais un `<div
  // onClick>` — il n'a ni tabulation, ni Entrée, ni annonce.
  return (
    <Button
      asChild
      variant="ghost"
      className="h-auto w-52 items-start justify-start whitespace-normal rounded-md border border-border/60 p-2 pointer-coarse:min-h-11"
    >
      {/* ⚠️ PAS d'`aria-label` ici, et c'est délibéré : il REMPLACE le nom
          accessible d'un lien au lieu de s'y ajouter. « Ouvrir "Relevé
          d'activité" » aurait donc CACHÉ à un lecteur d'écran l'état, le motif
          et le geste — c'est-à-dire tout ce que la cellule dit. Le contenu du
          lien EST son nom, et il est plus riche que n'importe quel résumé. */}
      <Link to={link.route} params={link.params}>
        {body}
      </Link>
    </Button>
  )
}
