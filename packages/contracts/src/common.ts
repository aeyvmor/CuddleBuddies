import { z } from "zod";

/** Server- or client-generated RFC 9562 UUID. */
export const Uuid = z.uuid();

/** UTC instant in ISO 8601 with a trailing `Z`. Offsets are rejected to avoid ambiguous local times. */
export const UtcInstant = z.iso.datetime({ offset: false });

/**
 * WGS84 decimal-degree coordinates (SRID 4326). Order is explicit by name; the database stores
 * `ST_MakePoint(longitude, latitude)`. Non-finite numbers are rejected by Zod.
 */
export const Coordinates = z.strictObject({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export type Coordinates = z.infer<typeof Coordinates>;

/** Non-negative distance in metres; `null` means unknown (never "exact"). */
export const NullableMetres = z.number().min(0).max(100_000).nullable();

/** Short, human-entered free text with an explicit bound. */
export const boundedText = (max: number) => z.string().trim().min(1).max(max);
