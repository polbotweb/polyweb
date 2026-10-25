#!/usr/bin/env node
/** create-polyweb — point d'entrée CLI. */
import { Effect } from 'effect';
import { HELP, parseArgs, resolveOptions } from './args.js';
import { nextSteps, scaffold } from './scaffold.js';

const parsed = parseArgs(process.argv.slice(2));
if (parsed.help) {
  process.stdout.write(HELP);
  process.exit(0);
}

const options = await resolveOptions(parsed, Boolean(process.stdin.isTTY));
const exit = await Effect.runPromiseExit(scaffold(options, (m) => console.log(m)));
if (exit._tag === 'Success') {
  console.log(nextSteps(exit.value.dest, exit.value.options));
} else {
  const reason = exit.cause.reasons.find((r) => r._tag === 'Fail') as { error?: { message?: string } } | undefined;
  console.error(`✖ ${reason?.error?.message ?? 'erreur inattendue'}`);
  process.exit(1);
}
