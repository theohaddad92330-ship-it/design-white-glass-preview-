"""#2302 (LAU-FINAL-043) — le résolveur de territoire commercial.

Doctrine c83 (`doctrine-registry.ts`) : « territoire » ici désigne un NIVEAU DE
COMPTE (quel périmètre adresser — groupe / filiale / BU / site / marque…),
JAMAIS un nœud du graphe d'organisation (`orgEntityTypeSchema`, org-graph.ts,
axe séparé du lot #2310). Le résolveur ne recalcule AUCUN classement : il lit
les entités déjà annotées par `entities.py` (`type` / `relevance` /
`actionable` / `getsPlay`, le MÊME contrat que `entityNodeSchema`,
packages/contracts/src/schemas/analysis/research.ts) et recommande un
périmètre — jamais une nouvelle passe de filtrage du bruit (GA-26).
"""

from __future__ import annotations

from app.services.compilers.territory_resolver import (
    SECTOR_TERRITORY_PREFERENCE,
    TERRITORY_LEVELS,
    resolve_commercial_territory,
)


def _entity(**kwargs: object) -> dict:
    base = {
        "name": "Filiale X",
        "type": "filiale",
        "parent": "Groupe X",
        "region": "Île-de-France",
        "it_autonomy": "autonome",
        "relevance": "operating",
        "actionable": True,
        "getsPlay": True,
    }
    base.update(kwargs)
    return base


class TestTerritoryLevels:
    def test_les_onze_niveaux_sont_exposes(self) -> None:
        assert set(TERRITORY_LEVELS) == {
            "groupe",
            "maison_mere",
            "filiale",
            "sous_filiale",
            "bu",
            "direction",
            "entite_juridique",
            "marque",
            "etablissement",
            "region",
            "pays",
        }

    def test_programme_et_projet_nen_font_pas_partie(self) -> None:
        # Arbitrage Louis 18/09/2026 : programme/projet sont l'AUTRE axe
        # (orgEntityTypeSchema, org-graph.ts) — jamais un niveau de territoire.
        assert "programme" not in TERRITORY_LEVELS
        assert "projet" not in TERRITORY_LEVELS


class TestNiveauxManquants:
    """#2302.2/.11/.12/.13 (épopée #2961) — ces quatre niveaux existaient dans
    TERRITORY_LEVELS mais `_ENTITY_TYPE_TO_LEVEL` n'avait AUCUNE entrée vers
    eux : 0 candidat ne pouvait jamais y être classé (constat de l'audit du
    25/09/2026, commentaire #2961)."""

    def test_maison_mere_est_un_niveau_atteignable(self) -> None:
        out = resolve_commercial_territory([_entity(name="Maison Mère X", type="maison_mere", parent=None)])
        assert out["candidates"][0]["level"] == "maison_mere"

    def test_etablissement_est_un_niveau_atteignable(self) -> None:
        out = resolve_commercial_territory([_entity(name="Établissement Sud", type="etablissement", parent="Groupe X")])
        assert out["candidates"][0]["level"] == "etablissement"

    def test_region_est_un_niveau_atteignable(self) -> None:
        out = resolve_commercial_territory([_entity(name="Région PACA", type="region", parent="Groupe X")])
        assert out["candidates"][0]["level"] == "region"

    def test_pays_est_un_niveau_atteignable(self) -> None:
        out = resolve_commercial_territory([_entity(name="Espagne", type="pays", parent="Groupe X")])
        assert out["candidates"][0]["level"] == "pays"


class TestRienDobserve:
    def test_liste_vide_rend_rien_observe_jamais_aucune_entreprise(self) -> None:
        out = resolve_commercial_territory([])
        assert out["candidates"] == []
        assert out["primary"] is None
        assert out["primary_reason"] == "rien d'observé"
        assert "aucune entreprise" not in out["primary_reason"]

    def test_entree_non_mapping_ignoree_sans_lever(self) -> None:
        out = resolve_commercial_territory([None, "pas-un-dict", 42])  # type: ignore[list-item]
        assert out["candidates"] == []
        assert out["primary"] is None


