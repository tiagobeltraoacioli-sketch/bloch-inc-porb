"""Stage only the public AML landing assets, independently of the private portal."""
from pathlib import Path
import shutil
import tempfile

root = Path(__file__).resolve().parents[1]
stage = Path(tempfile.mkdtemp(prefix="bloch-aml-landing-"))
public = stage / "public"
public.mkdir()
for name in ("index.html", "_headers"):
    shutil.copy2(root / "site" / name, public / name)
shutil.copytree(root / "site" / "assets", public / "assets")
(public / "_redirects").write_text("/portal https://rednblue.space/portal/ 302\n/portal/* https://rednblue.space/portal/ 302\n/developers https://rednblue.space/developers/ 302\n/developers/* https://rednblue.space/developers/:splat 302\n")
(stage / "wrangler.toml").write_text('name = "aml-blochinc"\ncompatibility_date = "2026-09-24"\npages_build_output_dir = "public"\n')
print(stage)
