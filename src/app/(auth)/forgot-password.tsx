import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthField } from '@/components/AuthField';
import { AuthScreen } from '@/components/AuthScreen';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const normalizedEmail = email.trim().toLowerCase();

  async function sendCode() {
    if (!normalizedEmail.includes('@')) {
      setMessage('Enter a valid email address.');
      return;
    }

    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo: Linking.createURL('reset-password') });
    setLoading(false);
    if (error) { setMessage(error.message); return; }
    setSent(true);
  }

  return (
    <AuthScreen
      eyebrow="Account recovery"
      title={sent ? 'Check your email' : 'Reset your password'}
      description={
        sent
          ? `We sent a secure password reset link to ${normalizedEmail}.`
          : 'Enter the email address connected to your GWMB account.'
      }>
      {sent ? (
        <>
          <View style={styles.sent}>
            <Text style={styles.sentMark}>✦</Text>
            <Text style={styles.sentTitle}>Check your inbox</Text>
            <Text style={styles.sentCopy}>
              Open the link in the email to return to GWMB and choose a new password. Check spam or promotions if it is not in your inbox.
            </Text>
          </View>
          {message ? (
            <View style={styles.message}>
              <Text style={styles.messageText}>{message}</Text>
            </View>
          ) : null}
          <Pressable disabled={loading} onPress={sendCode} style={styles.resend}>
            <Text style={styles.resendText}>Send a new link</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setSent(false);
              setMessage(null);
            }}
            style={styles.changeEmail}>
            <Text style={styles.changeEmailText}>Use a different email address</Text>
          </Pressable>
        </>
      ) : (
        <>
          <AuthField
            label="Email address"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoComplete="email"
          />
          {message ? (
            <View style={styles.message}>
              <Text style={styles.messageText}>{message}</Text>
            </View>
          ) : null}
          <Pressable disabled={loading} onPress={sendCode} style={[styles.submit, loading && styles.disabled]}>
            {loading ? <ActivityIndicator color="white" /> : <Text style={styles.submitText}>Send reset link</Text>}
          </Pressable>
        </>
      )}
      <Pressable onPress={() => router.replace('/sign-in')} style={styles.back}>
        <Text style={styles.backText}>Back to sign in</Text>
      </Pressable>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  message: { borderRadius: 12, backgroundColor: '#FFF0F3', padding: 11 },
  messageText: { color: '#A31D43', fontSize: 11, lineHeight: 16, fontFamily: fonts.body },
  submit: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: colors.pinkDeep,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  disabled: { opacity: 0.6 },
  submitText: { color: 'white', fontSize: 13, fontFamily: fonts.bodyBold },
  resend: { alignItems: 'center', paddingTop: 20, paddingBottom: 6 },
  resendText: { color: colors.pinkDeep, fontSize: 11, fontFamily: fonts.bodyBold },
  changeEmail: { alignItems: 'center', paddingVertical: 9 },
  changeEmailText: { color: colors.muted, fontSize: 11, fontFamily: fonts.bodyMedium },
  back: { alignItems: 'center', paddingVertical: 19 },
  backText: { color: colors.pinkDeep, fontSize: 11, fontFamily: fonts.bodyBold },
  sent: {
    borderRadius: 21,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 22,
    alignItems: 'center',
    marginBottom: 20,
  },
  sentMark: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.pinkSoft,
    color: colors.pinkDeep,
    fontSize: 24,
    fontFamily: fonts.heading,
    lineHeight: 50,
    textAlign: 'center',
  },
  sentTitle: { color: colors.ink, fontSize: 15, fontFamily: fonts.heading, marginTop: 13 },
  sentCopy: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 18,
    fontFamily: fonts.body,
    textAlign: 'center',
    marginTop: 6,
  },
});
