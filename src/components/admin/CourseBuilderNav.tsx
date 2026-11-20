import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "@/theme";

const sections = [
  ["overview", "Overview"],
  ["curriculum", "Curriculum"],
  ["lecturer", "Lecturer"],
  ["pathway", "Partner pathway"],
  ["publishing", "Publishing"],
] as const;

export type CourseBuilderSection = (typeof sections)[number][0];

export function CourseBuilderNav({
  section,
  onSelect,
  title,
  status,
  lessonCount,
}: {
  section: CourseBuilderSection;
  onSelect: (section: CourseBuilderSection) => void;
  title: string;
  status: string;
  lessonCount: number;
}) {
  return (
    <View style={styles.workspace}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.meta}>
        {status.replace(/-/g, " ")} · {lessonCount}{" "}
        {lessonCount === 1 ? "lesson" : "lessons"} · Changes saved with the
        button below
      </Text>
      <View style={styles.sections} accessibilityRole="tablist">
        {sections.map(([id, label]) => (
          <Pressable
            key={id}
            accessibilityRole="tab"
            accessibilityState={{ selected: section === id }}
            onPress={() => onSelect(id)}
            style={[styles.tab, section === id && styles.active]}
          >
            <Text style={[styles.label, section === id && styles.activeLabel]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  workspace: {
    paddingTop: 8,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  title: { fontFamily: fonts.headingBold, fontSize: 23, color: colors.ink },
  meta: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
    marginTop: 7,
    textTransform: "none",
  },
  sections: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 20 },
  tab: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: "center",
    borderRadius: 10,
  },
  active: { backgroundColor: colors.ink },
  label: { fontFamily: fonts.bodyBold, color: colors.muted, fontSize: 13 },
  activeLabel: { color: "white" },
});
