import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import {
  getReviewDocumentUrl,
  loadAdminReviewCounts,
  listAdminReviewSubmissions,
  updateReviewSubmission,
  type CareerReviewSubmission,
  type ReviewStatus,
} from "@/lib/career-readiness";
import { colors, fonts } from "@/theme";
import { ScreenSkeleton } from "@/components/states/Skeleton";
const statuses: { id: "all" | ReviewStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "submitted", label: "New" },
  { id: "under_review", label: "Under review" },
  { id: "selected", label: "Selected" },
  { id: "reviewed", label: "Reviewed" },
  { id: "not_selected", label: "Not selected" },
];
const statusLabel: Record<ReviewStatus, string> = {
  submitted: "New",
  under_review: "Under review",
  selected: "Selected",
  reviewed: "Reviewed",
  not_selected: "Not selected",
};
const PAGE_SIZE = 25;
const emptyCounts: Record<ReviewStatus, number> = {
  submitted: 0,
  under_review: 0,
  selected: 0,
  reviewed: 0,
  not_selected: 0,
};
export default function CareerReadinessAdmin() {
  const router = useRouter();
  const [items, setItems] = useState<CareerReviewSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"all" | ReviewStatus>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CareerReviewSubmission | null>(null);
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [queueCounts, setQueueCounts] =
    useState<Record<ReviewStatus, number>>(emptyCounts);
  const requestId = useRef(0);

  const loadQueue = useCallback(
    async (nextPage: number, append: boolean) => {
      const currentRequest = ++requestId.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      const result = await listAdminReviewSubmissions({
        page: nextPage,
        pageSize: PAGE_SIZE,
        status,
        query,
      });
      if (currentRequest !== requestId.current) return;
      setItems((current) =>
        append ? [...current, ...result.submissions] : result.submissions,
      );
      setPage(nextPage);
      setTotal(result.total);
      setHasMore(result.hasMore);
      setLoading(false);
      setLoadingMore(false);
    },
    [query, status],
  );

  useEffect(() => {
    const timer = setTimeout(() => void loadQueue(0, false), 250);
    return () => clearTimeout(timer);
  }, [loadQueue]);
  useEffect(() => {
    let active = true;
    void loadAdminReviewCounts().then((result) => {
      if (active && !result.error) setQueueCounts(result.counts);
    });
    return () => {
      active = false;
    };
  }, []);
  const counts = {
    new: queueCounts.submitted,
    active: queueCounts.under_review + queueCounts.selected,
    done: queueCounts.reviewed,
  };
  function open(item: CareerReviewSubmission) {
    setSelected(item);
    setFeedback(item.admin_feedback ?? "");
  }
  async function update(next: ReviewStatus) {
    if (!selected) return;
    setSaving(true);
    const result = await updateReviewSubmission(selected.id, {
      status: next,
      admin_feedback: feedback.trim() || undefined,
    });
    setSaving(false);
    if (result.error) Alert.alert("Could not update", result.error.message);
    else {
      const updated = result.data as CareerReviewSubmission;
      setItems((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      void loadAdminReviewCounts().then((result) => {
        if (!result.error) setQueueCounts(result.counts);
      });
      setSelected(updated);
      Alert.alert(
        "Submission updated",
        next === "selected"
          ? "The user has been notified that she was selected."
          : next === "reviewed"
            ? "The user has been notified that feedback is ready."
            : "Status saved.",
      );
    }
  }
  async function openDocument() {
    if (!selected) return;
    const result = await getReviewDocumentUrl(selected);
    if (result.url) void Linking.openURL(result.url);
    else
      Alert.alert(
        "No document available",
        "This submission may be for LinkedIn or a career profile without a CV file.",
      );
  }
  if (selected)
    return (
      <Screen>
        <PageHeader title="Review submission" eyebrow="Career Readiness" />
        <Pressable onPress={() => setSelected(null)} style={styles.back}>
          <Ionicons name="arrow-back" size={18} color={colors.ink} />
          <Text style={styles.backText}>Back to queue</Text>
        </Pressable>
        <View style={styles.detailHero}>
          <Text style={styles.detailType}>
            {selected.review_type.replaceAll("_", " ").toUpperCase()}
          </Text>
          <Text style={styles.detailTitle}>
            {selected.target_role || "Career Readiness review"}
          </Text>
          <Text style={styles.detailMeta}>
            {selected.career_field || "Career field not provided"} ·{" "}
            {selected.career_stage || "Stage not provided"}
          </Text>
          <View style={styles.consent}>
            <Ionicons
              name={
                selected.consent_group_review
                  ? "videocam-outline"
                  : "lock-closed-outline"
              }
              size={18}
              color={selected.consent_group_review ? "#8A5700" : "#087553"}
            />
            <Text style={styles.consentText}>
              {selected.consent_group_review
                ? "Group review permitted" +
                  (selected.anonymize_for_session ? " · Anonymize first" : "")
                : "Private review only · Do not show in a live session"}
            </Text>
          </View>
        </View>
        <View style={styles.facts}>
          <Fact label="TARGET ROLE" value={selected.target_role} />
          <Fact label="COMPANY" value={selected.company_name} />
          <Fact label="LINKEDIN" value={selected.linkedin_url} />
          <Fact label="WHAT THEY NEED" value={selected.feedback_focus} />
          {selected.job_description_text ? (
            <Fact
              label="JOB DESCRIPTION"
              value={selected.job_description_text}
            />
          ) : null}
        </View>
        <Pressable onPress={() => void openDocument()} style={styles.document}>
          <Ionicons
            name="document-text-outline"
            size={21}
            color={colors.pinkDeep}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.documentTitle}>Open submitted document</Text>
            <Text style={styles.documentMeta}>
              Secure link expires after 15 minutes
            </Text>
          </View>
          <Ionicons name="open-outline" size={19} color={colors.ink} />
        </Pressable>
        <Text style={styles.label}>REVIEW FEEDBACK</Text>
        <TextInput
          value={feedback}
          onChangeText={setFeedback}
          multiline
          placeholder="Add clear, practical feedback for the user"
          placeholderTextColor="#918A8E"
          style={styles.feedback}
        />
        <Text style={styles.label}>UPDATE STATUS</Text>
        <View style={styles.actions}>
          <Action
            label="Under review"
            icon="eye-outline"
            onPress={() => void update("under_review")}
            disabled={saving}
          />
          <Action
            label="Selected"
            icon="checkmark-circle-outline"
            onPress={() => void update("selected")}
            disabled={saving}
          />
          <Action
            label="Reviewed"
            icon="ribbon-outline"
            onPress={() => void update("reviewed")}
            disabled={saving}
          />
          <Action
            label="Not selected"
            icon="close-circle-outline"
            onPress={() => void update("not_selected")}
            disabled={saving}
          />
        </View>
      </Screen>
    );
  return (
    <Screen>
      <PageHeader title="Career Readiness" eyebrow="Admin" />
      <View style={styles.top}>
        <View>
          <Text style={styles.pageTitle}>Review queue</Text>
          <Text style={styles.pageCopy}>
            Private submissions for CV, LinkedIn, application and career-profile
            clinics.
          </Text>
        </View>
        <Pressable
          onPress={() =>
            router.push(
              "/admin/builder?type=event&program=career-support" as never,
            )
          }
          style={styles.add}
        >
          <Ionicons name="add" size={23} color="white" />
        </Pressable>
      </View>
      <View style={styles.stats}>
        <Stat value={counts.new} label="NEW" />
        <Stat value={counts.active} label="IN PROGRESS" />
        <Stat value={counts.done} label="REVIEWED" />
      </View>
      <View style={styles.search}>
        <Ionicons name="search-outline" size={19} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search role, field or review type"
          placeholderTextColor="#8F898D"
          style={styles.searchInput}
        />
      </View>
      <View style={styles.filters}>
        {statuses.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => setStatus(item.id)}
            style={[styles.filter, status === item.id && styles.filterOn]}
          >
            <Text
              style={[
                styles.filterText,
                status === item.id && styles.filterTextOn,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {!loading ? (
        <Text style={styles.queueMeta}>
          Showing {items.length} of {total} submission{total === 1 ? "" : "s"}
        </Text>
      ) : null}
      {loading ? (
        <ScreenSkeleton rows={5} />
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => open(item)}
              style={styles.row}
            >
              <View style={styles.rowIcon}>
                <Ionicons
                  name={
                    item.review_type === "cv"
                      ? "document-text-outline"
                      : item.review_type === "linkedin"
                        ? "logo-linkedin"
                        : item.review_type === "job_application"
                          ? "briefcase-outline"
                          : "person-outline"
                  }
                  size={20}
                  color={colors.pinkDeep}
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowTitle}>
                  {item.target_role || item.review_type.replaceAll("_", " ")}
                </Text>
                <Text style={styles.rowMeta}>
                  {item.career_field || "No field"} ·{" "}
                  {new Date(item.created_at).toLocaleDateString("en-NG", {
                    day: "numeric",
                    month: "short",
                  })}
                </Text>
                <Text style={styles.rowConsent}>
                  {item.consent_group_review
                    ? "Group consent · " +
                      (item.anonymize_for_session
                        ? "Anonymize"
                        : "Identifiable")
                    : "Private only"}
                </Text>
              </View>
              <Text style={styles.status}>{statusLabel[item.status]}</Text>
              <Ionicons name="chevron-forward" size={17} color={colors.muted} />
            </Pressable>
          ))}
          {!items.length ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No submissions in this view</Text>
              <Text style={styles.emptyCopy}>
                New review requests will appear here automatically.
              </Text>
            </View>
          ) : null}
          {hasMore ? (
            <Pressable
              disabled={loadingMore}
              onPress={() => void loadQueue(page + 1, true)}
              style={styles.loadMore}
            >
              {loadingMore ? (
                <ActivityIndicator color={colors.ink} />
              ) : (
                <>
                  <Text style={styles.loadMoreText}>Load more submissions</Text>
                  <Ionicons name="chevron-down" size={17} color={colors.ink} />
                </>
              )}
            </Pressable>
          ) : null}
        </View>
      )}
    </Screen>
  );
}
function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}
function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}
function Action({
  label,
  icon,
  onPress,
  disabled,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={styles.action}>
      <Ionicons name={icon} size={18} color={colors.ink} />
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "flex-start", marginBottom: 15 },
  pageTitle: { fontFamily: fonts.heading, fontSize: 27, color: colors.ink },
  pageCopy: {
    fontFamily: fonts.body,
    fontSize: 9.5,
    lineHeight: 14,
    color: colors.muted,
    maxWidth: 310,
    marginTop: 4,
  },
  add: {
    width: 47,
    height: 47,
    borderRadius: 15,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: "auto",
  },
  stats: {
    height: 88,
    borderRadius: 18,
    backgroundColor: "#F2F0F1",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 11,
  },
  stat: { flex: 1 },
  statValue: { fontFamily: fonts.heading, fontSize: 22, color: colors.ink },
  statLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 6.5,
    letterSpacing: 0.7,
    color: colors.muted,
    marginTop: 3,
  },
  search: {
    height: 51,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#DCD6DA",
    backgroundColor: "white",
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  searchInput: {
    flex: 1,
    height: "100%",
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    color: colors.ink,
    outlineStyle: "none",
  } as never,
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginVertical: 11,
  },
  queueMeta: {
    fontFamily: fonts.bodyMedium,
    fontSize: 8.5,
    color: colors.muted,
    marginBottom: 9,
  },
  filter: {
    height: 33,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#DCD6DA",
    backgroundColor: "white",
    paddingHorizontal: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  filterOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  filterText: {
    fontFamily: fonts.bodyBold,
    fontSize: 7.5,
    color: colors.muted,
  },
  filterTextOn: { color: "white" },
  list: { gap: 7 },
  row: {
    minHeight: 89,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#DFDADC",
    backgroundColor: "white",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rowIcon: {
    width: 44,
    height: 50,
    borderRadius: 13,
    backgroundColor: colors.pinkSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: {
    fontFamily: fonts.headingBold,
    fontSize: 11.5,
    color: colors.ink,
    textTransform: "capitalize",
  },
  rowMeta: {
    fontFamily: fonts.body,
    fontSize: 8.5,
    color: colors.muted,
    marginTop: 4,
  },
  rowConsent: {
    fontFamily: fonts.bodyBold,
    fontSize: 7,
    color: "#665E63",
    marginTop: 5,
  },
  status: {
    fontFamily: fonts.bodyBold,
    fontSize: 6.8,
    color: colors.pinkDeep,
    backgroundColor: colors.pinkSoft,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 8,
    maxWidth: 79,
    textAlign: "center",
  },
  empty: {
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D5CFD3",
    padding: 24,
    alignItems: "center",
  },
  emptyTitle: {
    fontFamily: fonts.headingBold,
    fontSize: 12,
    color: colors.ink,
  },
  emptyCopy: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: colors.muted,
    marginTop: 4,
  },
  loadMore: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DCD6DA",
    backgroundColor: "white",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 4,
  },
  loadMoreText: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    color: colors.ink,
  },
  back: { height: 40, flexDirection: "row", alignItems: "center", gap: 8 },
  backText: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.ink },
  detailHero: { borderRadius: 24, backgroundColor: "#171218", padding: 19 },
  detailType: {
    fontFamily: fonts.bodyBold,
    fontSize: 8,
    letterSpacing: 1,
    color: "#F0A7C8",
  },
  detailTitle: {
    fontFamily: fonts.heading,
    fontSize: 25,
    lineHeight: 30,
    color: "white",
    marginTop: 7,
  },
  detailMeta: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: "#D4CAD0",
    marginTop: 5,
  },
  consent: {
    borderRadius: 13,
    backgroundColor: "white",
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
  },
  consentText: {
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: 8,
    color: colors.ink,
  },
  facts: {
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#DFD9DD",
    backgroundColor: "white",
    padding: 15,
    marginTop: 10,
  },
  fact: {
    borderBottomWidth: 1,
    borderBottomColor: "#EEE9EC",
    paddingVertical: 10,
  },
  factLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 7,
    letterSpacing: 0.8,
    color: colors.pinkDeep,
  },
  factValue: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10.5,
    lineHeight: 16,
    color: colors.ink,
    marginTop: 4,
  },
  document: {
    height: 68,
    borderRadius: 17,
    backgroundColor: colors.pinkSoft,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
  },
  documentTitle: {
    fontFamily: fonts.headingBold,
    fontSize: 10.5,
    color: colors.ink,
  },
  documentMeta: {
    fontFamily: fonts.body,
    fontSize: 8,
    color: colors.muted,
    marginTop: 3,
  },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: 7.5,
    letterSpacing: 0.9,
    color: colors.pinkDeep,
    marginTop: 18,
    marginBottom: 7,
  },
  feedback: {
    minHeight: 145,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DCD6DA",
    backgroundColor: "white",
    padding: 14,
    textAlignVertical: "top",
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 17,
    color: colors.ink,
    outlineStyle: "none",
  } as never,
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  action: {
    width: "48.8%",
    height: 53,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#DCD6DA",
    backgroundColor: "white",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionText: { fontFamily: fonts.bodyBold, fontSize: 8.5, color: colors.ink },
});
