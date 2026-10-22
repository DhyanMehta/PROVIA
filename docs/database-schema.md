# Database schema
Revision: `0002` (after `0001_initial`). PostgreSQL only. 17 tables; UUID primary keys and timezone-aware timestamps. Numeric/Decimal is used for physical measurements and nutrition. Application-created timestamps and transaction timezone are UTC.
## Integrity and lifecycle
- Owned records refer to users; child records inherit ownership through their parent.
- External catalogs are shared; custom foods/exercises have an owner. Catalog references use RESTRICT.
- One active fitness goal per user is enforced by a PostgreSQL partial unique index.
- Provider subjects and external food source/ID pairs are unique.
- Nutrient and snapshot null values represent unknown, not zero. Values cannot be negative.
- Meals own their items; snapshots survive catalog changes.
- Daily activity is unique per user/date to avoid double-counting multiple sources.
- Workout day is 0 (Monday) through 6 (Sunday); sets/reps/order constraints are enforced.
- Sleep requires a positive duration of at most 24 hours; water is positive and at most 10000 ml per log.
- ORM updated_at values refresh on ORM updates. Direct SQL maintenance must set updated_at explicitly.

Migration0002 adds nullable calculation snapshots for legacy goals, widens calculated targets to Numeric(18,8), and adds curated source attribution, JSONB aliases and a GIN index. Legacy goals remain readable; activation requires new calculation inputs.

## Tables

### users

| Column | PostgreSQL type | Nullable | Reference |
| --- | --- | --- | --- |
| auth_provider_subject | VARCHAR(255) | False |  |
| email | VARCHAR(320) | True |  |
| id | UUID | False |  |
| created_at | TIMESTAMP WITH TIME ZONE | False |  |
| updated_at | TIMESTAMP WITH TIME ZONE | False |  |

Constraints: `pk_users`, `uq_users_auth_provider_subject`.

Indexes: .

### daily_activity

| Column | PostgreSQL type | Nullable | Reference |
| --- | --- | --- | --- |
| user_id | UUID | False | users.id (CASCADE) |
| activity_date | DATE | False |  |
| steps | INTEGER | False |  |
| distance_m | NUMERIC(12, 3) | True |  |
| source | VARCHAR(50) | False |  |
| id | UUID | False |  |
| created_at | TIMESTAMP WITH TIME ZONE | False |  |
| updated_at | TIMESTAMP WITH TIME ZONE | False |  |

Constraints: `ck_daily_activity_distance_nonnegative`, `ck_daily_activity_steps_range`, `fk_daily_activity_user_id_users`, `pk_daily_activity`, `uq_daily_activity_user_id`.

- Check: `distance_m >= 0`

- Check: `steps >= 0 AND steps <= 200000`

Indexes: .

### exercises

| Column | PostgreSQL type | Nullable | Reference |
| --- | --- | --- | --- |
| name | VARCHAR(200) | False |  |
| muscle_group | VARCHAR(100) | False |  |
| equipment | VARCHAR(100) | False |  |
| instructions | TEXT | True |  |
| created_by_user_id | UUID | True | users.id (RESTRICT) |
| id | UUID | False |  |
| created_at | TIMESTAMP WITH TIME ZONE | False |  |

Constraints: `fk_exercises_created_by_user_id_users`, `pk_exercises`.

Indexes: `ix_exercises_created_by_user_id`, `ix_exercises_name`.

### fitness_goals

| Column | PostgreSQL type | Nullable | Reference |
| --- | --- | --- | --- |
| user_id | UUID | False | users.id (CASCADE) |
| goal_type | VARCHAR(30) | False |  |
| target_weight_kg | NUMERIC(8, 3) | True |  |
| daily_calorie_target | NUMERIC(18, 8) | True |  |
| protein_target_g | NUMERIC(18, 8) | True |  |
| carbs_target_g | NUMERIC(18, 8) | True |  |
| fat_target_g | NUMERIC(18, 8) | True |  |
| fiber_target_g | NUMERIC(18, 8) | True |  |
| daily_steps_target | INTEGER | True |  |
| status | VARCHAR(20) | False |  |
| current_weight_kg_snapshot | NUMERIC(8, 3) | True |  |
| selected_deficit_kcal | NUMERIC(12, 3) | True |  |
| maintenance_calories | NUMERIC(18, 8) | True |  |
| protein_target_kcal | NUMERIC(18, 8) | True |  |
| carbs_target_kcal | NUMERIC(18, 8) | True |  |
| fat_target_kcal | NUMERIC(18, 8) | True |  |
| calculation_method | VARCHAR(40) | True |  |
| calculation_version | VARCHAR(20) | True |  |
| id | UUID | False |  |
| created_at | TIMESTAMP WITH TIME ZONE | False |  |
| updated_at | TIMESTAMP WITH TIME ZONE | False |  |

