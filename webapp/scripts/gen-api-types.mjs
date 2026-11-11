#!/usr/bin/env node
// Generate webapp/src/types/generated/api.ts from contract/api.schema.json.
//
//   node scripts/gen-api-types.mjs           write the file   (npm run contract:gen)
//   node scripts/gen-api-types.mjs --check   compare only     (npm run contract:check)
//
// --check never writes. It exits 1 when the file on disk is missing or differs
// from a fresh generation, so it catches a stale file whether or not git
// tracks it yet (a plain `git diff` after regenerating would miss a new,
// untracked file). In CI the file on disk is the committed one.
//
// The output is formatted with the project's Prettier and its config, so it is
// deterministic for a given lockfile and stable under `prettier --check`.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile } from 'json-schema-to-typescript'
import * as prettier from 'prettier'

const webappDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const schemaPath = resolve(webappDir, '../contract/api.schema.json')
const outPath = resolve(webappDir, 'src/types/generated/api.ts')

const BANNER = `/**
 * GENERATED FILE - DO NOT EDIT BY HAND.
 *
 * Source: contract/api.schema.json, which \`uv run journal contract export\`
 * writes from server/src/journal/api/contract/schemas.py.
 * To change a type: edit the TypedDict, re-export the schema, then run
 * \`npm run contract:gen\` in webapp/ and commit both files.
 * \`npm run contract:check\` (CI and the pre-push hook) fails when they differ.
 */`

const OPTIONS = {
  // Every object in the contract sets additionalProperties itself; this
  // default only matters if one ever doesn't, and then no index signature.
  additionalProperties: false,
  // Format below with the project's Prettier instead of the bundled style.
  format: false,
  cwd: dirname(schemaPath),
}

async function generate() {
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'))
  // unreachableDefinitions stays off (the default): turning it on adds a
  // "referenced by JournalApi" note to every type. Route bodies are reached
  // from the JournalApi root. Shared shapes that no route returns (the error
  // body) are listed in x-shared-definitions and compiled one by one below.
  const parts = [
    await compile(schema, schema.title ?? 'JournalApi', {
      ...OPTIONS,
      bannerComment: BANNER,
    }),
  ]
  for (const name of schema['x-shared-definitions'] ?? []) {
    const definition = { ...schema.$defs[name], $defs: schema.$defs }
    parts.push(
      await compile(definition, name, {
        ...OPTIONS,
        bannerComment: '',
        // Anything it references is already declared by the root pass.
        declareExternallyReferenced: false,
      }),
    )
  }
  const config = (await prettier.resolveConfig(outPath)) ?? {}
  return prettier.format(parts.join('\n'), { ...config, filepath: outPath })
}

function firstDifference(a, b) {
  const left = a.split('\n')
  const right = b.split('\n')
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if (left[i] !== right[i]) {
      return { line: i + 1, onDisk: left[i], expected: right[i] }
    }
  }
  return null
}

const check = process.argv.includes('--check')
const shown = relative(webappDir, outPath)
const expected = await generate()

if (check) {
  let onDisk = null
  try {
    onDisk = await readFile(outPath, 'utf8')
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
  if (onDisk === expected) {
    console.log(`contract:check: ${shown} matches contract/api.schema.json.`)
  } else {
    console.error(
      `contract:check: ${shown} is out of date with contract/api.schema.json.`,
    )
    if (onDisk === null) {
      console.error('  The file does not exist.')
    } else {
      const diff = firstDifference(onDisk, expected)
      console.error(`  First difference at line ${diff.line}:`)
      console.error(
        `    on disk:  ${JSON.stringify(diff.onDisk ?? '<end of file>')}`,
      )
      console.error(
        `    expected: ${JSON.stringify(diff.expected ?? '<end of file>')}`,
      )
    }
    console.error(
      '  Run `npm run contract:gen` in webapp/ and commit the result.',
    )
    process.exit(1)
  }
} else {
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, expected)
  console.log(`contract:gen: wrote ${shown}.`)
}
