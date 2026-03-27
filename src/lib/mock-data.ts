export type CaseStatus =
  | "Active"
  | "Discharged"
  | "Ready To Submit"
  | "Submitted"
  | "Dropped"
  | "Paid";

export type PatientPriority = "Normal" | "MRI Due" | "No Recent Update";

export type PatientMatrixField =
  | "contact"
  | "initialExam"
  | "lien"
  | "priorCare"
  | "xraySent"
  | "xrayDone"
  | "xrayReceived"
  | "xrayReviewed"
  | "xrayFindings"
  | "reExam1"
  | "mriSent"
  | "mriScheduled"
  | "mriDone"
  | "mriReceived"
  | "mriReviewed"
  | "mriCtFindings"
  | "specialistSent"
  | "specialistScheduled"
  | "specialistReport"
  | "specialistRecommendations"
  | "reExam2"
  | "reExam3"
  | "discharge"
  | "rbSent"
  | "billed"
  | "initialToDischarge"
  | "dischargeToRb"
  | "paidDate"
  | "rbToPaid"
  | "paidAmount"
  | "billPercent"
  | "notes"
  | "review";

export interface PatientRecord {
  id: string;
  fullName: string;
  dob: string;
  sex?: "Male" | "Female" | "Other";
  maritalStatus?: "Single" | "Married" | "Other";
  phone: string;
  email?: string;
  address?: string;
  attorney: string;
  caseStatus: CaseStatus;
  dateOfLoss: string;
  lastUpdate: string;
  priority: PatientPriority;
  matrix?: Partial<Record<PatientMatrixField, string>>;
}

export interface AppointmentRecord {
  id: string;
  patientId: string;
  patientName: string;
  provider: string;
  appointmentType: string;
  start: string;
  durationMin: number;
  status: "Scheduled" | "Checked In" | "Seen";
  color: "blue" | "pink" | "orange";
}

export interface EncounterRecord {
  id: string;
  patientId: string;
  patientName: string;
  encounterDate: string;
  provider: string;
  appointmentType: string;
  signed: boolean;
  diagnosesCount: number;
  chargesCount: number;
}

export interface ContactRecord {
  id: string;
  name: string;
  category: string;
  phone: string;
  email: string;
  fax?: string;
  address?: string;
}

export interface ChargeRecord {
  id: string;
  encounterDate: string;
  patientName: string;
  procedureCode: string;
  description: string;
  units: number;
  billed: number;
  paid: number;
}

export interface ImagingEventRecord {
  id: string;
  patientId: string;
  facility: string;
  type: "X-Ray" | "MRI";
  quantity?: number;
}

export interface CaseTimelineMetricRecord {
  patientId: string;
  initialToDischargeDays?: number;
  dischargeToRbDays?: number;
  rbToPaidDays?: number;
}

export const dashboardStats = [
  { label: "Total Active Cases", value: "87" },
  { label: "Ready To Submit", value: "14" },
  { label: "Today Appointments", value: "31" },
  { label: "Avg Days Initial To Discharge", value: "15.2" },
];

