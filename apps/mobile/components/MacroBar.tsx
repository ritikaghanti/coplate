import { View, Text, StyleSheet } from "react-native";
import { theme } from "../lib/theme";

interface Props {
  label: string;
  value: number;
  max: number;
  unit?: string;
  color: string;
}

export function MacroBar({ label, value, max, unit = "g", color }: Props) {
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>
          {Math.round(value)}
          <Text style={styles.max}> / {Math.round(max)}{unit}</Text>
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: theme.space(4) },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: theme.space(2) },
  label: { color: theme.color.textMuted, fontSize: 13, letterSpacing: 0.5, textTransform: "uppercase" },
  value: { color: theme.color.text, fontSize: 15, fontWeight: "600" },
  max: { color: theme.color.textMuted, fontWeight: "400" },
  track: { height: 8, borderRadius: theme.radius.pill, backgroundColor: theme.color.surfaceAlt, overflow: "hidden" },
  fill: { height: "100%", borderRadius: theme.radius.pill },
});
