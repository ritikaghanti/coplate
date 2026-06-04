import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { VENUE_PRESETS, type PizzaModePlan } from "@coplate/shared";
import { planPizzaMode } from "../lib/api";
import { theme } from "../lib/theme";

type Phase = "setup" | "loading" | "result";

export default function PizzaMode() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("setup");
  const [venue, setVenue] = useState(VENUE_PRESETS[0]);
  const [calories, setCalories] = useState(String(VENUE_PRESETS[0].calories));
  const [time, setTime] = useState("8:00 PM");
  const [plan, setPlan] = useState<PizzaModePlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pickVenue(v: (typeof VENUE_PRESETS)[number]) {
    setVenue(v);
    setCalories(String(v.calories));
  }

  async function makePlan() {
    const cals = parseInt(calories, 10);
    if (!cals || cals < 100) {
      setError("Enter a calorie estimate of at least 100");
      return;
    }
    try {
      setError(null);
      setPhase("loading");
      const result = await planPizzaMode({
        venueLabel: venue.label,
        eventCalories: cals,
        eventTime: time,
      });
      setPlan(result);
      setPhase("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build plan");
      setPhase("setup");
    }
  }

  if (phase === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.color.accent} />
        <Text style={styles.loadingText}>Reshaping your day…</Text>
      </View>
    );
  }

  if (phase === "result" && plan) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.resultKicker}>YOUR DAY, REPLANNED</Text>
        <Text style={styles.resultTitle}>
          {plan.venueLabel} at {plan.eventTime}
        </Text>

        {/* The before/after split that makes the idea click visually */}
        <View style={styles.splitCard}>
          <View style={styles.splitRow}>
            <Text style={styles.splitLabel}>Daily budget</Text>
            <Text style={styles.splitValue}>{plan.dailyBudget.calories}</Text>
          </View>
          <View style={styles.splitRow}>
            <Text style={[styles.splitLabel, { color: theme.color.accent }]}>
              Reserved for tonight
            </Text>
            <Text style={[styles.splitValue, { color: theme.color.accent }]}>
              −{plan.eventReserve.calories}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.splitRow}>
            <Text style={styles.daytimeLabel}>Daytime budget</Text>
            <Text style={styles.daytimeValue}>{plan.daytimeBudget.calories}</Text>
          </View>
        </View>

        <View style={styles.guidanceCard}>
          <Text style={styles.guidanceText}>{plan.guidance}</Text>
        </View>

        <Pressable style={styles.primaryBtn} onPress={() => router.back()}>
          <Text style={styles.primaryBtnText}>Got it — I'm set</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={() => setPhase("setup")}>
          <Text style={styles.secondaryBtnText}>Adjust</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // setup
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.lead}>
        Heading out tonight? Tell me where, and I'll set aside calories so you can
        enjoy it — guilt-free.
      </Text>

      <Text style={styles.fieldLabel}>Where are you going?</Text>
      <View style={styles.venueGrid}>
        {VENUE_PRESETS.map((v) => (
          <Pressable
            key={v.id}
            style={[styles.venueChip, venue.id === v.id && styles.venueChipActive]}
            onPress={() => pickVenue(v)}
          >
            <Text style={[styles.venueChipText, venue.id === v.id && styles.venueChipTextActive]}>
              {v.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.fieldLabel}>Calories to reserve</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={calories}
          onChangeText={setCalories}
          keyboardType="number-pad"
          placeholderTextColor={theme.color.textMuted}
        />
        <Text style={styles.inputSuffix}>cal</Text>
      </View>
      <Text style={styles.hint}>Estimated for {venue.label.toLowerCase()} — edit if you like.</Text>

      <Text style={styles.fieldLabel}>What time?</Text>
      <TextInput
        style={[styles.input, { marginBottom: theme.space(2) }]}
        value={time}
        onChangeText={setTime}
        placeholder="8:00 PM"
        placeholderTextColor={theme.color.textMuted}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.primaryBtn} onPress={makePlan}>
        <Text style={styles.primaryBtnText}>Plan my day</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.bg },
  center: { flex: 1, backgroundColor: theme.color.bg, alignItems: "center", justifyContent: "center" },
  content: { padding: theme.space(5), paddingBottom: theme.space(12) },
  loadingText: { color: theme.color.text, marginTop: theme.space(4), fontFamily: theme.font.display, fontSize: 16 },
  lead: { color: theme.color.textMuted, fontSize: 16, lineHeight: 23, marginBottom: theme.space(6) },
  fieldLabel: { color: theme.color.text, fontSize: 15, fontWeight: "600", marginBottom: theme.space(3), marginTop: theme.space(4) },
  venueGrid: { flexDirection: "row", flexWrap: "wrap", gap: theme.space(2) },
  venueChip: {
    paddingHorizontal: theme.space(4), paddingVertical: theme.space(3),
    borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
  },
  venueChipActive: { backgroundColor: theme.color.accentSoft, borderColor: theme.color.accent },
  venueChipText: { color: theme.color.textMuted, fontSize: 14 },
  venueChipTextActive: { color: theme.color.accent, fontWeight: "600" },
  inputRow: { flexDirection: "row", alignItems: "center", gap: theme.space(2) },
  input: {
    flex: 1, backgroundColor: theme.color.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.color.border, color: theme.color.text,
    fontSize: 18, padding: theme.space(4),
  },
  inputSuffix: { color: theme.color.textMuted, fontSize: 16 },
  hint: { color: theme.color.textMuted, fontSize: 13, marginTop: theme.space(2), fontStyle: "italic" },
  error: { color: theme.color.danger, marginTop: theme.space(4) },
  primaryBtn: {
    backgroundColor: theme.color.accent, borderRadius: theme.radius.pill,
    paddingVertical: theme.space(5), alignItems: "center", marginTop: theme.space(6),
  },
  primaryBtnText: { color: "#1A140C", fontSize: 17, fontWeight: "700" },
  secondaryBtn: { paddingVertical: theme.space(4), alignItems: "center", marginTop: theme.space(2) },
  secondaryBtnText: { color: theme.color.textMuted, fontSize: 15 },
  resultKicker: { color: theme.color.accent, letterSpacing: 2, fontSize: 12, marginBottom: theme.space(2) },
  resultTitle: { color: theme.color.text, fontSize: 26, fontFamily: theme.font.display, marginBottom: theme.space(6) },
  splitCard: {
    backgroundColor: theme.color.surface, borderRadius: theme.radius.lg,
    padding: theme.space(5), borderWidth: 1, borderColor: theme.color.border,
  },
  splitRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: theme.space(2) },
  splitLabel: { color: theme.color.textMuted, fontSize: 15 },
  splitValue: { color: theme.color.text, fontSize: 18, fontWeight: "600" },
  divider: { height: 1, backgroundColor: theme.color.border, marginVertical: theme.space(2) },
  daytimeLabel: { color: theme.color.text, fontSize: 16, fontWeight: "700" },
  daytimeValue: { color: theme.color.text, fontSize: 32, fontFamily: theme.font.display, fontWeight: "700" },
  guidanceCard: {
    backgroundColor: theme.color.accentSoft, borderRadius: theme.radius.lg,
    padding: theme.space(5), marginTop: theme.space(5),
    borderWidth: 1, borderColor: theme.color.accent + "44",
  },
  guidanceText: { color: theme.color.text, fontSize: 16, lineHeight: 24 },
});
