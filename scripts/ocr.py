#!/usr/bin/env python3
"""Offline OCR for scanned contract pages, using Tesseract.

Tesseract does not run in Vercel functions, so OCR is a local preprocessing step.
This script writes a text file with one form feed between pages. Upload that file
as a document of type "OCR text". Text from a real contract must go through
scripts/anonymise.ts before it is uploaded.

    python3 scripts/ocr.py raw/scan.pdf
    python3 scripts/ocr.py raw/scan.pdf --pages 1-3 --out raw/sample.ocr.txt

Needs tesseract with its fra and eng language data, and pdftoppm for PDF input.
On macOS: brew install tesseract tesseract-lang poppler
"""

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".tif", ".tiff"}


def fail(message: str) -> None:
    print(f"ocr.py: {message}", file=sys.stderr)
    sys.exit(2)


def check_tesseract(lang: str) -> None:
    if not shutil.which("tesseract"):
        fail("tesseract is not installed. On macOS: brew install tesseract")
    listing = subprocess.run(
        ["tesseract", "--list-langs"], capture_output=True, text=True, check=True
    ).stdout
    installed = set(listing.split())
    missing = [code for code in lang.split("+") if code not in installed]
    if missing:
        fail(
            f"Tesseract has no language data for: {', '.join(missing)}. "
            "On macOS: brew install tesseract-lang"
        )


def rasterise_pdf(pdf: Path, folder: Path, dpi: int, pages: str | None) -> list[Path]:
    if not shutil.which("pdftoppm"):
        fail("pdftoppm is not installed. On macOS: brew install poppler")
    command = ["pdftoppm", "-r", str(dpi), "-png"]
    if pages:
        first, _, last = pages.partition("-")
        command += ["-f", first, "-l", last or first]
    subprocess.run([*command, str(pdf), str(folder / "page")], check=True)
    return sorted(folder.glob("page*.png"))


def ocr_image(image: Path, lang: str, dpi: int) -> str:
    result = subprocess.run(
        ["tesseract", str(image), "stdout", "-l", lang, "--dpi", str(dpi)],
        capture_output=True,
        text=True,
        check=True,
    )
    # Tesseract ends each page with its own form feed.
    return result.stdout.rstrip("\f\n ")


def main() -> None:
    parser = argparse.ArgumentParser(description="Offline OCR with Tesseract.")
    parser.add_argument("input", type=Path, help="scanned PDF or page image")
    parser.add_argument("--out", type=Path, help="default: <input>.ocr.txt beside it")
    parser.add_argument("--lang", default="fra+eng", help="default: fra+eng")
    parser.add_argument("--dpi", type=int, default=300, help="default: 300")
    parser.add_argument("--pages", help="PDF pages to read, such as 1-3")
    args = parser.parse_args()

    if not args.input.is_file():
        fail(f"file not found: {args.input}")
    suffix = args.input.suffix.lower()
    if suffix != ".pdf" and suffix not in IMAGE_SUFFIXES:
        fail("input must be a PDF, PNG, JPEG or TIFF file")

    check_tesseract(args.lang)
    out = args.out or args.input.with_suffix(".ocr.txt")

    with tempfile.TemporaryDirectory() as folder:
        images = (
            rasterise_pdf(args.input, Path(folder), args.dpi, args.pages)
            if suffix == ".pdf"
            else [args.input]
        )
        if not images:
            fail("no pages to read")

        texts = []
        for number, image in enumerate(images, start=1):
            text = ocr_image(image, args.lang, args.dpi)
            texts.append(text)
            print(f"Page {number}: {len(text)} characters", file=sys.stderr)

    out.write_text("\f".join(texts) + "\n", encoding="utf-8")
    print(f"Wrote {out}. Read it and judge the quality.", file=sys.stderr)


if __name__ == "__main__":
    main()
