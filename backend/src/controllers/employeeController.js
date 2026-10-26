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
const { syncEmployeeOpeningBalance, syncWageHistoryToLedger, recalculateEmployeeLedger } = require('../utils/ledgerHelper');
const { uploadDocumentToCloudinary } = require('../utils/cloudinary');
const { buildJoiningFormPDF } = require('../utils/joiningFormPdf');

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
    const {
      name, employeeId: requestedEmployeeId, phone, email, dailyWage, startDate, notes,
      openingBalance, openingBalanceDate, openingBalanceNote,
      assignedShop, companyLegalName, tradingName, jobTitle, workLocation,
      employmentType, normalHoursPerWeek, hourlyRate, lineManager,
      preferredName, dateOfBirth, homeAddress, postcode, nationalInsuranceNumber,
      emergencyContactName, emergencyContactRelationship, emergencyContactPhone,
      bankAccountName, bankSortCode, bankAccountNumber, p45Status,
      rightToWorkCheckMethod, nationalityType, rightToWorkReference, rightToWorkCheckDate,
      rightToWorkStatus, checkerName, visaExpiryDate, passportExpiryDate, visaConditions,
      cosReference, healthSafetyInductionCompleted, healthSafetyInductionDate,
      documents
    } = req.body;

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
    const initialOpeningBalance = Number(openingBalance) || 0;
    const initialOpeningDate = openingBalanceDate ? new Date(openingBalanceDate) : hireDate;

    const employee = await Employee.create({
      name: name.trim(),
      employeeId: cleanEmpId,
      phone: phone ? phone.trim() : '',
      email: email ? email.trim().toLowerCase() : '',
      dailyWage: wage,
      employmentStatus: 'Active',
      startDate: hireDate,
      notes: notes || '',
      openingBalance: initialOpeningBalance,
      openingBalanceDate: initialOpeningDate,
      openingBalanceNote: openingBalanceNote ? openingBalanceNote.trim() : '',
      assignedShop: assignedShop || null,
      companyLegalName: companyLegalName || 'Pixx Technologies Ltd',
      tradingName: tradingName || 'Pixx Retail London',
      jobTitle: jobTitle || 'Retail Assistant / Sales',
      workLocation: workLocation || '',
      employmentType: employmentType || 'Casual / Zero-Hours',
      normalHoursPerWeek: Number(normalHoursPerWeek) || 0,
      hourlyRate: Number(hourlyRate) || 0,
      lineManager: lineManager || 'Fahad Rasheed',
      preferredName: preferredName ? preferredName.trim() : '',
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      homeAddress: homeAddress || '',
      postcode: postcode ? postcode.trim().toUpperCase() : '',
      nationalInsuranceNumber: nationalInsuranceNumber ? nationalInsuranceNumber.trim().toUpperCase() : '',
      emergencyContactName: emergencyContactName || '',
      emergencyContactRelationship: emergencyContactRelationship || '',
      emergencyContactPhone: emergencyContactPhone || '',
      bankAccountName: bankAccountName || '',
      bankSortCode: bankSortCode || '',
      bankAccountNumber: bankAccountNumber || '',
      p45Status: p45Status || 'Pending',
      rightToWorkCheckMethod: rightToWorkCheckMethod || 'Manual eligible documents',
      nationalityType: nationalityType || 'British / Irish Citizen',
      rightToWorkReference: rightToWorkReference || '',
      rightToWorkCheckDate: rightToWorkCheckDate ? new Date(rightToWorkCheckDate) : null,
      rightToWorkStatus: rightToWorkStatus || 'Passed',
      checkerName: checkerName || 'Fahad Rasheed',
      visaExpiryDate: visaExpiryDate ? new Date(visaExpiryDate) : null,
      passportExpiryDate: passportExpiryDate ? new Date(passportExpiryDate) : null,
      visaConditions: visaConditions || '',
      cosReference: cosReference || '',
      healthSafetyInductionCompleted: healthSafetyInductionCompleted !== undefined ? Boolean(healthSafetyInductionCompleted) : true,
      healthSafetyInductionDate: healthSafetyInductionDate ? new Date(healthSafetyInductionDate) : hireDate,
      documents: Array.isArray(documents) ? documents : [],
      wageHistory: [
        {
          wage,
          effectiveDate: hireDate,
          changedBy: req.user._id,
          reason: 'Initial hiring rate'
        }
      ],
    });

    if (initialOpeningBalance !== 0) {
      await syncEmployeeOpeningBalance(employee, initialOpeningBalance, initialOpeningDate, openingBalanceNote, req.user._id);
    }

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: 'EMPLOYEE_CREATED',
      recordType: 'Employee',
      recordId: employee._id,
      details: `Created employee ${name} (${employee.employeeId}) with daily wage £${wage}${initialOpeningBalance !== 0 ? ` and opening balance £${initialOpeningBalance}` : ''}`,
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

    // Onboarding text / simple fields
    const onboardingKeys = [
      'companyLegalName', 'tradingName', 'jobTitle', 'workLocation',
      'employmentType', 'normalHoursPerWeek', 'hourlyRate', 'lineManager',
      'preferredName', 'homeAddress', 'postcode', 'nationalInsuranceNumber',
      'emergencyContactName', 'emergencyContactRelationship', 'emergencyContactPhone',
      'bankAccountName', 'bankSortCode', 'bankAccountNumber', 'p45Status',
      'rightToWorkCheckMethod', 'nationalityType', 'rightToWorkReference',
      'rightToWorkStatus', 'checkerName', 'visaConditions', 'cosReference'
    ];
    onboardingKeys.forEach(key => {
      if (updates[key] !== undefined) oldEmp[key] = updates[key];
    });

    if (updates.dateOfBirth !== undefined) {
      oldEmp.dateOfBirth = updates.dateOfBirth ? new Date(updates.dateOfBirth) : null;
    }
    if (updates.rightToWorkCheckDate !== undefined) {
      oldEmp.rightToWorkCheckDate = updates.rightToWorkCheckDate ? new Date(updates.rightToWorkCheckDate) : null;
    }
    if (updates.visaExpiryDate !== undefined) {
      oldEmp.visaExpiryDate = updates.visaExpiryDate ? new Date(updates.visaExpiryDate) : null;
    }
    if (updates.passportExpiryDate !== undefined) {
      oldEmp.passportExpiryDate = updates.passportExpiryDate ? new Date(updates.passportExpiryDate) : null;
    }
    if (updates.healthSafetyInductionCompleted !== undefined) {
      oldEmp.healthSafetyInductionCompleted = Boolean(updates.healthSafetyInductionCompleted);
    }
    if (updates.healthSafetyInductionDate !== undefined) {
      oldEmp.healthSafetyInductionDate = updates.healthSafetyInductionDate ? new Date(updates.healthSafetyInductionDate) : null;
    }
    if (updates.assignedShop !== undefined) {
      oldEmp.assignedShop = updates.assignedShop || null;
    }
    if (Array.isArray(updates.documents)) {
      oldEmp.documents = updates.documents;
    }

    let wageChanged = false;
    // Wage update with history tracking
    if (updates.dailyWage !== undefined && Number(updates.dailyWage) !== oldEmp.dailyWage) {
      const newWage = Number(updates.dailyWage);
      if (updates.dailyWage === '' || !Number.isFinite(newWage) || newWage < 0) {
        return res.status(400).json({ success: false, message: 'Daily wage must be a non-negative number.' });
      }
      auditDetails.push(`Changed daily wage from £${oldEmp.dailyWage} to £${newWage}`);
      // Parse effectiveDate cleanly
      let effectiveDate = new Date('2026-10-11T00:00:00.000Z');
      if (updates.wageEffectiveDate) {
        const rawDate = String(updates.wageEffectiveDate).trim();
        if (rawDate.includes('/')) {
          const parts = rawDate.split('/');
          if (parts.length === 3) {
            // DD/MM/YYYY -> YYYY-MM-DD
            effectiveDate = new Date(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}T00:00:00.000Z`);
          } else if (parts.length === 2) {
            // DD/MM -> 2026-MM-DD
            effectiveDate = new Date(`2026-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}T00:00:00.000Z`);
          }
        } else if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
          effectiveDate = new Date(`${rawDate.slice(0, 10)}T00:00:00.000Z`);
        } else {
          const d = new Date(rawDate);
          if (!isNaN(d.getTime())) effectiveDate = d;
        }
      }
      if (isNaN(effectiveDate.getTime())) {
        effectiveDate = new Date('2026-10-11T00:00:00.000Z');
      }

      const effectiveDateStr = effectiveDate.toISOString().slice(0, 10);
      const isBaseRate = effectiveDateStr <= '2026-10-11';
      if (isBaseRate) {
        effectiveDate = new Date('2026-10-11T00:00:00.000Z');
      }

      oldEmp.wageHistory.push({
        wage: newWage,
        effectiveDate,
        changedBy: req.user._id,
        reason: updates.wageChangeReason || (isBaseRate ? 'Base starting daily wage' : 'Administrative adjustment')
      });
      wageChanged = true;

      // Update attendance records for this employee from effectiveDate onwards (and any with 0 wage)
      const mongoose = require('mongoose');
      if (mongoose.isValidObjectId(id)) {
        const Attendance = require('../models/Attendance');
        const { calculateAttendanceRecord, getUKDateString } = require('../utils/calc');

        const attendancesToUpdate = await Attendance.find({
          employee: id,
          $or: [
            { dateString: { $gte: effectiveDateStr } },
            { date: { $gte: new Date(effectiveDateStr + 'T00:00:00.000Z') } },
            { dailyWage: { $exists: false } },
            { dailyWage: 0 },
            { dailyWage: null }
          ]
        });

        for (const attRec of attendancesToUpdate) {
          attRec.dailyWage = newWage;
          if (attRec.status !== 'Absent') {
            const calc = calculateAttendanceRecord({
              dailyWage: newWage,
              shiftStart: attRec.shiftStart || '09:00',
              shiftEnd: attRec.shiftEnd || '19:00',
              timeReached: attRec.timeReached || '09:00',
              workerEndTime: attRec.workerEndTime || '19:00',
              status: attRec.status,
              gracePeriodMinutes: 15
            });
            attRec.hourlyWage = calc.hourlyWage;
            attRec.lateDeduction = calc.lateDeduction;
            attRec.attendancePay = calc.attendancePay;
          } else {
            attRec.attendancePay = 0;
          }
          await attRec.save();
        }
      }
    }

    // Status update
    if (updates.employmentStatus && updates.employmentStatus !== oldEmp.employmentStatus) {
      auditDetails.push(`Changed employment status from ${oldEmp.employmentStatus} to ${updates.employmentStatus}`);
      oldEmp.employmentStatus = updates.employmentStatus;
    }

    // Opening balance update
    let openingBalanceChanged = false;
    if (updates.openingBalance !== undefined) {
      const newOpeningBal = Number(updates.openingBalance) || 0;
      if (newOpeningBal !== (oldEmp.openingBalance || 0)) {
        auditDetails.push(`Changed opening balance from £${oldEmp.openingBalance || 0} to £${newOpeningBal}`);
        oldEmp.openingBalance = newOpeningBal;
        openingBalanceChanged = true;
      }
    }
    if (updates.openingBalanceDate) {
      oldEmp.openingBalanceDate = new Date(updates.openingBalanceDate);
      openingBalanceChanged = true;
    }
    if (updates.openingBalanceNote !== undefined) {
      oldEmp.openingBalanceNote = updates.openingBalanceNote ? updates.openingBalanceNote.trim() : '';
      openingBalanceChanged = true;
    }

    await oldEmp.save();

    if (openingBalanceChanged) {
      await syncEmployeeOpeningBalance(oldEmp, oldEmp.openingBalance, oldEmp.openingBalanceDate, oldEmp.openingBalanceNote, req.user._id);
    }
    if (wageChanged) {
      await syncWageHistoryToLedger(oldEmp, req.user._id);
    }
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

    // Ledger transactions (recalculated to ensure 100% running balance accuracy)
    const { transactions: ledger } = await recalculateEmployeeLedger(id);

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

/**
 * Returns compliance alerts for documents & visas expiring within 30 days, within 7 days, or expired.
 */
exports.getExpiringDocuments = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const employees = await Employee.find({ employmentStatus: 'Active' })
      .select('name employeeId phone email visaExpiryDate passportExpiryDate nationalityType documents assignedShop')
      .populate('assignedShop', 'name')
      .lean();

    const alerts = [];

    const checkExpiry = (emp, docTitle, expiryDateVal, category, docId = null) => {
      if (!expiryDateVal) return;
      const expDate = new Date(expiryDateVal);
      if (isNaN(expDate.getTime())) return;
      expDate.setHours(0, 0, 0, 0);

      const diffMs = expDate.getTime() - today.getTime();
      const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      // Alert if expiring within 30 days (1 month before) or already expired (<= 0)
      if (daysRemaining <= 30) {
        let urgency = 'WARNING'; // 8 to 30 days
        let statusText = `Expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`;

        if (daysRemaining <= 0) {
          urgency = 'EXPIRED';
          statusText = daysRemaining === 0 ? 'Expires today!' : `Expired ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? '' : 's'} ago`;
        } else if (daysRemaining <= 7) {
          urgency = 'URGENT'; // <= 1 week before
          statusText = `Expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} (Urgent)`;
        }

        alerts.push({
          employeeId: emp.employeeId,
          employeeMongoId: emp._id,
          employeeName: emp.name,
          shopName: emp.assignedShop?.name || '',
          documentName: docTitle,
          category,
          documentId: docId,
          expiryDate: expDate.toISOString().slice(0, 10),
          daysRemaining,
          urgency,
          statusText
        });
      }
    };

    employees.forEach(emp => {
      // 1. Right to work / Visa expiry
      if (emp.visaExpiryDate) {
        checkExpiry(emp, `Right to Work / Visa (${emp.nationalityType || 'Migrant Worker'})`, emp.visaExpiryDate, 'Visa / Right to Work');
      }
      // 2. Passport expiry
      if (emp.passportExpiryDate) {
        checkExpiry(emp, 'Passport', emp.passportExpiryDate, 'Passport');
      }
      // 3. Document attachments expiry
      if (Array.isArray(emp.documents)) {
        emp.documents.forEach(doc => {
          if (doc.expiryDate) {
            checkExpiry(emp, doc.title || doc.category || 'Uploaded Document', doc.expiryDate, doc.category, doc._id);
          }
        });
      }
    });

    // Sort: most urgent / expired first
    alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);

    const counts = {
      total: alerts.length,
      expired: alerts.filter(a => a.urgency === 'EXPIRED').length,
      urgent: alerts.filter(a => a.urgency === 'URGENT').length,
      warning: alerts.filter(a => a.urgency === 'WARNING').length
    };

    res.json({
      success: true,
      counts,
      alerts
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to fetch expiring document alerts.');
  }
};

/**
 * Uploads a document to Cloudinary (or local fallback)
 */
exports.uploadDocument = async (req, res) => {
  try {
    let uploadResult;
    if (req.file) {
      uploadResult = await uploadDocumentToCloudinary({
        buffer: req.file.buffer,
        filename: req.file.originalname,
        folder: 'pixx_rota_documents'
      });
    } else if (req.body?.base64) {
      uploadResult = await uploadDocumentToCloudinary({
        base64: req.body.base64,
        filename: req.body.filename || 'document.pdf',
        folder: 'pixx_rota_documents'
      });
    } else {
      return res.status(400).json({ success: false, message: 'No file or document data received.' });
    }

    res.json({
      success: true,
      message: 'Document uploaded successfully.',
      ...uploadResult
    });
  } catch (error) {
    console.error('Document upload error:', error);
    return sendServerError(res, error, 'Failed to upload document.');
  }
};

/**
 * Adds an uploaded document to an existing employee
 */
exports.addEmployeeDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, category, fileUrl, publicId, format, bytes, expiryDate, notes } = req.body;
    if (!title || !fileUrl) {
      return res.status(400).json({ success: false, message: 'Document title and file URL are required.' });
    }
    const employee = await Employee.findById(id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

    employee.documents.push({
      title: title.trim(),
      category: category || 'Proof of Right to Work',
      fileUrl,
      publicId: publicId || '',
      format: format || '',
      bytes: Number(bytes) || 0,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      notes: notes || '',
      uploadedAt: new Date()
    });

    await employee.save();
    res.json({ success: true, message: 'Document attached successfully.', documents: employee.documents });
  } catch (error) {
    return sendServerError(res, error, 'Failed to add employee document.');
  }
};

/**
 * Removes an uploaded document from an employee
 */
exports.deleteEmployeeDocument = async (req, res) => {
  try {
    const { id, docId } = req.params;
    const employee = await Employee.findById(id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

    employee.documents = employee.documents.filter(d => String(d._id) !== String(docId));
    await employee.save();
    res.json({ success: true, message: 'Document removed successfully.', documents: employee.documents });
  } catch (error) {
    return sendServerError(res, error, 'Failed to delete employee document.');
  }
};

/**
 * Generates and downloads the Employee Joining Form PDF
 */
exports.downloadJoiningFormPDF = async (req, res) => {
  try {
    const { id } = req.params;
    const employee = await Employee.findById(id).populate('assignedShop');
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

    const cleanName = (employee.name || 'Worker').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Employee_Joining_Form_${employee.employeeId}_${cleanName}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    buildJoiningFormPDF(employee, res);
  } catch (error) {
    console.error('Error generating joining form PDF:', error);
    return sendServerError(res, error, 'Failed to generate Employee Joining Form PDF.');
  }
};
