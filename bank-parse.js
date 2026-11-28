'use strict';
/* Reads a Kotak / Slice transaction e-mail and says: bank, debit or credit, amount, who, reference.
   Returns null for anything that is not a real debit / credit (OTP, reminders, offers, statements ...).
   Pure functions only - no network, no sheet - so it can be tested on its own (node bank-parse.js). */

const toText = h => String(h || '')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|table)>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#8377;|&rupee;/g, '₹').replace(/&amp;/g, '&')
  .replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

const bankOf = from => /kotak/i.test(from) ? 'Kotak' : /slice/i.test(from) ? 'Slice' : '';

const AMT = /(?:Rs\.?|INR|₹)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;
const DEBIT = /\b(debited|debit|deducted|withdrawn|spent|paid|sent|purchase|payment of)\b/gi;
const CREDIT = /\b(credited|credit|received|deposited|refund(?:ed)?)\b/gi;
const SKIP = /\bOTP\b|one[- ]time (?:password|pin)|verification code|will be (?:debited|deducted|credited)|upcoming|reminder|auto-?pay (?:mandate|registration)|\bdue (?:on|by|date)\b|statement (?:is|for)|bill (?:is )?(?:generated|due)/i;

const nearest = (re, text, at) => {                  // distance from the amount to the closest matching word
  let best = Infinity, m; re.lastIndex = 0;
  while ((m = re.exec(text))) { best = Math.min(best, Math.abs(m.index - at)); if (m.index > at + 400) break; }
  return best;
};

function parse(from, subject, text) {
  const bank = bankOf(from); if (!bank) return null;
  const body = String(text || ''), all = String(subject || '') + '\n' + body;
  if (SKIP.test(all)) return null;
  const am = AMT.exec(all); if (!am) return null;
  const amount = Number(am[1].replace(/,/g, '')); if (!(amount > 0)) return null;
  const d = nearest(DEBIT, all, am.index), c = nearest(CREDIT, all, am.index);
  if (d === Infinity && c === Infinity) return null;
  const type = d <= c ? 'debit' : 'credit';

  let party = '';
  const pm = (type === 'debit'
    ? /(?:paid to|sent to|transferred to|trf to|towards|payee|beneficiary|merchant|to VPA|to)[:\s]+/i
    : /(?:received from|credited by|from VPA|from|by|sender)[:\s]+/i).exec(all);
  if (pm) {
    const rest = all.slice(pm.index + pm[0].length, pm.index + pm[0].length + 60).split(/\s+(?:on|via|using|from|ref|upi|for|at|a\/c|account|dated)\b|[.,\n(]/i)[0].trim();
    if (rest && rest.length >= 2 && !/^(your|the|a|an|account|a\/c|bank)\b/i.test(rest) && !/^\d+$/.test(rest)) party = rest.slice(0, 40);
  }
  const rm = /(?:UPI|Ref(?:erence)?|RRN|Txn|Transaction)[^0-9]{0,20}(\d{9,14})/i.exec(all) || /\b(\d{12})\b/.exec(all);
  const ac = /(?:a\/c|account|acct)[^0-9]{0,12}[X*x]*(\d{3,4})\b/i.exec(all);
  return { bank, type, amount, party, ref: rm ? rm[1] : '', acct: ac ? ac[1] : '' };
}

module.exports = { parse, toText, bankOf };

/* self-test: node bank-parse.js  (the sample mails below are invented - real mails are only known once they arrive) */
if (require.main === module) {
  const assert = require('assert');
  const t = (from, subj, body) => parse(from, subj, toText(body));
  let r = t('Kotak Bank <BankAlert@kotak.bank.in>', 'Transaction alert', '<p>Dear Customer,</p><p>Rs.1,250.50 has been debited from your account XX4321 on 28-Nov-2026. UPI Ref No. 633212345678. Paid to RAMESH KUMAR on UPI.</p>');
  assert.deepStrictEqual([r.bank, r.type, r.amount, r.party, r.ref, r.acct], ['Kotak', 'debit', 1250.5, 'RAMESH KUMAR', '633212345678', '4321']);
  r = t('Kotak <alerts@kotak.com>', 'Credit alert', 'INR 5,000.00 is credited to your a/c XX4321 on 28-11-2026. Received from AMIT SHARMA. UPI Ref 633200000001');
  assert.deepStrictEqual([r.type, r.amount, r.party], ['credit', 5000, 'AMIT SHARMA']);
  r = t('slice <noreply@sliceit.com>', 'You paid ₹499', 'You paid ₹499 to Swiggy using your slice account.');
  assert.deepStrictEqual([r.bank, r.type, r.amount], ['Slice', 'debit', 499]);
  r = t('slice <noreply@sliceit.com>', 'Refund processed', '₹120 refund credited to your slice account.');
  assert.deepStrictEqual([r.type, r.amount], ['credit', 120]);
  assert.strictEqual(t('Kotak <a@kotak.com>', 'OTP', 'Your OTP for Rs.500 transaction is 123456'), null);
  assert.strictEqual(t('Kotak <a@kotak.com>', 'Reminder', 'Rs.2,000 will be debited from your account on 01-Dec'), null);
  assert.strictEqual(t('HDFC <a@hdfcbank.net>', 'x', 'Rs.100 debited'), null);
  assert.strictEqual(t('Kotak <a@kotak.com>', 'Welcome', 'Thanks for banking with us'), null);
  console.log('bank-parse: all tests passed');
}
