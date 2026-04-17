'use client';

import { useState, useEffect } from 'react';
import type { TimeSlot } from '@/lib/types';

interface DateTimePickerProps {
  selectedDate: string;
  selectedTime: string;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
}

export default function DateTimePicker({
  selectedDate,
  selectedTime,
  onDateChange,
  onTimeChange,
}: DateTimePickerProps) {
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(false);

  // Generate next 14 days of selectable dates (skip weekends)
  const availableDates: string[] = [];
  const today = new Date();
  // Start from tomorrow
  const start = new Date(today);
  start.setDate(start.getDate() + 1);

  for (let i = 0; availableDates.length < 10 && i < 21; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const day = d.getDay();
    if (day !== 0 && day !== 6) {
      // Skip weekends
      availableDates.push(d.toISOString().split('T')[0]);
    }
  }

  // Fetch slots when date changes
  useEffect(() => {
    if (!selectedDate) {
      setSlots([]);
      return;
    }

    setLoading(true);
    onTimeChange(''); // Reset time when date changes

    fetch(`/api/availability?date=${selectedDate}`)
      .then((res) => res.json())
      .then((data) => {
        setSlots(data.slots || []);
      })
      .catch(() => {
        setSlots([]);
      })
      .finally(() => setLoading(false));
  }, [selectedDate]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  return (
    <div className="space-y-6">
      {/* Date Selection */}
      <div>
        <label className="block text-sm font-semibold text-wd-navy mb-3">
          Select a Date
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {availableDates.map((date) => (
            <button
              key={date}
              type="button"
              onClick={() => onDateChange(date)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all
                ${
                  selectedDate === date
                    ? 'bg-wd-navy text-white shadow-md'
                    : 'bg-white border border-wd-mist text-wd-charcoal hover:border-wd-gold hover:shadow-sm'
                }`}
            >
              {formatDate(date)}
            </button>
          ))}
        </div>
      </div>

      {/* Time Selection */}
      {selectedDate && (
        <div>
          <label className="block text-sm font-semibold text-wd-navy mb-3">
            Select a Time <span className="font-normal text-gray-500">(Eastern Time)</span>
          </label>
          {loading ? (
            <div className="flex items-center gap-2 text-gray-500 py-4">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Checking availability…
            </div>
          ) : slots.length === 0 ? (
            <p className="text-gray-500 py-4">No slots available for this date.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {slots
                .filter((s) => s.available)
                .map((slot) => (
                  <button
                    key={slot.time}
                    type="button"
                    onClick={() => onTimeChange(slot.time)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all
                      ${
                        selectedTime === slot.time
                          ? 'bg-wd-gold text-white shadow-md'
                          : 'bg-white border border-wd-mist text-wd-charcoal hover:border-wd-gold hover:shadow-sm'
                      }`}
                  >
                    {formatTime(slot.time)}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Confirmation */}
      {selectedDate && selectedTime && (
        <div className="bg-white rounded-lg border border-wd-gold/30 p-4 flex items-center gap-3">
          <svg
            className="w-5 h-5 text-wd-gold flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <p className="text-sm">
            <strong>{formatDate(selectedDate)}</strong> at{' '}
            <strong>{formatTime(selectedTime)}</strong> ET — 15-minute consultation
          </p>
        </div>
      )}
    </div>
  );
}
