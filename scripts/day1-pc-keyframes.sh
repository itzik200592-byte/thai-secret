#!/usr/bin/env bash
# Day 1 queue: PC keyframes K1 (fixed composition), K3, K4. Stops on the grace limit.
source "$(dirname "$0")/common.sh"
K="$P/keyframes/pc"; cd "$K"
still "$K/K1" 16:9 "over-the-shoulder shot from behind her right shoulder: $MODEL stands facing the white marble counter, we see the back of her head and her dry frizzy dull hair on the left side of the frame, her right arm extends naturally forward from her body and her hand rests on the counter next to an unopened $SACHET lying flat on the marble, anatomically correct, only one arm visible, $SALON, $GRADE" "$REFS_SACHET" || exit 1
still "$K/K3" 16:9 "close-up of exactly two hands of $MODEL working thick glossy white cream through the mid-lengths and ends of her long dark hair, the strands are coated and clumping smoothly, hair held over the white marble counter, anatomically correct, $SALON, $GRADE" || exit 1
still "$K/K4" 16:9 "close-up at a white salon wash basin: $MODEL leans back with her long dark hair wet and smooth, clean warm water from a handheld sprayer runs over the hair and her hand glides through it easily, exactly two hands visible, anatomically correct, bright white salon, soft window daylight, $GRADE" || exit 1
echo "DAY 1 DONE - review K1/K3/K4 previews before generating clips"
