#!/usr/bin/env bash
# One-shot, resumable film pipeline (keyframe-first, per the makesurevideos skill).
#   bash scripts/make-film.sh pc       # 16:9 chain  -> site/media/film.mp4   + poster.jpg
#   bash scripts/make-film.sh mobile   # 9:16 chain  -> site/media/film_m.mp4 + poster_m.jpg
# Every generated file is skipped if it already exists, so re-running after the Higgsfield
# grace-limit block just continues where it stopped. Review the K*_p.jpg previews before the
# clips phase spends credits (set CLIPS=1 to allow clip generation).
set -u
source "$(dirname "$0")/common.sh"
ORI="${1:-pc}"; CLIPS="${CLIPS:-0}"
case "$ORI" in
  pc)     AR=16:9; W=1280; H=720;  FILM="film.mp4";   POSTER="poster.jpg" ;;
  mobile) AR=9:16; W=720;  H=1280; FILM="film_m.mp4"; POSTER="poster_m.jpg" ;;
  *) echo "usage: make-film.sh pc|mobile"; exit 2 ;;
esac
K="$P/keyframes/$ORI"; C="$P/clips/$ORI"; mkdir -p "$K" "$C"
SITE="/c/Users/itzik/Desktop/CLAUDE/green-bio/site/media"

# ---- the film: 3 clips, generated at 5 s and played at 1.25x = ~12 s total. Short and to the point. ----
# before -> the sachet + cream (real product) -> result. Same fixed GRADE clause in every prompt.
# Vertical recomposition for mobile: subject centered, hands/product in the middle third,
# clean space in the bottom third for the caption card.
if [ "$ORI" = mobile ]; then FRAMING="vertical 9:16 composition, subject centered, clean uncluttered space in the bottom third of the frame"; else FRAMING="16:9 composition, clean uncluttered space on the right third of the frame"; fi

# Keyframes K0..K3 (K_i = end of clip i = start of clip i+1)
declare -A KF
KF[0]="medium-wide shot from behind: $MODEL stands in $SALON, we see the back of her head, her long dark hair is dry, frizzy and dull after a chemical treatment, her arms relaxed at her sides, no hands visible, $FRAMING, $GRADE"
KF[1]="close-up over the white marble counter: exactly two hands of $MODEL hold an unopened $SACHET, about to tear the corner, $SALON blurred behind, anatomically correct, $FRAMING, $GRADE"
KF[2]="macro close-up: the slender feminine hands of $MODEL (smooth skin, no body hair, short natural nails) - one hand squeezes the torn open $SACHET, a thick glossy white cream comes out onto the open palm of the other hand, exactly two hands, anatomically correct, white marble counter, $FRAMING, $GRADE"
KF[3]="medium shot: $MODEL faces the camera with a slight smile in $SALON, her long dark hair now smooth, glossy and heavy, soft window light sliding along it like silk, $FRAMING, $GRADE"

# Motion prompts (one camera verb per clip)
declare -A MV
MV[1]="slow steady push-in toward the back of her head, she runs her fingers through the dry frizzy ends and they snag, then she turns toward the marble counter and picks up the sachet"
MV[2]="slow tilt down to the counter, her hands tear the corner of the sachet and squeeze a thick glossy white cream onto her palm, camera settles on the cream"
MV[3]="she lifts her head and turns toward camera, hair now smooth glossy and heavy, light slides along it, camera settles and holds still"

echo "== [$ORI] phase 1: keyframes"
for i in 0 1 2 3; do
  if [ -f "$K/K$i.png" ]; then echo "have K$i"; continue; fi
  extra="$REFS_MODEL"; [[ "$i" =~ ^[12]$ ]] && extra="$REFS_MODEL $REFS_SACHET"
  still "$K/K$i" "$AR" "${KF[$i]}" "$extra" || { echo "STOPPED at K$i (grace limit or failure). Re-run later."; exit 1; }
done
echo "keyframes ready: review $K/K*_p.jpg. Then: CLIPS=1 bash scripts/make-film.sh $ORI"
[ "$CLIPS" = 1 ] || exit 0

echo "== [$ORI] phase 2: clips (frame-chained: start = previous clip's real last frame, end = authored keyframe)"
for i in 1 2 3; do
  if [ -f "$C/c$i.mp4" ]; then echo "have c$i"; continue; fi
  if [ "$i" = 1 ]; then start="$K/K0.png"; else start="$C/c$((i-1))_last.png"; fi
  clip "$C/c$i" "$AR" 5 "$start" "$K/K$i.png" "${MV[$i]}, $GRADE" || { echo "STOPPED at c$i. Re-run later."; exit 1; }
  grep -q '"role": "start_image"' "$C/c$i.json" || echo "WARNING: c$i did not report start_image - check the seam"
done

echo "== [$ORI] phase 3: assemble $FILM (1.25x, dense keyframes for scrubbing)"
ffmpeg -y -loglevel error -i "$C/c1.mp4" -i "$C/c2.mp4" -i "$C/c3.mp4" -filter_complex "[0:v]setpts=PTS/1.25,fps=24,scale=$W:$H,setsar=1[v0];[1:v]setpts=PTS/1.25,fps=24,scale=$W:$H,setsar=1[v1];[2:v]setpts=PTS/1.25,fps=24,scale=$W:$H,setsar=1[v2];[v0][v1][v2]concat=n=3:v=1:a=0[v]" \
  -map "[v]" -c:v libx264 -crf 23 -preset fast -g 4 -keyint_min 4 -sc_threshold 0 -pix_fmt yuv420p -movflags +faststart -an "$SITE/$FILM" \
  && ffmpeg -y -loglevel error -i "$SITE/$FILM" -frames:v 1 -q:v 3 "$SITE/$POSTER"
echo "DUR (seconds per clip after the 1.25x speed-up, paste into Home.jsx):"
for i in 1 2 3; do ffprobe -v error -show_entries format=duration -of csv=p=0 "$C/c$i.mp4" | awk '{printf "%.2f\n", $1/1.25}'; done
echo "DONE: $SITE/$FILM + $SITE/$POSTER. Next: push to GitHub, curl into Base44 public/media, restore the video engine in Home.jsx (checkpoint 'Mobile: full-bleed 9:16 film...' has it), test on a real iPhone."
