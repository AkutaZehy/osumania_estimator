// Port of Etterna 0.72.3 UlbuAcolytes.h basescalers
// Since the normalizer system is gone, each skillset's base difficulty is
// lowered here and then pattern types are detected to push down OR up.

import { NUM_SKILLSET, Skillset } from "./enums.js";

export const basescalers: readonly number[] = [
  0.0, // Overall, unused
  0.91, // Stream
  0.75, // Jumpstream
  0.77, // Handstream
  0.93, // Stamina
  1.01, // JackSpeed
  1.02, // Chordjack
  1.06, // Technical
] as const;

void NUM_SKILLSET;
void Skillset;
