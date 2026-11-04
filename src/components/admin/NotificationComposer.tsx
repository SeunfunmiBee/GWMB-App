import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AdminDateTimeField } from '@/components/admin/AdminDateTimeField';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme';

const audiences = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'members', label: 'Members' },
  { value: 'app-users', label: 'App users' },
];
const channelOptions = [
  { value: 'in_app', label: 'In-app' },
  { value: 'push', label: 'Push' },
  { value: 'email', label: 'Email' },
];

export function NotificationComposer({ onQueued }: { onQueued?: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [route, setRoute] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [audience, setAudience] = useState('everyone');
  const [channels, setChannels] = useState(['in_app']);
  const [saving, setSaving] = useState(false);

  function toggleChannel(value: string) {
    setChannels((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  async function queue() {
    if (!title.trim() || !body.trim()) {
      Alert.alert('Complete the notification', 'Add a title and message before scheduling it.');
      return;
    }
    if (!channels.length) {
      Alert.alert('Choose a channel', 'Select at least one place to send this notification.');
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.rpc('queue_admin_notification', {
      p_title: title.trim(),
      p_body: body.trim(),
      p_route: route.trim() || null,
      p_audience: audience,
      p_channels: channels,
      p_scheduled_for: scheduledFor || new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      Alert.alert('Could not schedule notification', error.message);
      return;
    }
    const queued = typeof data === 'number' ? data : 0;
    Alert.alert('Notification scheduled', `${queued} delivery${queued === 1 ? '' : 'ies'} added to the queue.`);
    setTitle('');
    setBody('');
    setRoute('');
    setScheduledFor('');
    setAudience('everyone');
    setChannels(['in_app']);
    setOpen(false);
    onQueued?.();
  }

  if (!open) {
    return <Pressable onPress={() => setOpen(true)} style={styles.openButton}>
      <View style={styles.openIcon}><Ionicons name="add" size={23} color="white" /></View>
      <View style={styles.openCopy}>
        <Text style={styles.openTitle}>Create notification</Text>
        <Text style={styles.openMeta}>Message an audience now or schedule it.</Text>
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
    <Field label="APP DESTINATION" value={route} onChange={setRoute} placeholder="Optional, e.g. /career-readiness" />
    <Text style={styles.label}>AUDIENCE</Text>
    <View style={styles.options}>{audiences.map((item) => <Choice key={item.value} label={item.label} active={audience === item.value} onPress={() => setAudience(item.value)} />)}</View>
    <Text style={styles.label}>NOTIFY THROUGH</Text>
    <View style={styles.options}>{channelOptions.map((item) => <Choice key={item.value} label={item.label} active={channels.includes(item.value)} onPress={() => toggleChannel(item.value)} />)}</View>
    <Text style={styles.providerNote}>SMS and WhatsApp will appear here only after their provider and consent flows are connected.</Text>
    <AdminDateTimeField label="SEND DATE & TIME" value={scheduledFor} onChange={setScheduledFor} optional />
    <Pressable disabled={saving} onPress={() => void queue()} style={[styles.queue, saving && styles.disabled]}>
      <Text style={styles.queueText}>{saving ? 'Scheduling…' : 'Schedule notification'}</Text>
      <Ionicons name="calendar-outline" size={18} color="white" />
    </Pressable>
  </View>;
}

function Field({ label, value, onChange, placeholder, multiline = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; multiline?: boolean }) {
  return <View><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#999296" multiline={multiline} style={[styles.input, multiline && styles.multiline]} /></View>;
}

function Choice({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.choice, active && styles.choiceOn]}>
    <Ionicons name={active ? 'checkmark-circle' : 'ellipse-outline'} size={15} color={active ? 'white' : colors.muted} />
    <Text style={[styles.choiceText, active && styles.choiceTextOn]}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  openButton: { minHeight: 79, borderRadius: 19, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 12, flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  openIcon: { width: 47, height: 47, borderRadius: 15, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  openCopy: { flex: 1, paddingHorizontal: 12 },
  openTitle: { fontFamily: fonts.headingBold, fontSize: 13, color: colors.ink },
  openMeta: { fontFamily: fonts.body, fontSize: 9, color: colors.muted, marginTop: 3 },
  composer: { borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: '#F7F6F7', padding: 15, marginTop: 14 },
  composerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { fontFamily: fonts.bodyBold, fontSize: 8, letterSpacing: 1.1, color: colors.pinkDeep },
  title: { fontFamily: fonts.headingBold, fontSize: 18, color: colors.ink, marginTop: 4 },
  close: { width: 39, height: 39, borderRadius: 12, backgroundColor: '#EAE8EA', alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fonts.bodyBold, fontSize: 8.5, letterSpacing: .8, color: colors.ink, marginTop: 16, marginBottom: 7 },
  input: { minHeight: 55, borderRadius: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: 'white', padding: 13, fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.ink },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choice: { minHeight: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.line, backgroundColor: 'white', paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6 },
  choiceOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  choiceText: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.muted },
  choiceTextOn: { color: 'white' },
  providerNote: { fontFamily: fonts.body, fontSize: 8.5, lineHeight: 13, color: colors.muted, marginTop: 9 },
  queue: { height: 54, borderRadius: 16, backgroundColor: colors.pinkDeep, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  queueText: { fontFamily: fonts.headingBold, fontSize: 11, color: 'white' },
  disabled: { opacity: .6 },
});
