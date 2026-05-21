// tools/compound/index.ts — compound tool registry entry point.
//
// Side-effect imports register each compound tool with the central registry.
// Keep this file thin: one line per compound tool, alphabetical.

import './assess_listening_fluency/index.js';
import './generate_fluency_coaching_audio/index.js';
import './generate_listening_clip/index.js';
