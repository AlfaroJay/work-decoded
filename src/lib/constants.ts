// Airtable config — token is server-side only (env var)
export const AIRTABLE_BASE_ID = 'appG108B0ALyLJ4A3';
export const AIRTABLE_TABLE_NAME = 'Clients';

// Value maps: form display values → Airtable single-select option names
export const VALUE_MAP = {
  referral: {
    'Google / web search': 'Google Search',
    'LinkedIn': 'LinkedIn',
    'Instagram': 'Instagram',
    'Referred by a friend or colleague': 'Referral',
    'Work Decoded website': 'Website',
  } as Record<string, string>,
  coSize: {
    '1-50': '1-50',
    '51-200': '51-200',
    '201-1000': '201-1,000',
    '1000+': '1,000+',
    'unknown': 'Not sure',
  } as Record<string, string>,
  urgency: {
    'Low — no immediate deadline': 'Low',
    'Medium — within 2 weeks': 'Medium',
    'High — within 48–72 hours': 'High',
    'Crisis — today or tomorrow': 'Crisis',
  } as Record<string, string>,
};

// Form field options (used by both frontend selects and backend mapping)
export const REFERRAL_OPTIONS = [
  'Google / web search',
  'LinkedIn',
  'Instagram',
  'Referred by a friend or colleague',
  'Work Decoded website',
  'Other',
];

export const EMPLOYMENT_OPTIONS = [
  'Currently employed',
  'Recently terminated',
  'On leave',
  'Resigned',
  'Other',
];

export const INDUSTRY_OPTIONS = [
  'Technology',
  'Healthcare',
  'Finance',
  'Education',
  'Government',
  'Nonprofit',
  'Retail',
  'Manufacturing',
  'Legal',
  'Other',
];

export const ISSUE_OPTIONS = [
  'Workplace conflict',
  'Discrimination',
  'Harassment',
  'Retaliation',
  'Wrongful termination',
  'Contract dispute',
  'Wage/hour issue',
  'Hostile work environment',
  'Whistleblower concern',
  'Other',
];

export const COMPANY_SIZE_OPTIONS = [
  { label: '1–50', value: '1-50' },
  { label: '51–200', value: '51-200' },
  { label: '201–1,000', value: '201-1000' },
  { label: '1,000+', value: '1000+' },
  { label: 'Not sure', value: 'unknown' },
];

export const URGENCY_OPTIONS = [
  { label: 'Low', sublabel: 'no immediate deadline', value: 'Low — no immediate deadline' },
  { label: 'Medium', sublabel: 'within 2 weeks', value: 'Medium — within 2 weeks' },
  { label: 'High', sublabel: 'within 48–72 hours', value: 'High — within 48–72 hours' },
  { label: 'Crisis', sublabel: 'today or tomorrow', value: 'Crisis — today or tomorrow' },
];