const seedPatients: PatientRecord[] = [
  {
    id: "PT-1001",
    fullName: "Danielyan, Mher",
    dob: "1988-06-14",
    sex: "Male",
    phone: "818-555-0144",
    attorney: "Erdoglyan Law Firm",
    caseStatus: "Active",
    dateOfLoss: "2026-03-07",
    lastUpdate: "2026-03-11",
    priority: "Normal",
    matrix: {
      contact: "818-555-0144",
      initialExam: "03/11/26",
      xraySent: "03/11/26 Diagnostic Imaging Network",
      xrayDone: "03/12/26",
      xrayReceived: "03/13/26",
      xrayReviewed: "03/15/26",
      mriSent: "03/16/26",
      specialistSent: "03/18/26 Dr. Tatevossian",
      billed: "$250.00",
      notes: "Needs MRI follow-up",
      review: "Requested",
    },
  },
  {
    id: "PT-1002",
    fullName: "Hernandez, Lorenzo",
    dob: "1974-04-25",
    sex: "Male",
    phone: "213-908-4316",
    attorney: "Self",
    caseStatus: "Active",
    dateOfLoss: "2026-02-20",
    lastUpdate: "2026-02-26",
    priority: "MRI Due",
    matrix: {
      contact: "213-908-4316",
      initialExam: "03/09/26",
      mriSent: "03/11/26",
      mriScheduled: "03/20/26",
      notes: "Blue triangle MRI reminder",
      review: "Requested",
    },
  },
  {
    id: "PT-1003",
    fullName: "Haribyan, Aram",
    dob: "1991-03-14",
    sex: "Male",
    phone: "747-260-6368",
    attorney: "Kazaryan & Harutyunyan",
    caseStatus: "Ready To Submit",
    dateOfLoss: "2026-02-23",
    lastUpdate: "2026-03-02",
    priority: "Normal",
    matrix: {
      contact: "747-260-6368",
      initialExam: "02/26/26",
      xrayDone: "03/06/26",
      xrayReceived: "03/08/26",
      xrayReviewed: "03/09/26",
      reExam1: "03/11/26",
      rbSent: "03/13/26",
      billed: "$85.00",
      review: "Received",
    },
  },
  {
    id: "PT-1004",
    fullName: "Vardanyan, Zhirayr",
    dob: "1979-06-17",
    sex: "Male",
    phone: "818-641-8258",
    attorney: "Yepremyan Law Firm",
    caseStatus: "Submitted",
    dateOfLoss: "2026-02-13",
    lastUpdate: "2026-03-09",
    priority: "Normal",
    matrix: {
      contact: "818-641-8258",
      initialExam: "02/17/26",
      reExam1: "03/04/26",
      discharge: "03/10/26",
      rbSent: "03/12/26",
      billed: "$300.00",
      review: "Received",
    },
  },
  {
    id: "PT-1005",
    fullName: "Ellis, Brian",
    dob: "1990-10-22",
    sex: "Male",
    phone: "818-777-6620",
    attorney: "Yepremyan Law Firm",
    caseStatus: "Active",
    dateOfLoss: "2026-02-13",
    lastUpdate: "2026-02-16",
    priority: "No Recent Update",
    matrix: {
      contact: "818-777-6620",
      initialExam: "02/16/26",
      notes: "No update in reminder window",
      review: "Requested",
    },
  },
  {
    id: "PT-1006",
    fullName: "Petrosyan, Maria",
    dob: "1986-11-08",
    sex: "Female",
    maritalStatus: "Married",
    phone: "818-310-6067",
    attorney: "Trial Lit Attorneys",
    caseStatus: "Dropped",
    dateOfLoss: "2026-01-30",
    lastUpdate: "2026-02-04",
    priority: "Normal",
    matrix: {
      contact: "818-310-6067",
      initialExam: "02/04/26",
      discharge: "02/25/26",
      notes: "Case dropped by attorney",
    },
  },
];

export const PATIENTS_STORAGE_KEY = "casemate.patients.v1";

const matrixFieldList: PatientMatrixField[] = [
  "contact",
  "initialExam",
  "lien",
  "priorCare",
  "xraySent",
  "xrayDone",
  "xrayReceived",
  "xrayReviewed",
  "xrayFindings",
  "reExam1",
  "mriSent",
  "mriScheduled",
  "mriDone",
  "mriReceived",
  "mriReviewed",
  "mriCtFindings",
  "specialistSent",
  "specialistScheduled",
  "specialistReport",
  "specialistRecommendations",
  "reExam2",
  "reExam3",
  "discharge",
  "rbSent",
  "billed",
  "initialToDischarge",
  "dischargeToRb",
  "paidDate",
  "rbToPaid",
  "paidAmount",
  "billPercent",
  "notes",
  "review",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString();
  }
  return "";
}

