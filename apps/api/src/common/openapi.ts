import type { ApiOkResponse } from '@nestjs/swagger';
import { z } from 'zod';

/** The schema type @ApiOkResponse accepts (not exported from the package root, so derived). */
type SchemaObject = Extract<NonNullable<Parameters<typeof ApiOkResponse>[0]>, { schema: unknown }>['schema'];

/**
 * A Zod schema as an OpenAPI 3.0 schema, for @ApiOkResponse({ schema }).
 * Request schemas (@Query/@Param with { schema }) are picked up by Swagger automatically;
 * response schemas need this, since a handler's return type is invisible at runtime.
 */
export function openApi(schema: z.ZodType): SchemaObject {
  return z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'output' }) as SchemaObject;
}

/**
 * Prices are BigInt copper (1 gold = 10,000 copper) and travel as strings:
 * JSON.stringify can't serialize BigInt, and a JS number loses precision above 2^53.
 */
export const copperSchema = z
  .string()
  .regex(/^\d+$/)
  .describe('Price in copper (1 gold = 10,000 copper), as a string');

export const isoDateSchema = z.iso.datetime().describe('ISO 8601 timestamp (UTC)');
