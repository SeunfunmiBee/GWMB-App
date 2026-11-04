/* eslint-disable react-hooks/set-state-in-effect */
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { colors, fonts } from "@/theme";

type Tab = "members" | "requests" | "applications";
type Request = {
  user_id: string;
  membership_email: string;
  member_identifier: string | null;
  chapter: string | null;
  membership_record_id: string | null;
  status: string;
  review_note: string | null;
  submitted_at: string;
};
type Application = {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  occupation: string | null;
  motivation: string | null;
  status: string;
  submitted_at: string;
};
type MemberRecord = {
  id: string;
  member_identifier: string;
  membership_email: string;
  chapter: string | null;
  status: string;
  dues_status: string;
  linked_user_id: string | null;
  created_at: string;
};
type Notice = { kind: "success" | "error"; title: string; copy: string };
type QueueCounts = Record<Tab, number>;
const PAGE_SIZE = 30;
const memberColumns =
  "id,member_identifier,membership_email,chapter,status,dues_status,linked_user_id,created_at";
const requestColumns =
  "user_id,membership_email,member_identifier,chapter,membership_record_id,status,review_note,submitted_at";

async function fetchMemberPage(term: string, offset: number) {
  let request = supabase
    .from("membership_records")
    .select(memberColumns, { count: "exact" })
    .order("created_at", { ascending: false });
  const safe = term.replace(/[^a-zA-Z0-9@._ -]/g, " ").trim();
  if (safe)
    request = request.or(
      `member_identifier.ilike.%${safe}%,membership_email.ilike.%${safe}%,chapter.ilike.%${safe}%`,
    );
  const result = await request.range(offset, offset + PAGE_SIZE - 1);
  return {
    items: (result.data ?? []) as MemberRecord[],
    total: result.count ?? 0,
    error: result.error,
  };
}

async function fetchRequestPage(offset: number) {
  const result = await supabase
    .from("membership_verification_requests")
    .select(requestColumns, { count: "exact" })
    .order("submitted_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  return {
    items: (result.data ?? []) as Request[],
    total: result.count ?? 0,
    error: result.error,
  };
}

async function fetchApplicationPage(offset: number) {
  const result = await supabase
    .from("membership_applications")
    .select("*", { count: "exact" })
    .order("submitted_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  return {
    items: (result.data ?? []) as Application[],
    total: result.count ?? 0,
    error: result.error,
  };
}

