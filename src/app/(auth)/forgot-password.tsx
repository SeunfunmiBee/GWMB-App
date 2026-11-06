import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthField } from '@/components/AuthField';
import { AuthScreen } from '@/components/AuthScreen';
import { requestPasswordReset, resetPassword } from '@/lib/auth';
import { colors, fonts } from '@/theme';

type Step = 'email' | 'code' | 'done';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('email');
  const [loading, setLoading] = useState(false);

  const normalizedEmail = email.trim().toLowerCase();

  async function sendCode() {
    if (!normalizedEmail.includes('@')) {
      setMessage('Enter a valid email address.');
      return;
    }
    setLoading(true);
    setMessage(null);
    const { error } = await requestPasswordReset(normalizedEmail);
    setLoading(false);
    if (error) { setMessage(error); return; }
    setStep('code');
  }

  async function saveNewPassword() {
    setMessage(null);
    if (!/^\d{6}$/.test(code.trim())) { setMessage('Enter the 6-digit code from your email.'); return; }
    if (password.length < 8) { setMessage('Use at least 8 characters for your password.'); return; }
    if (password !== confirm) { setMessage('The passwords do not match.'); return; }
    setLoading(true);
    const { error } = await resetPassword(normalizedEmail, code, password);
    setLoading(false);
    if (error) { setMessage(error); return; }
    setStep('done');
  }

  const errorBox = message ? (
    <View style={styles.message}>
      <Text style={styles.messageText}>{message}</Text>
    </View>
  ) : null;

  if (step === 'done') {
    return (
      <AuthScreen eyebrow="Password updated" title="You’re ready to continue" description="Your new password is active. Sign in with it now.">
        <View style={styles.sent}>
          <Text style={styles.sentMark}>✓</Text>
          <Text style={styles.sentTitle}>Your account is secure</Text>
        </View>
        <Pressable onPress={() => router.replace('/sign-in')} style={styles.submit}>
          <Text style={styles.submitText}>Go to sign in</Text>
        </Pressable>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      eyebrow="Account recovery"
      title={step === 'code' ? 'Choose a new password' : 'Reset your password'}
      description={
        step === 'code'
          ? `Enter the 6-digit code we sent to ${normalizedEmail}, then choose a new password.`
          : 'Enter the email address connected to your GWMB account.'
      }>
      {step === 'code' ? (
        <>
          <AuthField label="Reset code" value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} />
          <AuthField label="New password" value={password} onChangeText={setPassword} placeholder="At least 8 characters" password autoComplete="new-password" />
          <AuthField label="Confirm new password" value={confirm} onChangeText={setConfirm} placeholder="Repeat your password" password autoComplete="new-password" />
          {errorBox}
          <Pressable disabled={loading} onPress={saveNewPassword} style={[styles.submit, loading && styles.disabled]}>
            {loading ? <ActivityIndicator color="white" /> : <Text style={styles.submitText}>Update password</Text>}
          </Pressable>
          <Pressable disabled={loading} onPress={sendCode} style={styles.resend}>
            <Text style={styles.resendText}>Send a new code</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setStep('email');
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
          {errorBox}
          <Pressable disabled={loading} onPress={sendCode} style={[styles.submit, loading && styles.disabled]}>
            {loading ? <ActivityIndicator color="white" /> : <Text style={styles.submitText}>Send reset code</Text>}
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
});
