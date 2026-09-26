const FINANCIAL_ATTENDANCE_FIELDS = [
  'dailyWage',
  'hourlyWage',
  'lateDeduction',
  'attendancePay',
  'lateMinutes',
  'actualHours',
  'dailySalary',
  'salary',
  'bonus',
  'allowance',
  'payment',
  'ledger'
];

function toObject(value) {
  if (!value) return value;
  return typeof value.toObject === 'function' ? value.toObject() : value;
}

function safeReference(value, fields) {
  if (!value) return value;
  const plain = toObject(value);
  if (typeof plain !== 'object') return plain;
  const safe = {};
  for (const field of fields) {
    if (plain[field] !== undefined) safe[field] = plain[field];
  }
  return safe;
}

function attendanceOperatorRecord(record) {
  const plain = toObject(record);
  if (!plain) return plain;

  const allowedFields = [
    '_id',
    'date',
    'dateString',
    'employeeName',
    'employeeId',
    'shopName',
    'shiftStart',
    'shiftEnd',
    'timeReached',
    'workerEndTime',
    'status',
    'remarks',
    'approvalStatus',
    'createdByName',
    'checkedByName',
    'checkedAt',
    'createdAt',
    'updatedAt'
  ];
  const safe = {};
  for (const field of allowedFields) {
    if (plain[field] !== undefined) safe[field] = plain[field];
  }
  safe.employee = safeReference(plain.employee, ['_id', 'name', 'employeeId']);
  safe.shop = safeReference(plain.shop, ['_id', 'name']);
  return safe;
}

function attendanceCheckerRecord(record) {
  const plain = toObject(record);
  if (!plain) return plain;

  const allowedFields = [
    '_id',
    'date',
    'dateString',
    'employeeName',
    'employeeId',
    'shopName',
    'shiftStart',
    'shiftEnd',
    'timeReached',
    'workerEndTime',
    'status',
    'remarks',
    'approvalStatus',
    'createdByName',
    'checkedByName',
    'checkedAt',
    'createdAt',
    'updatedAt',
    'scheduledHours',
    'actualHours',
    'lateMinutes'
  ];
  const safe = {};
  for (const field of allowedFields) {
    if (plain[field] !== undefined) safe[field] = plain[field];
  }
  safe.employee = safeReference(plain.employee, ['_id', 'name', 'employeeId']);
  safe.shop = safeReference(plain.shop, ['_id', 'name']);
  return safe;
}

function employeeAttendanceRosterEntry(employee) {
  const plain = toObject(employee);
  if (!plain) return plain;
  const safe = {};
  for (const field of ['_id', 'name', 'employeeId', 'employmentStatus']) {
    if (plain[field] !== undefined) safe[field] = plain[field];
  }
  return safe;
}

module.exports = {
  FINANCIAL_ATTENDANCE_FIELDS,
  attendanceOperatorRecord,
  attendanceCheckerRecord,
  employeeAttendanceRosterEntry
};
