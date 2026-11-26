import type { MeetingBriefBlockInput, MeetingPitch, MeetingType, R1Recap, RexSelection } from '@bellum/contracts'
import { describeGround } from '@bellum/contracts'

type Translate = (key: string, values?: Record<string, string>) => string

/** Une date en jour/mois/année, lisible ; illisible ⇒ rien (jamais « aujourd'hui »). */
function day(date: string | null): string | null {
  if (!date) return null
  const at = new Date(date)
  if (Number.isNaN(at.getTime())) return null
  return at.toISOString().slice(0, 10).split('-').reverse().join('/')
}

/**
 * #4424.2-.4 — les blocs du R1, du R2 et du pitch, prêts pour `buildMeetingBrief`.
 *
 * Tout vient du contrat (`meeting-r1-r2.ts`) : ce fichier ne fait que
 * TRADUIRE des clés et poser l'origine de chaque bloc. Aucune phrase n'est
 * rédigée ici hors des fichiers de traduction, aucun modèle n'est appelé.
 *
 *  · le pitch vaut pour tous les types — sauf un point interne : on ne vend
 *    pas à un collègue ;
 *  · REX et proposition d'atelier : le R1 ;
 *  · la reprise du R1 : le R2.
 */
export function buildR1R2BriefBlocks(input: {
  readonly meetingType: MeetingType | null
  readonly rex: RexSelection
  readonly r1: R1Recap
  readonly pitch: MeetingPitch
  readonly t: Translate
}): MeetingBriefBlockInput[] {
  const { meetingType, t } = input
  if (meetingType === 'internal_meeting') return []
  const blocks: MeetingBriefBlockInput[] = [pitchBlock(input.pitch, t)]

  if (meetingType === 'r1_discovery') {
    blocks.push(rexBlock(input.rex, t), {
      key: 'workshop_proposal',
      lines: [
        t('agenda.brief.workshop.propose'),
        t('agenda.brief.workshop.attendees'),
        t('agenda.brief.workshop.date'),
      ],
      ground: describeGround({ derivedFrom: ['meeting_type'] }),
    })
  }
  if (meetingType === 'r2_workshop') blocks.push(r1Block(input.r1, t))
  return blocks
}

function pitchBlock(pitch: MeetingPitch, t: Translate): MeetingBriefBlockInput {
  if (pitch.kind === 'no_profile') {
    return {
      key: 'pitch',
      lines: [t('agenda.brief.pitch.noProfile')],
      ground: describeGround({ derivedFrom: ['esn_profile'] }),
    }
  }
  // UNE ligne : les 3 à 5 phrases se disent d'un trait, elles ne se coupent pas
  // au plafond de trois lignes d'un bloc.
  return {
    key: 'pitch',
    lines: [
      pitch.sentences.map(sentence => t(`agenda.brief.pitch.sentence.${sentence.key}`, sentence.values)).join(' '),
    ],
    ground: describeGround({ derivedFrom: ['esn_profile', 'meeting_type'] }),
  }
}

function rexBlock(rex: RexSelection, t: Translate): MeetingBriefBlockInput {
  const ground = describeGround({ derivedFrom: ['workspace_knowledge'] })
  if (rex.kind === 'none') return { key: 'rex', lines: [t('agenda.brief.rex.none')], ground }
  return {
    key: 'rex',
    lines: rex.items.map(item => {
      const kind = t(`agenda.brief.rex.kind.${item.kind}`)
      const date = day(item.date)
      return date
        ? t('agenda.brief.rex.itemDated', { kind, label: item.label, date })
        : t('agenda.brief.rex.item', { kind, label: item.label })
    }),
    ground,
  }
}

function r1Block(r1: R1Recap, t: Translate): MeetingBriefBlockInput {
  if (r1.kind !== 'found') {
    return {
      key: 'r1_recap',
      lines: [t(r1.kind === 'none' ? 'agenda.brief.r1.none' : 'agenda.brief.r1.unread')],
      ground: describeGround({ derivedFrom: ['prior_meeting'] }),
    }
  }
  return {
    key: 'r1_recap',
    lines: [
      t('agenda.brief.r1.found', { date: day(r1.recap.date) ?? '', label: r1.recap.label }),
      ...r1.needsSince.map(need => t('agenda.brief.r1.need', { label: need.label })),
    ],
    // Le compte rendu est une saisie de l'espace, datée : un fait, pas une lecture.
    ground: describeGround({ sources: ['workspace'], observedAt: r1.recap.date }),
  }
}
