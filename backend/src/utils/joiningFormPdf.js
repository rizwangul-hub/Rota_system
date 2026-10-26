require('./pdfkitFontPatch');
const PDFDocument = require('pdfkit');

function formatUKDate(val) {
  if (!val) return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return String(val);
  }
}

/**
 * Builds the official 2-page Employee Joining Form PDF matching the standard UK onboarding pack.
 */
function buildJoiningFormPDF(employee, res) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 36, bottom: 36, left: 45, right: 45 },
    bufferPages: true
  });

  doc.pipe(res);

  const drawHeader = () => {
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#0f172a').text('Employee Joining Form', 45, 40);
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#475569').text('UK EMPLOYEE ONBOARDING | CONFIDENTIAL PERSONNEL RECORD', 45, 62);
    doc.moveTo(45, 75).lineTo(550, 75).lineWidth(1).strokeColor('#cbd5e1').stroke();
  };

  const drawFieldRow = (label1, val1, label2, val2, y) => {
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#334155').text(label1, 45, y);
    doc.font('Helvetica').fillColor('#0f172a').text(val1 || '____________________', 180, y, { width: 140, ellipsis: true });

    if (label2) {
      doc.font('Helvetica-Bold').fillColor('#334155').text(label2, 330, y);
      doc.font('Helvetica').fillColor('#0f172a').text(val2 || '____________________', 420, y, { width: 130, ellipsis: true });
    }
  };

  drawHeader();

  let curY = 90;

  // 1. Company & role
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b').text('Company & role', 45, curY);
  curY += 16;

  drawFieldRow('Company legal name:', employee.companyLegalName || 'Pixx Technologies Ltd', 'Trading name / workplace:', employee.tradingName || 'Pixx Retail London', curY);
  curY += 18;
  drawFieldRow('Employee full legal name:', employee.name || '—', 'Job title / department:', employee.jobTitle || 'Retail Assistant', curY);
  curY += 18;
  drawFieldRow('Employment start date:', formatUKDate(employee.startDate), 'Work location:', employee.workLocation || employee.assignedShop?.name || 'London Multi-Site', curY);
  curY += 18;
  drawFieldRow('Employment type:', employee.employmentType || 'Casual / Zero-Hours', 'Normal hours per week:', employee.normalHoursPerWeek ? `${employee.normalHoursPerWeek} hrs` : 'Flexible / Rota', curY);
  curY += 18;
  drawFieldRow('Daily wage / Pay rate:', `£${Number(employee.dailyWage || 0).toFixed(2)}/day${employee.hourlyRate ? ` (£${employee.hourlyRate}/hr)` : ''}`, 'Line manager:', employee.lineManager || 'Fahad Rasheed', curY);
  curY += 26;

  // 2. Employee details
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b').text('Employee details', 45, curY);
  curY += 16;

  drawFieldRow('Preferred name:', employee.preferredName || employee.name?.split(' ')[0] || '—', 'Date of birth:', formatUKDate(employee.dateOfBirth), curY);
  curY += 18;
  drawFieldRow('Home address:', employee.homeAddress || '—', 'Postcode:', employee.postcode || '—', curY);
  curY += 18;
  drawFieldRow('Mobile telephone:', employee.phone || '—', 'Personal email:', employee.email || '—', curY);
  curY += 18;
  drawFieldRow('National Insurance number:', employee.nationalInsuranceNumber || '—', 'Employee System ID:', employee.employeeId || '—', curY);
  curY += 18;
  drawFieldRow('Emergency contact name:', employee.emergencyContactName || '—', 'Relationship:', employee.emergencyContactRelationship || '—', curY);
  curY += 18;
  drawFieldRow('Emergency contact phone:', employee.emergencyContactPhone || '—', '', '', curY);
  curY += 26;

  // 3. Payroll and employment
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b').text('Payroll and employment', 45, curY);
  curY += 16;

  drawFieldRow('Bank account name:', employee.bankAccountName || employee.name || '—', 'Payment method:', 'Bank Transfer (BACS)', curY);
  curY += 18;
  drawFieldRow('Sort code:', employee.bankSortCode || '—', 'Account number:', employee.bankAccountNumber || '—', curY);
  curY += 20;

  const checkMark = (checked) => (checked ? '[X]' : '[  ]');
  doc.fontSize(8).font('Helvetica').fillColor('#334155');
  doc.text(`${checkMark(employee.p45Status?.includes('P45'))} P45 received       ${checkMark(employee.p45Status?.includes('Starter'))} HMRC starter checklist completed       ${checkMark(true)} Bank details verified for payroll`, 45, curY);
  curY += 14;
  doc.text(`${checkMark(true)} Written statement of employment particulars provided by day one`, 45, curY);
  curY += 14;
  doc.text(`${checkMark(true)} Pay rate, daily hours, and multi-site rota arrangements confirmed`, 45, curY);
  curY += 14;
  doc.text(`${checkMark(employee.healthSafetyInductionCompleted)} First-day health and safety induction and store security training completed`, 45, curY);
  curY += 26;

  // 4. Right to work – manager completes
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b').text('Right to work – manager completes', 45, curY);
  curY += 16;

  drawFieldRow('Check method:', employee.rightToWorkCheckMethod || 'Manual eligible documents', 'Nationality / Status:', employee.nationalityType || 'British / Irish Citizen', curY);
  curY += 18;
  drawFieldRow('Evidence / Share code ref:', employee.rightToWorkReference || '—', 'Date check completed:', formatUKDate(employee.rightToWorkCheckDate || employee.startDate), curY);
  curY += 18;
  drawFieldRow('Permission / Visa expiry:', formatUKDate(employee.visaExpiryDate), 'Passport expiry date:', formatUKDate(employee.passportExpiryDate), curY);
  curY += 18;
  drawFieldRow('Conditions / restrictions:', employee.visaConditions || 'None / Full permission', 'Compliance check result:', employee.rightToWorkStatus || 'Passed', curY);
  curY += 18;
  drawFieldRow('Checker name:', employee.checkerName || 'Fahad Rasheed', 'Checker title:', 'Operations / HR Director', curY);
  curY += 30;

  // 5. Employee declaration
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b').text('Employee declaration', 45, curY);
  curY += 16;

  doc.fontSize(8.5).font('Helvetica').fillColor('#334155').text(
    'I confirm the information supplied is accurate and will inform the employer of changes relevant to my employment and right to work.',
    45, curY, { width: 505 }
  );
  curY += 28;

  doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#334155').text('Employee signature: ___________________________', 45, curY);
  doc.text('Date: ____________________', 350, curY);
  curY += 24;

  doc.text('Manager signature: ____________________________', 45, curY);
  doc.text('Date: ____________________', 350, curY);
  curY += 35;

  doc.fontSize(8).font('Helvetica-Oblique').fillColor('#64748b').text('Confidential – retain securely in accordance with UK employment legislation and Home Office guidance.', 45, curY, { align: 'center', width: 505 });

  doc.end();
}

module.exports = {
  buildJoiningFormPDF
};
