import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AdminDateTimeField } from '@/components/admin/AdminDateTimeField';
import { apiCall } from '@/lib/auth';
import { colors, fonts } from '@/theme';

type Audience = 'everyone' | 'members' | 'app-users' | 'people';
type Channel = 'in_app' | 'push' | 'email';
type BroadcastResult = { queued: number; missing: string[]; dispatch?: { sent: number; skipped: number; failed: number } };

const audiences: { value: Audience; label: string }[] = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'members', label: 'Verified members' },
  { value: 'app-users', label: 'Non-members' },
  { value: 'people', label: 'Specific people' },
];
const channelOptions: { value: Channel; label: string; hint: string }[] = [
  { value: 'in_app', label: 'In-app', hint: 'Notifications inbox' },
  { value: 'push', label: 'Push', hint: 'Phones with push on' },
  { value: 'email', label: 'Email', hint: 'Unless they opted out' },
];

const parseEmails = (text: string) => [...new Set(text.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];

export function NotificationComposer({ onQueued }: { onQueued?: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [route, setRoute] = useState('');
  const [emails, setEmails] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [audience, setAudience] = useState<Audience>('everyone');
  const [channels, setChannels] = useState<Channel[]>(['in_app', 'push']);
  const [saving, setSaving] = useState<'send' | 'test' | null>(null);

  function toggleChannel(value: Channel) {
    setChannels((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  function reset() {
    setTitle(''); setBody(''); setRoute(''); setEmails(''); setScheduledFor(''); setAudience('everyone'); setChannels(['in_app', 'push']); setOpen(false);
  }

  async function submit(test: boolean) {
    if (!title.trim() || !body.trim()) return Alert.alert('Complete the notification', 'Add a title and message first.');
    if (!channels.length) return Alert.alert('Choose a channel', 'Select at least one way to send this notification.');
    const list = parseEmails(emails);
    if (!test && audience === 'people' && !list.length) return Alert.alert('Add recipients', 'Enter at least one email address.');
    setSaving(test ? 'test' : 'send');
    const { data, error } = await apiCall<BroadcastResult>('/v1/admin/notifications/broadcast', {
      method: 'POST',
      body: JSON.stringify({
        title: title.trim(), body: body.trim(), route: route.trim() || null, audience, channels, test,
        ...(audience === 'people' ? { emails: list } : {}),
        scheduled_for: scheduledFor || null,
      }),
    });
    setSaving(null);
    if (error || !data) return Alert.alert(test ? 'Test could not be sent' : 'Could not schedule notification', error?.message ?? 'Try again.');
    onQueued?.();
    if (test) {
      const d = data.dispatch;
      return Alert.alert('Test sent to you', d ? `${d.sent} delivered · ${d.skipped} skipped · ${d.failed} failed. Skipped push usually means push is off on your phone.` : 'Check your inbox.');
    }
    const missing = data.missing.length ? `\n\nNo app account for: ${data.missing.join(', ')}` : '';
    const when = scheduledFor ? 'It will go out at the scheduled time.' : 'It goes out within a minute.';
    Alert.alert('Notification scheduled', `${data.queued} deliver${data.queued === 1 ? 'y' : 'ies'} queued. ${when}${missing}`);
    reset();
  }

  if (!open) {
    return <Pressable onPress={() => setOpen(true)} style={styles.openButton}>
      <View style={styles.openIcon}><Ionicons name="add" size={23} color="white" /></View>
      <View style={styles.openCopy}>
        <Text style={styles.openTitle}>Create notification</Text>
        <Text style={styles.openMeta}>Message everyone, a group or specific people, now or later.</Text>
      </View>
      <Ionicons name="arrow-forward" size={18} color={colors.ink} />
    </Pressable>;
  }

  return <View style={styles.composer}>
    <View style={styles.composerHead}>
      <View>
        <Text style={styles.kicker}>NEW NOTIFICATION</Text>
        <Text style={styles.title}>Message your community</Text>
      </View>
      <Pressable accessibilityLabel="Close notification composer" onPress={() => setOpen(false)} style={styles.close}>
        <Ionicons name="close" size={20} color={colors.ink} />
      </Pressable>
    </View>
    <Field label="TITLE" value={title} onChange={setTitle} placeholder="What should people know?" />
    <Field label="MESSAGE" value={body} onChange={setBody} placeholder="Write the notification" multiline />
    <Field label="OPENS IN THE APP" value={route} onChange={setRoute} placeholder="Optional, e.g. /events or /cliques" />
    <Text style={styles.label}>AUDIENCE</Text>
    <View style={styles.options}>{audiences.map((item) => <Choice key={item.value} label={item.label} active={audience === item.value} onPress={() => setAudience(item.value)} />)}</View>
    {audience === 'people' ? <Field label="EMAIL ADDRESSES" value={emails} onChange={setEmails} placeholder="One per line, or separated by commas" multiline /> : null}
    <Text style={styles.label}>SEND THROUGH</Text>
    <View style={styles.options}>{channelOptions.map((item) => <Choice key={item.value} label={item.label} hint={item.hint} active={channels.includes(item.value)} onPress={() => toggleChannel(item.value)} />)}</View>
    <Text style={styles.providerNote}>SMS and WhatsApp are coming soon.</Text>
    <AdminDateTimeField label="SEND LATER" value={scheduledFor} onChange={setScheduledFor} optional />
    <View style={styles.actions}>
      <Pressable disabled={!!saving} onPress={() => void submit(true)} style={[styles.test, saving && styles.disabled]}>
        <Ionicons name="flask-outline" size={17} color={colors.ink} />
        <Text style={styles.testText}>{saving === 'test' ? 'Sending…' : 'Send test to me'}</Text>
      </Pressable>
      <Pressable disabled={!!saving} onPress={() => void submit(false)} style={[styles.queue, saving && styles.disabled]}>
        <Text style={styles.queueText}>{saving === 'send' ? 'Scheduling…' : scheduledFor ? 'Schedule' : 'Send now'}</Text>
        <Ionicons name={scheduledFor ? 'calendar-outline' : 'paper-plane-outline'} size={18} color="white" />
      </Pressable>
    </View>
  </View>;
}

function Field({ label, value, onChange, placeholder, multiline = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; multiline?: boolean }) {
  return <View><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#999296" multiline={multiline} autoCapitalize={label.includes('EMAIL') || label.includes('APP') ? 'none' : 'sentences'} style={[styles.input, multiline && styles.multiline]} /></View>;
}

function Choice({ label, hint, active, onPress }: { label: string; hint?: string; active: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: active }} onPress={onPress} style={[styles.choice, active && styles.choiceOn]}>
    <Ionicons name={active ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={active ? 'white' : colors.muted} />
    <Text style={[styles.choiceText, active && styles.choiceTextOn]}>{label}{hint ? <Text style={[styles.choiceHint, active && styles.choiceTextOn]}>{`  ${hint}`}</Text> : null}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  openButton: { minHeight: 79, borderRadius: 19, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 12, flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  openIcon: { width: 47, height: 47, borderRadius: 15, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  openCopy: { flex: 1, paddingHorizontal: 12 },
  openTitle: { fontFamily: fonts.headingBold, fontSize: 15, color: colors.ink },
  openMeta: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 3 },
  composer: { borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: '#F7F6F7', padding: 16, marginTop: 14 },
  composerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.1, color: colors.pinkDeep },
  title: { fontFamily: fonts.headingBold, fontSize: 20, color: colors.ink, marginTop: 4 },
  close: { width: 39, height: 39, borderRadius: 12, backgroundColor: '#EAE8EA', alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: .8, color: colors.ink, marginTop: 18, marginBottom: 7 },
  input: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: 'white', padding: 13, fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { minHeight: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: 'white', paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 7 },
  choiceOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  choiceText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.ink },
  choiceHint: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  choiceTextOn: { color: 'white' },
  providerNote: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 9 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  test: { height: 52, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: 'white', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  testText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink },
  queue: { flex: 1, minWidth: 180, height: 52, borderRadius: 16, backgroundColor: colors.pinkDeep, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  queueText: { fontFamily: fonts.headingBold, fontSize: 14, color: 'white' },
  disabled: { opacity: .6 },
});
