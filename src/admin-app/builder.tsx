import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  CourseBuilderNav,
  type CourseBuilderSection,
} from "@/components/admin/CourseBuilderNav";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { AdminDateTimeField } from "@/components/admin/AdminDateTimeField";
import {
  loadAdminAdvancedOffer,
  saveAdminAdvancedOffer,
  type SecureAdvancedOffer,
} from "@/lib/advanced-program";
import {
  getEducationPlaceholder,
  type EducationKind,
} from "@/lib/admin-education";
import {
  createGoogleMeet,
  loadContentItem,
  pickAndUploadContentFile,
  pickAndUploadContentImage,
  saveContentItem,
  type ContentAccess,
  type ContentDraft,
  type ContentStatus,
  type ContentUploadController,
} from "@/lib/admin-content";
import {
  areaByType,
  blank,
  editableMeta,
  labels,
  programs,
  publicationIssues,
  slugify,
  type AdvancedProgramMeta,
  type BuilderMeta,
  type Lesson,
} from "@/lib/education-builder";
import { colors, fonts } from "@/theme";

export default function EducationBuilder() {
  const params = useLocalSearchParams<{
    type?: string;
    id?: string;
    source?: string;
    program?: string;
  }>();
  const type = (
    ["course", "event", "resource"].includes(params.type ?? "")
      ? params.type
      : "course"
  ) as EducationKind;
  const initial = () => {
    const base = blank(type);
    const source = params.source
      ? getEducationPlaceholder(type, params.source)
      : undefined;
    if (source)
      return {
        draft: {
          ...base,
          slug: source.id,
          title: source.title,
          eyebrow: source.eyebrow,
          summary: source.summary,
          access_level: source.access,
          starts_at: source.startsAt ?? null,
        } as ContentDraft,
        meta: source.metadata as BuilderMeta,
      };
    const metadata = base.metadata as BuilderMeta;
    return {
      draft: base,
      meta:
        type === "event" && params.program
          ? { ...metadata, program: params.program }
          : metadata,
    };
  };
  const [initialState] = useState(initial);
  const [draft, setDraft] = useState<ContentDraft>(initialState.draft);
  const [meta, setMeta] = useState<BuilderMeta>(initialState.meta);
  const [secureOffer, setSecureOffer] = useState<SecureAdvancedOffer>({
    benefitCode: "",
    maxClaims: "",
    active: true,
  });
  const [busy, setBusy] = useState(Boolean(params.id));
  const [saving, setSaving] = useState(false);
  const [lessonUploading, setLessonUploading] = useState(false);
  const [section, setSection] = useState<CourseBuilderSection>("overview");
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    if (params.id)
      void loadContentItem(params.id).then(async ({ data, error }) => {
        if (error) Alert.alert("Could not load item", error.message);
        if (data) {
          setDraft(data);
          setMeta(editableMeta(data));
          if (type === "course") {
            const offerResult = await loadAdminAdvancedOffer(data.id);
            if (offerResult.offer) setSecureOffer(offerResult.offer);
          }
        }
        setBusy(false);
      });
  }, [params.id, type]);
  function set<K extends keyof ContentDraft>(key: K, value: ContentDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  function detail<K extends keyof BuilderMeta>(key: K, value: BuilderMeta[K]) {
    setMeta((current) => ({ ...current, [key]: value }));
  }
  const title = useMemo(
    () =>
      draft.id
        ? `Edit ${type}`
        : params.source
          ? `Edit placeholder ${type}`
          : `New ${type}`,
    [draft.id, params.source, type],
  );
  async function cover() {
    setUploading(true);
    const result = await pickAndUploadContentImage(areaByType[type]);
    setUploading(false);
    if (result.error)
      Alert.alert("Could not upload image", result.error.message);
    else if (result.url) set("image_url", result.url);
  }
  async function uploadResource() {
    const format = String(meta.resource_type ?? "document");
    const mime =
      format === "pdf"
        ? "application/pdf"
        : format === "video"
          ? "video/*"
          : format === "image"
            ? "image/*"
            : [
                "application/pdf",
                "application/msword",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              ];
    setUploading(true);
    const result = await pickAndUploadContentFile(
      "resources",
      mime,
      draft.access_level === "members",
    );
    setUploading(false);
    if (result.error)
      Alert.alert("Could not upload file", result.error.message);
    else if (result.url) detail("url", result.url);
  }
  async function save() {
    if (saving || uploading || lessonUploading) return;
    if (!draft.title.trim()) return Alert.alert("Add a title");
    if (
      type === "course" &&
      meta.advanced_program?.enabled &&
      !meta.advanced_program.programme_url &&
      !meta.advanced_program.application_url
    )
      return Alert.alert("Add the advanced programme or application link");
    if (type === "event" && !draft.starts_at)
      return Alert.alert("Add the event start date and time");
    if (type === "resource" && !meta.url)
      return Alert.alert("Add a resource link or upload a file");
    const slug = draft.slug || slugify(draft.title);
    const route =
      draft.route ||
      `/${type === "course" ? "course" : type === "event" ? "event" : "resource"}/${slug}`;
    const readyDraft = { ...draft, slug, route };
    const issues = publicationIssues(type, readyDraft, meta);
    if (issues.length)
      return Alert.alert(
        "Complete before publishing",
        issues.map((issue) => `• ${issue}`).join("\n"),
      );
    setSaving(true);
    const result = await saveContentItem({
      ...readyDraft,
      area: areaByType[type],
      content_type: type,
      metadata: meta,
    });
    if (!result.error && result.data) setDraft(result.data as ContentDraft);
    if (
      !result.error &&
      type === "course" &&
      result.data &&
      meta.advanced_program?.enabled &&
      meta.advanced_program.offer_type !== "none"
    ) {
      const offerResult = await saveAdminAdvancedOffer(
        result.data.id,
        secureOffer,
      );
      if (offerResult.error) {
        setSaving(false);
        Alert.alert(
          "Course saved, but the protected offer was not saved",
          offerResult.error.message,
        );
        return;
      }
    }
    setSaving(false);
    if (result.error) Alert.alert("Could not save", result.error.message);
    else if (type === "course" && result.data) {
      setDraft(result.data as ContentDraft);
      setMeta(result.data.metadata ? editableMeta(result.data) : meta);
      Alert.alert(
        "Course saved",
        draft.status === "draft" ? "Your draft is saved in the content library." : "Your course changes have been saved.",
      );
    } else {
      Alert.alert("Saved", `This ${type} is now in the central library.`);
      router.replace("/education" as never);
    }
  }
  async function meet() {
    if (!draft.id) return Alert.alert("Save the event first");
    const result = await createGoogleMeet(draft.id);
    if (result.error)
      Alert.alert("Meet is not connected yet", result.error.message);
    else
      Alert.alert(
        "Google Meet created",
        "The private meeting link is attached to this event.",
      );
  }
  if (busy)
    return (
      <Screen form scroll={false}>
        <ActivityIndicator style={{ marginTop: 220 }} color={colors.pinkDeep} />
      </Screen>
    );
  return (
    <Screen form>
      <PageHeader eyebrow={labels[type].toUpperCase()} title={title} />
      {type === "course" ? (
        <CourseBuilderNav
          section={section}
          onSelect={setSection}
          title={draft.title || "Untitled course"}
          status={draft.status}
          lessonCount={meta.lessons?.length ?? 0}
        />
      ) : (
        <View style={styles.banner}>
          <View style={styles.bannerIcon}>
            <Ionicons
              name={
                type === "event" ? "calendar-outline" : "document-text-outline"
              }
              size={21}
              color="white"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>{labels[type]}</Text>
            <Text style={styles.bannerCopy}>
              {type === "event"
                ? "One event record can surface across Learn, Mentorship, Community and Home."
                : "Upload a file or connect Drive, YouTube and external links."}
            </Text>
          </View>
        </View>
      )}
      <View
        style={
          type === "course" && section !== "overview"
            ? styles.hidden
            : undefined
        }
      >
        <Field
          label="TITLE"
          value={draft.title}
          onChange={(value) => {
            set("title", value);
            if (
              !draft.id &&
              (!draft.slug || draft.slug === slugify(draft.title))
            )
              set("slug", slugify(value));
          }}
          placeholder={
            type === "course"
              ? "How Technology Careers Work"
              : type === "event"
                ? "Should You Become a Product Manager?"
                : "The CV Application Guide"
          }
        />
        <Field
          label="SHORT LABEL"
          value={draft.eyebrow ?? ""}
          onChange={(value) => set("eyebrow", value)}
          placeholder="Shown above the title"
        />
        <Field
          label="SHORT DESCRIPTION"
          value={draft.summary ?? ""}
          onChange={(value) => set("summary", value)}
          placeholder="The concise promise shown on cards"
          multiline
        />
        <Field
          label="FULL DETAILS"
          value={draft.body ?? ""}
          onChange={(value) => set("body", value)}
          placeholder="What should people know?"
          multiline
        />
        <Field
          label="COVER IMAGE URL"
          value={draft.image_url ?? ""}
          onChange={(value) => set("image_url", value)}
          placeholder="Paste an existing image URL or upload below"
        />
        <MediaImage
          value={draft.image_url ?? ""}
          uploading={uploading}
          onUpload={cover}
        />
      </View>
      {type === "course" ? (
        <CourseFields
          section={section}
          onUploadingChange={setLessonUploading}
          meta={meta}
          setMeta={setMeta}
          secureOffer={secureOffer}
          setSecureOffer={setSecureOffer}
          protectedUpload={draft.access_level === "members"}
        />
      ) : type === "event" ? (
        <EventFields
          draft={draft}
          setDraft={setDraft}
          meta={meta}
          setMeta={setMeta}
          onMeet={meet}
        />
      ) : (
        <ResourceFields
          meta={meta}
          setMeta={setMeta}
          uploading={uploading}
          onUpload={uploadResource}
        />
      )}
      <View
        style={
          type === "course" && section !== "publishing"
            ? styles.hidden
            : undefined
        }
      >
        {type === "course" ? (
          <View style={styles.readiness}>
            <Section
              title="Publication checklist"
              copy="Save a draft at any stage. Complete these details before publishing."
            />
            {!publicationIssues(
              type,
              {
                ...draft,
                status: "published",
                route: draft.route || "/course/preview",
              },
              meta,
            ).length ? (
              <Text style={styles.checklistItem}>
                All required course details are complete.
              </Text>
            ) : null}
            {publicationIssues(
              type,
              {
                ...draft,
                status: "published",
                route: draft.route || "/course/preview",
              },
              meta,
            ).map((issue) => (
              <Text key={issue} style={styles.checklistItem}>
                • {issue}
              </Text>
            ))}
          </View>
        ) : null}
        <Targeting meta={meta} setMeta={setMeta} />
        <Publishing draft={draft} setDraft={setDraft} />
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={saving || uploading || lessonUploading}
        onPress={save}
        style={[
          styles.save,
          (saving || uploading || lessonUploading) && { opacity: 0.5 },
        ]}
      >
        {saving ? (
          <ActivityIndicator color="white" />
        ) : (
          <>
            <Text style={styles.saveText}>
              {draft.status === "draft" ? "Save draft" : "Save " + type}
            </Text>
            <Ionicons name="arrow-forward" size={18} color="white" />
          </>
        )}
      </Pressable>
    </Screen>
  );
}

