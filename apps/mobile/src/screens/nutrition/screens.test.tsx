import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import CustomFoodScreen from "./custom-food";
import { MealEditor } from "./meal";
import { RecipeCreateScreen } from "./recipes";
import FoodSearchScreen from "./search";
import BarcodeScreen from "./barcode";
import { FoodLog } from "./food";
import { ApiError } from "../../lib/api-client";
import type { Schema } from "../../lib/contracts";
const foodId = "10000000-0000-4000-8000-000000000001", mealId = "10000000-0000-4000-8000-000000000002";
const nutrient = { calories_kcal: "100.000", protein_g: "10.000", carbs_g: "12.000", fat_g: "3.000", fiber_g: null };
const mockFood: Schema<"FoodOut"> = { id: foodId, name: "Test measured food", brand: null, source: "custom", source_food_id: null, serving_basis: "100g", food_kind: "ingredient", portions: [], ...nutrient };
const mockMeal: Schema<"MealOut"> = { id: mealId, meal_type: "lunch", consumed_at: "2026-10-29T08:30:00+05:30", notes: null, totals: nutrient, items: [{ id: mealId, food_id: foodId, quantity_g: "100.000", calories_kcal_snapshot: "100.000", protein_g_snapshot: "10.000", carbs_g_snapshot: "12.000", fat_g_snapshot: "3.000", fiber_g_snapshot: null }] };
const mockRequest = jest.fn();
const mockApi = { request: mockRequest };
const mockReplace = jest.fn(), mockBack = jest.fn(), mockDisable = jest.fn();
let mockPermission = { granted: false, canAskAgain: true };
const mockRequestPermission = jest.fn();
let mockPrevent: ((event: { repeat: () => void }) => void) | undefined;
let mockKey = 0;
jest.mock("expo-crypto", () => ({ randomUUID: () => `10000000-0000-4000-8000-${String(++mockKey).padStart(12, "0")}` }));
jest.mock("../../providers/api", () => ({ useApi: () => mockApi }));
jest.mock("expo-router", () => ({ router: { replace: (...args: unknown[]) => mockReplace(...args), back: () => mockBack(), push: jest.fn() }, useLocalSearchParams: () => ({}), usePreventRemove: (dirty: boolean, callback: (event: { repeat: () => void }) => void) => { if (dirty) mockPrevent = callback; return mockDisable; }, useFocusEffect: (callback: () => void) => { const React = require("react"); React.useEffect(callback, [callback]); } }));
jest.mock("expo-camera", () => ({ useCameraPermissions: () => [mockPermission, mockRequestPermission], CameraView: (props: object) => { const { View } = require("react-native"); return <View {...props} testID="camera-view" />; } }));
jest.mock("../../components/ui", () => {
  const { View, Text, TextInput, Pressable } = require("react-native");
  const Container = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>;
  const TextValue = ({ children }: { children?: React.ReactNode }) => <Text>{children}</Text>;
  const Action = ({ label, onPress, disabled, loading }: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean }) => <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled || !!loading }} onPress={disabled || loading ? undefined : onPress}><Text>{label}</Text></Pressable>;
  const Field = ({ label, ...props }: { label: string }) => <TextInput {...props} accessibilityLabel={label} />;
  return { Page: Container, Card: Container, AppText: TextValue, Copy: TextValue, Title: TextValue, Action, Field, NumberField: Field, LoadingSkeleton: () => <Text>Loading content</Text>, EmptyState: ({ title }: { title: string }) => <Text>{title}</Text>, ErrorState: ({ message }: { message: string }) => <Text>{message}</Text>, ErrorNote: ({ message }: { message?: string }) => message ? <Text>{message}</Text> : null, SelectField: ({ label, value, onValueChange }: { label: string; value: string; onValueChange: (value: string) => void }) => <TextInput accessibilityLabel={label} value={value} onChangeText={onValueChange} />, MetricRow: ({ label, value }: { label: string; value: string }) => <Text>{label}: {value}</Text>, ConfirmDialog: ({ visible, title, onConfirm, onCancel, confirmLabel }: { visible: boolean; title: string; onConfirm: () => void; onCancel: () => void; confirmLabel: string }) => visible ? <View><Text>{title}</Text><Action label={confirmLabel} onPress={onConfirm} /><Action label="Cancel" onPress={onCancel} /></View> : null };
});
jest.mock("./search", () => {
  const original = jest.requireActual("./search"), { Pressable, Text } = require("react-native");
  return { __esModule: true, ...original, FoodPicker: ({ onSelect }: { onSelect: (food: typeof mockFood) => void }) => <Pressable onPress={() => onSelect(mockFood)}><Text>Choose measured ingredient</Text></Pressable> };
});
beforeEach(() => {
  jest.clearAllMocks(); mockPermission = { granted: false, canAskAgain: true }; mockKey = 0; mockPrevent = undefined;
  mockRequest.mockImplementation(async (method: string, path: string) => { if (method === "get" && path.includes("foods")) return mockFood; if (method === "patch") return mockMeal; return mockFood; });
});
test("custom-food submits known zero and unknown blank separately, then navigates", async () => {
  await render(<CustomFoodScreen />);
  await fireEvent.changeText(screen.getByLabelText("Food name"), "Measured oats");
  await fireEvent.changeText(screen.getByLabelText("Protein per 100 g (g)"), "0");
  await fireEvent.press(screen.getByText("Save custom food"));
  await waitFor(() => expect(mockReplace).toHaveBeenCalled());
  const write = mockRequest.mock.calls.find(call => call[0] === "post");
  expect(write?.[1]).toBe("/api/v1/foods/custom"); expect(write?.[2].body).toMatchObject({ name: "Measured oats", protein_g: "0", fiber_g: null }); expect(write?.[2].idempotencyKey).toMatch(/10000000/);
});
test("an uncertain custom-food save locks the form and retries its original body and UUID", async () => {
  let attempts = 0; mockRequest.mockImplementation(async () => { if (++attempts === 1) throw new ApiError("Lost response", 0, "NETWORK_ERROR", null, true); return mockFood; });
  await render(<CustomFoodScreen />); await fireEvent.changeText(screen.getByLabelText("Food name"), "Measured oats"); await fireEvent.press(screen.getByText("Save custom food"));
  await screen.findByText("Retry original save safely"); expect(screen.getByLabelText("Food name").props.editable).toBe(false); expect(mockReplace).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText("Retry original save safely")); await waitFor(() => expect(mockReplace).toHaveBeenCalled());
  expect(mockRequest.mock.calls[1][2].body).toEqual(mockRequest.mock.calls[0][2].body); expect(mockRequest.mock.calls[1][2].idempotencyKey).toBe(mockRequest.mock.calls[0][2].idempotencyKey);
});
test("notes-only meal edits do not replace nutrient snapshot items", async () => {
  await render(<MealEditor original={mockMeal} />); await fireEvent.changeText(screen.getByLabelText("Notes"), "After training"); await fireEvent.press(screen.getByText("Save meal changes"));
  await waitFor(() => expect(mockReplace).toHaveBeenCalled()); const write = mockRequest.mock.calls.find(call => call[0] === "patch"); expect(write?.[2].body.notes).toBe("After training"); expect(write?.[2].body).not.toHaveProperty("items");
});
test("meal deletion requires confirmation and accepts a 204-style undefined success", async () => {
  await render(<MealEditor original={mockMeal} />); await fireEvent.press(screen.getByText("Delete meal")); expect(mockRequest.mock.calls.some(call => call[0] === "delete")).toBe(false);
  await fireEvent.press(screen.getAllByText("Delete meal")[1]); await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/nutrition")); expect(mockRequest.mock.calls.some(call => call[0] === "delete")).toBe(true);
});
test("recipe builder selects a real catalog ingredient and preserves its measured quantity", async () => {
  mockRequest.mockImplementation(async (method: string, path: string) => path === "/api/v1/recipes" ? { id: mealId, food: mockFood } : { food_id: foodId, quantity_g: "25.125", ...nutrient });
  await render(<RecipeCreateScreen />); await fireEvent.changeText(screen.getByLabelText("Recipe name"), "Measured recipe"); await fireEvent.changeText(screen.getByLabelText("Final cooked yield (g)"), "150"); await fireEvent.press(screen.getByText("Add ingredient")); await fireEvent.press(screen.getByText("Choose measured ingredient")); await fireEvent.changeText(screen.getByLabelText("Ingredient 1 grams"), "25.125"); await fireEvent.press(screen.getByText("Save measured recipe"));
  await waitFor(() => expect(mockReplace).toHaveBeenCalled()); const write = mockRequest.mock.calls.find(call => call[0] === "post"); expect(write?.[2].body.ingredients).toEqual([{ food_id: foodId, quantity_g: "25.125" }]);
});
test("search debounces input before requesting provider-specific pages", async () => {
  jest.useFakeTimers(); mockRequest.mockResolvedValue({ items: [mockFood], provider_status: { local: "ok" }, page: 1, page_size: 20 });
  try { await render(<FoodSearchScreen />); await fireEvent.changeText(screen.getByLabelText("Search foods"), "o"); await fireEvent.changeText(screen.getByLabelText("Search foods"), "oats"); expect(mockRequest).not.toHaveBeenCalled(); await act(async () => { jest.advanceTimersByTime(350); }); expect(mockRequest).toHaveBeenCalledTimes(1); expect(mockRequest.mock.calls[0][2].query.q).toBe("oats"); await fireEvent.changeText(screen.getByLabelText("Food source"), "local"); await waitFor(() => expect(mockRequest.mock.calls.at(-1)?.[2].query.source).toBe("local")); } finally { jest.useRealTimers(); }
});
test("manual barcode lookup works when camera access is denied", async () => {
  await render(<BarcodeScreen />); await fireEvent.changeText(screen.getByLabelText("Barcode digits"), "0012345678901"); await fireEvent.press(screen.getByText("Look up barcode")); await waitFor(() => expect(mockReplace).toHaveBeenCalled()); expect(mockRequestPermission).not.toHaveBeenCalled(); expect(mockRequest.mock.calls[0][2].params.barcode).toBe("0012345678901"); expect(screen.queryByTestId("camera-view")).toBeNull();
});
test("scanner latches repeated barcode events into one lookup", async () => {
  mockPermission = { granted: true, canAskAgain: true }; let resolve: (food: unknown) => void = () => {}; mockRequest.mockImplementation(() => new Promise(done => { resolve = done; }));
  await render(<BarcodeScreen />); await fireEvent.press(screen.getByText("Start barcode scanner")); const camera = screen.getByTestId("camera-view"); await act(async () => { camera.props.onBarcodeScanned({ data: "0012345678901", type: "ean13" }); camera.props.onBarcodeScanned({ data: "0012345678901", type: "ean13" }); }); expect(mockRequest).toHaveBeenCalledTimes(1); await act(async () => resolve(mockFood)); expect(mockReplace).toHaveBeenCalledTimes(1);
});