function toIsoDate(value: unknown) {
  const raw = cleanString(value);
  if (!raw) {
    return "";
  }
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  const usMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (usMatch) {
    const year = usMatch[3].length === 2 ? `20${usMatch[3]}` : usMatch[3];
    return `${year}-${usMatch[1].padStart(2, "0")}-${usMatch[2].padStart(2, "0")}`;
  }
  return "";
}

function normalizeCaseStatus(value: unknown): CaseStatus {
  const normalized = cleanString(value).toLowerCase();
  if (normalized === "discharged") {
    return "Discharged";
  }
  if (normalized === "ready to submit" || normalized === "readytosubmit") {
    return "Ready To Submit";
  }
  if (normalized === "submitted") {
    return "Submitted";
  }
  if (normalized === "dropped") {
    return "Dropped";
  }
  if (normalized === "paid") {
    return "Paid";
  }
  return "Active";
}

function normalizePriority(value: unknown): PatientPriority {
  const normalized = cleanString(value).toLowerCase();
  if (normalized === "mri due") {
    return "MRI Due";
  }
  if (normalized === "no recent update") {
    return "No Recent Update";
  }
  return "Normal";
}

function normalizeSex(value: unknown): PatientRecord["sex"] | undefined {
  const normalized = cleanString(value).toLowerCase();
  if (normalized === "male") {
    return "Male";
  }
  if (normalized === "female") {
    return "Female";
  }
  if (normalized === "other") {
    return "Other";
  }
  return undefined;
}

function normalizeMaritalStatus(value: unknown): PatientRecord["maritalStatus"] | undefined {
  const normalized = cleanString(value).toLowerCase();
  if (normalized === "single") {
    return "Single";
  }
  if (normalized === "married") {
    return "Married";
  }
  if (normalized === "other") {
    return "Other";
  }
  return undefined;
}

function normalizeMatrix(rawValue: unknown): Partial<Record<PatientMatrixField, string>> | undefined {
  if (!isRecord(rawValue)) {
    return undefined;
  }

  const matrix: Partial<Record<PatientMatrixField, string>> = {};
  matrixFieldList.forEach((field) => {
    const value = cleanString(rawValue[field]);
    if (!value) {
      return;
    }
    matrix[field] = value;
  });

  return Object.keys(matrix).length > 0 ? matrix : undefined;
}

function normalizePatientRecord(value: unknown, index: number): PatientRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const firstName = cleanString(value.firstName);
  const lastName = cleanString(value.lastName);
  const composedName = [lastName, firstName].filter(Boolean).join(", ");
  const fullName = cleanString(value.fullName) || cleanString(value.patientName) || cleanString(value.name) || composedName;
  if (!fullName) {
    return null;
  }

  const fallbackDate = new Date().toISOString().slice(0, 10);
  const dateOfLoss = toIsoDate(value.dateOfLoss) || toIsoDate(value.dateOfInjury) || fallbackDate;
  const lastUpdate = toIsoDate(value.lastUpdate) || toIsoDate(value.updatedAt) || dateOfLoss;
  const id = cleanString(value.id) || cleanString(value.patientId) || `PT-IMP-${String(index + 1).padStart(4, "0")}`;

  return {
    id,
    fullName,
    dob: toIsoDate(value.dob) || toIsoDate(value.dateOfBirth),
    sex: normalizeSex(value.sex),
    maritalStatus: normalizeMaritalStatus(value.maritalStatus),
    phone: cleanString(value.phone) || cleanString(value.phoneNumber) || "-",
    email: cleanString(value.email),
    address: cleanString(value.address),
    attorney: cleanString(value.attorney) || cleanString(value.attorneyName) || "Self",
    caseStatus: normalizeCaseStatus(value.caseStatus ?? value.status),
    dateOfLoss,
    lastUpdate,
    priority: normalizePriority(value.priority),
    matrix: normalizeMatrix(value.matrix),
  };
}