Constraints: `ck_fitness_goals_calculation_snapshot_complete`, `ck_fitness_goals_calories_nonnegative`, `ck_fitness_goals_deficit_range`, `ck_fitness_goals_goal_type`, `ck_fitness_goals_nutrients_nonnegative`, `ck_fitness_goals_snapshot_weight`, `ck_fitness_goals_status`, `ck_fitness_goals_steps_nonnegative`, `ck_fitness_goals_target_weight`, `fk_fitness_goals_user_id_users`, `pk_fitness_goals`.

- Check: `calculation_method IS NULL OR (calculation_method = 'weight_x_24' AND calculation_version IS NOT NULL AND current_weight_kg_snapshot IS NOT NULL AND target_weight_kg IS NOT NULL AND selected_deficit_kcal IS NOT NULL AND maintenance_calories IS NOT NULL AND daily_calorie_target IS NOT NULL AND protein_target_g IS NOT NULL AND protein_target_kcal IS NOT NULL AND carbs_target_g IS NOT NULL AND carbs_target_kcal IS NOT NULL AND fat_target_g IS NOT NULL AND fat_target_kcal IS NOT NULL AND fiber_target_g IS NOT NULL AND daily_calorie_target > 0 AND carbs_target_g > 0)`

- Check: `daily_calorie_target >= 0`

- Check: `selected_deficit_kcal >= 0 AND selected_deficit_kcal < maintenance_calories`

- Check: `goal_type IN ('weight_loss','muscle_gain','maintenance','general_fitness')`

- Check: `protein_target_g >= 0 AND carbs_target_g >= 0 AND fat_target_g >= 0 AND fiber_target_g >= 0`

- Check: `current_weight_kg_snapshot > 0 AND current_weight_kg_snapshot <= 1000`

- Check: `status IN ('active','completed','paused')`

- Check: `daily_steps_target >= 0`

- Check: `target_weight_kg > 0 AND target_weight_kg <= 1000`

Indexes: `ix_fitness_goals_user_created`, `uq_fitness_goals_active_user`.

### foods

| Column | PostgreSQL type | Nullable | Reference |
| --- | --- | --- | --- |
| name | VARCHAR(300) | False |  |
| brand | VARCHAR(200) | True |  |
| aliases | JSONB | False |  |
| source_url | VARCHAR(1000) | True |  |
| license_name | VARCHAR(200) | True |  |
| verified_at | TIMESTAMP WITH TIME ZONE | True |  |
| source | VARCHAR(30) | False |  |
| source_food_id | VARCHAR(100) | True |  |
| serving_basis | VARCHAR(10) | False |  |
| calories_kcal | NUMERIC(12, 3) | True |  |
| protein_g | NUMERIC(12, 3) | True |  |
| carbs_g | NUMERIC(12, 3) | True |  |
| fat_g | NUMERIC(12, 3) | True |  |
| fiber_g | NUMERIC(12, 3) | True |  |
| created_by_user_id | UUID | True | users.id (RESTRICT) |
| id | UUID | False |  |
| created_at | TIMESTAMP WITH TIME ZONE | False |  |
| updated_at | TIMESTAMP WITH TIME ZONE | False |  |

Constraints: `ck_foods_curated_attribution`, `ck_foods_nutrients_nonnegative`, `ck_foods_ownership`, `ck_foods_serving_basis`, `ck_foods_source`, `fk_foods_created_by_user_id_users`, `pk_foods`, `uq_foods_source`.

- Check: `source <> 'indian_curated' OR (source_url IS NOT NULL AND license_name IS NOT NULL AND verified_at IS NOT NULL)`

- Check: `calories_kcal >= 0 AND protein_g >= 0 AND carbs_g >= 0 AND fat_g >= 0 AND fiber_g >= 0`

- Check: `(source = 'custom' AND created_by_user_id IS NOT NULL) OR (source <> 'custom' AND source_food_id IS NOT NULL AND created_by_user_id IS NULL)`

- Check: `serving_basis = '100g'`

- Check: `source IN ('custom','usda','open_food_facts','indian_curated')`

Indexes: `ix_foods_aliases`, `ix_foods_created_by_user_id`, `ix_foods_name`.

### meal_logs

| Column | PostgreSQL type | Nullable | Reference |
| --- | --- | --- | --- |
| user_id | UUID | False | users.id (CASCADE) |
| meal_type | VARCHAR(20) | False |  |
| consumed_at | TIMESTAMP WITH TIME ZONE | False |  |
| notes | TEXT | True |  |
| id | UUID | False |  |
| created_at | TIMESTAMP WITH TIME ZONE | False |  |
| updated_at | TIMESTAMP WITH TIME ZONE | False |  |

Constraints: `ck_meal_logs_meal_type`, `fk_meal_logs_user_id_users`, `pk_meal_logs`.

