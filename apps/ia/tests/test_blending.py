"""#2299.3/.4/.6/.7 — le compilateur de mélange de sources et dédoublonnage.

Ce que ce fichier verrouille, doctrine d'abord :

  - deux résultats qui partagent un IDENTIFIANT CANONIQUE (SIREN / registryId)
    sont blendés en un seul, et AUCUNE preuve n'est perdue (2299.6) — chaque
    valeur divergente survit dans `blended_conflicts` ;
  - le choix entre deux valeurs divergentes ne dépend JAMAIS de l'ORDRE
    d'arrivée dans la liste — c'est le sens de « ne pas écraser une preuve
    par la dernière source arrivée » (2299.7) ;
  - une correction humaine gagne toujours, quel que soit le connecteur ou la
    fraîcheur des autres valeurs (doctrine) ;
  - deux résultats seulement PROCHES par le nom (aucun identifiant canonique
    commun) restent SÉPARÉS (2299.3) et portent une hypothèse de doublon
    NOMMÉE avec son raisonnement, jamais un chiffre de confiance (2299.4,
    arbitrage Louis 18/09 sur #2299.33) ;
  - une identité incertaine n'est JAMAIS fusionnée automatiquement (2299.5 —
    la doctrine la plus dure du lot : « on PROPOSE une fusion de doublons, on
    ne fusionne JAMAIS ») ;
  - aucun CRITÈRE PROTÉGÉ ne pèse dans un score de rapprochement (doctrine) ;
  - la provenance nomme un CONNECTEUR (registry/press/llm/other…), jamais un
    de nos fournisseurs (Pappers/Apollo/Brave...) — même table que
    `org_graph_assembler._kind_for_source` (GA-26, une seule correspondance).
"""

from __future__ import annotations

from app.services.compilers.blending import blend_accounts


def _candidate(**overrides: object) -> dict:
    base: dict = {
        "siren": "552032534",
        "name": "FREE SAS",
        "city": "Paris",
        "sources": [{"name": "pappers", "fetchedAt": "2026-09-16T15:26:00+00:00"}],
    }
    base.update(overrides)
    return base


class TestBlendMergeParIdentifiantCanonique:
    def test_deux_candidats_meme_siren_sont_fusionnes_en_un(self) -> None:
        out = blend_accounts([_candidate(), _candidate(city="Levallois-Perret")])
        assert len(out) == 1

    def test_aucune_preuve_nest_perdue_sur_un_conflit(self) -> None:
        """2299.6 — la valeur DIVERGENTE (ville) survit, elle n'est pas jetée."""
        out = blend_accounts([_candidate(city="Paris"), _candidate(city="Levallois-Perret")])
        conflicts = out[0]["blended_conflicts"]["city"]
        values = {c["value"] for c in conflicts}
        assert values == {"Paris", "Levallois-Perret"}

    def test_le_choix_ne_depend_pas_de_lordre_darrivee(self) -> None:
        """2299.7 — même entrées, ordre inversé ⇒ même valeur retenue."""
        a = _candidate(city="Paris", sources=[{"name": "pappers", "fetchedAt": "2026-09-16T00:00:00+00:00"}])
        b = _candidate(city="Levallois-Perret", sources=[{"name": "brave_search", "fetchedAt": "2026-09-17T00:00:00+00:00"}])
        out_forward = blend_accounts([a, b])
        out_reversed = blend_accounts([b, a])
        assert out_forward[0]["city"] == out_reversed[0]["city"]
        # Le registre (Pappers) est plus fiable qu'une mention web (Brave) —
        # la source la plus RÉCENTE (Brave, 17/09) ne gagne PAS pour autant :
        # ce serait exactement « la dernière source arrivée écrase ».
        assert out_forward[0]["city"] == "Paris"

    def test_une_correction_humaine_gagne_toujours(self) -> None:
        """Doctrine — une correction humaine gagne, quelle que soit sa date."""
        corrected = _candidate(
            city="Levallois-Perret",
            sources=[{"name": "manual", "fetchedAt": "2020-01-01T00:00:00+00:00"}],
            humanCorrections={"city": True},
        )
        fresher = _candidate(city="Paris", sources=[{"name": "pappers", "fetchedAt": "2026-09-20T00:00:00+00:00"}])
        out = blend_accounts([fresher, corrected])
        assert out[0]["city"] == "Levallois-Perret"

    def test_toutes_les_sources_survivent_sans_nommer_le_fournisseur(self) -> None:
        out = blend_accounts(
            [
                _candidate(sources=[{"name": "pappers", "fetchedAt": "2026-09-16T00:00:00+00:00"}]),
                _candidate(sources=[{"name": "brave_search", "fetchedAt": "2026-09-17T00:00:00+00:00"}]),
            ]
        )
        sources = out[0]["sources"]
        assert len(sources) == 2
        rendu = repr(sources).lower()
        for fournisseur in ("pappers", "brave_search", "apollo", "insee"):
            assert fournisseur not in rendu
        assert {s["connector"] for s in sources} == {"registry", "press"}

    def test_un_candidat_sans_siren_ni_registry_id_nest_pas_groupe(self) -> None:
        out = blend_accounts([_candidate(siren=""), _candidate(siren="")])
        assert len(out) == 2


