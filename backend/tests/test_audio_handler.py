from app.utils.audio import is_valid_pcm16_chunk, MAX_CHUNK_BYTES


def test_rejects_empty_chunk():
    assert is_valid_pcm16_chunk(b"") is False


def test_rejects_odd_length_chunk():
    assert is_valid_pcm16_chunk(b"\x00\x01\x02") is False


def test_rejects_oversized_chunk():
    assert is_valid_pcm16_chunk(b"\x00" * (MAX_CHUNK_BYTES + 2)) is False


def test_accepts_typical_chunk():
    # ~4.8KB expected for 100ms @ 24kHz/16-bit mono
    assert is_valid_pcm16_chunk(b"\x00" * 4800) is True


def test_accepts_max_size_chunk():
    assert is_valid_pcm16_chunk(b"\x00" * MAX_CHUNK_BYTES) is True
