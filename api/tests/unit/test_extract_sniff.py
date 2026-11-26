import pytest

from app.services.extract import sniff


@pytest.mark.parametrize(
    ("data", "kind"),
    [
        (b"%PDF-1.7\n...", "pdf"),
        (b"\x89PNG\r\n\x1a\n....", "png"),
        (b"\xff\xd8\xff\xe0....", "jpeg"),
        (b"RIFF\x00\x00\x00\x00WEBPVP8 ", "webp"),
        (b"%!PS-Adobe-3.0", None),  # PostScript looks PDF-ish but isn't
        (b"%PDF", None),
        (b"<svg>", None),
        (b"MZ\x90\x00", None),
        (b"", None),
    ],
)
def test_file_type_comes_from_the_signature(data: bytes, kind: str | None) -> None:
    assert sniff(data) == kind
