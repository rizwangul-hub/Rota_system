const Employee = require('../models/Employee');
const { sendServerError } = require('../utils/httpErrors');
const SequenceCounter = require('../models/SequenceCounter');
const Attendance = require('../models/Attendance');
const WeeklySalary = require('../models/WeeklySalary');
const Bonus = require('../models/Bonus');
const LedgerTransaction = require('../models/LedgerTransaction');
const WeeklyRota = require('../models/WeeklyRota');
const SalaryAdjustment = require('../models/SalaryAdjustment');
const SalaryPayment = require('../models/SalaryPayment');
const RotaAssignmentClaim = require('../models/RotaAssignmentClaim');
const RotaAvailability = require('../models/RotaAvailability');
const { logAction } = require('../utils/audit');
const { employeeAttendanceRosterEntry } = require('../utils/attendanceViews');

async function findHighestEmployeeSequence() {
  const employees = await Employee.find({ employeeId: /^PIXX\d+$/i }).select('employeeId').lean();
  return employees.reduce((highest, employee) => {
    const sequence = Number(employee.employeeId.match(/^PIXX(\d+)$/i)?.[1] || 0);
    return Math.max(highest, sequence);
  }, 0);
}

async function previewEmployeeId() {
  const [counter, highestExisting] = await Promise.all([
    SequenceCounter.findById('employee'),
    findHighestEmployeeSequence()
  ]);
  const nextSequence = Math.max(counter?.sequence || 0, highestExisting) + 1;
  return `PIXX${String(nextSequence).padStart(3, '0')}`;
}

async function allocateEmployeeId() {
  let counter = await SequenceCounter.findById('employee');
  const highestExisting = await findHighestEmployeeSequence();
  if (!counter) {
    try {
      counter = await SequenceCounter.create({ _id: 'employee', sequence: highestExisting });
    } catch (error) {
      if (error.code !== 11000) throw error;
      counter = await SequenceCounter.findById('employee');
    }
  }

  if (!counter) {
    throw new Error('Unable to initialize employee ID sequence.');
  }

  if (counter.sequence < highestExisting) {
    await SequenceCounter.updateOne(
      { _id: 'employee' },
      { $max: { sequence: highestExisting } }
    );
  }
  let employeeId;
  do {
    const updatedCounter = await SequenceCounter.findByIdAndUpdate(
      'employee',
      { $inc: { sequence: 1 } },
      { new: true }
    );
    if (!updatedCounter) throw new Error('Unable to allocate employee ID.');
    employeeId = `PIXX${String(updatedCounter.sequence).padStart(3, '0')}`;
  } while (await Employee.exists({ employeeId }));

  return employeeId;
}

exports.getNextEmployeeId = async (req, res) => {
  try {
    res.json({ success: true, employeeId: await previewEmployeeId() });
  } catch (error) {
    return sendServerError(res, error, 'Failed to generate the next employee ID.');
  }
};

exports.getAllEmployees = async (req, res) => {
  try {
    const { shop, status, search, sortBy = 'name', sortOrder = 'asc' } = req.query;
    const query = {};
    const isAttendanceStaff = ['ATTENDANCE_OPERATOR', 'ATTENDANCE_CHECKER'].includes(req.user.role);

    if (shop && !isAttendanceStaff) query.assignedShop = shop;
    if (status) query.employmentStatus = status;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions = {};
    const order = sortOrder === 'desc' ? -1 : 1;
    if (isAttendanceStaff) {
      sortOptions.name = 1;
    } else if (sortBy === 'wage' || sortBy === 'dailyWage') {
      sortOptions.dailyWage = order;
    } else if (sortBy === 'startDate') {
      sortOptions.startDate = order;
    } else if (sortBy === 'employeeId') {
      sortOptions.employeeId = order;
    } else {
      sortOptions.name = order;
    }

    const employees = await Employee.find(query).populate('assignedShop').sort(sortOptions);
    const responseEmployees = isAttendanceStaff
      ? employees.map(employeeAttendanceRosterEntry)
      : employees;
    res.json({ success: true, count: responseEmployees.length, employees: responseEmployees });
  } catch (error) {
    return sendServerError(res, error, 'Failed to fetch employees.');
  }
};

exports.getEmployeeById = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id).populate('assignedShop');
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });
    res.json({
      success: true,
      employee: ['ATTENDANCE_OPERATOR', 'ATTENDANCE_CHECKER'].includes(req.user.role)
        ? employeeAttendanceRosterEntry(employee)
        : employee
    });
  } catch (error) {
    return sendServerError(res, error, 'Error retrieving employee.');
  }
};