function loadPatientsFromStorage(): PatientRecord[] | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(PATIENTS_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    const candidateRows = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.patients)
        ? parsed.patients
        : null;

    if (!candidateRows) {
      return null;
    }

    return candidateRows
      .map((entry, index) => normalizePatientRecord(entry, index))
      .filter((entry): entry is PatientRecord => Boolean(entry));
  } catch {
    return null;
  }
}

function loadPatients(): PatientRecord[] {
  const stored = loadPatientsFromStorage();
  if (stored !== null) {
    return stored;
  }
  return seedPatients.map((entry) => ({ ...entry, matrix: entry.matrix ? { ...entry.matrix } : undefined }));
}

export const patients: PatientRecord[] = loadPatients();

export const contacts: ContactRecord[] = [
  {
    id: "CT-01",
    name: "Erdoglyan Law Firm",
    category: "Attorney",
    phone: "747-298-2333",
    fax: "818-698-3120",
    email: "nazo@erdoglyanlawfirm.com",
    address: "Glendale, CA",
  },
  {
    id: "CT-02",
    name: "Trial Lit Attorneys",
    category: "Attorney",
    phone: "818-668-3524",
    fax: "888-315-5721",
    email: "nazo@drakelawgroup.com",
    address: "Los Angeles, CA",
  },
  {
    id: "CT-03",
    name: "Diagnostic Imaging Network",
    category: "Imaging",
    phone: "818-501-4404",
    email: "scheduling@din.org",
  },
  {
    id: "CT-04",
    name: "Dr. Raymond Tatevossian",
    category: "Orthopedic",
    phone: "818-325-2088",
    email: "new.patient@csppdoctors.com",
  },
  {
    id: "CT-05",
    name: "Glendale Adventist",
    category: "Hospital/ER",
    phone: "818-409-8171",
    email: "intake@glendaleadventist.org",
  },
];

export const appointments: AppointmentRecord[] = [
  {
    id: "AP-01",
    patientId: "PT-1001",
    patientName: "Danielyan, Mher",
    provider: "Galstyan, Mike",
    appointmentType: "PI Office Visit",
    start: "08:00 AM",
    durationMin: 45,
    status: "Scheduled",
    color: "pink",
  },
  {
    id: "AP-02",
    patientId: "PT-1002",
    patientName: "Hernandez, Lorenzo",
    provider: "Galstyan, Mike",
    appointmentType: "Spinal Decompression - C/S",
    start: "09:00 AM",
    durationMin: 30,
    status: "Scheduled",
    color: "blue",
  },
  {
    id: "AP-03",
    patientId: "PT-1003",
    patientName: "Haribyan, Aram",
    provider: "Galstyan, Mike",
    appointmentType: "PI Re-Exam",
    start: "11:30 AM",
    durationMin: 60,
    status: "Checked In",
    color: "orange",
  },
  {
    id: "AP-04",
    patientId: "PT-1004",
    patientName: "Vardanyan, Zhirayr",
    provider: "Galstyan, Mike",
    appointmentType: "PI Discharge Visit",
    start: "02:00 PM",
    durationMin: 60,
    status: "Seen",
    color: "pink",
  },
];

export const encounters: EncounterRecord[] = [
  {
    id: "EN-3001",
    patientId: "PT-1001",
    patientName: "Danielyan, Mher",
    encounterDate: "2026-03-15 03:30 PM",
    provider: "Galstyan, Mike (Dr. Mike)",
    appointmentType: "Spinal Decompression - C/S",
    signed: false,
    diagnosesCount: 6,
    chargesCount: 2,
  },
  {
    id: "EN-3002",
    patientId: "PT-1001",
    patientName: "Danielyan, Mher",
    encounterDate: "2026-03-13 03:30 PM",
    provider: "Galstyan, Mike (Dr. Mike)",
    appointmentType: "PI Office Visit",
    signed: true,
    diagnosesCount: 7,
    chargesCount: 3,
  },
  {
    id: "EN-3003",
    patientId: "PT-1002",
    patientName: "Hernandez, Lorenzo",
    encounterDate: "2026-03-12 02:00 PM",
    provider: "Galstyan, Mike (Dr. Mike)",
    appointmentType: "PI Office Visit",
    signed: true,
    diagnosesCount: 5,
    chargesCount: 2,
  },
  {
    id: "EN-3004",
    patientId: "PT-1003",
    patientName: "Haribyan, Aram",
    encounterDate: "2026-03-11 10:30 AM",
    provider: "Galstyan, Mike (Dr. Mike)",
    appointmentType: "PI Re-Exam",
    signed: false,
    diagnosesCount: 4,
    chargesCount: 1,
  },
];

