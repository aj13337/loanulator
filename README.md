# Loanulator

**Paying off the highest-interest loan isn't necessarily optimal.**

The usual advice for student loans is the "avalanche": put every extra dollar
on the loan with the highest interest rate. Loanulator compares that with the
cheapest plan it can find for your loans.

---

## The idea: the wall

Federal student loans charge interest on principal only. Interest you haven't
paid yet sits in a separate **interest balance**, which charges no interest
itself, and every payment clears it before any money reaches principal. It's a
wall in front of the principal.

So an extra dollar only starts saving you interest once you're through a
loan's wall. Avalanche ranks loans by rate alone, so it can pour money into a
wall while a slightly cheaper loan with no wall keeps charging interest.

The calculator searches month by month for the plan that pays the least in
total. Avalanche is one of the plans it compares, so the result is never worse
than avalanche.

---

## The scenarios

### Scenario A – Surgeon (avalanche costs $44,507.09 more)

Budget: $9,600 a month.

| Loan | Rate | Principal balance | Interest balance |
|---|---|---|---|
| Year 1 Unsubsidized Loan | 9.50% | $50,000 | $50,492 |
| Year 2 Unsubsidized Loan | 9.25% | $50,000 | $44,539 |
| Year 3 Unsubsidized Loan | 9.29% | $50,000 | $40,086 |
| Year 4 Unsubsidized Loan | 9.25% | $50,000 | $35,289 |
| Private loans | 9.00% | $406,239 | — |

- **Avalanche** puts the extra on the 9.50% loan. $349,164.53 of interest,
  debt-free in 9 years 10 months.
- **Best plan** pays the private loan first. $304,657.44 of interest,
  debt-free in 9 years 5 months.

### Scenario B – Independent undergrad (avalanche costs $1,565.02 more)

Budget: $1,660 a month.

| Loan | Rate | Principal balance | Interest balance |
|---|---|---|---|
| Year 1 Unsubsidized Loan | 8.25% | $9,500 | $3,237 |
| Year 2 Unsubsidized Loan | 7.68% | $10,500 | $2,524 |
| Year 3 Unsubsidized Loan | 7.37% | $12,500 | $1,962 |
| Year 4 Unsubsidized Loan | 6.74% | $12,500 | $952 |
| Year 1 Private Loan | 8.00% | $107,097 | — |
| Year 2 Private Loan | 7.07% | $23,815 | — |

- **Avalanche** puts the extra on the 8.25% loan first. $135,976.91 of
  interest, debt-free in 16 years 2 months.
- **Best plan** pays the 8.00% private loan, switches to the 8.25% loan once
  its own minimum has worn its wall down, then goes back to the private loan.
  $134,411.89 of interest, debt-free in 16 years 1 month.

Each scenario's month-by-month numbers are in its CSV download ("Check the
math").

---

## Loan rules the calculator uses

- **Federal:** payments go to interest first, then principal (34 CFR 685.211).
  Unpaid interest stays as an interest balance in repayment rather than being
  added to principal (87 FR 65904). Some events still add it to principal
  (34 CFR 685.202); enter your balances as they are after any such event.
- **Private:** the lender adds unpaid interest to principal, so the calculator
  adds a private loan's interest balance to its principal from the start.
- **Federal · RAP:** interest an on-time payment doesn't cover is waived; if a
  month's payments cut principal by less than $50, the Department makes up the
  cut to $50 (or to the payment, if that's less); whatever is left after 360
  payments is forgiven (34 CFR 685.209). Enter your RAP payment as the minimum.
  With RAP loans, plans are compared by total paid.

---

## How the calculator works

All money is in whole cents. Each month:

1. Each loan's interest (principal × rate ÷ 12) is added to its interest
   balance.
2. Each loan gets its minimum payment, applied to interest first.
3. The rest of the budget goes to loans in the plan's order; anything left
   after a loan is paid off rolls to the next.
4. Private loans add any unpaid interest to principal; RAP loans get their
   waiver, match and forgiveness.

To find the best plan it compares avalanche with a month-by-month search that
tries each loan as the target for that month's extra money, plus plans that
switch target loans partway through, and keeps whichever pays the least.

---

## Not modeled

- Interest is computed monthly, not daily.
- Payments stay the same every month.
- Interest being added to principal partway through a plan.
- Forgiveness other than RAP's.
- Variable rates and taxes.

A blank minimum uses the 10-year standard payment; enter the real minimum from
your servicer instead.

This is an educational tool, not financial advice.

---

## Files

| File | What it is |
|---|---|
| [index.html](index.html) | The page: charts, loan editor, CSV export |
| [engine.js](engine.js) | The loan model and the plan search |
| [examples.js](examples.js) | The two scenarios, with their best plans precomputed |
| [worker.js](worker.js) | Runs the search in the background so the page stays responsive |

---

## Sources

- 34 CFR part 685 (Direct Loans): https://www.law.cornell.edu/cfr/text/34/part-685
- 87 FR 65904, final rule of Nov 1, 2022:
  https://www.govinfo.gov/content/pkg/FR-2022-11-01/pdf/2022-23447.pdf
- Sallie Mae, interest and capitalization:
  https://www.salliemae.com/student-loans/manage-your-private-student-loan/understand-student-loan-payments/learn-about-interest-and-capitalization/
