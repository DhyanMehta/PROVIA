/* Real source clients and real loopback HTTP. No HTTP handlers or fetch mocks. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const readline = require('node:readline');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
  module._compile(output.outputText, filename);
};
const { createApiClient, ApiError } = require('../src/lib/api-client.ts');
const { createAuthSession } = require('../src/lib/auth-session.ts');
const nutritionChecks = require('../src/screens/nutrition/contracts.ts');
const workoutChecks = require('../src/screens/workouts/data.ts');
const trackingChecks = require('../src/screens/tracking/data.ts');
const fitnessChecks = require('../src/lib/fitness-contracts.ts');
const profileChecks = require('../src/lib/profile-values.ts');
const { progressCheck } = require('../src/lib/progress-values.ts');
const lines = readline.createInterface({ input: process.stdin, terminal: false });
const iterator = lines[Symbol.asyncIterator]();
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
const pass = label => send({ event: 'pass', label });
const base = process.argv[2];
assert.match(base, /^http:\/\/127\.0\.0\.1:\d+\/api\/v1$/);
const password = 'Phase five controlled test password 7391';
const email = 'phase5-client@example.com';
let persisted = null;
const storage = { read: async () => persisted, write: async value => { persisted = value; }, clear: async () => { persisted = null; } };
let requestCount = 0, lastStatus = 0;
const statuses = {};
// Observe actual network replies; never replace fetch or synthesize a response.
const wireFetch = async (url, options) => {
  const response = await fetch(url, options);
  requestCount += 1;
  lastStatus = response.status;
  statuses[response.status] = (statuses[response.status] ?? 0) + 1;
  return response;
};
let auth = createAuthSession(base, storage, wireFetch);
let api;
const linkClient = () => { api = createApiClient(base, auth.getToken, wireFetch); };
const readChecks = {
  '/api/v1/profile': profileChecks.profileData,
  '/api/v1/onboarding': trackingChecks.onboardingContextData,
  '/api/v1/goals': value => Array.isArray(value?.items) && value.items.every(profileChecks.goalData),
  '/api/v1/foods/search': nutritionChecks.searchCheck,
  '/api/v1/foods/{food_id}': nutritionChecks.foodCheck,
  '/api/v1/foods/{food_id}/nutrition': nutritionChecks.quantityCheck,
  '/api/v1/meals/{meal_id}': nutritionChecks.mealCheck,
  '/api/v1/nutrition/dashboard': nutritionChecks.nutritionCheck,
  '/api/v1/recipes': nutritionChecks.recipePageCheck,
  '/api/v1/workout-sessions/active': value => value === null || workoutChecks.workoutCheck(value),
  '/api/v1/workout-sessions': value => Array.isArray(value?.items) && value.items.every(workoutChecks.workoutCheck),
  '/api/v1/workouts/progress': workoutChecks.summaryCheck,
  '/api/v1/weight-logs/latest': trackingChecks.weightData,
  '/api/v1/water/dashboard': trackingChecks.waterDashboardData,
  '/api/v1/dashboard/today': fitnessChecks.dashboardData,
  '/api/v1/progress/overview': progressCheck,
};
const writeChecks = {
  '/api/v1/goals': profileChecks.goalData,
  '/api/v1/foods/custom': nutritionChecks.foodCheck,
  '/api/v1/meals': nutritionChecks.mealCheck,
  '/api/v1/recipes': nutritionChecks.recipeCheck,
  '/api/v1/exercises/custom': workoutChecks.exerciseCheck,
  '/api/v1/workout-plans': workoutChecks.planCheck,
  '/api/v1/workout-sessions': workoutChecks.workoutCheck,
  '/api/v1/workout-sessions/{session_id}/sets': workoutChecks.setCheck,
  '/api/v1/workout-sessions/{session_id}/complete': workoutChecks.workoutCheck,
  '/api/v1/weight-logs': trackingChecks.weightData,
  '/api/v1/weight-logs/{weight_id}/goal-preview': trackingChecks.weightPreviewData,
  '/api/v1/weight-logs/{weight_id}/apply-goal': trackingChecks.appliedGoalData,
  '/api/v1/water-logs': trackingChecks.waterData,
  '/api/v1/sleep-sessions': trackingChecks.sleepData,
};
const get = (route, options) => api.request('get', route, { cacheMs: 0, validate: readChecks[route], ...options });
const post = (route, body, options) => api.request('post', route, { validate: writeChecks[route], ...(body === undefined ? {} : { body }), ...options });
const params = (key, value) => ({ params: { [key]: value } });
async function verifyAccount(accountEmail) {
  await auth.publicApi.request('post', '/api/v1/auth/register', { authenticated: false, body: { name: 'Controlled client test', email: accountEmail, password } });
  send({ event: 'drain' });
  const input = await iterator.next();
  const token = JSON.parse(input.value).token;
  await auth.publicApi.request('post', '/api/v1/auth/verify-email', { authenticated: false, body: { token } });
}
async function expectFailure(operation, status) {
  await assert.rejects(operation, error => error instanceof ApiError && error.status === status);
}

(async () => {
  const registered = await auth.publicApi.request('post', '/api/v1/auth/register', { authenticated: false, body: { name: 'Controlled client test', email, password } });
  assert.equal(lastStatus, 202);
  assert.equal(typeof registered.message, 'string');
  assert.equal(registered.token, undefined);
  pass('Registration accepts a generic response without an action token');
  send({ event: 'drain' });
  const input = await iterator.next();
  const token = JSON.parse(input.value).token;
  assert.equal(typeof token, 'string');
  pass('Controlled external email sink receives supervised outbox delivery');
  await auth.publicApi.request('post', '/api/v1/auth/verify-email', { authenticated: false, body: { token } });
  pass('Verification consumes the controlled action over real HTTP');
  await auth.signIn(email, password);
  assert.equal(auth.getSnapshot().user.email_verified, true);
  pass('Actual auth controller logs in and validates the account');
  assert.ok(persisted);
  auth = createAuthSession(base, storage, wireFetch);
  await auth.restore();
  assert.equal(auth.getSnapshot().loaded, true);
  assert.equal(auth.getSnapshot().user.email_verified, true);
  linkClient();
  const revokedAccess = await auth.getToken();
  pass('Session restores through actual refresh rotation using test storage');
  const start = await get('/api/v1/onboarding');
  assert.equal(start.next_step, 'profile');
  const profileBody = { display_name: 'Controlled client test', date_of_birth: '1995-01-02', height_cm: '175', current_weight_kg: '97', activity_level: 'moderate', preferred_weight_unit: 'kg', timezone: 'Asia/Kolkata' };
  const profile = await api.request('put', '/api/v1/profile', { body: profileBody });
  assert.equal(profile.timezone, 'Asia/Kolkata');
  assert.equal((await get('/api/v1/onboarding')).next_step, 'goal');
  pass('Onboarding authority advances only after profile replacement');
  const goalBody = { current_weight_kg: '97', target_weight_kg: '85', selected_deficit_kcal: '500', goal_type: 'weight_loss', status: 'active', daily_steps_target: 8000 };
  const previewGoal = await auth.publicApi.request('post', '/api/v1/nutrition/calculate-goals', { authenticated: false, body: { current_weight_kg: '97', target_weight_kg: '85', deficit_kcal: '500' } });
  const goalKey = randomUUID();
  const goal = await post('/api/v1/goals', goalBody, { idempotencyKey: goalKey });
  assert.equal(goal.daily_calorie_target, previewGoal.daily_calorie_target);
  assert.equal((await post('/api/v1/goals', goalBody, { idempotencyKey: goalKey })).id, goal.id);
  assert.equal((await get('/api/v1/onboarding')).next_step, 'dashboard');
  pass('Server calorie and macro preview matches idempotent persisted goal');
  const maintenance = await post('/api/v1/goals', { current_weight_kg: '97', target_weight_kg: '97', selected_deficit_kcal: '0', goal_type: 'maintenance', status: 'paused' }, { idempotencyKey: randomUUID() });
  const goalHistory = await get('/api/v1/goals', { query: { limit: 20, offset: 0 } });
  assert.equal(Number(goalHistory.items.find(row => row.id === maintenance.id).selected_deficit_kcal), 0);
  assert.equal((await get('/api/v1/onboarding')).active_goal.id, goal.id);
  pass('Persisted zero-deficit maintenance validates without replacing active goal');
  const empty = await get('/api/v1/foods/search', { query: { q: 'Controlled oats', source: 'local', page: 1, page_size: 20 } });
  assert.equal(empty.items.length, 0);
  pass('Food search uses authenticated local source without external providers');
  const foodBody = { name: 'Controlled oats', food_kind: 'ingredient', calories_kcal: '400', protein_g: '10', carbs_g: '60', fat_g: '13.333', fiber_g: '0', aliases: ['Controlled porridge'], portions: [{ label: 'Measured bowl', grams: '50' }] };
  const foodKey = randomUUID();
  const food = await post('/api/v1/foods/custom', foodBody, { idempotencyKey: foodKey });
  assert.equal((await post('/api/v1/foods/custom', foodBody, { idempotencyKey: foodKey })).id, food.id);
  assert.equal((await get('/api/v1/foods/search', { query: { q: 'Controlled oats', source: 'local' } })).items[0].id, food.id);
  const quantity = await get('/api/v1/foods/{food_id}/nutrition', { ...params('food_id', food.id), query: { quantity_g: '50' } });
  assert.equal(Number(quantity.calories_kcal), 200);
  assert.equal(Number(quantity.fiber_g), 0);
  pass('Custom food receipt search and server portion nutrients agree');
  const now = new Date();
  const consumed_at = now.toISOString();
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const mealBody = { meal_type: 'breakfast', consumed_at, notes: 'Controlled fixture', items: [{ food_id: food.id, quantity_g: '50' }] };
  const mealKey = randomUUID();
  const meal = await post('/api/v1/meals', mealBody, { idempotencyKey: mealKey });
  assert.equal((await post('/api/v1/meals', mealBody, { idempotencyKey: mealKey })).id, meal.id);
  assert.equal(Number(meal.totals.calories_kcal), 200);
  pass('Meal create is replay-safe and records server snapshots');
  const nutrition = await get('/api/v1/nutrition/dashboard', { query: { date } });
  assert.equal(Number(nutrition.calories.consumed), 200);
  assert.equal(nutrition.meals[0].id, meal.id);
  pass('Nutrition totals read actual saved meal data');
  const changed = await api.request('patch', '/api/v1/meals/{meal_id}', { ...params('meal_id', meal.id), body: { items: [{ food_id: food.id, quantity_g: '75' }], notes: 'Edited controlled fixture' } });
  assert.equal(Number(changed.totals.calories_kcal), 300);
  const metadata = await api.request('patch', '/api/v1/meals/{meal_id}', { ...params('meal_id', meal.id), body: { notes: 'Metadata only' } });
  assert.equal(metadata.items.length, changed.items.length);
  for (const [index, item] of metadata.items.entries()) {
    const before = changed.items[index];
    assert.equal(item.id, before.id);
    assert.equal(item.food_id, before.food_id);
    // PostgreSQL NUMERIC may return more trailing zeroes after a fresh read.
    // Compare the controlled fixture values, while preserving unknown snapshots.
    for (const key of ['quantity_g', 'calories_kcal_snapshot', 'protein_g_snapshot', 'carbs_g_snapshot', 'fat_g_snapshot', 'fiber_g_snapshot']) {
      if (before[key] === null) assert.equal(item[key], null);
      else assert.equal(Number(item[key]), Number(before[key]));
    }
  }
  pass('Meal item replacement recalculates and metadata preserves snapshots');
  const removable = await post('/api/v1/meals', { ...mealBody, meal_type: 'snack' }, { idempotencyKey: randomUUID() });
  assert.equal(await api.request('delete', '/api/v1/meals/{meal_id}', params('meal_id', removable.id)), undefined);
  await expectFailure(() => get('/api/v1/meals/{meal_id}', params('meal_id', removable.id)), 404);
  pass('Deleting an entry returns empty success and removes only that entry');
  const recipe = await post('/api/v1/recipes', { name: 'Controlled meal prep', yield_g: '200', ingredients: [{ food_id: food.id, quantity_g: '100' }], portions: [{ label: 'Measured serving', grams: '50' }] }, { idempotencyKey: randomUUID() });
  assert.equal(recipe.incomplete, false);
  assert.equal(Number(recipe.food.calories_kcal), 200);
  const recipes = await get('/api/v1/recipes', { query: { limit: 20, offset: 0 } });
  assert.ok(recipes.items.some(row => row.id === recipe.id));
  pass('Immutable measured recipe and actual zero nutrients validate on fresh reads');
  const exercise = await post('/api/v1/exercises/custom', { name: 'Controlled squat', category: 'strength', equipment: 'barbell', muscle_group: 'legs', secondary_muscles: [], difficulty: 'beginner' }, { idempotencyKey: randomUUID() });
  const planBody = { name: 'Controlled weekly plan', is_active: true, days: Array.from({ length: 7 }, (_, day_of_week) => ({ day_of_week, name: day_of_week === 0 ? 'Strength' : 'Rest', is_rest: day_of_week !== 0, exercises: day_of_week === 0 ? [{ exercise_id: exercise.id, order_index: 0, target_sets: 2, target_reps: 8, rest_seconds: 60, target_weight_kg: '20' }] : [] })) };
  const plan = await post('/api/v1/workout-plans', planBody, { idempotencyKey: randomUUID() });
  assert.equal(plan.days.length, 7);
  pass('Custom exercise and full seven-day plan save through frozen contracts');
  const workout = await post('/api/v1/workout-sessions', { started_at: consumed_at, workout_plan_day_id: plan.days.find(day => !day.is_rest).id }, { idempotencyKey: randomUUID() });
  assert.equal((await get('/api/v1/workout-sessions/active')).id, workout.id);
  assert.ok(workout.plan_snapshot);
  await expectFailure(() => post('/api/v1/workout-sessions', { started_at: consumed_at }, { idempotencyKey: randomUUID() }), 409);
  pass('Active workout restores a server plan snapshot and rejects duplicates');
  const set = await post('/api/v1/workout-sessions/{session_id}/sets', { exercise_id: exercise.id, set_number: 1, reps: 8, weight_kg: '20', kind: 'working', is_completed: true, is_skipped: false }, params('session_id', workout.id));
  const editedSet = await api.request('patch', '/api/v1/workout-sessions/{session_id}/sets/{set_id}', { params: { session_id: workout.id, set_id: set.id }, body: { reps: 10 } });
  assert.equal(editedSet.reps, 10);
  pass('Actual workout set create and edit store reps and weights');
  const completed = await post('/api/v1/workout-sessions/{session_id}/complete', { completed_at: new Date().toISOString() }, params('session_id', workout.id));
  assert.equal(completed.status, 'completed');
  assert.equal(await get('/api/v1/workout-sessions/active'), null);
  await expectFailure(() => post('/api/v1/workout-sessions/{session_id}/sets', { exercise_id: exercise.id, set_number: 2, reps: 8, weight_kg: '20', kind: 'working', is_completed: true, is_skipped: false }, params('session_id', workout.id)), 409);
  pass('Workout completion clears active state and terminal sessions reject sets');
  const sessions = await get('/api/v1/workout-sessions', { query: { start_date: date, end_date: date } });
  assert.ok(sessions.items.some(row => row.id === workout.id));
  const summary = await get('/api/v1/workouts/progress', { query: { start_date: date, end_date: date } });
  assert.equal(summary.total_workouts, 1);
  assert.equal(Number(summary.personal_records[exercise.id].heaviest_weight_kg), 20);
  pass('Workout history and observed personal records use completed sets');
  const weight = await post('/api/v1/weight-logs', { weight_kg: '96', recorded_at: consumed_at, source: 'manual' }, { idempotencyKey: randomUUID() });
  assert.equal((await get('/api/v1/weight-logs/latest')).id, weight.id);
  assert.equal(Number((await get('/api/v1/profile')).current_weight_kg), Number(profile.current_weight_kg));
  pass('Weight measurement saves without silently changing profile or goal');
  const weightPreview = await post('/api/v1/weight-logs/{weight_id}/goal-preview', undefined, params('weight_id', weight.id));
  const applied = await post('/api/v1/weight-logs/{weight_id}/apply-goal', { expected_goal_id: weightPreview.base_goal_id, expected_weight_kg: weightPreview.current_weight_kg_snapshot }, { ...params('weight_id', weight.id), idempotencyKey: randomUUID() });
  assert.equal(Number(applied.current_weight_kg_snapshot), 96);
  assert.notEqual(applied.id, goal.id);
  await expectFailure(() => post('/api/v1/weight-logs/{weight_id}/apply-goal', { expected_goal_id: goal.id, expected_weight_kg: '96' }, { ...params('weight_id', weight.id), idempotencyKey: randomUUID() }), 409);
  pass('Explicit weight goal preview applies a revision and stale goals conflict');
  await api.request('put', '/api/v1/water/target', { body: { effective_date: date, target_ml: '2000' } });
  const waterKey = randomUUID();
  const water = await post('/api/v1/water-logs', { amount_ml: '250', consumed_at }, { idempotencyKey: waterKey });
  assert.equal((await post('/api/v1/water-logs', { amount_ml: '250', consumed_at }, { idempotencyKey: waterKey })).id, water.id);
  const waterDay = await get('/api/v1/water/dashboard', { query: { date } });
  assert.equal(Number(waterDay.consumed_ml), 250);
  assert.equal(Number(waterDay.target_ml), 2000);
  pass('Water target and idempotent intake produce actual daily totals');
  const activity = await api.request('put', '/api/v1/activity/daily', { body: { activity_date: date, source: 'manual', steps: 7000, distance_m: null, active_minutes: 35, activity_calories: null } });
  assert.equal(activity.steps, 7000);
  assert.equal(activity.activity_calories, null);
  pass('Manual activity replaces a full day while preserving unknown values');
  const sleep = await post('/api/v1/sleep-sessions', { source: 'manual', started_at: new Date(now.getTime() - 8 * 3600000).toISOString(), ended_at: consumed_at, notes: 'Controlled fixture' }, { idempotencyKey: randomUUID() });
  assert.equal(sleep.duration_seconds, 28800);
  pass('Offset-aware sleep interval stores eight actual hours');
  const dashboard = await get('/api/v1/dashboard/today');
  assert.equal(Number(dashboard.weight.weight_kg), Number(weight.weight_kg));
  assert.equal(dashboard.weight.recorded_at, weight.recorded_at);
  assert.equal(dashboard.activity.steps, 7000);
  assert.equal(Number(dashboard.water.consumed_ml), 250);
  assert.equal(dashboard.sleep.duration_seconds, 28800);
  assert.equal(Number(dashboard.nutrition.calories.consumed), 300);
  const progress = await get('/api/v1/progress/overview', { query: { start_date: date, end_date: date } });
  assert.equal(progress.weight_history[0].id, weight.id);
  assert.equal(progress.workouts.total_workouts, 1);
  assert.equal(progress.daily[0].nutrition.has_logs, true);
  pass('Unified dashboard and progress aggregate actual saved modules');
  const updatedProfile = await api.request('put', '/api/v1/profile', { body: { ...profileBody, display_name: 'Updated controlled client', preferred_weight_unit: 'lb' } });
  assert.equal(updatedProfile.date_of_birth, profileBody.date_of_birth);
  assert.equal(updatedProfile.preferred_weight_unit, 'lb');
  const activeAfterProfile = (await get('/api/v1/onboarding')).active_goal;
  assert.equal(activeAfterProfile.id, applied.id);
  pass('Profile replacement retains fields without rewriting goal history');
  await auth.signOut();
  assert.equal(auth.getSnapshot().user, null);
  assert.equal(persisted, null);
  pass('Actual session controller signs out and clears test native storage');
  const anonymous = createApiClient(base, async () => null, wireFetch);
  await expectFailure(() => anonymous.request('get', '/api/v1/profile', { authenticated: false }), 401);
  const old = createApiClient(base, async () => revokedAccess, wireFetch);
  await expectFailure(() => old.request('get', '/api/v1/profile'), 401);
  pass('Anonymous and revoked sessions cannot read protected data');
  auth = createAuthSession(base, storage, wireFetch);
  await verifyAccount('phase5-other@example.com');
  await auth.signIn('phase5-other@example.com', password);
  linkClient();
  for (const [route, key, id] of [['/api/v1/meals/{meal_id}', 'meal_id', meal.id], ['/api/v1/workout-plans/{plan_id}', 'plan_id', plan.id], ['/api/v1/workout-sessions/{session_id}', 'session_id', workout.id], ['/api/v1/weight-logs/{weight_id}', 'weight_id', weight.id], ['/api/v1/foods/{food_id}', 'food_id', food.id]]) {
    await expectFailure(() => get(route, params(key, id)), 404);
  }
  await auth.signOut();
  pass('A second real account cannot read another users owned records');
  send({ event: 'complete', requests: requestCount, statuses });
})().catch(error => { send({ event: 'failure', status: error instanceof ApiError ? error.status : 0, code: error instanceof ApiError ? error.code : 'ASSERTION' }); process.exitCode = 1; }).finally(() => lines.close());
