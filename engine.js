// Loan payoff engine. All money is integer cents; rates are integer
// thousandths of a percent (7.05% -> 7050, 6.875% -> 6875).
//
// Each month: interest accrues on principal only (round(P * rate / 1200000))
// and lands in the loan's interest balance (the "wall"), and every payment
// clears that balance before it touches principal (34 CFR 685.211). Each open
// loan gets its minimum (or its payoff, if smaller); the rest of the budget is
// "extra" and a strategy decides where it goes.
//
// Loan types (loan.type):
//   "federal" (default) Federal loan in repayment. The interest balance
//             charges nothing and is never added to principal.
//   "private" The lender adds unpaid interest to principal when repayment
//             starts, so any interest balance entered is principal from month
//             1, and any month's interest a payment leaves unpaid joins principal.
//   "rap"     Federal loan on the Repayment Assistance Plan (34 CFR 685.209):
//             interest an on-time payment leaves uncovered is waived; if the
//             month's payments cut principal by under $50, the Department adds
//             min($50, payment) minus the principal paid; whatever is left after
//             360 monthly payments is forgiven. Assumes every payment is on
//             time, extra payments don't advance the due date, and no RAP
//             payments were made before month 1.
//
// The searches simulate millions of loan-months, so the month runs on typed
// arrays with no allocation per month. replay() uses the same steps and also
// records where each payment went, for display.
(function (root) {
  "use strict";

  const MAX_MONTHS = 1200;
  const RAP_MATCH = 5000;      // $50.00
  const RAP_FORGIVE = 360;     // monthly payments until forgiveness

  const typeOf = (l) => l.type || "federal";
  const KIND = { federal: 0, private: 1, rap: 2 };

  // Standard payment on principal + interest balance over `months` (default
  // 10 years), rounded up to the cent.
  function standardPayment(principal, unpaid, rate, months) {
    const r = rate / 1200000;
    const n = months || 120;
    const bal = principal + unpaid;
    return Math.ceil(r === 0 ? bal / n : (bal * r) / (1 - Math.pow(1 + r, -n)));
  }

  // ---- one month ------------------------------------------------------------
  // A state is {P, U, month}: principal and interest balance per loan.
  function compile(loans, budget) {
    const n = loans.length;
    const kind = Uint8Array.from(loans, (l) => KIND[typeOf(l)]);
    const P = Float64Array.from(loans, (l, i) => l.principal + (kind[i] === 1 ? l.unpaid : 0));
    const U = Float64Array.from(loans, (l, i) => (kind[i] === 1 ? 0 : l.unpaid));
    return {
      n, budget, kind, special: kind.some((k) => k !== 0),
      rate: Float64Array.from(loans, (l) => l.rate),
      min: Float64Array.from(loans, (l) => l.minPayment),
      start: { P, U, month: 0 },
      // scratch, overwritten every month
      key: new Float64Array(n), ord: new Int32Array(n), pay: new Float64Array(n),
      acc: new Float64Array(n), P0: new Float64Array(n), open: new Uint8Array(n), interest: 0,
    };
  }
  const cloneState = (s) => ({ P: s.P.slice(), U: s.U.slice(), month: s.month });
  function owed(s) {
    let t = 0;
    for (let i = 0; i < s.P.length; i++) t += s.P[i] + s.U[i];
    return t;
  }
  // Pay `amt` into loan i: interest balance first, then principal. Returns the
  // part that went to interest.
  function payInto(s, i, amt) {
    const toInt = amt < s.U[i] ? amt : s.U[i];
    s.U[i] -= toInt;
    s.P[i] -= amt - toInt;
    return toInt;
  }
  // Start a month: note what each loan owes, then accrue interest into c.acc.
  function accrueMonth(c, s) {
    const { n, rate, acc, P0, open } = c, P = s.P, U = s.U;
    s.month += 1;
    let interest = 0;
    for (let i = 0; i < n; i++) {
      open[i] = P[i] + U[i] > 0 ? 1 : 0;
      P0[i] = P[i];
      acc[i] = Math.round((P[i] * rate[i]) / 1200000);
      U[i] += acc[i];
      interest += acc[i];
    }
    c.interest = interest;
  }
  // Accrue, then pay each loan its minimum (or payoff) into `mins`. Returns the extra.
  function openMonth(c, s, mins) {
    accrueMonth(c, s);
    const { n, min } = c, P = s.P, U = s.U;
    let minSum = 0;
    for (let i = 0; i < n; i++) {
      const due = P[i] + U[i], m = min[i] < due ? min[i] : due;
      mins[i] = m;
      minSum += m;
    }
    if (minSum > c.budget) throw new Error("budget");
    for (let i = 0; i < n; i++) payInto(s, i, mins[i]);
    return c.budget - minSum;
  }
  // Strategy order in c.ord: higher key first, lower index on ties. Modes:
  // 0 avalanche (rate); 1 effective rate, rate * P / (P + U); 2 loan j first,
  // then effective rate; 3 loan j's interest balance first, then effective rate.
  function orderLoans(c, s, mode, j) {
    const { n, key, ord, rate } = c, P = s.P, U = s.U;
    for (let i = 0; i < n; i++) {
      if (mode === 0) key[i] = rate[i];
      else {
        const eff = P[i] + U[i] > 0 ? (rate[i] * P[i]) / (P[i] + U[i]) : -1;
        key[i] = mode === 1 ? eff : (i === j && (mode === 2 || U[i] > 0) ? 1e6 : 0) + eff;
      }
      ord[i] = i;
    }
    for (let a = 1; a < n; a++) {
      const v = ord[a];
      let b = a - 1;
      while (b >= 0 && (key[ord[b]] < key[v] || (key[ord[b]] === key[v] && ord[b] > v))) { ord[b + 1] = ord[b]; b--; }
      ord[b + 1] = v;
    }
  }
  // Spend the extra: loan `lead` first (-1: none), then in the strategy's
  // order, each loan up to its payoff. Adds to `pay`.
  function spendExtra(c, s, lead, mode, j, extra, pay) {
    orderLoans(c, s, mode, j);
    const P = s.P, U = s.U;
    for (let k = lead >= 0 ? -1 : 0; k < c.n; k++) {
      const i = k < 0 ? lead : c.ord[k];
      if (k >= 0 && i === lead) continue;
      if (extra <= 0) break;
      const amt = extra < P[i] + U[i] ? extra : P[i] + U[i];
      pay[i] += amt;
      extra -= amt;
      payInto(s, i, amt);
    }
  }
  // End a month after this month's payments `pay`: private capitalization, RAP
  // waiver, match and forgiveness. Returns the interest waived; fills `detail`
  // ({capitalized, waived, matched, forgiven} arrays) when given.
  function closeMonth(c, s, pay, acc, P0, open, detail) {
    const { n, kind } = c, P = s.P, U = s.U;
    let waived = 0, rapPay = 0, rapPrincipal = 0, rapOpen = false;
    for (let i = 0; i < n; i++) {
      if (kind[i] === 1 && U[i] > 0) {
        if (detail) detail.capitalized[i] = U[i];
        P[i] += U[i];
        U[i] = 0;
      } else if (kind[i] === 2 && open[i]) {
        rapOpen = true;
        // the payment covers this month's interest first; what it misses is waived
        if (pay[i] < acc[i]) {
          const w = acc[i] - pay[i];
          U[i] -= w;
          waived += w;
          if (detail) detail.waived[i] = w;
        }
        rapPay += pay[i];
        rapPrincipal += P0[i] - P[i];
      }
    }
    if (rapOpen && rapPrincipal < RAP_MATCH) {
      // RAP payments are one amount across all RAP loans; spread the match by principal
      let room = 0;
      for (let i = 0; i < n; i++) if (kind[i] === 2 && P[i] > 0) room += P[i];
      const match = Math.min(Math.min(RAP_MATCH, rapPay) - rapPrincipal, room);
      if (match > 0) {
        const m = new Float64Array(n);
        let given = 0;
        for (let i = 0; i < n; i++) if (kind[i] === 2 && P[i] > 0) { m[i] = Math.floor((match * P[i]) / room); given += m[i]; }
        for (let i = 0; i < n && given !== match; i++) {   // rounding leftovers, never past a loan's principal
          if (kind[i] !== 2 || !(P[i] > 0)) continue;
          const add = Math.min(match - given, P[i] - m[i]);
          m[i] += add;
          given += add;
        }
        for (let i = 0; i < n; i++) {
          P[i] -= m[i];
          if (detail) detail.matched[i] = m[i];
        }
      }
    }
    if (s.month === RAP_FORGIVE) {
      for (let i = 0; i < n; i++) {
        if (kind[i] === 2 && P[i] + U[i] > 0) {
          if (detail) detail.forgiven[i] = P[i] + U[i];
          P[i] = 0;
          U[i] = 0;
        }
      }
    }
    return waived;
  }

  // Simulate from state s0 (null: the start). The extra goes to loan a through
  // month k, then loan b (a < 0: no lead), the rest in `mode` order (see
  // orderLoans). Returns {paid, interest, months, payments, stuck}: paid is
  // everything the borrower pays, interest is interest charged (accrued minus
  // RAP waivers), stuck means still owing after MAX_MONTHS. Stops early with
  // paid = Infinity once paid plus what must still be repaid passes `bound`.
  function simulate(c, s0, mode, j, a, b, k, wantPayments, bound) {
    const s = cloneState(s0 || c.start), n = c.n, pay = c.pay;
    let paid = 0, interest = 0;
    const payments = [];
    for (let m = 1; m <= MAX_MONTHS; m++) {
      if (owed(s) === 0) return { paid, interest, months: m - 1, payments, stuck: false };
      const extra = openMonth(c, s, pay);
      spendExtra(c, s, a < 0 ? -1 : s.month <= k ? a : b, mode, j, extra, pay);
      const waived = c.special ? closeMonth(c, s, pay, c.acc, c.P0, c.open) : 0;
      let total = 0, mustRepay = 0;   // RAP balances can be matched or forgiven
      for (let i = 0; i < n; i++) { total += pay[i]; if (c.kind[i] !== 2) mustRepay += s.P[i] + s.U[i]; }
      paid += total;
      interest += c.interest - waived;
      if (bound !== undefined && paid + mustRepay > bound) return { paid: Infinity, interest: Infinity, months: Infinity, payments, stuck: true };
      if (wantPayments) payments.push(Array.from(pay));
    }
    return { paid, interest, months: MAX_MONTHS, payments, stuck: true };
  }

  // ---- finding the best plan -------------------------------------------------
  // One-step-lookahead planner minimizing total paid, never worse than any base
  // strategy.
  function optimal(loans, budget) {
    const c = compile(loans, budget), n = c.n;
    const bases = [[0, 0], [1, 0]];
    for (let j = 0; j < n; j++) {
      bases.push([2, j]);
      if (loans[j].unpaid > 0) bases.push([3, j]);
    }
    // cheapest finish from `s` (capped at `bound`), or Infinity if every base
    // gets stuck. The min doesn't depend on the order bases are tried, so the
    // one that won last time goes first: a tight bound early prunes the rest.
    let lead = 0;
    const costToGo = (s, bound) => {
      if (owed(s) === 0) return 0;
      let best = bound;
      for (let k = 0; k < bases.length; k++) {
        const jj = (lead + k) % bases.length;
        const r = simulate(c, s, bases[jj][0], bases[jj][1], -1, -1, 0, false, best);
        if (!r.stuck && r.paid < best) { best = r.paid; lead = jj; }
      }
      return best;
    };
    let s = cloneState(c.start);
    let paid = 0, interest = 0;
    const payments = [];
    const mins = new Float64Array(n), acc = new Float64Array(n), P0 = new Float64Array(n), open = new Uint8Array(n);
    for (let m = 1; m <= MAX_MONTHS; m++) {
      if (owed(s) === 0) return { paid, interest, months: m - 1, payments, stuck: false };
      const extra = openMonth(c, s, mins);
      const monthInterest = c.interest;
      acc.set(c.acc); P0.set(c.P0); open.set(c.open);   // the rollouts below overwrite c's scratch
      let best = null;
      for (let first = 0; first < n; first++) {
        if (first > 0 && s.P[first] + s.U[first] === 0) continue;
        const cs = cloneState(s), pay = mins.slice();
        spendExtra(c, cs, first, 1, 0, extra, pay);
        const waived = c.special ? closeMonth(c, cs, pay, acc, P0, open) : 0;
        const cost = costToGo(cs, best ? best.cost : Infinity);
        if (!best || cost < best.cost) best = { cost, s: cs, pay, waived };
        if (extra === 0) break;
      }
      s = best.s;
      for (let i = 0; i < n; i++) paid += best.pay[i];
      interest += monthInterest - best.waived;
      payments.push(Array.from(best.pay));
    }
    return { paid, interest, months: MAX_MONTHS, payments, stuck: true };
  }

  // Plans that send the extra to loan a through month k, then to loan b (the
  // rest by effective rate). The lookahead can miss a well-timed switch,
  // notably with RAP loans whose waiver rewards staying on the minimum, so
  // run() also tries these: every ordered pair, k on a grid then refined.
  function bestSwitch(loans, budget, T, bound) {
    const c = compile(loans, budget), n = c.n;
    let best = null;
    const stride = Math.max(1, Math.ceil(T / 120));
    const tryK = (a, b, k) => {
      if (k < 0 || k > T) return;
      const r = simulate(c, null, 1, 0, a, b, k, false, best ? best.paid : bound);
      if (!r.stuck && (!best || r.paid < best.paid)) best = { a, b, k, paid: r.paid };
    };
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        if (a === b) continue;
        const before = best;
        for (let k = 0; k <= T; k += stride) tryK(a, b, k);
        if (stride > 1 && best !== before) {
          const k0 = best.k;
          for (let k = k0 - stride + 1; k < k0 + stride; k++) tryK(a, b, k);
        }
      }
    }
    return best && simulate(c, null, 1, 0, best.a, best.b, best.k, true);
  }

  const avalanchePlan = (loans, budget) => simulate(compile(loans, budget), null, 0, 0, -1, -1, 0, true);

  // ---- results for display ---------------------------------------------------
  // Play a payment schedule back month by month, recording where each payment went.
  function replay(loans, payments) {
    const c = compile(loans, 0), n = c.n, s = cloneState(c.start);
    const rows = [];
    let cumulative = 0, paidSoFar = 0;
    for (const pay of payments) {
      accrueMonth(c, s);
      const row = { pay, accrued: Array.from(c.acc), toInterest: [], toPrincipal: [] };
      for (let i = 0; i < n; i++) {
        const toInt = payInto(s, i, pay[i]);
        row.toInterest.push(toInt);
        row.toPrincipal.push(pay[i] - toInt);
      }
      const detail = { capitalized: new Array(n).fill(0), waived: new Array(n).fill(0), matched: new Array(n).fill(0), forgiven: new Array(n).fill(0) };
      const waived = c.special ? closeMonth(c, s, pay, c.acc, c.P0, c.open, detail) : 0;
      Object.assign(row, detail);
      row.interest = c.interest - waived;
      cumulative += row.interest;
      paidSoFar += pay.reduce((a, b) => a + b, 0);
      row.cumulative = cumulative;
      row.paidSoFar = paidSoFar;
      row.P = Array.from(s.P);
      row.U = Array.from(s.U);
      rows.push(row);
    }
    return rows;
  }

  // Attach month-by-month rows and totals to a plan.
  function finishPlan(loans, plan) {
    const rows = replay(loans, plan.payments);
    const total = (k) => rows.reduce((s, r) => s + r[k].reduce((a, b) => a + b, 0), 0);
    return { ...plan, rows, waived: total("waived"), matched: total("matched"), forgiven: total("forgiven") };
  }

  // Avalanche and the best plan found: the lookahead planner or a switch plan,
  // whichever pays least. Avalanche wins ties, so the best is never worse.
  function run(loans, budget) {
    const aval = avalanchePlan(loans, budget);
    const beats = (x, y) => (x.stuck !== y.stuck ? !x.stuck : x.paid < y.paid);
    let best = aval;
    const opt = optimal(loans, budget);
    if (beats(opt, best)) best = opt;
    const T = Math.max(aval.months, opt.months);
    const sw = bestSwitch(loans, budget, T, best.stuck ? Infinity : best.paid);
    if (sw && beats(sw, best)) best = sw;
    return { avalanche: finishPlan(loans, aval), optimal: finishPlan(loans, best) };
  }

  // Same result shape as run(), for a best-plan schedule worked out earlier
  // (the demos ship theirs so the page needn't re-solve them).
  function runWithPlan(loans, budget, payments) {
    const aval = avalanchePlan(loans, budget);
    const rows = replay(loans, payments);
    const last = rows[rows.length - 1];
    const stuck = last.P.some((v, i) => v + last.U[i] > 0);
    const best = { payments, paid: last.paidSoFar, interest: last.cumulative, months: stuck ? MAX_MONTHS : rows.length, stuck };
    return { avalanche: finishPlan(loans, aval), optimal: finishPlan(loans, best) };
  }

  const api = { run, runWithPlan, replay, standardPayment, typeOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LoanEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
