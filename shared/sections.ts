import type { MultiParam } from "./query";
import type { FilterField, FilterGroup, Options } from "./types";

export type Section = { heading: string; values: string[] };
export type FieldSection = { heading: string; fields: FilterField[] };

/** Where an option UKCP adds lands until it is placed below. */
export const OTHER = "Other";

/**
 * Our own headings for UKCP's two longest lists, grouping issues by theme and practitioner titles by school. UKCP ANDs the
 * values of a list, so a heading can only group boxes, never stand for them. Values are UKCP's exactly, typos included.
 */
export const SECTIONS: Partial<Record<MultiParam, Section[]>> = {
  HelpWithAdvanced: [
    {
      heading: "Anxiety, mood and stress",
      values: ["Anger Management", "Anxiety", "Depression", "Mental Health Issues", "Obsessions", "Obsessive Compulsive Disorder", "Phobias", "Stress", "Suicide"],
    },
    {
      heading: "Trauma and abuse",
      values: ["Abuse", "Bullying", "Domestic Violence", "EMDR", "Physical Abuse", "Post-Traumatic Stress", "Sexual Abuse", "Trauma"],
    },
    {
      heading: "Relationships and family",
      values: ["Adoption", "Couple Issues", "Divorce", "Family", "Parents", "Relationships", "Separation", "Sex Problems", "Step Families"],
    },
    { heading: "Eating and addiction", values: ["Addiction", "Anorexia", "Bulimia", "Eating Disorders", "Prescribed Drug Dependence"] },
    {
      heading: "Health, illness and loss",
      values: ["AIDS/HIV", "Age-related Issues", "Bereavement", "Cancer", "Chronic Illness", "Health-related Issues", "Infertility", "Terminal Illness"],
    },
    { heading: "Neurodiversity and disability", values: ["ADHD", "Autism", "Disability"] },
    {
      heading: "Identity and culture",
      values: ["Cultural Issues", "Gender", "Identity Problems", "Race Issues", "Sexuality", "Spirituality", "Transgender"],
    },
    { heading: "Work", values: ["Employment Difficulties", "Workplace Counselling"] },
    { heading: "Sexual offending", values: ["Sex Offenders", "Those at Risk of Sexual Offending", "Those at Risk of Sexually Offending"] },
    { heading: "Online and telephone", values: ["Online Counselling", "Telephone Counselling"] },
    { heading: "For therapists", values: ["Private Practice Issues", "Supervision", "Training"] },
  ],
  TypesOfTherapy: [
    {
      heading: "Children and young people",
      values: [
        "Adolescent Counsellor",
        "Adolescent Psychotherapeutic Counsellor",
        "Adolescent Psychotherapist",
        "Child and Adolescent Psychotherapeutic Counsellor",
        "Child and Adolescent Psychotherapist",
        "Child Counsellor",
        "Child Psychotherapeutic Counsellor",
        "Child Psychotherapist",
        "Educational Psychotherapist",
        "Integrative Child Psychotherapist",
        "Parent Infant Psychoanalytic Psychotherapist",
      ],
    },
    {
      heading: "Couples, families and relationships",
      values: [
        "Couples Psychotherapeutic Counsellor",
        "Family and Systemic Psychotherapist",
        "Family Therapist",
        "Psychosexual Psychotherapist",
        "Sexual and Relationship Psychotherapist",
        "Systemic Family and Couple Psychotherapist",
        "Systemic Psychotherapist",
      ],
    },
    {
      heading: "Humanistic and integrative",
      values: [
        "Gestalt Group Psychotherapist",
        "Gestalt Psychotherapeutic Counsellor",
        "Gestalt Psychotherapist",
        "Humanistic and Integrative Psychotherapist",
        "Humanistic Psychotherapeutic Counsellor",
        "Humanistic Psychotherapist",
        "Integrative Psychotherapeutic Counsellor",
        "Integrative Psychotherapist",
        "Person Centred Psychotherapist",
        "Person-Centred Experiential Psychotherapeutic Counsellor",
        "Process Oriented Psychotherapist",
        "Transactional Analysis Psychotherapist",
      ],
    },
    {
      heading: "Psychoanalytic and psychodynamic",
      values: [
        "Attachment-based Psychoanalytic Psychotherapist",
        "Contemporary Psychoanalyst",
        "Dynamic Interpersonal Psychotherapeutic Counsellor",
        "Group Analyst",
        "Group Analytic Psychotherapist",
        "Intercultural Psychoanalytical Psychotherapist",
        "Intersubjective Psychotherapist",
        "Lacanian Analyst",
        "Psychoanalyst",
        "Psychoanalytic Psychotherapist",
        "Psychodynamic Psychotherapist",
      ],
    },
    {
      heading: "Jungian",
      values: [
        "Analytical Psychologist",
        "Analytical Psychologist - Jungian Analyst",
        "Analytical Psychotherapist",
        "Analytical Psychotherapist (Jungian)",
        "Jungian Analytical Psychotherapist",
      ],
    },
    {
      heading: "Cognitive and brief therapies",
      values: [
        "Cognitive Analytic Therapist",
        "Cognitive and Behavioural Psychotherapist",
        "Hypno -Psychotherapist",
        "Neuro-linguistic Psychotherapist",
        "Outcome Oriented Psychotherapist",
      ],
    },
    {
      heading: "Existential and constructivist",
      values: [
        "Constructivist Psychotherapist",
        "Existential Psychotherapist",
        "Existential-Analytic Psychotherapeutic Counsellor",
        "Existential-Analytic Psychotherapist",
        "Personal Construct Psychotherapist",
      ],
    },
    {
      heading: "Transpersonal and mindfulness",
      values: [
        "Core Process Psychotherapist",
        "Integrative Psychosynthesis Psychotherapist",
        "Integrative Transpersonal Psychotherapeutic Counsellor",
        "Integrative Transpersonal Psychotherapist",
        "Mindfulness Based Psychotherapist",
        "Psychosynthesis Psychotherapeutic Counsellor",
        "Psychosynthesis Psychotherapist",
        "Transpersonal Psychotherapist",
      ],
    },
    {
      heading: "Body, arts and movement",
      values: [
        "Autogenic Psychotherapist",
        "Biodynamic Psychotherapist",
        "Body Psychotherapist",
        "Dance Movement Psychotherapist",
        "Integrative Arts Psychotherapist",
        "Psychodrama Psychotherapist",
      ],
    },
    {
      heading: "General titles",
      values: ["Adult Psychotherapist", "Contemporary Psychotherapist", "Medical Psychotherapist", "Psychotherapeutic Counsellor", "UTC Psychotherapist"],
    },
  ],
};

