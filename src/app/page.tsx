'use client';

import { useState } from 'react';
import DateTimePicker from '@/components/DateTimePicker';
import {
  REFERRAL_OPTIONS,
  EMPLOYMENT_OPTIONS,
  INDUSTRY_OPTIONS,
  ISSUE_OPTIONS,
  COMPANY_SIZE_OPTIONS,
  URGENCY_OPTIONS,
} from '@/lib/constants';
import type { IntakeFormData } from '@/lib/types';

const INITIAL_FORM: IntakeFormData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  referral: '',
  employmentStatus: '',
  industry: '',
  companySize: '',
  issueType: '',
  urgency: '',
  situationDescription: '',
  priorAction: '',
  priorActionDetails: '',
  preferredConsultant: '',
  returningClient: '',
  consent: false,
  selectedDate: '',
  selectedTime: '',
};

type Step = 'info' | 'details' | 'schedule' | 'review';

export default function IntakePage() {
  const [form, setForm] = useState<IntakeFormData>(INITIAL_FORM);
  const [step, setStep] = useState<Step>('info');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const update = <K extends keyof IntakeFormData>(key: K, value: IntakeFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const canAdvanceInfo =
    form.firstName.trim() && form.lastName.trim() && form.email.trim();

  const canAdvanceDetails = form.issueType && form.urgency && form.consent;

  const canAdvanceSchedule = form.selectedDate && form.selectedTime;

  async function handleSubmit() {
    setSubmitting(true);
    setResult(null);

    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      setResult(data);
      if (data.success) {
        setStep('review');
      }
    } catch {
      setResult({
        success: false,
        message: 'Something went wrong. Please try again or email support@workdecodedhq.com.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  // ---- Shared styles ----
  const inputClass =
    'w-full px-4 py-3 rounded-lg border border-wd-mist bg-white text-wd-charcoal focus:outline-none focus:border-wd-gold focus:ring-1 focus:ring-wd-gold/30 transition-colors';
  const selectClass = inputClass + ' appearance-none';
  const labelClass = 'block text-sm font-semibold text-wd-navy mb-1.5';

  return (
    <main className="min-h-screen bg-wd-cream">
      {/* Header */}
      <header className="bg-wd-navy text-white py-8">
        <div className="max-w-2xl mx-auto px-6">
          <h1 className="text-3xl font-heading text-white">Work Decoded</h1>
          <p className="mt-2 text-wd-mist/80 text-lg">
            Book your confidential consultation
          </p>
        </div>
      </header>

      {/* Progress Steps */}
      <div className="max-w-2xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-8">
          {[
            { key: 'info', label: 'Your Info' },
            { key: 'details', label: 'Situation' },
            { key: 'schedule', label: 'Schedule' },
            { key: 'review', label: 'Confirm' },
          ].map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors
                  ${
                    step === s.key
                      ? 'bg-wd-gold text-white'
                      : i <
                        ['info', 'details', 'schedule', 'review'].indexOf(step)
                      ? 'bg-wd-navy text-white'
                      : 'bg-wd-mist text-gray-400'
                  }`}
              >
                {i + 1}
              </div>
              <span
                className={`text-sm hidden sm:inline ${
                  step === s.key ? 'text-wd-navy font-semibold' : 'text-gray-400'
                }`}
              >
                {s.label}
              </span>
              {i < 3 && (
                <div className="w-8 sm:w-16 h-px bg-wd-mist mx-1" />
              )}
            </div>
          ))}
        </div>

        {/* Success state */}
        {result?.success && step === 'review' ? (
          <div className="bg-white rounded-2xl shadow-sm border border-wd-gold/20 p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-heading mb-3">You&apos;re All Set</h2>
            <p className="text-gray-600 mb-2">{result.message}</p>
            <p className="text-sm text-gray-400 mt-4">
              If you need to reschedule, email{' '}
              <a href="mailto:support@workdecodedhq.com" className="text-wd-gold underline">
                support@workdecodedhq.com
              </a>
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-wd-mist p-6 sm:p-8">
            {/* ---- STEP 1: Basic Info ---- */}
            {step === 'info' && (
              <div className="space-y-5">
                <h2 className="text-xl font-heading mb-4">Tell us about yourself</h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>
                      First Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      className={inputClass}
                      value={form.firstName}
                      onChange={(e) => update('firstName', e.target.value)}
                      placeholder="Jane"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      Last Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      className={inputClass}
                      value={form.lastName}
                      onChange={(e) => update('lastName', e.target.value)}
                      placeholder="Smith"
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>
                    Email <span className="text-red-400">*</span>
                  </label>
                  <input
                    className={inputClass}
                    type="email"
                    value={form.email}
                    onChange={(e) => update('email', e.target.value)}
                    placeholder="jane@example.com"
                  />
                </div>

                <div>
                  <label className={labelClass}>Phone</label>
                  <input
                    className={inputClass}
                    type="tel"
                    value={form.phone}
                    onChange={(e) => update('phone', e.target.value)}
                    placeholder="(555) 123-4567"
                  />
                </div>

                <div>
                  <label className={labelClass}>How did you hear about us?</label>
                  <select
                    className={selectClass}
                    value={form.referral}
                    onChange={(e) => update('referral', e.target.value)}
                  >
                    <option value="">Select one</option>
                    {REFERRAL_OPTIONS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Are you a returning client?</label>
                  <div className="flex gap-4 mt-1">
                    {['yes', 'no'].map((v) => (
                      <label key={v} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="returning"
                          value={v}
                          checked={form.returningClient === v}
                          onChange={() => update('returningClient', v as 'yes' | 'no')}
                          className="accent-wd-gold"
                        />
                        <span className="capitalize">{v}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <button
                    onClick={() => setStep('details')}
                    disabled={!canAdvanceInfo}
                    className="px-8 py-3 rounded-lg bg-wd-navy text-white font-semibold
                      disabled:opacity-40 disabled:cursor-not-allowed
                      hover:bg-wd-navy/90 transition-colors"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}

            {/* ---- STEP 2: Situation Details ---- */}
            {step === 'details' && (
              <div className="space-y-5">
                <h2 className="text-xl font-heading mb-4">Your Situation</h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Employment Status</label>
                    <select
                      className={selectClass}
                      value={form.employmentStatus}
                      onChange={(e) => update('employmentStatus', e.target.value)}
                    >
                      <option value="">Select one</option>
                      {EMPLOYMENT_OPTIONS.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Industry</label>
                    <select
                      className={selectClass}
                      value={form.industry}
                      onChange={(e) => update('industry', e.target.value)}
                    >
                      <option value="">Select one</option>
                      {INDUSTRY_OPTIONS.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Company Size</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {COMPANY_SIZE_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => update('companySize', o.value)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all
                          ${
                            form.companySize === o.value
                              ? 'bg-wd-navy text-white'
                              : 'bg-wd-mist/50 text-wd-charcoal hover:bg-wd-mist'
                          }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className={labelClass}>
                    Primary Issue <span className="text-red-400">*</span>
                  </label>
                  <select
                    className={selectClass}
                    value={form.issueType}
                    onChange={(e) => update('issueType', e.target.value)}
                  >
                    <option value="">Select one</option>
                    {ISSUE_OPTIONS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>
                    Urgency <span className="text-red-400">*</span>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
                    {URGENCY_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => update('urgency', o.value)}
                        className={`px-3 py-3 rounded-lg text-center transition-all
                          ${
                            form.urgency === o.value
                              ? o.label === 'Crisis'
                                ? 'bg-red-600 text-white shadow-md'
                                : 'bg-wd-gold text-white shadow-md'
                              : 'bg-white border border-wd-mist text-wd-charcoal hover:border-wd-gold'
                          }`}
                      >
                        <span className="block text-sm font-bold">{o.label}</span>
                        <span className="block text-xs opacity-70 mt-0.5">{o.sublabel}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Describe your situation</label>
                  <textarea
                    className={inputClass + ' min-h-[120px] resize-y'}
                    value={form.situationDescription}
                    onChange={(e) => update('situationDescription', e.target.value)}
                    placeholder="Please share what's happening at work and how we can help…"
                  />
                </div>

                <div>
                  <label className={labelClass}>Have you taken prior HR or legal action?</label>
                  <div className="flex gap-4 mt-1">
                    {['yes', 'no'].map((v) => (
                      <label key={v} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="priorAction"
                          value={v}
                          checked={form.priorAction === v}
                          onChange={() => update('priorAction', v as 'yes' | 'no')}
                          className="accent-wd-gold"
                        />
                        <span className="capitalize">{v}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {form.priorAction === 'yes' && (
                  <div>
                    <label className={labelClass}>Please describe</label>
                    <textarea
                      className={inputClass + ' min-h-[80px] resize-y'}
                      value={form.priorActionDetails}
                      onChange={(e) => update('priorActionDetails', e.target.value)}
                      placeholder="What actions have you taken so far?"
                    />
                  </div>
                )}

                <div>
                  <label className={labelClass}>Preferred Consultant (optional)</label>
                  <input
                    className={inputClass}
                    value={form.preferredConsultant}
                    onChange={(e) => update('preferredConsultant', e.target.value)}
                    placeholder="If you've worked with someone before"
                  />
                </div>

                {/* Consent */}
                <div className="bg-wd-cream/50 rounded-lg p-4 border border-wd-mist">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.consent}
                      onChange={(e) => update('consent', e.target.checked)}
                      className="accent-wd-gold mt-1"
                    />
                    <span className="text-sm text-gray-600">
                      <span className="text-red-400">*</span> I understand that this consultation
                      is confidential and agree to Work Decoded&apos;s terms of service. The
                      information provided will only be used to prepare for my session.
                    </span>
                  </label>
                </div>

                <div className="pt-4 flex justify-between">
                  <button
                    onClick={() => setStep('info')}
                    className="px-6 py-3 rounded-lg text-wd-navy font-semibold hover:bg-wd-mist/50 transition-colors"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={() => setStep('schedule')}
                    disabled={!canAdvanceDetails}
                    className="px-8 py-3 rounded-lg bg-wd-navy text-white font-semibold
                      disabled:opacity-40 disabled:cursor-not-allowed
                      hover:bg-wd-navy/90 transition-colors"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}

            {/* ---- STEP 3: Schedule ---- */}
            {step === 'schedule' && (
              <div className="space-y-5">
                <h2 className="text-xl font-heading mb-4">Pick a Time</h2>
                <p className="text-gray-500 text-sm -mt-2 mb-4">
                  Select a date and time for your 15-minute consultation call.
                </p>

                <DateTimePicker
                  selectedDate={form.selectedDate}
                  selectedTime={form.selectedTime}
                  onDateChange={(d) => update('selectedDate', d)}
                  onTimeChange={(t) => update('selectedTime', t)}
                />

                {/* Error banner */}
                {result && !result.success && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
                    {result.message}
                  </div>
                )}

                <div className="pt-4 flex justify-between">
                  <button
                    onClick={() => setStep('details')}
                    className="px-6 py-3 rounded-lg text-wd-navy font-semibold hover:bg-wd-mist/50 transition-colors"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!canAdvanceSchedule || submitting}
                    className="px-8 py-3 rounded-lg bg-wd-gold text-white font-bold text-lg
                      disabled:opacity-40 disabled:cursor-not-allowed
                      hover:bg-wd-gold/90 transition-colors shadow-md"
                  >
                    {submitting ? 'Booking…' : 'Book Consultation'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="py-8 text-center text-sm text-gray-400">
        <p>&copy; {new Date().getFullYear()} Work Decoded. All rights reserved.</p>
      </footer>
    </main>
  );
}
