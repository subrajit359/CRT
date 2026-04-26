import bcrypt from "bcryptjs";
import { initDb, query, pool } from "./db.js";

const ADMIN_EMAIL = "admin@reasonal.local";
const ADMIN_USERNAME = "admin";
const SEED_DEFAULT_PASSWORD = "Reasonal#2026";

const SEED_CASES = [
  {
    title: "52-year-old man, sudden tearing chest pain",
    specialty: "Cardiology",
    level: 4,
    body: `A 52-year-old man, long-standing hypertensive and active smoker, presents to the ED with sudden, severe, tearing chest pain radiating to the back. He is pale and diaphoretic.

Vitals: BP 188/102 mmHg in the right arm and 142/86 mmHg in the left arm. HR 102/min, regular. RR 22/min. SpO2 96% on room air. Afebrile.

On examination: Heart sounds are normal with no murmur. Pulses are asymmetric — left radial weaker than right. Lung fields clear. Abdomen soft. Neurologically intact.

Investigations: ECG shows sinus rhythm with no acute ST changes. CXR shows a slightly widened mediastinum. Troponin I pending. Hemoglobin 13.4 g/dL. Creatinine 1.0 mg/dL.`,
    questions: [
      {
        prompt: "What is your single most urgent next step, and why? Justify using specific case features.",
        expectation: "Recognize aortic dissection as the leading concern; emergent CT angiogram (or TEE if unstable); BP control with IV beta-blocker before vasodilator.",
      },
    ],
    diagnosis: "Acute aortic dissection",
    acceptedDiagnoses: ["aortic dissection", "thoracic aortic dissection", "type A dissection", "type B dissection", "dissecting aortic aneurysm"],
    diagnosisExplanation: "Sudden tearing chest pain radiating to the back with inter-arm BP differential and a widened mediastinum on CXR is the classic triad — this is aortic dissection until proven otherwise.",
  },
  {
    title: "16-year-old with polyuria, vomiting, deep breathing",
    specialty: "Endocrinology",
    level: 3,
    body: `A 16-year-old, previously healthy, presents to the ED with two days of nausea, vomiting, and abdominal pain. Family reports increasing polyuria and polydipsia for two weeks, and a 4 kg weight loss over the past month. Today she became drowsy and her breathing changed.

Vitals: BP 96/58, HR 128, RR 28 with deep regular respirations. Temp 37.4°C. SpO2 99%.

Exam: Dry mucous membranes, sunken eyes, capillary refill 3 seconds. Abdomen mildly tender, no peritonism. Fruity breath odor. GCS 14.

Labs: Random plasma glucose 28 mmol/L (504 mg/dL). Venous blood gas: pH 7.10, HCO3 8 mmol/L, anion gap 26. Urine ketones large. Sodium 130, potassium 5.6, creatinine 1.1.`,
    questions: [
      {
        prompt: "Outline your immediate management priorities in order, with reasoning.",
        expectation: "DKA: airway, IV fluids first (NS bolus then maintenance), check K+ before insulin, fixed-rate insulin infusion, monitor K+/glucose hourly, hunt for precipitant.",
      },
    ],
    diagnosis: "Diabetic ketoacidosis",
    acceptedDiagnoses: ["DKA", "diabetic ketoacidosis", "new-onset type 1 diabetes with DKA", "type 1 diabetes presenting with DKA"],
    diagnosisExplanation: "New-onset hyperglycemia (504 mg/dL) with high anion-gap metabolic acidosis, large urinary ketones, Kussmaul respirations and a fruity breath odor are diagnostic of DKA — most likely a first presentation of type 1 diabetes.",
  },
  {
    title: "62-year-old with sudden left-sided weakness",
    specialty: "Neurology",
    level: 4,
    body: `A 62-year-old man with atrial fibrillation (on no anticoagulation) is brought in by his wife after sudden onset left-sided weakness and slurred speech 80 minutes ago. He was last known well at breakfast.

Vitals: BP 178/96, HR 96 irregularly irregular, SpO2 97%, glucose 6.4 mmol/L.

Exam: Awake, dysarthric. Right gaze deviation. Left facial droop, left arm 1/5, left leg 2/5. Sensory inattention on the left. NIHSS 14.

CT head (non-contrast) just completed: no hemorrhage, no early ischemic changes. Platelets, INR, renal function are normal.`,
    questions: [
      {
        prompt: "What is your next step and why? What must be ruled out before you act?",
        expectation: "Acute ischemic stroke within tPA window; confirm time of onset, exclude hemorrhage (done), check contraindications, BP control to <185/110, then IV thrombolysis ± thrombectomy if LVO; CTA next.",
      },
    ],
    diagnosis: "Acute ischemic stroke",
    acceptedDiagnoses: ["ischemic stroke", "cardioembolic stroke", "stroke", "CVA", "cerebrovascular accident", "acute stroke"],
    diagnosisExplanation: "Sudden focal neurological deficit (left hemiparesis, dysarthria, gaze deviation) in a patient with untreated atrial fibrillation, with hemorrhage already excluded on CT, points to acute ischemic stroke — most likely cardioembolic.",
  },
  {
    title: "5-year-old with fever and a stiff neck",
    specialty: "Pediatrics",
    level: 3,
    body: `A 5-year-old, previously well, presents with 24 hours of high fever, headache, vomiting, and increasing drowsiness. Parents noticed a non-blanching purpuric rash on the legs in the last hour.

Vitals: Temp 39.6°C, HR 162, BP 82/46, capillary refill 4 seconds, RR 36, SpO2 96%.

Exam: Lethargic but rousable. Neck stiffness present. Kernig's positive. Petechial rash on lower limbs and trunk. No focal neurological deficit. Lung fields clear.

Investigations not yet done.`,
    questions: [
      {
        prompt: "What is the single most important immediate action and why? What investigation should NOT delay treatment?",
        expectation: "Suspect meningococcal sepsis/meningitis with shock; immediate IV/IO access, fluid bolus, and IV ceftriaxone before LP/imaging; do not delay antibiotics for CT or LP.",
      },
    ],
    diagnosis: "Meningococcal septicaemia with meningitis",
    acceptedDiagnoses: ["meningococcal sepsis", "meningococcal septicemia", "meningococcal disease", "meningococcaemia", "meningococcemia", "bacterial meningitis", "meningococcal meningitis"],
    diagnosisExplanation: "Fever, headache, neck stiffness, altered mental state and a rapidly spreading non-blanching purpuric rash with shock physiology are diagnostic of invasive meningococcal disease — the rash + shock combination is essentially pathognomonic and must be treated within minutes.",
  },
  {
    title: "28-year-old woman with right lower quadrant pain",
    specialty: "Surgery",
    level: 3,
    body: `A 28-year-old woman presents with 18 hours of progressive right lower quadrant pain. The pain started peri-umbilically and migrated. She has anorexia and one episode of vomiting. Last menstrual period was 7 weeks ago. She is sexually active.

Vitals: Temp 37.8°C, HR 102, BP 118/72.

Exam: Tender at McBurney's point with guarding. Rovsing's positive. No vaginal discharge. Pelvic exam: cervical motion tenderness equivocal.

Labs: WBC 13.8 with neutrophilia. CRP 48. Urine pregnancy test pending.`,
    questions: [
      {
        prompt: "Before committing to appendectomy, what must you rule out and how?",
        expectation: "Pregnancy (urine βhCG urgently); ectopic pregnancy can mimic appendicitis. PID also on differential. Once βhCG resolved → imaging (US first if pregnant, CT otherwise) before surgery.",
      },
    ],
    diagnosis: "Acute appendicitis",
    acceptedDiagnoses: ["appendicitis", "acute appendicitis", "appendiceal inflammation"],
    diagnosisExplanation: "Classic migratory peri-umbilical to right iliac fossa pain, anorexia, low-grade fever, McBurney's tenderness with Rovsing's sign, and a neutrophilic leucocytosis with raised CRP fit acute appendicitis — but ectopic pregnancy must be excluded with a urine βhCG before any surgical commitment in a woman of reproductive age.",
  },
  {
    title: "70-year-old with progressive dyspnea over 3 months",
    specialty: "Pulmonology",
    level: 4,
    body: `A 70-year-old retired shipyard worker presents with 3 months of progressive exertional dyspnea and dry cough. He denies fever, weight loss, or chest pain. Ex-smoker, 20 pack-years, quit 15 years ago.

Vitals: SpO2 91% on room air, RR 22, otherwise normal.

Exam: Fine bibasilar end-inspiratory crackles. Clubbing present. No edema. JVP normal.

Investigations: Spirometry shows restrictive pattern with reduced DLCO. CXR shows bilateral lower-zone reticular shadowing. HRCT: peripheral, basal-predominant reticulation with honeycombing.`,
    questions: [
      {
        prompt: "What is the most likely diagnosis, what is the key occupational consideration, and what is the next step?",
        expectation: "Likely IPF vs asbestosis given shipyard exposure; occupational history matters for asbestos-related lung disease and mesothelioma risk; refer to ILD MDT, baseline 6MWT, consider antifibrotic if confirmed IPF.",
      },
    ],
    diagnosis: "Idiopathic pulmonary fibrosis",
    acceptedDiagnoses: ["IPF", "idiopathic pulmonary fibrosis", "usual interstitial pneumonia", "UIP", "pulmonary fibrosis", "interstitial lung disease", "ILD", "asbestosis"],
    diagnosisExplanation: "Insidious exertional dyspnea, dry cough, fine bibasilar crackles, clubbing, restrictive spirometry with low DLCO and a UIP pattern (peripheral basal reticulation with honeycombing) on HRCT defines IPF — the shipyard exposure means asbestosis must be considered as the alternative.",
  },
  {
    title: "34-year-old woman with palpitations and heat intolerance",
    specialty: "Endocrinology",
    level: 3,
    body: `A 34-year-old woman presents with 6 weeks of palpitations, weight loss despite increased appetite, fine tremor, and heat intolerance. She also reports anxiety and a slight neck swelling.

Vitals: HR 118 regular, BP 136/72, Temp 37.2°C.

Exam: Warm moist skin, fine tremor, lid lag. Diffuse painless goiter with bruit. No proptosis. Reflexes brisk.

Labs: TSH <0.01, free T4 elevated, free T3 elevated. TSH-receptor antibodies positive.`,
    questions: [
      {
        prompt: "What is the diagnosis and what initial treatment do you offer, and why?",
        expectation: "Graves' disease; symptom control with beta-blocker (e.g., propranolol), antithyroid drug (carbimazole/methimazole) titration; counsel on definitive options (RAI vs surgery) later.",
      },
    ],
  },
];

