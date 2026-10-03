import { z } from "zod";

/** OPERATOR captures inspection data; OFFICER reviews issues and manages work orders. */
export const Role = z.enum(["OPERATOR", "OFFICER"]);
export type Role = z.infer<typeof Role>;