class TestNoGoGroupeParDefaut:
    """#2302.64 — jamais le groupe/siège entier faute d'examen des filiales."""

    def test_seul_le_groupe_present_ne_devient_jamais_primary(self) -> None:
        out = resolve_commercial_territory(
            [_entity(name="Groupe X", type="groupe", parent=None, actionable=True, relevance="operating")]
        )
        assert out["primary"] is None
        assert "examen" in out["primary_reason"]

    def test_une_filiale_actionnable_passe_devant_le_groupe(self) -> None:
        out = resolve_commercial_territory(
            [
                _entity(name="Groupe X", type="groupe", parent=None),
                _entity(name="Filiale Y", type="filiale", parent="Groupe X"),
            ]
        )
        assert out["primary"] is not None
        assert out["primary"]["name"] == "Filiale Y"
        assert out["primary"]["level"] == "filiale"

    def test_groupe_seul_actionnable_apres_filtrage_du_bruit_reste_sans_primary(self) -> None:
        out = resolve_commercial_territory(
            [
                _entity(name="Groupe X", type="groupe", parent=None),
                _entity(name="SCI Bruit", type="bruit", relevance="noise", actionable=False),
            ]
        )
        assert out["primary"] is None
        assert len(out["excluded"]) == 1
        assert out["excluded"][0]["name"] == "SCI Bruit"


class TestFiltrageBruitConserveLeMotif:
    def test_entite_non_actionnable_va_dans_excluded_jamais_supprimee(self) -> None:
        out = resolve_commercial_territory(
            [
                _entity(name="Filiale Y", type="filiale"),
                _entity(
                    name="2009 KOALA FINANCE",
                    type="SPV",
                    relevance="noise",
                    relevanceReason="SPV / véhicule de financement (titrisation)",
                    actionable=False,
                ),
            ]
        )
        motifs = {e["name"]: e["reason"] for e in out["excluded"]}
        assert motifs["2009 KOALA FINANCE"] == "SPV / véhicule de financement (titrisation)"
        assert all(c["name"] != "2009 KOALA FINANCE" for c in out["candidates"])

    def test_marque_sans_autonomie_declaree_est_ecartee(self) -> None:
        # #2302.41 — une marque dont l'autonomie n'a jamais été observée ne
        # devient pas une cible : elle part en « Autres entités » avec motif.
        out = resolve_commercial_territory(
            [_entity(name="Marque Z", type="marque", it_autonomy="", relevance="operating", actionable=True)]
        )
        assert out["primary"] is None or out["primary"]["name"] != "Marque Z"
        assert any(e["name"] == "Marque Z" for e in out["excluded"])


class TestSousFiliale:
    def test_filiale_dune_filiale_devient_sous_filiale(self) -> None:
        # #2302.4 — dérivé de la chaîne `parent` déjà posée par
        # `assign_entity_parents`, jamais un second classement du nom.
        out = resolve_commercial_territory(
            [
                _entity(name="Groupe X", type="groupe", parent=None),
                _entity(name="Filiale Y", type="filiale", parent="Groupe X"),
                _entity(name="Filiale Y Bis", type="filiale", parent="Filiale Y"),
            ]
        )
        levels = {c["name"]: c["level"] for c in out["candidates"]}
        assert levels["Filiale Y"] == "filiale"
        assert levels["Filiale Y Bis"] == "sous_filiale"