async function ensureUser({ email, username, fullName, role }) {
  const passwordHash = await bcrypt.hash(SEED_DEFAULT_PASSWORD, 10);
  const { rows } = await query(`SELECT id, password_hash FROM users WHERE email=$1`, [email]);
  if (rows[0]) {
    if (!rows[0].password_hash) {
      await query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [passwordHash, rows[0].id]);
    }
    return rows[0].id;
  }
  const { rows: ins } = await query(
    `INSERT INTO users (email, username, full_name, role, password_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [email, username, fullName, role, passwordHash]
  );
  return ins[0].id;
}

async function ensureDoctorProfile(userId, specialty) {
  await query(
    `INSERT INTO doctor_profiles (user_id, specialty, status, degree, years_exp, license_number, hospital)
     VALUES ($1,$2,'approved','MD',12,'SEED-0001','Reasonal Reference Hospital')
     ON CONFLICT (user_id) DO UPDATE SET status='approved'`,
    [userId, specialty]
  );
}

async function ensureStudentProfile(userId, yearOfStudy = "Year 4") {
  await query(
    `INSERT INTO student_profiles (user_id, year_of_study, show_scores, global_level, specialty_levels)
     VALUES ($1,$2,FALSE,1,'{}'::jsonb)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, yearOfStudy]
  );
}

