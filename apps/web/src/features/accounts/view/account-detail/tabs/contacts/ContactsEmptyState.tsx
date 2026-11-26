import { Button, EmptyState } from '@bellum/ui'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowRight, Crosshair, RefreshCw, Search, Upload, UserPlus, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { AskLaura } from '@/components/primitives/AskLaura'
import { accountKeys } from '@/features/accounts/api'
import type { useEnrichContacts } from '@/features/accounts/hooks/useEnrichAccount'
import { EnrichConfirmDialog } from '@/features/contacts/components/EnrichConfirmDialog'
import { cardFade } from '../../motion'

/**
 * Ce que dit un dossier sans contact — #1130, « aucun contact trouvé (j'ai
 * rajouté en manuel) ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CET ÉCRAN NE PEUT PAS DIRE, ET POURQUOI IL NE LE DIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il disait « Aucun contact suffisamment fiable n'a été identifié » : un
 * VERDICT, avec une CAUSE (la fiabilité), et le serveur ne porte ni l'un ni
 * l'autre. `POST /analysis/:id/enrich-contacts` répond `{count, identified,
 * organigramRebuild}` — pas de périmètre cherché, pas de fournisseur interrogé,
 * pas de nombre de hits. Le journal qui sait tout cela existe, mais il reste
 * dans le service IA (`phase2_contacts.py`, `apollo.py`) : aucune clé de charge
 * utile ne le fait sortir, à la différence de `contacts_out_of_scope`, qui a la
 * sienne et se rend juste au-dessus.
 *
 * Cet écran ne comble donc RIEN. Il rapporte ce qu'il a effectivement reçu, et
 * quand il n'a rien reçu, il le dit en ne concluant pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS SITUATIONS QUI SE RESSEMBLENT — #2126.4 / .8 : chacune a son NOM
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. personne n'a cherché depuis l'ouverture de l'écran → aucune phrase de
 *    résultat, seulement les chemins ;
 * 2. la recherche a rendu zéro → « Aucune donnée trouvée » (#2126.4), avec la
 *    phrase qui dit CE qui a été vérifié (#2126.13), ou l'écart « trouvé » /
 *    « entré au dossier » quand le serveur donne les deux ;
 * 3. la recherche a ÉCHOUÉ → « Source indisponible » (#2126.8) et « ce
 *    résultat est incomplet » (#2126.14) — surtout pas « aucun contact ». Un
 *    échec n'est pas la preuve qu'il n'y a personne, et c'est la confusion qui
 *    fait abandonner un compte pour un timeout.
 *
 * Le résultat vivait dans un toast, donc quelques secondes : au rechargement,
 * l'écran redevenait muet et on relançait — et repayait — une recherche déjà
 * faite.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES CHEMINS
 * ─────────────────────────────────────────────────────────────────────────────
 * « Ajouter un contact » et « Importer CSV » vivaient en haut à droite de
 * l'onglet, à l'autre bout de l'écran de la phrase qui les conseillait. Ils
 * descendent ICI quand la liste est vide — c'est le geste que le commercial a
 * fini par trouver seul. Ils ne sont pas DUPLIQUÉS : `TabContacts` cesse de
 * rendre sa barre d'actions dès qu'il rend cet état vide (loi 4 du tome 7).
 *
 * #2126.18 / .22 / .23 / .24 — les SORTIES d'impasse, sous les chemins. Aucune
 * ne dépense : « Actualiser » RELIT le dossier (une analyse finie dans un autre
 * onglet, un contact saisi par un collègue), la recherche qui tourne reste
 * derrière sa confirmation ; « Changer de périmètre » ouvre la section
 * Périmètres ; « Demander à Laura » DÉPOSE une question, il n'envoie rien ;
 * « Continuer sans cette donnée » mène au plan, qui se travaille sans contact.
 */
