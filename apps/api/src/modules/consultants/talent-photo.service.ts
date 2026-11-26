import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { TalentPage } from '@bellum/contracts'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { returnedRows } from '../../database/returned-rows'

/**
 * La PHOTO d'un talent — délibérément un SERVICE À PART (écran Vivier,
 * PDF-22 §01, piège n°3 : « la photo s'affiche mais n'entre dans aucun
 * classement »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE, ET PAS UNE COLONNE DE PLUS DANS `decorate()`
 * ─────────────────────────────────────────────────────────────────────────────
 * `TalentService` (`talent.service.ts`) est un des moteurs surveillés par
 * `protected-criteria.spec.ts` (GA-06) : aucune ligne de ce fichier-là ne doit
 * lire un critère protégé, et la photo en est un — annexe III de l'EU AI Act,
 * doublée par le droit des données personnelles. La garde travaille par le NOM
 * du fichier ; le tenir vide de la colonne, littéralement, est ce qui la rend
 * vérifiable plutôt que déclarative.
 *
 * Ce service-ci vit donc HORS de la liste surveillée. Il ne trie rien, ne
 * score rien, ne compare rien : il lit une colonne et la recopie sur la ligne
 * déjà construite, APRÈS que `TalentService.search()` a fini son travail
 * (filtrage, tri, dérivation de la disponibilité). La photo ne peut donc
 * matériellement influencer ni le tri (déjà fait), ni aucun score (le vivier
 * n'en calcule aucun sur ces lignes).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ÉCRITURE (31/08/2026) — LE DÉPÔT D'UNE PHOTO
 * ─────────────────────────────────────────────────────────────────────────────
 * `setPhoto()` est le SEUL chemin qui pose ou retire `photo_url`. Il vit ici,
 * pas dans `TalentService` ni `ConsultantsService`, pour la même raison que
 * `attach()` : rester HORS de `SELECTION_ENGINES` (GA-06) est ce qui rend la
 * garde vérifiable par le NOM du fichier plutôt que déclarative. Une
 * validation de FORME (taille, type MIME) vit dans `talentPhotoSchema`
 * (`@bellum/contracts`) — ce service ne revalide pas, il écrit ce qu'on lui
 * donne une fois que le contrôleur l'a déjà validé.
 */
@Injectable()
export class TalentPhotoService {
  constructor(@InjectRepository(ConsultantEntity) private readonly consultants: Repository<ConsultantEntity>) {}

  /** Fusionne la photo de chaque ligne, sans rien réordonner ni recompter. */
  async attach(workspaceId: string, page: TalentPage): Promise<TalentPage> {
    if (page.items.length === 0) return page
    const ids = page.items.map(item => item.id)
    const rows = await this.consultants.manager.query<{ id: string; photo_url: string | null }[]>(
      `SELECT id, photo_url FROM consultants WHERE workspace_id = $1 AND id = ANY($2::uuid[])`,
      [workspaceId, ids],
    )
    const byId = new Map(rows.map(row => [row.id, row.photo_url]))
    return { ...page, items: page.items.map(item => ({ ...item, photoUrl: byId.get(item.id) ?? null })) }
  }

  /**
   * Pose (ou retire, `null`) la photo d'UN talent, scopé à l'espace de
   * l'appelant. 404 sur un id d'un autre espace — jamais d'écriture à
   * l'aveugle sur une fiche qu'on n'a pas le droit de voir.
   */
  async setPhoto(
    consultantId: string,
    workspaceId: string,
    photoUrl: string | null,
  ): Promise<{ photoUrl: string | null }> {
    const result = await this.consultants.manager.query(
      `UPDATE consultants SET photo_url = $3 WHERE id = $1 AND workspace_id = $2 RETURNING id`,
      [consultantId, workspaceId, photoUrl],
    )
    // ⚠️ `returnedRows` et non `result.length` — c'est la porte unique, et elle
    // existe pour CE défaut exact. Sur un UPDATE, TypeORM rend `[lignes,
    // nombre]` : `result.length` vaut donc TOUJOURS 2, le 404 ne partait
    // jamais, et poser une photo sur un talent inexistant — ou sur celui d'un
    // AUTRE espace — répondait « c'est fait » alors que rien n'était écrit.
    // Trouvé par `returned-rows.spec.ts` le 01/09/2026, à l'intégration.
    if (returnedRows<{ id: string }>(result).length === 0) throw new NotFoundException('Talent introuvable')
    return { photoUrl }
  }
}
