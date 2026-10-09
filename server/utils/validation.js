import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Please provide a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

export const registerStudentSchema = z.object({
  email: z.string().email('Valid institutional email required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  full_name: z.string().min(2, 'Full name is required'),
  sif_number: z.string().regex(/^SIF\d{4,8}$/i, 'SIF number must follow format SIF followed by digits (e.g. SIF202601)'),
  department_id: z.coerce.number().int().positive('Please select your department'),
  programme: z.string().min(2, 'Programme/Degree is required (e.g., B.Tech CSE)'),
  year_of_study: z.coerce.number().int().min(1).max(5, 'Year of study must be 1 to 5'),
  section: z.string().min(1, 'Section is required (e.g., A, B)'),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian mobile number')
});

const ALLOWED_CATEGORIES = [
  'Ragging',
  'Harassment',
  'Bullying',
  'Stalking/Unwanted following',
  'Verbal abuse/Intimidation',
  'Cyber harassment/Online',
  'Discrimination',
  'Other'
];

export const complaintSchema = z.object({
  category: z.enum(ALLOWED_CATEGORIES, {
    errorMap: () => ({ message: 'Please select a valid incident category' })
  }),
  incident_at: z.string().refine((val) => {
    const d = new Date(val);
    if (isNaN(d.getTime())) return false;
    // Incident time cannot be in the future (+5 minutes grace for clock drift)
    return d.getTime() <= (Date.now() + 5 * 60 * 1000);
  }, { message: 'Incident date and time cannot be in the future' }),
  campus_location_id: z.coerce.number().int().positive('Please select the campus location'),
  location_detail: z.string().max(200).optional().default(''),
  description: z.string().max(4000).optional().default(''),
  suspect_details: z.string().max(1000).optional().default(''),
  witness_details: z.string().max(1000).optional().default(''),
  urgent: z.boolean().optional().default(false),
  privacy_mode: z.enum(['confidential', 'anonymous_to_reviewers_where_permitted']).default('confidential'),
  preferred_language: z.string().default('English'),
  submission_token: z.string().min(8, 'Valid submission token required for duplicate protection')
});

export const audioMetadataSchema = z.object({
  preferred_language: z.string().default('English'),
  recorded_or_uploaded: z.enum(['recorded', 'uploaded']).default('recorded'),
  duration_seconds: z.coerce.number().int().nonnegative().optional().default(0)
});

export const cctvRequestSchema = z.object({
  case_id: z.coerce.number().int().positive(),
  camera_ids: z.array(z.number().int().positive()).min(1, 'Select at least one camera for review')
});

export const statusUpdateSchema = z.object({
  status: z.enum([
    'Submitted',
    'Awaiting Review',
    'Under Investigation',
    'Additional Information Requested',
    'Referred to Another Authority',
    'Resolved',
    'Closed'
  ]),
  note: z.string().min(5, 'A clear reason or note is required for status changes'),
  student_visible: z.boolean().default(true)
});

export const infoRequestSchema = z.object({
  message: z.string().min(10, 'Information request must be at least 10 characters long')
});

export const infoResponseSchema = z.object({
  response: z.string().min(5, 'Response text is required')
});

export const investigationTaskSchema = z.object({
  title: z.string().min(4, 'Task title is required'),
  due_at: z.string().optional().nullable(),
  assigned_to: z.coerce.number().int().positive().optional().nullable()
});

export const internalNoteSchema = z.object({
  body: z.string().min(3, 'Internal note cannot be empty')
});

export const linkReviewSchema = z.object({
  review_note: z.string().min(5, 'Please provide an administrative note explaining the review decision')
});

export const policyUpdateSchema = z.object({
  threshold: z.number().min(20).max(90),
  weights: z.object({
    same_category: z.number().min(0).max(50),
    same_location_or_zone: z.number().min(0).max(50),
    within_14_days: z.number().min(0).max(30),
    within_30_days: z.number().min(0).max(20),
    same_time_of_day: z.number().min(0).max(25),
    suspect_descriptors: z.number().min(0).max(40),
    same_suspect_name_or_dept_cap: z.number().min(0).max(10)
  }),
  approval_required: z.boolean()
});
