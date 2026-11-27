"""Storage is finite: a tutor can keep only so many application documents."""

import httpx

from app.routers.chat import MAX_TUTOR_DOCUMENTS
from tests.conftest import UserFactory


async def test_tutor_documents_are_capped(
    client: httpx.AsyncClient, make_user: UserFactory
) -> None:
    tutor = await make_user("tutor")
    for i in range(MAX_TUTOR_DOCUMENTS):
        r = await client.post(
            "/tutors/me/documents", headers=tutor.h, json={"filename": f"cert{i}.pdf"}
        )
        assert r.status_code == 201, r.text
    r = await client.post(
        "/tutors/me/documents", headers=tutor.h, json={"filename": "one-more.pdf"}
    )
    assert r.status_code == 409 and "up to" in r.json()["detail"]
