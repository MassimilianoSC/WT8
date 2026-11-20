#!/bin/sh
# Rigenera le versioni HTML (autonome, immagini incorporate) di guida e checklist. Uso: sh docs/guida/genera-html.sh
cd "$(dirname "$0")" || exit 1
pandoc GUIDA_UTENTE.md -f gfm -t html5 -s --embed-resources --css stile.css --toc --toc-depth=2 \
  --metadata pagetitle="WT8 — Guida per chi la usa" --metadata lang=it -o GUIDA_UTENTE.html
pandoc CHECKLIST_COLLAUDO.md -f gfm -t html5 -s --embed-resources --css stile.css --toc --toc-depth=2 \
  --metadata pagetitle="WT8 — Prove di collaudo" --metadata lang=it -o CHECKLIST_COLLAUDO.html
