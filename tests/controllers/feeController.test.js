jest.mock('../../services/monthlyInvoiceService');

const { generateMonthlyInvoices } = require('../../services/monthlyInvoiceService');
const { generateMonthlyInvoicesRoute } = require('../../controllers/feeController');

beforeEach(() => {
  jest.clearAllMocks();
});

test('generateMonthlyInvoicesRoute calls service and returns success', async () => {
  generateMonthlyInvoices.mockResolvedValue({ created: 2, skipped: 0 });

  const req = {
    body: { year: 2025, month: 3 },
    user: { _id: 'admin1' },
  };

  const res = {
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };

  await generateMonthlyInvoicesRoute(req, res);

  expect(generateMonthlyInvoices).toHaveBeenCalledWith({ periodYear: 2025, periodMonth: 3, branchId: undefined, initiatedBy: 'admin1' });
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
});