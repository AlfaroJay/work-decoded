export interface IntakeFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  referral: string;
  employmentStatus: string;
  industry: string;
  companySize: string;
  issueType: string;
  urgency: string;
  situationDescription: string;
  priorAction: 'yes' | 'no' | '';
  priorActionDetails: string;
  preferredConsultant: string;
  returningClient: 'yes' | 'no' | '';
  consent: boolean;
  // Scheduling
  selectedDate: string;  // ISO date string
  selectedTime: string;  // HH:MM format
}

export interface TimeSlot {
  time: string;       // "09:00", "09:15", etc.
  available: boolean;
}

export interface AvailabilityResponse {
  date: string;
  slots: TimeSlot[];
}

export interface SubmitResponse {
  success: boolean;
  message: string;
  clientRecordId?: string;
  calendarEventId?: string;
}
