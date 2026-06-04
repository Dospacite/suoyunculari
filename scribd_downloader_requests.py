#!/usr/bin/env python3
"""
Download publicly accessible Scribd document render assets using HTTP only.

This variant does not use agent-browser, Chrome, Playwright, Selenium, or any
headless browser. It parses the server-rendered Scribd HTML for docManager page
definitions, downloads each public JSONP page fragment, rasterizes Scribd's
absolute-positioned image/text layers with Pillow, and combines the rendered
pages into a PDF.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import html
import io
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
from typing import Any


USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"
)

TEXT_LAYER_SCALE = 0.2


class ScribdError(RuntimeError):
    pass


@dataclass
class FontInfo:
    family: str = "Arial, Helvetica, sans-serif"
    weight: str = "normal"
    style: str = "normal"


@dataclass
class PageAsset:
    page_num: int
    content_url: str
    orig_width: int
    orig_height: int
    fonts: list[int] = field(default_factory=list)
    html_fragment: str | None = None
    text: str | None = None
    rendered_image: Path | None = None


@dataclass
class ImageLayer:
    url: str
    left: float
    top: float
    width: float | None
    height: float | None
    clip: tuple[float, float, float, float] | None


@dataclass
class TextRun:
    text: str
    left: float
    top: float
    font_size: float
    font_class: str | None
    color: tuple[int, int, int]


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        data = data.replace("\xa0", " ")
        if data.strip():
            self.parts.append(data.strip())

    def text(self) -> str:
        raw = " ".join(self.parts)
        raw = re.sub(r"[ \t\r\f\v]+", " ", raw)
        raw = re.sub(r"\s*\n\s*", "\n", raw)
        return raw.strip()


class LayerParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.images: list[ImageLayer] = []
        self.text_runs: list[TextRun] = []
        self._font_stack: list[tuple[float | None, str | None]] = [(None, None)]
        self._current_run: dict[str, Any] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = {key: value or "" for key, value in attrs}

        if self._current_run is not None:
            self._current_run["depth"] += 1

        if tag == "img":
            image = parse_image_layer(attr)
            if image:
                self.images.append(image)

        parent_font_size, parent_font_class = self._font_stack[-1]
        current_font_size = parent_font_size
        current_font_class = parent_font_class
        if tag == "div":
            style = parse_style(attr.get("style", ""))
            if "font-size" in style:
                current_font_size = parse_px(style["font-size"])
            classes = attr.get("class", "").split()
            ff_classes = [value for value in classes if re.fullmatch(r"ff\d+", value)]
            if ff_classes:
                current_font_class = ff_classes[-1]
        self._font_stack.append((current_font_size, current_font_class))

        classes = attr.get("class", "").split()
        if tag == "span" and "a" in classes and self._current_run is None:
            style = parse_style(attr.get("style", ""))
            left = parse_px(style.get("left", "0")) or 0
            top = parse_px(style.get("top", "0")) or 0
            color = parse_color(style.get("color", "#000"))
            self._current_run = {
                "depth": 1,
                "parts": [],
                "left": left * TEXT_LAYER_SCALE,
                "top": top * TEXT_LAYER_SCALE,
                "font_size": (current_font_size or 80) * TEXT_LAYER_SCALE,
                "font_class": current_font_class,
                "color": color,
            }

    def handle_endtag(self, tag: str) -> None:
        if self._current_run is not None:
            self._current_run["depth"] -= 1
            if self._current_run["depth"] <= 0:
                text = html.unescape("".join(self._current_run["parts"])).replace("\xa0", " ")
                if text.strip():
                    self.text_runs.append(
                        TextRun(
                            text=text,
                            left=self._current_run["left"],
                            top=self._current_run["top"],
                            font_size=self._current_run["font_size"],
                            font_class=self._current_run["font_class"],
                            color=self._current_run["color"],
                        )
                    )
                self._current_run = None

        if self._font_stack:
            self._font_stack.pop()
        if not self._font_stack:
            self._font_stack.append((None, None))

    def handle_data(self, data: str) -> None:
        if self._current_run is not None:
            self._current_run["parts"].append(data)


def request_bytes(url: str, referer: str | None = None, timeout: int = 60) -> bytes:
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "*/*",
        "Accept-Encoding": "gzip",
        "Accept-Language": "en-US,en;q=0.9",
    }
    if referer:
        headers["Referer"] = referer
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
            enc = (resp.headers.get("Content-Encoding") or "").lower()
    except urllib.error.HTTPError as exc:
        raise ScribdError(f"HTTP {exc.code} fetching {url}") from exc
    except urllib.error.URLError as exc:
        raise ScribdError(f"Network error fetching {url}: {exc.reason}") from exc

    if enc == "gzip" or data[:2] == b"\x1f\x8b":
        data = gzip.decompress(data)
    return data


def normalize_asset_url(url: str) -> str:
    url = html.unescape(url).strip().strip('"').strip("'")
    if url.startswith("http://html.scribd.com/"):
        url = url.replace("http://html.scribd.com/", "https://html.scribdassets.com/", 1)
    elif url.startswith("//"):
        url = "https:" + url
    return url


def parse_style(style: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for part in style.split(";"):
        if ":" not in part:
            continue
        key, value = part.split(":", 1)
        result[key.strip().lower()] = value.strip()
    return result


def parse_px(value: str | None) -> float | None:
    if value is None:
        return None
    match = re.search(r"-?\d+(?:\.\d+)?", value)
    return float(match.group(0)) if match else None


def parse_clip(value: str | None) -> tuple[float, float, float, float] | None:
    if not value:
        return None
    match = re.search(r"rect\(([^)]*)\)", value)
    if not match:
        return None
    nums = [parse_px(part) for part in re.split(r"[,\s]+", match.group(1).strip()) if part]
    if len(nums) != 4 or any(num is None for num in nums):
        return None
    top, right, bottom, left = (float(num) for num in nums if num is not None)
    return top, right, bottom, left


def parse_color(value: str | None) -> tuple[int, int, int]:
    if not value:
        return 0, 0, 0
    value = value.strip().lower()
    if value.startswith("#"):
        raw = value[1:]
        if len(raw) == 3:
            raw = "".join(ch * 2 for ch in raw)
        if len(raw) == 6:
            try:
                return int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16)
            except ValueError:
                return 0, 0, 0
    match = re.search(r"rgba?\(([^)]*)\)", value)
    if match:
        nums = [parse_px(part) for part in match.group(1).split(",")[:3]]
        if len(nums) == 3 and all(num is not None for num in nums):
            return tuple(max(0, min(255, int(num or 0))) for num in nums)  # type: ignore[return-value]
    return 0, 0, 0


def parse_image_layer(attrs: dict[str, str]) -> ImageLayer | None:
    raw_url = attrs.get("orig") or attrs.get("src")
    if not raw_url:
        return None
    url = normalize_asset_url(raw_url)
    parsed = urllib.parse.urlparse(url)
    if parsed.netloc not in {"html.scribdassets.com", "html.scribd.com"}:
        return None

    style = parse_style(attrs.get("style", ""))
    left = parse_px(style.get("left", "0")) or 0
    top = parse_px(style.get("top", "0")) or 0
    width = parse_px(style.get("width"))
    height = parse_px(style.get("height"))
    clip = parse_clip(style.get("clip"))
    return ImageLayer(url=url, left=left, top=top, width=width, height=height, clip=clip)


def decode_jsonp_page(data: bytes, page_num: int) -> str:
    text = data.decode("utf-8", errors="replace")
    match = re.search(r"window\.page%d_callback\((.*)\);\s*$" % page_num, text, re.S)
    if not match:
        match = re.search(r"window\.page\d+_callback\((.*)\);\s*$", text, re.S)
    if not match:
        raise ScribdError(f"Could not decode JSONP for page {page_num}.")

    payload = json.loads(match.group(1))
    if not isinstance(payload, list) or not payload:
        raise ScribdError(f"Unexpected JSONP payload for page {page_num}.")
    return str(payload[0])


def extract_page_text(fragment: str) -> str:
    parser = TextExtractor()
    parser.feed(fragment)
    return parser.text()


def extract_hypernova_state(page_html: str) -> dict[str, Any]:
    match = re.search(
        r'<script\b[^>]*type=["\']application/json["\'][^>]*data-hypernova-key=["\']doc_page["\'][^>]*>(.*?)</script>',
        page_html,
        re.S | re.I,
    )
    if not match:
        return {}

    body = match.group(1).strip()
    body = re.sub(r"^<!--", "", body).strip()
    body = re.sub(r"-->$", "", body).strip()
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def parse_doc_manager_pages(page_html: str) -> list[PageAsset]:
    pages: list[PageAsset] = []
    blocks = re.findall(r"docManager\.addPage\(\s*\{(.*?)\}\s*\);", page_html, re.S)
    for block in blocks:
        page_num = regex_int(block, r"pageNum:\s*(\d+)")
        orig_width = regex_int(block, r"origWidth:\s*(\d+)")
        orig_height = regex_int(block, r"origHeight:\s*(\d+)")
        content_url = regex_str(block, r'contentUrl:\s*"([^"]+)"')
        if not page_num or not orig_width or not orig_height or not content_url:
            continue
        fonts = [
            int(value)
            for value in re.findall(r"fonts:\s*\[([^\]]*)\]", block)
            for value in re.findall(r"\d+", value)
        ]
        pages.append(
            PageAsset(
                page_num=page_num,
                content_url=normalize_asset_url(content_url),
                orig_width=orig_width,
                orig_height=orig_height,
                fonts=fonts,
            )
        )

    pages.sort(key=lambda page: page.page_num)
    if not pages:
        raise ScribdError("No public page JSONP assets were found in the Scribd HTML.")
    return pages


def parse_fonts(page_html: str) -> dict[str, FontInfo]:
    fonts: dict[str, FontInfo] = {}
    pattern = re.compile(
        r'docManager\.addFont\(\s*\d+\s*,\s*"[^"]*"\s*,\s*"([^"]+)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\)',
        re.S,
    )
    for match in pattern.finditer(page_html):
        class_name, family, weight, style = match.groups()
        fonts[class_name] = FontInfo(family=family, weight=weight, style=style)
    return fonts


def regex_int(text: str, pattern: str) -> int | None:
    match = re.search(pattern, text, re.S)
    return int(match.group(1)) if match else None


def regex_str(text: str, pattern: str) -> str | None:
    match = re.search(pattern, text, re.S)
    return match.group(1) if match else None


def safe_slug(value: str, fallback: str = "scribd-document") -> str:
    value = html.unescape(value or "").strip()
    value = re.sub(r"[^\w .-]+", "", value, flags=re.UNICODE)
    value = re.sub(r"\s+", "-", value)
    value = value.strip(".-")
    return value[:120] or fallback


def source_image_path(out_dir: Path, url: str) -> Path:
    parsed = urllib.parse.urlparse(url)
    suffix = Path(parsed.path).suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
        suffix = ".img"
    digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:12]
    return out_dir / "images" / f"asset-{digest}{suffix}"


def load_source_image(url: str, out_dir: Path, referer: str, cache: dict[str, Any]) -> Any:
    from PIL import Image

    if url in cache:
        return cache[url].copy()

    path = source_image_path(out_dir, url)
    if not path.exists():
        print(f"Fetching image asset: {url}", file=sys.stderr)
        path.write_bytes(request_bytes(url, referer=referer))

    image = Image.open(path).convert("RGBA")
    cache[url] = image
    return image.copy()


def paste_clipped(canvas: Any, image: Any, layer: ImageLayer) -> None:
    if layer.width and layer.height:
        target_size = (max(1, round(layer.width)), max(1, round(layer.height)))
        if image.size != target_size:
            image = image.resize(target_size)

    if layer.clip:
        top, right, bottom, left = layer.clip
        crop_box = (
            round(left),
            round(top),
            round(right),
            round(bottom),
        )
        image = image.crop(crop_box)
        dest_x = round(layer.left + left)
        dest_y = round(layer.top + top)
    else:
        dest_x = round(layer.left)
        dest_y = round(layer.top)

    src_x = max(0, -dest_x)
    src_y = max(0, -dest_y)
    dest_x = max(0, dest_x)
    dest_y = max(0, dest_y)
    max_width = canvas.width - dest_x
    max_height = canvas.height - dest_y
    if max_width <= 0 or max_height <= 0:
        return

    image = image.crop((src_x, src_y, min(image.width, src_x + max_width), min(image.height, src_y + max_height)))
    if image.width <= 0 or image.height <= 0:
        return
    canvas.paste(image, (dest_x, dest_y), image)


def find_font_path(font_info: FontInfo | None) -> str | None:
    family = (font_info.family if font_info else "").lower()
    bold = font_info and font_info.weight.lower() == "bold"
    serif = any(name in family for name in ("times", "georgia", "serif"))
    italic = font_info and font_info.style.lower() == "italic"

    candidates: list[str]
    if serif and bold and italic:
        candidates = [
            "/usr/share/fonts/truetype/liberation/LiberationSerif-BoldItalic.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSerif-BoldItalic.ttf",
        ]
    elif serif and bold:
        candidates = [
            "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
        ]
    elif serif and italic:
        candidates = [
            "/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf",
        ]
    elif serif:
        candidates = [
            "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
        ]
    elif bold and italic:
        candidates = [
            "/usr/share/fonts/truetype/liberation/LiberationSans-BoldItalic.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf",
        ]
    elif bold:
        candidates = [
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        ]
    elif italic:
        candidates = [
            "/usr/share/fonts/truetype/liberation/LiberationSans-Italic.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf",
        ]
    else:
        candidates = [
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ]

    candidates.append("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf")
    candidates.append("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    for candidate in candidates:
        if Path(candidate).exists():
            return candidate
    return None


def load_font(font_info: FontInfo | None, size: float, cache: dict[tuple[str, int], Any]) -> Any:
    from PIL import ImageFont

    font_path = find_font_path(font_info) or "default"
    font_size = max(1, round(size))
    key = (font_path, font_size)
    if key in cache:
        return cache[key]

    if font_path == "default":
        font = ImageFont.load_default()
    else:
        font = ImageFont.truetype(font_path, font_size)
    cache[key] = font
    return font


def render_page(
    page: PageAsset,
    out_dir: Path,
    referer: str,
    fonts: dict[str, FontInfo],
    image_cache: dict[str, Any],
    font_cache: dict[tuple[str, int], Any],
    draw_text: bool,
) -> Path:
    from PIL import Image, ImageDraw

    if not page.html_fragment:
        raise ScribdError(f"Page {page.page_num} has no HTML fragment.")

    parser = LayerParser()
    parser.feed(page.html_fragment)

    canvas = Image.new("RGB", (page.orig_width, page.orig_height), "white")
    for layer in parser.images:
        source = load_source_image(layer.url, out_dir, referer, image_cache)
        paste_clipped(canvas, source, layer)

    if draw_text:
        draw = ImageDraw.Draw(canvas)
        for run in parser.text_runs:
            font_info = fonts.get(run.font_class or "")
            font = load_font(font_info, run.font_size, font_cache)
            draw.text((round(run.left), round(run.top)), run.text, fill=run.color, font=font)

    rendered_path = out_dir / "rendered" / f"page-{page.page_num:04d}.png"
    canvas.save(rendered_path)
    page.rendered_image = rendered_path
    return rendered_path


def pdf_string(value: str) -> bytes:
    data = value.replace("\x00", "").encode("cp1252", errors="replace")
    escaped = bytearray()
    for byte in data:
        if byte in {ord("("), ord(")"), ord("\\")}:
            escaped.append(ord("\\"))
            escaped.append(byte)
        elif byte in {10, 13, 9, 8, 12}:
            escaped.extend(f"\\{byte:03o}".encode("ascii"))
        elif byte < 32 or byte > 126:
            escaped.extend(f"\\{byte:03o}".encode("ascii"))
        else:
            escaped.append(byte)
    return b"(" + bytes(escaped) + b")"


def image_as_jpeg_bytes(path: Path) -> tuple[bytes, int, int]:
    from PIL import Image

    image = Image.open(path).convert("RGB")
    buf = io.BytesIO()
    image.save(buf, "JPEG", quality=92, optimize=True)
    width, height = image.size
    image.close()
    return buf.getvalue(), width, height


def text_runs_for_page(page: PageAsset) -> list[TextRun]:
    if not page.html_fragment:
        return []
    parser = LayerParser()
    parser.feed(page.html_fragment)
    return parser.text_runs


def write_pdf_from_rendered_pages(pages: list[PageAsset], pdf_path: Path) -> None:
    if not pages:
        raise ScribdError("No rendered page images were created.")

    objects: list[bytes] = []

    def add(obj: bytes) -> int:
        objects.append(obj)
        return len(objects)

    font_ref = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    page_refs: list[int] = []

    for page in pages:
        if not page.rendered_image:
            raise ScribdError(f"Page {page.page_num} has no rendered image.")

        image_data, width, height = image_as_jpeg_bytes(page.rendered_image)
        image_ref = add(
            (
                f"<< /Type /XObject /Subtype /Image /Width {width} /Height {height} "
                f"/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode "
                f"/Length {len(image_data)} >>\nstream\n"
            ).encode("ascii")
            + image_data
            + b"\nendstream"
        )

        content_parts = [
            f"q\n{width} 0 0 {height} 0 0 cm\n/Im1 Do\nQ\n".encode("ascii"),
            b"BT\n3 Tr\n",
        ]
        last_size: int | None = None
        for run in text_runs_for_page(page):
            text = run.text.strip()
            if not text:
                continue
            font_size = max(1, round(run.font_size))
            if font_size != last_size:
                content_parts.append(f"/F1 {font_size} Tf\n".encode("ascii"))
                last_size = font_size
            x = run.left
            y = height - run.top - font_size
            content_parts.append(f"1 0 0 1 {x:.3f} {y:.3f} Tm\n".encode("ascii"))
            content_parts.append(pdf_string(text) + b" Tj\n")
        content_parts.append(b"ET\n")
        content = b"".join(content_parts)
        content_ref = add(
            f"<< /Length {len(content)} >>\nstream\n".encode("ascii")
            + content
            + b"endstream"
        )

        page_refs.append(
            add(
                (
                    f"<< /Type /Page /Parent 0 0 R /MediaBox [0 0 {width} {height}] "
                    f"/Resources << /XObject << /Im1 {image_ref} 0 R >> "
                    f"/Font << /F1 {font_ref} 0 R >> >> "
                    f"/Contents {content_ref} 0 R >>"
                ).encode("ascii")
            )
        )

    pages_ref = add(
        (
            "<< /Type /Pages /Kids ["
            + " ".join(f"{ref} 0 R" for ref in page_refs)
            + f"] /Count {len(page_refs)} >>"
        ).encode("ascii")
    )
    catalog_ref = add(f"<< /Type /Catalog /Pages {pages_ref} 0 R >>".encode("ascii"))

    fixed_objects = [
        obj.replace(b"/Parent 0 0 R", f"/Parent {pages_ref} 0 R".encode("ascii"))
        for obj in objects
    ]

    offsets = [0]
    with pdf_path.open("wb") as f:
        f.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        for idx, obj in enumerate(fixed_objects, start=1):
            offsets.append(f.tell())
            f.write(f"{idx} 0 obj\n".encode("ascii"))
            f.write(obj)
            f.write(b"\nendobj\n")
        xref_pos = f.tell()
        f.write(f"xref\n0 {len(fixed_objects) + 1}\n".encode("ascii"))
        f.write(b"0000000000 65535 f \n")
        for off in offsets[1:]:
            f.write(f"{off:010d} 00000 n \n".encode("ascii"))
        f.write(
            (
                f"trailer\n<< /Size {len(fixed_objects) + 1} /Root {catalog_ref} 0 R >>\n"
                f"startxref\n{xref_pos}\n%%EOF\n"
            ).encode("ascii")
        )


def write_combined_html(title: str, pages: list[PageAsset], out_path: Path) -> None:
    body = []
    for page in pages:
        if page.html_fragment:
            body.append(f'<section class="page">{page.html_fragment}</section>')
    doc = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{html.escape(title)}</title>
</head>
<body>
{chr(10).join(body)}
</body>
</html>
"""
    out_path.write_text(doc, encoding="utf-8")


