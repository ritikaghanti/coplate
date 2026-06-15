import { useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, TextInput } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import type { AnalyzePlateResponse, BarcodeProduct, FoodItem } from "@coplate/shared";
import { analyzePlate, logMeal, lookupBarcode } from "../lib/api";
import { theme } from "../lib/theme";

type Phase = "camera" | "analyzing" | "review" | "barcodeReview" | "logging";

// An editable plate item. Macros are strings so the user can clear/retype.
// `grams` is how much the user says they ate; `basis100` holds the macros per
// 100g (derived from the AI's estimate + its portion guess) so changing grams
// can rescale the displayed macros.
type EditItem = {
  name: string;
  grams: string;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  basis100: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
};

// Barcode symbologies worth listening for on packaged grocery products.
const BARCODE_TYPES = ["ean13", "ean8", "upc_a", "upc_e"] as const;

// Pull a gram figure out of the model's free-text portion estimate, e.g.
// "approx 150g" -> 150, "1 medium bowl (~200 g)" -> 200. Returns undefined
// when there's no gram number to find (then we default to 100g).
function parseGrams(portion: string): number | undefined {
  const m = portion.match(/(\d+(?:\.\d+)?)\s*g\b/i);
  if (m) {
    const n = parseFloat(m[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

export default function Capture() {
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>("camera");
  const [result, setResult] = useState<AnalyzePlateResponse | null>(null);
  // Editable copy of the AI's detected items, so the user can correct macros,
  // rename, remove hallucinated items, or add ones the model missed.
  const [items, setItems] = useState<EditItem[]>([]);
  const [product, setProduct] = useState<BarcodeProduct | null>(null);
  const [grams, setGrams] = useState("100");
  // Editable macro fields shown for the grams entered (per-serving), as strings
  // so the user can clear/retype freely. Pre-filled from the scan, corrected
  // against the label when the database is wrong.
  const [edit, setEdit] = useState({ calories: "", protein_g: "", carbs_g: "", fat_g: "" });
  // True once the user has manually edited a macro: after that we stop
  // auto-overwriting their numbers when they change the grams.
  const editedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [isEventMeal, setIsEventMeal] = useState(false);
  // Guards against the camera firing onBarcodeScanned repeatedly while we
  // navigate away from the live preview.
  const scanLock = useRef(false);

  if (!permission) return <View style={styles.container} />;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permText}>Coplate needs your camera to read your plate.</Text>
        <Pressable style={styles.primaryBtn} onPress={requestPermission}>
          <Text style={styles.primaryBtnText}>Grant camera access</Text>
        </Pressable>
      </View>
    );
  }

  // Shared: run a JPEG (by uri) through downscale → base64 → vision pipeline.
  async function analyzeUri(uri: string) {
    setPhase("analyzing");
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1024 } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    const res = await analyzePlate(manipulated.base64!);
    setResult(res);
    // Seed editable items from the AI's estimate. We pull a gram figure out of
    // the model's portion text ("approx 150g") when present, else default to
    // 100g, and derive a per-100g basis so the grams field can rescale macros.
    setItems(
      res.analysis.items.map((it) => {
        const g = parseGrams(it.portion_estimate) ?? 100;
        const f = g > 0 ? 100 / g : 1; // estimate is for `g` grams -> per 100g
        return {
          name: it.name,
          grams: String(Math.round(g)),
          calories: String(Math.round(it.macros.calories)),
          protein_g: String(Math.round(it.macros.protein_g * 10) / 10),
          carbs_g: String(Math.round(it.macros.carbs_g * 10) / 10),
          fat_g: String(Math.round(it.macros.fat_g * 10) / 10),
          basis100: {
            calories: it.macros.calories * f,
            protein_g: it.macros.protein_g * f,
            carbs_g: it.macros.carbs_g * f,
            fat_g: it.macros.fat_g * f,
          },
        };
      })
    );
    setPhase("review");
  }

  async function capture() {
    if (!cameraRef.current) return;
    try {
      setError(null);
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6 });
      if (!photo) return;
      await analyzeUri(photo.uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      setPhase("camera");
    }
  }

  async function pickFromGallery() {
    try {
      setError(null);
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError("Photo library access is needed to pick a meal photo.");
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      await analyzeUri(picked.assets[0].uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open gallery");
      setPhase("camera");
    }
  }

  // Auto barcode detection on the live preview: if a code is read, resolve it
  // against Open Food Facts; otherwise the user can still tap the shutter.
  async function onBarcodeScanned(scan: BarcodeScanningResult) {
    if (scanLock.current || phase !== "camera") return;
    scanLock.current = true;
    try {
      setError(null);
      setPhase("analyzing");
      const res = await lookupBarcode(scan.data);
      setProduct(res.product);
      setGrams("100");
      // Pre-fill the editable macro fields with the scan's values at 100g.
      editedRef.current = false;
      fillEditFromPer100g(res.product.per100g, 100);
      setPhase("barcodeReview");
    } catch (e) {
      // Most common: product not found / no nutrition. Fall back to photo flow.
      setError(e instanceof Error ? e.message : "Barcode lookup failed");
      setPhase("camera");
      scanLock.current = false;
    }
  }

  // Parse a single editable item into a validated FoodItem (numbers coerced).
  function toFoodItem(e: EditItem): FoodItem {
    const macros = {
      calories: Math.max(0, parseFloat(e.calories) || 0),
      protein_g: Math.max(0, parseFloat(e.protein_g) || 0),
      carbs_g: Math.max(0, parseFloat(e.carbs_g) || 0),
      fat_g: Math.max(0, parseFloat(e.fat_g) || 0),
    };
    const g = Math.max(0, parseFloat(e.grams) || 0);
    return { name: e.name.trim(), portion_estimate: g ? `${Math.round(g)} g` : "edited", confidence: 1, macros };
  }

  // Edit a macro or the name: macros become the truth for the current grams,
  // so we re-derive that item's per-100g basis from the new value.
  function updateItem(idx: number, key: "name" | "calories" | "protein_g" | "carbs_g" | "fat_g", value: string) {
    setItems((list) =>
      list.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, [key]: value };
        if (key !== "name") {
          const g = Math.max(0, parseFloat(next.grams) || 0);
          if (g > 0) {
            const macroKey = key as "calories" | "protein_g" | "carbs_g" | "fat_g";
            const v = Math.max(0, parseFloat(value) || 0);
            next.basis100 = { ...it.basis100, [macroKey]: (v / g) * 100 };
          }
        }
        return next;
      })
    );
  }

  // Change grams: rescale all four macros from the item's per-100g basis.
  function updateGrams(idx: number, value: string) {
    setItems((list) =>
      list.map((it, i) => {
        if (i !== idx) return it;
        const g = Math.max(0, parseFloat(value) || 0);
        const f = g / 100;
        return {
          ...it,
          grams: value,
          calories: String(Math.round(it.basis100.calories * f)),
          protein_g: String(Math.round(it.basis100.protein_g * f * 10) / 10),
          carbs_g: String(Math.round(it.basis100.carbs_g * f * 10) / 10),
          fat_g: String(Math.round(it.basis100.fat_g * f * 10) / 10),
        };
      })
    );
  }

  function removeItem(idx: number) {
    setItems((list) => list.filter((_, i) => i !== idx));
  }

  function addItem() {
    setItems((list) => [
      ...list,
      { name: "", grams: "100", calories: "", protein_g: "", carbs_g: "", fat_g: "", basis100: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 } },
    ]);
  }

  async function confirm() {
    if (!result) return;
    // Build validated items + a recomputed total from the user's edits.
    const foodItems = items.map(toFoodItem);
    const total = foodItems.reduce(
      (acc, it) => ({
        calories: acc.calories + it.macros.calories,
        protein_g: acc.protein_g + it.macros.protein_g,
        carbs_g: acc.carbs_g + it.macros.carbs_g,
        fat_g: acc.fat_g + it.macros.fat_g,
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    );
    try {
      setPhase("logging");
      await logMeal({ items: foodItems, total, is_event_meal: isEventMeal });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not log meal");
      setPhase("review");
    }
  }

  // Set the editable fields to per-100g macros scaled to `g` grams, rounded
  // for display. Called on scan and when grams changes (until user edits).
  function fillEditFromPer100g(per100g: BarcodeProduct["per100g"], g: number) {
    const f = g / 100;
    setEdit({
      calories: String(Math.round(per100g.calories * f)),
      protein_g: String(Math.round(per100g.protein_g * f * 10) / 10),
      carbs_g: String(Math.round(per100g.carbs_g * f * 10) / 10),
      fat_g: String(Math.round(per100g.fat_g * f * 10) / 10),
    });
  }

  // When grams changes BEFORE any manual edit, rescale the shown macros from
  // the original scan. After a manual edit we leave the user's numbers alone.
  function onGramsChange(next: string) {
    setGrams(next);
    if (!editedRef.current && product) {
      const g = Math.max(0, parseFloat(next) || 0);
      fillEditFromPer100g(product.per100g, g);
    }
  }

  function onEditMacro(key: keyof typeof edit, value: string) {
    editedRef.current = true;
    setEdit((e) => ({ ...e, [key]: value }));
  }

  async function confirmBarcode() {
    if (!product) return;
    const g = Math.max(1, parseFloat(grams) || 0);
    // The edited fields ARE the macros for `g` grams — log them directly.
    const macros = {
      calories: Math.max(0, parseFloat(edit.calories) || 0),
      protein_g: Math.max(0, parseFloat(edit.protein_g) || 0),
      carbs_g: Math.max(0, parseFloat(edit.carbs_g) || 0),
      fat_g: Math.max(0, parseFloat(edit.fat_g) || 0),
    };
    const item: FoodItem = {
      name: product.brand ? `${product.name} (${product.brand})` : product.name,
      portion_estimate: `${Math.round(g)} g`,
      confidence: 0.95, // packaged-label data — high confidence vs. a vision guess
      macros,
    };
    try {
      setPhase("logging");
      await logMeal({ items: [item], total: macros, is_event_meal: isEventMeal });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not log meal");
      setPhase("barcodeReview");
    }
  }

  function resetToCamera() {
    setResult(null);
    setItems([]);
    setProduct(null);
    setError(null);
    scanLock.current = false;
    setPhase("camera");
  }

  if (phase === "camera") {
    return (
      <View style={styles.container}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
          onBarcodeScanned={onBarcodeScanned}
        />
        {error && <Text style={styles.errorOverlay}>{error}</Text>}
        <View style={styles.shutterWrap}>
          <Pressable style={styles.shutter} onPress={capture}>
            <View style={styles.shutterInner} />
          </Pressable>
          <Text style={styles.hint}>Frame your plate, or point at a barcode</Text>
          <Pressable style={styles.galleryBtn} onPress={pickFromGallery}>
            <Text style={styles.galleryBtnText}>Choose from gallery</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (phase === "analyzing") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.color.accent} />
        <Text style={styles.analyzing}>Reading…</Text>
      </View>
    );
  }

  if (phase === "barcodeReview" || (phase === "logging" && product)) {
    const g = Math.max(0, parseFloat(grams) || 0);
    const cals = Math.max(0, parseFloat(edit.calories) || 0);
    const p = Math.max(0, parseFloat(edit.protein_g) || 0);
    const c = Math.max(0, parseFloat(edit.carbs_g) || 0);
    const fat = Math.max(0, parseFloat(edit.fat_g) || 0);
    // Atwater check: calories should roughly equal 4P + 4C + 9F. Flag big gaps
    // as a likely data-quality problem (common with crowd-sourced entries).
    const implied = p * 4 + c * 4 + fat * 9;
    const mismatch = cals > 0 && implied > 0 && Math.abs(implied - cals) / cals > 0.2;

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.reviewContent}>
        <Text style={styles.reviewTitle}>Scanned product</Text>

        <View style={styles.totalCard}>
          <Text style={styles.productName}>{product!.name}</Text>
          {product!.brand ? <Text style={styles.productBrand}>{product!.brand}</Text> : null}
          <Text style={styles.totalCals}>{Math.round(cals)}</Text>
          <Text style={styles.totalLabel}>calories in {g ? Math.round(g) : 0} g</Text>
        </View>

        <Text style={styles.adjustLabel}>How much did you eat? (grams)</Text>
        <TextInput
          style={styles.gramsInput}
          value={grams}
          onChangeText={onGramsChange}
          keyboardType="numeric"
          placeholder="100"
          placeholderTextColor={theme.color.textMuted}
        />

        <Text style={[styles.adjustLabel, { marginTop: theme.space(5) }]}>
          Nutrition for {g ? Math.round(g) : 0} g — fix to match your label
        </Text>
        <View style={styles.macroEditGrid}>
          <MacroField label="Calories" value={edit.calories} onChange={(v) => onEditMacro("calories", v)} />
          <MacroField label="Protein (g)" value={edit.protein_g} onChange={(v) => onEditMacro("protein_g", v)} color={theme.color.protein} />
          <MacroField label="Carbs (g)" value={edit.carbs_g} onChange={(v) => onEditMacro("carbs_g", v)} color={theme.color.carbs} />
          <MacroField label="Fat (g)" value={edit.fat_g} onChange={(v) => onEditMacro("fat_g", v)} color={theme.color.fat} />
        </View>

        <Text style={styles.per100Note}>
          Pre-filled from Open Food Facts — community data, so double-check it against your label.
          {product!.serving_size ? ` Label serving: ${product!.serving_size}.` : ""}
        </Text>
        {mismatch && (
          <Text style={styles.mismatchNote}>
            ⚠︎ These numbers don't quite add up ({Math.round(implied)} kcal implied by the macros vs.{" "}
            {Math.round(cals)} entered). Worth checking against your label.
          </Text>
        )}

        {error && <Text style={styles.errorOverlay}>{error}</Text>}

        <Pressable
          style={[styles.eventToggle, isEventMeal && styles.eventToggleActive]}
          onPress={() => setIsEventMeal((v) => !v)}
        >
          <Text style={[styles.eventToggleText, isEventMeal && styles.eventToggleTextActive]}>
            {isEventMeal ? "🍽️ This is my event meal" : "Mark as event meal"}
          </Text>
        </Pressable>

        <Pressable style={styles.primaryBtn} disabled={phase === "logging"} onPress={confirmBarcode}>
          {phase === "logging" ? (
            <ActivityIndicator color="#1A140C" />
          ) : (
            <Text style={styles.primaryBtnText}>Log this meal</Text>
          )}
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={resetToCamera}>
          <Text style={styles.secondaryBtnText}>Scan again</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // review / logging (photo path)
  const liveTotal = items.reduce(
    (acc, it) => ({
      calories: acc.calories + (parseFloat(it.calories) || 0),
      protein_g: acc.protein_g + (parseFloat(it.protein_g) || 0),
      carbs_g: acc.carbs_g + (parseFloat(it.carbs_g) || 0),
      fat_g: acc.fat_g + (parseFloat(it.fat_g) || 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );
  const impliedCals = liveTotal.protein_g * 4 + liveTotal.carbs_g * 4 + liveTotal.fat_g * 9;
  const totalMismatch =
    liveTotal.calories > 0 && impliedCals > 0 && Math.abs(impliedCals - liveTotal.calories) / liveTotal.calories > 0.2;
  const hasBlankName = items.some((it) => it.name.trim().length === 0);
  const canLog = items.length > 0 && !hasBlankName;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.reviewContent}>
      <Text style={styles.reviewTitle}>Here's what I see</Text>

      <View style={styles.totalCard}>
        <Text style={styles.totalCals}>{Math.round(liveTotal.calories)}</Text>
        <Text style={styles.totalLabel}>calories</Text>
        <View style={styles.macroPills}>
          <Pill label="P" value={liveTotal.protein_g} color={theme.color.protein} />
          <Pill label="C" value={liveTotal.carbs_g} color={theme.color.carbs} />
          <Pill label="F" value={liveTotal.fat_g} color={theme.color.fat} />
        </View>
      </View>

      <Text style={styles.adjustLabel}>Items — edit, remove, or add what's missing</Text>

      {items.map((it, i) => (
        <View key={i} style={styles.editItemCard}>
          <View style={styles.editItemHeader}>
            <TextInput
              style={styles.itemNameInput}
              value={it.name}
              onChangeText={(v) => updateItem(i, "name", v)}
              placeholder="Item name"
              placeholderTextColor={theme.color.textMuted}
            />
            <Pressable hitSlop={10} onPress={() => removeItem(i)}>
              <Text style={styles.removeLink}>Remove</Text>
            </Pressable>
          </View>
          <View style={styles.gramsRow}>
            <Text style={styles.gramsRowLabel}>Amount eaten (g)</Text>
            <TextInput
              style={styles.gramsRowInput}
              value={it.grams}
              onChangeText={(v) => updateGrams(i, v)}
              keyboardType="numeric"
              placeholder="100"
              placeholderTextColor={theme.color.textMuted}
            />
          </View>
          <View style={styles.macroEditGrid}>
            <MacroField label="Calories" value={it.calories} onChange={(v) => updateItem(i, "calories", v)} />
            <MacroField label="Protein (g)" value={it.protein_g} onChange={(v) => updateItem(i, "protein_g", v)} color={theme.color.protein} />
            <MacroField label="Carbs (g)" value={it.carbs_g} onChange={(v) => updateItem(i, "carbs_g", v)} color={theme.color.carbs} />
            <MacroField label="Fat (g)" value={it.fat_g} onChange={(v) => updateItem(i, "fat_g", v)} color={theme.color.fat} />
          </View>
        </View>
      ))}

      <Pressable style={styles.addItemBtn} onPress={addItem}>
        <Text style={styles.addItemBtnText}>＋ Add item</Text>
      </Pressable>

      {result?.analysis.notes ? <Text style={styles.notes}>{result.analysis.notes}</Text> : null}

      {totalMismatch && (
        <Text style={styles.mismatchNote}>
          ⚠︎ The totals don't quite add up ({Math.round(impliedCals)} kcal implied by the macros vs.{" "}
          {Math.round(liveTotal.calories)}). Worth a second look.
        </Text>
      )}
      {hasBlankName && <Text style={styles.mismatchNote}>Give every item a name before logging.</Text>}
      {items.length === 0 && <Text style={styles.mismatchNote}>Add at least one item to log this meal.</Text>}

      {error && <Text style={styles.errorOverlay}>{error}</Text>}

      <Pressable
        style={[styles.eventToggle, isEventMeal && styles.eventToggleActive]}
        onPress={() => setIsEventMeal((v) => !v)}
      >
        <Text style={[styles.eventToggleText, isEventMeal && styles.eventToggleTextActive]}>
          {isEventMeal ? "🍽️ This is my event meal" : "Mark as event meal"}
        </Text>
      </Pressable>

      <Pressable style={[styles.primaryBtn, !canLog && styles.primaryBtnDisabled]} disabled={phase === "logging" || !canLog} onPress={confirm}>
        {phase === "logging" ? (
          <ActivityIndicator color="#1A140C" />
        ) : (
          <Text style={styles.primaryBtnText}>Log this meal</Text>
        )}
      </Pressable>
      <Pressable style={styles.secondaryBtn} onPress={resetToCamera}>
        <Text style={styles.secondaryBtnText}>Retake</Text>
      </Pressable>
    </ScrollView>
  );
}

