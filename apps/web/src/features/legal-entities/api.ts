import type { CreateLegalEntity, LegalEntity } from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'

/**
 * LES SOCIÉTÉS DE L'ESN — la moitié web d'une capacité livrée et invisible.
 *
 * `legal_entities` avait sa table, son entité, son module NestJS, ses quatre
 * routes gardées et `missions.legal_entity_id` pour les rattacher. `grep -rn
 * "legal_entit" apps/web/src` rendait **une seule ligne, dans un commentaire**.
 * Une ESN multi-société n'avait donc aucun moyen de déclarer ses structures :
 * la seule réponse restait « un espace par société », c'est-à-dire perdre
 * l'équipe partagée, le vivier commun et le cockpit du responsable pour régler
 * une question de facturation.
 *
 * ⚠️ À ne pas confondre avec `account_entities` : celles-ci sont les entités du
 * CLIENT — qui REÇOIT. Ici, ce sont les nôtres — qui ÉMET.
 */

const legalEntityKeys = { all: ['legal-entities'] as const }

/**
 * Toutes les sociétés de l'espace, archivées comprises.
 *
 * Le serveur ne filtre pas : « c'est l'écran qui décide de les montrer, pas la
 * lecture qui décide de les cacher ». Une société archivée reste lisible ici
 * parce que c'est l'écran où on la RÉACTIVE.
 */
export function useLegalEntities() {
  return useQuery({
    queryKey: legalEntityKeys.all,
    queryFn: () => apiFetch<{ items: LegalEntity[] }>({ path: '/legal-entities' }),
    select: response => response.items,
  })
}

export function useCreateLegalEntity() {
  const qc = useQueryClient()
  return useMutation<LegalEntity, Error, CreateLegalEntity>({
    mutationFn: body => apiFetch<LegalEntity, CreateLegalEntity>({ path: '/legal-entities', method: 'POST', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: legalEntityKeys.all })
      toast.success(i18n.t('legalEntities:toast.created'))
    },
    // Le message du serveur passe TEL QUEL : « Une société de ce nom existe
    // déjà dans cet espace » dit exactement quoi corriger, là où un libellé
    // générique renverrait chercher.
    onError: error => toast.error(i18n.t('legalEntities:toast.createFailed'), { description: error.message }),
  })
}

/**
 * Corriger une société déjà déclarée.
 *
 * Branchée en même temps que la création, et pas « plus tard » : ce nom
 * s'imprime sur des factures, et une coquille sans geste de correction se
 * réglerait en créant un doublon — que le serveur refuse par le contrôle
 * d'unicité, laissant l'ESN sans issue.
 *
 * Le corps ne porte QUE les champs présents : côté serveur, le patch est
 * present-only, un champ absent n'est pas un champ à vider.
 */
export function useUpdateLegalEntity() {
  const qc = useQueryClient()
  return useMutation<LegalEntity, Error, { id: string } & CreateLegalEntity>({
    mutationFn: ({ id, ...body }) =>
      apiFetch<LegalEntity, CreateLegalEntity>({ path: `/legal-entities/${id}`, method: 'PATCH', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: legalEntityKeys.all })
      toast.success(i18n.t('legalEntities:toast.updated'))
    },
    onError: error => toast.error(i18n.t('legalEntities:toast.updateFailed'), { description: error.message }),
  })
}

/**
 * Archiver ou réactiver — il n'y a PAS de suppression.
 *
 * Une société a porté des missions et des mois facturés ; l'effacer
 * détacherait ses missions et rendrait illisible l'historique qui la nomme.
 * L'écran ne propose donc aucun geste de suppression : ce n'est pas une
 * convention, c'est l'absence de chemin.
 */
export function useArchiveLegalEntity() {
  const qc = useQueryClient()
  return useMutation<LegalEntity, Error, { id: string; archived: boolean }>({
    mutationFn: ({ id, archived }) =>
      apiFetch<LegalEntity, { archived: boolean }>({
        path: `/legal-entities/${id}/archive`,
        method: 'PATCH',
        body: { archived },
      }),
    onSuccess: entity => {
      void qc.invalidateQueries({ queryKey: legalEntityKeys.all })
      toast.success(i18n.t(entity.archived ? 'legalEntities:toast.archived' : 'legalEntities:toast.restored'))
    },
    onError: error => toast.error(i18n.t('legalEntities:toast.archiveFailed'), { description: error.message }),
  })
}
