/* eslint-disable react-hooks/set-state-in-effect */
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import type { CvAnalysis, CvRecord } from "@/lib/cv-store";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { colors, fonts } from "@/theme";

const PAGE_SIZE = 30;

export default function AdminCvs() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<CvRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, count } = await supabase
      .from("cv_records")
      .select("*", { count: "exact" })
      .order("updated_at", { ascending: false })
      .range(0, PAGE_SIZE - 1);
    setItems((data ?? []) as CvRecord[]);
    setTotal(count ?? 0);
    setHasMore((data?.length ?? 0) < (count ?? 0));
    setLoading(false);
  }, []);
  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  async function loadMore() {
    setLoadingMore(true);
    const { data, count } = await supabase
      .from("cv_records")
      .select("*", { count: "exact" })
      .order("updated_at", { ascending: false })
      .range(items.length, items.length + PAGE_SIZE - 1);
    const next = (data ?? []) as CvRecord[];
    setItems((current) => [...current, ...next]);
    setTotal(count ?? total);
    setHasMore(items.length + next.length < (count ?? total));
    setLoadingMore(false);
  }

  async function openOriginal(item: CvRecord) {
    if (!item.original_file_path) return;
    const { data, error } = await supabase.storage
      .from("private-cvs")
      .createSignedUrl(item.original_file_path, 60);
    if (error || !data?.signedUrl)
      return Alert.alert("Could not open CV", "Please try again.");
    await Linking.openURL(data.signedUrl);
  }

  if (!isAdmin)
    return (
      <Screen>
        <PageHeader title="CV reviews" />
        <Text style={styles.copy}>Admin access required.</Text>
      </Screen>
    );
  return (
    <Screen>
      <PageHeader eyebrow="ADMIN OPERATIONS" title="CV review queue" />
      <View style={styles.notice}>
        <Ionicons name="shield-checkmark-outline" size={20} color="#087553" />
        <Text style={styles.noticeText}>
          CVs are private. Open them only when a member has requested or
          authorised GWMB review.
        </Text>
      </View>
      {!loading && total > 0 ? (
        <Text style={styles.queueMeta}>
          Showing {items.length} of {total} private CV records
        </Text>
      ) : null}
      {loading ? (
        <ActivityIndicator color={colors.pinkDeep} style={styles.loader} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No CVs yet</Text>
          <Text style={styles.copy}>
            Saved and uploaded CVs will appear here.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {items.map((item) => {
            const analysis = item.analysis as CvAnalysis;
            return (
              <View key={item.id} style={styles.card}>
                <View style={styles.top}>
                  <View style={styles.icon}>
                    <Ionicons
                      name={
                        item.source === "uploaded"
                          ? "cloud-upload-outline"
                          : "create-outline"
                      }
                      size={20}
                      color={colors.pinkDeep}
                    />
                  </View>
                  <View style={styles.cardCopy}>
                    <Text style={styles.kicker}>
                      {item.source.toUpperCase()} · {item.status.toUpperCase()}
                    </Text>
                    <Text style={styles.title}>{item.name}</Text>
                    <Text style={styles.meta}>
                      {item.target_role || "General professional CV"} · Updated{" "}
                      {new Date(item.updated_at).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
                {analysis?.priorityFixes?.length ? (
                  <Text style={styles.reviewMeta}>
                    {analysis.priorityFixes.length} priority recommendations
                    saved
                  </Text>
                ) : null}
                {item.original_file_path ? (
                  <Pressable
                    onPress={() => void openOriginal(item)}
                    style={styles.open}
                  >
                    <Text style={styles.openText}>
                      Open authorised review copy
                    </Text>
                    <Ionicons name="open-outline" size={16} color="white" />
                  </Pressable>
                ) : null}
              </View>
            );
          })}
          {hasMore ? (
            <Pressable
              disabled={loadingMore}
              onPress={() => void loadMore()}
              style={styles.loadMore}
            >
              {loadingMore ? (
                <ActivityIndicator color={colors.ink} />
              ) : (
                <>
                  <Text style={styles.loadMoreText}>Load more CV records</Text>
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

const styles = StyleSheet.create({
  loader: { marginTop: 90 },
  notice: {
    borderRadius: 17,
    backgroundColor: "#EAF7F2",
    padding: 13,
    flexDirection: "row",
    gap: 9,
  },
  noticeText: {
    flex: 1,
    color: "#41675A",
    fontSize: 9,
    lineHeight: 15,
    fontFamily: fonts.body,
  },
  queueMeta: {
    color: colors.muted,
    fontSize: 8.5,
    fontFamily: fonts.bodyMedium,
    marginTop: 11,
  },
  list: { gap: 10, marginTop: 16 },
  loadMore: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "white",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  loadMoreText: {
    color: colors.ink,
    fontSize: 9,
    fontFamily: fonts.bodyBold,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "white",
    padding: 14,
  },
  top: { flexDirection: "row", gap: 11 },
  icon: {
    width: 45,
    height: 45,
    borderRadius: 15,
    backgroundColor: colors.pinkSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  cardCopy: { flex: 1, minWidth: 0 },
  kicker: {
    color: colors.pinkDeep,
    fontSize: 8,
    fontFamily: fonts.bodyBold,
    letterSpacing: 0.8,
  },
  title: {
    color: colors.ink,
    fontSize: 14,
    fontFamily: fonts.headingBold,
    marginTop: 4,
  },
  meta: {
    color: colors.muted,
    fontSize: 9,
    lineHeight: 14,
    fontFamily: fonts.body,
    marginTop: 3,
  },
  reviewMeta: {
    color: colors.ink,
    fontSize: 9,
    fontFamily: fonts.bodySemibold,
    marginTop: 11,
  },
  open: {
    minHeight: 42,
    borderRadius: 13,
    backgroundColor: colors.ink,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 11,
  },
  openText: { color: "white", fontSize: 9, fontFamily: fonts.bodyBold },
  empty: { alignItems: "center", padding: 30, marginTop: 35 },
  emptyTitle: { color: colors.ink, fontSize: 20, fontFamily: fonts.heading },
  copy: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 16,
    fontFamily: fonts.body,
    marginTop: 5,
  },
});