test("camera mount failure leaves manual lookup available without uploading an image", async () => {
  mockPermission = { granted: true, canAskAgain: true };
  await render(<BarcodeScreen />);
  await fireEvent.press(screen.getByText("Start barcode scanner"));
  await act(async () => screen.getByTestId("camera-view").props.onMountError());
  expect(screen.queryByTestId("camera-view")).toBeNull();
  expect(screen.getByText(/Manual barcode lookup remains available/)).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText("Barcode digits"), "0012345678901");
  await fireEvent.press(screen.getByText("Look up barcode"));
  await waitFor(() => expect(mockReplace).toHaveBeenCalled());
  expect(mockRequest.mock.calls[0][0]).toBe("get");
  expect(mockRequest.mock.calls[0][2]).not.toHaveProperty("body");
});

test("leaving the scanner aborts a pending lookup and prevents late navigation", async () => {
  let resolve!: (food: unknown) => void;
  mockRequest.mockImplementation(() => new Promise(done => { resolve = done; }));
  const view = await render(<BarcodeScreen />);
  await fireEvent.changeText(screen.getByLabelText("Barcode digits"), "0012345678901");
  await fireEvent.press(screen.getByText("Look up barcode"));
  const signal = mockRequest.mock.calls[0][2].signal as AbortSignal;
  await view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(mockFood));
  expect(mockReplace).not.toHaveBeenCalled();
});

