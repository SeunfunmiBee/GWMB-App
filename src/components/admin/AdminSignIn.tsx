import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthField } from '@/components/AuthField';
import { AuthScreen } from '@/components/AuthScreen';
import { signIn } from '@/lib/auth';
import { colors, fonts } from '@/theme';

// Sign-in for the web admin. On success AuthProvider picks up the session and the admin gate re-renders.
export function AdminSignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setMessage(null);
    if (!email.trim() || !password) { setMessage('Enter your email address and password.'); return; }
    setSubmitting(true);
    const { data, error } = await signIn(email.trim().toLowerCase(), password);
    setSubmitting(false);
    if (error || !data.user) setMessage(data.needsVerification ? 'Verify your email in the GWMB app first, then sign in here.' : error ?? 'Email or password is incorrect.');
  }

  return <AuthScreen showBack={false} eyebrow="GWMB ADMIN" title="Sign in to the admin" description="Use your approved GWMB administrator account.">
    <AuthField label="Email address" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoComplete="email"/>
    <AuthField label="Password" value={password} onChangeText={setPassword} placeholder="Enter your password" password autoComplete="current-password"/>
    {message ? <View style={styles.message}><Text style={styles.messageText}>{message}</Text></View> : null}
    <Pressable disabled={submitting} onPress={() => void submit()} style={[styles.submit, submitting && styles.disabled]}>
      {submitting ? <ActivityIndicator color="white"/> : <Text style={styles.submitText}>Sign in</Text>}
    </Pressable>
  </AuthScreen>;
}

const styles = StyleSheet.create({
  message: { borderRadius: 12, backgroundColor: '#FFF0F3', padding: 11, marginTop: 10 },
  messageText: { color: '#A31D43', fontSize: 10, lineHeight: 15, fontFamily: fonts.body },
  submit: { minHeight: 54, borderRadius: 16, backgroundColor: colors.pinkDeep, alignItems: 'center', justifyContent: 'center', marginTop: 17 },
  disabled: { opacity: 0.6 },
  submitText: { color: 'white', fontSize: 13, fontFamily: fonts.bodyBold },
});
