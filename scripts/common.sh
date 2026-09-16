# shared prompt building blocks - source this
P="/c/Users/itzik/Desktop/CLAUDE/green-bio/media"
GRADE="shot on a real cinema camera, 50mm lens, soft natural window daylight, bright clean editorial grade, true-to-life skin and hair texture with flyaway strands, no retouching, no CGI look, subtle fine film grain, photorealistic"
MODEL="the same woman as in the reference photos: late 20s, olive skin, long dark brown hair past the shoulders, white ribbed tank top, thin gold hoop earring"
SALON="the same bright modern hair salon as in the reference photos: white walls, large arched window on the left, white marble counter, blurred potted olive tree"
SACHET="the EXACT sachet from the reference photos (royal blue and silver foil, 'Green bio Super Treatment Cream', 'Use After Chemical Treat', yellow label, 30 ml)"
REFS_MODEL="--image-references $P/stills/still1_wide.png --image-references $P/stills/still3_macro.png"
REFS_SACHET="--image-references $P/ref/ref1.jpg --image-references $P/ref/ref3.jpg"

# still <out-no-ext> <aspect> <prompt> [extra refs]. Returns 1 and prints BLOCKED on the grace limit.
still() {
  local out="$1" ar="$2" prompt="$3" extra="$4"
  higgsfield generate create nano_banana_pro --aspect_ratio "$ar" --resolution 2k $REFS_MODEL $extra --prompt "$prompt" --wait --json > "$out.json" 2>&1
  if grep -q grace_daily_limit "$out.json"; then echo "BLOCKED at $out"; return 1; fi
  local url; url=$(grep -oE 'https://[^" ]+\.png' "$out.json" | grep -v _min | head -1)
  [ -z "$url" ] && { echo "FAILED $out"; head -c 300 "$out.json"; return 1; }
  curl -sL "$url" -o "$out.png" && ffmpeg -y -loglevel error -i "$out.png" -vf "scale=960:-1" "${out}_p.jpg" && echo "OK $out"
}
# clip <out-no-ext> <aspect> <seconds> <start.png> <end.png|-> <prompt>
clip() {
  local out="$1" ar="$2" sec="$3" start="$4" end="$5" prompt="$6" endflag=""
  [ "$end" != "-" ] && endflag="--end-image $end"
  higgsfield generate create kling3_0 --mode pro --sound off --aspect_ratio "$ar" --duration "$sec" --start-image "$start" $endflag --prompt "$prompt" --wait --wait-timeout 25m --json > "$out.json" 2>&1
  if grep -q grace_daily_limit "$out.json"; then echo "BLOCKED at $out"; return 1; fi
  local url; url=$(grep -oE 'https://[^" ]+\.mp4' "$out.json" | head -1)
  [ -z "$url" ] && { echo "FAILED $out"; head -c 300 "$out.json"; return 1; }
  curl -sL "$url" -o "$out.mp4" && ffmpeg -y -sseof -1 -loglevel error -i "$out.mp4" -update 1 -q:v 1 "${out}_last.png" && echo "OK $out"
}
