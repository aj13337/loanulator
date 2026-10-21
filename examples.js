// The two demo scenarios. Minimums are standard payments over each loan's
// term (10 years if unset).
(function (root) {
  "use strict";
  const E = root.LoanEngine || require("./engine.js");
  // dollars and percents in, the engine's cents and thousandths of a percent out
  const loan = (name, dollars, pct, unpaidDollars, opts) => {
    const o = opts || {};
    const rate = Math.round(pct * 1000);
    const principal = Math.round(dollars) * 100;
    const unpaid = Math.round(unpaidDollars) * 100;
    return { name, type: o.type || "federal", principal, unpaid, rate, minPayment: E.standardPayment(principal, unpaid, rate, o.term) };
  };

  const examples = [
    {
      // Federal minimums over 25 years, private over 20.
      id: "surgeon",
      title: "Scenario A – Surgeon",
      budget: 960000,
      loans: [
        loan("Year 1 Unsubsidized Loan", 50000, 9.5, 50492, { term: 300 }),
        loan("Year 2 Unsubsidized Loan", 50000, 9.25, 44539, { term: 300 }),
        loan("Year 3 Unsubsidized Loan", 50000, 9.29, 40086, { term: 300 }),
        loan("Year 4 Unsubsidized Loan", 50000, 9.25, 35289, { term: 300 }),
        loan("Private loans", 406239, 9.0, 0, { type: "private", term: 240 }),
      ],
    },
    {
      // Federal and private minimums over 20 years.
      id: "undergrad",
      title: "Scenario B – Independent undergrad",
      budget: 166000,
      loans: [
        loan("Year 1 Unsubsidized Loan", 9500, 8.25, 3237, { term: 240 }),
        loan("Year 2 Unsubsidized Loan", 10500, 7.68, 2524, { term: 240 }),
        loan("Year 3 Unsubsidized Loan", 12500, 7.37, 1962, { term: 240 }),
        loan("Year 4 Unsubsidized Loan", 12500, 6.74, 952, { term: 240 }),
        loan("Year 1 Private Loan", 107097, 8.0, 0, { type: "private", term: 240 }),
        loan("Year 2 Private Loan", 23815, 7.07, 0, { type: "private", term: 240 }),
      ],
    },
  ];

  // Each demo's best plan, run-length encoded as [months, payment per loan...],
  // so the page replays it instead of re-solving.
  // BEGIN GENERATED PLANS
  const PLANS = {"surgeon":[[86,87800,80962,77397,73040,640801],[1,87800,80962,77397,485833,228008],[7,87800,80962,77397,713841,0],[3,87800,80962,718198,73040,0],[1,87800,80962,722578,68660,0],[3,87800,80962,791238,0,0],[3,801641,80962,77397,0,0],[1,809767,80962,69271,0,0],[2,879038,80962,0,0,0],[1,361871,598129,0,0,0],[4,0,960000,0,0,0],[1,0,610244,0,0,0]],"undergrad":[[69,10853,10636,11536,10221,104190,18564],[44,25462,10636,11536,10221,89581,18564],[1,15452,10636,11536,10221,99591,18564],[62,0,10636,11536,10221,115043,18564],[1,0,27968,11536,10221,97711,18564],[3,0,125679,11536,10221,0,18564],[1,0,18186,119029,10221,0,18564],[2,0,0,137215,10221,0,18564],[1,0,0,106765,10221,0,49014],[5,0,0,0,10221,0,155779],[1,0,0,0,75364,0,90636],[2,0,0,0,166000,0,0],[1,0,0,0,27889,0,0]]};
  // END GENERATED PLANS
  for (const x of examples) x.bestPlan = PLANS[x.id];

  if (typeof module !== "undefined" && module.exports) module.exports = examples;
  else root.LoanExamples = examples;
})(typeof globalThis !== "undefined" ? globalThis : this);