def inspect_document(url: str) -> tuple[dict[str, Any], list[PageAsset], dict[str, FontInfo], str]:
    page_html = request_bytes(url).decode("utf-8", errors="replace")
    state = extract_hypernova_state(page_html)
    pages = parse_doc_manager_pages(page_html)
    fonts = parse_fonts(page_html)
    return state, pages, fonts, page_html


def download_document(url: str, out_dir: Path | None, draw_text: bool) -> tuple[list[PageAsset], dict[str, Any], Path]:
    state, pages, fonts, _page_html = inspect_document(url)
    word_doc = state.get("wordDocument") or {}
    title = word_doc.get("title") or word_doc.get("extracted_title") or "Scribd document"
    output_dir = out_dir or Path(safe_slug(title))
    (output_dir / "pages").mkdir(parents=True, exist_ok=True)
    (output_dir / "images").mkdir(parents=True, exist_ok=True)
    (output_dir / "rendered").mkdir(parents=True, exist_ok=True)

    image_cache: dict[str, Any] = {}
    font_cache: dict[tuple[str, int], Any] = {}
    all_text: list[str] = []
    rendered_paths: list[Path] = []
    for page in pages:
        print(f"Fetching page {page.page_num}: {page.content_url}", file=sys.stderr)
        page_bytes = request_bytes(page.content_url, referer=url)
        fragment = decode_jsonp_page(page_bytes, page.page_num)
        page.html_fragment = fragment
        page.text = extract_page_text(fragment)
        (output_dir / "pages" / f"page-{page.page_num:04d}.html").write_text(fragment, encoding="utf-8")
        if page.text:
            all_text.append(f"\n\n--- Page {page.page_num} ---\n{page.text}")
        rendered_paths.append(render_page(page, output_dir, url, fonts, image_cache, font_cache, draw_text))

    metadata = {
        "source_url": url,
        "title": title,
        "id": word_doc.get("id"),
        "page_count": word_doc.get("page_count") or len(pages),
        "showFullDoc": word_doc.get("showFullDoc"),
        "show_archive_paywall": word_doc.get("show_archive_paywall"),
        "type": word_doc.get("type"),
        "formats": word_doc.get("formats"),
        "renderer": "requests+pillow",
    }
    (output_dir / "metadata.json").write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
    (output_dir / "text.txt").write_text("".join(all_text).strip() + "\n", encoding="utf-8")
    write_combined_html(title, pages, output_dir / "document.html")

    pdf_path = output_dir / f"{safe_slug(title)}.pdf"
    write_pdf_from_rendered_pages(pages, pdf_path)
    return pages, metadata, pdf_path


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download publicly exposed Scribd page render assets with HTTP requests only."
    )
    parser.add_argument("url", help="Scribd document URL")
    parser.add_argument("-o", "--output", type=Path, help="Output directory")
    parser.add_argument(
        "--no-text",
        action="store_true",
        help="Do not draw the Scribd text layer into the rendered page images.",
    )
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    try:
        pages, _metadata, pdf_path = download_document(args.url, args.output, draw_text=not args.no_text)
    except ScribdError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    out_dir = args.output or pdf_path.parent
    print(f"Saved {len(pages)} page render(s) to {out_dir}")
    print(f"Metadata: {out_dir / 'metadata.json'}")
    print(f"HTML: {out_dir / 'document.html'}")
    print(f"Text: {out_dir / 'text.txt'}")
    print(f"PDF: {pdf_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
