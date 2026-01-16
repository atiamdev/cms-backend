const mongoose = require('mongoose');
jest.mock('../../services/monthlyInvoiceService');

const { createInvoiceForEnrollment } = require('../../services/monthlyInvoiceService');
const Student = require('../../models/Student');
const Course = require('../../models/Course');

describe('Student.assignCourses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('calls createInvoiceForEnrollment when course is configured', async () => {
    const student = new Student({
      userId: new mongoose.Types.ObjectId(),
      branchId: new mongoose.Types.ObjectId(),
      studentId: 'S1',
      admissionNumber: 'A1',
      courses: [],
      enrollmentDate: new Date(),
    });

    // Mock Course.find to return a course with feeStructure.createInvoiceOnEnrollment = true
    const courseId = new mongoose.Types.ObjectId();
    jest.spyOn(Course, 'find').mockResolvedValueOnce([
      {
        _id: courseId,
        branchId: student.branchId,
        feeStructure: { billingFrequency: 'monthly', createInvoiceOnEnrollment: true, components: [{name:'Tuition', amount: 1000}] }
      },
    ]);

    createInvoiceForEnrollment.mockResolvedValue({ created: 1 });

    // Mock calculateCourseFees and save to avoid DB calls
    jest.spyOn(Student.prototype, 'calculateCourseFees').mockResolvedValue();
    jest.spyOn(Student.prototype, 'save').mockResolvedValue(student);

    await student.assignCourses([courseId]);

    expect(createInvoiceForEnrollment).toHaveBeenCalled();
  });
});