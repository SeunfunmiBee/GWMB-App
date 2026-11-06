import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthField } from '@/components/AuthField';
import { AuthScreen } from '@/components/AuthScreen';
import { sendVerificationCode, verifyEmail } from '@/lib/auth';
import { completeWelcome } from '@/lib/first-launch';
import { colors, fonts } from '@/theme';

// Only in-app destinations are allowed after verification.
const NEXT_ROUTES = new Set(['/', '/verify-membership']);

export default function VerifyEmailScreen() {
  const params = useLocalSearchParams<{ email?: string; next?: string }>();
  const email = String(params.email ?? '').trim().toLowerCase();
  const next = NEXT_ROUTES.has(String(params.next)) ? String(params.next) : '/';
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function confirm() {
    setMessage(null);
    if (!/^\d{6}$/.test(code.trim())) { setMessage('Enter the 6-digit code from your email.'); return; }
    setLoading(true);
    const { error } = await verifyEmail(email, code);
    setLoading(false);
    if (error) { setMessage(error); return; }
    completeWelcome();
    router.replace(next as never);
  }

  async function resend() {
    setMessage(null);
    setNotice(null);
    const { error } = await sendVerificationCode(email);
    if (error) setMessage(error);
    else setNotice('A new code is on its way.');
  }

  if (!email) {
    return <AuthScreen eyebrow="One more step" title="Confirm your email" description="Start again from sign in so we know which email to confirm.">
      <Pressable onPress={() => router.replace('/sign-in')} style={styles.submit}><Text style={styles.submitText}>Go to sign in</Text></Pressable>
    </AuthScreen>;
  }

  return <AuthScreen eyebrow="One more step" title="Confirm your email" description={`We sent a 6-digit code to ${email}.`}>
    <AuthField label="Verification code" value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6}/>
    {message ? <View style={styles.message}><Text style={styles.messageText}>{message}</Text></View> : null}
    {notice ? <Text style={styles.notice}>{notice}</Text> : null}
    <Pressable disabled={loading} onPress={() => void confirm()} style={[styles.submit, loading && styles.disabled]}>
      {loading ? <ActivityIndicator color="white"/> : <Text style={styles.submitText}>Confirm email</Text>}
    </Pressable>
    <Pressable onPress={() => void resend()} style={styles.link}><Text style={styles.linkText}>Send a new code</Text></Pressable>
    <Text style={styles.hint}>Check spam or promotions if it is not in your inbox. Codes expire after 10 minutes.</Text>
  </AuthScreen>;
}

const styles = StyleSheet.create({
  message: { borderRadius: 12, backgroundColor: '#FFF0F3', padding: 11 },
  messageText: { color: '#A31D43', fontSize: 11, lineHeight: 16, fontFamily: fonts.body },
  notice: { color: colors.muted, fontSize: 11, fontFamily: fonts.bodyMedium, marginTop: 4 },
  submit: { minHeight: 54, borderRadius: 16, backgroundColor: colors.pinkDeep, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  disabled: { opacity: 0.6 },
  submitText: { color: 'white', fontSize: 13, fontFamily: fonts.bodyBold },
  link: { alignItems: 'center', paddingTop: 20, paddingBottom: 6 },
  linkText: { color: colors.pinkDeep, fontSize: 11, fontFamily: fonts.bodyBold },
  hint: { color: colors.muted, fontSize: 10, lineHeight: 15, fontFamily: fonts.body, textAlign: 'center', marginTop: 8 },
});
