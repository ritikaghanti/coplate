import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { DailySummary } from "@coplate/shared";
import { getTodaySummary, clearReservation } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { MacroBar } from "../components/MacroBar";
import { theme } from "../lib/theme";

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setSummary(await getTodaySummary());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setRefreshing(false);
    }
  }, []);

  async function clearRes() {
    try {
      await clearReservation();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not clear");
    }
  }

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const hasReservation = !!summary?.reservation;
  // When a reservation exists, the hero tracks the daytime budget (what you
  // need to hit before the event); otherwise the full daily remaining.
  const remainingCals = hasReservation
    ? summary!.daytimeRemaining.calories
    : summary?.remaining.calories ?? 0;
  const over = remainingCals < 0;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={theme.color.accent}
          />
        }
      >
        <View style={styles.topRow}>
          <Text style={styles.kicker}>TODAY</Text>
          <View style={{ flexDirection: "row", gap: theme.space(4) }}>
            <Pressable onPress={() => router.push("/profile")}>
              <Text style={styles.profileLink}>Profile</Text>
            </Pressable>
            <Pressable onPress={signOut}>
              <Text style={styles.signOutLink}>Sign out</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.hero}>
          <Text style={[styles.bigNumber, over && { color: theme.color.danger }]}>
            {Math.abs(remainingCals)}
          </Text>
          <Text style={styles.bigLabel}>
            {over
              ? hasReservation ? "over your daytime budget" : "calories over budget"
              : hasReservation ? "daytime calories left before tonight" : "calories remaining"}
          </Text>
        </View>

        {hasReservation && summary && (
          <View style={styles.reservationCard}>
            <View style={styles.reservationHeader}>
              <Text style={styles.reservationTitle}>
                🍽️ {summary.reservation!.venueLabel} · {summary.reservation!.eventTime}
              </Text>
              <Pressable onPress={clearRes}>
                <Text style={styles.clearLink}>Clear</Text>
              </Pressable>
            </View>
            <View style={styles.resRow}>
              <Text style={styles.resLabel}>Daily budget</Text>
              <Text style={styles.resValue}>{summary.budget.calories}</Text>
            </View>
            <View style={styles.resRow}>
              <Text style={[styles.resLabel, { color: theme.color.accent }]}>Reserved for tonight</Text>
              <Text style={[styles.resValue, { color: theme.color.accent }]}>−{summary.reservation!.reserve.calories}</Text>
            </View>
            <View style={styles.resRow}>
              <Text style={styles.resLabel}>Eaten today (daytime)</Text>
              <Text style={styles.resValue}>−{summary.daytimeConsumed.calories}</Text>
            </View>
            {summary.eventConsumed.calories > 0 && (
              <View style={styles.resRow}>
                <Text style={styles.resLabel}>Event meal logged</Text>
                <Text style={styles.resValue}>{summary.eventConsumed.calories} / {summary.reservation!.reserve.calories}</Text>
              </View>
            )}
          </View>
        )}

        {summary && (
          <View style={styles.card}>
            <MacroBar
              label="Calories"
              value={hasReservation ? summary.daytimeConsumed.calories : summary.consumed.calories}
              max={hasReservation ? summary.daytimeBudget.calories : summary.budget.calories}
              unit=""
              color={theme.color.accent}
            />
            <MacroBar label="Protein" value={summary.consumed.protein_g} max={summary.budget.protein_g} color={theme.color.protein} />
            <MacroBar label="Carbs" value={summary.consumed.carbs_g} max={summary.budget.carbs_g} color={theme.color.carbs} />
            <MacroBar label="Fat" value={summary.consumed.fat_g} max={summary.budget.fat_g} color={theme.color.fat} />
          </View>
        )}

        <Text style={styles.sectionTitle}>Meals</Text>
        {summary?.meals.length === 0 && (
          <Text style={styles.empty}>Nothing logged yet. Snap your first plate below.</Text>
        )}
        {summary?.meals.map((m) => (
          <View key={m.id} style={styles.mealRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.mealItems} numberOfLines={1}>
                {m.items.map((i) => i.name).join(", ")}
              </Text>
              <Text style={styles.mealTime}>
                {new Date(m.logged_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </Text>
            </View>
            <Text style={styles.mealCals}>{Math.round(m.total.calories)} kcal</Text>
          </View>
        ))}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      <View style={[styles.actionBar, { bottom: insets.bottom + theme.space(6) }]}>
        <Pressable style={styles.pizzaBtn} onPress={() => router.push("/save-room")}>
          <Text style={styles.pizzaBtnText}>🍽️ Save Room</Text>
        </Pressable>
        <Pressable style={styles.snap} onPress={() => router.push("/capture")}>
          <Text style={styles.snapText}>Snap a plate</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.bg },
  content: { padding: theme.space(5), paddingBottom: theme.space(28) },
  kicker: { color: theme.color.textMuted, letterSpacing: 3, fontSize: 12, marginBottom: theme.space(2) },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  profileLink: { color: theme.color.accent, fontSize: 14, fontWeight: "600" },
  signOutLink: { color: theme.color.textMuted, fontSize: 14 },
  hero: { alignItems: "center", marginVertical: theme.space(6) },
  bigNumber: { color: theme.color.text, fontSize: 72, fontFamily: theme.font.display, fontWeight: "600" },
  bigLabel: { color: theme.color.textMuted, fontSize: 15, marginTop: theme.space(1) },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.space(5),
    borderWidth: 1,
    borderColor: theme.color.border,
    marginBottom: theme.space(6),
  },
  reservationCard: {
    backgroundColor: theme.color.accentSoft,
    borderRadius: theme.radius.lg,
    padding: theme.space(5),
    borderWidth: 1,
    borderColor: theme.color.accent + "55",
    marginBottom: theme.space(4),
  },
  reservationHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: theme.space(3) },
  reservationTitle: { color: theme.color.text, fontSize: 15, fontWeight: "700", flex: 1 },
  clearLink: { color: theme.color.textMuted, fontSize: 13 },
  resRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: theme.space(1) },
  resLabel: { color: theme.color.textMuted, fontSize: 14 },
  resValue: { color: theme.color.text, fontSize: 14, fontWeight: "600" },
  sectionTitle: { color: theme.color.text, fontSize: 20, fontFamily: theme.font.display, marginBottom: theme.space(3) },
  empty: { color: theme.color.textMuted, fontStyle: "italic" },
  mealRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    padding: theme.space(4),
    marginBottom: theme.space(2),
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  mealItems: { color: theme.color.text, fontSize: 15, fontWeight: "500" },
  mealTime: { color: theme.color.textMuted, fontSize: 12, marginTop: 2 },
  mealCals: { color: theme.color.accent, fontWeight: "700" },
  error: { color: theme.color.danger, marginTop: theme.space(4) },
  actionBar: {
    position: "absolute",
    left: theme.space(5),
    right: theme.space(5),
    gap: theme.space(3),
  },
  pizzaBtn: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.pill,
    paddingVertical: theme.space(4),
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.color.accent,
  },
  pizzaBtnText: { color: theme.color.accent, fontSize: 16, fontWeight: "600" },
  snap: {
    backgroundColor: theme.color.accent,
    borderRadius: theme.radius.pill,
    paddingVertical: theme.space(5),
    alignItems: "center",
    shadowColor: theme.color.accent,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  snapText: { color: "#1A140C", fontSize: 17, fontWeight: "700", letterSpacing: 0.3 },
});
