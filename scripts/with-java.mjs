#!/usr/bin/env node
// Runs a command with a Java runtime on PATH. The Firestore emulator
// needs Java 11+; if none is installed, a portable JRE placed in
// .tools/ (see docs/deployment.md) is used automatically.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tools = join(root, '.tools');
const env = { ...process.env };

const hasJava = spawnSync('java', ['-version'], { stdio: 'ignore', shell: true }).status === 0;
if (!hasJava && existsSync(tools)) {
  const jdk = readdirSync(tools).find((d) => /^jdk|^jre/i.test(d) && existsSync(join(tools, d, 'bin')));
  if (jdk) {
    env.JAVA_HOME = join(tools, jdk);
    env.PATH = `${join(tools, jdk, 'bin')}${delimiter}${env.PATH ?? env.Path ?? ''}`;
    env.Path = env.PATH;
    console.log(`[with-java] Using portable Java from .tools/${jdk}`);
  }
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('Usage: node scripts/with-java.mjs <command> [...args]');
  process.exit(1);
}
// With shell: true, arguments are joined into one command line, so re-quote any that contain spaces
// (e.g. the script passed to `firebase emulators:exec "…"`).
const quoted = args.map((a) => (/\s/.test(a) && !/^".*"$/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a));
const result = spawnSync(command, quoted, { stdio: 'inherit', env, shell: true });
process.exit(result.status ?? 1);
