#!/usr/bin/env python3
"""Bake Maxime Roz HDRIs to 4K JPEGs (ACES Filmic, same curve as Orby shaders)."""

from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT_SIZE = (4000, 2000)  # width, height
JPEG_QUALITY = 92


def aces_filmic(rgb: np.ndarray) -> np.ndarray:
    c = np.clip(rgb.astype(np.float64) * 0.8, 0.0, None)
    a, b, c_, d, e = 2.51, 0.03, 2.43, 0.59, 0.14
    return np.clip((c * (a * c + b)) / (c * (c_ * c + d) + e), 0.0, 1.0)


def apply_white_balance(rgb: np.ndarray, temperature: float, tint: float) -> np.ndarray:
    if abs(temperature) < 1e-6 and abs(tint) < 1e-6:
        return rgb
    temp_offset = temperature * 0.2
    tint_offset = tint * 0.12
    scale = np.array(
        [
            1.0 + temp_offset + tint_offset,
            1.0 - tint_offset * 2.0,
            1.0 - temp_offset + tint_offset,
        ],
        dtype=np.float64,
    )
    scale = np.maximum(scale, 0.05)
    luma = np.dot(rgb, [0.2126, 0.7152, 0.0722])[..., None]
    balanced = np.clip(rgb * scale, 0.0, None)
    balanced_luma = np.maximum(np.dot(balanced, [0.2126, 0.7152, 0.0722])[..., None], 1e-5)
    return np.clip(balanced * (luma / balanced_luma), 0.0, None)


def apply_saturation(rgb: np.ndarray, amount: float) -> np.ndarray:
    if abs(amount - 1.0) < 1e-6:
        return rgb
    luma = np.dot(rgb, [0.2126, 0.7152, 0.0722])[..., None]
    return luma + (rgb - luma) * amount


def bake_hdri(
    src: Path,
    dst: Path,
    *,
    exposure: float,
    temperature: float = 0.0,
    tint: float = 0.0,
    saturation: float = 1.0,
) -> None:
    hdr = cv2.imread(str(src), cv2.IMREAD_ANYDEPTH | cv2.IMREAD_ANYCOLOR)
    if hdr is None:
        raise SystemExit(f"Failed to read HDR: {src}")
    rgb = cv2.cvtColor(hdr, cv2.COLOR_BGR2RGB).astype(np.float64)
    rgb = apply_white_balance(rgb, temperature, tint)
    rgb = apply_saturation(rgb, saturation)
    ldr = aces_filmic(rgb * exposure)
    ldr_u8 = (ldr * 255.0 + 0.5).astype(np.uint8)
    resized = cv2.resize(ldr_u8, OUT_SIZE, interpolation=cv2.INTER_AREA)
    bgr = cv2.cvtColor(resized, cv2.COLOR_RGB2BGR)
    dst.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(
        str(dst),
        bgr,
        [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY],
    )
    size_kb = dst.stat().st_size / 1024
    print(f"  {dst.name}: {OUT_SIZE[0]}×{OUT_SIZE[1]}, {size_kb:.0f} KB")


PRESETS = [
    {
        "src": "assets/hdris/MR_EXT-011_BlueHour_Rangiroa.hdr",
        "dst": "assets/hdris/MR_EXT-011_BlueHour_Rangiroa_4k.jpg",
        "exposure": 4.5,
        "temperature": -0.22,
        "tint": 0.04,
        "saturation": 1.08,
    },
    {
        "src": "assets/hdris/MR_EXT-001_Sunny_Parking.hdr",
        "dst": "assets/hdris/MR_EXT-001_Sunny_Parking_4k.jpg",
        "exposure": 2.0,
        "temperature": 0.12,
        "tint": 0.0,
        "saturation": 1.05,
    },
]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--only",
        choices=[p["dst"] for p in PRESETS],
        nargs="*",
        help="Encode specific outputs only",
    )
    args = parser.parse_args()
    targets = {Path(p["dst"]).name for p in PRESETS} if args.only else None

    for preset in PRESETS:
        dst = ROOT / preset["dst"]
        if targets and dst.name not in targets:
            continue
        src = ROOT / preset["src"]
        if not src.exists():
            raise SystemExit(f"Missing source HDR: {src}")
        print(f"Encoding {src.name} …")
        bake_hdri(
            src,
            dst,
            exposure=preset["exposure"],
            temperature=preset.get("temperature", 0.0),
            tint=preset.get("tint", 0.0),
            saturation=preset.get("saturation", 1.0),
        )


if __name__ == "__main__":
    main()