test("permanently denied camera offers settings and keeps the scanner unmounted", async () => {
  mockPermission = { granted: false, canAskAgain: false };
  await render(<BarcodeScreen />);
  expect(screen.getByText("Open camera settings")).toBeTruthy();
  expect(screen.queryByTestId("camera-view")).toBeNull();
  expect(mockRequestPermission).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Look up barcode" }).props.accessibilityState.disabled).toBe(false);
});

test("barcode provider failure ends loading without inventing a product", async () => {
  mockRequest.mockRejectedValue(new ApiError("Provider unavailable", 503, "PROVIDER_UNAVAILABLE"));
  await render(<BarcodeScreen />);
  await fireEvent.changeText(screen.getByLabelText("Barcode digits"), "0012345678901");
  await fireEvent.press(screen.getByText("Look up barcode"));
  await waitFor(() => expect(screen.getByRole("button", { name: "Look up barcode" }).props.accessibilityState.disabled).toBe(false));
  expect(screen.getByLabelText("Barcode digits").props.value).toBe("0012345678901");
  expect(mockReplace).not.toHaveBeenCalled();
  expect(screen.queryByText("Create custom food")).toBeNull();
});
test("hardware removal keeps the custom-food draft until explicit discard", async () => {
  const repeat = jest.fn(); await render(<CustomFoodScreen />); await fireEvent.changeText(screen.getByLabelText("Food name"), "Unsaved food");
  await act(async () => mockPrevent?.({ repeat })); expect(screen.getByText("Discard this draft?")).toBeTruthy(); await fireEvent.press(screen.getByText("Cancel")); expect(repeat).not.toHaveBeenCalled(); expect(screen.getByLabelText("Food name").props.value).toBe("Unsaved food");
  await act(async () => mockPrevent?.({ repeat })); await fireEvent.press(screen.getByText("Leave this screen")); expect(mockDisable).toHaveBeenCalled(); expect(repeat).toHaveBeenCalledTimes(1);
});
test("barcode not found offers custom-food fallback without inventing nutrition", async () => {
  mockRequest.mockRejectedValue(new ApiError("No item", 404, "FOOD_NOT_FOUND")); await render(<BarcodeScreen />); await fireEvent.changeText(screen.getByLabelText("Barcode digits"), "0012345678901"); await fireEvent.press(screen.getByText("Look up barcode"));
  await screen.findByText("Create custom food"); expect(mockReplace).not.toHaveBeenCalled(); expect(screen.getByText(/No supported gram-based food/)).toBeTruthy();
});
test("uncertain meal edits preserve the draft until an explicit positive server read", async () => {
  mockRequest.mockImplementation(async (method: string, path: string) => { if (method === "patch") throw new ApiError("Lost response", 0, "NETWORK_ERROR", null, true); return path.includes("meals") ? mockMeal : mockFood; });
  await render(<MealEditor original={mockMeal} />); await fireEvent.changeText(screen.getByLabelText("Notes"), "Unresolved note"); await fireEvent.press(screen.getByText("Save meal changes")); await screen.findByText("Reload saved meal to reconcile"); expect(screen.getByLabelText("Notes").props.value).toBe("Unresolved note");
  await fireEvent.press(screen.getByText("Reload saved meal to reconcile")); await waitFor(() => expect(screen.getByLabelText("Notes").props.value).toBe("")); expect(mockRequest.mock.calls.find(call => call[1].includes("meals") && call[0] === "get")?.[2].cacheMs).toBe(0); expect(mockReplace).not.toHaveBeenCalled();
});