function CourseFields({
  section,
  onUploadingChange,
  meta,
  setMeta,
  secureOffer,
  setSecureOffer,
  protectedUpload,
}: {
  section: CourseBuilderSection;
  onUploadingChange: (value: boolean) => void;
  meta: BuilderMeta;
  setMeta: Dispatch<SetStateAction<BuilderMeta>>;
  secureOffer: SecureAdvancedOffer;
  setSecureOffer: (value: SecureAdvancedOffer) => void;
  protectedUpload: boolean;
}) {
  const lessons = meta.lessons ?? [];
  const resources = meta.resources ?? [];
  const instructor = meta.instructor ?? {
    name: "",
    role: "",
    bio: "",
    image_url: "",
  };
  const advanced =
    meta.advanced_program ??
    (blank("course").metadata as BuilderMeta).advanced_program!;
  const [expandedLesson, setExpandedLesson] = useState<number | null>(0);
  const [uploadingLesson, setUploadingLesson] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadControl, setUploadControl] =
    useState<ContentUploadController | null>(null);
  const [uploadPaused, setUploadPaused] = useState(false);
  function updateLesson(index: number, change: Partial<Lesson>) {
    setMeta((current) => ({
      ...current,
      lessons: (current.lessons ?? []).map((lesson, i) =>
        i === index ? { ...lesson, ...change } : lesson,
      ),
    }));
  }
  function updateAdvanced(change: Partial<AdvancedProgramMeta>) {
    setMeta({ ...meta, advanced_program: { ...advanced, ...change } });
  }
  function moveLesson(index: number, direction: number) {
    const next = [...lessons];
    const target = index + direction;
    if (uploadingLesson !== null || target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setMeta({ ...meta, lessons: next });
    setExpandedLesson(target);
  }
  function add() {
    let number = lessons.length + 1;
    while (lessons.some((lesson) => lesson.id === `lesson-${number}`)) number++;
    setExpandedLesson(lessons.length);
    setMeta({
      ...meta,
      lessons: [
        ...lessons,
        {
          id: `lesson-${number}`,
          title: "",
          summary: "",
          duration: "",
          media_type: "youtube",
          media_url: "",
          preview: false,
          objectives: [],
          sections: [{ heading: "", body: "" }],
          reflection: "",
        },
      ],
    });
  }
  async function uploadLesson(index: number) {
    onUploadingChange(true);
    setUploadingLesson(index);
    setUploadProgress(0);
    setUploadPaused(false);
    const result = await pickAndUploadContentFile(
      "courses/videos",
      "video/*",
      protectedUpload,
      { onProgress: setUploadProgress, onController: setUploadControl },
    );
    setUploadingLesson(null);
    onUploadingChange(false);
    setUploadControl(null);
    if (result.error && result.error.message !== "Upload cancelled.")
      Alert.alert("Could not upload lesson media", result.error.message);
    else if (result.url)
      updateLesson(index, { media_type: "upload", media_url: result.url });
  }
  return (
    <View>
      <View style={section !== "overview" ? styles.hidden : undefined}>
        <Section
          title="Course setup"
          copy="Use a scalable category and show who provides the learning."
        />
        <Choice
          label="PROVIDER"
          values={["GWMB", "Tech School Africa", "Learning Partner"]}
          selected={meta.provider ?? "GWMB"}
          onSelect={(provider) => setMeta({ ...meta, provider })}
        />
        <Choice
          label="LEVEL"
          values={["Beginner", "Intermediate", "Advanced", "All levels"]}
          selected={meta.level ?? "Beginner"}
          onSelect={(level) => setMeta({ ...meta, level })}
        />
        <Field
          label="CATEGORY"
          value={meta.category ?? ""}
          onChange={(category) => setMeta({ ...meta, category })}
          placeholder="Tech & Digital, Business, Creative or Professional"
        />
        <Field
          label="FIELD / SUBCATEGORY"
          value={meta.subcategory ?? ""}
          onChange={(subcategory) => setMeta({ ...meta, subcategory })}
          placeholder="Data, Product, HR, Sales..."
        />
        <Field
          label="TOTAL DURATION"
          value={meta.duration ?? ""}
          onChange={(duration) => setMeta({ ...meta, duration })}
          placeholder="45 min"
        />
        <Toggle
          title="Certificate included"
          copy="Show a certificate benefit on the course."
          value={Boolean(meta.certificate)}
          onChange={(certificate) => setMeta({ ...meta, certificate })}
        />
      </View>
      <View style={section !== "lecturer" ? styles.hidden : undefined}>
        <Section
          title="Lecturer"
          copy="Add the person learners will see on the course detail page."
        />
        <Field
          label="LECTURER NAME"
          value={instructor.name}
          onChange={(name) =>
            setMeta({ ...meta, instructor: { ...instructor, name } })
          }
          placeholder="Full name"
        />
        <Field
          label="ROLE / ORGANISATION"
          value={instructor.role}
          onChange={(role) =>
            setMeta({ ...meta, instructor: { ...instructor, role } })
          }
          placeholder="Role · Company"
        />
        <Field
          label="ABOUT THE LECTURER"
          value={instructor.bio}
          onChange={(bio) =>
            setMeta({ ...meta, instructor: { ...instructor, bio } })
          }
          multiline
          placeholder="Short, credible biography"
        />
        <Field
          label="LECTURER IMAGE URL"
          value={instructor.image_url}
          onChange={(image_url) =>
            setMeta({ ...meta, instructor: { ...instructor, image_url } })
          }
          placeholder="Image URL"
        />
      </View>
      <View style={section !== "curriculum" ? styles.hidden : undefined}>
        <Section
          title={`Lessons · ${lessons.length}`}
          copy="Each lesson becomes the actual learner page, including its media, notes and reflection."
        />
        {lessons.map((lesson, index) => {
          const sections = lesson.sections ?? [];
          return (
            <View key={index} style={styles.lesson}>
              <View style={styles.lessonHead}>
                <View style={styles.lessonNumber}>
                  <Text style={styles.lessonNumberText}>{index + 1}</Text>
                </View>
                <Pressable
                  style={styles.lessonHeadingButton}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit lesson ${index + 1}: ${lesson.title || "Untitled lesson"}`}
                  accessibilityState={{ expanded: expandedLesson === index }}
                  onPress={() =>
                    setExpandedLesson(expandedLesson === index ? null : index)
                  }
                >
                  <Text style={styles.lessonTitle}>
                    {lesson.title || `Lesson ${index + 1}`}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <Text style={styles.lessonSummary}>{lesson.duration || "No duration"}</Text>
                    <Ionicons name={expandedLesson === index ? "chevron-up" : "chevron-down"} size={13} color={colors.muted} />
                  </View>
                </Pressable>
                <Pressable
                  style={styles.lessonAction}
                  accessibilityRole="button"
                  accessibilityLabel={`Move lesson ${index + 1} up`}
                  disabled={index === 0 || uploadingLesson !== null}
                  onPress={() => moveLesson(index, -1)}
                >
                  <Ionicons
                    name="arrow-up"
                    size={18}
                    color={index === 0 ? colors.line : colors.ink}
                  />
                </Pressable>
                <Pressable
                  style={styles.lessonAction}
                  accessibilityRole="button"
                  accessibilityLabel={`Move lesson ${index + 1} down`}
                  disabled={
                    index === lessons.length - 1 || uploadingLesson !== null
                  }
                  onPress={() => moveLesson(index, 1)}
                >
                  <Ionicons
                    name="arrow-down"
                    size={18}
                    color={
                      index === lessons.length - 1 ? colors.line : colors.ink
                    }
                  />
                </Pressable>
                <Pressable
                  style={styles.lessonAction}
                  disabled={uploadingLesson !== null}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove lesson ${index + 1}`}
                  onPress={() =>
                    Alert.alert(
                      "Remove lesson?",
                      "The lesson and its notes will be removed when you save.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Remove",
                          style: "destructive",
                          onPress: () => {
                            setMeta({
                              ...meta,
                              lessons: lessons.filter((_, i) => i !== index),
                            });
                            setExpandedLesson(null);
                          },
                        },
                      ],
                    )
                  }
                >
                  <Ionicons
                    name="trash-outline"
                    size={17}
                    color={colors.pinkDeep}
                  />
                </Pressable>
              </View>
              <View
                style={expandedLesson !== index ? styles.hidden : undefined}
              >
                <Field
                  label="LESSON TITLE"
                  value={lesson.title}
                  onChange={(title) => updateLesson(index, { title })}
                  placeholder="Lesson title"
                />
                <Field
                  label="LESSON ID"
                  value={lesson.id}
                  onChange={(id) => updateLesson(index, { id: slugify(id) })}
                  placeholder={`lesson-${index + 1}`}
                />
                <Field
                  label="SUMMARY"
                  value={lesson.summary}
                  onChange={(summary) => updateLesson(index, { summary })}
                  placeholder="What this lesson covers"
                  multiline
                />
                <Field
                  label="DURATION"
                  value={lesson.duration}
                  onChange={(duration) => updateLesson(index, { duration })}
                  placeholder="8 min"
                />
                <Field
                  label="LEARNING OBJECTIVES"
                  value={(lesson.objectives ?? []).join("\n")}
                  onChange={(value) =>
                    updateLesson(index, {
                      objectives: value
                        .split("\n")
                        .map((item) => item.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="One objective per line"
                  multiline
                />
                {sections.map((section, sectionIndex) => (
                  <View
                    key={`section-${sectionIndex}`}
                    style={styles.lessonSection}
                  >
                    <View style={styles.lessonSectionHead}>
                      <Text style={styles.lessonSectionTitle}>
                        CONTENT SECTION {sectionIndex + 1}
                      </Text>
                      <Pressable
                        onPress={() =>
                          updateLesson(index, {
                            sections: sections.filter(
                              (_, i) => i !== sectionIndex,
                            ),
                          })
                        }
                      >
                        <Ionicons name="close" size={17} color={colors.muted} />
                      </Pressable>
                    </View>
                    <Field
                      label="HEADING"
                      value={section.heading}
                      onChange={(heading) =>
                        updateLesson(index, {
                          sections: sections.map((item, i) =>
                            i === sectionIndex ? { ...item, heading } : item,
                          ),
                        })
                      }
                      placeholder="Section heading"
                    />
                    <Field
                      label="LESSON NOTES"
                      value={section.body}
                      onChange={(body) =>
                        updateLesson(index, {
                          sections: sections.map((item, i) =>
                            i === sectionIndex ? { ...item, body } : item,
                          ),
                        })
                      }
                      placeholder="Teach the idea clearly here"
                      multiline
                    />
                  </View>
                ))}
                <Pressable
                  onPress={() =>
                    updateLesson(index, {
                      sections: [...sections, { heading: "", body: "" }],
                    })
                  }
                  style={styles.addSection}
                >
                  <Ionicons name="add" size={15} color={colors.ink} />
                  <Text style={styles.addSectionText}>Add content section</Text>
                </Pressable>
                <Field
                  label="REFLECTION PROMPT"
                  value={lesson.reflection ?? ""}
                  onChange={(reflection) => updateLesson(index, { reflection })}
                  placeholder="What should the learner pause and consider?"
                  multiline
                />
                <Choice
                  label="LESSON MEDIA"
                  values={["youtube", "upload", "external", "none"]}
                  selected={lesson.media_type || "none"}
                  onSelect={(media_type) => updateLesson(index, { media_type })}
                />
                <Field
                  label="VIDEO OR MEDIA URL"
                  value={lesson.media_url}
                  onChange={(media_url) => updateLesson(index, { media_url })}
                  placeholder="Paste a YouTube, Vimeo or external link"
                />
                {lesson.media_type === "upload" ? (
                  uploadingLesson === index ? (
                    <View style={styles.uploadStatus}>
                      <View style={styles.uploadTrack}>
                        <View
                          style={[
                            styles.uploadFill,
                            { width: `${uploadProgress}%` },
                          ]}
                        />
                      </View>
                      <View style={styles.uploadStatusRow}>
                        <Text style={styles.uploadStatusText}>
                          {uploadPaused
                            ? "Upload paused"
                            : `Uploading · ${uploadProgress}%`}
                        </Text>
                        <Pressable
                          onPress={() => {
                            if (uploadPaused) {
                              uploadControl?.resume();
                              setUploadPaused(false);
                            } else {
                              void uploadControl?.pause();
                              setUploadPaused(true);
                            }
                          }}
                        >
                          <Text style={styles.uploadAction}>
                            {uploadPaused ? "Resume" : "Pause"}
                          </Text>
                        </Pressable>
                        <Pressable onPress={() => void uploadControl?.cancel()}>
                          <Text style={styles.uploadAction}>Cancel</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => void uploadLesson(index)}
                      style={styles.uploadFile}
                    >
                      <>
                        <Ionicons
                          name="cloud-upload-outline"
                          size={19}
                          color={colors.pinkDeep}
                        />
                        <Text style={styles.uploadFileText}>
                          {lesson.media_url
                            ? "Replace uploaded video"
                            : "Choose and upload video"}
                        </Text>
                      </>
                    </Pressable>
                  )
                ) : null}
                <Toggle
                  title="Free preview"
                  copy="Mark this as a sample lesson for future preview access controls."
                  value={lesson.preview}
                  onChange={(preview) => updateLesson(index, { preview })}
                />
              </View>
            </View>
          );
        })}
        <Pressable
          accessibilityRole="button"
          disabled={uploadingLesson !== null}
          onPress={add}
          style={styles.addLesson}
        >
          <Ionicons name="add" size={18} color={colors.pinkDeep} />
          <Text style={styles.addLessonText}>Add lesson</Text>
        </Pressable>
      </View>
      <View style={section !== "pathway" ? styles.hidden : undefined}>
        <Section
          title="Advanced partner pathway"
          copy="Connect this GWMB course to a professional programme hosted and delivered by an external learning partner."
        />
        <Toggle
          title="Show an advanced pathway"
          copy="Adds a Go Further card to the course and completion journey."
          value={advanced.enabled}
          onChange={(enabled) => updateAdvanced({ enabled })}
        />
        {advanced.enabled ? (
          <View style={styles.advancedAdmin}>
            <Field
              label="ADVANCED PROGRAMME TITLE"
              value={advanced.title}
              onChange={(title) => updateAdvanced({ title })}
              placeholder="Professional Certificate in Data Analysis"
            />
            <Field
              label="LEARNING PARTNER"
              value={advanced.partner}
              onChange={(partner) => updateAdvanced({ partner })}
              placeholder="Tech School Africa"
            />
            <Field
              label="PROGRAMME SUMMARY"
              value={advanced.summary}
              onChange={(summary) => updateAdvanced({ summary })}
              placeholder="What learners progress into"
              multiline
            />
            <Field
              label="DURATION"
              value={advanced.duration}
              onChange={(duration) => updateAdvanced({ duration })}
              placeholder="12 weeks"
            />
            <Field
              label="FORMAT"
              value={advanced.format}
              onChange={(format) => updateAdvanced({ format })}
              placeholder="Online · Instructor-led"
            />
            <Field
              label="CERTIFICATE"
              value={advanced.certificate}
              onChange={(certificate) => updateAdvanced({ certificate })}
              placeholder="Professional certificate included"
            />
            <Field
              label="PROGRAMME INFORMATION URL"
              value={advanced.programme_url}
              onChange={(programme_url) => updateAdvanced({ programme_url })}
              placeholder="https://techschoolafrica.com/programme"
            />
            <Field
              label="APPLICATION / ENROLMENT URL"
              value={advanced.application_url}
              onChange={(application_url) =>
                updateAdvanced({ application_url })
              }
              placeholder="External partner application page"
            />
            <AdminDateTimeField
              label="APPLICATION DEADLINE"
              value={advanced.deadline}
              onChange={(deadline) => updateAdvanced({ deadline })}
              optional
            />
            <Field
              label="NEXT INTAKE"
              value={advanced.intake}
              onChange={(intake) => updateAdvanced({ intake })}
              placeholder="January 2027"
            />
            <Field
              label="STANDARD PRICE"
              value={advanced.standard_price}
              onChange={(standard_price) => updateAdvanced({ standard_price })}
              placeholder="₦150,000"
            />
            <Choice
              label="PROGRAMME STATUS"
              values={["open", "closing-soon", "coming-soon", "closed"]}
              selected={advanced.status}
              onSelect={(status) => updateAdvanced({ status })}
            />
            <Choice
              label="CURRENT MEMBER OFFER"
              values={[
                "none",
                "discount",
                "partial-scholarship",
                "full-scholarship",
                "fee-waiver",
              ]}
              selected={advanced.offer_type}
              onSelect={(offer_type) => updateAdvanced({ offer_type })}
            />
            {advanced.offer_type !== "none" ? (
              <>
                <Field
                  label="PUBLIC OFFER LABEL"
                  value={advanced.offer_label}
                  onChange={(offer_label) => updateAdvanced({ offer_label })}
                  placeholder="GWMB members receive 30% supported access"
                />
                <Toggle
                  title="Verified members only"
                  copy="Non-members can still continue at the standard partner price."
                  value={advanced.members_only_offer}
                  onChange={(members_only_offer) =>
                    updateAdvanced({ members_only_offer })
                  }
                />
                <Toggle
                  title="Course completion required"
                  copy="Require this GWMB course to be completed before the benefit can be claimed."
                  value={advanced.completion_required}
                  onChange={(completion_required) =>
                    updateAdvanced({ completion_required })
                  }
                />
                <View style={styles.secureOffer}>
                  <View style={styles.secureOfferHead}>
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={19}
                      color={colors.pinkDeep}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.secureOfferTitle}>
                        Protected member benefit
                      </Text>
                      <Text style={styles.hint}>
                        This code is stored separately and is never exposed in
                        public course data.
                      </Text>
                    </View>
                  </View>
                  <Field
                    label="DISCOUNT / SCHOLARSHIP CODE"
                    value={secureOffer.benefitCode}
                    onChange={(benefitCode) =>
                      setSecureOffer({ ...secureOffer, benefitCode })
                    }
                    placeholder="GWMB-PRO-30"
                  />
                  <Field
                    label="MAXIMUM CLAIMS"
                    value={secureOffer.maxClaims}
                    onChange={(maxClaims) =>
                      setSecureOffer({
                        ...secureOffer,
                        maxClaims: maxClaims.replace(/[^0-9]/g, ""),
                      })
                    }
                    placeholder="Leave blank for unlimited"
                  />
                  <Toggle
                    title="Benefit is claimable"
                    copy="Turn off immediately without removing the pathway."
                    value={secureOffer.active}
                    onChange={(active) =>
                      setSecureOffer({ ...secureOffer, active })
                    }
                  />
                </View>
              </>
            ) : null}
          </View>
        ) : null}
      </View>
      <View style={section !== "curriculum" ? styles.hidden : undefined}>
        <Section
          title={`Course resources · ${resources.length}`}
          copy="Use “Resource title | link” so learners can open or download each item."
        />
        {resources.map((resource, index) => (
          <View key={index} style={styles.inlineField}>
            <View style={styles.inlineCopy}>
              <Field
                label={`RESOURCE ${index + 1}`}
                value={resource}
                onChange={(value) =>
                  setMeta({
                    ...meta,
                    resources: resources.map((item, i) =>
                      i === index ? value : item,
                    ),
                  })
                }
                placeholder="CV workbook | https://…"
              />
            </View>
            <Pressable
              accessibilityLabel={`Remove resource ${index + 1}`}
              onPress={() =>
                setMeta({
                  ...meta,
                  resources: resources.filter((_, i) => i !== index),
                })
              }
              style={styles.remove}
            >
              <Ionicons
                name="trash-outline"
                size={18}
                color={colors.pinkDeep}
              />
            </Pressable>
          </View>
        ))}
        <Pressable
          onPress={() => setMeta({ ...meta, resources: [...resources, ""] })}
          style={styles.addLesson}
        >
          <Ionicons name="add" size={18} color={colors.pinkDeep} />
          <Text style={styles.addLessonText}>Add resource</Text>
        </Pressable>
      </View>
    </View>
  );
}

