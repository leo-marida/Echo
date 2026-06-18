# Section 11 guard: drop any PCM16 chunk over 10KB/100ms (expected ~4.8KB at 24kHz/16-bit mono)
MAX_CHUNK_BYTES = 10_000


def is_valid_pcm16_chunk(data: bytes) -> bool:
    if not data:
        return False
    if len(data) % 2 != 0:
        return False
    if len(data) > MAX_CHUNK_BYTES:
        return False
    return True
