// Compile-time contract assertions: no manually maintained duplicate DTOs.
import type { components, paths } from "./schema";
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
type WaterAmount = Assert<Equal<components["schemas"]["WaterOut"]["amount_ml"], string>>;
type NullableDistance = Assert<Equal<components["schemas"]["ActivityOut"]["distance_m"], string | null>>;
type ValidationError = Assert<Equal<
  paths["/api/v1/activity/daily"]["put"]["responses"][422]["content"]["application/json"],
  components["schemas"]["ErrorEnvelope"]
>>;

type ConfirmMeasurement = Assert<Equal<
  components["schemas"]["WeightGoalConfirmation"]["expected_weight_kg"],
  number | string
>>;

type RetryKey = Assert<Equal<
  NonNullable<paths["/api/v1/meals"]["post"]["parameters"]["header"]>["Idempotency-Key"],
  string | null | undefined
>>;

type MacroUnknown = Assert<Equal<
  components["schemas"]["MacroAdherence"]["consumed_g"],
  string | null
>>;