export const charges: ChargeRecord[] = [
  {
    id: "CH-01",
    encounterDate: "2026-03-15",
    patientName: "Danielyan, Mher",
    procedureCode: "99203",
    description: "New Patient Evaluation",
    units: 1,
    billed: 250,
    paid: 0,
  },
  {
    id: "CH-02",
    encounterDate: "2026-03-15",
    patientName: "Hernandez, Lorenzo",
    procedureCode: "97014",
    description: "Electrical Muscle Stimulation",
    units: 1,
    billed: 35,
    paid: 0,
  },
  {
    id: "CH-03",
    encounterDate: "2026-03-14",
    patientName: "Haribyan, Aram",
    procedureCode: "98940",
    description: "CMT Manipulation 1-2 Regions",
    units: 1,
    billed: 85,
    paid: 85,
  },
  {
    id: "CH-04",
    encounterDate: "2026-03-14",
    patientName: "Vardanyan, Zhirayr",
    procedureCode: "97035",
    description: "Ultrasound",
    units: 1,
    billed: 50,
    paid: 50,
  },
];

export const imagingEvents: ImagingEventRecord[] = [
  { id: "IE-001", patientId: "PT-1001", facility: "Diagnostic Imaging Network", type: "X-Ray", quantity: 3 },
  { id: "IE-002", patientId: "PT-1001", facility: "Diagnostic Imaging Network", type: "MRI", quantity: 1 },
  { id: "IE-003", patientId: "PT-1002", facility: "Broadway Imaging Center", type: "MRI", quantity: 1 },
  { id: "IE-004", patientId: "PT-1002", facility: "Broadway Imaging Center", type: "X-Ray", quantity: 2 },
  { id: "IE-005", patientId: "PT-1003", facility: "Patient Refused", type: "MRI", quantity: 1 },
  { id: "IE-006", patientId: "PT-1003", facility: "Patient Refused", type: "X-Ray", quantity: 2 },
  { id: "IE-007", patientId: "PT-1004", facility: "Unique Diagnostic Center", type: "MRI", quantity: 1 },
  { id: "IE-008", patientId: "PT-1004", facility: "Unique Diagnostic Center", type: "X-Ray", quantity: 2 },
  { id: "IE-009", patientId: "PT-1005", facility: "All Star Imaging", type: "MRI", quantity: 1 },
  { id: "IE-010", patientId: "PT-1006", facility: "Alpha MRI Center", type: "MRI", quantity: 2 },
];

export const caseTimelineMetrics: CaseTimelineMetricRecord[] = [
  { patientId: "PT-1001", initialToDischargeDays: 15, dischargeToRbDays: 120, rbToPaidDays: 48 },
  { patientId: "PT-1002", initialToDischargeDays: 18, dischargeToRbDays: 165, rbToPaidDays: 60 },
  { patientId: "PT-1003", initialToDischargeDays: 13, dischargeToRbDays: 170, rbToPaidDays: 35 },
  { patientId: "PT-1004", initialToDischargeDays: 16, dischargeToRbDays: 190, rbToPaidDays: 52 },
  { patientId: "PT-1005", initialToDischargeDays: 14, dischargeToRbDays: 150, rbToPaidDays: 46 },
];

