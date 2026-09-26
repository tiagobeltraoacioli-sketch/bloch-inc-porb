"""Retire the old public score preview with a central authenticated portal redirect."""
from pathlib import Path
import tempfile

root = Path(__file__).resolve().parents[1]
stage = Path(tempfile.mkdtemp(prefix="bloch-aml-landing-"))
public = stage / "public"
public.mkdir()
(public / "index.html").write_text('<!doctype html><html lang="en"><meta charset="utf-8"><title>BI-PoRB access</title><p><a href="https://rednblue.space/portal/?view=modules&amp;module=aml">Sign in to rednblue.space</a></p><p><a href="https://rednblue.space/explore/">Explore public data</a></p></html>\n')
(public / "_headers").write_text('/*\n  Cache-Control: no-store\n  X-Robots-Tag: noindex, nofollow\n  Referrer-Policy: no-referrer\n')
(public / "_redirects").write_text('/developers https://rednblue.space/developers/ 302\n/developers/* https://rednblue.space/developers/:splat 302\n/* https://rednblue.space/portal/?view=modules&module=aml 302\n')
(stage / "wrangler.toml").write_text('name = "aml-blochinc"\ncompatibility_date = "2026-09-24"\npages_build_output_dir = "public"\n')
print(stage)
