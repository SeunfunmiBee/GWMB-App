import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';
import { NotificationComposer } from '@/components/admin/NotificationComposer';
import { apiCall } from '@/lib/auth';
import { colors, fonts } from '@/theme';

type Counts = { pending: number; sent: number; failed: number; skipped: number };
type OperationsTask = { id: string; title: string; detail: string | null; priority: string; due_at: string | null };
type StatusCounts = Partial<Record<keyof Counts | 'processing', number>>;
type Broadcast = { id: string; title: string; body: string; audience: string; test: boolean; scheduled_for: string; channels: Record<string, StatusCounts>; error: string | null };

const empty: Counts = { pending: 0, sent: 0, failed: 0, skipped: 0 };
const CHANNEL_LABEL: Record<string, string> = { in_app: 'In-app', push: 'Push', email: 'Email' };
const AUDIENCE_LABEL: Record<string, string> = { everyone: 'Everyone', members: 'Verified members', 'app-users': 'Non-members', people: 'Specific people', test: 'Test to me' };
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export default function AdminNotifications() {
  const [counts, setCounts] = useState<Counts>(empty);
  const [history, setHistory] = useState<Broadcast[]>([]);
  const [tasks, setTasks] = useState<OperationsTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState(false);

  const refresh = useCallback(async () => {
    const [overview, sent] = await Promise.all([
      apiCall<{ counts: Partial<Counts>; tasks: OperationsTask[] }>('/v1/admin/notifications/overview'),
      apiCall<Broadcast[]>('/v1/admin/notifications/history'),
    ]);
    setCounts({ ...empty, ...overview.data?.counts });
    setTasks(overview.data?.tasks ?? []);
    setHistory(sent.data ?? []);
    setLoading(false);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh(); }, [refresh]);

  async function dispatch() {
    setDispatching(true);
    const { data, error } = await apiCall<{ sent: number; skipped: number; failed: number }>('/v1/admin/notifications/dispatch', { method: 'POST' });
    setDispatching(false);
    if (error) return Alert.alert('Sending could not run', error.message);
    await refresh();
    Alert.alert('Done', `${data?.sent ?? 0} sent · ${data?.skipped ?? 0} skipped · ${data?.failed ?? 0} failed`);
  }

  return <Screen form>
    <PageHeader eyebrow="ADMIN OPERATIONS" title="Notifications" />
    <View style={styles.hero}>
      <View style={styles.heroIcon}><Ionicons name="notifications" size={27} color="white" /></View>
      <Text style={styles.heroTitle}>Message your users</Text>
      <Text style={styles.heroCopy}>Send to the in-app inbox, phones and email. Scheduled messages go out automatically, checked every minute.</Text>
    </View>
    <NotificationComposer onQueued={() => void refresh()} />
    {loading ? <View style={styles.loading}><ActivityIndicator color={colors.pinkDeep} /></View> : <>
      <View style={styles.grid}>{(Object.keys(empty) as (keyof Counts)[]).map((status) => <View key={status} style={styles.stat}><Text style={styles.statValue}>{counts[status]}</Text><Text style={styles.statLabel}>{status.toUpperCase()}</Text></View>)}</View>
      {counts.pending ? <Pressable disabled={dispatching} onPress={() => void dispatch()} style={styles.button}>{dispatching ? <ActivityIndicator color="white" /> : <><Text style={styles.buttonText}>Send everything due now</Text><Ionicons name="paper-plane-outline" size={18} color="white" /></>}</Pressable> : null}
      <Text style={styles.section}>Sent and scheduled</Text>
      {history.length ? <View style={styles.list}>{history.map((b) => <BroadcastRow key={b.id} item={b} />)}</View> : <Text style={styles.emptyText}>Nothing sent yet. Messages you send appear here with their delivery results.</Text>}
    </>}
    {tasks.length ? <><Text style={styles.section}>Mentorship actions</Text><View style={styles.list}>{tasks.map((task) => <View key={task.id} style={styles.task}><View style={[styles.taskDot, task.priority === 'urgent' && styles.taskUrgent]} /><View style={styles.flex}><Text style={styles.rowTitle}>{task.title}</Text>{task.detail ? <Text style={styles.rowText}>{task.detail}</Text> : null}</View></View>)}</View></> : null}
    <Text style={styles.section}>Channels</Text>
    <View style={styles.list}>
      <Channel icon="notifications-outline" title="In-app inbox" status="Live" />
      <Channel icon="phone-portrait-outline" title="Push (Android)" status="Live for users who allow it" />
      <Channel icon="mail-outline" title="Email" status="Live" />
      <Channel icon="chatbubbles-outline" title="SMS and WhatsApp" status="Coming soon" muted />
    </View>
  </Screen>;
}