export function ContactsEmptyState({
  accountId,
  enrichBatchMutation,
  onCreateContact,
  onImportCsv,
  onChangeScope,
  onContinueWithout,
}: {
  accountId: string
  enrichBatchMutation: ReturnType<typeof useEnrichContacts>
  /** Ouvre la saisie manuelle — la même que la barre d'actions du dossier. */
  onCreateContact: () => void
  /** Ouvre l'import CSV — idem. */
  onImportCsv: () => void
  /** #2126.22 — ouvre la section Périmètres du dossier. Absent = pas de geste. */
  onChangeScope?: () => void
  /** #2126.24 — mène à la suite du dossier sans cette donnée. Absent = pas de geste. */
  onContinueWithout?: () => void
}) {
  const { t } = useTranslation('accountOrg')
  const { t: tCrm } = useTranslation('crm')
  const queryClient = useQueryClient()
  const outcome = lastSearchOutcome(enrichBatchMutation, t)
  // #2120.52-57 — même défaut que la relance de l'onglet (TabContacts.tsx) :
  // cette recherche est gratuite (Phase 2, aucun crédit débité) mais partait
  // sans confirmation. Pas de `count` ici : le dossier est VIDE, c'est
  // pourquoi cet écran se rend — annoncer « 0 contact concerné » mentirait
  // autant qu'un chiffre inventé.
  const [searchArmed, setSearchArmed] = useState(false)
  // #2126.4 / #2126.8 — le TITRE nomme l'état ; « trouvés mais pas entrés »
  // garde le titre du dossier vide : des contacts ONT été trouvés, dire
  // « aucune donnée » serait faux.
  const title =
    outcome?.kind === 'failed'
      ? t('emptyState.sourceUnavailableTitle')
      : outcome?.kind === 'none'
        ? t('emptyState.noDataTitle')
        : t('emptyState.title')
  return (
    <motion.div variants={cardFade}>
      <EmptyState
        size="md"
        align="center"
        icon={<Users className="h-12 w-12" />}
        title={title}
        // Ce que la dernière recherche a rendu prend la place de la consigne
        // générique : une fois qu'on SAIT quelque chose, le redire à côté du
        // conseil ferait deux phrases dont l'une est plus vieille que l'autre.
        description={outcome?.sentence ?? t('emptyState.description')}
        action={
          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                size="sm"
                variant="default"
                onClick={() => setSearchArmed(true)}
                disabled={enrichBatchMutation.isPending}
                isLoading={enrichBatchMutation.isPending}
                icon={Search}
                className="gap-2"
              >
                {enrichBatchMutation.isPending ? t('emptyState.searching') : t('emptyState.cta')}
              </Button>
              {/* Le geste qui marche toujours, quoi qu'aient rendu les sources :
                  la personne rencontrée en salon est dans le téléphone du
                  commercial, pas dans une base publique. */}
              <Button size="sm" variant="outline" icon={UserPlus} onClick={onCreateContact} className="gap-2">
                {tCrm('createContact.open')}
              </Button>
              <Button size="sm" variant="outline" icon={Upload} onClick={onImportCsv} className="gap-2">
                {t('contactsTab.importCsv')}
              </Button>
            </div>
            {/* #2126.18 / .22 / .23 / .24 — les sorties d'impasse. */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                icon={RefreshCw}
                className="gap-2 pointer-coarse:min-h-11"
                onClick={() => void queryClient.invalidateQueries({ queryKey: accountKeys.detail(accountId) })}
              >
                {t('emptyState.refresh')}
              </Button>
              {onChangeScope ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  icon={Crosshair}
                  className="gap-2 pointer-coarse:min-h-11"
                  onClick={onChangeScope}
                >
                  {t('emptyState.changeScope')}
                </Button>
              ) : null}
              <AskLaura
                accountId={accountId}
                label={t('emptyState.askLauraLabel')}
                question={t('emptyState.askLauraQuestion')}
              />
              {onContinueWithout ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  icon={ArrowRight}
                  className="gap-2 pointer-coarse:min-h-11"
                  onClick={onContinueWithout}
                >
                  {t('emptyState.continueWithout')}
                </Button>
              ) : null}
            </div>
          </div>
        }
      />
      <EnrichConfirmDialog
        open={searchArmed}
        onOpenChange={setSearchArmed}
        free
        onConfirm={() => enrichBatchMutation.mutate()}
      />
    </motion.div>
  )
}

type SearchOutcome = { kind: 'none' | 'notAdded' | 'failed'; sentence: string }

/**
 * Ce que la DERNIÈRE recherche a rendu — ou `null` quand il n'y a rien à en
 * dire, ce qui est le cas tant qu'aucune n'a répondu.
 *
 * ⚠️ L'ordre compte. L'échec passe AVANT le résultat : une mutation qui a
 * échoué n'a pas de `data`, et laisser tomber dans la branche « zéro identifié »
 * transformerait une panne en verdict d'absence.
 *
 * `identified` est optionnel côté serveur (`EnrichContactsResult`) : absent, on
 * ne l'invente pas — on dit seulement que rien n'a été identifié. Présent, on
 * dit l'écart tel quel, sans l'interpréter : `identified` est ce que la
 * recherche a TROUVÉ, `count` ce qui est ENTRÉ au dossier.
 */
function lastSearchOutcome(
  mutation: ReturnType<typeof useEnrichContacts>,
  t: TFunction<'accountOrg'>,
): SearchOutcome | null {
  if (mutation.isError) return { kind: 'failed', sentence: t('emptyState.lastSearchFailed') }
  if (!mutation.isSuccess || !mutation.data) return null
  const { count, identified } = mutation.data
  // Des contacts SONT entrés au dossier : la liste n'est plus vide, cet écran
  // n'est plus rendu. Rien à dire ici plutôt qu'une phrase qu'on ne verra pas.
  if (count > 0) return null
  if (typeof identified === 'number' && identified > 0) {
    return { kind: 'notAdded', sentence: t('emptyState.lastSearchNotAdded', { count: identified }) }
  }
  return { kind: 'none', sentence: t('emptyState.lastSearchNone') }
}
