import { router } from "expo-router";
import { useCallback, useRef, useState } from "react";
import type { PropsWithChildren } from "react";
import {
  Action,
  Busy,
  Card,
  Copy,
  ErrorNote,
  Field,
  Page,
  Title,
  Value,
} from "../components/ui";
import { useApi } from "../providers/api";
import { useResource } from "../hooks/use-resource";
import { ApiError, errorMessage } from "../lib/api-client";
import { metric } from "../lib/format";
import {
  dashboardData,
  exercisePage,
  foodSearchData,
  planPage,
  progressData,
  sessionPage,
  startedWorkout,
} from "../lib/fitness-contracts";

function Result({
  error,
  loading,
  reload,
  children,
}: PropsWithChildren<{
  error: unknown;
  loading: boolean;
  reload: () => void;
}>) {
  return (
    <>
      {loading && <Busy />}
      {!!error && (
        <>
          <ErrorNote message={errorMessage(error)} />
          <Copy>Any summaries still shown are previously fetched data.</Copy>
        </>
      )}
      {children}
      <Action
        secondary
        label={loading ? "Refreshing…" : "Refresh"}
        disabled={loading}
        onPress={reload}
      />
    </>
  );
}

export function Nutrition() {
  const api = useApi();
  const load = useCallback(
    (signal: AbortSignal) =>
      api.request("get", "/api/v1/dashboard/today", {
        signal,
        validate: dashboardData,
      }),
    [api],
  );
  const resource = useResource(load),
    data = resource.data;
  return (
    <Page>
      <Title eyebrow="Nutrition">Build your day, meal by meal.</Title>
      <Result {...resource}>
        {data && (
          <>
            <Card>
              <Value
                label="Calories · consumed / target"
                value={`${metric(data.nutrition.calories.consumed)} / ${metric(data.nutrition.calories.target, "kcal")}`}
              />
              {(["protein", "carbs", "fat"] as const).map((key) => (
                <Value
                  key={key}
                  label={key}
                  value={`${metric(data.nutrition[key].consumed_g)} / ${metric(data.nutrition[key].target_g, "g")}`}
                />
              ))}
            </Card>
            {(["breakfast", "lunch", "dinner", "snack"] as const).map(
              (kind) => {
                const meals = data.nutrition.meals.filter(
                  (meal) => meal.meal_type === kind,
                );
                return (
                  <Card key={kind}>
                    <Title>
                      {kind === "snack"
                        ? "Snacks"
                        : kind[0].toUpperCase() + kind.slice(1)}
                    </Title>
                    {meals.length ? (
                      meals.map((meal) => (
                        <Copy key={meal.id}>
                          {new Date(meal.consumed_at).toLocaleTimeString()} ·{" "}
                          {metric(meal.totals.calories_kcal, "kcal")}
                        </Copy>
                      ))
                    ) : (
                      <Copy>No meals recorded here yet.</Copy>
                    )}
                    <Action
                      secondary
                      label={`Find food for ${kind}`}
                      onPress={() => router.push("/food-search")}
                    />
                  </Card>
                );
              },
            )}
            <Copy>
              Food search is available. Meal-entry controls will follow;
              browsing does not create a meal log.
            </Copy>
          </>
        )}
      </Result>
    </Page>
  );
}