function EventFields({
  draft,
  setDraft,
  meta,
  setMeta,
  onMeet,
}: {
  draft: ContentDraft;
  setDraft: (value: ContentDraft) => void;
  meta: BuilderMeta;
  setMeta: (value: BuilderMeta) => void;
  onMeet: () => void;
}) {
  const speaker = meta.speaker ?? {
    name: "",
    role: "",
    bio: "",
    image_url: "",
  };
  return (
    <View>
      <Section
        title="Programme & format"
        copy="This determines where the same event appears throughout the app."
      />
      <Choice
        label="PROGRAMME"
        values={programs}
        selected={meta.program ?? "live-session"}
        onSelect={(program) => setMeta({ ...meta, program })}
      />
      <Choice
        label="FORMAT"
        values={["online", "physical", "hybrid"]}
        selected={meta.format ?? "online"}
        onSelect={(format) => setMeta({ ...meta, format })}
      />
      <AdminDateTimeField
        label="START DATE & TIME"
        value={draft.starts_at ?? ""}
        onChange={(starts_at) =>
          setDraft({ ...draft, starts_at: starts_at || null })
        }
      />
      <AdminDateTimeField
        label="END DATE & TIME"
        value={draft.ends_at ?? ""}
        onChange={(ends_at) => setDraft({ ...draft, ends_at: ends_at || null })}
        optional
      />
      <AdminDateTimeField
        label="REGISTRATION DEADLINE"
        value={meta.registration_deadline ?? ""}
        onChange={(registration_deadline) =>
          setMeta({ ...meta, registration_deadline })
        }
        optional
      />
      <Field
        label="TIME ZONE"
        value={meta.timezone ?? ""}
        onChange={(timezone) => setMeta({ ...meta, timezone })}
        placeholder="Africa/Lagos"
      />
      <Field
        label="VENUE OR ONLINE LOCATION"
        value={meta.venue ?? ""}
        onChange={(venue) => setMeta({ ...meta, venue })}
        placeholder="Google Meet or Lagos City Club"
      />
      <Field
        label="CAPACITY"
        value={meta.capacity ?? ""}
        onChange={(capacity) => setMeta({ ...meta, capacity })}
        placeholder="Leave blank for unlimited"
      />
      <Field
        label="REGISTRATION LINK"
        value={meta.registration_url ?? ""}
        onChange={(registration_url) => setMeta({ ...meta, registration_url })}
        placeholder="Optional external registration URL"
      />
      <Field
        label="PRIVATE MEETING LINK"
        value={meta.meeting_url ?? ""}
        onChange={(meeting_url) => setMeta({ ...meta, meeting_url })}
        placeholder="Visible after registration"
      />
      <Section
        title="Speaker"
        copy="The speaker profile follows this event wherever it appears."
      />
      <Field
        label="SPEAKER NAME"
        value={speaker.name}
        onChange={(name) => setMeta({ ...meta, speaker: { ...speaker, name } })}
        placeholder="Full name"
      />
      <Field
        label="ROLE / ORGANISATION"
        value={speaker.role}
        onChange={(role) => setMeta({ ...meta, speaker: { ...speaker, role } })}
        placeholder="Role · Company"
      />
      <Field
        label="ABOUT THE SPEAKER"
        value={speaker.bio}
        onChange={(bio) => setMeta({ ...meta, speaker: { ...speaker, bio } })}
        multiline
        placeholder="Speaker biography"
      />
      <Field
        label="SPEAKER IMAGE URL"
        value={speaker.image_url}
        onChange={(image_url) =>
          setMeta({ ...meta, speaker: { ...speaker, image_url } })
        }
        placeholder="Image URL"
      />
      <Section
        title="Event lifecycle"
        copy="Upcoming → registered → live → completed → replay available."
      />
      <Field
        label="REPLAY URL"
        value={meta.replay_url ?? ""}
        onChange={(replay_url) => setMeta({ ...meta, replay_url })}
        placeholder="Add after the event; it will surface in Learn → Replays"
      />
      <Field
        label="REMINDERS"
        value={(meta.reminders ?? []).join(", ")}
        onChange={(value) =>
          setMeta({
            ...meta,
            reminders: value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
          })
        }
        placeholder="7 days before, 24 hours before, 1 hour before"
      />
      <Toggle
        title="Recording allowed"
        copy="Allow the completed session to become a replay when a recording is added."
        value={Boolean(meta.recording_allowed)}
        onChange={(recording_allowed) =>
          setMeta({ ...meta, recording_allowed })
        }
      />
      <View style={styles.reminders}>
        {(meta.reminders ?? []).map((item) => (
          <View key={item} style={styles.reminder}>
            <Ionicons
              name="notifications-outline"
              size={14}
              color={colors.pinkDeep}
            />
            <Text style={styles.reminderText}>{item}</Text>
          </View>
        ))}
      </View>
      <Pressable onPress={onMeet} style={styles.meet}>
        <Ionicons name="videocam-outline" size={19} color={colors.ink} />
        <View style={{ flex: 1 }}>
          <Text style={styles.meetTitle}>Create Google Meet link</Text>
          <Text style={styles.hint}>
            Save an existing event before creating its meeting.
          </Text>
        </View>
        <Ionicons name="arrow-forward" size={17} color={colors.ink} />
      </Pressable>
    </View>
  );
}

