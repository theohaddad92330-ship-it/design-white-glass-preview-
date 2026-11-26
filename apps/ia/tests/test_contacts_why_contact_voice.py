"""#3692.8 — la voix de `whyContact` : au commercial, sans 3e personne ni genre inventé."""

from app.prompts.bellum_contacts import build_system_prompt
from tests.test_prompts_new import SAMPLE_PROFILE


def test_why_contact_prompt_addresses_the_seller_naturally():
    prompt = build_system_prompt(SAMPLE_PROFILE)
    assert "3e personne" in prompt
    assert "prenom de la personne repete" in prompt
    assert "n'invente JAMAIS de genre" in prompt
    assert "raisonne sur la demande du commercial" in prompt
    assert "a un autre contact est interdit" in prompt
