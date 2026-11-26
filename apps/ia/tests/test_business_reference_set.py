"""#3422 — le jeu de tests métier de référence : ses vingt-et-un profils, leur
comportement écrit, et la preuve que chaque preuve citée existe encore.

Rejoué par le gate chat (`CHAT_EVAL_SUITES`) à chaque changement des
instructions de Laura (`CHAT_PROMPT_SURFACE`)."""

from __future__ import annotations

from pathlib import Path

from tests.business_reference_set import REFERENCE_PROFILES, Proof

REPO_ROOT = Path(__file__).resolve().parents[3]

# L'énoncé de l'issue, dans l'ordre — un profil retiré ou renommé fait échouer.
EXPECTED_LABELS = (
    "fondateur de 3 consultants demandant 100 comptes",
    "ESN de 15 consultants, premier Business Manager",
    "ESN de 35 consultants, plusieurs commerciaux",
    "Business Developer ouvrant un grand compte fermé",
    "Business Manager avec besoin sans budget",
    "recruteur avec consultant disponible",
    "manager devant couper cinq comptes",
    "client actif à étendre vers une autre BU",
    "approche directe",
    "relation chaude",
    "contact recommandé",
    "rang 2 avec non-contournement",
    "mauvais C-level",
    "bon manager intermédiaire",
    "historique CRM disponible",
    "aucun connecteur",
    "données contradictoires",
    "correction d'organigramme par l'utilisateur",
    "observation historique non actuelle",
    "message trop générique",
    "action nécessitant validation",
)


def _proof_exists(proof: Proof) -> bool:
    path = REPO_ROOT / proof.path
    return path.is_file() and proof.name in path.read_text(encoding="utf-8")


def test_the_twenty_one_profiles_of_the_issue_are_all_there_in_order() -> None:
    assert tuple(p.label for p in REFERENCE_PROFILES) == EXPECTED_LABELS
    assert tuple(p.number for p in REFERENCE_PROFILES) == tuple(range(1, 22))


def test_every_profile_writes_the_expected_behaviour_of_laura_the_pages_and_the_messages() -> None:
    for profile in REFERENCE_PROFILES:
        for field in ("laura", "pages", "messages"):
            text = getattr(profile, field)
            assert len(text.strip()) >= 20, f"profil {profile.number} : « {field} » vide ou creux"


def test_every_profile_cites_at_least_one_proof_that_still_exists() -> None:
    broken = [
        f"{p.number} ({p.label}) → {proof.path}::{proof.name}"
        for p in REFERENCE_PROFILES
        for proof in (p.proofs or (Proof("", ""),))
        if not proof.path or not _proof_exists(proof)
    ]
    assert not broken, "preuves introuvables (renommées ou supprimées) :\n" + "\n".join(broken)


def test_the_guard_knows_how_to_say_no() -> None:
    assert not _proof_exists(
        Proof("apps/ia/tests/test_business_reference_set.py", "cette_epreuve_n_existe_pas_xyz" + "_")
    )
    assert not _proof_exists(Proof("apps/ia/tests/fichier_absent.py", "x"))


def test_no_expected_behaviour_promises_a_probability() -> None:
    import re

    for profile in REFERENCE_PROFILES:
        blob = " ".join((profile.laura, profile.pages, profile.messages))
        assert not re.search(r"\d+\s?%|probabilit|chance de", blob), f"profil {profile.number} : probabilité"