exports.createEmployee = async (req, res) => {
  try {
    const { name, employeeId: requestedEmployeeId, phone, email, dailyWage, startDate, notes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Employee full name is required.' });
    }
    const wage = Number(dailyWage);
    if (dailyWage === undefined || dailyWage === '' || !Number.isFinite(wage) || wage < 0) {
      return res.status(400).json({ success: false, message: 'Daily wage must be a valid non-negative number.' });
    }

    const cleanEmpId = requestedEmployeeId?.trim()
      ? requestedEmployeeId.trim().toUpperCase()
      : await allocateEmployeeId();
    const existing = await Employee.findOne({ employeeId: cleanEmpId });
    if (existing) {
      return res.status(400).json({ success: false, message: `Employee ID '${cleanEmpId}' is already assigned to ${existing.name}.` });
    }

    const hireDate = startDate ? new Date(startDate) : new Date();

    const employee = await Employee.create({
      name: name.trim(),
      employeeId: cleanEmpId,
      phone: phone ? phone.trim() : '',
      email: email ? email.trim().toLowerCase() : '',
      dailyWage: wage,
      employmentStatus: 'Active',
      startDate: hireDate,
      notes: notes || '',
      wageHistory: [
        {
          wage,
          effectiveDate: hireDate,
          changedBy: req.user._id,
          reason: 'Initial hiring rate'
        }
      ],
    });

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: 'EMPLOYEE_CREATED',
      recordType: 'Employee',
      recordId: employee._id,
      details: `Created employee ${name} (${employee.employeeId}) with daily wage £${wage}`,
      req
    });

    res.status(201).json({ success: true, message: 'Employee created successfully.', employee });
  } catch (error) {
    return sendServerError(res, error, 'Error creating employee.');
  }
};

exports.updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const oldEmp = await Employee.findById(id);
    if (!oldEmp) return res.status(404).json({ success: false, message: 'Employee not found.' });

    const updates = req.body;
    let auditDetails = [];

    // Check Employee ID uniqueness if changed
    if (updates.employeeId && updates.employeeId.trim().toUpperCase() !== oldEmp.employeeId) {
      const cleanNewId = updates.employeeId.trim().toUpperCase();
      const duplicate = await Employee.findOne({ employeeId: cleanNewId, _id: { $ne: id } });
      if (duplicate) {
        return res.status(400).json({ success: false, message: `Employee ID '${cleanNewId}' already in use by ${duplicate.name}.` });
      }
      oldEmp.employeeId = cleanNewId;
      auditDetails.push(`Changed ID to ${cleanNewId}`);
    }

    if (updates.name && updates.name.trim()) oldEmp.name = updates.name.trim();
    if (updates.phone !== undefined) oldEmp.phone = updates.phone;
    if (updates.email !== undefined) oldEmp.email = updates.email;
    if (updates.notes !== undefined) oldEmp.notes = updates.notes;
    if (updates.startDate) oldEmp.startDate = new Date(updates.startDate);

    // Wage update with history tracking
    if (updates.dailyWage !== undefined && Number(updates.dailyWage) !== oldEmp.dailyWage) {
      const newWage = Number(updates.dailyWage);
      if (updates.dailyWage === '' || !Number.isFinite(newWage) || newWage < 0) {
        return res.status(400).json({ success: false, message: 'Daily wage must be a non-negative number.' });
      }
      auditDetails.push(`Changed daily wage from £${oldEmp.dailyWage} to £${newWage}`);
      oldEmp.dailyWage = newWage;
      oldEmp.wageHistory.push({
        wage: newWage,
        effectiveDate: new Date(),
        changedBy: req.user._id,
        reason: updates.wageChangeReason || 'Administrative adjustment'
      });
    }

    // Status update
    if (updates.employmentStatus && updates.employmentStatus !== oldEmp.employmentStatus) {
      auditDetails.push(`Changed employment status from ${oldEmp.employmentStatus} to ${updates.employmentStatus}`);
      oldEmp.employmentStatus = updates.employmentStatus;
    }

    await oldEmp.save();
    const updated = await Employee.findById(id);

    if (auditDetails.length > 0) {
      await logAction({
        user: req.user._id,
        username: req.user.name,
        role: req.user.role,
        action: 'EMPLOYEE_UPDATED',
        recordType: 'Employee',
        recordId: updated._id,
        details: `Updated ${updated.name}: ${auditDetails.join('; ')}`,
        req
      });
    }

    res.json({ success: true, message: 'Employee updated successfully.', employee: updated });
  } catch (error) {
    return sendServerError(res, error, 'Error updating employee.');
  }
};