export const soapMacroButtons = {
  subjective: ["Headaches", "Cervical", "Thoracic", "Lumbar", "Pain Scale"],
  objective: ["MVC HX", "Vitals", "Cervical", "Lumbar/Hip", "Gap In Care"],
  assessment: ["Improving", "Plateau", "Needs MRI", "Needs Specialist"],
  plan: ["CMT 1-2", "EMS", "Re-Exam 2 Weeks", "Referral to Specialist"],
};

export const statusOptions: CaseStatus[] = [
  "Active",
  "Discharged",
  "Ready To Submit",
  "Submitted",
  "Dropped",
  "Paid",
];

export function getPatientById(patientId: string) {
  return patients.find((patient) => patient.id === patientId);
}

export function getEncountersByPatientId(patientId: string) {
  return encounters.filter((encounter) => encounter.patientId === patientId);
}

function persistPatients(nextPatients: PatientRecord[]) {
  patients.splice(0, patients.length, ...nextPatients);
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(PATIENTS_STORAGE_KEY, JSON.stringify(nextPatients));
}

function createPatientId() {
  return `PT-${Date.now()}-${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0")}`;
}

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export type CreatePatientDraft = {
  firstName: string;
  lastName: string;
  attorney?: string;
  dob?: string;
  dateOfLoss: string;
  initialExam?: string;
  phone?: string;
  email?: string;
  address?: string;
  caseStatus?: CaseStatus;
  lienStatus?: string;
  priorCare?: string;
};

export function createPatientRecord(draft: CreatePatientDraft): PatientRecord | null {
  const firstName = cleanString(draft.firstName);
  const lastName = cleanString(draft.lastName);
  if (!firstName || !lastName) {
    return null;
  }

  const fullName = `${lastName}, ${firstName}`;
  const dateOfLoss = toIsoDate(draft.dateOfLoss) || getTodayIsoDate();
  const dob = toIsoDate(draft.dob);
  const matrix: Partial<Record<PatientMatrixField, string>> = {};
  const phone = cleanString(draft.phone) || "-";
  const initialExam = cleanString(draft.initialExam);
  const lienStatus = cleanString(draft.lienStatus);
  const priorCare = cleanString(draft.priorCare);

  if (phone && phone !== "-") {
    matrix.contact = phone;
  }
  if (initialExam) {
    matrix.initialExam = initialExam;
  }
  if (lienStatus) {
    matrix.lien = lienStatus;
  }
  if (priorCare) {
    matrix.priorCare = priorCare;
  }

  const nextPatient: PatientRecord = {
    id: createPatientId(),
    fullName,
    dob,
    phone,
    email: cleanString(draft.email),
    address: cleanString(draft.address),
    attorney: cleanString(draft.attorney) || "Self",
    caseStatus: draft.caseStatus ?? "Active",
    dateOfLoss,
    lastUpdate: getTodayIsoDate(),
    priority: "Normal",
    matrix: Object.keys(matrix).length > 0 ? matrix : undefined,
  };

  persistPatients([nextPatient, ...patients]);
  return nextPatient;
}

export type UpdatePatientRecordPatch = Partial<
  Pick<
    PatientRecord,
    "fullName" | "dob" | "phone" | "email" | "address" | "attorney" | "caseStatus" | "dateOfLoss" | "lastUpdate" | "priority"
  > & {
    matrix: Partial<Record<PatientMatrixField, string>>;
  }
>;

export function updatePatientRecordById(patientId: string, patch: UpdatePatientRecordPatch) {
  const normalizedPatientId = cleanString(patientId);
  if (!normalizedPatientId) {
    return null;
  }

  const existingPatient = patients.find((entry) => entry.id === normalizedPatientId);
  if (!existingPatient) {
    return null;
  }

  const nextPatient: PatientRecord = {
    ...existingPatient,
    ...patch,
    matrix: patch.matrix
      ? {
          ...(existingPatient.matrix ?? {}),
          ...patch.matrix,
        }
      : existingPatient.matrix,
  };

  const nextPatients = patients.map((entry) => (entry.id === normalizedPatientId ? nextPatient : entry));
  persistPatients(nextPatients);
  return nextPatient;
}
