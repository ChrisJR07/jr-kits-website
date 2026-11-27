"""Build the static shop and its editable, offline-capable download."""
import json
import re
import shutil
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "storefront" if (ROOT / "storefront").is_dir() else ROOT
DEST = ROOT / "dist"
FILES = ("index.html", "store.js", "store.css", "wardrobe.js", "wardrobe.css", "catalog.json", "kit-mark.svg")


def prepare_offline(folder):
    catalog = json.loads((folder / "catalog.json").read_text(encoding="utf-8"))
    store = (folder / "store.js").read_text(encoding="utf-8")
    wardrobe = (folder / "wardrobe.js").read_text(encoding="utf-8")
    plain_store, n = re.subn(r"^import \{ setupWardrobe \} from './wardrobe.js';", "", store, count=1)
    loader = re.compile(r"  const response = await fetch\('./catalog.json'\);\n  if \(!response.ok\).*?\n  const catalogue = await response.json\(\);")
    inline = "  const catalogue = " + json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + ";"
    plain_store, m = loader.subn(lambda _: inline, plain_store, count=1)
    if (n, m) != (1, 1) or "export function setupWardrobe(" not in wardrobe:
        raise ValueError("The offline entry needs updating to match the source modules.")
    plain_store = plain_store.replace("'./?collection=", "'./index.html?collection=")
    script = '(() => {\n"use strict";\n' + wardrobe.replace("export function setupWardrobe(", "function setupWardrobe(") + "\n" + plain_store + "\n})();\n"
    (folder / "offline.js").write_text(script, encoding="utf-8")
    page = (folder / "index.html").read_text(encoding="utf-8")
    module = '<script type="module" src="./store.js"></script>'
    portable = '<script src="./launch.js" defer></script>'
    if module not in page and portable not in page:
        raise ValueError("The entry script is missing from index.html.")
    page = page.replace(module, portable).replace('href="./"', 'href="./index.html"').replace('href="./?', 'href="./index.html?').replace('href="./#', 'href="./index.html#')
    (folder / "index.html").write_text(page, encoding="utf-8")
    (folder / "launch.js").write_text("""const entry = document.createElement('script');
if (location.protocol === 'file:') {
  entry.src = './offline.js';
} else {
  entry.type = 'module';
  entry.src = './store.js';
}
document.head.appendChild(entry);
""", encoding="utf-8")


def build():
    with TemporaryDirectory(dir=ROOT) as temporary:
        stage = Path(temporary) / "JR-Kits"
        stage.mkdir()
        for name in FILES:
            shutil.copy2(SOURCE / name, stage / name)
        shutil.copytree(SOURCE / "assets", stage / "assets")
        prepare_offline(stage)
        if SOURCE == ROOT:
            for name in ("offline.js", "launch.js"):
                shutil.copy2(stage / name, ROOT / name)
        (stage / "scripts").mkdir()
        shutil.copy2(__file__, stage / "scripts/build-store.py")
        shutil.copy2(ROOT / "README.md", stage / "README.md")
        output = Path(temporary) / "site"
        shutil.copytree(stage, output, ignore=shutil.ignore_patterns("scripts", "README.md"))
        (output / "downloads").mkdir()
        with ZipFile(output / "downloads/JR-Kits-Storefront.zip", "w") as archive:
            for f in sorted(stage.rglob("*")):
                if f.is_file():
                    compression = ZIP_STORED if f.suffix.lower() in {".jpg", ".jpeg", ".webp", ".png", ".woff2"} else ZIP_DEFLATED
                    archive.write(f, Path("JR-Kits") / f.relative_to(stage), compress_type=compression)
        if DEST.exists():
            shutil.rmtree(DEST)
        shutil.move(str(output), DEST)


if __name__ == "__main__":
    build()