export default function AdminApprovals() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>("members");
  const [requests, setRequests] = useState<Request[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [records, setRecords] = useState<MemberRecord[]>([]);
  const [busy, setBusy] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [memberId, setMemberId] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [chapter, setChapter] = useState("");
  const [adding, setAdding] = useState(false);
  const [counts, setCounts] = useState<QueueCounts>({
    members: 0,
    requests: 0,
    applications: 0,
  });
  const [hasMore, setHasMore] = useState<Record<Tab, boolean>>({
    members: false,
    requests: false,
    applications: false,
  });
  const [loadingMore, setLoadingMore] = useState<Tab | null>(null);
  const memberRequestId = useRef(0);
  const load = useCallback(async () => {
    setBusy(true);
    const [vr, ap, mr] = await Promise.all([
      fetchRequestPage(0),
      fetchApplicationPage(0),
      fetchMemberPage("", 0),
    ]);
    setRequests(vr.items);
    setApplications(ap.items);
    setRecords(mr.items);
    setCounts({
      members: mr.total,
      requests: vr.total,
      applications: ap.total,
    });
    setHasMore({
      members: mr.items.length < mr.total,
      requests: vr.items.length < vr.total,
      applications: ap.items.length < ap.total,
    });
    setBusy(false);
  }, []);
  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);
  useEffect(() => {
    if (!isAdmin) return;
    const requestId = ++memberRequestId.current;
    const timer = setTimeout(() => {
      void fetchMemberPage(query, 0).then((result) => {
        if (requestId !== memberRequestId.current) return;
        setRecords(result.items);
        setCounts((current) => ({ ...current, members: result.total }));
        setHasMore((current) => ({
          ...current,
          members: result.items.length < result.total,
        }));
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [isAdmin, query]);

  async function loadMoreFor(activeTab: Tab) {
    setLoadingMore(activeTab);
    if (activeTab === "members") {
      const result = await fetchMemberPage(query, records.length);
      setRecords((current) => [...current, ...result.items]);
      setCounts((current) => ({ ...current, members: result.total }));
      setHasMore((current) => ({
        ...current,
        members: records.length + result.items.length < result.total,
      }));
    } else if (activeTab === "requests") {
      const result = await fetchRequestPage(requests.length);
      setRequests((current) => [...current, ...result.items]);
      setCounts((current) => ({ ...current, requests: result.total }));
      setHasMore((current) => ({
        ...current,
        requests: requests.length + result.items.length < result.total,
      }));
    } else {
      const result = await fetchApplicationPage(applications.length);
      setApplications((current) => [...current, ...result.items]);
      setCounts((current) => ({ ...current, applications: result.total }));
      setHasMore((current) => ({
        ...current,
        applications: applications.length + result.items.length < result.total,
      }));
    }
    setLoadingMore(null);
  }
  async function addOfficialRecord() {
    setNotice(null);
    const cleanEmail = memberEmail
      .trim()
      .replace(/[.,;:]+$/, "")
      .toLowerCase();
    const cleanId = memberId.trim().toUpperCase();
    if (!cleanId || !cleanEmail.includes("@")) {
      setNotice({
        kind: "error",
        title: "Check the record",
        copy: "Enter the official Member ID and membership email.",
      });
      return;
    }
    setAdding(true);
    const { data, error } = await supabase
      .from("membership_records")
      .insert({
        member_identifier: cleanId,
        membership_email: cleanEmail,
        chapter: chapter.trim() || null,
        status: "active",
        dues_status: "unknown",
      })
      .select(
        "id,member_identifier,membership_email,chapter,status,dues_status,linked_user_id,created_at",
      )
      .single();
    setAdding(false);
    if (error) {
      setNotice({
        kind: "error",
        title: "Record not added",
        copy:
          error.code === "23505"
            ? "That Member ID already exists."
            : error.message,
      });
      return;
    }
    setRecords((current) => [data as MemberRecord, ...current]);
    setCounts((current) => ({ ...current, members: current.members + 1 }));
    setNotice({
      kind: "success",
      title: "Member record added",
      copy: `${cleanId} is now in official member records and ready for verification. The member’s verification page will check again automatically.`,
    });
    setMemberId("");
    setMemberEmail("");
    setChapter("");
    setQuery("");
    setShowForm(false);
  }
  async function decide(item: Request, approved: boolean) {
    if (approved && !item.membership_record_id)
      return Alert.alert(
        "Official record required",
        "Add the member record, then ask the member to try verification again.",
      );
    const { error } = await supabase.rpc("admin_resolve_membership_link", {
      p_user_id: item.user_id,
      p_approved: approved,
      p_review_note: approved
        ? "Membership manually verified by GWMB."
        : "The submitted details could not be verified.",
    });
    if (error) {
      setNotice({
        kind: "error",
        title: "Request not updated",
        copy: error.message,
      });
      return;
    }
    setNotice({
      kind: "success",
      title: approved ? "Membership verified" : "Request rejected",
      copy: item.membership_email,
    });
    await load();
  }
  if (!isAdmin)
    return (
      <Screen>
        <PageHeader title="Membership" />
        <Text style={styles.body}>Admin access required.</Text>
      </Screen>
    );
  return (
    <Screen>
      <PageHeader title="Membership" />
      <View style={styles.tabs}>
        {(["members", "requests", "applications"] as Tab[]).map((value) => (
          <Pressable
            key={value}
            onPress={() => setTab(value)}
            style={[styles.tab, tab === value && styles.tabOn]}
          >
            <Text style={[styles.tabText, tab === value && styles.tabTextOn]}>
              {value[0].toUpperCase() + value.slice(1)}
            </Text>
            <Text style={[styles.tabCount, tab === value && styles.tabCountOn]}>
              {counts[value]}
            </Text>
          </Pressable>
        ))}
      </View>
      {notice ? (
        <View
          style={[styles.notice, notice.kind === "error" && styles.noticeError]}
        >
          <View
            style={[
              styles.noticeIcon,
              notice.kind === "error" && styles.noticeIconError,
            ]}
          >
            <Ionicons
              name={notice.kind === "success" ? "checkmark" : "alert"}
              size={18}
              color="white"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.noticeTitle}>{notice.title}</Text>
            <Text style={styles.noticeCopy}>{notice.copy}</Text>
          </View>
          <Pressable onPress={() => setNotice(null)}>
            <Ionicons name="close" size={18} color={colors.ink} />
          </Pressable>
        </View>
      ) : null}
      {busy ? (
        <ActivityIndicator color={colors.ink} style={styles.loader} />
      ) : tab === "members" ? (
        <Members
          records={records}
          total={counts.members}
          query={query}
          setQuery={setQuery}
          showForm={showForm}
          setShowForm={setShowForm}
          memberId={memberId}
          setMemberId={setMemberId}
          memberEmail={memberEmail}
          setMemberEmail={setMemberEmail}
          chapter={chapter}
          setChapter={setChapter}
          adding={adding}
          add={addOfficialRecord}
        />
      ) : tab === "requests" ? (
        <Requests items={requests} decide={decide} />
      ) : (
        <Applications items={applications} />
      )}
      {!busy && hasMore[tab] ? (
        <Pressable
          disabled={loadingMore === tab}
          onPress={() => void loadMoreFor(tab)}
          style={styles.loadMore}
        >
          {loadingMore === tab ? (
            <ActivityIndicator color={colors.ink} />
          ) : (
            <>
              <Text style={styles.loadMoreText}>Load more</Text>
              <Ionicons name="chevron-down" size={17} color={colors.ink} />
            </>
          )}
        </Pressable>
      ) : null}
    </Screen>
  );
}

function Members({
  records,
  total,
  query,
  setQuery,
  showForm,
  setShowForm,
  memberId,
  setMemberId,
  memberEmail,
  setMemberEmail,
  chapter,
  setChapter,
  adding,
  add,
}: {
  records: MemberRecord[];
  total: number;
  query: string;
  setQuery: (v: string) => void;
  showForm: boolean;
  setShowForm: (v: boolean) => void;
  memberId: string;
  setMemberId: (v: string) => void;
  memberEmail: string;
  setMemberEmail: (v: string) => void;
  chapter: string;
  setChapter: (v: string) => void;
  adding: boolean;
  add: () => Promise<void>;
}) {
  return (
    <View>
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.heading}>Member records</Text>
          <Text style={styles.headingMeta}>
            {records.length} of {total} shown
          </Text>
        </View>
        <Pressable
          accessibilityLabel={
            showForm ? "Close member form" : "Add member record"
          }
          onPress={() => setShowForm(!showForm)}
          style={styles.addButton}
        >
          <Ionicons name={showForm ? "close" : "add"} size={23} color="white" />
        </Pressable>
      </View>
      {showForm ? (
        <View style={styles.form}>
          <Text style={styles.formTitle}>New member record</Text>
          <AdminField
            label="GWMB MEMBER ID"
            value={memberId}
            onChangeText={setMemberId}
            placeholder="GWMB-2026-0012"
            autoCapitalize="characters"
          />
          <AdminField
            label="MEMBERSHIP EMAIL"
            value={memberEmail}
            onChangeText={setMemberEmail}
            placeholder="member@example.com"
            keyboardType="email-address"
          />
          <AdminField
            label="CHAPTER"
            value={chapter}
            onChangeText={setChapter}
            placeholder="Lagos City Club"
          />
          <Pressable
            disabled={adding}
            onPress={() => void add()}
            style={styles.primary}
          >
            {adding ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.primaryText}>Add member record</Text>
            )}
          </Pressable>
        </View>
      ) : null}
      <View style={styles.search}>
        <Ionicons name="search-outline" size={19} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search ID, email or chapter"
          placeholderTextColor="#8D888C"
          style={styles.searchInput}
        />
      </View>
      <View style={styles.list}>
        {records.length === 0 ? (
          <Empty copy="No member records found." />
        ) : (
          records.map((item) => (
            <View key={item.id} style={styles.record}>
              <View style={styles.recordTop}>
                <View style={styles.memberIcon}>
                  <Ionicons
                    name="person-outline"
                    size={19}
                    color={colors.ink}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recordId}>{item.member_identifier}</Text>
                  <Text style={styles.recordEmail}>
                    {item.membership_email}
                  </Text>
                </View>
                <View
                  style={[
                    styles.linkBadge,
                    item.linked_user_id && styles.linkBadgeOn,
                  ]}
                >
                  <Text
                    style={[
                      styles.linkText,
                      item.linked_user_id && styles.linkTextOn,
                    ]}
                  >
                    {item.linked_user_id ? "LINKED" : "UNLINKED"}
                  </Text>
                </View>
              </View>
              <View style={styles.recordMeta}>
                <Text style={styles.metaText}>
                  {item.chapter || "No chapter"}
                </Text>
                <Text style={styles.metaText}>{item.status}</Text>
                <Text style={styles.metaText}>Dues: {item.dues_status}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );
}
function Requests({
  items,
  decide,
}: {
  items: Request[];
  decide: (item: Request, approved: boolean) => Promise<void>;
}) {
  return (
    <View>
      <Text style={styles.heading}>Verification requests</Text>
      <View style={styles.list}>
        {items.length === 0 ? (
          <Empty copy="Nothing waiting for review." />
        ) : (
          items.map((item) => (
            <View key={item.user_id} style={styles.reviewCard}>
              <View style={styles.reviewHead}>
                <Text style={styles.reviewEmail}>{item.membership_email}</Text>
                <Text style={styles.status}>
                  {item.status.replace("_", " ")}
                </Text>
              </View>
              <ReviewRow
                label="MEMBER ID"
                value={item.member_identifier || "Not provided"}
              />
              <ReviewRow
                label="CHAPTER"
                value={item.chapter || "Not provided"}
              />
              <ReviewRow
                label="OFFICIAL RECORD"
                value={item.membership_record_id ? "Matched" : "No match"}
                good={Boolean(item.membership_record_id)}
              />
              {item.review_note ? (
                <Text style={styles.reviewNote}>{item.review_note}</Text>
              ) : null}
              {item.status === "pending" || item.status === "needs_review" ? (
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => void decide(item, true)}
                    style={[
                      styles.approve,
                      !item.membership_record_id && styles.disabled,
                    ]}
                  >
                    <Text style={styles.approveText}>Verify member</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void decide(item, false)}
                    style={styles.reject}
                  >
                    <Text style={styles.rejectText}>Reject</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))
        )}
      </View>
    </View>
  );
}
function Applications({ items }: { items: Application[] }) {
  return (
    <View>
      <Text style={styles.heading}>Applications</Text>
      <View style={styles.list}>
        {items.length === 0 ? (
          <Empty copy="Nothing waiting for review." />
        ) : (
          items.map((item) => (
            <View key={item.id} style={styles.reviewCard}>
              <View style={styles.reviewHead}>
                <Text style={styles.reviewEmail}>
                  {item.full_name || item.email || "Application"}
                </Text>
                <Text style={styles.status}>{item.status}</Text>
              </View>
              <ReviewRow label="EMAIL" value={item.email || "Not provided"} />
              <ReviewRow label="LOCATION" value={item.city || "Not provided"} />
              <ReviewRow
                label="OCCUPATION"
                value={item.occupation || "Not provided"}
              />
              {item.motivation ? (
                <View style={styles.answer}>
                  <Text style={styles.answerLabel}>WHY SHE WANTS TO JOIN</Text>
                  <Text style={styles.answerText}>{item.motivation}</Text>
                </View>
              ) : null}
            </View>
          ))
        )}
      </View>
    </View>
  );
}
function AdminField(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: "default" | "email-address";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor="#9A9599"
        autoCapitalize={props.autoCapitalize ?? "none"}
        keyboardType={props.keyboardType}
        style={styles.fieldInput}
      />
    </View>
  );
}
function ReviewRow({
  label,
  value,
  good,
}: {
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={[styles.reviewValue, good && styles.good]}>{value}</Text>
    </View>
  );
}
function Empty({ copy }: { copy: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name="file-tray-outline" size={22} color={colors.muted} />
      <Text style={styles.body}>{copy}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: 100 },
  tabs: {
    height: 48,
    borderRadius: 14,
    backgroundColor: "#EFEEEF",
    padding: 4,
    flexDirection: "row",
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    borderRadius: 11,
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  tabOn: { backgroundColor: "white", borderWidth: 1, borderColor: "#E0DDE0" },
  tabText: { fontFamily: fonts.bodyBold, fontSize: 8.5, color: colors.muted },
  tabTextOn: { color: colors.ink },
  tabCount: { fontFamily: fonts.bodyBold, fontSize: 7.5, color: colors.muted },
  tabCountOn: { color: colors.ink },
  notice: {
    minHeight: 72,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#CDE7DC",
    backgroundColor: "#EFF9F5",
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  noticeError: { borderColor: "#F0CAD7", backgroundColor: "#FFF2F6" },
  noticeIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#087553",
    alignItems: "center",
    justifyContent: "center",
  },
  noticeIconError: { backgroundColor: "#B31C52" },
  noticeTitle: {
    fontFamily: fonts.headingBold,
    fontSize: 11.5,
    color: colors.ink,
  },
  noticeCopy: {
    fontFamily: fonts.body,
    fontSize: 9,
    lineHeight: 14,
    color: colors.muted,
    marginTop: 3,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heading: { fontFamily: fonts.heading, fontSize: 27, color: colors.ink },
  headingMeta: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: colors.muted,
    marginTop: 2,
  },
  addButton: {
    width: 47,
    height: 47,
    borderRadius: 14,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  form: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D8D5D8",
    backgroundColor: "#F7F6F7",
    padding: 14,
    marginTop: 14,
  },
  formTitle: {
    fontFamily: fonts.headingBold,
    fontSize: 15,
    color: colors.ink,
    marginBottom: 3,
  },
  field: {
    minHeight: 68,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D8D5D8",
    backgroundColor: "white",
    paddingHorizontal: 14,
    paddingTop: 10,
    marginTop: 10,
  },
  fieldLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 8,
    letterSpacing: 0.65,
    color: "#6C676B",
  },
  fieldInput: {
    flex: 1,
    minHeight: 38,
    color: colors.ink,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    paddingVertical: 0,
    outlineStyle: "none",
  } as never,
  primary: {
    height: 51,
    borderRadius: 14,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  primaryText: { fontFamily: fonts.bodyBold, fontSize: 10.5, color: "white" },
  search: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DFDCDF",
    backgroundColor: colors.surface,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 15,
  },
  searchInput: {
    flex: 1,
    height: "100%",
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.ink,
    outlineStyle: "none",
  } as never,
  list: { gap: 9, marginTop: 12 },
  loadMore: {
    minHeight: 49,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D8D5D8",
    backgroundColor: "white",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 14,
  },
  loadMoreText: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    color: colors.ink,
  },
  record: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DFDCDF",
    backgroundColor: colors.surface,
    padding: 12,
  },
  recordTop: { flexDirection: "row", alignItems: "center" },
  memberIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#F0EFF0",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  recordId: {
    fontFamily: fonts.headingBold,
    fontSize: 12.5,
    color: colors.ink,
  },
  recordEmail: {
    fontFamily: fonts.body,
    fontSize: 9.5,
    color: colors.muted,
    marginTop: 3,
  },
  linkBadge: {
    borderRadius: 999,
    backgroundColor: "#EFEEEF",
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  linkBadgeOn: { backgroundColor: "#E2F4ED" },
  linkText: { fontFamily: fonts.bodyBold, fontSize: 7, color: "#686368" },
  linkTextOn: { color: "#087553" },
  recordMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: "#ECEAEC",
    paddingTop: 10,
    marginTop: 10,
  },
  metaText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 8.5,
    color: "#6A6569",
    textTransform: "capitalize",
  },
  reviewCard: {
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#DFDCDF",
    backgroundColor: colors.surface,
    padding: 14,
  },
  reviewHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ECEAEC",
  },
  reviewEmail: {
    flex: 1,
    fontFamily: fonts.headingBold,
    fontSize: 13.5,
    color: colors.ink,
  },
  status: {
    fontFamily: fonts.bodyBold,
    fontSize: 7.5,
    color: "#656165",
    backgroundColor: "#F0EFF0",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    textTransform: "uppercase",
  },
  reviewRow: {
    minHeight: 52,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#ECEAEC",
  },
  reviewLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 7.5,
    letterSpacing: 0.65,
    color: "#787277",
  },
  reviewValue: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.ink,
    marginTop: 3,
  },
  good: { color: "#087553" },
  reviewNote: {
    fontFamily: fonts.body,
    fontSize: 9.5,
    lineHeight: 15,
    color: colors.muted,
    marginTop: 10,
  },
  answer: {
    borderRadius: 13,
    backgroundColor: "#F4F2F4",
    padding: 12,
    marginTop: 11,
  },
  answerLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 7.5,
    letterSpacing: 0.7,
    color: "#6A6569",
  },
  answerText: {
    fontFamily: fonts.body,
    fontSize: 10.5,
    lineHeight: 16,
    color: colors.ink,
    marginTop: 5,
  },
  actions: { flexDirection: "row", gap: 7, marginTop: 13 },
  approve: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  approveText: { fontFamily: fonts.bodyBold, fontSize: 9.5, color: "white" },
  reject: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D8D5D8",
    paddingHorizontal: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  rejectText: { fontFamily: fonts.bodyBold, fontSize: 9.5, color: colors.ink },
  disabled: { opacity: 0.4 },
  empty: {
    minHeight: 105,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DFDCDF",
    backgroundColor: "#F7F6F7",
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 10,
    lineHeight: 16,
    color: colors.muted,
    marginTop: 6,
  },
});
