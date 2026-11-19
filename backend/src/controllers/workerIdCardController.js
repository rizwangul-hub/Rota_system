require('../utils/pdfkitFontPatch'); // MUST be first for Vercel / serverless font path
const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const Employee = require('../models/Employee');
const { sendServerError } = require('../utils/httpErrors');

/**
 * Generate or ensure a secure, unforgeable QR verification code for an employee
 */
function generateSecureCode(employee) {
  const hash = crypto.createHash('sha256')
    .update(`${employee._id}:${employee.employeeId}:${employee.createdAt || Date.now()}:PIXX_ID_SALT_2026`)
    .digest('hex')
    .slice(0, 24);
  return `PIXX-${hash.toUpperCase()}`;
}

/**
 * Format a Date to UK localized string
 */
function formatUKDate(d) {
  if (!d) return 'N/A';
  const date = new Date(d);
  if (isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * GET /api/worker/id-card
 * Fetches sanitized digital ID card for the authenticated worker
 */
exports.getIdCard = async (req, res) => {
  try {
    const employeeId = req.employee._id;
    let employee = await Employee.findById(employeeId)
      .populate('assignedShop', 'name code address phone');

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee profile not found.' });
    }

    // Ensure employee has a persistent QR verification code
    if (!employee.qrVerificationCode) {
      employee.qrVerificationCode = generateSecureCode(employee);
      await Employee.updateOne({ _id: employee._id }, { qrVerificationCode: employee.qrVerificationCode });
    }

    const host = req.get('host') || 'localhost:5000';
    const protocol = req.protocol || 'http';
    const qrVerificationUrl = `${protocol}://${host}/verify-id/${employee.qrVerificationCode}`;

    // Return strictly shielded, non-sensitive workforce identity data
    return res.json({
      success: true,
      card: {
        id: employee._id,
        employeeId: employee.employeeId,
        name: employee.name,
        preferredName: employee.preferredName || '',
        jobTitle: employee.jobTitle || 'Retail Assistant / Sales',
        assignedShop: employee.assignedShop ? {
          name: employee.assignedShop.name,
          code: employee.assignedShop.code,
          address: employee.assignedShop.address || '',
          phone: employee.assignedShop.phone || ''
        } : null,
        employmentStatus: employee.employmentStatus || 'Active',
        startDate: employee.startDate,
        formattedStartDate: formatUKDate(employee.startDate),
        companyLegalName: employee.companyLegalName || 'Pixx Technologies Ltd',
        tradingName: employee.tradingName || 'Pixx Retail London',
        profilePicture: employee.profilePicture || null,
        qrVerificationCode: employee.qrVerificationCode,
        qrVerificationUrl,
        issuedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    return sendServerError(res, error, 'Error retrieving digital employee card.');
  }
};

/**
 * GET /api/worker/id-card/pdf
 * Generates an official printable PDF Employee ID Badge
 */
exports.downloadIdCardPDF = async (req, res) => {
  try {
    const employeeId = req.employee._id;
    let employee = await Employee.findById(employeeId)
      .populate('assignedShop', 'name code address phone');

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee profile not found.' });
    }

    if (!employee.qrVerificationCode) {
      employee.qrVerificationCode = generateSecureCode(employee);
      await Employee.updateOne({ _id: employee._id }, { qrVerificationCode: employee.qrVerificationCode });
    }

    const empName = employee.name || 'Worker';
    const empCode = employee.employeeId || 'PIXX';
    const fileName = `ID_Badge_${empCode}.pdf`;

    // Compact Badge layout (Dimensions: standard ID-1 card size 3.375 x 2.125 inches scaled up or clean 350x520 pt badge)
    const doc = new PDFDocument({
      size: [360, 520],
      margin: 20,
      autoFirstPage: true
    });

    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      const result = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
      res.setHeader('Content-Length', result.length);
      return res.send(result);
    });

    // Color Palette
    const navyBrand = '#0f172a';
    const cyanAccent = '#0284c7';
    const greenStatus = '#16a34a';
    const lightBg = '#f8fafc';
    const textMuted = '#64748b';

    // Outer Card Frame
    doc.roundedRect(15, 15, 330, 490, 16)
      .fillAndStroke(lightBg, '#cbd5e1');

    // Header Banner
    doc.roundedRect(15, 15, 330, 95, 16)
      .fill(navyBrand);
    // Flat bottom for header
    doc.rect(15, 80, 330, 30).fill(navyBrand);

    doc.fontSize(16).fillColor('#ffffff').font('Helvetica-Bold')
      .text('PIXX TECHNOLOGIES', 20, 32, { align: 'center', width: 320 });
    doc.fontSize(9).fillColor('#38bdf8').font('Helvetica')
      .text('OFFICIAL WORKFORCE IDENTIFICATION PASS', 20, 52, { align: 'center', width: 320 });
    doc.fontSize(8).fillColor('#94a3b8').font('Helvetica')
      .text('Retail London • Certified Employee', 20, 68, { align: 'center', width: 320 });

    // Decorative Line
    doc.strokeColor(cyanAccent).lineWidth(3).moveTo(20, 110).lineTo(340, 110).stroke();

    // Photo / Initials Placeholder Box
    const avatarY = 125;
    doc.roundedRect(130, avatarY, 100, 100, 12)
      .fillAndStroke('#e2e8f0', '#94a3b8');

    const initials = empName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
    doc.fontSize(36).fillColor(cyanAccent).font('Helvetica-Bold')
      .text(initials, 130, avatarY + 30, { align: 'center', width: 100 });

    // Status Pill
    const isEmpActive = (employee.employmentStatus || 'Active') === 'Active';
    const statusBg = isEmpActive ? '#dcfce7' : '#fee2e2';
    const statusText = isEmpActive ? '#15803d' : '#b91c1c';
    doc.roundedRect(120, 235, 120, 22, 11).fill(statusBg);
    doc.fontSize(9).fillColor(statusText).font('Helvetica-Bold')
      .text(`● ${employee.employmentStatus || 'Active'}`.toUpperCase(), 120, 241, { align: 'center', width: 120 });

    // Employee Full Name
    doc.fontSize(18).fillColor(navyBrand).font('Helvetica-Bold')
      .text(empName, 20, 270, { align: 'center', width: 320 });

    // Job Title
    doc.fontSize(11).fillColor(cyanAccent).font('Helvetica-Bold')
      .text(employee.jobTitle || 'Retail Assistant / Sales', 20, 292, { align: 'center', width: 320 });

    // Key Details Grid
    const gridY = 320;
    doc.rect(30, gridY, 300, 75).fillAndStroke('#ffffff', '#e2e8f0');

    // Row 1
    doc.fontSize(8).fillColor(textMuted).font('Helvetica').text('EMPLOYEE ID', 42, gridY + 10);
    doc.fontSize(10).fillColor(navyBrand).font('Helvetica-Bold').text(empCode, 42, gridY + 22);

    doc.fontSize(8).fillColor(textMuted).font('Helvetica').text('ASSIGNED BRANCH', 180, gridY + 10);
    doc.fontSize(10).fillColor(navyBrand).font('Helvetica-Bold').text(employee.assignedShop?.name || 'Main Branch', 180, gridY + 22);

    // Row 2
    doc.strokeColor('#f1f5f9').lineWidth(1).moveTo(40, gridY + 42).lineTo(320, gridY + 42).stroke();

    doc.fontSize(8).fillColor(textMuted).font('Helvetica').text('JOINED DATE', 42, gridY + 48);
    doc.fontSize(10).fillColor(navyBrand).font('Helvetica-Bold').text(formatUKDate(employee.startDate), 42, gridY + 60);

    doc.fontSize(8).fillColor(textMuted).font('Helvetica').text('ISSUED BY', 180, gridY + 48);
    doc.fontSize(10).fillColor(navyBrand).font('Helvetica-Bold').text('Pixx HR & Operations', 180, gridY + 60);

    // QR Verification Code Section
    doc.roundedRect(30, 410, 300, 65, 8).fill('#f1f5f9');
    doc.fontSize(8).fillColor(textMuted).font('Helvetica-Bold')
      .text('VERIFICATION SECURITY TOKEN', 30, 418, { align: 'center', width: 300 });
    doc.fontSize(10).fillColor(cyanAccent).font('Courier-Bold')
      .text(employee.qrVerificationCode, 30, 432, { align: 'center', width: 300 });
    doc.fontSize(7).fillColor(textMuted).font('Helvetica')
      .text('Scan or verify online at /verify-id with authorized credentials.', 30, 452, { align: 'center', width: 300 });

    // Footer Watermark
    doc.fontSize(7).fillColor('#94a3b8').font('Helvetica')
      .text('Property of Pixx Technologies Ltd • Must be surrendered upon termination', 20, 485, { align: 'center', width: 320 });

    doc.end();
  } catch (error) {
    return sendServerError(res, error, 'Error generating ID Card PDF.');
  }
};

/**
 * GET /api/verify-id/:code
 * Public / Manager verification endpoint for scanning digital ID passes
 * Returns ONLY safe, non-sensitive verification status
 */
exports.verifyIdCard = async (req, res) => {
  try {
    const { code } = req.params;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ success: false, verified: false, message: 'Invalid verification token.' });
    }

    const employee = await Employee.findOne({ qrVerificationCode: code.trim() })
      .populate('assignedShop', 'name code address phone');

    if (!employee) {
      return res.status(404).json({
        success: false,
        verified: false,
        message: 'No valid employee matches this digital verification pass.'
      });
    }

    // Shield all confidential information (salary, banking, right to work docs, NI numbers)
    return res.json({
      success: true,
      verified: true,
      employee: {
        name: employee.name,
        preferredName: employee.preferredName || '',
        employeeId: employee.employeeId,
        jobTitle: employee.jobTitle || 'Retail Assistant / Sales',
        shopName: employee.assignedShop?.name || 'Main Branch',
        shopAddress: employee.assignedShop?.address || '',
        employmentStatus: employee.employmentStatus || 'Active',
        startDate: employee.startDate,
        formattedStartDate: formatUKDate(employee.startDate),
        companyLegalName: employee.companyLegalName || 'Pixx Technologies Ltd',
        tradingName: employee.tradingName || 'Pixx Retail London',
        profilePicture: employee.profilePicture || null,
        verifiedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    return sendServerError(res, error, 'Error verifying digital employee ID pass.');
  }
};