function ResourceFields({
  meta,
  setMeta,
  uploading,
  onUpload,
}: {
  meta: BuilderMeta;
  setMeta: (value: BuilderMeta) => void;
  uploading: boolean;
  onUpload: () => void;
}) {
  const format = [
    "pdf",
    "document",
    "video",
    "youtube",
    "link",
    "template",
  ].includes(meta.resource_type ?? "")
    ? (meta.resource_type ?? "")
    : "";
  const linked = ["link", "youtube"].includes(format);
  return (
    <View>
      <Section
        title="Resource delivery"
        copy="Choose the format first. The input below adapts to the kind of resource being published."
      />
      <Choice
        label="RESOURCE FORMAT"
        values={["pdf", "document", "video", "youtube", "link", "template"]}
        selected={format}
        onSelect={(resource_type) =>
          setMeta({
            ...meta,
            resource_type,
            delivery: ["link", "youtube"].includes(resource_type)
              ? resource_type
              : "upload",
            url: "",
          })
        }
      />
      {format ? (
        <>
          <Choice
            label="RESOURCE LIBRARY"
            values={["general-learning", "career-readiness"]}
            selected={String(meta.module ?? "general-learning")}
            onSelect={(module) => setMeta({ ...meta, module })}
          />
          <Field
            label="AUTHOR / PARTNER"
            value={meta.author ?? ""}
            onChange={(author) => setMeta({ ...meta, author })}
            placeholder="GWMB"
          />
          {linked ? (
            <Field
              label={format === "youtube" ? "YOUTUBE URL" : "RESOURCE LINK"}
              value={meta.url ?? ""}
              onChange={(url) => setMeta({ ...meta, url })}
              placeholder={
                format === "youtube"
                  ? "https://youtube.com/watch?v=…"
                  : "https://…"
              }
            />
          ) : (
            <Pressable
              disabled={uploading}
              onPress={onUpload}
              style={styles.uploadFile}
            >
              {uploading ? (
                <ActivityIndicator color={colors.pinkDeep} />
              ) : (
                <>
                  <Ionicons
                    name="cloud-upload-outline"
                    size={19}
                    color={colors.pinkDeep}
                  />
                  <Text style={styles.uploadFileText}>
                    {meta.url
                      ? "Replace uploaded resource"
                      : `Choose ${format} file`}
                  </Text>
                </>
              )}
            </Pressable>
          )}
        </>
      ) : (
        <View style={styles.imageEmpty}>
          <Ionicons name="file-tray-outline" size={26} color={colors.muted} />
          <Text style={styles.hint}>Select a format to continue</Text>
        </View>
      )}
    </View>
  );
}

