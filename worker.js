// Solves a portfolio off the page's main thread, so a slow solve (many loans,
// long RAP timelines) never freezes the page.
importScripts("engine.js");
self.onmessage = (e) => {
  const { id, loans, budget } = e.data;
  try {
    self.postMessage({ id, result: self.LoanEngine.run(loans, budget) });
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