export function Workouts() {
  const api = useApi();
  const [started, setStarted] = useState<{
    id: string;
    started_at: string;
  } | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [historyOffset, setHistoryOffset] = useState(0);
  const startLock = useRef(false);
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [plans, exercises, history, today] = await Promise.all([
        api.request("get", "/api/v1/workout-plans", {
          signal,
          query: { limit: 5, offset: 0 },
          validate: planPage,
        }),
        api.request("get", "/api/v1/exercises", {
          signal,
          query: { limit: 10, offset: 0 },
          validate: exercisePage,
        }),
        api.request("get", "/api/v1/workout-sessions", {
          signal,
          query: { limit: 5, offset: historyOffset },
          validate: sessionPage,
        }),
        api.request("get", "/api/v1/dashboard/today", {
          signal,
          validate: dashboardData,
        }),
      ]);
      return { plans, exercises, history, today, historyOffset };
    },
    [api, historyOffset],
  );
  const resource = useResource(load),
    data = resource.data;
  function showHistory(offset: number) {
    if (offset === historyOffset) resource.reload();
    else setHistoryOffset(offset);
  }
  async function startWorkout() {
    if (startLock.current || started || uncertain) return;
    startLock.current = true;
    setStarting(true);
    setStartError("");
    try {
      const row = await api.request("post", "/api/v1/workout-sessions", {
        body: { started_at: new Date().toISOString() },
        validate: startedWorkout,
      });
      setStarted({ id: row.id, started_at: row.started_at });
      showHistory(0);
    } catch (error) {
      setStartError(errorMessage(error));
      setUncertain(error instanceof ApiError && error.uncertainWrite);
    } finally {
      startLock.current = false;
      setStarting(false);
    }
  }
  const weekday = data
    ? (new Date(data.today.date + "T12:00:00Z").getUTCDay() + 6) % 7
    : -1;
  const scheduled =
    data?.plans.items
      .filter((plan) => plan.is_active)
      .flatMap((plan) =>
        plan.days
          .filter((day) => day.day_of_week === weekday)
          .map((day) => ({ plan: plan.name, day })),
      ) ?? [];
  return (
    <Page>
      <Title eyebrow="Workouts">Move with a plan.</Title>
      <Result {...resource}>
        {data && (
          <>
            <Card>
              <Title>Today’s workout</Title>
              <Value
                label="Completed sessions"
                value={String(data.today.workouts.total_workouts)}
              />
              <Copy>
                {data.today.workouts.total_workouts
                  ? "Your completed sessions are included in progress."
                  : "No completed workout recorded today."}
              </Copy>
              {scheduled.map(({ plan, day }) => (
                <Copy key={day.id}>
                  {plan} · {day.name}
                  {day.is_rest ? " · Rest day" : ""}
                </Copy>
              ))}
              {!scheduled.length && (
                <Copy>
                  No scheduled day found in the recent plans shown below.
                </Copy>
              )}
              {!!startError && <ErrorNote message={startError} />}
              {started && (
                <Copy>
                  Workout started at{" "}
                  {new Date(started.started_at).toLocaleTimeString()}. It is
                  saved as in progress; no sets or completed workout are
                  claimed.
                </Copy>
              )}
              {uncertain && (
                <Copy>
                  The start result is unknown. Starting again is blocked here.
                  Refresh and review session history before any further action.
                </Copy>
              )}
              <Action
                label={
                  starting
                    ? "Starting workout…"
                    : started
                      ? "Workout started"
                      : "Start workout"
                }
                disabled={starting || !!started || uncertain}
                onPress={() => void startWorkout()}
              />
              <Copy>
                Start creates one unplanned session. Detailed sets, completion
                and cancellation controls remain outside this foundation screen.
                Recent history shows saved session status.
              </Copy>
            </Card>
            <Card>
              <Title>Recent workout plans</Title>
              {data.plans.items.length ? (
                data.plans.items.map((plan) => (
                  <Copy key={plan.id}>
                    {plan.name} · {plan.is_active ? "Active" : "Inactive"} ·{" "}
                    {plan.days.length} scheduled days
                  </Copy>
                ))
              ) : (
                <Copy>No workout plans yet.</Copy>
              )}
            </Card>
            <Card>
              <Title>Exercise catalog</Title>
              {data.exercises.items.length ? (
                data.exercises.items.map((exercise) => (
                  <Copy key={exercise.id}>
                    {exercise.name} · {exercise.muscle_group ?? "General"}
                  </Copy>
                ))
              ) : (
                <Copy>No exercises available yet.</Copy>
              )}
            </Card>
            <Card>
              <Title>Session history</Title>
              <Copy>
                {data.historyOffset === 0
                  ? "Most recent sessions"
                  : `Older sessions · offset ${data.historyOffset}`}
              </Copy>
              {data.history.items.length ? (
                data.history.items.map((row) => (
                  <Copy key={row.id}>
                    {new Date(row.started_at).toLocaleDateString()} ·{" "}
                    {row.status}
                  </Copy>
                ))
              ) : (
                <Copy>
                  {data.historyOffset === 0
                    ? "No workout sessions recorded yet."
                    : "No older sessions on this page."}
                </Copy>
              )}
              <Action
                secondary
                label="Newer sessions"
                disabled={resource.loading || data.historyOffset === 0}
                onPress={() => showHistory(Math.max(0, data.historyOffset - 5))}
              />
              <Action
                secondary
                label="Older sessions"
                disabled={resource.loading || data.history.items.length < 5}
                onPress={() => showHistory(data.historyOffset + 5)}
              />
            </Card>
          </>
        )}
      </Result>
    </Page>
  );
}

export function Tracking() {
  const api = useApi();
  const load = useCallback(
    (signal: AbortSignal) =>
      api.request("get", "/api/v1/dashboard/today", {
        signal,
        validate: dashboardData,
      }),
    [api],
  );
  const resource = useResource(load),
    data = resource.data;
  return (
    <Page>
      <Title eyebrow="Daily tracking">Small signals, clearer progress.</Title>
      <Result {...resource}>
        {data && (
          <>
            <Card>
              <Value
                label="Latest recorded weight"
                value={metric(data.weight?.weight_kg, "kg")}
              />
              <Copy>
                {data.weight
                  ? new Date(data.weight.recorded_at).toLocaleString()
                  : "No weight measurement recorded."}
              </Copy>
            </Card>
            <Card>
              <Value
                label="Water logged"
                value={
                  data.water.has_logs
                    ? metric(data.water.consumed_ml, "ml")
                    : "No water logged"
                }
              />
              <Value
                label="Daily water target"
                value={metric(data.water.target_ml, "ml")}
              />
            </Card>
            <Card>
              <Value
                label="Steps"
                value={metric(data.activity?.steps, "steps")}
              />
              <Value
                label="Active minutes"
                value={metric(data.activity?.active_minutes, "min")}
              />
            </Card>
            <Card>
              <Value
                label="Sleep duration"
                value={
                  data.sleep.duration_seconds === null
                    ? "Not recorded"
                    : metric(data.sleep.duration_seconds / 3600, "hours")
                }
              />
              <Copy>
                Sleep is assigned to its wake-up date. Unknown values are
                distinct from zero.
              </Copy>
            </Card>
            <Copy>
              These summaries come from your saved records. Device
              synchronization and editing controls are not part of this
              foundation screen.
            </Copy>
          </>
        )}
      </Result>
    </Page>
  );
}

