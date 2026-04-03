#!/usr/bin/env tsx
/**
 * Generate TypeScript types from JSON Schema event contracts.
 * Run: pnpm generate-events
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';

const SCHEMA_DIR = join(process.cwd(), 'event-schema');
const OUTPUT_FILE = join(process.cwd(), 'packages', 'types', 'src', 'generated', 'events.ts');

interface JsonSchema {
  $id?: string;
  title?: string;
  description?: string;
  properties?: Record<string, { type?: string; const?: string; description?: string }>;
  required?: string[];
}

function schemaNameToTypeName(filename: string): string {
  return basename(filename, '.json')
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function generateEventType(schema: JsonSchema, typeName: string): string {
  const dataSchema = (schema.properties?.['data'] as JsonSchema) ?? {};
  const required = dataSchema.required ?? [];
  const properties = (dataSchema as { properties?: Record<string, unknown> }).properties ?? {};

  const fields = Object.entries(properties)
    .map(([key, val]) => {
      const isRequired = required.includes(key);
      const opt = isRequired ? '' : '?';
      const valObj = val as Record<string, unknown>;
      let type = 'unknown';
      if (valObj['type'] === 'string') type = 'string';
      else if (valObj['type'] === 'number') type = 'number';
      else if (valObj['type'] === 'boolean') type = 'boolean';
      else if (valObj['type'] === 'array') type = 'string[]';
      else if (valObj['type'] === 'object') type = 'Record<string, unknown>';
      const desc = valObj['description'] ? ` // ${valObj['description']}` : '';
      return `  ${key}${opt}: ${type};${desc}`;
    })
    .join('\n');

  const eventType = (schema.properties?.['eventType'] as { const?: string })?.const ?? 'unknown';

  return `/** ${schema.description ?? typeName} */
export interface ${typeName}Data {
${fields}
}

export type ${typeName}Event = EventEnvelope<${typeName}Data>;

export const ${typeName.toUpperCase()}_EVENT_TYPE = '${eventType}' as const;
`;
}

async function main() {
  const files = readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.json'));
  const types: string[] = [
    `// AUTO-GENERATED — DO NOT EDIT MANUALLY`,
    `// Run: pnpm generate-events`,
    `// Generated at: ${new Date().toISOString()}`,
    ``,
    `import { EventEnvelope } from '../index.js';`,
    ``,
  ];

  for (const file of files) {
    const schemaPath = join(SCHEMA_DIR, file);
    const schema = JSON.parse(readFileSync(schemaPath, 'utf-8')) as JsonSchema;
    const typeName = schemaNameToTypeName(file);
    types.push(generateEventType(schema, typeName));
    console.log(`✅ Generated type for ${file} → ${typeName}Event`);
  }

  // Ensure output directory exists
  const { mkdirSync } = await import('fs');
  mkdirSync(join(process.cwd(), 'packages', 'types', 'src', 'generated'), { recursive: true });

  writeFileSync(OUTPUT_FILE, types.join('\n'));
  console.log(`\n📦 Written to ${OUTPUT_FILE}`);
}

main().catch(console.error);
