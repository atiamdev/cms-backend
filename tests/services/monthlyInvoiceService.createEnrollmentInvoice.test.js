jest.mock('../../models/Fee');

const Fee = require('../../models/Fee');
const { createInvoiceForEnrollment } = require('../../services/monthlyInvoiceService');
const mongoose = require('mongoose');

describe('createInvoiceForEnrollment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates invoice when none exists', async () => {
    const course = {
      _id: new mongoose.Types.ObjectId(),
      branchId: new mongoose.Types.ObjectId(),
      feeStructure: {
        billingFrequency: 'monthly',
        createInvoiceOnEnrollment: true,
        components: [{ name: 'Tuition', amount: 2000 }],
      },
    };

    // Mock Fee.findOne to return null (no existing invoice)
    Fee.findOne = jest.fn().mockResolvedValue(null);

    // Mock save on Fee prototype
    Fee.prototype.save = jest.fn().mockResolvedValue(true);

    const res = await createInvoiceForEnrollment({ studentId: new mongoose.Types.ObjectId(), course, date: new Date('2025-03-15'), initiatedBy: 'admin' });

    expect(res.created).toBe(1);
    expect(Fee.prototype.save).toHaveBeenCalled();
  });
});