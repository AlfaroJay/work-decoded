#!/usr/bin/env node

/**
 * ============================================================================
 * Work Decoded — Twilio SMS Configuration Script
 * ============================================================================
 *
 * Purpose:  Configure the Twilio Messaging Service for toll-free number
 *           +18555500594, set up STOP/HELP auto-replies, and provide
 *           template functions for all SMS flows.
 *
 * Owner:    Michelle Williams / Work Decoded
 * Dev:      Jose (AlphaCreative) — jose@thealphacreative.com
 *
 * Usage:
 *   DRY RUN (prints everything, sends nothing):
 *     node scripts/setup-twilio-sms.js --dry-run
 *
 *   CONFIGURE TWILIO (creates messaging service + settings):
 *     TWILIO_ACCOUNT_SID=ACxxx TWILIO_AUTH_TOKEN=xxx node scripts/setup-twilio-sms.js --setup
 *
 *   SEND A TEST SMS (one template to one number):
 *     TWILIO_ACCOUNT_SID=ACxxx TWILIO_AUTH_TOKEN=xxx node scripts/setup-twilio-sms.js --test --to=+1XXXXXXXXXX --template=SS-1
 *
 *   LIST ALL TEMPLATES (prints every template with sample merge data):
 *     node scripts/setup-twilio-sms.js --list
 *
 * Env vars:
 *   TWILIO_ACCOUNT_SID   — Twilio Account SID (starts with AC)
 *   TWILIO_AUTH_TOKEN     — Twilio Auth Token
 *   TWILIO_MESSAGING_SID  — (Optional) Existing Messaging Service SID to reuse
 *
 * ============================================================================
 *
 *  ✅  APPROVED TEMPLATES — All SMS body text below matches the approved
 *      copy from "WorkDecoded_Complete_SMS_Templates.docx" (Michelle's
 *      developer handoff document, May 21, 2026). Primary versions used.
 *      Alternative versions are noted in comments for future rotation.
 *
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// 0. Dependencies & CLI arg parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const DO_SETUP  = args.includes('--setup');
const DO_TEST   = args.includes('--test');
const DO_LIST   = args.includes('--list');

const TOLL_FREE_NUMBER = '+18555500594';
const MESSAGING_SERVICE_NAME = 'Work Decoded SMS';

// Parse --to=+1... and --template=SS-1 from CLI
function getArg(flag) {
  const match = args.find(a => a.startsWith(`--${flag}=`));
  return match ? match.split('=')[1] : null;
}

// ---------------------------------------------------------------------------
// 1. Twilio client (lazy — only created when needed)
// ---------------------------------------------------------------------------

let _client = null;
function getClient() {
  if (_client) return _client;
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    console.error('❌  Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN env vars.');
    process.exit(1);
  }
  try {
    const twilio = require('twilio');
    _client = twilio(sid, token);
    return _client;
  } catch (e) {
    console.error('❌  Could not load twilio SDK. Run: npm install twilio');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// 2. STOP / HELP Auto-Reply Text (exact approved copy — do NOT change)
// ---------------------------------------------------------------------------

const AUTO_REPLIES = {
  STOP: 'Work Decoded: You have been unsubscribed and will receive no further messages from us. Reply START to resubscribe or HELP for assistance.',
  // 140 chars ✓

  HELP: 'Work Decoded: For support email support@workdecodedhq.com or visit WorkDecodedHQ.com. Reply STOP to unsubscribe. Msg & data rates may apply.',
  // 155 chars ✓
};

// ---------------------------------------------------------------------------
// 3. Consent Language (for intake form checkbox — reference copy)
// ---------------------------------------------------------------------------

const CONSENT_LANGUAGE = `By checking this box, I expressly consent to receive SMS text messages from Work Decoded at the mobile phone number provided on this form. Messages will include session booking confirmations, appointment reminders, and related service updates. This consent is not a condition of purchase. Message and data rates may apply. Message frequency varies. Reply STOP to opt out at any time. Reply HELP for help. View our Privacy Policy at WorkDecodedHQ.com/privacy.`;

// ---------------------------------------------------------------------------
// 4. SMS Template Functions
// ---------------------------------------------------------------------------
//
// Each function accepts a merge-data object and returns the formatted SMS body.
// All templates follow the compliance pattern:
//   "Work Decoded: [body] Reply STOP to opt out."
//
// Merge fields use {{doublebraces}} in comments for Zapier compatibility,
// but the JS functions accept a plain object.
//
// ✅  APPROVED — all templates match Michelle's "WorkDecoded_Complete_SMS_Templates.docx"
//     Primary versions used. Alternatives noted in comments for future rotation.
//
// IMPORTANT: All messages must stay under 160 chars. Shorten all links with
// bit.ly or Rebrandly before inserting. Session links are Google Meet (not Zoom).
// ---------------------------------------------------------------------------

const TEMPLATES = {

  // -------------------------------------------------------------------------
  // SINGLE SESSION FLOW
  // -------------------------------------------------------------------------

  /**
   * SS-1: Booking Confirmation (130/160 chars ✓)
   * Trigger: Immediately after single session is booked in Acuity
   * Zapier: New appointment in Acuity → Send SMS via Twilio immediately
   *
   * Merge fields:
   *   clientFirstName  — Client's first name (from Acuity/Airtable)
   *   sessionDate      — e.g. "Monday, May 5" (from Acuity booking)
   *   sessionTime      — e.g. "2:00 PM ET" (from Acuity booking)
   *
   * Alt version (159 chars): "Work Decoded: Hi [First Name]! You're booked
   * for [Date] at [Time]. Check your email for your booking confirmation.
   * Questions? support@workdecodedhq.com Reply STOP to opt out."
   */
  'SS-1': (data) => {
    const { clientFirstName, sessionDate, sessionTime } = data;
    return `Work Decoded: Hi ${clientFirstName}! Your session is confirmed for ${sessionDate} at ${sessionTime}. We're ready for you — see you then! Reply STOP to opt out.`;
  },

  /**
   * SS-2: 24-Hour Pre-Session Reminder (151/160 chars ✓)
   * Trigger: 24 hours before the scheduled session time
   * Zapier: "Delay Until" session date/time minus 24 hours → Send SMS
   *
   * Merge fields:
   *   clientFirstName  — Client's first name
   *   sessionTime      — e.g. "2:00 PM ET"
   *
   * Alt version (158 chars, warmer): "Work Decoded: Hi [First Name]!
   * Reminder — your session is tomorrow at [Time]. We've reviewed everything
   * and we're ready for you. See you then! Reply STOP to opt out."
   */
  'SS-2': (data) => {
    const { clientFirstName, sessionTime } = data;
    return `Work Decoded: Hi ${clientFirstName}! Your session is tomorrow at ${sessionTime}. Your consultant is prepared and ready for you. See you then! Reply STOP to opt out.`;
  },

  /**
   * SS-3: 1-Hour Pre-Session Reminder (151/160 chars ✓)
   * Trigger: 1 hour before the scheduled session time
   * Zapier: "Delay Until" session date/time minus 1 hour → Send SMS
   *
   * Merge fields:
   *   clientFirstName  — Client's first name
   *   sessionTime      — e.g. "2:00 PM ET"
   *   meetLink         — Shortened Google Meet link (bit.ly/Rebrandly)
   *
   * IMPORTANT: meetLink must be shortened — full Google Meet URLs will
   * push this over 160 chars. Use bit.ly or Rebrandly.
   *
   * Alt version (158 chars, warmer): "Work Decoded: Hi [First Name]!
   * We're ready for you — session in 1 hour at [Time]. Meet: [Link]
   * Take a breath. Real talk starts soon. Reply STOP to opt out."
   */
  'SS-3': (data) => {
    const { clientFirstName, sessionTime, meetLink } = data;
    return `Work Decoded: Hi ${clientFirstName}! Your session starts in 1 hour at ${sessionTime}. Join via Google Meet: ${meetLink} You've got this. Reply STOP to opt out.`;
  },

  // -------------------------------------------------------------------------
  // PACKAGE FLOW
  // -------------------------------------------------------------------------

  /**
   * PKG-1: Package Purchase Confirmation (155/160 chars ✓)
   * Trigger: Immediately after package purchase
   * Zapier: New package purchase in Airtable (via Acuity + Zapier) → Send SMS
   *
   * Merge fields:
   *   clientFirstName  — Client's first name
   *   packageSize      — "3" or "5" (package session count)
   *   expirationDate   — e.g. "June 4, 2026" (auto-calculated: purchase + 1 year)
   *
   * Alt version (if expiration date unavailable, 158 chars):
   * "Work Decoded: Hi [First Name]! Your [3/5]-session package is confirmed
   * & ready to use. Sessions are valid for 1 year. Book at WorkDecodedHQ.com.
   * Reply STOP to opt out."
   */
  'PKG-1': (data) => {
    const { clientFirstName, packageSize, expirationDate } = data;
    return `Work Decoded: Hi ${clientFirstName}! Your ${packageSize}-session package is confirmed. Sessions expire ${expirationDate}. Book anytime at WorkDecodedHQ.com. Reply STOP to opt out.`;
  },

  /**
   * PKG-2: Monthly Check-In Reminder (152/160 chars ✓)
   * Trigger: Every 30 days after purchase until sessions used or package expires
   * Zapier: Repeating Zap every 30 days → check Airtable remaining > 0 → Send SMS
   *
   * Suppression: Skip if remaining sessions = 0 or client bought a new package
   *
   * Merge fields:
   *   clientFirstName    — Client's first name
   *   sessionsRemaining  — e.g. "2" (from Airtable)
   *   bookingLink        — Shortened Acuity booking URL (e.g. bit.ly/bookWD)
   *
   * Alt versions for monthly rotation:
   *   Warmer (160 chars): "...Checking in — you have [#] session(s) available.
   *     We're here whenever work gets complicated. Book: [Link]..."
   *   Topic prompt (151 chars): "...Salary review, tough manager, career move?
   *     Your [#] session(s) are ready. Book: [Link]..."
   */
  'PKG-2': (data) => {
    const { clientFirstName, sessionsRemaining, bookingLink } = data;
    return `Work Decoded: Hi ${clientFirstName}! You have ${sessionsRemaining} session(s) ready. How are things at work? Book a check-in anytime: ${bookingLink} Reply STOP to opt out.`;
  },

  /**
   * PKG-3: Final Month Reminder (158/160 chars ✓)
   * Trigger: 30 days before package expiration (purchase date + 335 days)
   * Zapier: "Delay Until" purchase date + 335 days → check remaining > 0 → Send SMS
   *
   * Suppression: Skip if remaining sessions = 0
   *
   * Merge fields:
   *   clientFirstName    — Client's first name
   *   sessionsRemaining  — e.g. "1" (from Airtable)
   *   expirationDate     — e.g. "June 4, 2026"
   *   bookingLink        — Shortened Acuity booking URL (e.g. bit.ly/bookWD)
   *
   * Alt version (warmer, 160 chars): "...Just a heads up — your [#] session(s)
   * expire [Date]. We'd love to see you use them. Book: [Link]..."
   */
  'PKG-3': (data) => {
    const { clientFirstName, sessionsRemaining, expirationDate, bookingLink } = data;
    return `Work Decoded: Hi ${clientFirstName}! Your ${sessionsRemaining} session(s) expire in 30 days on ${expirationDate}. Don't let them go! Book now: ${bookingLink} Reply STOP to opt out.`;
  },
};