class TestSortieParTerritoire:
    def test_les_champs_presents_sont_restitues(self) -> None:
        out = resolve_commercial_territory(
            [_entity(name="Filiale Y", type="filiale", parent="Groupe X", region="PACA", it_autonomy="autonome")]
        )
        candidate = out["candidates"][0]
        assert candidate["rattachement"] == "Groupe X"
        assert candidate["localisation"] == "PACA"
        assert candidate["autonomie_probable"] == "autonome"
        assert candidate["pertinence_offre"] == "operating"
        assert "inconnues" not in candidate or "rattachement" not in candidate["inconnues"]

    def test_champ_absent_nomme_dans_inconnues_jamais_invente(self) -> None:
        out = resolve_commercial_territory(
            [_entity(name="Filiale Sans Region", type="filiale", parent="Groupe X", region="")]
        )
        candidate = out["candidates"][0]
        assert "localisation" not in candidate
        assert "localisation" in candidate["inconnues"]

    def test_confiance_basse_quand_beaucoup_dinconnues(self) -> None:
        out = resolve_commercial_territory(
            [{"name": "Filiale Fantôme", "type": "filiale", "relevance": "operating", "actionable": True}]
        )
        candidate = out["candidates"][0]
        assert candidate["confiance"] == "faible"

    def test_taille_restituee_quand_effectif_estime_present(self) -> None:
        # #2302.19 — la taille (effectif estimé, déjà collecté par
        # entities.py/`estimated_headcount`) est restituée par territoire.
        out = resolve_commercial_territory([_entity(name="Filiale Y", type="filiale", estimated_headcount="200-500")])
        assert out["candidates"][0]["taille"] == "200-500"

    def test_taille_absente_nommee_dans_inconnues(self) -> None:
        out = resolve_commercial_territory(
            [{"name": "Filiale Fantôme", "type": "filiale", "relevance": "operating", "actionable": True}]
        )
        candidate = out["candidates"][0]
        assert "taille" not in candidate
        assert "taille" in candidate["inconnues"]


class TestAutonomieLocaleCommeSignal:
    """#2302.20 — l'autonomie locale n'était qu'un champ de sortie recopié,
    jamais un critère qui fait gagner un candidat (constat audit 25/09/2026).
    Une autonomie 'autonome' est un territoire plus actionnable localement
    qu'une autonomie 'centralise' — à préférence sectorielle égale."""

    def test_autonome_passe_devant_centralise_a_niveau_egal(self) -> None:
        out = resolve_commercial_territory(
            [
                _entity(name="Filiale Centralisée", type="filiale", it_autonomy="centralise"),
                _entity(name="Filiale Autonome", type="filiale", it_autonomy="autonome"),
            ]
        )
        assert out["primary"]["name"] == "Filiale Autonome"

    def test_la_preference_sectorielle_prime_toujours_sur_lautonomie(self) -> None:
        # L'autonomie ne départage qu'À NIVEAU ÉGAL — jamais devant le NO-GO
        # sectoriel (#2302.34) : une BU centralisée reste devant une filiale
        # autonome pour un secteur qui préfère la BU.
        out = resolve_commercial_territory(
            [
                _entity(name="Filiale Autonome", type="filiale", it_autonomy="autonome"),
                _entity(name="BU Centralisée", type="bu", it_autonomy="centralise"),
            ],
            sector="it_data_cyber",
        )
        assert out["primary"]["name"] == "BU Centralisée"


class TestSelectionEtAlternative:
    def test_une_alternative_est_proposee_quand_un_second_candidat_existe(self) -> None:
        out = resolve_commercial_territory(
            [
                _entity(name="Filiale Y", type="filiale"),
                _entity(name="BU Data", type="bu"),
            ]
        )
        assert out["primary"] is not None
        assert out["alternate"] is not None
        assert out["primary"]["name"] != out["alternate"]["name"]


class TestPreferenceSectorielle:
    def test_les_cinq_secteurs_sont_couverts(self) -> None:
        assert set(SECTOR_TERRITORY_PREFERENCE) == {
            "it_data_cyber",
            "industrie",
            "environnement",
            "automobile",
            "pharma",
        }

    def test_aucune_paire_de_secteurs_ne_partage_la_meme_structure(self) -> None:
        # #2302.34 — NO-GO explicite : jamais la même structure de territoire
        # pour tous les marchés. Un vrai désaccord de fond, pas un réordonnement.
        preferences = list(SECTOR_TERRITORY_PREFERENCE.values())
        assert len({tuple(sorted(p)) for p in preferences}) == len(preferences)

    def test_le_secteur_change_le_candidat_primaire_retenu(self) -> None:
        entities = [
            _entity(name="BU Data", type="bu"),
            _entity(name="Établissement Sud", type="filiale"),
        ]
        it_out = resolve_commercial_territory(entities, sector="it_data_cyber")
        industrie_out = resolve_commercial_territory(entities, sector="industrie")
        assert it_out["primary"]["level"] == "bu"
        assert industrie_out["primary"]["level"] == "filiale"