function Targeting({
  meta,
  setMeta,
}: {
  meta: BuilderMeta;
  setMeta: (value: BuilderMeta) => void;
}) {
  return (
    <View>
      <Section
        title="Audience & distribution"
        copy="Choose who should receive this content and every place where the same record can appear."
      />
      <Choice
        label="AUDIENCE"
        values={[
          "everyone",
          "members-only",
          "specific-career-fields",
          "selected-users",
        ]}
        selected={meta.audience ?? "everyone"}
        onSelect={(audience) => setMeta({ ...meta, audience })}
      />
      <Field
        label="CAREER FIELDS"
        value={meta.career_fields ?? ""}
        onChange={(career_fields) => setMeta({ ...meta, career_fields })}
        placeholder="Product, Data, Marketing · separate with commas"
      />
      <Field
        label="SUBFIELDS"
        value={meta.subfields ?? ""}
        onChange={(subfields) => setMeta({ ...meta, subfields })}
        placeholder="Product Management, Data Analysis"
      />
      <MultiChoice
        label="SHOW THIS CONTENT IN"
        values={[
          "home",
          "learn",
          "mentorship",
          "community",
          "opportunities",
          "notifications",
        ]}
        selected={meta.surfaces ?? []}
        onChange={(surfaces) => setMeta({ ...meta, surfaces })}
      />
      <MultiChoice
        label="NOTIFY THROUGH"
        values={["in-app", "push", "email"]}
        selected={(meta.notification_channels ?? []).filter(
          (value) => !["sms", "whatsapp"].includes(value),
        )}
        onChange={(notification_channels) =>
          setMeta({ ...meta, notification_channels })
        }
      />
      <Text style={styles.hint}>
        SMS and WhatsApp will become selectable after their provider and consent
        flows are connected.
      </Text>
    </View>
  );
}
function Publishing({
  draft,
  setDraft,
}: {
  draft: ContentDraft;
  setDraft: (value: ContentDraft) => void;
}) {
  return (
    <View>
      <Section
        title="Routing, access & publishing"
        copy="Edit its permanent route, display order, audience access and release state."
      />
      <Field
        label="APP ROUTE"
        value={draft.route ?? ""}
        onChange={(route) => setDraft({ ...draft, route })}
        placeholder="/course/technology-careers"
      />
      <Field
        label="URL SLUG"
        value={draft.slug}
        onChange={(slug) => setDraft({ ...draft, slug: slugify(slug) })}
        placeholder="technology-careers"
      />
      <Field
        label="DISPLAY ORDER"
        value={String(draft.sort_order)}
        onChange={(value) =>
          setDraft({
            ...draft,
            sort_order: Number(value.replace(/[^0-9-]/g, "")) || 0,
          })
        }
        placeholder="0"
      />
      <AdminDateTimeField
        label="PUBLISH DATE & TIME"
        value={draft.publish_at ?? ""}
        onChange={(publish_at) =>
          setDraft({ ...draft, publish_at: publish_at || null })
        }
        optional
      />
      <Choice
        label="ACCESS"
        values={["open", "account", "members", "admin"]}
        selected={draft.access_level}
        onSelect={(access_level) =>
          setDraft({ ...draft, access_level: access_level as ContentAccess })
        }
      />
      <Choice
        label="STATUS"
        values={["draft", "scheduled", "published", "archived"]}
        selected={draft.status}
        onSelect={(status) =>
          setDraft({ ...draft, status: status as ContentStatus })
        }
      />
      <Toggle
        title="Feature this item"
        copy="Prioritise it in recommendations and highlighted sections."
        value={draft.featured}
        onChange={(featured) => setDraft({ ...draft, featured })}
      />
      <Toggle
        title="Show in the app"
        copy="Hide without deleting or losing its setup."
        value={draft.visible}
        onChange={(visible) => setDraft({ ...draft, visible })}
      />
    </View>
  );
}
function MediaImage({
  value,
  uploading,
  onUpload,
}: {
  value: string;
  uploading: boolean;
  onUpload: () => void;
}) {
  return (
    <View>
      <Text style={styles.label}>COVER IMAGE</Text>
      {value ? (
        <Image source={{ uri: value }} style={styles.image} />
      ) : (
        <View style={styles.imageEmpty}>
          <Ionicons name="image-outline" size={28} color={colors.muted} />
          <Text style={styles.hint}>Add a strong cover image</Text>
        </View>
      )}
      <Pressable disabled={uploading} onPress={onUpload} style={styles.upload}>
        {uploading ? (
          <ActivityIndicator color={colors.pinkDeep} />
        ) : (
          <>
            <Ionicons
              name="cloud-upload-outline"
              size={18}
              color={colors.pinkDeep}
            />
            <Text style={styles.uploadText}>Choose and upload cover</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}
function Section({ title, copy }: { title: string; copy: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionCopy}>{copy}</Text>
    </View>
  );
}
function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#AAA4A8"
        multiline={multiline}
        style={[styles.input, multiline && styles.multiline]}
      />
    </View>
  );
}
function Choice({
  label,
  values,
  selected,
  onSelect,
}: {
  label: string;
  values: readonly string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {values.map((value) => (
          <Pressable
            key={value}
            onPress={() => onSelect(value)}
            style={[styles.chip, selected === value && styles.chipOn]}
          >
            <Text
              style={[styles.chipText, selected === value && styles.chipTextOn]}
            >
              {value.replaceAll("-", " ")}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
function MultiChoice({
  label,
  values,
  selected,
  onChange,
}: {
  label: string;
  values: readonly string[];
  selected: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.chips, { flexWrap: "wrap" }]}>
        {values.map((value) => {
          const on = selected.includes(value);
          return (
            <Pressable
              key={value}
              onPress={() =>
                onChange(
                  on
                    ? selected.filter((item) => item !== value)
                    : [...selected, value],
                )
              }
              style={[styles.chip, on && styles.chipOn]}
            >
              <Ionicons
                name={on ? "checkmark-circle" : "ellipse-outline"}
                size={14}
                color={on ? "white" : colors.muted}
              />
              <Text style={[styles.chipText, on && styles.chipTextOn]}>
                {value.replaceAll("-", " ")}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
function Toggle({
  title,
  copy,
  value,
  onChange,
}: {
  title: string;
  copy: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggle}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.hint}>{copy}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.pinkDeep }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { display: "none" },
  readiness: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingBottom: 20,
  },
  checklistItem: {
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 6,
  },
  lessonHeadingButton: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  lessonSummary: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
  },
  lessonAction: {
    width: 40,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },

  banner: {
    borderRadius: 22,
    backgroundColor: colors.ink,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bannerIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.pinkDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerTitle: { fontFamily: fonts.headingBold, fontSize: 14, color: "white" },
  bannerCopy: {
    fontFamily: fonts.body,
    fontSize: 13.5,
    lineHeight: 18,
    color: "#D4CDD2",
    marginTop: 3,
  },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: 12.5,
    letterSpacing: 0.7,
    color: colors.ink,
    marginTop: 17,
    marginBottom: 8,
  },
  input: {
    minHeight: 60,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 15,
    paddingVertical: 12,
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  multiline: { minHeight: 112, paddingTop: 15, textAlignVertical: "top" },
  image: {
    aspectRatio: 16 / 9,
    width: "100%",
    borderRadius: 20,
    backgroundColor: colors.pinkSoft,
  },
  imageEmpty: {
    height: 115,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 17,
    color: colors.muted,
    marginTop: 3,
  },
  upload: {
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  uploadText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12.5,
    color: colors.pinkDeep,
  },
  section: { marginTop: 27, marginBottom: 2 },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 19, color: colors.ink },
  sectionCopy: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    lineHeight: 19.5,
    color: colors.muted,
    marginTop: 4,
  },
  chips: { flexDirection: "row", gap: 6 },
  chip: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 11,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.muted,
    textTransform: "capitalize",
  },
  chipTextOn: { color: "white" },
  toggle: {
    minHeight: 70,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 13,
  },
  toggleTitle: {
    fontFamily: fonts.headingBold,
    fontSize: 15,
    color: colors.ink,
  },
  lesson: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#FCFBFC",
    padding: 13,
    marginTop: 10,
  },
  lessonHead: { flexDirection: "row", alignItems: "center" },
  lessonNumber: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  lessonNumberText: {
    fontFamily: fonts.headingBold,
    fontSize: 13,
    color: "white",
  },
  lessonTitle: {
    flex: 1,
    fontFamily: fonts.headingBold,
    fontSize: 13,
    color: colors.ink,
    paddingHorizontal: 9,
  },
  lessonSection: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "white",
    padding: 11,
    marginTop: 13,
  },
  lessonSectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  lessonSectionTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    letterSpacing: 0.7,
    color: colors.pinkDeep,
  },
  addSection: {
    height: 40,
    borderRadius: 13,
    backgroundColor: "#F0EDF0",
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 9,
  },
  addSectionText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13.5,
    color: colors.ink,
  },
  advancedAdmin: {
    borderRadius: 21,
    borderWidth: 1,
    borderColor: "#D7CED4",
    backgroundColor: "#F8F6F7",
    padding: 14,
    marginTop: 12,
  },
  secureOffer: {
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#E0B8CA",
    backgroundColor: "#FFF5F9",
    padding: 13,
    marginTop: 15,
  },
  secureOfferHead: { flexDirection: "row", gap: 10, alignItems: "center" },
  secureOfferTitle: {
    fontFamily: fonts.headingBold,
    fontSize: 13,
    color: colors.ink,
  },
  inlineField: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  inlineCopy: { flex: 1 },
  remove: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.pinkSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },
  addLesson: {
    height: 48,
    borderRadius: 15,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.pinkDeep,
    backgroundColor: colors.pinkSoft,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  addLessonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.pinkDeep,
  },
  reminders: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 13 },
  reminder: {
    minHeight: 34,
    borderRadius: 999,
    backgroundColor: colors.pinkSoft,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  reminderText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12.5,
    color: colors.pinkDeep,
  },
  meet: {
    minHeight: 72,
    borderRadius: 18,
    backgroundColor: "#E8EDFF",
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 13,
  },
  meetTitle: {
    fontFamily: fonts.headingBold,
    fontSize: 15,
    color: colors.ink,
  },
  uploadFile: {
    height: 49,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.pinkDeep,
    backgroundColor: colors.pinkSoft,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 10,
  },
  uploadFileText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.pinkDeep,
  },
  uploadStatus: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.pinkDeep,
    backgroundColor: colors.pinkSoft,
    padding: 12,
    marginTop: 10,
  },
  uploadTrack: {
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#E6CAD6",
  },
  uploadFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.pinkDeep,
  },
  uploadStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 9,
  },
  uploadStatusText: {
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: 13.5,
    color: colors.ink,
  },
  uploadAction: {
    fontFamily: fonts.bodyBold,
    fontSize: 13.5,
    color: colors.pinkDeep,
  },
  preview: {
    height: 55,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 20,
  },
  previewText: {
    flex: 1,
    fontFamily: fonts.headingBold,
    fontSize: 14.5,
    color: colors.ink,
  },
  save: {
    height: 56,
    borderRadius: 17,
    backgroundColor: colors.pinkDeep,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 12,
  },
  saveText: { fontFamily: fonts.headingBold, fontSize: 13, color: "white" },
});