export function Progress() {
  const api = useApi();
  const load = useCallback(
    async (signal: AbortSignal) => {
      const today = await api.request("get", "/api/v1/dashboard/today", {
        signal,
        validate: dashboardData,
      });
      const start = new Date(today.date + "T12:00:00Z");
      start.setUTCDate(start.getUTCDate() - 6);
      return api.request("get", "/api/v1/progress/overview", {
        signal,
        validate: progressData,
        query: {
          start_date: start.toISOString().slice(0, 10),
          end_date: today.date,
        },
      });
    },
    [api],
  );
  const resource = useResource(load),
    data = resource.data;
  return (
    <Page>
      <Title eyebrow="Progress">Your week, in perspective.</Title>
      <Result {...resource}>
        {data && (
          <>
            <Copy>
              {data.start_date} to {data.end_date} · {data.timezone}
            </Copy>
            <Card>
              <Title>Weight trend</Title>
              <Value
                label="Recorded weight change"
                value={metric(data.weight_change_kg, "kg")}
              />
              {data.weight_history.length ? (
                data.weight_history.map((row) => (
                  <Copy key={row.id}>
                    {new Date(row.recorded_at).toLocaleDateString()} ·{" "}
                    {metric(row.weight_kg, "kg")}
                  </Copy>
                ))
              ) : (
                <Copy>Log weight over time to build your trend.</Copy>
              )}
            </Card>
            <Card>
              <Title>Calorie adherence</Title>
              {data.daily.filter((day) => day.nutrition.has_logs).length ? (
                data.daily
                  .filter((day) => day.nutrition.has_logs)
                  .map((day) => (
                    <Copy key={day.date}>
                      {day.date} ·{" "}
                      {metric(day.nutrition.calories_consumed, "kcal")} logged /{" "}
                      {metric(day.nutrition.calories_target, "kcal")} target
                    </Copy>
                  ))
              ) : (
                <Copy>
                  No logged nutrition in this week. Missing logs do not
                  establish actual intake.
                </Copy>
              )}
            </Card>
            <Card>
              <Title>Workout consistency</Title>
              <Value
                label="Completed workouts"
                value={String(data.workouts.total_workouts)}
              />
              <Value
                label="Active days"
                value={String(data.workouts.active_days)}
              />
              <Copy>
                {data.workouts.total_workouts
                  ? "Based on completed saved sessions."
                  : "No completed workouts recorded this week."}
              </Copy>
            </Card>
            <Card>
              <Title>Weekly overview</Title>
              <Copy>
                Water target met on {data.water_consistency.days_met} of{" "}
                {data.water_consistency.observed_days_with_target} observed days
                with a target.
              </Copy>
            </Card>
          </>
        )}
      </Result>
    </Page>
  );
}

export function FoodSearch() {
  const api = useApi();
  const [draft, setDraft] = useState(""),
    [query, setQuery] = useState("");
  const load = useCallback(
    async (signal: AbortSignal) =>
      query
        ? api.request("get", "/api/v1/foods/search", {
            signal,
            query: { q: query },
            validate: foodSearchData,
          })
        : null,
    [api, query],
  );
  const resource = useResource(load),
    data = resource.data;
  return (
    <Page>
      <Title eyebrow="Nutrition catalog">Find your food.</Title>
      <Field
        label="Search foods"
        value={draft}
        onChangeText={setDraft}
        maxLength={100}
      />
      <Action
        label="Search"
        disabled={!draft.trim()}
        onPress={() => setQuery(draft.trim())}
      />
      <Result {...resource}>
        {data && (
          <>
            {!data.items.length && (
              <Copy>
                No matching foods available. Catalog coverage depends on
                approved data sources.
              </Copy>
            )}
            {data.items.map((food) => (
              <Card key={food.id}>
                <Title>{food.name}</Title>
                <Value
                  label="Calories per 100g"
                  value={metric(food.calories_kcal, "kcal")}
                />
                <Copy>{food.source}</Copy>
              </Card>
            ))}
            <Copy>
              Provider status:{" "}
              {Object.entries(data.provider_status)
                .map(([provider, status]) => `${provider}: ${status}`)
                .join(" · ")}
            </Copy>
          </>
        )}
      </Result>
    </Page>
  );
}