// ---------------------------------------------------------------------------
// 5. Sample merge data (used for --dry-run and --list)
// ---------------------------------------------------------------------------

const SAMPLE_DATA = {
  'SS-1': {
    clientFirstName: 'Sarah',
    sessionDate: 'Monday, June 8',
    sessionTime: '2:00 PM ET',
  },
  'SS-2': {
    clientFirstName: 'Sarah',
    sessionTime: '2:00 PM ET',
  },
  'SS-3': {
    clientFirstName: 'Sarah',
    sessionTime: '2:00 PM ET',
    meetLink: 'bit.ly/wd-meet123',
  },
  'PKG-1': {
    clientFirstName: 'Marcus',
    packageSize: '3',
    expirationDate: 'June 8, 2027',
  },
  'PKG-2': {
    clientFirstName: 'Marcus',
    sessionsRemaining: '2',
    bookingLink: 'bit.ly/bookWD',
  },
  'PKG-3': {
    clientFirstName: 'Marcus',
    sessionsRemaining: '1',
    expirationDate: 'June 8, 2027',
    bookingLink: 'bit.ly/bookWD',
  },
};

// ---------------------------------------------------------------------------
// 6. Suppression Logic
// ---------------------------------------------------------------------------
//
// Before sending any reminder (SS-2, SS-3, PKG-2, PKG-3), check:
//
//   1. Session/package status — don't send if cancelled/completed/expired
//   2. Opt-out status — Twilio handles STOP at the carrier level, but we
//      should also check our own records in Airtable
//   3. For PKG-2/PKG-3 — skip if sessionsRemaining === 0
//
// In production, these checks happen in the Zapier filter step BEFORE the
// "Send SMS" action. The functions below are helpers if you move to a
// server-side scheduler instead of Zapier.
// ---------------------------------------------------------------------------