test("a default-quantity meal save cannot lose its request identity while pending or uncertain", async () => {
  let rejectSave!: (error: unknown) => void;
  mockRequest.mockImplementation((method: string) => method === "post" ? new Promise((_resolve, reject) => { rejectSave = reject; }) : Promise.resolve(mockFood));
  await render(<FoodLog food={mockFood} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Log food" }).props.accessibilityState.disabled).toBe(false));
  await fireEvent.press(screen.getByText("Log food"));
  const repeat = jest.fn();
  expect(mockPrevent).toBeDefined();
  await act(async () => mockPrevent?.({ repeat }));
  expect(screen.getByText("Save in progress")).toBeTruthy();
  await fireEvent.press(screen.getByText("Keep this screen open"));
  expect(repeat).not.toHaveBeenCalled();
  await act(async () => rejectSave(new ApiError("Unknown save", 0, "TIMEOUT", null, true)));
  await act(async () => mockPrevent?.({ repeat }));
  expect(screen.getByText("Resolve the save first")).toBeTruthy();
  await fireEvent.press(screen.getByText("Keep this screen open"));
  expect(repeat).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
});

test.each(["meal", "recipe"])("dirty %s ingredient picker renders the active Back confirmation", async kind => {
  if (kind === "meal") {
    await render(<MealEditor original={mockMeal} />);
    await fireEvent.changeText(screen.getByLabelText("Notes"), "Retained note");
    await fireEvent.press(screen.getByText("Add another food"));
  } else {
    await render(<RecipeCreateScreen />);
    await fireEvent.changeText(screen.getByLabelText("Recipe name"), "Retained recipe");
    await fireEvent.press(screen.getByText("Add ingredient"));
  }
  const repeat = jest.fn();
  await act(async () => mockPrevent?.({ repeat }));
  expect(screen.getByText("Discard this draft?")).toBeTruthy();
  await fireEvent.press(screen.getByText("Cancel"));
  expect(repeat).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText(kind === "meal" ? "Return to meal" : "Return to recipe"));
  expect(screen.getByLabelText(kind === "meal" ? "Notes" : "Recipe name").props.value).toBe(kind === "meal" ? "Retained note" : "Retained recipe");
});

