// Solmar Bay — entrypoint: copies game/ and screenshots/ to the output dir
// and writes dossier.json with buildDossier from vendor/makefun-game.ts.
// SPDX-License-Identifier: MIT
// Runs on Node 22, standard library only, no network, deterministic.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The repository root is where this file lives — never process.cwd().
const repoRoot = dirname(fileURLToPath(import.meta.url));

const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
const gameSrc = join(repoRoot, 'game');
const shotsSrc = join(repoRoot, 'screenshots');

if (!existsSync(gameSrc)) throw new Error('game/ not found in ' + repoRoot);
if (!existsSync(shotsSrc)) throw new Error('screenshots/ not found in ' + repoRoot);

// Fresh output: remove any previous run's files so two runs are byte-identical.
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// Copy in a fixed order so the run is deterministic.
cpSync(gameSrc, join(outDir, 'game'), { recursive: true });
cpSync(shotsSrc, join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