class TestAchatsEtRecoursExterneParTerritoire:
    """#2302.26 (achats comme signal de génération/classement), #2302.22
    (historique de recours externe comme signal), #2302.53 (restituer le
    recours externe observé) et #2302.55 (restituer les achats) — les QUATRE
    reposent sur la MÊME donnée déjà collectée et déjà groupée PAR ENTITÉ
    ACHETEUSE : `purchasingThread.byBuyer` (marchés DECP attribués,
    `apps/ia/app/services/purchasing_thread.py::build_purchasing_thread`,
    stocké dans `raw_analysis.purchasingThread` par `phase1_research.py:1629`).
    Un item `byBuyer` porte déjà `name` / `contractsAwarded` / `lastAwardedDate`
    / `suppliers` (les concurrents déjà titulaires — le « recours externe »)."""

    def test_achats_restitues_pour_le_territoire_acheteur(self) -> None:
        out = resolve_commercial_territory(
            [_entity(name="Filiale Y", type="filiale")],
            purchasing_by_buyer=[
                {
                    "name": "Filiale Y",
                    "contractsAwarded": 3,
                    "lastAwardedDate": "2026-01-15",
                    "suppliers": ["Capgemini"],
                }
            ],
        )
        candidate = out["candidates"][0]
        assert candidate["achats"] == {"contractsAwarded": 3, "lastAwardedDate": "2026-01-15"}

    def test_recours_externe_observe_restitue_pour_le_territoire(self) -> None:
        out = resolve_commercial_territory(
            [_entity(name="Filiale Y", type="filiale")],
            purchasing_by_buyer=[
                {
                    "name": "Filiale Y",
                    "contractsAwarded": 2,
                    "lastAwardedDate": None,
                    "suppliers": ["Sopra Steria", "Atos"],
                }
            ],
        )
        assert out["candidates"][0]["recours_externe_observe"] == ["Sopra Steria", "Atos"]

    def test_appariement_insensible_a_la_casse_et_aux_accents(self) -> None:
        out = resolve_commercial_territory(
            [_entity(name="Établissement Sud", type="filiale")],
            purchasing_by_buyer=[{"name": "ETABLISSEMENT sud", "contractsAwarded": 1, "suppliers": []}],
        )
        assert out["candidates"][0]["achats"]["contractsAwarded"] == 1

    def test_sans_marche_le_champ_est_absent_jamais_zero_invente(self) -> None:
        # GA-259 / doctrine : rien d'observé ne se dit jamais "0 marché".
        out = resolve_commercial_territory([_entity(name="Filiale Y", type="filiale")])
        candidate = out["candidates"][0]
        assert "achats" not in candidate
        assert "achats" in candidate["inconnues"]
        assert "recours_externe_observe" not in candidate

    def test_un_territoire_avec_achats_observes_passe_devant_un_territoire_sans(self) -> None:
        out = resolve_commercial_territory(
            [
                _entity(name="Filiale Sans Marché", type="filiale"),
                _entity(name="Filiale Avec Marché", type="filiale", it_autonomy="centralise"),
            ],
            purchasing_by_buyer=[{"name": "Filiale Avec Marché", "contractsAwarded": 1, "suppliers": []}],
        )
        assert out["primary"]["name"] == "Filiale Avec Marché"

    def test_entree_non_mapping_dans_purchasing_by_buyer_ignoree(self) -> None:
        out = resolve_commercial_territory(
            [_entity(name="Filiale Y", type="filiale")],
            purchasing_by_buyer=[None, "pas-un-dict", {"name": "Autre Entité", "contractsAwarded": 1}],
        )
        assert "achats" not in out["candidates"][0]