function MacroField({ label, value, onChange, color }: { label: string; value: string; onChange: (v: string) => void; color?: string }) {
  return (
    <View style={styles.macroField}>
      <Text style={[styles.macroFieldLabel, color ? { color } : null]}>{label}</Text>
      <TextInput
        style={styles.macroFieldInput}
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        placeholder="0"
        placeholderTextColor={theme.color.textMuted}
      />
    </View>
  );
}

function Pill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <Text style={[styles.pillLabel, { color }]}>{label}</Text>
      <Text style={styles.pillValue}>{Math.round(value)}g</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.bg },
  center: { flex: 1, backgroundColor: theme.color.bg, alignItems: "center", justifyContent: "center", padding: theme.space(6) },
  camera: { flex: 1 },
  shutterWrap: { position: "absolute", bottom: theme.space(12), left: 0, right: 0, alignItems: "center" },
  shutter: {
    width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: theme.color.text,
    alignItems: "center", justifyContent: "center", backgroundColor: "#0006",
  },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: theme.color.accent },
  hint: { color: theme.color.text, marginTop: theme.space(3), fontSize: 14, textShadowColor: "#000", textShadowRadius: 4 },
  galleryBtn: { marginTop: theme.space(4), paddingHorizontal: theme.space(5), paddingVertical: theme.space(3), borderRadius: theme.radius.pill, backgroundColor: "#0008", borderWidth: 1, borderColor: theme.color.text + "55" },
  galleryBtnText: { color: theme.color.text, fontSize: 14, fontWeight: "600" },
  analyzing: { color: theme.color.text, marginTop: theme.space(4), fontSize: 16, fontFamily: theme.font.display },
  permText: { color: theme.color.text, fontSize: 16, textAlign: "center", marginBottom: theme.space(6) },
  reviewContent: { padding: theme.space(5), paddingBottom: theme.space(12) },
  reviewTitle: { color: theme.color.text, fontSize: 24, fontFamily: theme.font.display, marginBottom: theme.space(5) },
  totalCard: {
    backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, padding: theme.space(6),
    alignItems: "center", borderWidth: 1, borderColor: theme.color.border, marginBottom: theme.space(5),
  },
  productName: { color: theme.color.text, fontSize: 18, fontWeight: "700", textAlign: "center" },
  productBrand: { color: theme.color.textMuted, fontSize: 14, marginBottom: theme.space(2) },
  totalCals: { color: theme.color.accent, fontSize: 56, fontFamily: theme.font.display, fontWeight: "700" },
  totalLabel: { color: theme.color.textMuted, fontSize: 14 },
  macroPills: { flexDirection: "row", gap: theme.space(3), marginTop: theme.space(4) },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: theme.radius.pill, paddingHorizontal: theme.space(3), paddingVertical: theme.space(2) },
  pillLabel: { fontWeight: "700", fontSize: 13 },
  pillValue: { color: theme.color.text, fontSize: 13 },
  adjustLabel: { color: theme.color.text, fontSize: 15, fontWeight: "600", marginBottom: theme.space(2) },
  gramsInput: {
    backgroundColor: theme.color.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border,
    color: theme.color.text, fontSize: 20, paddingHorizontal: theme.space(4), paddingVertical: theme.space(3), fontWeight: "600",
  },
  per100Note: { color: theme.color.textMuted, fontSize: 12, marginTop: theme.space(2) },
  mismatchNote: { color: theme.color.fat, fontSize: 13, marginTop: theme.space(2), lineHeight: 18 },
  macroEditGrid: { flexDirection: "row", flexWrap: "wrap", gap: theme.space(3), marginTop: theme.space(2) },
  macroField: { flexGrow: 1, flexBasis: "45%" },
  macroFieldLabel: { color: theme.color.textMuted, fontSize: 13, fontWeight: "600", marginBottom: theme.space(1) },
  macroFieldInput: {
    backgroundColor: theme.color.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border,
    color: theme.color.text, fontSize: 18, paddingHorizontal: theme.space(4), paddingVertical: theme.space(3), fontWeight: "600",
  },
  editItemCard: {
    backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.border,
    padding: theme.space(4), marginBottom: theme.space(3),
  },
  editItemHeader: { flexDirection: "row", alignItems: "center", gap: theme.space(3), marginBottom: theme.space(3) },
  gramsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: theme.space(3), gap: theme.space(3) },
  gramsRowLabel: { color: theme.color.text, fontSize: 14, fontWeight: "600" },
  gramsRowInput: {
    minWidth: 90, textAlign: "right", backgroundColor: theme.color.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.color.accent + "55", color: theme.color.text, fontSize: 18, fontWeight: "700",
    paddingHorizontal: theme.space(4), paddingVertical: theme.space(2),
  },
  itemNameInput: {
    flex: 1, color: theme.color.text, fontSize: 16, fontWeight: "600",
    borderBottomWidth: 1, borderBottomColor: theme.color.border, paddingVertical: theme.space(2),
  },
  removeLink: { color: theme.color.danger, fontSize: 14, fontWeight: "600" },
  addItemBtn: {
    borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.accent, borderStyle: "dashed",
    paddingVertical: theme.space(4), alignItems: "center", marginTop: theme.space(1),
  },
  addItemBtnText: { color: theme.color.accent, fontSize: 15, fontWeight: "600" },
  primaryBtnDisabled: { opacity: 0.4 },
  itemRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: theme.space(3),
    borderBottomWidth: 1, borderBottomColor: theme.color.border,
  },
  itemName: { color: theme.color.text, fontSize: 16, fontWeight: "500" },
  itemPortion: { color: theme.color.textMuted, fontSize: 13, marginTop: 2 },
  itemCals: { color: theme.color.text, fontSize: 16, fontWeight: "600" },
  notes: { color: theme.color.textMuted, fontStyle: "italic", marginTop: theme.space(4) },
  primaryBtn: { backgroundColor: theme.color.accent, borderRadius: theme.radius.pill, paddingVertical: theme.space(5), alignItems: "center", marginTop: theme.space(6) },
  eventToggle: {
    borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.border,
    paddingVertical: theme.space(4), alignItems: "center", marginTop: theme.space(4),
    backgroundColor: theme.color.surface,
  },
  eventToggleActive: { borderColor: theme.color.accent, backgroundColor: theme.color.accentSoft },
  eventToggleText: { color: theme.color.textMuted, fontSize: 15, fontWeight: "600" },
  eventToggleTextActive: { color: theme.color.accent },
  primaryBtnText: { color: "#1A140C", fontSize: 17, fontWeight: "700" },
  secondaryBtn: { paddingVertical: theme.space(4), alignItems: "center", marginTop: theme.space(2) },
  secondaryBtnText: { color: theme.color.textMuted, fontSize: 15 },
  errorOverlay: { color: theme.color.danger, textAlign: "center", marginTop: theme.space(3) },
});