- Check: `meal_type IN ('breakfast','lunch','dinner','snack')`

Indexes: `ix_meal_logs_user_consumed`.

### sleep_sessions

| Column | PostgreSQL type | Nullable | Reference |
| --- | --- | --- | --- |
| user_id | UUID | False | users.id (CASCADE) |
| started_at | TIMESTAMP WITH TIME ZONE | False |  |
| ended_at | TIMESTAMP WITH TIME ZONE | False |  |
| source | VARCHAR(50) | False |  |
| id | UUID | False |  |
| created_at | TIMESTAMP WITH TIME ZONE | False |  |

Constraints: `ck_sleep_sessions_sleep_duration`, `fk_sleep_sessions_user_id_users`, `pk_sleep_sessions`.

- Check: `ended_at > started_at AND ended_at <= started_at + INTERVAL '24 hours'`

Indexes: `ix_sleep_sessions_user_started`.

### user_profiles

| Column | PostgreSQL type | Nullable | Reference |
| --- | --- | --- | --- |
| user_id | UUID | False | users.id (CASCADE) |
| display_name | VARCHAR(100) | False |  |
| date_of_birth | DATE | True |  |
| height_cm | NUMERIC(7, 2) | False |  |
| current_weight_kg | NUMERIC(8, 3) | False |  |
| activity_level | VARCHAR(20) | False |  |
| preferred_weight_unit | VARCHAR(2) | False |  |
| timezone | VARCHAR(100) | False |  |
| id | UUID | False |  |
| created_at | TIMESTAMP WITH TIME ZONE | False |  |
| updated_at | TIMESTAMP WITH TIME ZONE | False |  |

Constraints: `ck_user_profiles_activity_level`, `ck_user_profiles_height_range`, `ck_user_profiles_weight_range`, `ck_user_profiles_weight_unit`, `fk_user_profiles_user_id_users`, `pk_user_profiles`, `uq_user_profiles_user_id`.

- Check: `activity_level IN ('sedentary','light','moderate','active','very_active')`

- Check: `height_cm > 0 AND height_cm <= 300`

- Check: `current_weight_kg > 0 AND current_weight_kg <= 1000`

- Check: `preferred_weight_unit IN ('kg','lb')`

Indexes: .

### water_logs

| Column | PostgreSQL type | Nullable | Reference |
| --- | --- | --- | --- |
| user_id | UUID | False | users.id (CASCADE) |
| amount_ml | NUMERIC(10, 3) | False |  |
| consumed_at | TIMESTAMP WITH TIME ZONE | False |  |
| id | UUID | False |  |
| created_at | TIMESTAMP WITH TIME ZONE | False |  |

Constraints: `ck_water_logs_amount_range`, `fk_water_logs_user_id_users`, `pk_water_logs`.

- Check: `amount_ml > 0 AND amount_ml <= 10000`

Indexes: `ix_water_logs_user_consumed`.

### weight_logs

| Column | PostgreSQL type | Nullable | Reference |
| --- | --- | --- | --- |
| user_id | UUID | False | users.id (CASCADE) |
| weight_kg | NUMERIC(8, 3) | False |  |
| recorded_at | TIMESTAMP WITH TIME ZONE | False |  |
| id | UUID | False |  |
| created_at | TIMESTAMP WITH TIME ZONE | False |  |

Constraints: `ck_weight_logs_weight_range`, `fk_weight_logs_user_id_users`, `pk_weight_logs`.

- Check: `weight_kg > 0 AND weight_kg <= 1000`

Indexes: `ix_weight_logs_user_recorded`.

### workout_plans

| Column | PostgreSQL type | Nullable | Reference |
| --- | --- | --- | --- |
| user_id | UUID | False | users.id (CASCADE) |
| name | VARCHAR(200) | False |  |
| description | TEXT | True |  |
| is_active | BOOLEAN | False |  |
| id | UUID | False |  |
| created_at | TIMESTAMP WITH TIME ZONE | False |  |
| updated_at | TIMESTAMP WITH TIME ZONE | False |  |

Constraints: `fk_workout_plans_user_id_users`, `pk_workout_plans`.

Indexes: `ix_workout_plans_user_id`.

### food_portions

| Column | PostgreSQL type | Nullable | Reference |
| --- | --- | --- | --- |
| food_id | UUID | False | foods.id (CASCADE) |
| label | VARCHAR(100) | False |  |
| grams | NUMERIC(12, 3) | False |  |
| id | UUID | False |  |
| created_at | TIMESTAMP WITH TIME ZONE | False |  |

Constraints: `ck_food_portions_positive_grams`, `fk_food_portions_food_id_foods`, `pk_food_portions`, `uq_food_portions_food_id`.

- Check: `grams > 0`

Indexes: .

### meal_items