class TestPremiereVerificationParTerritoire:
    """#2302.59 — la première chose à vérifier avant d'agir sur ce territoire.
    Dérivée du PREMIER manque qui compte vraiment (le rattachement d'abord :
    sans lui, aucun autre champ ne se raccroche à une hiérarchie ; puis le
    premier contact ; le reste ensuite) — jamais un texte générique inventé
    quand rien ne manque."""

    def test_le_rattachement_manquant_est_la_premiere_verification(self) -> None:
        out = resolve_commercial_territory([{"name": "Filiale Orpheline", "type": "filiale", "actionable": True}])
        assert out["candidates"][0]["premiere_verification"] == "rattachement"

    def test_a_defaut_de_rattachement_manquant_le_contact_est_verifie_en_premier(self) -> None:
        out = resolve_commercial_territory([_entity(name="Filiale Y", type="filiale", parent="Groupe X")])
        assert out["candidates"][0]["premiere_verification"] == "contacts_connus"

    def test_rien_a_verifier_le_champ_est_absent_jamais_invente(self) -> None:
        out = resolve_commercial_territory(
            [_entity(name="Filiale Y", type="filiale", contactsCount=3)],
            purchasing_by_buyer=[{"name": "Filiale Y", "contractsAwarded": 1, "suppliers": []}],
        )
        assert "premiere_verification" not in out["candidates"][0]


class TestMasquageParDefaut:
    """#2302.38 (entité inactive) / #2302.44 (adresse administrative sans
    équipe) — deux motifs de masquage de la liste originale de l'issue qui
    n'avaient AUCUN champ producteur (constat audit 25/09/2026) : le prompt
    `bellum_facts.py` demande maintenant `isActive`/`hasTeam`, JAMAIS devinés
    (absent = non mentionné, jamais recalculé ici)."""

    def test_entite_inactive_est_ecartee_avec_motif(self) -> None:
        out = resolve_commercial_territory([_entity(name="Filiale Cessée", type="filiale", is_active=False)])
        assert out["primary"] is None or out["primary"]["name"] != "Filiale Cessée"
        motifs = {e["name"]: e["reason"] for e in out["excluded"]}
        assert motifs["Filiale Cessée"] == "entité inactive"

    def test_entite_active_ou_non_mentionnee_nest_pas_ecartee_pour_ce_motif(self) -> None:
        out = resolve_commercial_territory([_entity(name="Filiale Y", type="filiale")])
        assert out["excluded"] == []

    def test_adresse_administrative_sans_equipe_est_ecartee_avec_motif(self) -> None:
        out = resolve_commercial_territory([_entity(name="Siège Admin", type="filiale", has_team=False)])
        motifs = {e["name"]: e["reason"] for e in out["excluded"]}
        assert motifs["Siège Admin"] == "adresse administrative sans équipe"

    def test_jamais_devine_absence_de_champ_nexclut_jamais(self) -> None:
        # `is_active`/`has_team` absents (dossier antérieur au lot, ou source
        # muette) : jamais recalculé, jamais une exclusion à leur place.
        out = resolve_commercial_territory([{"name": "Filiale Y", "type": "filiale", "actionable": True}])
        assert out["excluded"] == []


class TestGeographieCommeSignal:
    """#2302.18 — la géographie n'était qu'un champ de sortie recopié
    (`localisation`), jamais un critère qui fait gagner un candidat (constat
    audit 25/09/2026). `ideal_client_territory` (onboarding, déjà collecté —
    `answers-client-ideal.ts`) porte la géographie que l'ESN vise DÉJÀ : un
    territoire dont la région y correspond est préféré, à niveau et
    préférence sectorielle égaux — jamais devant eux."""

    def test_la_region_visee_passe_devant_une_autre_a_niveau_egal(self) -> None:
        out = resolve_commercial_territory(
            [
                _entity(name="Filiale Nord", type="filiale", region="Hauts-de-France", it_autonomy="centralise"),
                _entity(name="Filiale IDF", type="filiale", region="Île-de-France", it_autonomy="centralise"),
            ],
            preferred_regions=["Île-de-France"],
        )
        assert out["primary"]["name"] == "Filiale IDF"

    def test_appariement_insensible_a_la_casse_et_aux_accents(self) -> None:
        out = resolve_commercial_territory(
            [_entity(name="Filiale IDF", type="filiale", region="Île-de-France")],
            preferred_regions=["ile de france"],
        )
        assert out["primary"]["name"] == "Filiale IDF"

    def test_sans_region_visee_le_classement_est_inchange(self) -> None:
        out = resolve_commercial_territory([_entity(name="Filiale Y", type="filiale")], preferred_regions=None)
        assert out["primary"]["name"] == "Filiale Y"


