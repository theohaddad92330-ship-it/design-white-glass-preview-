"""Les verdicts du banc de contrats amont — ce qui est ROUGE et ce qui ne l'est pas.

POURQUOI CE FICHIER EXISTE
--------------------------
Le banc `tests/contracts/` appelle les vrais fournisseurs une fois par jour pour
voir une rupture de contrat en 24 h. Le dépôt ne porte qu'un seul secret, si bien
que douze contrats sur dix-huit tombaient en `NOT_RUN` — **rouge, tous les
jours, depuis la création du workflow**.

Le refus d'origine était juste : « une clé absente et une API vérifiée ne doivent
pas se ressembler ». Sa conséquence ne l'était pas. Un rouge quotidien permanent
ne signale plus rien ; c'est la pire forme de rouge, celle qu'on apprend à
ignorer — et le jour où un vrai `CONTRACT_BROKEN` arrive, il arrive dans un job
déjà rouge depuis trois semaines.

Décision du 28/08/2026 (D25), et c'est elle que ce fichier tient :

- **clé absente** → `NOT_RUN`, NEUTRE. Ni vert (un vert mentirait), ni rouge.
- **clé présente mais refusée**, ou **contrat rompu** → ROUGE, comme avant.
- et le résumé du job **COMPTE**, sans quoi le neutre redevient un vert trompeur.

Ce dernier point est la contrepartie de la neutralité, pas un ornement : un état
qui ne dit pas COMBIEN de contrats ne sont plus surveillés remplace un rouge
inutile par un vert qui ment. Les compteurs sont donc testés ici, pas seulement
affichés.

Ce banc-ci est HERMÉTIQUE : il n'importe le module que pour lire ses verdicts, il
n'ouvre aucune connexion.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

from tests.contracts import conftest as contracts_conftest
from tests.contracts.harness import (
    ContractRecord,
    Verdict,
    contract_broken,
    credentials_rejected,
    not_run,
    summary_line,
    unwatched_notice,
    verdict_counts,
)

#: `apps/ia`, la racine depuis laquelle `tests.contracts.harness` est importable.
IA_ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(autouse=True)
def _isolated_records(monkeypatch: pytest.MonkeyPatch):
    """`RECORDS` est un module-level list : sans ça, les cas se contaminent."""
    monkeypatch.setattr("tests.contracts.harness.RECORDS", [])


def _rec(verdict: Verdict, provider: str = "acme") -> ContractRecord:
    return ContractRecord(provider=provider, endpoint="/probe", verdict=verdict)


# ── La distinction que la décision demande ───────────────────────────────────


class TestUneCleAbsenteEstNeutre:
    def test_une_cle_absente_ne_rend_pas_le_banc_rouge(self):
        # `Skipped`, PAS `Failed` : c'est toute la décision, en un `raises`.
        with pytest.raises(pytest.skip.Exception) as caught:
            not_run("Pappers", "/entreprise", "PAPPERS_API_KEY")

        assert not isinstance(caught.value, pytest.fail.Exception)

    def test_elle_dit_quand_meme_que_le_contrat_n_est_PAS_verifie(self):
        # Neutre ne veut pas dire muet. La raison doit nommer le contrat, la clé
        # manquante, et refuser de se faire passer pour une vérification.
        with pytest.raises(pytest.skip.Exception) as caught:
            not_run("Pappers", "/entreprise", "PAPPERS_API_KEY")

        reason = str(caught.value)
        assert "NOT RUN" in reason
        assert "Pappers" in reason
        assert "PAPPERS_API_KEY" in reason
        assert "UNVERIFIED" in reason

    def test_elle_est_enregistree_comme_NOT_RUN_et_non_comme_OK(self):
        from tests.contracts.harness import RECORDS

        with pytest.raises(pytest.skip.Exception):
            not_run("Pappers", "/entreprise", "PAPPERS_API_KEY")

        assert [r.verdict for r in RECORDS] == [Verdict.NOT_RUN]


class TestCeQuiResteRouge:
    def test_une_cle_refusee_reste_rouge(self):
        # Une clé présente et refusée est un problème d'exploitation qui a un
        # propriétaire et une action : recharger, faire tourner la clé. Elle
        # DOIT réveiller quelqu'un.
        with pytest.raises(pytest.fail.Exception) as caught:
            credentials_rejected("Pappers", "/entreprise", 402, "quota exhausted")

        assert "NOT A CONTRACT BREAK" in str(caught.value)

    def test_un_contrat_rompu_reste_rouge(self):
        with pytest.raises(pytest.fail.Exception) as caught:
            contract_broken(
                "Pappers",
                "/entreprise",
                what="le champ `siren` a disparu",
                expected="`siren` présent",
                got="absent",
            )

        assert "CONTRACT BROKEN" in str(caught.value)


class TestLeBancEntierNeTombePasQuandRienNEstVerifiable:
    """La preuve de bout en bout : le CODE DE SORTIE de pytest.

    Les `raises` ci-dessus prouvent le type d'exception. Ils ne prouvent PAS
    qu'un job vert sort bien en 0 — c'est pytest qui décide, pas nous, et c'est
    exactement ce que la décision promet au workflow. On le mesure donc en
    lançant un vrai pytest, et on mesure aussi son inverse.
    """

    def _run(self, tmp_path: Path, body: str) -> subprocess.CompletedProcess[str]:
        target = tmp_path / "test_generated_verdict.py"
        target.write_text(
            "from tests.contracts.harness import contract_broken, credentials_rejected, not_run\n\n"
            + body,
            encoding="utf-8",
        )
        return subprocess.run(
            [sys.executable, "-m", "pytest", str(target), "-q", "-p", "no:cacheprovider"],
            cwd=IA_ROOT,
            capture_output=True,
            text=True,
            check=False,
        )

    def test_sans_cle_le_code_de_sortie_est_ZERO(self, tmp_path: Path):
        result = self._run(
            tmp_path,
            "def test_sans_cle():\n    not_run('Pappers', '/entreprise', 'PAPPERS_API_KEY')\n",
        )

        assert result.returncode == 0, result.stdout + result.stderr
        assert "1 skipped" in result.stdout

    def test_une_cle_refusee_fait_bien_sortir_en_ECHEC(self, tmp_path: Path):
        # Le NON de la garde : sans ce cas, rendre `credentials_rejected` neutre
        # par mégarde passerait inaperçu, et le banc entier deviendrait décoratif.
        result = self._run(
            tmp_path,
            "def test_cle_refusee():\n    credentials_rejected('Pappers', '/e', 402, 'quota')\n",
        )

        assert result.returncode != 0
        assert "1 failed" in result.stdout


# ── Les compteurs — la contrepartie de la neutralité ─────────────────────────


class TestLeResumeCompte:
    def test_il_compte_les_trois_categories_qui_decident(self):
        records = [
            _rec(Verdict.OK, "Anthropic"),
            _rec(Verdict.OK, "BODACC"),
            _rec(Verdict.OK, "BOAMP"),
            *[_rec(Verdict.NOT_RUN, f"p{i}") for i in range(9)],
        ]

        line = summary_line(records)

        assert "12 contracts" in line
        assert "3 verified" in line
        assert "9 not run" in line
        assert "0 broken" in line

    def test_il_compte_les_cinq_verdicts_sans_en_fondre_deux(self):
        # `NOT_RUN` et `CREDENTIALS_REJECTED` étaient agrégés sous « unverified ».
        # Les fondre, c'est reperdre la distinction pour laquelle ce banc existe.
        records = [
            _rec(Verdict.OK),
            _rec(Verdict.CONTRACT_BROKEN),
            _rec(Verdict.NOT_RUN),
            _rec(Verdict.CREDENTIALS_REJECTED),
            _rec(Verdict.UPSTREAM_OUTAGE),
        ]

        assert verdict_counts(records) == {
            Verdict.OK: 1,
            Verdict.CONTRACT_BROKEN: 1,
            Verdict.NOT_RUN: 1,
            Verdict.CREDENTIALS_REJECTED: 1,
            Verdict.UPSTREAM_OUTAGE: 1,
        }

        line = summary_line(records)
        assert "1 credentials rejected" in line
        assert "1 upstream outage" in line

    def test_un_banc_vide_le_dit_au_lieu_de_rendre_des_zeros(self):
        # Zéro contrat exécuté et « 0 rompu » se ressemblent trop : un banc qui
        # n'a pas démarré doit se distinguer d'un banc entièrement vert.
        assert "no contract was recorded" in summary_line([])


class TestLAvertissementDesContratsNonSurveilles:
    def test_il_nomme_combien_et_lesquels(self):
        records = [_rec(Verdict.OK, "BODACC"), _rec(Verdict.NOT_RUN, "Pappers"), _rec(Verdict.NOT_RUN, "Brave")]

        notice = unwatched_notice(records)

        assert "2 contract" in notice
        assert "Brave" in notice and "Pappers" in notice
        # La phrase qui empêche le vert de mentir.
        assert "not because everything is verified" in notice

    def test_il_se_TAIT_quand_tout_a_ete_tente(self):
        # Un avertissement permanent est un avertissement mort : il ne doit
        # apparaître que lorsqu'un contrat est réellement hors surveillance.
        assert unwatched_notice([_rec(Verdict.OK), _rec(Verdict.CONTRACT_BROKEN)]) == ""


# ── La garde LIT quelque chose ───────────────────────────────────────────────


def test_le_tableau_de_verdicts_couvre_les_CINQ_verdicts():
    """Preuve que ce fichier regarde le vrai rendu, pas une copie.

    Un sixième verdict ajouté sans étiquette ni rang sortirait du tableau en
    silence — le lecteur du job ne le verrait jamais, et c'est précisément le
    genre d'angle mort que ce banc existe pour supprimer.
    """
    assert set(contracts_conftest._ORDER) == set(Verdict)
    assert set(contracts_conftest._LABEL) == set(Verdict)
    # `NOT RUN` doit s'annoncer comme non vérifié, jamais comme un succès.
    assert "UNVERIFIED" in contracts_conftest._LABEL[Verdict.NOT_RUN]
