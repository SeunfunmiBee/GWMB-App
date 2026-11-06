import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { AppStateView } from "@/components/states/AppStateView";
import { ScreenSkeleton } from "@/components/states/Skeleton";
import {
  loadInterviewQuestions,
  loadPracticeResponses,
  savePracticeResponse,
  type InterviewQuestion,
  type PracticeResponse,
} from "@/lib/career-readiness";
import { useAuth } from "@/providers/AuthProvider";
import { colors, fonts } from "@/theme";

const categoryShort: Record<string, string> = {
  "General Interview Questions": "General",
  "Behavioural Questions": "Behavioural",
  "Internship & Graduate Interviews": "Graduate",
  "Role-Specific Questions": "Role-specific",
  "Workplace Scenarios": "Workplace",
  "Career Motivation & Goals": "Motivation",
};

export default function PracticePage() {
  const params = useLocalSearchParams<{ question?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [responses, setResponses] = useState<PracticeResponse[]>([]);
  const [selected, setSelected] = useState<InterviewQuestion | null>(null);
  const [activeCategory, setActiveCategory] = useState("All");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const requestKey = `${user?.id ?? "guest"}:${params.question ?? ""}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const [questionResult, responseResult] = await Promise.all([
        loadInterviewQuestions(),
        user?.id
          ? loadPracticeResponses(user.id)
          : Promise.resolve({
              responses: [] as PracticeResponse[],
              error: null,
            }),
      ]);
      if (!mounted) return;
      setQuestions(questionResult.questions);
      setResponses(responseResult.responses);
      setSelected(
        params.question
          ? (questionResult.questions.find(
              (item) => item.id === params.question,
            ) ?? null)
          : null,
      );
      setLoadError(
        questionResult.error?.message ?? responseResult.error?.message ?? null,
      );
      setLoadedKey(requestKey);
    })();
    return () => {
      mounted = false;
    };
  }, [params.question, requestKey, user?.id]);
  const loading = loadedKey !== requestKey;
  const categories = useMemo(
    () => ["All", ...new Set(questions.map((item) => item.category))],
    [questions],
  );
  const visible =
    activeCategory === "All"
      ? questions
      : questions.filter((item) => item.category === activeCategory);
  const savedIds = new Set(responses.map((item) => item.question_id));
  const progress = Math.round(
    (responses.length / Math.max(questions.length, 1)) * 100,
  );
  function open(item: InterviewQuestion) {
    setSelected(item);
    setDraft(
      responses.find((response) => response.question_id === item.id)
        ?.response_text ?? "",
    );
  }
  async function save() {
    if (!user) {
      router.push("/sign-in");
      return;
    }
    if (!selected || !draft.trim())
      return Alert.alert("Draft your response first");
    setSaving(true);
    const result = await savePracticeResponse(
      user.id,
      selected.id,
      draft.trim(),
    );
    setSaving(false);
    if (result.error) Alert.alert("Could not save", result.error.message);
    else {
      setResponses((current) => [
        result.data as PracticeResponse,
        ...current.filter((item) => item.question_id !== selected.id),
      ]);
      Alert.alert(
        "Response saved",
        "You can return and refine it at any time.",
      );
    }
  }

  if (loading)
    return (
      <Screen>
        <PageHeader title="Interview Practice" eyebrow="Career Readiness" />
        <ScreenSkeleton rows={5} />
      </Screen>
    );
  if (loadError)
    return (
      <Screen>
        <PageHeader title="Interview Practice" eyebrow="Career Readiness" />
        <AppStateView
          kind="error"
          title="Interview questions could not load"
          copy={loadError}
        />
      </Screen>
    );
  if (!questions.length)
    return (
      <Screen>
        <PageHeader title="Interview Practice" eyebrow="Career Readiness" />
        <AppStateView
          kind="empty"
          title="No practice questions are published yet"
          copy="Questions created and activated by Admin will appear here."
        />
      </Screen>
    );

  if (selected)
    return (
      <Screen>
        <PageHeader title="Practice" eyebrow="Career Readiness" />
        <Pressable onPress={() => setSelected(null)} style={styles.back}>
          <Ionicons name="arrow-back" size={17} color={colors.ink} />
          <Text style={styles.backText}>All interview questions</Text>
        </Pressable>
        <LinearGradient
          colors={["#1C1521", "#4A2440", "#A81455"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.questionHero}
        >
          <View style={styles.questionHeroTop}>
            <Text style={styles.questionIndex}>
              {String(
                questions.findIndex((item) => item.id === selected.id) + 1,
              ).padStart(2, "0")}
            </Text>
            <View style={styles.questionTag}>
              <Text style={styles.questionTagText}>
                {categoryShort[selected.category] ?? selected.category}
              </Text>
            </View>
          </View>
          <Text style={styles.question}>{selected.question}</Text>
          <Text style={styles.questionPrompt}>
            Build a clear answer in your own words, then strengthen the
            evidence.
          </Text>
        </LinearGradient>
        <View style={styles.guide}>
          <View style={styles.guideIcon}>
            <Ionicons name="bulb-outline" size={20} color="#8A5700" />
          </View>
          <View style={styles.guideCopy}>
            <Text style={styles.guideTitle}>
              What a strong answer should demonstrate
            </Text>
            <Text style={styles.guideText}>{selected.guidance}</Text>
          </View>
        </View>
        {selected.framework ? (
          <View style={styles.framework}>
            <Text style={styles.frameworkLabel}>USE THIS FRAMEWORK</Text>
            <Text style={styles.frameworkText}>{selected.framework}</Text>
            <Ionicons
              name="git-branch-outline"
              size={20}
              color={colors.pinkDeep}
            />
          </View>
        ) : null}
        <View style={styles.editorHead}>
          <View>
            <Text style={styles.editorLabel}>YOUR DRAFT</Text>
            <Text style={styles.editorHint}>
              Speak naturally. Keep the evidence specific.
            </Text>
          </View>
          <View style={styles.wordPill}>
            <Text style={styles.wordPillText}>
              {draft.trim() ? draft.trim().split(/\s+/).length : 0} words
            </Text>
          </View>
        </View>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          multiline
          placeholder="Start with your main point, add a real example, then finish with the result or what you learned."
          placeholderTextColor="#918A8E"
          style={styles.editor}
        />
        <View style={styles.editorTip}>
          <Ionicons name="time-outline" size={15} color={colors.muted} />
          <Text style={styles.editorTipText}>
            Aim for a focused 60–90 second response.
          </Text>
        </View>
        <Pressable
          onPress={() => void save()}
          disabled={saving}
          style={styles.save}
        >
          <Text style={styles.saveText}>
            {saving ? "Saving…" : "Save my response"}
          </Text>
          <Ionicons
            name={
              savedIds.has(selected.id)
                ? "checkmark-circle"
                : "bookmark-outline"
            }
            size={20}
            color="white"
          />
        </Pressable>
      </Screen>
    );

  return (
    <Screen>
      <PageHeader title="Interview Practice" eyebrow="Career Readiness" />
      <LinearGradient
        colors={["#F4B957", "#F0C77E", "#F7DFAF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.intro}
      >
        <View style={styles.introOrb} />
        <View style={styles.introIcon}>
          <Ionicons name="chatbubbles-outline" size={23} color="#7E2F09" />
        </View>
        <Text style={styles.introEyebrow}>PRACTICE IN YOUR OWN TIME</Text>
        <Text style={styles.introTitle}>
          Strong interviews start before the interview.
        </Text>
        <Text style={styles.introCopy}>
          Draft your answer, save it and come back whenever you want to make it
          sharper.
        </Text>
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.progressValue}>
            {responses.length}/{questions.length} saved
          </Text>
        </View>
      </LinearGradient>
      <View style={styles.categoryHead}>
        <View>
          <Text style={styles.sectionEyebrow}>QUESTION LIBRARY</Text>
          <Text style={styles.sectionTitle}>Choose what to practise</Text>
        </View>
        <Text style={styles.total}>{visible.length} questions</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {categories.map((category) => (
          <Pressable
            key={category}
            onPress={() => setActiveCategory(category)}
            style={[
              styles.filter,
              activeCategory === category && styles.filterOn,
            ]}
          >
            <Text
              style={[
                styles.filterText,
                activeCategory === category && styles.filterTextOn,
              ]}
            >
              {category === "All"
                ? "All questions"
                : (categoryShort[category] ?? category)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.list}>
        {visible.map((item) => {
          const saved = savedIds.has(item.id);
          return (
            <Pressable
              key={item.id}
              onPress={() => open(item)}
              style={({ pressed }) => [
                styles.row,
                saved && styles.rowSaved,
                pressed && styles.rowPressed,
              ]}
            >
              <View style={[styles.number, saved && styles.numberSaved]}>
                {saved ? (
                  <Ionicons name="checkmark" size={17} color="white" />
                ) : (
                  <Text style={styles.numberText}>
                    {String(
                      questions.findIndex(
                        (question) => question.id === item.id,
                      ) + 1,
                    ).padStart(2, "0")}
                  </Text>
                )}
              </View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowCategory}>
                  {categoryShort[item.category]?.toUpperCase()}
                </Text>
                <Text style={styles.rowQuestion}>{item.question}</Text>
                <Text style={[styles.rowMeta, saved && styles.rowMetaSaved]}>
                  {saved ? "Saved · Continue refining" : "Draft a response"}
                </Text>
              </View>
              <View style={styles.rowArrow}>
                <Ionicons name="arrow-forward" size={17} color={colors.ink} />
              </View>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    minHeight: 270,
    borderRadius: 27,
    padding: 21,
    overflow: "hidden",
    marginBottom: 25,
  },
  introOrb: {
    position: "absolute",
    width: 190,
    height: 190,
    borderRadius: 95,
    borderWidth: 34,
    borderColor: "rgba(255,255,255,.22)",
    right: -52,
    top: -55,
  },
  introIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,.68)",
    alignItems: "center",
    justifyContent: "center",
  },
  introEyebrow: {
    fontFamily: fonts.bodyBold,
    fontSize: 8,
    letterSpacing: 1.2,
    color: "#7E2F09",
    marginTop: 25,
  },
  introTitle: {
    fontFamily: fonts.heading,
    fontSize: 27,
    lineHeight: 32,
    color: colors.ink,
    letterSpacing: -0.8,
    marginTop: 8,
    maxWidth: 350,
  },
  introCopy: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10.5,
    lineHeight: 16,
    color: "#5F3A20",
    marginTop: 7,
    maxWidth: 335,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 20,
  },
  progressTrack: {
    flex: 1,
    height: 5,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,.55)",
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 4, backgroundColor: "#7E2F09" },
  progressValue: { fontFamily: fonts.bodyBold, fontSize: 8, color: "#6D3A18" },
  categoryHead: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  sectionEyebrow: {
    fontFamily: fonts.bodyBold,
    fontSize: 7.5,
    letterSpacing: 1.1,
    color: colors.pinkDeep,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 21,
    color: colors.ink,
    letterSpacing: -0.5,
    marginTop: 4,
  },
  total: {
    fontFamily: fonts.bodyBold,
    fontSize: 8,
    color: colors.muted,
    marginBottom: 4,
  },
  filters: { gap: 7, paddingTop: 12, paddingRight: 18, paddingBottom: 15 },
  filter: {
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DCD5D9",
    backgroundColor: "white",
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  filterOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  filterText: { fontFamily: fonts.bodyBold, fontSize: 8, color: colors.muted },
  filterTextOn: { color: "white" },
  list: { gap: 8 },
  row: {
    minHeight: 102,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#DED8DC",
    backgroundColor: "white",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  rowSaved: { borderColor: "#B8DED1", backgroundColor: "#F7FCFA" },
  rowPressed: { opacity: 0.8, transform: [{ scale: 0.995 }] },
  number: {
    width: 47,
    height: 55,
    borderRadius: 15,
    backgroundColor: "#F9E7EF",
    alignItems: "center",
    justifyContent: "center",
  },
  numberSaved: { backgroundColor: "#087553" },
  numberText: {
    fontFamily: fonts.headingBold,
    fontSize: 10,
    color: colors.pinkDeep,
  },
  rowCopy: { flex: 1, minWidth: 0 },
  rowCategory: {
    fontFamily: fonts.bodyBold,
    fontSize: 6.5,
    letterSpacing: 0.7,
    color: colors.pinkDeep,
    marginBottom: 4,
  },
  rowQuestion: {
    fontFamily: fonts.headingBold,
    fontSize: 12.5,
    lineHeight: 16,
    color: colors.ink,
  },
  rowMeta: {
    fontFamily: fonts.bodyMedium,
    fontSize: 8.5,
    color: colors.muted,
    marginTop: 5,
  },
  rowMetaSaved: { color: "#087553" },
  rowArrow: {
    width: 35,
    height: 35,
    borderRadius: 12,
    backgroundColor: "#F2EFF1",
    alignItems: "center",
    justifyContent: "center",
  },
  back: {
    height: 39,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 9,
  },
  backText: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.ink },
  questionHero: {
    minHeight: 237,
    borderRadius: 27,
    padding: 21,
    overflow: "hidden",
  },
  questionHeroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  questionIndex: { fontFamily: fonts.heading, fontSize: 21, color: "#F3A9CA" },
  questionTag: {
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,.12)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  questionTagText: {
    fontFamily: fonts.bodyBold,
    fontSize: 7.5,
    color: "white",
  },
  question: {
    fontFamily: fonts.heading,
    fontSize: 28,
    lineHeight: 34,
    color: "white",
    marginTop: 27,
    maxWidth: 380,
  },
  questionPrompt: {
    fontFamily: fonts.body,
    fontSize: 10.5,
    lineHeight: 16,
    color: "#E0D4DB",
    marginTop: 9,
    maxWidth: 350,
  },
  guide: {
    borderRadius: 19,
    backgroundColor: "#FFF1D6",
    borderWidth: 1,
    borderColor: "#ECD5AA",
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    marginTop: 12,
  },
  guideIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
  },
  guideCopy: { flex: 1 },
  guideTitle: {
    fontFamily: fonts.headingBold,
    fontSize: 10.5,
    color: colors.ink,
  },
  guideText: {
    fontFamily: fonts.body,
    fontSize: 9,
    lineHeight: 14,
    color: colors.muted,
    marginTop: 4,
  },
  framework: {
    minHeight: 60,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#DDD7DB",
    backgroundColor: "white",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  frameworkLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 7,
    letterSpacing: 0.8,
    color: colors.pinkDeep,
  },
  frameworkText: {
    flex: 1,
    fontFamily: fonts.headingBold,
    fontSize: 9.5,
    color: colors.ink,
    paddingHorizontal: 10,
  },
  editorHead: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 21,
    marginBottom: 8,
  },
  editorLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 8,
    letterSpacing: 1,
    color: colors.pinkDeep,
  },
  editorHint: {
    fontFamily: fonts.body,
    fontSize: 8.5,
    color: colors.muted,
    marginTop: 3,
  },
  wordPill: {
    borderRadius: 10,
    backgroundColor: "#F0EDEF",
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  wordPillText: {
    fontFamily: fonts.bodyBold,
    fontSize: 7.5,
    color: colors.muted,
  },
  editor: {
    minHeight: 205,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#D9D3D7",
    backgroundColor: "white",
    padding: 15,
    textAlignVertical: "top",
    fontFamily: fonts.bodyMedium,
    fontSize: 11.5,
    lineHeight: 18,
    color: colors.ink,
    outlineStyle: "none",
  } as never,
  editorTip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  editorTipText: { fontFamily: fonts.body, fontSize: 8.5, color: colors.muted },
  save: {
    height: 56,
    borderRadius: 17,
    backgroundColor: colors.pinkDeep,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 15,
  },
  saveText: { fontFamily: fonts.headingBold, fontSize: 11, color: "white" },
});