class TestSignauxRecentsCommeSignalDeTerritoire:
    """#2302.21 (épopée #2961, tranché sans Louis) — les signaux récents comme
    signal de génération de candidat. `recentSignalSchema`
    (packages/contracts/src/schemas/analysis/research.ts) n'a AUCUN champ de
    liaison vers une entité/territoire (texte libre account-level) : apparier
    un signal à UNE FILIALE précise par proximité de texte serait un
    rapprochement inventé (même raisonnement que le commentaire du schéma
    pour #2687 : « apparier sur le texte serait un rapprochement par
    proximité : pire que l'absence »). Mais un signal n'est JAMAIS collecté à
    un niveau plus fin que le compte lui-même — il est donc restitué SANS
    INVENTION sur le territoire racine (groupe/maison_mère), jamais sur une
    filiale/BU où ce serait deviné."""

    def test_signaux_recents_restitues_sur_le_territoire_racine(self) -> None:
        out = resolve_commercial_territory(
            [_entity(name="Groupe X", type="groupe", parent=None)],
            recent_signals=[{"id": "s1", "signal": "Levée de fonds série C"}],
        )
        assert out["candidates"][0]["signaux_recents"] == 1

    def test_sans_signal_le_champ_est_absent_jamais_zero_invente(self) -> None:
        out = resolve_commercial_territory([_entity(name="Groupe X", type="groupe", parent=None)])
        assert "signaux_recents" not in out["candidates"][0]

    def test_signaux_jamais_restitues_sur_une_filiale_jamais_devine(self) -> None:
        out = resolve_commercial_territory(
            [_entity(name="Filiale Y", type="filiale")],
            recent_signals=[{"id": "s1", "signal": "Levée de fonds série C"}],
        )
        assert "signaux_recents" not in out["candidates"][0]

    def test_entree_non_mapping_dans_recent_signals_ignoree(self) -> None:
        out = resolve_commercial_territory(
            [_entity(name="Groupe X", type="groupe", parent=None)],
            recent_signals=[None, "pas-un-dict", {"id": "s1"}],
        )
        assert out["candidates"][0]["signaux_recents"] == 1


class TestReferencesComparablesCommeSignalDeTerritoire:
    """#2302.28 (épopée #2961, tranché sans Louis) — les comptes de référence
    NOMMÉS déclarés à l'onboarding (`esn_profiles.reference_accounts`,
    collecte STRUCTURÉE ajoutée par #2961), même raisonnement que
    `recent_signals` ci-dessus : aucune référence n'est liée à une entité
    précise du compte, donc restituée uniquement sur le territoire racine."""

    def test_references_restituees_sur_le_territoire_racine(self) -> None:
        out = resolve_commercial_territory(
            [_entity(name="Groupe X", type="groupe", parent=None)],
            reference_accounts=["Société Générale", "Thales"],
        )
        assert out["candidates"][0]["references_comparables"] == ["Société Générale", "Thales"]

    def test_sans_reference_le_champ_est_absent_jamais_invente(self) -> None:
        out = resolve_commercial_territory([_entity(name="Groupe X", type="groupe", parent=None)])
        assert "references_comparables" not in out["candidates"][0]

    def test_references_jamais_restituees_sur_une_filiale_jamais_devine(self) -> None:
        out = resolve_commercial_territory(
            [_entity(name="Filiale Y", type="filiale")],
            reference_accounts=["Société Générale"],
        )
        assert "references_comparables" not in out["candidates"][0]

    def test_entree_non_str_dans_reference_accounts_ignoree(self) -> None:
        out = resolve_commercial_territory(
            [_entity(name="Groupe X", type="groupe", parent=None)],
            reference_accounts=[None, "  ", "Thales"],  # type: ignore[list-item]
        )
        assert out["candidates"][0]["references_comparables"] == ["Thales"]