/** The group's boxes under our headings, in UKCP's order within each; unplaced boxes go under Other, and headings left empty are dropped. */
export function sectionsOf(group: FilterGroup, sections = SECTIONS): FieldSection[] | undefined {
  const name = group.fields[0]?.name;
  const defined = name === undefined ? undefined : sections[name as MultiParam];
  if (!defined || group.fields.some((f) => f.name !== name)) return undefined;
  const placed = new Set(defined.flatMap((s) => s.values));
  return [
    ...defined.map((s) => ({ heading: s.heading, fields: group.fields.filter((f) => s.values.includes(f.value)) })),
    { heading: OTHER, fields: group.fields.filter((f) => !placed.has(f.value)) },
  ].filter((s) => s.fields.length > 0);
}

/** Options that fall under Other, and placed values UKCP no longer offers; the canary logs both so the headings can follow UKCP. */
export function sectionDrift(options: Options, sections = SECTIONS): string[] {
  const drift: string[] = [];
  for (const [name, defined] of Object.entries(sections)) {
    const offered = new Set(options.groups.flatMap((g) => g.fields).filter((f) => f.name === name).map((f) => f.value));
    const placed = new Set(defined.flatMap((s) => s.values));
    drift.push(...[...offered].filter((v) => !placed.has(v)).map((v) => `under ${OTHER} ${name}: ${v}`));
    drift.push(...[...placed].filter((v) => !offered.has(v)).map((v) => `no longer offered ${name}: ${v}`));
  }
  return drift;
}
