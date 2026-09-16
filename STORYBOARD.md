# Green Bio Super Treatment - Storyboard (5 scenes)

Art direction: **Salon Editorial, real-camera look** (not "AI glossy").
Site tokens: bg #faf9f6 / bg-2 #f1efe9 / ink #171512 / accent-1 #1f3fa8 (royal blue, from the sachet) / accent-2 #c9a24d (gold) / line rgba(23,21,18,0.12)
Fonts: Frank Ruhl Libre (display) + Heebo (body). Hebrew RTL.

## FIXED GRADE CLAUSE (byte-identical in every prompt)
`shot on a real cinema camera, 50mm lens, soft natural window daylight, bright clean editorial grade, true-to-life skin and hair texture with flyaway strands, no retouching, no CGI look, subtle fine film grain, photorealistic`

## Continuity anchors (repeat in every prompt)
- Model: woman, late 20s, olive skin, long dark brown hair past the shoulders, white ribbed tank top, thin gold hoop earring.
- Setting: bright modern hair salon, white walls, large window on the left, a white marble counter, one potted olive tree blurred in the background.
- Product: small royal-blue and silver foil sachet with a white wave shape and the words "bio Super Treatment Cream" printed on it.

## Scenes (one continuous camera journey)

| # | Name | Dur (s) | Camera + action |
|---|------|---------|-----------------|
| 1 | Before | 8 | text-to-video. Medium-wide from behind: her hair is dry, frizzy and dull after a chemical treatment, she runs her fingers through it and they snag. Camera slowly pushes in toward the back of her head, ending close on the frizzy ends. |
| 2 | The sachet | 5 | continue push-in, tilt down to the marble counter: her hands tear open the blue sachet and squeeze a thick, glossy white cream into her palm. Macro on the cream. |
| 3 | Applying | 6 | continue: hands work the white cream through the mid-lengths and ends, strands get coated and start to clump smoothly, the cream melts in. Camera drifts along the hair length. |
| 4 | Rinse | 6 | continue: at the salon basin, warm water runs over the hair, the cream washes out, her hand glides through without snagging. Camera slowly rises with the water. |
| 5 | Result | 6 | continue: she lifts her head and turns toward camera, hair now smooth, glossy and heavy, light slides along it like silk, she smiles slightly. Camera settles wide with clean white wall space on the right third (CTA space). Hold. |

Total ~31 s. DUR array for JS: [8, 5, 6, 6, 6]

## Chain order
PC 16:9: s1 -> s1_last.png -> s2 -> s2_last.png -> s3 -> ... -> s5
Mobile 9:16: same, recomposed vertical (tighter framing, subject centered, CTA space at the bottom).

## Kling flags
`kling3_0 --mode pro --sound off --aspect_ratio 16:9|9:16 --duration N --start-image <prev_last.png>`

## Keyframe rules (learned 2026-09-16, after two rejected stills)
- Never combine "from behind" with a hand reaching toward the camera side. If she faces away, her hands are not visible or the shot is over-the-shoulder with the arm extending AWAY from camera.
- Always write "exactly two hands" / "only one arm visible" and check the count before showing Itzik.
- The sachet must come from `media/ref/ref1.jpg` + `ref3.jpg` as image references in every frame where it appears.

### K1 (end of scene 1 / start of scene 2) - corrected composition
Over-the-shoulder from behind her right shoulder. She faces the marble counter. Back of her head + frizzy hair on the left of frame. Her right arm extends forward from her body, hand resting on the counter next to the unopened sachet. Clip 2 then orbits the camera around to her front for the tear-and-squeeze (K2).
