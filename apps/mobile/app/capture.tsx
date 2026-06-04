import { useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import { useRouter } from "expo-router";
import type { AnalyzePlateResponse } from "@coplate/shared";
import { analyzePlate, logMeal } from "../lib/api";
import { theme } from "../lib/theme";

type Phase = "camera" | "analyzing" | "review" | "logging";

export default function Capture() {
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>("camera");
  const [result, setResult] = useState<AnalyzePlateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function capture() {
    if (!cameraRef.current) return;
    try {
      setError(null);
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6 });
      if (!photo) return;
      setPhase("analyzing");
      // Downscale before base64 to keep payload small and the API fast.
      const manipulated = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      const res = await analyzePlate(manipulated.base64!);
      setResult(res);
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      setPhase("camera");
    }
  }

  async function confirm() {
    if (!result) return;
    try {
      setPhase("logging");
      await logMeal({ items: result.analysis.items, total: result.analysis.total });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not log meal");
      setPhase("review");
    }
  }

  if (phase === "camera") {
    return (
      <View style={styles.container}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />
        {error && <Text style={styles.errorOverlay}>{error}</Text>}
        <View style={styles.shutterWrap}>
          <Pressable style={styles.shutter} onPress={capture}>
            <View style={styles.shutterInner} />
          </Pressable>
          <Text style={styles.hint}>Frame your whole plate</Text>
        </View>
      </View>
    );
  }

  if (phase === "analyzing") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.color.accent} />
        <Text style={styles.analyzing}>Reading your plate…</Text>
      </View>
    );
  }

  // review / logging
  const a = result!.analysis;
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.reviewContent}>
      <Text style={styles.reviewTitle}>Here's what I see</Text>

      <View style={styles.totalCard}>
        <Text style={styles.totalCals}>{Math.round(a.total.calories)}</Text>
        <Text style={styles.totalLabel}>calories</Text>
        <View style={styles.macroPills}>
          <Pill label="P" value={a.total.protein_g} color={theme.color.protein} />
          <Pill label="C" value={a.total.carbs_g} color={theme.color.carbs} />
          <Pill label="F" value={a.total.fat_g} color={theme.color.fat} />
        </View>
      </View>

      {a.items.map((item, i) => (
        <View key={i} style={styles.itemRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.itemPortion}>
              {item.portion_estimate} · {Math.round(item.confidence * 100)}% sure
            </Text>
          </View>
          <Text style={styles.itemCals}>{Math.round(item.macros.calories)}</Text>
        </View>
      ))}

      {a.notes ? <Text style={styles.notes}>{a.notes}</Text> : null}

      <Text style={styles.meta}>
        {result!.meta.model} · {result!.meta.latency_ms}ms
        {result!.meta.grounded ? " · grounded ✓" : ""}
        {result!.meta.retries > 0 ? ` · ${result!.meta.retries} retr${result!.meta.retries === 1 ? "y" : "ies"}` : ""}
      </Text>

      {error && <Text style={styles.errorOverlay}>{error}</Text>}

      <Pressable style={styles.primaryBtn} disabled={phase === "logging"} onPress={confirm}>
        {phase === "logging" ? (
          <ActivityIndicator color="#1A140C" />
        ) : (
          <Text style={styles.primaryBtnText}>Log this meal</Text>
        )}
      </Pressable>
      <Pressable style={styles.secondaryBtn} onPress={() => { setResult(null); setPhase("camera"); }}>
        <Text style={styles.secondaryBtnText}>Retake</Text>
      </Pressable>
    </ScrollView>
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
  analyzing: { color: theme.color.text, marginTop: theme.space(4), fontSize: 16, fontFamily: theme.font.display },
  permText: { color: theme.color.text, fontSize: 16, textAlign: "center", marginBottom: theme.space(6) },
  reviewContent: { padding: theme.space(5), paddingBottom: theme.space(12) },
  reviewTitle: { color: theme.color.text, fontSize: 24, fontFamily: theme.font.display, marginBottom: theme.space(5) },
  totalCard: {
    backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, padding: theme.space(6),
    alignItems: "center", borderWidth: 1, borderColor: theme.color.border, marginBottom: theme.space(5),
  },
  totalCals: { color: theme.color.accent, fontSize: 56, fontFamily: theme.font.display, fontWeight: "700" },
  totalLabel: { color: theme.color.textMuted, fontSize: 14 },
  macroPills: { flexDirection: "row", gap: theme.space(3), marginTop: theme.space(4) },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: theme.radius.pill, paddingHorizontal: theme.space(3), paddingVertical: theme.space(2) },
  pillLabel: { fontWeight: "700", fontSize: 13 },
  pillValue: { color: theme.color.text, fontSize: 13 },
  itemRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: theme.space(3),
    borderBottomWidth: 1, borderBottomColor: theme.color.border,
  },
  itemName: { color: theme.color.text, fontSize: 16, fontWeight: "500" },
  itemPortion: { color: theme.color.textMuted, fontSize: 13, marginTop: 2 },
  itemCals: { color: theme.color.text, fontSize: 16, fontWeight: "600" },
  notes: { color: theme.color.textMuted, fontStyle: "italic", marginTop: theme.space(4) },
  meta: { color: theme.color.textMuted, fontSize: 12, marginTop: theme.space(4), textAlign: "center" },
  primaryBtn: { backgroundColor: theme.color.accent, borderRadius: theme.radius.pill, paddingVertical: theme.space(5), alignItems: "center", marginTop: theme.space(6) },
  primaryBtnText: { color: "#1A140C", fontSize: 17, fontWeight: "700" },
  secondaryBtn: { paddingVertical: theme.space(4), alignItems: "center", marginTop: theme.space(2) },
  secondaryBtnText: { color: theme.color.textMuted, fontSize: 15 },
  errorOverlay: { color: theme.color.danger, textAlign: "center", marginTop: theme.space(3) },
});