function shouldSendReminder(templateId, record) {
  // Universal check: is the client opted out in our system?
  if (record.smsOptedOut === true) {
    console.log(`  ⏭  Skipping ${templateId} — client opted out`);
    return false;
  }

  // Single session reminders: skip if session is cancelled
  if (['SS-2', 'SS-3'].includes(templateId)) {
    if (record.sessionStatus === 'cancelled' || record.sessionStatus === 'completed') {
      console.log(`  ⏭  Skipping ${templateId} — session is ${record.sessionStatus}`);
      return false;
    }
  }

  // Package reminders: skip if no sessions remain or package expired
  if (['PKG-2', 'PKG-3'].includes(templateId)) {
    if (Number(record.sessionsRemaining) <= 0) {
      console.log(`  ⏭  Skipping ${templateId} — no sessions remaining`);
      return false;
    }
    if (record.packageExpired === true) {
      console.log(`  ⏭  Skipping ${templateId} — package expired`);
      return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// 7. Send SMS (with dry-run support)
// ---------------------------------------------------------------------------

async function sendSms({ to, templateId, mergeData, dryRun = false }) {
  const templateFn = TEMPLATES[templateId];
  if (!templateFn) {
    console.error(`❌  Unknown template: ${templateId}`);
    return null;
  }

  const body = templateFn(mergeData);

  console.log(`\n📱  Template: ${templateId}`);
  console.log(`    To: ${to}`);
  console.log(`    Body (${body.length} chars):`);
  console.log(`    "${body}"`);

  if (body.length > 1600) {
    console.warn(`    ⚠️  Message exceeds 1600 char Twilio limit!`);
  } else if (body.length > 160) {
    const segments = Math.ceil(body.length / 153); // 153 chars per segment in multi-part SMS
    console.log(`    ℹ️  Multi-segment SMS (${segments} segments)`);
  }

  if (dryRun) {
    console.log(`    🏃  DRY RUN — not sent`);
    return { sid: 'dry-run', body };
  }

  const client = getClient();
  const msgServiceSid = process.env.TWILIO_MESSAGING_SID;

  const params = {
    to,
    body,
  };

  // Use messaging service if available, otherwise send from the toll-free number directly
  if (msgServiceSid) {
    params.messagingServiceSid = msgServiceSid;
  } else {
    params.from = TOLL_FREE_NUMBER;
  }

  try {
    const message = await client.messages.create(params);
    console.log(`    ✅  Sent! SID: ${message.sid}`);
    return message;
  } catch (err) {
    console.error(`    ❌  Send failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 8. --setup: Configure Twilio Messaging Service
// ---------------------------------------------------------------------------

async function setupMessagingService() {
  console.log('\n🔧  TWILIO MESSAGING SERVICE SETUP');
  console.log('='.repeat(60));

  if (DRY_RUN) {
    console.log('\n🏃  DRY RUN — printing config that would be applied:\n');
    console.log(`  Messaging Service Name: ${MESSAGING_SERVICE_NAME}`);
    console.log(`  Toll-Free Number:       ${TOLL_FREE_NUMBER}`);
    console.log(`  STOP Auto-Reply:        "${AUTO_REPLIES.STOP}"`);
    console.log(`  HELP Auto-Reply:        "${AUTO_REPLIES.HELP}"`);
    console.log(`\n  Steps that --setup will perform:`);
    console.log(`    1. Create Messaging Service "${MESSAGING_SERVICE_NAME}"`);
    console.log(`    2. Add phone number ${TOLL_FREE_NUMBER} to the service`);
    console.log(`    3. Configure Advanced Opt-Out (STOP/HELP replies)`);
    console.log(`\n  NOTE: Twilio's toll-free numbers have built-in STOP/START/HELP`);
    console.log(`  handling at the carrier level. The auto-reply text is configured`);
    console.log(`  in the Twilio Console under Messaging → Services → Compliance.`);
    console.log(`  This script creates the Messaging Service and adds the number.`);
    console.log(`  You may need to manually set the STOP/HELP reply text in the`);
    console.log(`  Console if the API doesn't support it for toll-free numbers.\n`);
    return;
  }

  const client = getClient();

  // Step 1: Create Messaging Service
  console.log('\n  Step 1: Creating Messaging Service...');
  let service;
  try {
    service = await client.messaging.v1.services.create({
      friendlyName: MESSAGING_SERVICE_NAME,
      inboundRequestUrl: '', // Set this if you have a webhook for inbound SMS
      inboundMethod: 'POST',
      usecase: 'notifications',
    });
    console.log(`    ✅  Created: ${service.sid}`);
    console.log(`    💡  Save this as TWILIO_MESSAGING_SID in your .env`);
  } catch (err) {
    console.error(`    ❌  Failed: ${err.message}`);
    console.log(`    💡  If the service already exists, set TWILIO_MESSAGING_SID and re-run.`);
    return;
  }

  // Step 2: Add the toll-free number to the service
  console.log('\n  Step 2: Adding toll-free number to service...');
  try {
    // First, find the phone number SID
    const numbers = await client.incomingPhoneNumbers.list({ phoneNumber: TOLL_FREE_NUMBER });
    if (numbers.length === 0) {
      console.error(`    ❌  Number ${TOLL_FREE_NUMBER} not found in your Twilio account.`);
      console.log(`    💡  Make sure the number is purchased and active.`);
      return;
    }

    const phoneNumberSid = numbers[0].sid;
    console.log(`    📞  Found number SID: ${phoneNumberSid}`);

    await client.messaging.v1.services(service.sid)
      .phoneNumbers.create({ phoneNumberSid });
    console.log(`    ✅  Number added to messaging service`);
  } catch (err) {
    console.error(`    ❌  Failed to add number: ${err.message}`);
  }

  // Step 3: Note about STOP/HELP configuration
  console.log('\n  Step 3: STOP/HELP Auto-Reply Configuration');
  console.log('  '.repeat(1) + '-'.repeat(56));
  console.log(`    Twilio toll-free numbers handle STOP/START/HELP at the`);
  console.log(`    carrier level automatically. To customize the reply text:`);
  console.log(`\n    1. Go to Twilio Console → Messaging → Services`);
  console.log(`    2. Select "${MESSAGING_SERVICE_NAME}" (${service.sid})`);
  console.log(`    3. Go to "Compliance Info" or "Advanced Opt-Out"`);
  console.log(`    4. Set the following reply messages:\n`);
  console.log(`       STOP reply:`);
  console.log(`       "${AUTO_REPLIES.STOP}"\n`);
  console.log(`       HELP reply:`);
  console.log(`       "${AUTO_REPLIES.HELP}"\n`);
  console.log(`    5. Ensure "Advanced Opt-Out" is enabled`);
  console.log(`    6. Save changes\n`);

  console.log(`\n  🎉  Setup complete!`);
  console.log(`\n  TWILIO_MESSAGING_SID=${service.sid}`);
  console.log(`\n  Add this to your .env file and to Zapier's Twilio connection.\n`);
}

// ---------------------------------------------------------------------------
// 9. --list: Print all templates with sample data
// ---------------------------------------------------------------------------

function listTemplates() {
  console.log('\n📋  WORK DECODED — SMS TEMPLATES');
  console.log('='.repeat(60));
  console.log('✅  Approved templates from WorkDecoded_Complete_SMS_Templates.docx\n');

  for (const [id, fn] of Object.entries(TEMPLATES)) {
    const sampleBody = fn(SAMPLE_DATA[id]);
    const fields = Object.keys(SAMPLE_DATA[id]);

    console.log(`\n  ┌─ ${id} ${'─'.repeat(52 - id.length)}`);
    console.log(`  │  Merge fields: ${fields.join(', ')}`);
    console.log(`  │  Length: ${sampleBody.length} chars`);
    if (sampleBody.length > 160) {
      console.log(`  │  Segments: ${Math.ceil(sampleBody.length / 153)}`);
    }
    console.log(`  │`);
    // Word-wrap the body at 55 chars for display
    const words = sampleBody.split(' ');
    let line = '';
    for (const word of words) {
      if ((line + ' ' + word).length > 55) {
        console.log(`  │  ${line}`);
        line = word;
      } else {
        line = line ? line + ' ' + word : word;
      }
    }
    if (line) console.log(`  │  ${line}`);
    console.log(`  └${'─'.repeat(58)}`);
  }

  console.log('\n\n  AUTO-REPLIES (exact approved text — do not modify):');
  console.log('  ' + '-'.repeat(56));
  console.log(`  STOP (${AUTO_REPLIES.STOP.length} chars): "${AUTO_REPLIES.STOP}"`);
  console.log(`  HELP (${AUTO_REPLIES.HELP.length} chars): "${AUTO_REPLIES.HELP}"`);

  console.log('\n\n  CONSENT LANGUAGE (for intake form checkbox):');
  console.log('  ' + '-'.repeat(56));
  console.log(`  ${CONSENT_LANGUAGE}`);
  console.log('');
}

// ---------------------------------------------------------------------------
// 10. --test: Send a single template to a test number
// ---------------------------------------------------------------------------

async function testTemplate() {
  const to = getArg('to');
  const templateId = getArg('template');

  if (!to || !templateId) {
    console.error('❌  --test requires --to=+1XXXXXXXXXX and --template=SS-1');
    console.error('   Available templates: ' + Object.keys(TEMPLATES).join(', '));
    process.exit(1);
  }

  if (!TEMPLATES[templateId]) {
    console.error(`❌  Unknown template: ${templateId}`);
    console.error('   Available templates: ' + Object.keys(TEMPLATES).join(', '));
    process.exit(1);
  }

  console.log(`\n🧪  SENDING TEST SMS`);
  console.log('='.repeat(60));

  await sendSms({
    to,
    templateId,
    mergeData: SAMPLE_DATA[templateId],
    dryRun: DRY_RUN,
  });
}

// ---------------------------------------------------------------------------
// 11. --dry-run: Print all templates without sending
// ---------------------------------------------------------------------------

async function dryRun() {
  console.log('\n🏃  DRY RUN — All templates with sample data');
  console.log('='.repeat(60));
  console.log('✅  Approved templates from WorkDecoded_Complete_SMS_Templates.docx\n');

  for (const [id, fn] of Object.entries(TEMPLATES)) {
    await sendSms({
      to: '+10000000000',
      templateId: id,
      mergeData: SAMPLE_DATA[id],
      dryRun: true,
    });
  }

  console.log('\n\n  SUPPRESSION LOGIC TESTS:');
  console.log('  ' + '-'.repeat(56));

  // Test suppression scenarios
  const scenarios = [
    { templateId: 'SS-2', record: { smsOptedOut: true },               label: 'Opted-out client' },
    { templateId: 'SS-2', record: { sessionStatus: 'cancelled' },      label: 'Cancelled session' },
    { templateId: 'SS-3', record: { sessionStatus: 'completed' },      label: 'Completed session' },
    { templateId: 'PKG-2', record: { sessionsRemaining: 0 },           label: 'No sessions left' },
    { templateId: 'PKG-3', record: { packageExpired: true },           label: 'Expired package' },
    { templateId: 'SS-2', record: { sessionStatus: 'confirmed' },      label: 'Active session (should send)' },
    { templateId: 'PKG-2', record: { sessionsRemaining: 2 },           label: 'Sessions remaining (should send)' },
  ];

  for (const s of scenarios) {
    const result = shouldSendReminder(s.templateId, s.record);
    console.log(`  ${result ? '✅  SEND' : '⏭  SKIP'}  ${s.templateId} — ${s.label}`);
  }
}

// ---------------------------------------------------------------------------
// 12. Zapier Integration Reference
// ---------------------------------------------------------------------------
//
// ┌──────────────────────────────────────────────────────────────────┐
// │  ZAPIER INTEGRATION MAP                                         │
// ├──────────┬───────────────────────────┬──────────────────────────┤
// │ Template │ Zap Trigger               │ Zap Action               │
// ├──────────┼───────────────────────────┼──────────────────────────┤
// │ SS-1     │ New Record in Airtable    │ Twilio: Send SMS         │
// │          │ (Sessions table)          │ Template: SS-1           │
// ├──────────┼───────────────────────────┼──────────────────────────┤
// │ SS-2     │ Schedule by Zapier        │ Filter: session tomorrow │
// │          │ (Daily @ 9 AM EST)        │ → Twilio: Send SMS       │
// ├──────────┼───────────────────────────┼──────────────────────────┤
// │ SS-3     │ Schedule by Zapier        │ Filter: session in 1hr   │
// │          │ (Every hour)              │ → Twilio: Send SMS       │
// ├──────────┼───────────────────────────┼──────────────────────────┤
// │ PKG-1    │ New Record in Airtable    │ Twilio: Send SMS         │
// │          │ (Packages table)          │ Template: PKG-1          │
// ├──────────┼───────────────────────────┼──────────────────────────┤
// │ PKG-2    │ Schedule by Zapier        │ Filter: packages with    │
// │          │ (Daily @ 10 AM EST)       │ unused sessions, 30-day  │
// │          │                           │ interval → Twilio: Send  │
// ├──────────┼───────────────────────────┼──────────────────────────┤
// │ PKG-3    │ Schedule by Zapier        │ Filter: packages expiring│
// │          │ (Daily @ 10 AM EST)       │ in 30 days with unused   │
// │          │                           │ sessions → Twilio: Send  │
// └──────────┴───────────────────────────┴──────────────────────────┘
//
// Zapier Twilio action config for each Zap:
//   - From Number:     Use Messaging Service (set TWILIO_MESSAGING_SID)
//   - To Number:       {{client_phone}} from Airtable
//   - Message Body:    Compose using Airtable fields matching the merge fields above
//
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 13. Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('');
  console.log('  ╔════════════════════════════════════════════════════╗');
  console.log('  ║   Work Decoded — Twilio SMS Configuration Tool    ║');
  console.log('  ║   Toll-Free: +1 (855) 550-0594                   ║');
  console.log('  ╚════════════════════════════════════════════════════╝');

  if (!DO_SETUP && !DO_TEST && !DO_LIST && !DRY_RUN) {
    console.log(`
  Usage:
    node scripts/setup-twilio-sms.js --dry-run     Print all templates (no Twilio needed)
    node scripts/setup-twilio-sms.js --list         List templates with merge field docs
    node scripts/setup-twilio-sms.js --setup        Create Messaging Service on Twilio
    node scripts/setup-twilio-sms.js --test \\
      --to=+1XXXXXXXXXX --template=SS-1             Send one test SMS

  Env vars:
    TWILIO_ACCOUNT_SID    Your Twilio Account SID
    TWILIO_AUTH_TOKEN      Your Twilio Auth Token
    TWILIO_MESSAGING_SID   (Optional) Existing Messaging Service SID

  Combine flags:
    --setup --dry-run      Preview setup without making changes
    --test --dry-run       Preview a test SMS without sending
`);
    return;
  }

  if (DO_LIST) {
    listTemplates();
  }

  if (DRY_RUN && !DO_SETUP && !DO_TEST) {
    await dryRun();
  }

  if (DO_SETUP) {
    await setupMessagingService();
  }

  if (DO_TEST) {
    await testTemplate();
  }
}

main().catch(err => {
  console.error('\n💥  Unexpected error:', err.message);
  process.exit(1);
});

// ---------------------------------------------------------------------------
// Exports (for use as a module in Zapier Code steps or server-side scheduler)
// ---------------------------------------------------------------------------

module.exports = {
  TEMPLATES,
  SAMPLE_DATA,
  AUTO_REPLIES,
  CONSENT_LANGUAGE,
  sendSms,
  shouldSendReminder,
};
