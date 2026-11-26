import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPublicSummaryPii } from '../src/services/piiGuardrailService.js';

test('PII Guardrail Service Suite (G2.3)', async (t) => {
  await t.test('Positive: Detects Nigerian phone numbers in various formats', () => {
    const phoneCases = [
      'Incident reported, call 08012345678 for details.',
      'Contact safety team at 0703-456-7890 immediately.',
      'Witness number: 090 1234 5678.',
      'Emergency reached on +234 802 345 6789 near gate.',
      'Call +2348012345678 for verification.',
      'International dial 002348031234567 available.',
      'Dial 2348091234567 if assistance required.',
      'Number is 08123456789 please call.',
      'Security direct: 09123456789.',
    ];

    for (const text of phoneCases) {
      const res = detectPublicSummaryPii(text);
      assert.equal(res.hasPii, true, `Expected PII detected for: "${text}"`);
      assert.equal(res.violationType, 'PHONE_NUMBER');
      assert.ok(res.message?.includes('phone number detected'));
      // Invariant: Never echo the phone number in the error message
      assert.equal(res.message?.includes('080'), false);
      assert.equal(res.message?.includes('+234'), false);
    }
  });

  await t.test('Positive: Detects email addresses', () => {
    const emailCases = [
      'Email student@yabatech.edu.ng for more information.',
      'Send updates to safety.lead@gmail.com immediately.',
      'Reporter contact: John_Doe+alerts@yahoo.co.uk.',
      'Contact Dean at admin-office@yabatech.edu.ng regarding repairs.',
    ];

    for (const text of emailCases) {
      const res = detectPublicSummaryPii(text);
      assert.equal(res.hasPii, true, `Expected PII detected for: "${text}"`);
      assert.equal(res.violationType, 'EMAIL_ADDRESS');
      assert.ok(res.message?.includes('email address detected'));
      // Invariant: Never echo the email in the error message
      assert.equal(res.message?.includes('@'), false);
    }
  });

  await t.test('Positive: Detects YABATECH student matriculation numbers', () => {
    const matricCases = [
      'Student F/ND/21/3210001 reported power interruption.',
      'Involved party matric: P/HD/20/3110042 at workshop.',
      'ID verified for f/nd/19/382910 near library.',
      'Found identity card for ND/21/3210001.',
      'Student with Matric No: 210204011 assisted.',
      'Matric: F/HND/18/200192 recorded.',
    ];

    for (const text of matricCases) {
      const res = detectPublicSummaryPii(text);
      assert.equal(res.hasPii, true, `Expected PII detected for: "${text}"`);
      assert.equal(res.violationType, 'MATRICULATION_NUMBER');
      assert.ok(res.message?.includes('matriculation number detected'));
      // Invariant: Never echo matric number in message
      assert.equal(res.message?.includes('3210001'), false);
    }
  });

  await t.test(
    'Negative: Harmless text, room numbers, distances and campus descriptions pass clean',
    () => {
      const allowedCases = [
        'Heavy smoke observed near the generator house in the central workshop.',
        'Water pipe burst in Block B Room 204 near the science complex at 14:30.',
        'Security officers dispatched to main gate near entrance 3.',
        'Approximately 50 metres from the auditorium, 2 students assisted.',
        'Incident reported at 10:30am on 12/04/2026. Area cordoned off.',
        'Electrical breaker tripped in Engineering Department Panel 4B.',
        'Medical team attending to minor injury at Sports Complex pitch 1.',
        'Fire extinguishers in corridor 2 inspected and recharged.',
      ];

      for (const text of allowedCases) {
        const res = detectPublicSummaryPii(text);
        assert.equal(res.hasPii, false, `Expected clean pass for: "${text}"`);
        assert.equal(res.violationType, undefined);
        assert.equal(res.message, undefined);
      }
    },
  );
});