| Column | PostgreSQL type | Nullable | Reference |
| --- | --- | --- | --- |
| meal_log_id | UUID | False | meal_logs.id (CASCADE) |
| food_id | UUID | False | foods.id (RESTRICT) |
| quantity_g | NUMERIC(12, 3) | False |  |
| calories_kcal_snapshot | NUMERIC(16, 3) | True |  |
| protein_g_snapshot | NUMERIC(16, 3) | True |  |
| carbs_g_snapshot | NUMERIC(16, 3) | True |  |
| fat_g_snapshot | NUMERIC(16, 3) | True |  |
| fiber_g_snapshot | NUMERIC(16, 3) | True |  |
| id | UUID | False |  |
| created_at | TIMESTAMP WITH TIME ZONE | False |  |

Constraints: `ck_meal_items_positive_quantity`, `ck_meal_items_snapshots_nonnegative`, `fk_meal_items_food_id_foods`, `fk_meal_items_meal_log_id_meal_logs`, `pk_meal_items`.

- Check: `quantity_g > 0`

- Check: `calories_kcal_snapshot >= 0 AND protein_g_snapshot >= 0 AND carbs_g_snapshot >= 0 AND fat_g_snapshot >= 0 AND fiber_g_snapshot >= 0`

Indexes: `ix_meal_items_food_id`, `ix_meal_items_meal_log_id`.

### workout_plan_days

| Column | PostgreSQL type | Nullable | Reference |
| --- | --- | --- | --- |
| workout_plan_id | UUID | False | workout_plans.id (CASCADE) |
| day_of_week | INTEGER | False |  |
| name | VARCHAR(100) | False |  |
| id | UUID | False |  |
| created_at | TIMESTAMP WITH TIME ZONE | False |  |

Constraints: `ck_workout_plan_days_day_range`, `fk_workout_plan_days_workout_plan_id_workout_plans`, `pk_workout_plan_days`, `uq_workout_plan_days_workout_plan_id`.

- Check: `day_of_week BETWEEN 0 AND 6`

Indexes: .

### planned_exercises

| Column | PostgreSQL type | Nullable | Reference |
| --- | --- | --- | --- |
| workout_plan_day_id | UUID | False | workout_plan_days.id (CASCADE) |
| exercise_id | UUID | False | exercises.id (RESTRICT) |
| order_index | INTEGER | False |  |
| target_sets | INTEGER | False |  |
| target_reps | INTEGER | False |  |
| id | UUID | False |  |
| created_at | TIMESTAMP WITH TIME ZONE | False |  |

Constraints: `ck_planned_exercises_targets`, `fk_planned_exercises_exercise_id_exercises`, `fk_planned_exercises_workout_plan_day_id_workout_plan_days`, `pk_planned_exercises`, `uq_planned_exercises_workout_plan_day_id`.

- Check: `order_index >= 0 AND target_sets > 0 AND target_reps > 0`

Indexes: `ix_planned_exercises_exercise_id`.

### workout_sessions

| Column | PostgreSQL type | Nullable | Reference |
| --- | --- | --- | --- |
| user_id | UUID | False | users.id (CASCADE) |
| workout_plan_day_id | UUID | True | workout_plan_days.id (SET NULL) |
| started_at | TIMESTAMP WITH TIME ZONE | False |  |
| completed_at | TIMESTAMP WITH TIME ZONE | True |  |
| status | VARCHAR(20) | False |  |
| notes | TEXT | True |  |
| id | UUID | False |  |

Constraints: `ck_workout_sessions_status`, `ck_workout_sessions_time_order`, `fk_workout_sessions_user_id_users`, `fk_workout_sessions_workout_plan_day_id_workout_plan_days`, `pk_workout_sessions`.

- Check: `status IN ('in_progress','completed','cancelled')`

- Check: `completed_at >= started_at`

Indexes: `ix_workout_sessions_user_started`, `ix_workout_sessions_workout_plan_day_id`.

### workout_sets

| Column | PostgreSQL type | Nullable | Reference |
| --- | --- | --- | --- |
| workout_session_id | UUID | False | workout_sessions.id (CASCADE) |
| exercise_id | UUID | False | exercises.id (RESTRICT) |
| set_number | INTEGER | False |  |
| reps | INTEGER | False |  |
| weight_kg | NUMERIC(8, 3) | False |  |
| is_completed | BOOLEAN | False |  |
| id | UUID | False |  |
| created_at | TIMESTAMP WITH TIME ZONE | False |  |

Constraints: `ck_workout_sets_values`, `fk_workout_sets_exercise_id_exercises`, `fk_workout_sets_workout_session_id_workout_sessions`, `pk_workout_sets`, `uq_workout_sets_workout_session_id`.

- Check: `set_number > 0 AND reps >= 0 AND weight_kg >= 0`

Indexes: `ix_workout_sets_exercise_id`.
