jest.mock('../../services/monthlyInvoiceService');
const { runBackfill, monthsBetween } = require('../../scripts/backfill-monthly-invoices');
const { generateMonthlyInvoices } = require('../../services/monthlyInvoiceService');

beforeEach(() => {
  jest.clearAllMocks();
});

test('monthsBetween helper includes endpoints correctly', () => {
  const res = monthsBetween('2025-01', '2025-03');
  expect(res).toEqual([
    { periodYear: 2025, periodMonth: 1 },
    { periodYear: 2025, periodMonth: 2 },
    { periodYear: 2025, periodMonth: 3 },
  ]);
});

test('runBackfill calls service for each month and aggregates results', async () => {
  generateMonthlyInvoices.mockResolvedValueOnce({ created: 2, skipped: 0 }).mockResolvedValueOnce({ created: 3, skipped: 1 });

  const summary = await runBackfill({ from: '2025-01', to: '2025-02', branchId: 'B1', initiatedBy: 'admin1', dryRun: false });

  expect(generateMonthlyInvoices).toHaveBeenCalledTimes(2);
  expect(generateMonthlyInvoices).toHaveBeenCalledWith({ periodYear: 2025, periodMonth: 1, branchId: 'B1', initiatedBy: 'admin1' });
  expect(generateMonthlyInvoices).toHaveBeenCalledWith({ periodYear: 2025, periodMonth: 2, branchId: 'B1', initiatedBy: 'admin1' });

  expect(summary.length).toBe(2);
  expect(summary[0].created).toBe(2);
  expect(summary[1].created).toBe(3);
});

test('runBackfill respects dryRun', async () => {
  const summary = await runBackfill({ from: '2025-01', to: '2025-01', dryRun: true });
  expect(summary[0].dryRun).toBe(true);
});