async function seed() {
  await initDb();

  const adminId = await ensureUser({ email: ADMIN_EMAIL, username: ADMIN_USERNAME, fullName: "Reasonal Admin", role: "admin" });

  const seedDoctorId = await ensureUser({ email: "doctor.demo@reasonal.local", username: "drdemo", fullName: "Dr Demo Reviewer", role: "doctor" });
  await ensureDoctorProfile(seedDoctorId, "General Medicine");

  const seedStudentId = await ensureUser({ email: "student.demo@reasonal.local", username: "studemo", fullName: "Sam Student", role: "student" });
  await ensureStudentProfile(seedStudentId, "Year 4");

  for (const c of SEED_CASES) {
    const { rows: existing } = await query(`SELECT id, diagnosis FROM cases WHERE title=$1`, [c.title]);
    if (existing[0]) {
      // Backfill diagnosis fields on existing seed rows that pre-date this column.
      if (!existing[0].diagnosis && c.diagnosis) {
        await query(
          `UPDATE cases SET diagnosis=$1, accepted_diagnoses=$2::jsonb, diagnosis_explanation=$3, updated_at=NOW()
             WHERE id=$4`,
          [c.diagnosis, JSON.stringify(c.acceptedDiagnoses || []), c.diagnosisExplanation || null, existing[0].id]
        );
        console.log(`[seed] ~backfilled diagnosis on "${c.title}"`);
      }
      continue;
    }
    const { rows: ins } = await query(
      `INSERT INTO cases (title, specialty, level, body, questions, source, source_kind, uploader_id,
                          diagnosis, accepted_diagnoses, diagnosis_explanation)
       VALUES ($1,$2,$3,$4,$5::jsonb,'Reasonal Library','admin',$6,$7,$8::jsonb,$9) RETURNING id`,
      [c.title, c.specialty, c.level, c.body, JSON.stringify(c.questions), adminId,
       c.diagnosis || null, JSON.stringify(c.acceptedDiagnoses || []), c.diagnosisExplanation || null]
    );
    const caseId = ins[0].id;
    await query(`INSERT INTO discussions (case_id, kind) VALUES ($1,'doctor') ON CONFLICT DO NOTHING`, [caseId]);
    console.log(`[seed] +case "${c.title}"`);
  }

  console.log(`[seed] admin login:   ${ADMIN_EMAIL}  password: ${SEED_DEFAULT_PASSWORD}`);
  console.log(`[seed] doctor login:  doctor.demo@reasonal.local  password: ${SEED_DEFAULT_PASSWORD}`);
  console.log(`[seed] student login: student.demo@reasonal.local  password: ${SEED_DEFAULT_PASSWORD}`);
  console.log(`[seed] done`);
  await pool.end();
}

seed().catch((e) => { console.error("[seed] failed", e); process.exit(1); });