class TestSeparerEtSignalerUneIdentiteIncertaine:
    def test_deux_noms_proches_sans_identifiant_commun_restent_separes(self) -> None:
        """2299.3 — jamais fusionnés : deux entrées distinctes en sortie."""
        out = blend_accounts([_candidate(siren="552032534", name="Bellum IT"), _candidate(siren="999999999", name="Bellum-IT")])
        assert len(out) == 2

    def test_lambiguite_est_signalee_avec_un_raisonnement_jamais_un_chiffre(self) -> None:
        """2299.4 — hypothèse nommée, `reasoning` consultable, AUCUNE probabilité
        (arbitrage Louis 18/09 : une hypothèse s'affiche comme une hypothèse)."""
        out = blend_accounts([_candidate(siren="552032534", name="Bellum IT"), _candidate(siren="999999999", name="Bellum-IT")])
        for item in out:
            assert item["ambiguous"] is True
            hyp = item["duplicate_hypothesis"][0]
            assert "reasoning" in hyp and hyp["reasoning"]
            assert "confidence" not in hyp
            assert not any(str(v).replace(".", "", 1).isdigit() for v in hyp.values())

    def test_lidentite_incertaine_nest_jamais_fusionnee_automatiquement(self) -> None:
        """2299.5 — la doctrine la plus dure : chaque champ garde SA propre
        valeur, rien n'est copié de l'un vers l'autre."""
        out = blend_accounts([_candidate(siren="552032534", name="Bellum IT", city="Paris"), _candidate(siren="999999999", name="Bellum-IT", city="Lyon")])
        cities = {item["city"] for item in out}
        assert cities == {"Paris", "Lyon"}

    def test_deux_noms_franchement_differents_ne_declenchent_rien(self) -> None:
        out = blend_accounts([_candidate(siren="552032534", name="Bellum IT"), _candidate(siren="999999999", name="Capgemini")])
        assert "duplicate_hypothesis" not in out[0]
        assert "duplicate_hypothesis" not in out[1]
        assert "ambiguous" not in out[0]


class TestAucunCritereProtegeDansLeRapprochement:
    def test_un_champ_protege_ne_change_jamais_le_resultat(self) -> None:
        """Aucun critère protégé ne pèse dans un score de rapprochement — la
        présence d'un champ « age »/« origin » ne doit rien changer."""
        plain = blend_accounts([_candidate(siren="552032534", name="Bellum IT"), _candidate(siren="999999999", name="Bellum-IT")])
        tainted = blend_accounts(
            [
                _candidate(siren="552032534", name="Bellum IT", age=54, origin="FR"),
                _candidate(siren="999999999", name="Bellum-IT", age=23, origin="BE"),
            ]
        )
        assert [item.get("ambiguous") for item in plain] == [item.get("ambiguous") for item in tainted]
        for item in tainted:
            assert "age" not in item
            assert "origin" not in item


class TestOrdreDesorties:
    def test_lordre_original_est_preserve_pour_le_classement(self) -> None:
        """Le classement (score) est déjà fait AVANT le compilateur — l'ordre
        d'entrée doit survivre, y compris quand une fusion réduit la liste."""
        items = [
            _candidate(siren="1", name="Un"),
            _candidate(siren="2", name="Deux"),
            _candidate(siren="1", name="Un"),
            _candidate(siren="3", name="Trois"),
        ]
        out = blend_accounts(items)
        assert [item["name"] for item in out] == ["Un", "Deux", "Trois"]