exports.toggleEmployeeStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const employee = await Employee.findById(id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

    const newStatus = employee.employmentStatus === 'Active' ? 'Inactive' : 'Active';
    employee.employmentStatus = newStatus;
    await employee.save();

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: newStatus === 'Active' ? 'EMPLOYEE_ACTIVATED' : 'EMPLOYEE_DEACTIVATED',
      recordType: 'Employee',
      recordId: employee._id,
      details: `Toggled employee ${employee.name} (${employee.employeeId}) to ${newStatus}`,
      req
    });

    res.json({ success: true, message: `Employee ${employee.name} is now ${newStatus}.`, employee });
  } catch (error) {
    return sendServerError(res, error, 'Error toggling employee status.');
  }
};

exports.getEmployeeProfile = async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Employee payroll profiles are available to administrators only.' });
    }
    const { id } = req.params;
    const employee = await Employee.findById(id).populate('assignedShop');
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

    // Recent attendances (last 30)
    const attendances = await Attendance.find({ employee: id }).sort({ date: -1 }).limit(30);

    // Weekly salaries
    const salaries = await WeeklySalary.find({ employee: id }).sort({ weekStartDate: -1 });

    // Bonuses
    const bonuses = await Bonus.find({ employee: id }).sort({ year: -1, createdAt: -1 });

    // Ledger transactions
    const ledger = await LedgerTransaction.find({ employee: id }).sort({ date: -1 });

    // Summary calculations (This Week, This Month, This Year)
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() + diffToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    const aggregateRange = (salariesList, startDate) => {
      const filtered = salariesList.filter(s => new Date(s.weekStartDate) >= startDate);
      return filtered.reduce((acc, curr) => {
        acc.workingDays += curr.workingDays || 0;
        acc.hours += curr.actualHours || 0;
        acc.gross += curr.grossDailyWages || 0;
        acc.deductions += (curr.lateDeductions || 0) + (curr.manualDeductions || 0);
        acc.allowances += (curr.travelAllowance || 0) + (curr.otherAllowances || 0);
        acc.bonus += curr.bonus || 0;
        acc.total += curr.finalSalary || 0;
        acc.paid += curr.totalPaid || 0;
        acc.outstanding += curr.balanceRemaining || 0;
        return acc;
      }, {
        workingDays: 0,
        hours: 0,
        gross: 0,
        deductions: 0,
        allowances: 0,
        bonus: 0,
        total: 0,
        paid: 0,
        outstanding: 0
      });
    };

    const thisWeek = aggregateRange(salaries, startOfWeek);
    const thisMonth = aggregateRange(salaries, startOfMonth);
    const thisYear = aggregateRange(salaries, startOfYear);

    res.json({
      success: true,
      employee,
      summary: { thisWeek, thisMonth, thisYear },
      attendances,
      salaries,
      bonuses,
      ledger
    });
  } catch (error) {
    return sendServerError(res, error, 'Error retrieving employee profile.');
  }
};

exports.deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const employee = await Employee.findById(id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    const empName = employee.name;
    const empIdStr = employee.employeeId;

    await Promise.all([
      Employee.findByIdAndDelete(id),
      Attendance.deleteMany({ employee: id }),
      WeeklySalary.deleteMany({ employee: id }),
      Bonus.deleteMany({ employee: id }),
      LedgerTransaction.deleteMany({ employee: id }),
      SalaryAdjustment.deleteMany({ employee: id }),
      SalaryPayment.deleteMany({ employee: id }),
      RotaAssignmentClaim.deleteMany({ employeeId: id }),
      RotaAvailability.deleteMany({ employeeId: id }),
      WeeklyRota.updateMany(
        {},
        {
          $pull: {
            'shopRoster.$[].employeeIds': id,
            assignments: { employeeId: id }
          }
        }
      )
    ]);

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: 'EMPLOYEE_DELETED',
      recordType: 'Employee',
      recordId: id,
      details: `Deleted worker ${empName} (${empIdStr}) and removed all associated records`,
      req
    });

    res.json({ success: true, message: `Worker ${empName} (${empIdStr}) deleted successfully.` });
  } catch (error) {
    return sendServerError(res, error, 'Error deleting worker.');
  }
};
