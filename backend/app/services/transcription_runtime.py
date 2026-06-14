from __future__ import annotations

import logging
import os
import shlex
import shutil
import subprocess
import tempfile
import wave
from functools import lru_cache
from pathlib import Path

import imageio_ffmpeg

from app.core.config import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def bootstrap_transcription_runtime() -> Path:
    ffmpeg_path = _resolve_ffmpeg_binary()
    command_path = _ensure_ffmpeg_command(ffmpeg_path)
    _ensure_ffmpeg_on_path(command_path)
    _validate_ffmpeg_binary(command_path)
    _validate_whisper_ffmpeg_access()
    logger.info("Whisper transcription runtime ready with ffmpeg at %s", ffmpeg_path)
    return ffmpeg_path


def _resolve_ffmpeg_binary() -> Path:
    if settings.ffmpeg_binary_path:
        ffmpeg_path = Path(settings.ffmpeg_binary_path).expanduser().resolve()
        if not ffmpeg_path.exists():
            raise RuntimeError(f"Configured ffmpeg binary does not exist: {ffmpeg_path}")
        logger.info("Using configured ffmpeg binary at %s", ffmpeg_path)
        return ffmpeg_path

    system_ffmpeg = shutil.which("ffmpeg")
    if system_ffmpeg:
        ffmpeg_path = Path(system_ffmpeg).resolve()
        logger.info("Using system ffmpeg binary at %s", ffmpeg_path)
        return ffmpeg_path

    ffmpeg_path = Path(imageio_ffmpeg.get_ffmpeg_exe()).resolve()
    logger.info("Using bundled ffmpeg binary from imageio-ffmpeg at %s", ffmpeg_path)
    return ffmpeg_path


def _ensure_ffmpeg_on_path(ffmpeg_path: Path) -> None:
    ffmpeg_dir = str(ffmpeg_path.parent)
    current_path = os.environ.get("PATH", "")
    path_entries = current_path.split(os.pathsep) if current_path else []
    if ffmpeg_dir not in path_entries:
        os.environ["PATH"] = ffmpeg_dir + (os.pathsep + current_path if current_path else "")
        logger.info("Prepended ffmpeg directory to PATH: %s", ffmpeg_dir)


def _ensure_ffmpeg_command(ffmpeg_path: Path) -> Path:
    if ffmpeg_path.stem == "ffmpeg":
        return ffmpeg_path

    shim_dir = Path(tempfile.gettempdir()) / "olanma-ffmpeg-bin"
    shim_dir.mkdir(parents=True, exist_ok=True)
    if os.name == "nt":
        shim_path = shim_dir / "ffmpeg.cmd"
        shim_contents = f'@"{ffmpeg_path}" %*\r\n'
    else:
        shim_path = shim_dir / "ffmpeg"
        shim_contents = f"#!/bin/sh\nexec {shlex.quote(str(ffmpeg_path))} \"$@\"\n"

    if not shim_path.exists() or shim_path.read_text(encoding="utf-8") != shim_contents:
        shim_path.write_text(shim_contents, encoding="utf-8")
        if os.name != "nt":
            shim_path.chmod(0o755)
        logger.info("Created ffmpeg command shim at %s", shim_path)

    return shim_path


def _validate_ffmpeg_binary(ffmpeg_path: Path) -> None:
    discovered = shutil.which("ffmpeg")
    if not discovered:
        raise RuntimeError("ffmpeg is unavailable. Transcription cannot start.")

    try:
        subprocess.run(
            [discovered, "-version"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        raise RuntimeError(f"ffmpeg is unavailable. Transcription cannot start: {exc}") from exc


def _validate_whisper_ffmpeg_access() -> None:
    try:
        from whisper.audio import load_audio
    except ImportError as exc:
        raise RuntimeError("openai-whisper is not installed. Transcription cannot start.") from exc

    sample_path = _create_validation_wav()
    try:
        load_audio(str(sample_path))
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"Whisper could not access ffmpeg. Transcription cannot start: {exc}") from exc
    finally:
        sample_path.unlink(missing_ok=True)


def _create_validation_wav() -> Path:
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as handle:
        sample_path = Path(handle.name)

    with wave.open(str(sample_path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(16_000)
        wav_file.writeframes(b"\x00\x00" * 16_000)

    return sample_path
