import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { type ContentItem } from "@/lib/admin-content";
import {
  loadCareerInventory,
  loadInterviewQuestions,
  loadPracticeResponses,
  loadReviewSubmissions,
  loadSavedCareerResources,
  toggleSavedCareerResource,
  type CareerReviewSubmission,
  type InterviewQuestion,
  type PracticeResponse,
} from "@/lib/career-readiness";
import {
  loadEventRegistrations,
  registerForEvent,
  type EventRegistration,
} from "@/lib/event-store";
import { useAuth } from "@/providers/AuthProvider";
import { colors, fonts } from "@/theme";
import { AppStateView } from "@/components/states/AppStateView";
import { ScreenSkeleton } from "@/components/states/Skeleton";

const statusLabels: Record<string, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  selected: "Selected for live clinic",
  reviewed: "Reviewed",
  not_selected: "Not selected for this session",
};
const meta = (item: ContentItem) => item.metadata ?? {};
const speaker = (item: ContentItem) =>
  (meta(item).speaker && typeof meta(item).speaker === "object"
    ? meta(item).speaker
    : ({} as Record<string, unknown>)) as Record<string, unknown>;
const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("en-NG", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Date to be announced";
const resourceUrl = (item: ContentItem) =>
  String(meta(item).url || item.route || "");

function Heading({
  eyebrow,
  title,
  copy,
}: {
  eyebrow: string;
  title: string;
  copy?: string;
}) {
  return (
    <View style={styles.heading}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      {copy ? <Text style={styles.copy}>{copy}</Text> : null}
    </View>
  );
}

export function CareerReadinessHub() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const [upcoming, setUpcoming] = useState<ContentItem[]>([]);
  const [replays, setReplays] = useState<ContentItem[]>([]);
  const [resources, setResources] = useState<ContentItem[]>([]);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [submissions, setSubmissions] = useState<CareerReviewSubmission[]>([]);
  const [responses, setResponses] = useState<PracticeResponse[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      setLoading(true);
      setError(null);
      setQuestionsError(null);
      void (async () => {
        const [inventory, questionResult] = await Promise.all([
          loadCareerInventory(),
          loadInterviewQuestions(),
        ]);
        const userData = user?.id
          ? await Promise.all([
              loadEventRegistrations(user.id),
              loadReviewSubmissions(user.id),
              loadPracticeResponses(user.id),
              loadSavedCareerResources(user.id),
            ])
          : null;
        if (!mounted) return;
        setUpcoming(inventory.upcoming);
        setReplays(inventory.replays);
        setResources(inventory.resources);
        setQuestions(questionResult.questions);
        setQuestionsError(questionResult.error?.message ?? null);
        if (userData) {
          setRegistrations(userData[0].registrations);
          setSubmissions(userData[1].submissions);
          setResponses(userData[2].responses);
          setSavedIds(userData[3].ids);
        }
        if (inventory.error) setError(inventory.error.message);
        setLoading(false);
      })();
      return () => {
        mounted = false;
      };
    }, [user]),
  );
  const registeredIds = useMemo(() => {
    const ids = new Set(
      registrations
        .filter(
          (item) =>
            item.status === "registered" || item.status === "waitlisted",
        )
        .map((item) => item.event_id),
    );
    upcoming.forEach((item) => {
      if (ids.has(item.slug)) ids.add(item.id);
    });
    return ids;
  }, [registrations, upcoming]);
  const myUpcoming = upcoming.filter((item) => registeredIds.has(item.id));
  async function saveSeat(item: ContentItem) {
    if (!user) {
      router.push("/sign-in");
      return;
    }
    if (registeredIds.has(item.id)) return;
    setSaving(item.id);
    const capacity = Number(meta(item).capacity || 0);
    const result = await registerForEvent({
      userId: user.id,
      eventId: item.id,
      eventTitle: item.title,
      eventStartsAt: item.starts_at ?? undefined,
      eventRoute: `/event/${item.slug}`,
      fullName:
        profile?.full_name ||
        String(user.user_metadata?.full_name || "GWMB Learner"),
      email: user.email ?? "",
      learningGoal: "Career readiness",
      status:
        capacity > 0 &&
        registrations.filter(
          (entry) =>
            entry.event_id === item.id && entry.status === "registered",
        ).length >= capacity
          ? "waitlisted"
          : "registered",
    });
    setSaving(null);
    if (result.ok) {
      setRegistrations((current) => [
        result.registration,
        ...current.filter((entry) => entry.event_id !== item.id),
      ]);
      Alert.alert(
        result.registration.status === "waitlisted"
          ? "Added to waitlist"
          : "Seat saved",
        "This session now appears in My Career Readiness and your reminders.",
      );
    }
  }
  async function bookmark(item: ContentItem) {
    if (!user) {
      router.push("/sign-in");
      return;
    }
    const saved = savedIds.includes(item.id);
    setSavedIds((current) =>
      saved ? current.filter((id) => id !== item.id) : [...current, item.id],
    );
    const result = await toggleSavedCareerResource(user.id, item.id, saved);
    if (result.error)
      setSavedIds((current) =>
        saved ? [...current, item.id] : current.filter((id) => id !== item.id),
      );
  }
  if (loading) return <ScreenSkeleton rows={6} />;
  if (error)
    return (
      <AppStateView
        kind="error"
        compact
        title="Career Readiness could not load"
        copy={error}
      />
    );
  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <View style={styles.heroOrb} />
        <View style={styles.heroIcon}>
          <Ionicons name="briefcase-outline" size={24} color="#7E2F09" />
        </View>
        <Text style={styles.heroEyebrow}>GWMB CAREER READINESS</Text>
        <Text style={styles.heroTitle}>Get ready to be hired.</Text>
        <Text style={styles.heroCopy}>
          Practise interviews, strengthen your applications and learn directly
          from recruiters.
        </Text>
        <View style={styles.heroActions}>
          <Pressable
            onPress={() => router.push("/career-readiness/review" as never)}
            style={styles.heroButton}
          >
            <Text style={styles.heroButtonText}>Get reviewed</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.ink} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/career-readiness/practice" as never)}
            style={styles.heroLink}
          >
            <Text style={styles.heroLinkText}>Start practising</Text>
          </Pressable>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.jumpRow}
      >
        {[
          ["calendar-outline", "Sessions"],
          ["document-text-outline", "Get reviewed"],
          ["chatbubbles-outline", "Practice"],
          ["library-outline", "Resources"],
          ["play-circle-outline", "Replays"],
          ["person-circle-outline", "My activity"],
        ].map(([icon, label], index) => (
          <Pressable
            key={label}
            onPress={() =>
              index === 1
                ? router.push("/career-readiness/review" as never)
                : index === 2
                  ? router.push("/career-readiness/practice" as never)
                  : index === 5
                    ? router.push("/career-readiness/my" as never)
                    : undefined
            }
            style={styles.jump}
          >
            <Ionicons
              name={icon as keyof typeof Ionicons.glyphMap}
              size={18}
              color={colors.ink}
            />
            <Text style={styles.jumpText}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Heading
        eyebrow="UPCOMING SESSIONS"
        title="Learn with hiring professionals"
        copy="Live CV clinics, recruiter Q&As, mock interviews and practical career sessions."
      />
      {upcoming.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sessionRail}
        >
          {upcoming.map((item) => {
            const person = speaker(item);
            const registered = registeredIds.has(item.id);
            return (
              <View key={item.id} style={styles.session}>
                <View style={styles.sessionTop}>
                  {person.image_url ? (
                    <Image
                      source={{ uri: String(person.image_url) }}
                      style={styles.avatar}
                    />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Ionicons
                        name="person-outline"
                        size={22}
                        color={colors.pinkDeep}
                      />
                    </View>
                  )}
                  <View style={styles.sessionPerson}>
                    <Text numberOfLines={1} style={styles.personName}>
                      {String(person.name || "GWMB Hiring Professional")}
                    </Text>
                    <Text numberOfLines={1} style={styles.personRole}>
                      {String(person.role || "Recruiter-led session")}
                    </Text>
                  </View>
                  <View style={styles.liveBadge}>
                    <Text style={styles.liveBadgeText}>LIVE</Text>
                  </View>
                </View>
                <Text style={styles.sessionTitle}>{item.title}</Text>
                <Text numberOfLines={2} style={styles.sessionCopy}>
                  {item.summary || "A practical Career Readiness session."}
                </Text>
                <View style={styles.dateRow}>
                  <Ionicons
                    name="calendar-outline"
                    size={15}
                    color={colors.pinkDeep}
                  />
                  <Text style={styles.dateText}>{date(item.starts_at)}</Text>
                </View>
                <Pressable
                  disabled={saving === item.id || registered}
                  onPress={() => void saveSeat(item)}
                  style={[styles.seat, registered && styles.seatSaved]}
                >
                  <Ionicons
                    name={registered ? "checkmark-circle" : "bookmark-outline"}
                    size={17}
                    color={registered ? "#087553" : "white"}
                  />
                  <Text
                    style={[
                      styles.seatText,
                      registered && styles.seatTextSaved,
                    ]}
                  >
                    {registered
                      ? "Seat saved"
                      : saving === item.id
                        ? "Saving…"
                        : "Save my seat"}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <AppStateView
          kind="empty"
          compact
          title="No Career Readiness sessions are scheduled yet"
          copy="Published recruiter clinics will appear here automatically."
        />
      )}

      <Heading
        eyebrow="GET REVIEWED"
        title="Put your application in stronger hands"
        copy="Submit a CV, LinkedIn profile or application for consideration in an upcoming live clinic."
      />
      <Pressable
        onPress={() => router.push("/career-readiness/review" as never)}
        style={styles.reviewCard}
      >
        <View style={styles.reviewIcon}>
          <Ionicons
            name="document-text-outline"
            size={25}
            color={colors.pinkDeep}
          />
        </View>
        <View style={styles.reviewCopy}>
          <Text style={styles.reviewTitle}>Get Your Application Reviewed</Text>
          <Text style={styles.reviewText}>
            Choose an existing GWMB CV or upload a document, then tell us where
            you need feedback.
          </Text>
          <View style={styles.reviewTypes}>
            <Text style={styles.reviewType}>CV</Text>
            <Text style={styles.reviewType}>LINKEDIN</Text>
            <Text style={styles.reviewType}>APPLICATION</Text>
          </View>
        </View>
        <Ionicons name="arrow-forward" size={22} color={colors.ink} />
      </Pressable>

      <Heading
        eyebrow="PRACTICE"
        title="Prepare your strongest answer"
        copy="Draft, save and improve responses to questions you are likely to hear."
      />
      {questionsError ? (
        <AppStateView
          kind="error"
          compact
          title="Practice questions could not load"
          copy={questionsError}
        />
      ) : questions.length ? (
        <View style={styles.practiceCard}>
          <View style={styles.practiceTop}>
            <View>
              <Text style={styles.practiceCount}>{questions.length}</Text>
              <Text style={styles.practiceLabel}>PRACTICE QUESTIONS</Text>
            </View>
            <View style={styles.savedAnswers}>
              <Text style={styles.savedCount}>{responses.length}</Text>
              <Text style={styles.savedLabel}>SAVED ANSWERS</Text>
            </View>
          </View>
          <Text style={styles.practiceQuestion}>“{questions[0].question}”</Text>
          <Text style={styles.practiceGuide}>
            Use simple frameworks like STAR to make your evidence clear.
          </Text>
          <Pressable
            onPress={() => router.push("/career-readiness/practice" as never)}
            style={styles.practiceButton}
          >
            <Text style={styles.practiceButtonText}>
              Practice interview questions
            </Text>
            <Ionicons name="arrow-forward" size={18} color="white" />
          </Pressable>
        </View>
      ) : (
        <AppStateView
          kind="empty"
          compact
          title="No practice questions are published yet"
          copy="Questions created and activated by Admin will appear here."
        />
      )}

      <Heading
        eyebrow="CAREER RESOURCES"
        title="Practical tools for getting hired"
        copy="Only resources published by the GWMB team appear here."
      />
      {resources.length ? (
        <View style={styles.resourceList}>
          {resources.map((item) => {
            const saved = savedIds.includes(item.id);
            return (
              <View key={item.id} style={styles.resource}>
                <View style={styles.resourceIcon}>
                  <Ionicons
                    name={
                      String(meta(item).resource_type).includes("video")
                        ? "play-outline"
                        : "document-text-outline"
                    }
                    size={21}
                    color="#7E2F09"
                  />
                </View>
                <Pressable
                  onPress={() => {
                    const url = resourceUrl(item);
                    if (url) void Linking.openURL(url);
                  }}
                  style={styles.resourceBody}
                >
                  <Text style={styles.resourceCategory}>
                    {String(meta(item).resource_type || "GUIDE").toUpperCase()}
                  </Text>
                  <Text style={styles.resourceTitle}>{item.title}</Text>
                  <Text numberOfLines={2} style={styles.resourceCopy}>
                    {item.summary}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={
                    saved ? "Remove saved resource" : "Save resource"
                  }
                  onPress={() => void bookmark(item)}
                  style={styles.bookmark}
                >
                  <Ionicons
                    name={saved ? "bookmark" : "bookmark-outline"}
                    size={20}
                    color={saved ? colors.pinkDeep : colors.ink}
                  />
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : (
        <AppStateView
          kind="empty"
          compact
          title="Career resources are being prepared"
          copy="Published templates, guides and checklists will appear here—never placeholder downloads."
        />
      )}

      <Heading
        eyebrow="PAST SESSIONS & REPLAYS"
        title="Catch up on practical sessions"
      />
      {replays.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.replayRail}
        >
          {replays.map((item) => (
            <Pressable
              key={item.id}
              onPress={() =>
                void Linking.openURL(String(meta(item).replay_url))
              }
              style={styles.replay}
            >
              <View style={styles.replayPlay}>
                <Ionicons name="play" size={20} color="white" />
              </View>
              <Text style={styles.replayCategory}>
                {String(meta(item).program || "CAREER READINESS")
                  .replaceAll("-", " ")
                  .toUpperCase()}
              </Text>
              <Text style={styles.replayTitle}>{item.title}</Text>
              <Text style={styles.replayMeta}>
                {String(speaker(item).name || "GWMB Facilitator")} ·{" "}
                {date(item.starts_at)}
              </Text>
              <Text style={styles.watch}>Watch replay →</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <AppStateView
          kind="empty"
          compact
          title="No Career Readiness replays yet"
          copy="A completed session will appear here when Admin adds its recording."
        />
      )}

      <Heading
        eyebrow="MY CAREER READINESS"
        title="Everything you are working on"
      />
      <Pressable
        onPress={() =>
          router.push((user ? "/career-readiness/my" : "/sign-in") as never)
        }
        style={styles.myCard}
      >
        <View style={styles.myStat}>
          <Text style={styles.myNumber}>{myUpcoming.length}</Text>
          <Text style={styles.myLabel}>UPCOMING</Text>
        </View>
        <View style={styles.myDivider} />
        <View style={styles.myStat}>
          <Text style={styles.myNumber}>{submissions.length}</Text>
          <Text style={styles.myLabel}>REVIEWS</Text>
        </View>
        <View style={styles.myDivider} />
        <View style={styles.myStat}>
          <Text style={styles.myNumber}>{responses.length}</Text>
          <Text style={styles.myLabel}>ANSWERS</Text>
        </View>
        <View style={styles.myDivider} />
        <View style={styles.myStat}>
          <Text style={styles.myNumber}>{savedIds.length}</Text>
          <Text style={styles.myLabel}>SAVED</Text>
        </View>
        <Ionicons name="arrow-forward" size={19} color="white" />
      </Pressable>
      {submissions[0] ? (
        <View style={styles.latest}>
          <Text style={styles.latestLabel}>LATEST REVIEW</Text>
          <Text style={styles.latestTitle}>
            {submissions[0].review_type
              .replaceAll("_", " ")
              .replace(/\b\w/g, (char) => char.toUpperCase())}
          </Text>
          <Text style={styles.latestStatus}>
            {statusLabels[submissions[0].status]}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingBottom: 20 },
  hero: {
    minHeight: 268,
    borderRadius: 28,
    backgroundColor: "#F3B85B",
    padding: 21,
    overflow: "hidden",
    marginBottom: 13,
  },
  heroOrb: {
    position: "absolute",
    width: 210,
    height: 210,
    borderRadius: 105,
    borderWidth: 40,
    borderColor: "rgba(255,255,255,.18)",
    right: -60,
    top: -55,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroEyebrow: {
    fontFamily: fonts.bodyBold,
    fontSize: 8,
    letterSpacing: 1.3,
    color: "#7E2F09",
    marginTop: 28,
  },
  heroTitle: {
    fontFamily: fonts.heading,
    fontSize: 31,
    lineHeight: 35,
    letterSpacing: -1.1,
    color: colors.ink,
    marginTop: 7,
  },
  heroCopy: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
    color: "#5A351E",
    maxWidth: 330,
    marginTop: 8,
  },
  heroActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    marginTop: 19,
  },
  heroButton: {
    height: 46,
    borderRadius: 15,
    backgroundColor: "white",
    paddingHorizontal: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  heroButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.ink,
  },
  heroLink: { height: 44, justifyContent: "center" },
  heroLinkText: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    color: "#6A3213",
    textDecorationLine: "underline",
  },
  jumpRow: { gap: 7, paddingRight: 18, paddingBottom: 22 },
  jump: {
    height: 39,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#DDD4DB",
    backgroundColor: "#FCFAFC",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  jumpText: { fontFamily: fonts.bodyBold, fontSize: 8.5, color: colors.ink },
  jumpTextOn: { color: "white" },
  heading: { marginTop: 5, marginBottom: 12 },
  eyebrow: {
    fontFamily: fonts.bodyBold,
    fontSize: 8,
    letterSpacing: 1.3,
    color: colors.pinkDeep,
    marginBottom: 5,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.7,
    color: colors.ink,
  },
  copy: {
    fontFamily: fonts.body,
    fontSize: 10.5,
    lineHeight: 16,
    color: colors.muted,
    marginTop: 5,
    maxWidth: 390,
  },
  sessionRail: { gap: 11, paddingRight: 18, paddingBottom: 26 },
  session: {
    width: 296,
    minHeight: 255,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: "#DED8DC",
    backgroundColor: "white",
    padding: 16,
  },
  sessionTop: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 43, height: 43, borderRadius: 14 },
  avatarFallback: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: colors.pinkSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionPerson: { flex: 1, minWidth: 0, paddingHorizontal: 10 },
  personName: {
    fontFamily: fonts.headingBold,
    fontSize: 10.5,
    color: colors.ink,
  },
  personRole: {
    fontFamily: fonts.body,
    fontSize: 8.5,
    color: colors.muted,
    marginTop: 2,
  },
  liveBadge: {
    borderRadius: 8,
    backgroundColor: "#FFE7F1",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  liveBadgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: 7,
    color: colors.pinkDeep,
  },
  sessionTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    lineHeight: 22,
    color: colors.ink,
    marginTop: 15,
  },
  sessionCopy: {
    fontFamily: fonts.body,
    fontSize: 9.5,
    lineHeight: 14,
    color: colors.muted,
    marginTop: 5,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 12,
  },
  dateText: { fontFamily: fonts.bodyBold, fontSize: 8.5, color: colors.ink },
  seat: {
    height: 43,
    borderRadius: 14,
    backgroundColor: colors.ink,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: "auto",
  },
  seatSaved: { backgroundColor: "#E2F5EE" },
  seatText: { fontFamily: fonts.bodyBold, fontSize: 9.5, color: "white" },
  seatTextSaved: { color: "#087553" },
  reviewCard: {
    minHeight: 176,
    borderRadius: 24,
    backgroundColor: "#FCE7F0",
    borderWidth: 1,
    borderColor: "#E9C7D6",
    padding: 17,
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 27,
  },
  reviewIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
  },
  reviewCopy: { flex: 1, paddingHorizontal: 13 },
  reviewTitle: {
    fontFamily: fonts.heading,
    fontSize: 17,
    lineHeight: 21,
    color: colors.ink,
  },
  reviewText: {
    fontFamily: fonts.body,
    fontSize: 9.5,
    lineHeight: 14,
    color: colors.muted,
    marginTop: 5,
  },
  reviewTypes: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 12,
  },
  reviewType: {
    fontFamily: fonts.bodyBold,
    fontSize: 6.8,
    letterSpacing: 0.4,
    color: colors.pinkDeep,
    backgroundColor: "white",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
  },
  practiceCard: {
    borderRadius: 25,
    backgroundColor: "#171218",
    padding: 18,
    marginBottom: 27,
  },
  practiceTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  practiceCount: { fontFamily: fonts.heading, fontSize: 29, color: "white" },
  practiceLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 7,
    letterSpacing: 0.9,
    color: "#D5CAD1",
  },
  savedAnswers: { alignItems: "flex-end" },
  savedCount: { fontFamily: fonts.heading, fontSize: 20, color: "#F4A5CA" },
  savedLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 7,
    letterSpacing: 0.8,
    color: "#D5CAD1",
  },
  practiceQuestion: {
    fontFamily: fonts.heading,
    fontSize: 19,
    lineHeight: 24,
    color: "white",
    marginTop: 21,
  },
  practiceGuide: {
    fontFamily: fonts.body,
    fontSize: 9.5,
    lineHeight: 14,
    color: "#CFC5CB",
    marginTop: 6,
  },
  practiceButton: {
    height: 45,
    borderRadius: 14,
    backgroundColor: colors.pinkDeep,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 17,
  },
  practiceButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 9.5,
    color: "white",
  },
  resourceList: { gap: 9, marginBottom: 27 },
  resource: {
    minHeight: 110,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#DFD9DD",
    backgroundColor: "white",
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
  },
  resourceIcon: {
    width: 49,
    height: 57,
    borderRadius: 15,
    backgroundColor: "#FFF0D5",
    alignItems: "center",
    justifyContent: "center",
  },
  resourceBody: { flex: 1, paddingHorizontal: 12 },
  resourceCategory: {
    fontFamily: fonts.bodyBold,
    fontSize: 7,
    letterSpacing: 0.8,
    color: "#9B5A18",
  },
  resourceTitle: {
    fontFamily: fonts.headingBold,
    fontSize: 12.5,
    lineHeight: 16,
    color: colors.ink,
    marginTop: 4,
  },
  resourceCopy: {
    fontFamily: fonts.body,
    fontSize: 8.5,
    lineHeight: 12,
    color: colors.muted,
    marginTop: 3,
  },
  bookmark: {
    width: 35,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  replayRail: { gap: 10, paddingRight: 18, paddingBottom: 27 },
  replay: {
    width: 246,
    minHeight: 180,
    borderRadius: 22,
    backgroundColor: "#4B2B74",
    padding: 16,
    overflow: "hidden",
  },
  replayPlay: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  replayCategory: {
    fontFamily: fonts.bodyBold,
    fontSize: 7,
    letterSpacing: 0.8,
    color: "#DFC8FA",
    marginTop: 18,
  },
  replayTitle: {
    fontFamily: fonts.heading,
    fontSize: 16,
    lineHeight: 20,
    color: "white",
    marginTop: 5,
  },
  replayMeta: {
    fontFamily: fonts.body,
    fontSize: 8.5,
    color: "#DCCFDF",
    marginTop: 7,
  },
  watch: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    color: "white",
    marginTop: 14,
  },
  myCard: {
    minHeight: 104,
    borderRadius: 22,
    backgroundColor: colors.ink,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  myStat: { flex: 1, alignItems: "center" },
  myNumber: { fontFamily: fonts.heading, fontSize: 22, color: "white" },
  myLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 6.5,
    letterSpacing: 0.7,
    color: "#CFC7CC",
    marginTop: 3,
  },
  myDivider: { width: 1, height: 40, backgroundColor: "#433C41" },
  latest: {
    borderRadius: 18,
    backgroundColor: "#F3F0F2",
    padding: 15,
    marginTop: 9,
  },
  latestLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 7,
    letterSpacing: 0.9,
    color: colors.pinkDeep,
  },
  latestTitle: {
    fontFamily: fonts.headingBold,
    fontSize: 12,
    color: colors.ink,
    marginTop: 5,
  },
  latestStatus: {
    fontFamily: fonts.bodyMedium,
    fontSize: 9,
    color: colors.muted,
    marginTop: 2,
  },
});
