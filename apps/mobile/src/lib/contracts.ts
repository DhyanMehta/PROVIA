import type { components } from "../../../../packages/api-contracts/schema";
export type Schema<K extends keyof components["schemas"]> =
  components["schemas"][K];

export type {
  components,
  paths,
} from "../../../../packages/api-contracts/schema";
