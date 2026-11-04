import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { type ComponentProps, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { AppStateView } from "@/components/states/AppStateView";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { colors, fonts } from "@/theme";

const interests = [
  "Events",
  "Community projects",
  "Content & media",
  "Member support",
] as const;

export default function VolunteerScreen() {
  const { user, profile } = useAuth();
  const [fullName, setFullName] = useState(
    () => profile?.full_name ?? String(user?.user_metadata?.full_name ?? ""),
  );
  const [email, setEmail] = useState(() => user?.email ?? "");
  const [location, setLocation] = useState(
    () => profile?.city_club ?? String(user?.user_metadata?.city ?? ""),
  );
  const [interest, setInterest] =
    useState<(typeof interests)[number]>("Events");
  const [availability, setAvailability] = useState("");
  const [motivation, setMotivation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = useMemo(
    () =>
      fullName.trim().length >= 2 &&
      email.includes("@") &&
      location.trim().length >= 2 &&
      availability.trim().length >= 3 &&
      motivation.trim().length >= 20,
    [availability, email, fullName, location, motivation],
  );

  async function submit() {
    setError(null);
    if (!user) {
      router.push("/sign-in");
      return;
    }
    if (!valid) {
      setError(
        "Complete every field and tell us a little more about how you would like to help.",
      );
      return;
    }
    setSubmitting(true);
    const { error: submissionError } = await supabase.rpc(
      "submit_volunteer_application",
      {
        p_full_name: fullName.trim(),
        p_location: location.trim(),
        p_interest_area: interest,
        p_availability: availability.trim(),
        p_motivation: motivation.trim(),
      },
    );
    setSubmitting(false);
    if (submissionError) {
      setError(submissionError.message);
      return;
    }
    setSubmitted(true);
  }

  if (submitted)
    return (
      <Screen>
        <PageHeader title="Volunteer with GWMB" eyebrow="Community" />
        <AppStateView
          kind="success"
          title="Application received"
          copy="Thank you for offering your time and skills. The GWMB team will review your application and contact you about a suitable opportunity."
          actionLabel="Return to Community"
          onAction={() => router.replace("/community")}
        />
      </Screen>
    );

  return (
    <Screen>
      <PageHeader title="Volunteer with GWMB" eyebrow="Community" />
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="heart" size={24} color="white" />
        </View>
        <Text style={styles.heroKicker}>MAKE A DIFFERENCE</Text>
        <Text style={styles.heroTitle}>
          Bring your skills into the community.
        </Text>
        <Text style={styles.heroCopy}>
          Tell us where you would like to help. We’ll match your interests and
          availability to upcoming events, projects and member initiatives.
        </Text>
      </View>
      {!user ? (
        <View style={styles.signIn}>
          <Ionicons
            name="person-circle-outline"
            size={25}
            color={colors.pinkDeep}
          />
          <View style={styles.signInCopy}>
            <Text style={styles.signInTitle}>Sign in before you apply</Text>
            <Text style={styles.signInText}>
              Your details will stay connected to your GWMB account.
            </Text>
          </View>
          <Pressable onPress={() => router.push("/sign-in")}>
            <Text style={styles.signInAction}>Sign in</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.form}>
        <Field
          label="FULL NAME"
          value={fullName}
          onChangeText={setFullName}
          placeholder="Your full name"
        />
        <Field
          label="EMAIL"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Field
          label="CITY OR CHAPTER"
          value={location}
          onChangeText={setLocation}
          placeholder="e.g. Lagos or OAU"
        />
        <Text style={styles.label}>WHERE WOULD YOU LIKE TO HELP?</Text>
        <View style={styles.interests}>
          {interests.map((item) => (
            <Pressable
              key={item}
              onPress={() => setInterest(item)}
              style={[
                styles.interest,
                interest === item && styles.interestActive,
              ]}
            >
              <Text
                style={[
                  styles.interestText,
                  interest === item && styles.interestTextActive,
                ]}
              >
                {item}
              </Text>
            </Pressable>
          ))}
        </View>
        <Field
          label="AVAILABILITY"
          value={availability}
          onChangeText={setAvailability}
          placeholder="e.g. Two Saturdays each month"
        />
        <Field
          label="HOW WOULD YOU LIKE TO CONTRIBUTE?"
          value={motivation}
          onChangeText={setMotivation}
          placeholder="Share the skills, experience or support you can offer."
          multiline
          minHeight={118}
        />
        {error ? (
          <View style={styles.error}>
            <Ionicons name="alert-circle-outline" size={18} color="#A81455" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        <Pressable
          disabled={submitting}
          onPress={() => void submit()}
          style={[styles.submit, submitting && styles.submitDisabled]}
        >
          <Text style={styles.submitText}>
            {submitting
              ? "Submitting…"
              : user
                ? "Submit application"
                : "Sign in to submit"}
          </Text>
          <Ionicons name="arrow-forward" size={19} color="white" />
        </Pressable>
      </View>
    </Screen>
  );
}

function Field({
  label,
  minHeight,
  ...props
}: { label: string; minHeight?: number } & ComponentProps<typeof TextInput>) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor="#918A8F"
        style={[
          styles.input,
          minHeight
            ? { minHeight, textAlignVertical: "top", paddingTop: 16 }
            : null,
        ]}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: 26,
    backgroundColor: "#231638",
    padding: 20,
    overflow: "hidden",
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#B3175D",
    alignItems: "center",
    justifyContent: "center",
  },
  heroKicker: {
    color: "#F4B8D6",
    fontSize: 8,
    fontFamily: fonts.bodyBold,
    letterSpacing: 1.1,
    marginTop: 18,
  },
  heroTitle: {
    color: "white",
    fontSize: 24,
    lineHeight: 29,
    fontFamily: fonts.headingBold,
    letterSpacing: -0.65,
    marginTop: 5,
  },
  heroCopy: {
    color: "rgba(255,255,255,.78)",
    fontSize: 11,
    lineHeight: 17,
    fontFamily: fonts.body,
    marginTop: 8,
    maxWidth: 380,
  },
  signIn: {
    minHeight: 76,
    borderRadius: 18,
    backgroundColor: "#FCE8F1",
    borderWidth: 1,
    borderColor: "#EBCDDD",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
  },
  signInCopy: { flex: 1 },
  signInTitle: {
    fontSize: 11,
    fontFamily: fonts.headingBold,
    color: colors.ink,
  },
  signInText: {
    fontSize: 8.5,
    lineHeight: 13,
    fontFamily: fonts.body,
    color: colors.muted,
    marginTop: 3,
  },
  signInAction: {
    fontSize: 9,
    fontFamily: fonts.bodyBold,
    color: colors.pinkDeep,
  },
  form: { marginTop: 7 },
  label: {
    color: colors.ink,
    fontSize: 8,
    fontFamily: fonts.bodyBold,
    letterSpacing: 0.9,
    marginTop: 16,
    marginBottom: 7,
  },
  input: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "white",
    paddingHorizontal: 14,
    color: colors.ink,
    fontSize: 11,
    fontFamily: fonts.body,
  },
  interests: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  interest: {
    minHeight: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "white",
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  interestActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  interestText: {
    color: colors.muted,
    fontSize: 9,
    fontFamily: fonts.bodyBold,
  },
  interestTextActive: { color: "white" },
  error: {
    borderRadius: 15,
    backgroundColor: "#FCE8F1",
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
  },
  errorText: {
    flex: 1,
    color: "#7F123F",
    fontSize: 9,
    lineHeight: 14,
    fontFamily: fonts.bodyMedium,
  },
  submit: {
    minHeight: 54,
    borderRadius: 17,
    backgroundColor: colors.pinkDeep,
    paddingHorizontal: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: "white", fontSize: 11, fontFamily: fonts.bodyBold },
});
