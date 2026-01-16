const mongoose = require('mongoose');
const { generateMonthlyInvoices } = require('../../services/monthlyInvoiceService');

// Use real models but connect to in-memory MongoDB for tests
const { MongoMemoryServer } = require('mongodb-memory-server');
const FeeStructure = require('../../models/FeeStructure');
const Student = require('../../models/Student');
const Fee = require('../../models/Fee');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri, {});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await FeeStructure.deleteMany({});
  await Student.deleteMany({});
  await Fee.deleteMany({});
});

test('generates monthly invoices and is idempotent', async () => {
  // Create fee structure
  const fs = await FeeStructure.create({
    branchId: new mongoose.Types.ObjectId(),
    classId: new mongoose.Types.ObjectId(),
    academicYear: '2025-2026',
    academicTermId: new mongoose.Types.ObjectId(),
    feeComponents: [{ name: 'Tuition', amount: 1000 }],
    totalAmount: 1000,
    dueDate: new Date(2025, 0, 10),
    billingFrequency: 'monthly',
    isActive: true,
    createdBy: new mongoose.Types.ObjectId(),
  });

  // Create two students in class
  const s1 = await Student.create({ userId: new mongoose.Types.ObjectId(), branchId: fs.branchId, studentId: 'S100', admissionNumber: 'A100', currentClassId: fs.classId, enrollmentDate: new Date(), academicStatus: 'active' });
  const s2 = await Student.create({ userId: new mongoose.Types.ObjectId(), branchId: fs.branchId, studentId: 'S101', admissionNumber: 'A101', currentClassId: fs.classId, enrollmentDate: new Date(), academicStatus: 'active' });

  const res1 = await generateMonthlyInvoices({ periodYear: 2025, periodMonth: 3 });
  expect(res1.created).toBe(2);

  // Re-run for same month - should be idempotent and create zero new
  const res2 = await generateMonthlyInvoices({ periodYear: 2025, periodMonth: 3 });
  expect(res2.created).toBe(0);
  expect(res2.skipped).toBe(2);

  // Run for next month - should create invoices
  const res3 = await generateMonthlyInvoices({ periodYear: 2025, periodMonth: 4 });
  expect(res3.created).toBe(2);
});