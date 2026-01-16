const mongoose = require('mongoose');

jest.mock('../../models/FeeStructure');
jest.mock('../../models/Student');
jest.mock('../../models/Fee');

const FeeStructure = require('../../models/FeeStructure');
const Student = require('../../models/Student');
const Fee = require('../../models/Fee');
const { generateMonthlyInvoices } = require('../../services/monthlyInvoiceService');

beforeEach(() => {
  jest.clearAllMocks();
});

test('creates invoices when none exist', async () => {
  const fs = {
    _id: new mongoose.Types.ObjectId(),
    branchId: new mongoose.Types.ObjectId(),
    classId: new mongoose.Types.ObjectId(),
    academicYear: '2025-2026',
    feeComponents: [{ name: 'Tuition', amount: 1000 }],
    totalAmount: 1000,
    dueDate: new Date(2025, 0, 10),
    perPeriodAmount: null,
    isActive: true,
  };

  FeeStructure.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([fs]) });
  Student.find.mockReturnValue({ select: jest.fn().mockResolvedValue([
    { _id: new mongoose.Types.ObjectId(), branchId: fs.branchId },
    { _id: new mongoose.Types.ObjectId(), branchId: fs.branchId },
  ]) });
  Fee.find.mockReturnValue({ select: jest.fn().mockResolvedValue([]) });
  const inserted = [{ _id: 1 }, { _id: 2 }];
  Fee.insertMany.mockResolvedValue(inserted);

  const res = await generateMonthlyInvoices({ periodYear: 2025, periodMonth: 3 });

  expect(res.created).toBe(2);
  expect(Fee.insertMany).toHaveBeenCalled();
});

test('skips existing invoices', async () => {
  const fs = { _id: new mongoose.Types.ObjectId(), branchId: new mongoose.Types.ObjectId(), classId: new mongoose.Types.ObjectId(), academicYear: '2025-2026', feeComponents: [], totalAmount: 1000, dueDate: new Date(), isActive: true };
  FeeStructure.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([fs]) });

  const s1 = { _id: new mongoose.Types.ObjectId(), branchId: fs.branchId };
  const s2 = { _id: new mongoose.Types.ObjectId(), branchId: fs.branchId };

  Student.find.mockReturnValue({ select: jest.fn().mockResolvedValue([s1, s2]) });
  Fee.find.mockReturnValue({ select: jest.fn().mockResolvedValue([{ studentId: s1._id }]) });

  Fee.insertMany.mockResolvedValue([{ _id: 1 }]);

  const res = await generateMonthlyInvoices({ periodYear: 2025, periodMonth: 4 });

  expect(res.created).toBe(1);
  expect(res.skipped).toBe(1);
});