test("household shortcuts are absent without a food-specific measured conversion", async () => {
  await render(<FoodLog food={mockFood} />);
  expect(screen.queryByLabelText("Quick measured count")).toBeNull();
  expect(screen.getByLabelText("Grams")).toBeTruthy();
});

test.each([
  ["roti", "37.125", "0.25", "9.281"],
  ["roti", "37.125", "0.5", "18.563"],
  ["phulka", "29", "1", "29.000"],
  ["katori", "175", "1.5", "262.500"],
  ["katori", "122.5", "2", "245.000"],
  ["roti", "3.5E+1", "0.5", "17.500"],
])("%s uses its own recorded %sg conversion for count%s", async (label, grams, count, expected) => {
  const portionId = "10000000-0000-4000-8000-000000000003";
  mockRequest.mockImplementation(async (method: string, path: string, options: any) => method === "post" ? mockMeal : { food_id: foodId, quantity_g: options?.query?.quantity_g ?? "100", ...nutrient });
  await render(<FoodLog food={{ ...mockFood, portions: [{ id: portionId, label, grams }] }} />);
  await fireEvent.changeText(screen.getByLabelText("Quantity unit"), portionId);
  await fireEvent.changeText(screen.getByLabelText("Quick measured count"), count);
  await waitFor(() => expect(mockRequest.mock.calls.some(call => call[0] === "get" && call[2]?.query?.quantity_g === expected)).toBe(true));
  await fireEvent.press(screen.getByText("Log food"));
  await waitFor(() => expect(mockReplace).toHaveBeenCalled());
  const write = mockRequest.mock.calls.find(call => call[0] === "post");
  expect(write?.[2].body.items).toEqual([{ food_id: foodId, portion_id: portionId, portion_count: count }]);
  expect(write?.[2].body.items[0]).not.toHaveProperty("quantity_g");
});

test("switching to grams removes household shortcuts and uses the entered mass", async () => {
  const portionId = "10000000-0000-4000-8000-000000000003";
  mockRequest.mockImplementation(async (method: string, path: string, options: any) => method === "post" ? mockMeal : { food_id: foodId, quantity_g: options?.query?.quantity_g ?? "100", ...nutrient });
  await render(<FoodLog food={{ ...mockFood, portions: [{ id: portionId, label: "glass", grams: "200" }] }} />);
  await fireEvent.changeText(screen.getByLabelText("Quantity unit"), portionId);
  await fireEvent.changeText(screen.getByLabelText("Quick measured count"), "0.5");
  await fireEvent.changeText(screen.getByLabelText("Quantity unit"), "grams");
  expect(screen.queryByLabelText("Quick measured count")).toBeNull();
  await fireEvent.changeText(screen.getByLabelText("Grams"), "51.125");
  await waitFor(() => expect(mockRequest.mock.calls.some(call => call[2]?.query?.quantity_g === "51.125")).toBe(true));
  await fireEvent.press(screen.getByText("Log food"));
  await waitFor(() => expect(mockReplace).toHaveBeenCalled());
  expect(mockRequest.mock.calls.find(call => call[0] === "post")?.[2].body.items).toEqual([{ food_id: foodId, quantity_g: "51.125" }]);
});