function BroadcastRow({ item }: { item: Broadcast }) {
  const scheduled = Object.values(item.channels).every((c) => !c.sent && !c.skipped && !c.failed && !c.processing);
  return <View style={styles.row}>
    <View style={styles.rowHead}>
      <Text style={[styles.rowTitle, styles.flex]} numberOfLines={1}>{item.title}</Text>
      {item.test ? <Text style={styles.badge}>TEST</Text> : null}
    </View>
    <Text style={styles.rowText} numberOfLines={2}>{item.body}</Text>
    <Text style={styles.rowMeta}>{AUDIENCE_LABEL[item.audience] ?? item.audience} · {scheduled ? `Scheduled for ${when(item.scheduled_for)}` : when(item.scheduled_for)}</Text>
    <View style={styles.channelStats}>{Object.entries(item.channels).map(([channel, c]) => <Text key={channel} style={styles.channelStat}>
      <Text style={styles.channelStatName}>{CHANNEL_LABEL[channel] ?? channel}</Text>{'  '}
      {[c.sent && `${c.sent} sent`, (c.pending || c.processing) && `${(c.pending ?? 0) + (c.processing ?? 0)} waiting`, c.skipped && `${c.skipped} skipped`, c.failed && `${c.failed} failed`].filter(Boolean).join(' · ')}
    </Text>)}</View>
    {item.error ? <Text style={styles.error}>Last error: {item.error}</Text> : null}
  </View>;
}

function Channel({ icon, title, status, muted = false }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; status: string; muted?: boolean }) {
  return <View style={styles.channel}><View style={styles.channelIcon}><Ionicons name={icon} size={18} color={colors.pinkDeep} /></View><Text style={styles.channelTitle}>{title}</Text><Text style={[styles.channelStatus, muted && styles.muted]}>{status}</Text></View>;
}

const styles = StyleSheet.create({
  hero: { borderRadius: 24, backgroundColor: colors.ink, padding: 21 },
  heroIcon: { width: 49, height: 49, borderRadius: 16, backgroundColor: colors.pinkDeep, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: 'white', fontSize: 22, fontFamily: fonts.heading, marginTop: 20 },
  heroCopy: { color: '#D6CFD3', fontSize: 14, lineHeight: 21, fontFamily: fonts.body, marginTop: 6 },
  loading: { height: 160, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 14 },
  stat: { flexGrow: 1, flexBasis: 120, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 16 },
  statValue: { color: colors.ink, fontSize: 25, fontFamily: fonts.heading },
  statLabel: { color: colors.muted, fontSize: 12, fontFamily: fonts.bodyBold, letterSpacing: .8, marginTop: 4 },
  button: { minHeight: 52, borderRadius: 16, backgroundColor: colors.pinkDeep, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  buttonText: { color: 'white', fontSize: 14.5, fontFamily: fonts.bodyBold },
  section: { fontFamily: fonts.heading, fontSize: 18, color: colors.ink, marginTop: 26, marginBottom: 10 },
  list: { gap: 8 },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.body },
  row: { borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 14 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { color: colors.ink, fontSize: 15, fontFamily: fonts.headingBold },
  rowText: { color: colors.muted, fontSize: 14, lineHeight: 19, fontFamily: fonts.body, marginTop: 3 },
  rowMeta: { color: colors.muted, fontSize: 12.5, fontFamily: fonts.bodyBold, marginTop: 8 },
  badge: { color: colors.pinkDeep, backgroundColor: colors.pinkSoft, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, fontSize: 11, fontFamily: fonts.bodyBold, letterSpacing: .6 },
  channelStats: { gap: 3, marginTop: 8 },
  channelStat: { color: colors.ink, fontSize: 13, fontFamily: fonts.body },
  channelStatName: { fontFamily: fonts.bodyBold },
  error: { color: '#B42318', fontSize: 12.5, fontFamily: fonts.body, marginTop: 6 },
  task: { minHeight: 60, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  taskDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#8F898D' },
  taskUrgent: { backgroundColor: '#C33939' },
  flex: { flex: 1 },
  channel: { minHeight: 58, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' },
  channelIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.pinkSoft, alignItems: 'center', justifyContent: 'center' },
  channelTitle: { flex: 1, color: colors.ink, fontSize: 14, fontFamily: fonts.bodyBold, marginLeft: 10 },
  channelStatus: { color: colors.pinkDeep, fontSize: 13, fontFamily: fonts.bodyBold },
  muted: { color: colors.muted },
});
