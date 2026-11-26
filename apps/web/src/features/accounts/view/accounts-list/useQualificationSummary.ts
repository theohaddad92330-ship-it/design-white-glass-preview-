import { useQuery } from '@tanstack/react-query'
import { qualificationGridApi } from '@/features/qualification-grid/lib/qualification-grid-api'

/**
 * Le verdict de la grille de qualification du PORTEFEUILLE (#3749) : un
 * verdict par compte, pour tout le workspace.
 *
 * La fiche compte lit déjà ce verdict (`useAccountQualification`) — mais
 * rien ne le faisait remonter à la LISTE des comptes, même mécanisme que
 * `useAccessSummary` pour la classe d'accessibilité (manque B du 30/08) :
 * `GET /qualification-grid/accounts-summary` sert la MÊME donnée que la
 * fiche, lue par le MÊME service (`QualificationGridService.accountsSummary`),
 * jamais recalculée (GA-26).
 */
export function useQualificationSummary() {
  return useQuery({
    queryKey: ['qualification-grid', 'accounts-summary'],
    queryFn: () => qualificationGridApi.accountsSummary(),
  })
}
